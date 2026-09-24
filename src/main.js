import { addDays, dayInfo, lessonsOn, LAST_S6_DAY, periodTimes, resolveHomework, subjects } from './schedule.js';

const key = 'timing-s6-v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } })();
const state = {
  date: new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Hong_Kong'}),
  homework: Array.isArray(saved.homework) ? saved.homework : [],
  overrides: saved.overrides || {},
  timeMode: saved.timeMode === 'winter' ? 'winter' : 'summer',
  view: 'today'
};
const app = document.querySelector('#app');
const persist = () => localStorage.setItem(key, JSON.stringify({ homework: state.homework, overrides: state.overrides, timeMode: state.timeMode }));
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const readable = date => new Intl.DateTimeFormat('en-HK', {weekday:'long', day:'numeric', month:'long', year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
const short = date => new Intl.DateTimeFormat('en-HK', {day:'numeric', month:'short',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
const labelSubject = code => subjects[code]?.[0] || code;

function lessonList(date) {
  const lessons = lessonsOn(date, state.overrides);
  if (!lessons.length) return '<p class="empty">No regular lessons on this date. Special and exam timetables can be entered when announced.</p>';
  return `<div class="lesson-list">${lessons.map(lesson => {
    const [start, end] = periodTimes[state.timeMode][lesson.period - 1];
    const due = state.homework.filter(h => !h.done && resolveHomework(h, state.overrides).due?.date === date && h.subject === lesson.subject);
    return `<div class="lesson"><div class="period">${lesson.period}<span>P</span></div><div class="lesson-main"><strong>${escapeHTML(lesson.name)}</strong><small>${start}–${end} · ${escapeHTML(lesson.room || 'Room TBC')} · ${escapeHTML(lesson.teacher)}</small>${due.length ? `<em>${due.length} homework due</em>` : ''}</div></div>`;
  }).join('')}</div>`;
}

function calendar() {
  const [year, month] = state.date.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Array.from({length:first}, () => '<span class="calendar-blank"></span>');
  for (let n = 1; n <= days; n++) {
    const date = `${year}-${String(month).padStart(2,'0')}-${String(n).padStart(2,'0')}`;
    const info = dayInfo(date, state.overrides);
    cells.push(`<button class="calendar-day ${info.type} ${date === state.date ? 'selected' : ''}" data-date="${date}" aria-label="${readable(date)}, ${info.cycle || info.type}"><span>${n}</span><b>${info.cycle || '·'}</b></button>`);
  }
  return `<div class="calendar-head"><button data-step="-1" aria-label="Previous month">‹</button><strong>${new Intl.DateTimeFormat('en-HK', {month:'long', year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year, month-1, 1)))}</strong><button data-step="1" aria-label="Next month">›</button></div><div class="calendar-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => `<span class="weekday">${day}</span>`).join('')}${cells.join('')}</div>`;
}

function homework() {
  const items = state.homework.map(resolve => resolveHomework(resolve, state.overrides)).sort((a,b) => (a.due?.date || '9999').localeCompare(b.due?.date || '9999'));
  return `<section class="card"><div class="section-heading"><div><span class="eyebrow">DYNAMIC DEADLINES</span><h2>Homework</h2></div><span class="count">${items.filter(h => !h.done).length} open</span></div>
    <form id="homework-form" class="homework-form"><label>Subject<select name="subject">${['ECON','GEOG','ICT','ENG','CHIN','MATH','CSD'].map(code => `<option value="${code}">${labelSubject(code)}</option>`).join('')}</select></label><label>Assigned on<input type="date" name="afterDate" value="${state.date}" min="2026-09-01" max="${LAST_S6_DAY}" required></label><label class="description">What to hand in<input name="title" maxlength="160" placeholder="e.g. Chapter 7, questions 1–20" required></label><button class="primary" type="submit">Add homework</button></form>
    <div class="homework-list">${items.length ? items.map(item => `<article class="homework-item ${item.done ? 'done' : ''}"><button class="check" data-toggle="${escapeHTML(item.id)}" aria-label="${item.done ? 'Mark incomplete' : 'Mark complete'}">${item.done ? '✓' : ''}</button><div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(labelSubject(item.subject))} · ${item.due ? `Next lesson ${short(item.due.date)}, period ${item.due.period}` : 'No confirmed next lesson before S6 ends'}</small></div><button class="remove" data-remove="${escapeHTML(item.id)}" aria-label="Remove homework">×</button></article>`).join('') : '<p class="empty">No homework yet. Add an assignment and it will follow the next actual lesson.</p>'}</div></section>`;
}

function render() {
  const info = dayInfo(state.date, state.overrides);
  app.innerHTML = `<header class="topbar"><div class="brand"><span class="brand-icon">A–F</span><span>timing<small>YOUR SCHOOL DAY, IN SYNC</small></span></div><nav aria-label="Main"><button data-view="today" class="${state.view === 'today' ? 'active' : ''}">Schedule</button><button data-view="homework" class="${state.view === 'homework' ? 'active' : ''}">Homework</button></nav></header>
    <main><section class="hero"><div><span class="eyebrow">2026—2027 · CLASS 6B</span><h1>Your days,<br><i>in their own rhythm.</i></h1><p>A timetable that follows the school calendar, even when the cycle changes.</p></div><div class="hero-badge"><span>${info.cycle || '—'}</span><small>${info.cycle ? 'CYCLE DAY' : 'NO CYCLE DAY'}</small></div></section>
    <div class="layout"><div class="primary-column"><section class="card day-card"><div class="section-heading"><div><span class="eyebrow">SELECTED DAY</span><h2>${readable(state.date)}</h2></div><input id="date-picker" aria-label="Choose date" type="date" value="${state.date}"></div><div class="notice ${info.type}"><span class="notice-dot"></span><span>${escapeHTML(info.label)}</span>${info.cycle ? `<b>Day ${info.cycle}</b>` : ''}</div><div class="subheading"><h3>Lessons</h3><label class="mode">Times <select id="time-mode"><option value="summer" ${state.timeMode === 'summer' ? 'selected' : ''}>Summer</option><option value="winter" ${state.timeMode === 'winter' ? 'selected' : ''}>Winter</option></select></label></div>${lessonList(state.date)}</section>${state.view === 'homework' ? homework() : ''}</div>
    <aside><section class="card calendar-card">${calendar()}<div class="legend"><span><i class="legend-regular"></i>Lessons</span><span><i class="legend-special"></i>Special / exams</span><span><i class="legend-off"></i>Off</span></div></section><section class="card adjust-card"><span class="eyebrow">SCHOOL CHANGES</span><h2>Adjust this date</h2><p>Mark a cancellation or an updated timetable. Homework deadlines recalculate immediately.</p><label>Status<select id="day-type"><option value="default">Use school calendar</option><option value="regular" ${state.overrides[state.date]?.type === 'regular' ? 'selected' : ''}>Normal lessons</option><option value="special" ${state.overrides[state.date]?.type === 'special' ? 'selected' : ''}>Special timetable (unconfirmed)</option><option value="holiday" ${state.overrides[state.date]?.type === 'holiday' ? 'selected' : ''}>No school / cancelled</option></select></label><label>Cycle letter<select id="cycle-type"><option value="default">Use printed letter</option>${'ABCDEF'.split('').map(letter => `<option value="${letter}" ${state.overrides[state.date]?.cycle === letter ? 'selected' : ''}>${letter}</option>`).join('')}</select></label><p class="footnote">The school’s published A–F letter takes priority unless you choose an override. S6 lessons always stop after 1 February.</p></section><section class="export"><button id="export-ics">↓ Export calendar (.ics)</button><small>Import into Apple or Google Calendar. Export again after changes; this file does not live sync.</small></section></aside></div></main><footer>Built around your 6B timetable · Local data stays on this device</footer>`;
}

function calendarICS() {
  const esc = value => String(value).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const stamp = date => date.replaceAll('-','');
  const events = [];
  for (let date = '2026-09-01'; date <= LAST_S6_DAY; date = addDays(date,1)) {
    for (const lesson of lessonsOn(date, state.overrides)) {
      const [start,end] = periodTimes[state.timeMode][lesson.period - 1];
      events.push(`BEGIN:VEVENT\r\nUID:lesson-${date}-${lesson.period}@timing.local\r\nDTSTAMP:${stamp(date)}T000000Z\r\nDTSTART;TZID=Asia/Hong_Kong:${stamp(date)}T${start.replace(':','')}00\r\nDTEND;TZID=Asia/Hong_Kong:${stamp(date)}T${end.replace(':','')}00\r\nSUMMARY:${esc(lesson.name)}\r\nLOCATION:${esc(lesson.room)}\r\nDESCRIPTION:Day ${lesson.cycle} · Period ${lesson.period}\r\nEND:VEVENT`);
    }
  }
  for (const item of state.homework.map(h => resolveHomework(h,state.overrides))) {
    if (!item.due) continue;
    const date = item.due.date;
    const start = periodTimes[state.timeMode][item.due.period-1][0].replace(':','');
    events.push(`BEGIN:VEVENT\r\nUID:homework-${item.id}@timing.local\r\nDTSTAMP:${stamp(date)}T000000Z\r\nDTSTART;TZID=Asia/Hong_Kong:${stamp(date)}T${start}00\r\nDTEND;TZID=Asia/Hong_Kong:${stamp(date)}T${start}00\r\nSUMMARY:${esc(`${labelSubject(item.subject)} homework: ${item.title}`)}\r\nDESCRIPTION:Due at next lesson\r\nEND:VEVENT`);
  }
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Timing//School Calendar//EN\r\nCALSCALE:GREGORIAN\r\n${events.join('\r\n')}\r\nEND:VCALENDAR\r\n`;
}

app.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.date) state.date = button.dataset.date;
  if (button.dataset.view) state.view = button.dataset.view;
  if (button.dataset.step) {
    const [year, month] = state.date.split('-').map(Number);
    state.date = new Date(Date.UTC(year, month - 1 + Number(button.dataset.step), 1)).toISOString().slice(0,10);
  }
  if (button.dataset.toggle) state.homework.find(h => h.id === button.dataset.toggle).done = !state.homework.find(h => h.id === button.dataset.toggle).done;
  if (button.dataset.remove) state.homework = state.homework.filter(h => h.id !== button.dataset.remove);
  if (button.id === 'export-ics') {
    const url = URL.createObjectURL(new Blob([calendarICS()], {type:'text/calendar;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'timing-s6-calendar.ics'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  persist(); render();
});
app.addEventListener('change', event => {
  if (event.target.id === 'date-picker') state.date = event.target.value;
  if (event.target.id === 'time-mode') state.timeMode = event.target.value;
  if (event.target.id === 'day-type') {
    if (event.target.value === 'default') {
      if (state.overrides[state.date]?.cycle) state.overrides[state.date] = {cycle: state.overrides[state.date].cycle};
      else delete state.overrides[state.date];
    } else state.overrides[state.date] = { ...state.overrides[state.date], type:event.target.value, label: event.target.value === 'regular' ? 'Normal lessons (manual override)' : event.target.value === 'holiday' ? 'No school (manual override)' : 'Special timetable · lessons need confirmation' };
  }
  if (event.target.id === 'cycle-type') {
    if (event.target.value === 'default') {
      if (state.overrides[state.date]) delete state.overrides[state.date].cycle;
      if (state.overrides[state.date] && !Object.keys(state.overrides[state.date]).length) delete state.overrides[state.date];
    } else state.overrides[state.date] = {...state.overrides[state.date], cycle: event.target.value};
  }
  persist(); render();
});
app.addEventListener('submit', event => {
  if (event.target.id !== 'homework-form') return;
  event.preventDefault();
  const data = new FormData(event.target);
  state.homework.push({id:crypto.randomUUID(), title:String(data.get('title')).trim(), subject:String(data.get('subject')), afterDate:String(data.get('afterDate')), done:false});
  persist(); render();
});
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
