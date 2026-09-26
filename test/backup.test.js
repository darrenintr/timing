import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, mergeBackup, parseBackup } from '../src/backup.js';

const item = (id, title) => ({id, title, subject:'ECON', afterDate:'2026-09-24',
  dueMode:'nextLesson', dueDate:'', reminderDays:1, notes:'', done:false, steps:[]});

test('backup restores valid homework and overrides while retaining device-only work', () => {
  const imported = parseBackup(createBackup({homework:[item('shared', 'From backup')],
    overrides:{'2026-10-02':{type:'holiday', label:'No school'}}, timeMode:'winter'}));
  const merged = mergeBackup({homework:[item('shared', 'Old'), item('local', 'Keep me')],
    overrides:{'2026-09-25':{cycle:'D'}}, timeMode:'summer'}, imported);
  assert.deepEqual(merged.homework.map(entry => entry.title), ['From backup', 'Keep me']);
  assert.equal(merged.overrides['2026-09-25'].cycle, 'D');
  assert.equal(merged.overrides['2026-10-02'].type, 'holiday');
  assert.equal(merged.timeMode, 'winter');
});

test('backup rejects malformed homework before changing current data', () => {
  const text = createBackup({homework:[{...item('bad', 'Unsafe'), afterDate:'2026-99-99'}],
    overrides:{}, timeMode:'summer'});
  assert.throws(() => parseBackup(text), /assigned date/);
});

test('backup rejects invalid calendar overrides', () => {
  const text = createBackup({homework:[], overrides:{'2026-10-02':{cycle:'AB'}}, timeMode:'summer'});
  assert.throws(() => parseBackup(text), /invalid day override/);
});
