import { addDays, dayInfo, lessonsOn, LAST_S6_DAY, periodTimes, resolveHomework, subjects } from './schedule.js';
import { homeworkStatus, homeworkSubjects, normalizeHomework, reminderDays, visibleHomework } from './homework.js';
import { calendarICS } from './calendar-export.js';
import { icon } from './icons.js';
import { shape } from './shapes.js';

const key = 'timing-s6-v1';
const views = ['today', 'calendar', 'homework'];
const saved = (() => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } })();
const state = {
  date: new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Hong_Kong'}),
  homework: Array.isArray(saved.homework) ? saved.homework : [],
  overrides: saved.overrides || {},
  timeMode: saved.timeMode === 'winter' ? 'winter' : 'summer',
  view: views.includes(saved.view) ? saved.view : 'today',
  filter: 'open', subjectFilter: 'all', editingId: null, prefillSubject: null
};
const app = document.querySelector('#app');
const persist = () => localStorage.setItem(key, JSON.stringify({ homework: state.homework, overrides: state.overrides, timeMode: state.timeMode, view: state.view }));
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const format = (date, options) => new Intl.DateTimeFormat('en-HK', {...options, timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
const readable = date => format(date, {weekday:'long', day:'numeric', month:'long', year:'numeric'});
const short = date => format(date, {day:'numeric', month:'short'});
const labelSubject = code => subjects[code]?.[0] || code;
const today = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Hong_Kong'});
const minutes = time => { const [hours, mins] = time.split(':').map(Number); return hours * 60 + mins; };
const nowMinutes = () => minutes(new Intl.DateTimeFormat('en-GB', {hour:'2-digit', minute:'2-digit', hourCycle:'h23', timeZone:'Asia/Hong_Kong'}).format(new Date()));
const subjectOptions = selected => homeworkSubjects.map(code => `<option value="${code}" ${selected === code ? 'selected' : ''}>${escapeHTML(labelSubject(code))}</option>`).join('');
const dueText = item => !item.due ? 'Waiting for a confirmed lesson before S6 ends' : item.due.period
  ? `${short(item.due.date)} · Day ${item.due.cycle} · Period ${item.due.period}` : `${short(item.due.date)} · 5:00 PM`;
const statusLabels = {overdue:'Overdue', today:'Due today', upcoming:'Coming up', unconfirmed:'Unconfirmed schedule', completed:'Completed'};
const statusIcons = {overdue:'error', today:'schedule', unconfirmed:'info'};

// A connected button group (Material 3 Expressive) built from real radio inputs.
function choiceGroup(name, options, selected, label, className = '') {
  return `<div class="button-group ${className}" role="radiogroup" aria-label="${escapeHTML(label)}">${options.map(([value, text]) =>
    `<label><input type="radio" name="${name}" value="${escapeHTML(value)}" ${String(value) === String(selected) ? 'checked' : ''}><span>${icon('check', 'selected-mark')}${escapeHTML(text)}</span></label>`).join('')}</div>`;
}
function chipGroup(name, options, selected, label) {
  return `<div class="chip-row" role="radiogroup" aria-label="${escapeHTML(label)}">${options.map(([value, text]) =>
    `<label class="chip"><input type="radio" name="${name}" value="${escapeHTML(value)}" ${String(value) === String(selected) ? 'checked' : ''}><span>${icon('check', 'selected-mark')}${escapeHTML(text)}</span></label>`).join('')}</div>`;
}

function lessonList(date) {
  const lessons = lessonsOn(date, state.overrides);
  if (!lessons.length) return `<div class="empty">${icon('event')}<p>No regular lessons on this date. Special and exam timetables can be entered when announced.</p></div>`;
  const live = date === today();
  const now = live ? nowMinutes() : -1;
  const rows = [];
  lessons.forEach((lesson, index) => {
    const [start, end] = periodTimes[state.timeMode][lesson.period - 1];
    const current = live && now >= minutes(start) && now < minutes(end);
    const past = live && now >= minutes(end);
    const due = state.homework.filter(h => !h.done && resolveHomework(h, state.overrides).due?.date === date && resolveHomework(h, state.overrides).due?.period === lesson.period);
    const detail = `${start}–${end} · ${escapeHTML(lesson.room ? `Room ${lesson.room}` : 'Room TBC')} · ${escapeHTML(lesson.teacher)}`;
    const dueBadge = due.length ? `<span class="badge-chip">${icon('assignment')}${due.length} due</span>` : '';
    const add = `<button class="icon-button lesson-add" data-new-subject="${lesson.subject}" aria-label="Add ${escapeHTML(lesson.name)} homework">${icon('add_task')}</button>`;
    if (current) {
      const progress = Math.round((now - minutes(start)) / (minutes(end) - minutes(start)) * 100);
      rows.push(`<div class="lesson current"><div class="period">${shape(4, 0.16, '', Math.PI / 4)}<span>${lesson.period}</span></div><div class="lesson-main"><span class="overline">Now · Period ${lesson.period}</span><strong>${escapeHTML(lesson.name)}</strong><small>${detail}</small>${dueBadge}</div>${add}<div class="lesson-progress"><div class="progress" role="progressbar" aria-label="Lesson progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span class="progress-active" style="width:${Math.max(progress, 4)}%"></span><span class="progress-track"></span></div><span>${minutes(end) - now} min left</span></div></div>`);
    } else {
      rows.push(`<div class="lesson ${past ? 'past' : ''}"><div class="period"><span>${lesson.period}</span></div><div class="lesson-main"><div class="lesson-title"><strong>${escapeHTML(lesson.name)}</strong>${dueBadge}</div><small>${detail}</small></div>${add}</div>`);
    }
    const next = lessons[index + 1];
    if (next) {
      const nextStart = periodTimes[state.timeMode][next.period - 1][0];
      if (minutes(nextStart) > minutes(end)) rows.push(`<div class="break">${icon('local_cafe')}<span>${minutes(nextStart) - minutes(end) >= 45 ? 'Lunch' : 'Break'} · ${end}–${nextStart}</span></div>`);
    }
  });
  return `<div class="lesson-list">${rows.join('')}</div>`;
}

function calendar() {
  const [year, month] = state.date.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const now = today();
  const cells = Array.from({length:first}, () => '<span class="calendar-blank"></span>');
  for (let n = 1; n <= days; n++) {
    const date = `${year}-${String(month).padStart(2,'0')}-${String(n).padStart(2,'0')}`;
    const info = dayInfo(date, state.overrides);
    const flag = info.type === 'regular' && /check/i.test(info.label);
    const selected = date === state.date;
    cells.push(`<button class="calendar-day ${info.type} ${selected ? 'selected' : ''} ${date === now ? 'is-today' : ''} ${flag ? 'flag' : ''}" data-date="${date}" aria-label="${readable(date)}, ${info.cycle ? `Day ${info.cycle}` : info.type}" ${selected ? 'aria-pressed="true"' : ''}>${selected ? shape(12, 0.06, 'day-shape') : ''}<span>${n}</span><b>${info.cycle || '·'}</b></button>`);
  }
  const title = new Intl.DateTimeFormat('en-HK', {month:'long', year:'numeric', timeZone:'UTC'}).format(new Date(Date.UTC(year, month - 1, 1)));
  return `<div class="calendar-head"><h2>${title}</h2><div class="icon-row"><button class="icon-button" data-step="-1" aria-label="Previous month">${icon('chevron_left')}</button><button class="icon-button" data-step="1" aria-label="Next month">${icon('chevron_right')}</button></div></div><div class="calendar-grid">${['S','M','T','W','T','F','S'].map((day, index) => `<span class="weekday" aria-hidden="true" title="${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][index]}">${day}</span>`).join('')}${cells.join('')}</div>`;
}

function dueCard(item) {
  if (!item.due) return `<span class="due-shape">${icon('info')}</span><span class="due-text"><small>Due</small><strong>No confirmed next lesson before S6 ends</strong></span>`;
  const when = format(item.due.date, {weekday:'short', day:'numeric', month:'short'});
  return item.due.period
    ? `<span class="due-shape">${shape(5, 0.12)}<b>${escapeHTML(item.due.cycle)}</b></span><span class="due-text"><small>Due</small><strong>${when} · Period ${item.due.period}</strong><em>Next ${escapeHTML(labelSubject(item.subject))} lesson, Day ${escapeHTML(item.due.cycle)}. Moves if a school day changes.</em></span>`
    : `<span class="due-shape">${shape(5, 0.12)}${icon('event')}</span><span class="due-text"><small>Due</small><strong>${when} · 5:00 PM</strong><em>Fixed date, not tied to a lesson.</em></span>`;
}

function homeworkItem(item) {
  const status = homeworkStatus(item, today());
  const steps = Array.isArray(item.steps) ? item.steps : [];
  const finished = steps.filter(step => step.done).length;
  const statusChip = status === 'upcoming' || status === 'completed' ? '' : `<span class="status ${status}">${icon(statusIcons[status])}${statusLabels[status]}</span>`;
  const progress = steps.length ? `<span class="step-progress"><span class="mini-track"><span style="width:${Math.round(finished / steps.length * 100)}%"></span></span>${finished}/${steps.length} steps finished</span>` : '';
  return `<article class="homework-item ${item.done ? 'done' : ''}">
    <button class="check" data-toggle="${escapeHTML(item.id)}" aria-label="${item.done ? 'Mark incomplete' : 'Mark complete'}" aria-pressed="${item.done}"><span class="box">${item.done ? icon('check') : ''}</span></button>
    <div class="homework-details"><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(labelSubject(item.subject))} · ${escapeHTML(dueText(item))}</small>${item.notes ? `<p>${escapeHTML(item.notes)}</p>` : ''}${statusChip || progress ? `<div class="meta">${statusChip}${progress}</div>` : ''}
      ${steps.length ? `<div class="steps">${steps.map(step => `<div class="step"><button class="icon-button small" data-step-toggle="${escapeHTML(item.id)}" data-step-id="${escapeHTML(step.id)}" aria-label="${step.done ? 'Reopen' : 'Complete'} step">${icon(step.done ? 'check_box' : 'check_box_outline_blank')}</button><span class="${step.done ? 'done' : ''}">${escapeHTML(step.title)}</span><button class="icon-button small" data-step-remove="${escapeHTML(item.id)}" data-step-id="${escapeHTML(step.id)}" aria-label="Remove step">${icon('close')}</button></div>`).join('')}</div>` : ''}
      <form class="step-form" data-task-id="${escapeHTML(item.id)}"><input name="step" maxlength="100" placeholder="Add a smaller step" aria-label="New homework step" required><button class="button text" type="submit">Add step</button></form>
    </div>
    <div class="item-actions"><button class="icon-button item-action" data-edit="${escapeHTML(item.id)}" aria-label="Edit homework">${icon('edit')}</button><button class="icon-button remove" data-remove="${escapeHTML(item.id)}" aria-label="Remove homework">${icon('delete')}</button></div>
  </article>`;
}

function groupedHomework(items) {
  const groups = [];
  for (const item of items) {
    const status = homeworkStatus(item, today());
    if (groups.at(-1)?.status !== status) groups.push({status, items: []});
    groups.at(-1).items.push(item);
  }
  return groups.map(group => `<h3 class="group-title ${group.status}">${statusLabels[group.status]}</h3><div class="segmented">${group.items.map(homeworkItem).join('')}</div>`).join('');
}

function homework() {
  const editing = state.homework.find(item => item.id === state.editingId);
  const draft = editing ?? {subject: state.prefillSubject ?? 'ECON', afterDate: state.date > LAST_S6_DAY ? LAST_S6_DAY : state.date, dueMode:'nextLesson', dueDate:'', reminderDays:1, title:'', notes:''};
  const preview = resolveHomework(draft, state.overrides);
  const items = visibleHomework(state.homework, state.overrides, state.filter, state.subjectFilter);
  return `<section class="card homework-card" id="homework-section">
    <form id="homework-form" class="homework-form"><h2>${editing ? 'Edit homework' : 'Add homework'}</h2>
      <label class="field description"><span>What to hand in</span><input name="title" maxlength="160" value="${escapeHTML(draft.title)}" placeholder="e.g. Chapter 7, questions 1–20" required></label>
      <label class="field"><span>Subject</span><select name="subject">${subjectOptions(draft.subject)}</select></label>
      <label class="field"><span>Assigned on</span><input type="date" name="afterDate" value="${escapeHTML(draft.afterDate)}" min="2026-09-01" max="${LAST_S6_DAY}" required></label>
      <fieldset class="description"><legend>Due</legend>${choiceGroup('dueMode', [['nextLesson','Next lesson'],['date','Specific date']], draft.dueMode === 'date' ? 'date' : 'nextLesson', 'Due rule', 'full')}</fieldset>
      <label class="field description" id="manual-date-field" ${draft.dueMode !== 'date' ? 'hidden' : ''}><span>Due date</span><input type="date" name="dueDate" value="${escapeHTML(draft.dueDate || draft.afterDate)}" min="${escapeHTML(draft.afterDate)}"></label>
      <div id="due-preview" class="due-preview" role="status">${dueCard(preview)}</div>
      <fieldset class="description"><legend>Calendar reminder</legend>${chipGroup('reminderDays', reminderDays.map(days => [days, days === 0 ? 'At due time' : `${days} day${days === 1 ? '' : 's'} before`]), Number(draft.reminderDays ?? 1), 'Calendar reminder')}</fieldset>
      <label class="field description"><span>Notes (optional)</span><textarea name="notes" rows="3" maxlength="1000" placeholder="Page numbers, instructions, link…">${escapeHTML(draft.notes)}</textarea></label>
      <p class="form-error" id="form-error" role="alert" hidden></p>
      <div class="form-actions"><button class="button filled" type="submit">${editing ? 'Save changes' : 'Add homework'}</button>${editing ? '<button class="button tonal" type="button" data-cancel-edit>Cancel</button>' : ''}</div>
    </form>
    <div class="homework-toolbar">
      ${choiceGroup('homework-filter', [['open','Open'],['completed','Completed'],['all','All']], state.filter, 'Show homework', 'full')}
      ${chipGroup('homework-subject-filter', [['all','All subjects'], ...homeworkSubjects.map(code => [code, labelSubject(code)])], state.subjectFilter, 'Filter by subject')}
    </div>
    <div class="homework-list">${items.length ? groupedHomework(items) : `<div class="empty">${icon('assignment')}<p>${state.homework.length ? 'No homework matches these filters.' : 'Nothing here yet. Add your first assignment above.'}</p></div>`}</div>
    <p class="footnote">Calendar reminders are included when you export and import the calendar. This version does not schedule device notifications in the background.</p>
  </section>`;
}

function homeworkPreview() {
  const upcoming = visibleHomework(state.homework, state.overrides).slice(0, 3);
  const open = state.homework.filter(item => !item.done).length;
  return `<section class="card homework-preview"><div class="section-heading"><h2>Next to hand in</h2><button class="button text" data-view="homework">${open ? `See all ${open}` : 'Open homework'}</button></div>${upcoming.length ? `<div class="segmented">${upcoming.map(item => {
    const status = homeworkStatus(item, today());
    return `<button class="preview-item" data-view="homework"><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(labelSubject(item.subject))} · ${escapeHTML(dueText(item))}</small>${statusIcons[status] ? `<span class="status ${status}">${icon(statusIcons[status])}${statusLabels[status]}</span>` : ''}</button>`;
  }).join('')}</div>` : `<div class="empty">${icon('assignment')}<p>No open homework. Add it as soon as a teacher sets it.</p></div>`}</section>`;
}

function hero(info, open) {
  if (state.view === 'homework') {
    return `<section class="hero"><div class="hero-title"><h1>Homework</h1><p>Due dates follow your real lessons</p></div><div class="hero-card compact-card"><div class="cycle-shape tertiary">${shape(6, 0.1)}<span>${open}</span></div><div class="hero-text"><span class="overline">Open tasks</span><strong>${open ? `${open} to hand in` : 'All caught up'}</strong></div></div></section>`;
  }
  const lessons = lessonsOn(state.date, state.overrides);
  const lastEnd = lessons.length ? periodTimes[state.timeMode][lessons.at(-1).period - 1][1] : '';
  const names = {regular:'Normal timetable', special:'Special timetable', exam:'Examinations', holiday:'No school', off:'No lessons', opening:'Opening ceremony', finished:'S6 finished', outside:'Before term'};
  const showLabel = info.label && info.label !== 'Normal timetable';
  return `<section class="hero">
    <div class="hero-title"><div><h1>${format(state.date, {weekday:'long'})}</h1><p>${format(state.date, {day:'numeric', month:'long', year:'numeric'})} · Class 6B</p></div>
      <div class="date-controls"><button class="icon-button tonal" data-shift="-1" aria-label="Previous day">${icon('chevron_left')}</button><input id="date-picker" aria-label="Choose date" type="date" value="${state.date}"><button class="icon-button tonal" data-shift="1" aria-label="Next day">${icon('chevron_right')}</button>${state.date !== today() ? '<button class="button tonal" data-today>Today</button>' : ''}</div></div>
    <div class="hero-card type-${info.type}"><div class="cycle-shape">${shape(9, 0.08)}<span>${info.cycle || '–'}</span></div>
      <div class="hero-text"><span class="overline">${info.cycle ? 'Cycle day' : 'No cycle day'}</span><strong>${info.cycle ? `Day ${info.cycle}` : names[info.type] ?? 'No lessons'}</strong><span>${lessons.length ? `${lessons.length} lessons · ends ${lastEnd}` : 'No ordinary lessons'}</span></div>
      ${showLabel ? `<span class="notice ${info.type}">${icon(info.type === 'regular' ? 'campaign' : 'info')}<span>${escapeHTML(info.label)}</span></span>` : ''}</div>
  </section>`;
}

function render() {
  const info = dayInfo(state.date, state.overrides);
  const open = state.homework.filter(item => !item.done).length;
  const override = state.overrides[state.date] ?? {};
  const navItem = (view, label, name) => {
    const active = state.view === view;
    const wide = view === 'today' && state.view === 'calendar';
    return `<button class="nav-item nav-${view} ${active ? 'active' : ''} ${wide ? 'active-wide' : ''}" data-view="${view}" ${active ? 'aria-current="page"' : ''}><span class="nav-indicator">${icon(active || wide ? `${name}_fill` : name, 'nav-icon')}${view === 'homework' && open ? `<span class="nav-badge">${open}</span>` : ''}</span><span class="nav-label">${label}</span></button>`;
  };
  app.innerHTML = `<div class="app-shell view-${state.view}">
  <nav class="nav" aria-label="Main">
    <div class="nav-brand"><img src="./icon.svg" alt="" width="40" height="40"><span>timing</span></div>
    <button class="fab nav-fab" data-compose aria-label="New homework">${icon('add')}<span>New homework</span></button>
    <div class="nav-items">${navItem('today', 'Today', 'today')}${navItem('calendar', 'Calendar', 'calendar_month')}${navItem('homework', 'Homework', 'assignment')}</div>
  </nav>
  <div class="shell-body">
    <header class="topbar"><div class="brand"><img src="./icon.svg" alt="" width="36" height="36"><span>timing</span></div><button class="icon-button" data-export aria-label="Export calendar (.ics)">${icon('ios_share')}</button></header>
    <main>${hero(info, open)}
    <div class="layout"><div class="primary-column">${state.view === 'homework' ? homework() : `<section class="card day-card"><div class="section-heading"><h2>Lessons</h2>${choiceGroup('time-mode', [['summer','Summer'],['winter','Winter']], state.timeMode, 'Lesson times', 'small')}</div>${lessonList(state.date)}</section>${homeworkPreview()}`}</div>
    <aside><section class="card calendar-card">${calendar()}<div class="legend"><span><b>A–F</b>Cycle day</span><span><i class="legend-special"></i>Special / exams</span><span><i class="legend-flag"></i>Check changes</span></div></section>
      <section class="card adjust-card"><h2>Adjust ${format(state.date, {day:'numeric', month:'long'})}</h2><p>Mark a cancellation or an updated timetable. Homework deadlines recalculate immediately.</p>
        <label class="field"><span>Status</span><select id="day-type"><option value="default">Use school calendar</option><option value="regular" ${override.type === 'regular' ? 'selected' : ''}>Normal lessons</option><option value="special" ${override.type === 'special' ? 'selected' : ''}>Special timetable (unconfirmed)</option><option value="holiday" ${override.type === 'holiday' ? 'selected' : ''}>No school / cancelled</option></select></label>
        <fieldset><legend>Cycle letter</legend>${choiceGroup('cycle-type', [['default','Auto'], ...'ABCDEF'.split('').map(letter => [letter, letter])], override.cycle ?? 'default', 'Cycle letter', 'full no-mark')}</fieldset>
        <p class="footnote">The school’s published A–F letter takes priority unless you choose an override. S6 lessons always stop after 1 February.</p></section>
      <section class="export"><button class="button outlined" data-export>${icon('ios_share')}Export calendar (.ics)</button><small>Import into Apple or Google Calendar. Export again after changes; this file does not live sync.</small></section></aside></div></main>
    <footer>Built around your 6B timetable · Local data stays on this device</footer>
  </div>
  <button class="fab page-fab ${state.view === 'homework' ? 'extended' : ''}" data-compose aria-label="New homework">${icon('add')}<span>New homework</span></button>
</div>`;
}

app.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  // A form's submit click must reach its submit event before the DOM is rebuilt.
  if (button.type === 'submit' && button.closest('form')) return;
  if (button.dataset.date) state.date = button.dataset.date;
  if (button.dataset.view) state.view = button.dataset.view;
  if (button.dataset.shift) state.date = addDays(state.date, Number(button.dataset.shift));
  if (button.dataset.today !== undefined) state.date = today();
  const compose = button.dataset.compose !== undefined;
  if (compose) { state.view = 'homework'; state.editingId = null; state.prefillSubject = null; }
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
  if (button.dataset.export !== undefined) {
    const url = URL.createObjectURL(new Blob([calendarICS(state.homework, state.overrides, state.timeMode)], {type:'text/calendar;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'timing-s6-calendar.ics'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  persist(); render();
  if (button.dataset.newSubject || button.dataset.edit || compose) {
    app.querySelector('#homework-form')?.scrollIntoView({behavior:'smooth', block:'start'});
    if (compose) app.querySelector('#homework-form input[name="title"]')?.focus({preventScroll:true});
  } else if (button.dataset.view) {
    globalThis.scrollTo?.({top:0});
  }
});
app.addEventListener('change', event => {
  const control = event.target.id || event.target.name;
  if (control === 'homework-filter') { state.filter = event.target.value; render(); return; }
  if (control === 'homework-subject-filter') { state.subjectFilter = event.target.value; render(); return; }
  if (event.target.closest('#homework-form')) { updateDraftPreview(); return; }
  if (control === 'date-picker' && event.target.value) state.date = event.target.value;
  if (control === 'time-mode') state.timeMode = event.target.value;
  if (control === 'day-type') {
    if (event.target.value === 'default') {
      if (state.overrides[state.date]?.cycle) state.overrides[state.date] = {cycle: state.overrides[state.date].cycle};
      else delete state.overrides[state.date];
    } else state.overrides[state.date] = { ...state.overrides[state.date], type:event.target.value, label: event.target.value === 'regular' ? 'Normal lessons (manual override)' : event.target.value === 'holiday' ? 'No school (manual override)' : 'Special timetable · lessons need confirmation' };
  }
  if (control === 'cycle-type') {
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
  form.querySelector('#due-preview').innerHTML = dueCard(resolveHomework(draft, state.overrides));
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
// Keep the "now" lesson current without disturbing a form that is being filled in.
const clock = setInterval(() => {
  const active = globalThis.document?.activeElement;
  if (state.view !== 'homework' && !(active && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName))) render();
}, 60000);
clock?.unref?.();
if (globalThis.navigator && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
