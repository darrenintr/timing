import { FIRST_DAY, LAST_S6_DAY, resolveHomework, subjects } from './schedule.js';

export const homeworkSubjects = ['ECON', 'GEOG', 'ICT', 'ENG', 'CHIN', 'MATH', 'CSD', 'PE', 'OLE', 'CTP'];
export const reminderDays = [0, 1, 2, 3, 7];
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function normalizeHomework(input, existing = null) {
  const title = String(input.title ?? '').trim();
  const subject = String(input.subject ?? '');
  const afterDate = String(input.afterDate ?? '');
  const dueMode = input.dueMode === 'date' ? 'date' : 'nextLesson';
  const dueDate = dueMode === 'date' ? String(input.dueDate ?? '') : '';
  const reminder = Number(input.reminderDays ?? 1);
  const notes = String(input.notes ?? '').trim();
  if (!title || title.length > 160) throw new Error('Enter a homework title of up to 160 characters.');
  if (!subjects[subject] || !homeworkSubjects.includes(subject)) throw new Error('Choose a valid subject.');
  if (!validDate(afterDate) || afterDate < FIRST_DAY || afterDate > LAST_S6_DAY) throw new Error('The assigned date must be during your S6 school year.');
  if (dueMode === 'date' && (!validDate(dueDate) || dueDate < afterDate)) throw new Error('Choose a due date on or after the assigned date.');
  if (!reminderDays.includes(reminder)) throw new Error('Choose a valid reminder time.');
  if (notes.length > 1000) throw new Error('Keep notes within 1000 characters.');
  return {
    id: existing?.id ?? crypto.randomUUID(), title, subject, afterDate, dueMode,
    dueDate, reminderDays: reminder, notes, done: existing?.done ?? false,
    steps: existing?.steps ?? []
  };
}

export function homeworkStatus(item, today) {
  if (item.done) return 'completed';
  if (!item.due) return 'unconfirmed';
  if (item.due.date < today) return 'overdue';
  if (item.due.date === today) return 'today';
  return 'upcoming';
}

export function visibleHomework(items, overrides, filter = 'open', subject = 'all') {
  return items.map(item => resolveHomework(item, overrides))
    .filter(item => (subject === 'all' || item.subject === subject) &&
      (filter === 'all' || (filter === 'completed' ? item.done : !item.done)))
    .sort((a, b) => Number(a.done) - Number(b.done) ||
      (a.due?.date ?? '9999-99-99').localeCompare(b.due?.date ?? '9999-99-99') ||
      a.title.localeCompare(b.title));
}
