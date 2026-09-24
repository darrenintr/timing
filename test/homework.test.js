import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHomework, homeworkStatus, visibleHomework } from '../src/homework.js';
import { resolveHomework } from '../src/schedule.js';
import { calendarICS } from '../src/calendar-export.js';

const input = {title:'Chapter 7 questions',subject:'ECON',afterDate:'2026-10-02',dueMode:'nextLesson',reminderDays:'1',notes:'Questions 1–20'};

test('next-lesson homework follows school cancellations, and edits preserve progress', () => {
  const original = normalizeHomework(input);
  assert.equal(resolveHomework(original).due.date, '2026-10-06');
  assert.equal(resolveHomework(original, {'2026-10-06':{type:'holiday'}}).due.date, '2026-10-07');
  const edited = normalizeHomework({...input,title:'Chapter 7, revised'}, {...original, done:true, steps:[{id:'a',title:'Read',done:true}]});
  assert.equal(edited.id, original.id);
  assert.equal(edited.done, true);
  assert.equal(edited.steps[0].done, true);
});

test('a manually chosen date stays fixed, while filters and overdue state work', () => {
  const item = normalizeHomework({...input,dueMode:'date',dueDate:'2026-10-19'});
  assert.equal(resolveHomework(item, {'2026-10-19':{type:'holiday'}}).due.date, '2026-10-19');
  assert.equal(homeworkStatus(resolveHomework(item), '2026-10-20'), 'overdue');
  assert.deepEqual(visibleHomework([item],{},'open','GEOG'), []);
  assert.equal(visibleHomework([item],{},'open','ECON').length, 1);
  assert.throws(() => normalizeHomework({...input,dueMode:'date',dueDate:'2026-10-01'}), /due date/);
});

test('calendar includes the assignment reminder and omits completed homework', () => {
  const item = normalizeHomework(input);
  const ics = calendarICS([item], {}, 'summer', new Date('2026-09-24T00:00:00Z'));
  assert.match(ics, /SUMMARY:Economics homework: Chapter 7 questions/);
  assert.match(ics, /TRIGGER:-P1D/);
  assert.match(ics, /DTSTART;TZID=Asia\/Hong_Kong:20261006T092500/);
  assert.doesNotMatch(calendarICS([{...item,done:true}],{},'summer'), /SUMMARY:Economics homework:/);
});
