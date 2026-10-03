import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomework, createHomeworkAction, HomeworkRequestError } from '../src/homework-action.js';
import { homeworkDueTime, normalizeHomework } from '../src/homework.js';
import { resolveHomework } from '../src/schedule.js';
import { calendarICS } from '../src/calendar-export.js';
import { createBackup, parseBackup } from '../src/backup.js';
import { widgetData } from '../src/widget-data.js';
import { captureChanges, emptySnapshot, materialize } from '../src/sync-data.js';

const context = extra => ({homework:[], overrides:{}, timeMode:'summer', now:new Date('2026-10-03T04:12:00Z'), ...extra});
const request = extra => ({subject:'Economics', title:'Finish questions 1–15', dueDate:'Monday at 4 PM', ...extra});
const storedItem = result => { const {due, ...item} = result.homework; return item; };

test('the Economics example resolves Monday at 4 PM in Hong Kong', () => {
  const result = createHomework('Add Economics homework: finish questions 1–15, due Monday at 4 PM.', context());
  assert.equal(result.created, true);
  assert.equal(result.homework.subject, 'ECON');
  assert.equal(result.homework.title, 'finish questions 1–15');
  assert.equal(result.homework.afterDate, '2026-10-03');
  assert.equal(result.homework.due.date, '2026-10-05');
  assert.equal(result.dueTime, '16:00');
  assert.equal(result.timeZone, 'Asia/Hong_Kong');
  assert.match(calendarICS([storedItem(result)], {}, 'summer'), /DTSTART;TZID=Asia\/Hong_Kong:20261005T160000/);
});

test('the ICT example reuses the next lesson and keeps a dynamic rule', () => {
  const result = createHomework('Add ICT homework: finish the database worksheet, due next lesson.', context());
  assert.equal(result.homework.dueMode, 'nextLesson');
  assert.equal(result.homework.dueDate, '');
  assert.equal(result.homework.due.date, '2026-10-06');
  assert.equal(result.homework.due.period, 6);
  assert.equal(result.dueTime, '11:40');
  const item = storedItem(result);
  const overrides = {'2026-10-06':{type:'holiday'}};
  assert.equal(resolveHomework(item, overrides).due.date, '2026-10-08');
  assert.match(calendarICS([item], overrides, 'winter'), /DTSTART;TZID=Asia\/Hong_Kong:20261008T141000/);
  const changed = createHomework({subject:'X3', description:item.title, dueMode:'nextLesson'}, context({overrides, timeMode:'winter'}));
  assert.equal(changed.homework.due.date, '2026-10-08');
  assert.equal(changed.dueTime, '14:10');
});

test('subject names, codes and elective aliases use the existing subject list', () => {
  for (const subject of ['ECON', ' economics ', 'econ', 'X1']) {
    assert.equal(createHomework(request({subject}), context()).homework.subject, 'ECON');
  }
  assert.equal(createHomework(request({subject:'X2'}), context()).homework.subject, 'GEOG');
  assert.equal(createHomework(request({subject:'maths'}), context()).homework.subject, 'MATH');
});

test('ordinary text variants and structured assistant arguments share creation', () => {
  const first = createHomework('Please add Economics homework finish questions 1–15 due Monday at 4 pm', context());
  const second = createHomework('Finish questions 1–15 for Economics, due Monday at 4 PM', context());
  const third = createHomework(request(), context());
  for (const text of [
    'Can you please add homework for Economics: Finish questions 1–15, due Monday at 4 PM?',
    'Create Economics: Finish questions 1–15 due Monday at 4 PM',
    'Add Economics homework:Finish questions 1–15 due Monday at 4 PM'
  ]) {
    const parsed = createHomework(text.replace(/\?$/, ''), context());
    assert.equal(parsed.homework.title, third.homework.title);
    assert.equal(parsed.homework.dueTime, third.homework.dueTime);
  }
  for (const key of ['subject','title','afterDate','dueMode','dueDate','dueTime']) {
    assert.equal(first.homework[key].toLowerCase(), third.homework[key].toLowerCase());
    assert.equal(second.homework[key], third.homework[key]);
  }
  assert.equal(createHomeworkAction.name, 'createHomework');
  assert.ok(createHomeworkAction.inputSchema.properties.description);
});

test('relative dates use Hong Kong midnight independently of the host zone', () => {
  const now = new Date('2026-10-04T16:30:00Z'); // Monday 00:30 in Hong Kong.
  const today = createHomework(request({dueDate:'today', dueTime:'12 AM'}), context({now}));
  assert.equal(today.homework.afterDate, '2026-10-05');
  assert.equal(today.homework.dueDate, '2026-10-05');
  assert.equal(today.dueTime, '00:00');
  const tomorrow = createHomework(request({dueDate:'tomorrow at 12 PM'}), context({now}));
  assert.equal(tomorrow.homework.dueDate, '2026-10-06');
  assert.equal(tomorrow.dueTime, '12:00');
  assert.equal(createHomework(request(), context({now})).homework.dueDate, '2026-10-12', 'bare Monday means the next Monday');
});

test('a specific date without time still binds to the first lesson', () => {
  const result = createHomework(request({dueDate:'2026-10-12'}), context());
  assert.equal(result.homework.due.period, 2);
  assert.equal(result.dueTime, '08:50');
  const item = storedItem(result);
  const overrides = {'2026-10-12':{type:'regular',cycle:'A'}};
  assert.equal(homeworkDueTime(resolveHomework(item, overrides), 'winter'), '08:15');
  assert.equal(homeworkDueTime(resolveHomework(item, {'2026-10-12':{type:'holiday'}})), '17:00');
});

test('an explicit time stays fixed through overrides, editing and backup restore', () => {
  const result = createHomework(request({dueDate:'2026-10-12T16:00', notes:'Bring the textbook'}), context());
  const item = storedItem(result);
  const overrides = {'2026-10-12':{type:'holiday'}};
  const edited = normalizeHomework({...item, title:'Revised'}, {...item, done:true, steps:[{id:'one',title:'Read',done:true}]});
  assert.equal(edited.dueTime, '16:00');
  assert.equal(edited.steps[0].done, true);
  const data = {homework:[edited], overrides, timeMode:'winter'};
  const restored = parseBackup(createBackup(data));
  assert.equal(restored.homework[0].dueTime, '16:00');
  assert.equal(homeworkDueTime(resolveHomework(edited, overrides), 'winter'), '16:00');
  assert.equal(widgetData({...data, homework:[item]}, '2026-10-03').homework[0].time, '16:00');
});

test('calendar deadlines near midnight have a valid next-day end', () => {
  const result = createHomework(request({dueDate:'2026-10-05',dueTime:'23:55'}), context());
  const ics = calendarICS([storedItem(result)], {}, 'summer');
  assert.match(ics, /DTSTART;TZID=Asia\/Hong_Kong:20261005T235500/);
  assert.match(ics, /DTEND;TZID=Asia\/Hong_Kong:20261006T001000/);
});

test('retries and case/whitespace variants return the existing ID and progress', () => {
  const first = createHomework(request(), context());
  const item = {...storedItem(first), done:true, steps:[{id:'read',title:'Read',done:true}]};
  const homework = [item];
  const retry = createHomework(request({subject:'X1', title:'  finish   questions 1–15 '}), context({homework}));
  assert.equal(retry.created, false);
  assert.equal(retry.homework.id, item.id);
  assert.equal(retry.homework.done, true);
  retry.homework.steps[0].done = false;
  assert.equal(item.steps[0].done, true, 'the action result cannot mutate saved state');
  assert.equal(homework.length, 1);
  assert.equal(createHomework(request({title:'Different assignment'}), context({homework})).created, true);
  assert.equal(createHomework(request({dueTime:'17:00',dueDate:'Monday'}), context({homework})).created, true);
});

test('duplicate detection includes existing form-created homework', () => {
  const item = normalizeHomework({title:'Database worksheet',subject:'ICT',afterDate:'2026-10-03',dueMode:'nextLesson'});
  const retry = createHomework({subject:'ICT',description:item.title,dueDate:'2026-10-06'}, context({homework:[item]}));
  assert.equal(retry.created, false);
  assert.equal(retry.homework.id, item.id);
  assert.equal(retry.homework.dueMode, 'nextLesson');
});

test('created homework enters the existing sync document without resolved lesson data', () => {
  const result = createHomework(request(), context());
  const before = {homework:[],overrides:{},timeMode:'summer'};
  const after = {...before,homework:[storedItem(result)]};
  const snapshot = captureChanges(emptySnapshot(), before, after, () => [1,'test',0]);
  const saved = materialize(snapshot).homework[0];
  assert.equal(saved.id, result.homework.id);
  assert.equal(saved.dueTime, '16:00');
  assert.equal(saved.due, undefined);
});

test('invalid, incomplete or ambiguous requests fail without mutating homework', () => {
  const homework = [];
  const invalid = [null, [], 17, {}, {text:17}, {text:''}, request({subject:'Science'}),
    request({subject:''}), request({title:''}), request({title:{}}), request({notes:[]}),
    request({title:'x'.repeat(161)}), request({notes:'x'.repeat(1001)}),
    request({dueDate:''}), request({dueDate:'2026-02-30'}), request({dueDate:'2026-10-01'}),
    request({dueDate:'next week'}), request({dueTime:'25:00'}), request({dueTime:'4:99 PM'}),
    request({dueTime:'0 PM'}), request({dueTime:'17:00'}),
    request({dueDate:'next lesson',dueTime:'16:00'}), request({dueMode:'tomorrow'}),
    request({dueMode:'nextLesson'}), request({dueMode:'date',dueDate:'next lesson'}),
    request({reminderDays:4}), request({done:true}), request({description:'Conflicting title'}),
    {text:'Add ICT homework: Read',subject:'ICT'}, 'Add homework',
    'Add Biology homework: Read, due tomorrow', 'Add ICT homework: Read',
    'x'.repeat(2001), request({afterDate:'2027-02-02'})];
  for (const input of invalid) {
    assert.throws(() => createHomework(input, context({homework})), HomeworkRequestError, JSON.stringify(input));
    assert.deepEqual(homework, []);
  }
});

test('no future lesson produces a clear error; explicit dates still work', () => {
  const now = new Date('2027-02-01T08:00:00Z');
  assert.throws(() => createHomework({subject:'ICT',title:'Read',dueDate:'next lesson'}, context({now})),
    error => error.code === 'no_next_lesson');
  assert.equal(createHomework({subject:'ICT',title:'Read',dueDate:'2027-02-03'}, context({now})).homework.dueDate, '2027-02-03');
});

test('text requests accept optional notes and reminders', () => {
  const result = createHomework({text:'Add ICT homework: worksheet, due next lesson',notes:'Page 12',reminderDays:3}, context());
  assert.equal(result.homework.notes, 'Page 12');
  assert.equal(result.homework.reminderDays, 3);
});

test('duplicate detection does not discard case-sensitive notes or links', () => {
  const first = createHomework(request({notes:'https://example.org/Worksheet'}), context());
  const result = createHomework(request({notes:'https://example.org/worksheet'}), context({homework:[storedItem(first)]}));
  assert.equal(result.created, true);
});
