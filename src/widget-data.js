import { addDays, dayInfo, LAST_S6_DAY, lessonsOn, periodTimes, resolveHomework, subjects } from './schedule.js';

// Store enough future days that native widgets can advance at midnight even if
// the web view has not been opened. All dates use the school's Hong Kong zone.
export function widgetData(state, fromDate) {
  const days = [];
  for (let date = fromDate; date <= LAST_S6_DAY; date = addDays(date, 1)) {
    const info = dayInfo(date, state.overrides);
    days.push({
      date, cycle: info.type === 'regular' ? info.cycle : null,
      label: info.label,
      lessons: lessonsOn(date, state.overrides).map(lesson => ({
        period: lesson.period, subject: lesson.name,
        time: periodTimes[state.timeMode]?.[lesson.period - 1]?.[0] ?? ''
      }))
    });
  }
  const homework = state.homework.filter(item => !item.done).map(item => {
    const due = resolveHomework(item, state.overrides).due;
    return {title:item.title, subject:subjects[item.subject]?.[0] ?? item.subject,
      date:due?.date ?? null, period:due?.period ?? null};
  }).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.title.localeCompare(b.title));
  return {version:1, days, homework};
}
