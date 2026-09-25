import test from 'node:test';
import assert from 'node:assert/strict';
import {captureChanges, emptySnapshot, fromLegacy, materialize, mergeSnapshots, revisionClock} from '../src/sync-data.js';
import {syncAccount} from '../src/cloud.js';

test('existing local homework imports alongside cloud homework and keeps edits', () => {
  const guest = fromLegacy({homework:[{id:'old',title:'Existing homework',steps:[]}],overrides:{'2026-10-02':{type:'holiday'}},timeMode:'winter'}, 'ipad');
  const cloud = fromLegacy({homework:[{id:'other',title:'From Android',steps:[]}],overrides:{},timeMode:'summer'}, 'android');
  const merged = materialize(mergeSnapshots(guest, cloud));
  assert.deepEqual(merged.homework.map(item => item.id).sort(), ['old','other']);
  assert.equal(merged.overrides['2026-10-02'].type, 'holiday');
  assert.equal(merged.timeMode, 'winter');
});

test('offline deletion survives reconnect and stale copies cannot resurrect homework', () => {
  const ipad = fromLegacy({homework:[{id:'worksheet',title:'Do it'}]}, 'ipad');
  const before = materialize(ipad);
  const deleted = captureChanges(ipad, before, {...before,homework:[]}, revisionClock('ipad', ipad));
  assert.deepEqual(materialize(mergeSnapshots(deleted, ipad)).homework, []);
  assert.equal(mergeSnapshots(deleted, ipad).homework.worksheet.value, null);
});

test('Firestore conflict retries with a fresh read and merges both devices', async () => {
  const ipad = fromLegacy({homework:[{id:'ipad',title:'Local'}]}, 'ipad');
  let remote = emptySnapshot(), version = 0, writes = 0;
  const transport = async (_uid, method, payload, previous) => {
    if (method === 'GET') return version ? {fields:{payload:{stringValue:JSON.stringify(remote)}},updateTime:String(version)} : null;
    writes++;
    if (writes === 1) {
      remote = fromLegacy({homework:[{id:'android',title:'Remote'}]}, 'android');
      version = 1;
      const error = new Error('conflict'); error.conflict = true; throw error;
    }
    assert.equal(previous, String(version));
    remote = payload; version++;
    return {updateTime:String(version)};
  };
  const result = await syncAccount('test-user', ipad, transport);
  assert.deepEqual(materialize(result).homework.map(item => item.id).sort(), ['android','ipad']);
  assert.equal(writes, 2);
});
