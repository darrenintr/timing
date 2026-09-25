import { addDays, dayInfo, LAST_S6_DAY, lessonsOn, periodTimes, resolveHomework, subjects } from './schedule.js';

// Store enough future days that native widgets can advance at midnight and at
// every period boundary even if the web view has not been opened. All dates and
// times use the school's Hong Kong zone. Native widgets decide what is "now"
// from this snapshot; they never guess a timetable the app did not publish.
export function widgetData(state, fromDate) {
  const times = periodTimes[state.timeMode] ?? periodTimes.summer;
  const days = [];
  for (let date = fromDate; date <= LAST_S6_DAY; date = addDays(date, 1)) {
    const info = dayInfo(date, state.overrides);
    days.push({
      date, type: info.type, cycle: info.type === 'holiday' ? null : info.cycle,
      label: info.label,
      // Only a regular day's label is a notice worth showing beside lessons.
      notice: info.type === 'regular' && info.label !== 'Normal timetable' ? info.label : null,
      lessons: lessonsOn(date, state.overrides).map(lesson => {
        const [start, end] = times[lesson.period - 1] ?? ['', ''];
        return {
          period: lesson.period, subject: lesson.name, code: lesson.subject,
          room: lesson.room, teacher: lesson.teacher, time: start, start, end
        };
      })
    });
  }
  const homework = state.homework.filter(item => !item.done).map(item => {
    const due = resolveHomework(item, state.overrides).due;
    const steps = Array.isArray(item.steps) ? item.steps : [];
    return {
      id: item.id ?? null, title: item.title, subject: subjects[item.subject]?.[0] ?? item.subject,
      code: item.subject, date: due?.date ?? null, period: due?.period ?? null,
      time: due?.period ? times[due.period - 1]?.[0] ?? null : null,
      stepsDone: steps.filter(step => step.done).length, stepsTotal: steps.length
    };
  }).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') ||
    (a.period ?? 99) - (b.period ?? 99) || a.title.localeCompare(b.title));
  return {version: 2, timeMode: state.timeMode === 'winter' ? 'winter' : 'summer', lastDay: LAST_S6_DAY, days, homework};
}

// Apply check-offs made on a native widget while the app was closed.
export function completeFromWidget(homework, ids) {
  const wanted = new Set(ids);
  let changed = false;
  for (const item of homework) {
    if (wanted.has(item.id) && !item.done) { item.done = true; changed = true; }
  }
  return changed;
}

// Widget taps arrive as timing:// links; turn them into a view to open.
export function widgetTarget(url) {
  const match = /^timing:\/\/(today|homework)(?:\/([^/?#]+))?/.exec(String(url ?? ''));
  if (!match) return null;
  if (match[1] === 'today') return {view: 'today'};
  if (!match[2]) return {view: 'homework'};
  if (match[2] === 'new') return {view: 'homework', compose: true};
  return {view: 'homework', id: decodeURIComponent(match[2])};
}
