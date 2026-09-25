// Pure bookkeeping for cross-device sync. No Firebase code lives here, so it runs in Node tests.
//
// Every syncable record carries a millisecond timestamp of its last local change:
//   homework items      -> item.updatedAt; deleted items leave a tombstone in `deleted[id]`
//   day overrides       -> `overrideStamps[date]`; a stamp with no override means "cleared"
//   lesson-time setting -> `timeModeStamp`
// When two devices disagree, the newer timestamp wins for that one record.

const withoutStamp = item => { const { updatedAt, ...rest } = item; return rest; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const clone = value => JSON.parse(JSON.stringify(value));

export function snapshotOf(state) {
  return clone({ homework: state.homework.map(withoutStamp), overrides: state.overrides, timeMode: state.timeMode });
}

/** Which records differ between two snapshots (ignoring timestamps). */
export function diffState(previous, next) {
  const before = new Map(previous.homework.map(item => [item.id, item]));
  const after = new Map(next.homework.map(item => [item.id, withoutStamp(item)]));
  const homework = [...after].filter(([id, item]) => !same(before.get(id), item)).map(([id]) => id);
  const removed = [...before.keys()].filter(id => !after.has(id));
  const dates = new Set([...Object.keys(previous.overrides), ...Object.keys(next.overrides)]);
  const overrides = [...dates].filter(date => !same(previous.overrides[date], next.overrides[date]));
  return { homework, removed, overrides, timeMode: previous.timeMode !== next.timeMode };
}

export const hasChanges = changes => Boolean(changes.homework.length || changes.removed.length || changes.overrides.length || changes.timeMode);

/** Stamp the records a local edit touched. Mutates `state`. */
export function stampChanges(state, changes, now = Date.now()) {
  for (const id of changes.homework) {
    const item = state.homework.find(entry => entry.id === id);
    if (item) { item.updatedAt = now; delete state.deleted[id]; }
  }
  for (const id of changes.removed) state.deleted[id] = now;
  for (const date of changes.overrides) state.overrideStamps[date] = now;
  if (changes.timeMode) state.timeModeStamp = now;
}

/** Give data saved before sync existed a timestamp, so it can be uploaded on first sign-in. */
export function migrate(saved, now = Date.now()) {
  const homework = (Array.isArray(saved.homework) ? saved.homework : []).map(item => ({ ...item, updatedAt: item.updatedAt ?? now }));
  const overrides = saved.overrides && typeof saved.overrides === 'object' ? saved.overrides : {};
  const overrideStamps = { ...saved.overrideStamps };
  for (const date of Object.keys(overrides)) overrideStamps[date] ??= now;
  return {
    homework, overrides, overrideStamps,
    deleted: saved.deleted && typeof saved.deleted === 'object' ? saved.deleted : {},
    timeMode: saved.timeMode === 'winter' ? 'winter' : 'summer',
    timeModeStamp: saved.timeModeStamp ?? 0
  };
}

/* ---------- Local stamps, used to decide what to upload ---------- */

export const homeworkStamp = (state, id) => state.homework.find(item => item.id === id)?.updatedAt ?? state.deleted[id] ?? 0;
export const overrideStamp = (state, date) => state.overrideStamps[date] ?? 0;

/* ---------- Converting between local state and cloud documents ---------- */

export function homeworkDoc(state, id) {
  const item = state.homework.find(entry => entry.id === id);
  return item ? { item: clone(withoutStamp(item)), deleted: false, updatedAt: item.updatedAt }
    : { item: null, deleted: true, updatedAt: state.deleted[id] ?? Date.now() };
}
export function overrideDoc(state, date) {
  return { value: state.overrides[date] ? clone(state.overrides[date]) : null, updatedAt: overrideStamp(state, date) };
}
export const settingsDoc = state => ({ timeMode: state.timeMode, updatedAt: state.timeModeStamp });

/* ---------- Applying cloud documents locally (newer wins). Each returns true if state changed. ---------- */

export function applyHomeworkDoc(state, id, doc) {
  if (!doc || typeof doc.updatedAt !== 'number' || doc.updatedAt <= homeworkStamp(state, id)) return false;
  const index = state.homework.findIndex(item => item.id === id);
  if (doc.deleted || !doc.item) {
    if (index >= 0) state.homework.splice(index, 1);
    state.deleted[id] = doc.updatedAt;
    return true;
  }
  const item = { ...clone(doc.item), id, updatedAt: doc.updatedAt };
  if (!Array.isArray(item.steps)) item.steps = [];
  if (index >= 0) state.homework[index] = item; else state.homework.push(item);
  delete state.deleted[id];
  return true;
}

export function applyOverrideDoc(state, date, doc) {
  if (!doc || typeof doc.updatedAt !== 'number' || doc.updatedAt <= overrideStamp(state, date)) return false;
  if (doc.value) state.overrides[date] = clone(doc.value); else delete state.overrides[date];
  state.overrideStamps[date] = doc.updatedAt;
  return true;
}

export function applySettingsDoc(state, doc) {
  if (!doc || typeof doc.updatedAt !== 'number' || doc.updatedAt <= state.timeModeStamp) return false;
  state.timeMode = doc.timeMode === 'winter' ? 'winter' : 'summer';
  state.timeModeStamp = doc.updatedAt;
  return true;
}

/** Everything this device holds that is newer than the cloud copy (used right after sign-in). */
export function pendingUploads(state, remote) {
  const ids = new Set([...state.homework.map(item => item.id), ...Object.keys(state.deleted)]);
  const dates = new Set([...Object.keys(state.overrides), ...Object.keys(state.overrideStamps)]);
  return {
    homework: [...ids].filter(id => homeworkStamp(state, id) > (remote.homework[id] ?? -1)),
    overrides: [...dates].filter(date => overrideStamp(state, date) > (remote.overrides[date] ?? -1)),
    settings: state.timeModeStamp > (remote.settings ?? -1)
  };
}
