import { dayInfo, lessonsOn, LAST_S6_DAY, periodTimes, resolveHomework, subjects } from './schedule.js';
import { homeworkStatus, homeworkSubjects, normalizeHomework, reminderDays, visibleHomework } from './homework.js';
import { calendarICS } from './calendar-export.js';

const key = 'timing-s6-v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } })();
const state = {
  date: new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Hong_Kong'}),
  homework: Array.isArray(saved.homework) ? saved.homework : [],
  overrides: saved.overrides || {},
  timeMode: saved.timeMode === 'winter' ? 'winter' : 'summer',
  view: saved.view === 'homework' ? 'homework' : 'today',
  filter: 'open', subjectFilter: 'all', editingId: null, prefillSubject: null
};
const app = document.querySelector('#app');
const persist = () => localStorage.setItem(key, JSON.stringify({ homework: state.homework, overrides: state.overrides, timeMode: state.timeMode, view: state.view }));
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const readable = date => new Intl.DateTimeFormat('en-HK', {weekday:'long', day:'numeric', month:'long', year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
const short = date => new Intl.DateTimeFormat('en-HK', {day:'numeric', month:'short',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
const labelSubject = code => subjects[code]?.[0] || code;
const today = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Hong_Kong'});
const subjectOptions = selected => homeworkSubjects.map(code => `<option value="${code}" ${selected === code ? 'selected' : ''}>${escapeHTML(labelSubject(code))}</option>`).join('');
const dueText = item => !item.due ? 'Waiting for a confirmed lesson before S6 ends' : item.due.period
  ? `${short(item.due.date)} · Day ${item.due.cycle} · Period ${item.due.period}` : `${short(item.due.date)} · 5:00 PM`;

function lessonList(date) {
  const lessons = lessonsOn(date, state.overrides);
  if (!lessons.length) return '<p class="empty">No regular lessons on this date. Special and exam timetables can be entered when announced.</p>';
  return `<div class="lesson-list">${lessons.map(lesson => {
    const [start, end] = periodTimes[state.timeMode][lesson.period - 1];
    const due = state.homework.filter(h => !h.done && resolveHomework(h, state.overrides).due?.date === date && resolveHomework(h, state.overrides).due?.period === lesson.period);
    return `<div class="lesson"><div class="period">${lesson.period}<span>P</span></div><div class="lesson-main"><strong>${escapeHTML(lesson.name)}</strong><small>${start}–${end} · ${escapeHTML(lesson.room || 'Room TBC')} · ${escapeHTML(lesson.teacher)}</small>${due.length ? `<em>${due.length} homework due</em>` : ''}</div><button class="lesson-add" data-new-subject="${lesson.subject}" aria-label="Add ${escapeHTML(lesson.name)} homework">+ Homework</button></div>`;
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
  const editing = state.homework.find(item => item.id === state.editingId);
  const draft = editing ?? {subject: state.prefillSubject ?? 'ECON', afterDate: state.date > LAST_S6_DAY ? LAST_S6_DAY : state.date, dueMode:'nextLesson', dueDate:'', reminderDays:1, title:'', notes:''};
  const preview = resolveHomework(draft, state.overrides);
  const items = visibleHomework(state.homework, state.overrides, state.filter, state.subjectFilter);
  const open = state.homework.filter(item => !item.done).length;
  return `<section class="card homework-card" id="homework-section">
    <div class="section-heading"><div><span class="eyebrow">YOUR ASSIGNMENTS</span><h2>Homework</h2></div><span class="count">${open} open</span></div>
    <p class="section-intro">Choose “Next lesson” and the due date follows your real timetable when a school day changes.</p>
    <form id="homework-form" class="homework-form"><h3>${editing ? 'Edit homework' : 'Add homework'}</h3>
      <label class="description">What to hand in<input name="title" maxlength="160" value="${escapeHTML(draft.title)}" placeholder="e.g. Chapter 7, questions 1–20" required></label>
      <label>Subject<select name="subject">${subjectOptions(draft.subject)}</select></label>
      <label>Assigned on<input type="date" name="afterDate" value="${escapeHTML(draft.afterDate)}" min="2026-09-01" max="${LAST_S6_DAY}" required></label>
      <label>Due rule<select name="dueMode"><option value="nextLesson" ${draft.dueMode !== 'date' ? 'selected' : ''}>Next lesson</option><option value="date" ${draft.dueMode === 'date' ? 'selected' : ''}>Specific date</option></select></label>
      <label id="manual-date-field" ${draft.dueMode !== 'date' ? 'hidden' : ''}>Due date<input type="date" name="dueDate" value="${escapeHTML(draft.dueDate || draft.afterDate)}" min="${escapeHTML(draft.afterDate)}"></label>
      <label>Calendar reminder<select name="reminderDays">${reminderDays.map(days => `<option value="${days}" ${Number(draft.reminderDays ?? 1) === days ? 'selected' : ''}>${days === 0 ? 'At due time' : `${days} day${days === 1 ? '' : 's'} before`}</option>`).join('')}</select></label>
      <label class="description">Notes (optional)<textarea name="notes" rows="2" maxlength="1000" placeholder="Page numbers, instructions, link…">${escapeHTML(draft.notes)}</textarea></label>
      <p id="due-preview" class="due-preview" role="status">${preview.due ? `Due: ${escapeHTML(dueText(preview))}` : 'No confirmed next lesson before S6 ends'}</p>
      <p class="form-error" id="form-error" role="alert" hidden></p>
      <div class="form-actions"><button class="primary" type="submit">${editing ? 'Save changes' : 'Add homework'}</button>${editing ? '<button type="button" data-cancel-edit>Cancel</button>' : ''}</div>
    </form>
    <div class="homework-toolbar"><label>Show<select id="homework-filter"><option value="open" ${state.filter === 'open' ? 'selected' : ''}>Open</option><option value="completed" ${state.filter === 'completed' ? 'selected' : ''}>Completed</option><option value="all" ${state.filter === 'all' ? 'selected' : ''}>All</option></select></label><label>Subject<select id="homework-subject-filter"><option value="all">All subjects</option>${subjectOptions(state.subjectFilter)}</select></label></div>
    <div class="homework-list">${items.length ? items.map(item => {
      const status = homeworkStatus(item, today());
      const steps = Array.isArray(item.steps) ? item.steps : [];
      return `<article class="homework-item ${item.done ? 'done' : ''}"><button class="check" data-toggle="${escapeHTML(item.id)}" aria-label="${item.done ? 'Mark incomplete' : 'Mark complete'}">${item.done ? '✓' : ''}</button><div class="homework-details"><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(labelSubject(item.subject))} · ${escapeHTML(dueText(item))}</small>${item.notes ? `<p>${escapeHTML(item.notes)}</p>` : ''}<span class="status ${status}">${status === 'unconfirmed' ? 'Unconfirmed schedule' : status}</span>${steps.length ? `<div class="steps"><small>${steps.filter(step => step.done).length}/${steps.length} steps finished</small>${steps.map(step => `<div class="step"><button data-step-toggle="${escapeHTML(item.id)}" data-step-id="${escapeHTML(step.id)}" aria-label="${step.done ? 'Reopen' : 'Complete'} step">${step.done ? '☑' : '□'}</button><span class="${step.done ? 'done' : ''}">${escapeHTML(step.title)}</span><button data-step-remove="${escapeHTML(item.id)}" data-step-id="${escapeHTML(step.id)}" aria-label="Remove step">×</button></div>`).join('')}</div>` : ''}<form class="step-form" data-task-id="${escapeHTML(item.id)}"><input name="step" maxlength="100" placeholder="Add a smaller step" aria-label="New homework step" required><button type="submit">Add step</button></form></div><button class="item-action" data-edit="${escapeHTML(item.id)}" aria-label="Edit homework">Edit</button><button class="remove" data-remove="${escapeHTML(item.id)}" aria-label="Remove homework">×</button></article>`;
    }).join('') : `<p class="empty">${state.homework.length ? 'No homework matches these filters.' : 'Nothing here yet. Add your first assignment above.'}</p>`}</div>
    <p class="footnote">Calendar reminders are included when you export and import the calendar. This version does not schedule device notifications in the background.</p>
  </section>`;
}

function homeworkPreview() {
  const upcoming = visibleHomework(state.homework, state.overrides).slice(0, 3);
  return `<section class="card homework-preview"><div class="section-heading"><div><span class="eyebrow">NEXT TO HAND IN</span><h2>Homework</h2></div><button class="text-button" data-view="homework">Open homework →</button></div>${upcoming.length ? upcoming.map(item => `<button class="preview-item" data-view="homework"><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(labelSubject(item.subject))} · ${escapeHTML(dueText(item))}</small></button>`).join('') : '<p class="empty">No open homework. Add it as soon as a teacher sets it.</p>'}<button class="primary preview-add" data-view="homework">+ Add homework</button></section>`;
}

function render() {
  const info = dayInfo(state.date, state.overrides);
  const open = state.homework.filter(item => !item.done).length;
  app.innerHTML = `<header class="topbar"><div class="brand"><span class="brand-icon">A–F</span><span>timing<small>YOUR SCHOOL DAY, IN SYNC</small></span></div><nav aria-label="Main"><button data-view="today" class="${state.view === 'today' ? 'active' : ''}">Schedule</button><button data-view="homework" class="${state.view === 'homework' ? 'active' : ''}">Homework${open ? ` (${open})` : ''}</button></nav></header>
    <main><section class="hero ${state.view === 'homework' ? 'compact' : ''}"><div><span class="eyebrow">2026—2027 · CLASS 6B</span><h1>${state.view === 'homework' ? 'Homework,<br><i>right on time.</i>' : 'Your days,<br><i>in their own rhythm.</i>'}</h1><p>${state.view === 'homework' ? 'Assignments follow your next real lesson.' : 'A timetable that follows the school calendar, even when the cycle changes.'}</p></div><div class="hero-badge"><span>${state.view === 'homework' ? open : info.cycle || '—'}</span><small>${state.view === 'homework' ? 'OPEN TASKS' : info.cycle ? 'CYCLE DAY' : 'NO CYCLE DAY'}</small></div></section>
    <div class="layout"><div class="primary-column">${state.view === 'homework' ? homework() : `<section class="card day-card"><div class="section-heading"><div><span class="eyebrow">SELECTED DAY</span><h2>${readable(state.date)}</h2></div><input id="date-picker" aria-label="Choose date" type="date" value="${state.date}"></div><div class="notice ${info.type}"><span class="notice-dot"></span><span>${escapeHTML(info.label)}</span>${info.cycle ? `<b>Day ${info.cycle}</b>` : ''}</div><div class="subheading"><h3>Lessons</h3><label class="mode">Times <select id="time-mode"><option value="summer" ${state.timeMode === 'summer' ? 'selected' : ''}>Summer</option><option value="winter" ${state.timeMode === 'winter' ? 'selected' : ''}>Winter</option></select></label></div>${lessonList(state.date)}</section>${homeworkPreview()}`}</div>
    <aside><section class="card calendar-card">${calendar()}<div class="legend"><span><i class="legend-regular"></i>Lessons</span><span><i class="legend-special"></i>Special / exams</span><span><i class="legend-off"></i>Off</span></div></section><section class="card adjust-card"><span class="eyebrow">SCHOOL CHANGES</span><h2>Adjust this date</h2><p>Mark a cancellation or an updated timetable. Homework deadlines recalculate immediately.</p><label>Status<select id="day-type"><option value="default">Use school calendar</option><option value="regular" ${state.overrides[state.date]?.type === 'regular' ? 'selected' : ''}>Normal lessons</option><option value="special" ${state.overrides[state.date]?.type === 'special' ? 'selected' : ''}>Special timetable (unconfirmed)</option><option value="holiday" ${state.overrides[state.date]?.type === 'holiday' ? 'selected' : ''}>No school / cancelled</option></select></label><label>Cycle letter<select id="cycle-type"><option value="default">Use printed letter</option>${'ABCDEF'.split('').map(letter => `<option value="${letter}" ${state.overrides[state.date]?.cycle === letter ? 'selected' : ''}>${letter}</option>`).join('')}</select></label><p class="footnote">The school’s published A–F letter takes priority unless you choose an override. S6 lessons always stop after 1 February.</p></section><section class="export"><button id="export-ics">↓ Export calendar (.ics)</button><small>Import into Apple or Google Calendar. Export again after changes; this file does not live sync.</small></section></aside></div></main><footer>Built around your 6B timetable · Local data stays on this device</footer>`;
}

app.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  // A form's submit click must reach its submit event before the DOM is rebuilt.
  if (button.type === 'submit' && button.closest('form')) return;
  if (button.dataset.date) state.date = button.dataset.date;
  if (button.dataset.view) state.view = button.dataset.view;
  if (button.dataset.newSubject) {
    state.prefillSubject = button.dataset.newSubject;
    state.editingId = null;
    state.view = 'homework';
  }
  if (button.dataset.step) {
    const [year, month] = state.date.split('-').map(Number);
    state.date = new Date(Date.UTC(year, month - 1 + Number(button.dataset.step), 1)).toISOString().slice(0,10);
  }
  if (button.dataset.toggle) {
    const item = state.homework.find(h => h.id === button.dataset.toggle);
    if (item) item.done = !item.done;
  }
  if (button.dataset.stepToggle || button.dataset.stepRemove) {
    const task = state.homework.find(h => h.id === (button.dataset.stepToggle || button.dataset.stepRemove));
    const step = task?.steps?.find(step => step.id === button.dataset.stepId);
    if (step && button.dataset.stepToggle) step.done = !step.done;
    if (step && button.dataset.stepRemove) task.steps = task.steps.filter(part => part.id !== step.id);
  }
  if (button.dataset.edit) { state.editingId = button.dataset.edit; state.view = 'homework'; }
  if (button.dataset.cancelEdit !== undefined) state.editingId = null;
  if (button.dataset.remove && confirm('Remove this homework?')) {
    state.homework = state.homework.filter(h => h.id !== button.dataset.remove);
    if (state.editingId === button.dataset.remove) state.editingId = null;
  }
  if (button.id === 'export-ics') {
    const url = URL.createObjectURL(new Blob([calendarICS(state.homework, state.overrides, state.timeMode)], {type:'text/calendar;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'timing-s6-calendar.ics'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  persist(); render();
  if (button.dataset.newSubject || button.dataset.edit) app.querySelector('#homework-form')?.scrollIntoView({behavior:'smooth', block:'start'});
});
app.addEventListener('change', event => {
  if (event.target.id === 'homework-filter') { state.filter = event.target.value; render(); return; }
  if (event.target.id === 'homework-subject-filter') { state.subjectFilter = event.target.value; render(); return; }
  if (event.target.closest('#homework-form')) { updateDraftPreview(); return; }
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
app.addEventListener('input', event => {
  if (event.target.closest('#homework-form')) updateDraftPreview();
});
function updateDraftPreview() {
  const form = app.querySelector('#homework-form');
  if (!form) return;
  const data = new FormData(form);
  const manual = data.get('dueMode') === 'date';
  form.querySelector('#manual-date-field').hidden = !manual;
  const dueInput = form.querySelector('[name="dueDate"]');
  dueInput.min = String(data.get('afterDate'));
  const draft = { subject:String(data.get('subject')), afterDate:String(data.get('afterDate')), dueMode:String(data.get('dueMode')), dueDate:String(data.get('dueDate')) };
  const preview = resolveHomework(draft, state.overrides);
  form.querySelector('#due-preview').textContent = preview.due ? `Due: ${dueText(preview)}` : 'No confirmed next lesson before S6 ends';
}
app.addEventListener('submit', event => {
  if (event.target.matches('.step-form')) {
    event.preventDefault();
    const task = state.homework.find(h => h.id === event.target.dataset.taskId);
    const title = String(new FormData(event.target).get('step') ?? '').trim();
    if (task && title) {
      if (!Array.isArray(task.steps)) task.steps = [];
      task.steps.push({id:crypto.randomUUID(), title:title.slice(0, 100), done:false});
      persist(); render();
    }
    return;
  }
  if (event.target.id !== 'homework-form') return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  try {
    const existing = state.homework.find(h => h.id === state.editingId);
    const item = normalizeHomework(data, existing);
    if (existing) state.homework = state.homework.map(h => h.id === existing.id ? item : h);
    else state.homework.push(item);
    state.editingId = null;
    state.prefillSubject = null;
    persist(); render();
  } catch (error) {
    const message = app.querySelector('#form-error');
    message.textContent = error.message;
    message.hidden = false;
  }
});
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
