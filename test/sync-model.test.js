import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyHomeworkDoc, applyOverrideDoc, applySettingsDoc, diffState, homeworkDoc, migrate,
  overrideDoc, pendingUploads, snapshotOf, stampChanges
} from '../src/sync-model.js';

const item = (id, title = 'Worksheet') => ({ id, title, subject:'ECON', afterDate:'2026-10-02', dueMode:'nextLesson', dueDate:'', reminderDays:1, notes:'', done:false, steps:[] });

test('old saved data gets timestamps so it can be uploaded on first sign-in', () => {
  const state = migrate({ homework:[item('a')], overrides:{'2026-10-06':{type:'holiday'}}, timeMode:'winter' }, 500);
  assert.equal(state.homework[0].updatedAt, 500);
  assert.equal(state.overrideStamps['2026-10-06'], 500);
  assert.deepEqual(state.deleted, {});
  assert.deepEqual(pendingUploads(state, { homework:{}, overrides:{}, settings:undefined }),
    { homework:['a'], overrides:['2026-10-06'], settings:true });
});

test('local edits, deletions and day changes are stamped; untouched items are not', () => {
  const state = migrate({ homework:[item('a'), item('b')] }, 100);
  const before = snapshotOf(state);
  state.homework[0].done = true;
  state.homework = state.homework.filter(entry => entry.id !== 'b');
  state.homework.push(item('c'));
  state.overrides['2026-10-06'] = { type:'holiday' };
  const changes = diffState(before, snapshotOf(state));
  assert.deepEqual(changes, { homework:['a', 'c'], removed:['b'], overrides:['2026-10-06'], timeMode:false });
  stampChanges(state, changes, 200);
  assert.equal(state.homework[0].updatedAt, 200);
  assert.equal(state.deleted.b, 200);
  assert.equal(state.overrideStamps['2026-10-06'], 200);
  assert.equal(homeworkDoc(state, 'b').deleted, true);
  assert.equal(homeworkDoc(state, 'a').item.updatedAt, undefined, 'the timestamp is stored beside the item, not inside it');
});

test('the newer copy wins, and a deletion on another device is not undone', () => {
  const state = migrate({ homework:[item('a')] }, 100);
  assert.equal(applyHomeworkDoc(state, 'a', { item:{...item('a'), title:'Old'}, deleted:false, updatedAt:50 }), false);
  assert.equal(applyHomeworkDoc(state, 'a', { item:{...item('a'), title:'New'}, deleted:false, updatedAt:150 }), true);
  assert.equal(state.homework[0].title, 'New');
  assert.equal(applyHomeworkDoc(state, 'a', { item:null, deleted:true, updatedAt:160 }), true);
  assert.equal(state.homework.length, 0);
  assert.equal(applyHomeworkDoc(state, 'a', { item:item('a'), deleted:false, updatedAt:155 }), false, 'an older upload cannot resurrect it');
  assert.deepEqual(pendingUploads(state, { homework:{a:160}, overrides:{}, settings:0 }).homework, []);
});

test('day overrides and lesson times sync, including clearing an override', () => {
  const state = migrate({ overrides:{'2026-10-06':{type:'holiday'}} }, 100);
  assert.equal(applyOverrideDoc(state, '2026-10-06', { value:null, updatedAt:200 }), true);
  assert.equal(state.overrides['2026-10-06'], undefined);
  assert.deepEqual(overrideDoc(state, '2026-10-06'), { value:null, updatedAt:200 });
  assert.equal(applyOverrideDoc(state, '2026-10-07', { value:{cycle:'C'}, updatedAt:210 }), true);
  assert.equal(state.overrides['2026-10-07'].cycle, 'C');
  assert.equal(applySettingsDoc(state, { timeMode:'winter', updatedAt:300 }), true);
  assert.equal(state.timeMode, 'winter');
  assert.equal(applySettingsDoc(state, { timeMode:'summer', updatedAt:250 }), false);
});
