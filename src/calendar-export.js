import { addDays, FIRST_DAY, LAST_S6_DAY, lessonsOn, periodTimes, resolveHomework, subjects } from './schedule.js';

const escapeText = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const stamp = date => date.replaceAll('-', '');
const event = fields => `BEGIN:VEVENT\r\n${fields.join('\r\n')}\r\nEND:VEVENT`;

export function calendarICS(homework, overrides, timeMode, generatedAt = new Date()) {
  const created = generatedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const events = [];
  for (let date = FIRST_DAY; date <= LAST_S6_DAY; date = addDays(date, 1)) {
    for (const lesson of lessonsOn(date, overrides)) {
      const [start, end] = periodTimes[timeMode][lesson.period - 1];
      events.push(event([
        `UID:lesson-${date}-${lesson.period}@timing.local`, `DTSTAMP:${created}`,
        `DTSTART;TZID=Asia/Hong_Kong:${stamp(date)}T${start.replace(':', '')}00`,
        `DTEND;TZID=Asia/Hong_Kong:${stamp(date)}T${end.replace(':', '')}00`,
        `SUMMARY:${escapeText(lesson.name)}`, `LOCATION:${escapeText(lesson.room)}`,
        `DESCRIPTION:Day ${lesson.cycle} · Period ${lesson.period}`
      ]));
    }
  }
  for (const item of homework.map(entry => resolveHomework(entry, overrides))) {
    if (!item.due || item.done) continue;
    const date = item.due.date;
    const start = item.due.period ? periodTimes[timeMode][item.due.period - 1][0] : '17:00';
    const [hour, minute] = start.split(':').map(Number);
    const end = `${String(hour + Math.floor((minute + 15) / 60)).padStart(2, '0')}${String((minute + 15) % 60).padStart(2, '0')}`;
    const reminder = Number(item.reminderDays ?? 1);
    events.push(event([
      `UID:homework-${item.id}@timing.local`, `DTSTAMP:${created}`,
      `DTSTART;TZID=Asia/Hong_Kong:${stamp(date)}T${start.replace(':', '')}00`,
      `DTEND;TZID=Asia/Hong_Kong:${stamp(date)}T${end}00`,
      `SUMMARY:${escapeText(`${subjects[item.subject]?.[0] ?? item.subject} homework: ${item.title}`)}`,
      `DESCRIPTION:${escapeText(item.notes || (item.due.period ? `Due at period ${item.due.period}` : 'Due on selected date'))}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(`Homework due: ${item.title}`)}`,
      `TRIGGER:${reminder === 0 ? 'PT0S' : `-P${reminder}D`}`,
      'END:VALARM'
    ]));
  }
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Timing//School Calendar//EN\r\nCALSCALE:GREGORIAN\r\n${events.join('\r\n')}\r\nEND:VCALENDAR\r\n`;
}
