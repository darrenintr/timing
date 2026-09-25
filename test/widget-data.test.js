import test from 'node:test';
import assert from 'node:assert/strict';
import {widgetData} from '../src/widget-data.js';

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
