// A small last-write-wins document. Deletions remain as tombstones so they do not
// reappear when an offline device reconnects.
export const emptySnapshot = () => ({version:1, homework:{}, overrides:{}, timeMode:null});
const copy = value => JSON.parse(JSON.stringify(value));
const revision = entry => entry?.rev || [0, '', 0];
export const newer = (a, b) => {
  const x = revision(a), y = revision(b);
  return x[0] !== y[0] ? x[0] > y[0] : x[1] !== y[1] ? x[1] > y[1] : x[2] > y[2];
};
export function mergeSnapshots(local, remote) {
  const merged = emptySnapshot();
  for (const kind of ['homework', 'overrides']) {
    const a = local?.[kind] || {}, b = remote?.[kind] || {};
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
      merged[kind][id] = copy(newer(b[id], a[id]) ? b[id] : a[id]);
    }
  }
  const a = local?.timeMode, b = remote?.timeMode;
  merged.timeMode = a || b ? copy(newer(b, a) ? b : a) : null;
  return merged;
}
export function fromLegacy(saved, device) {
  const snapshot = emptySnapshot();
  const rev = [1, device, 0];
  for (const item of saved?.homework || []) if (item.id) snapshot.homework[item.id] = {value:item, rev};
  for (const [date, value] of Object.entries(saved?.overrides || {})) snapshot.overrides[date] = {value, rev};
  snapshot.timeMode = {value:saved?.timeMode === 'winter' ? 'winter' : 'summer', rev};
  return snapshot;
}
export function materialize(snapshot) {
  return {
    homework:Object.values(snapshot.homework || {}).filter(entry => entry?.value).map(entry => copy(entry.value)),
    overrides:Object.fromEntries(Object.entries(snapshot.overrides || {}).filter(([, entry]) => entry?.value).map(([date, entry]) => [date, copy(entry.value)])),
    timeMode:snapshot.timeMode?.value === 'winter' ? 'winter' : 'summer'
  };
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function captureChanges(snapshot, before, after, nextRevision) {
  const result = copy(snapshot);
  const prior = Object.fromEntries(before.homework.map(item => [item.id, item]));
  const later = Object.fromEntries(after.homework.map(item => [item.id, item]));
  for (const id of new Set([...Object.keys(prior), ...Object.keys(later)])) {
    if (!equal(prior[id], later[id])) result.homework[id] = {value:later[id] ?? null, rev:nextRevision()};
  }
  for (const date of new Set([...Object.keys(before.overrides), ...Object.keys(after.overrides)])) {
    if (!equal(before.overrides[date], after.overrides[date])) result.overrides[date] = {value:after.overrides[date] ?? null, rev:nextRevision()};
  }
  if (before.timeMode !== after.timeMode) result.timeMode = {value:after.timeMode, rev:nextRevision()};
  return result;
}
export function revisionClock(device, snapshot = emptySnapshot()) {
  let last = Math.max(0, ...Object.values(snapshot.homework || {}).map(x => revision(x)[0]),
    ...Object.values(snapshot.overrides || {}).map(x => revision(x)[0]), revision(snapshot.timeMode)[0]);
  return () => { last = Math.max(Date.now(), last + 1); return [last, device, 0]; };
}
