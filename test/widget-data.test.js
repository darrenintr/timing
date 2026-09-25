import test from 'node:test';
import assert from 'node:assert/strict';
import {completeFromWidget, widgetData, widgetTarget} from '../src/widget-data.js';

test('widget follows the printed cycle and moves homework when a lesson is cancelled', () => {
  const state = {timeMode:'summer', overrides:{}, homework:[{
    id:'one', title:'Essay', subject:'ECON', afterDate:'2026-09-24', dueMode:'nextLesson', done:false
  }]};
  const original = widgetData(state, '2026-09-25');
  assert.equal(original.days[0].cycle, 'C');
  assert.equal(original.days[0].lessons[0].subject, 'English');
  assert.equal(original.homework[0].date, '2026-09-28');
  state.overrides['2026-09-28'] = {type:'holiday'};
  state.timeMode = 'winter';
  const changed = widgetData(state, '2026-09-25');
  assert.equal(changed.days.find(day => day.date === '2026-09-28').lessons.length, 0);
  assert.equal(changed.homework[0].date, '2026-09-30');
  assert.equal(changed.days[0].lessons[1].time, '09:00');
  assert.equal(changed.days.at(-1).date, '2027-02-01');
});

test('widget excludes completed work and retains specific due dates', () => {
  const data = widgetData({timeMode:'summer', overrides:{}, homework:[
    {title:'Done', subject:'ICT', done:true, afterDate:'2026-09-25', dueMode:'nextLesson'},
    {title:'Project', subject:'ICT', done:false, afterDate:'2026-09-25', dueMode:'date', dueDate:'2026-10-01'}
  ]}, '2026-09-25');
  assert.deepEqual(data.homework.map(item => [item.title,item.date]), [['Project','2026-10-01']]);
});

test('widget snapshot carries lesson times, rooms, notices and homework progress', () => {
  const data = widgetData({timeMode:'summer', overrides:{}, homework:[
    {id:'geo', title:'Fieldwork sketch map', subject:'GEOG', done:false, afterDate:'2026-09-24', dueMode:'nextLesson',
      steps:[{id:'a', title:'Draft', done:true}, {id:'b', title:'Label', done:false}]}
  ]}, '2026-09-24');
  assert.equal(data.version, 2);
  const friday = data.days.find(day => day.date === '2026-09-25');
  assert.equal(friday.type, 'regular');
  assert.equal(friday.notice, null);
  assert.deepEqual(friday.lessons[3], {period:4, subject:'Geography', code:'GEOG', room:'GER', teacher:'CK',
    time:'10:15', start:'10:15', end:'10:50'});
  assert.equal(data.days[0].notice, 'Students’ Union AGM · check lesson changes');
  assert.equal(data.days.find(day => day.date === '2026-10-01').type, 'holiday');
  assert.deepEqual(data.homework[0], {id:'geo', title:'Fieldwork sketch map', subject:'Geography', code:'GEOG',
    date:'2026-09-25', period:4, time:'10:15', stepsDone:1, stepsTotal:2});
});

test('widget check-offs complete open homework once', () => {
  const homework = [{id:'a', done:false}, {id:'b', done:true}, {id:'c', done:false}];
  assert.equal(completeFromWidget(homework, ['a', 'b', 'missing']), true);
  assert.deepEqual(homework.map(item => item.done), [true, true, false]);
  assert.equal(completeFromWidget(homework, ['a']), false);
});

test('widget links open the matching view', () => {
  assert.deepEqual(widgetTarget('timing://today'), {view:'today'});
  assert.deepEqual(widgetTarget('timing://homework'), {view:'homework'});
  assert.deepEqual(widgetTarget('timing://homework/new'), {view:'homework', compose:true});
  assert.deepEqual(widgetTarget('timing://homework/abc%20d'), {view:'homework', id:'abc d'});
  assert.equal(widgetTarget('https://example.com'), null);
});
