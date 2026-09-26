import { normalizeHomework } from './homework.js';

const FORMAT = 'timing-backup-v1';
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function createBackup(data, exportedAt = new Date()) {
  return JSON.stringify({format: FORMAT, exportedAt: exportedAt.toISOString(), data}, null, 2);
}

export function parseBackup(text) {
  if (text.length > 5_000_000) throw new Error('The backup is too large to import.');
  let backup;
  try { backup = JSON.parse(text); }
  catch { throw new Error('The backup is not valid JSON.'); }
  if (backup?.format !== FORMAT || !backup.data || typeof backup.data !== 'object') {
    throw new Error('Choose a Timing backup JSON file.');
  }
  const {homework, overrides, timeMode} = backup.data;
  if (!Array.isArray(homework) || homework.length > 10_000 || !overrides ||
      typeof overrides !== 'object' || Array.isArray(overrides) ||
      !['summer', 'winter'].includes(timeMode)) throw new Error('The backup data is incomplete.');
  const items = homework.map(item => {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 ||
        typeof item.done !== 'boolean' || !Array.isArray(item.steps) || item.steps.length > 1000 ||
        item.steps.some(step => !step || typeof step.id !== 'string' || !step.id ||
          typeof step.title !== 'string' || !step.title.trim() || step.title.length > 100 ||
          typeof step.done !== 'boolean')) throw new Error('The backup contains invalid homework.');
    return normalizeHomework(item, item);
  });
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('The backup has duplicate homework IDs.');
  const dates = Object.entries(overrides);
  if (dates.length > 1000) throw new Error('The backup has too many day overrides.');
  const cleanOverrides = Object.fromEntries(dates.map(([date, value]) => {
    if (!validDate(date) || !value || typeof value !== 'object' || Array.isArray(value) ||
        (value.type !== undefined && !['regular', 'special', 'holiday'].includes(value.type)) ||
        (value.cycle !== undefined && !['A', 'B', 'C', 'D', 'E', 'F'].includes(value.cycle)) ||
        (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 200))) {
      throw new Error('The backup contains an invalid day override.');
    }
    return [date, Object.fromEntries(['type', 'cycle', 'label'].filter(key => value[key] !== undefined).map(key => [key, value[key]]))];
  }));
  return {homework: items, overrides: cleanOverrides, timeMode};
}

export function mergeBackup(current, imported) {
  return {
    homework: [...new Map([...current.homework, ...imported.homework].map(item => [item.id, item])).values()],
    overrides: {...current.overrides, ...imported.overrides},
    timeMode: imported.timeMode
  };
}
