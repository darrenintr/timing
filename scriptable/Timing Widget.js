// Timing's Home Screen widget for Scriptable. Paste this file into a Scriptable
// script named "Timing Widget". In Timing > Settings, tap Copy widget data,
// then run this script in Scriptable once after each data change.
const fm = FileManager.local();
const cache = fm.joinPath(fm.documentsDirectory(), 'timing-widget-snapshot.json');
const zone = 'Asia/Hong_Kong';
const paper = Color.dynamic(new Color('#FAF9F6'), new Color('#1B1E1D'));
const ink = Color.dynamic(new Color('#191C1B'), new Color('#E8EBE9'));
const secondary = Color.dynamic(new Color('#4A504E'), new Color('#B3B9B6'));
const accent = Color.dynamic(new Color('#1F6A64'), new Color('#7FD4C9'));

function hkParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function addText(stack, value, size, color = ink, bold = false) {
  const text = stack.addText(String(value));
  text.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  text.textColor = color;
  text.lineLimit = 1;
  return text;
}

function loadSnapshot() {
  // Clipboard is read only in the Scriptable app, never during widget refresh.
  if (config.runsInApp) {
    try {
      const input = JSON.parse(Pasteboard.pasteString() || 'null');
      if (input?.source === 'timing-scriptable-v1' &&
          input.snapshot?.version === 2 && Array.isArray(input.snapshot.days) &&
          Array.isArray(input.snapshot.homework)) {
        const previous = fm.fileExists(cache) ? JSON.parse(fm.readString(cache)) : null;
        if (!previous || input.exportedAt > previous.exportedAt) {
          fm.writeString(cache, JSON.stringify(input));
          console.log('Timing widget data updated: ' + input.exportedAt);
        }
      }
    } catch (error) { console.log('No new Timing data in clipboard.'); }
  }
  if (!fm.fileExists(cache)) return null;
  try { return JSON.parse(fm.readString(cache)); }
  catch (error) { return null; }
}

function context(snapshot, now) {
  const parts = hkParts(now);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const days = snapshot.days || [];
  const day = days.find(item => item.date === date);
  const future = days.find(item => item.date > date && item.lessons?.length);
  const lessons = day?.lessons || [];
  const inMinutes = time => {
    const [h, m] = String(time || '').split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const current = lessons.find(item => {
    const start = inMinutes(item.start), end = inMinutes(item.end);
    return start !== null && end !== null && start <= minute && minute < end;
  });
  const next = lessons.find(item => (inMinutes(item.start) ?? -1) > minute);
  const homework = snapshot.homework || [];
  return {date, day, future, lessons, current, next, homework, minute, inMinutes};
}

function render(data) {
  const widget = new ListWidget();
  widget.backgroundColor = paper;
  widget.setPadding(14, 16, 14, 16);
  widget.url = 'timing://today';
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  if (!data?.snapshot) {
    addText(widget, 'TIMING', 11, accent, true);
    widget.addSpacer(10);
    addText(widget, 'No timetable yet', 17, ink, true);
    addText(widget, 'Copy widget data in Timing, then run this script.', 11, secondary).lineLimit = 3;
    return widget;
  }

  const c = context(data.snapshot, new Date());
  const family = config.widgetFamily || 'medium';
  const compact = family === 'small';
  const heading = c.day?.cycle ? `DAY ${c.day.cycle}` : 'TIMING';
  addText(widget, `${heading}  ·  ${c.date}`, 10, accent, true);
  widget.addSpacer(compact ? 12 : 8);
  if (c.current) {
    addText(widget, c.current.subject, compact ? 18 : 21, ink, true);
    const left = Math.max(0, c.inMinutes(c.current.end) - c.minute);
    addText(widget, `P${c.current.period} · ${left} min left`, 11, secondary);
  } else if (c.next) {
    addText(widget, c.next.subject, compact ? 18 : 21, ink, true);
    addText(widget, `Next · ${c.next.start} · P${c.next.period}`, 11, secondary);
  } else if (c.lessons.length) {
    addText(widget, 'Lessons finished', compact ? 17 : 20, ink, true);
    addText(widget, `${c.lessons.length} periods today`, 11, secondary);
  } else if (c.future) {
    addText(widget, c.day?.label || 'No lessons today', compact ? 16 : 19, ink, true);
    addText(widget, `Next school day · ${c.future.date} · Day ${c.future.cycle || '–'}`, 11, secondary);
  } else {
    addText(widget, c.day?.label || 'S6 finished', compact ? 17 : 20, ink, true);
  }

  widget.addSpacer();
  if (!compact) {
    const upcoming = c.lessons.filter(item => (c.inMinutes(item.start) ?? -1) > c.minute).slice(0, family === 'large' || family === 'extraLarge' ? 4 : 2);
    for (const lesson of upcoming) addText(widget, `${lesson.start}   P${lesson.period}   ${lesson.subject}`, 12, secondary);
    if (upcoming.length) widget.addSpacer(8);
  }
  addText(widget, `${c.homework.length} open homework`, 11, accent, true);
  const count = compact ? 1 : family === 'large' || family === 'extraLarge' ? 3 : 2;
  for (const item of c.homework.slice(0, count)) {
    const due = item.date ? (item.date < c.date ? 'Overdue' : item.date === c.date ? 'Today' : item.date.slice(5)) : 'Date to confirm';
    addText(widget, `${due} · ${item.subject}: ${item.title}`, 11, secondary).lineLimit = 1;
  }
  return widget;
}

const widget = render(loadSnapshot());
Script.setWidget(widget);
if (config.runsInApp) await widget.presentMedium();
Script.complete();
