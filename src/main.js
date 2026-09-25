import { addDays, dayInfo, lessonsOn, LAST_S6_DAY, periodTimes, resolveHomework, subjects } from './schedule.js';
import { homeworkStatus, homeworkSubjects, normalizeHomework, reminderDays, visibleHomework } from './homework.js';
import { calendarICS } from './calendar-export.js';
import { icon } from './icons.js';
import { cloudConfigured, currentAccount, googleSignIn, googleSignOut, nativeApp, syncAccount } from './cloud.js';
import { captureChanges, emptySnapshot, fromLegacy, materialize, mergeSnapshots, revisionClock } from './sync-data.js';
import { onWidgetOpen, refreshWidget, takeWidgetCompletions } from './native-widget.js';
import { completeFromWidget } from './widget-data.js';

const key = 'timing-s6-v1';
const views = ['today', 'calendar', 'homework', 'settings'];
const saved = (() => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } })();
const read = name => { try { return JSON.parse(localStorage.getItem(name)); } catch { return null; } };
const guestKey = `${key}:guest`;
const deviceKey = `${key}:device`;
const device = localStorage.getItem(deviceKey) || crypto.randomUUID();
localStorage.setItem(deviceKey, device);
let activeKey = guestKey;
let activeSnapshot = read(guestKey) || fromLegacy(saved, device);
localStorage.setItem(guestKey, JSON.stringify(activeSnapshot));
let account = null, syncBusy = false, syncNotice = cloudConfigured ? 'Saved on this device. Sign in to sync.' : 'Google sync needs a Firebase project configuration. Your data stays on this device.';
let syncError = false, syncing = false, revision = revisionClock(device, activeSnapshot);
const local = materialize(activeSnapshot);
const state = {
  date: new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Hong_Kong'}),
  homework: local.homework,
  overrides: local.overrides,
  timeMode: local.timeMode,
  view: views.includes(saved.view) ? saved.view : 'today',
  filter: 'open', subjectFilter: 'all', editingId: null, prefillSubject: null,
  composing: false, expanded: new Set()
};
const app = document.querySelector('#app');
if (nativeApp) document.documentElement.classList.add('native-app');
function showSyncStatus() {
  const panel = app.querySelector('.sync-indicator');
  if (panel) {
    panel.classList.toggle('error', syncError);
    panel.textContent = syncNotice;
  }
}
const currentData = () => ({homework:state.homework, overrides:state.overrides, timeMode:state.timeMode});
function persist() {
  const before = JSON.stringify(activeSnapshot);
  activeSnapshot = captureChanges(activeSnapshot, materialize(activeSnapshot), currentData(), revision);
  localStorage.setItem(activeKey, JSON.stringify(activeSnapshot));
  refreshWidget(state, today());
  if (account && before !== JSON.stringify(activeSnapshot)) void runSync();
}
function applySnapshot(snapshot) {
  activeSnapshot = snapshot;
  revision = revisionClock(device, snapshot);
  Object.assign(state, materialize(snapshot));
  localStorage.setItem(activeKey, JSON.stringify(snapshot));
  refreshWidget(state, today());
  // Do not erase an in-progress homework form while a background sync finishes.
  if (!document.activeElement?.closest('form')) render();
}
async function runSync() {
  if (syncing || !account) return;
  if (!navigator.onLine) { syncNotice = 'Offline. Changes are saved on this device and will sync when connected.'; showSyncStatus(); return; }
  syncing = true; syncError = false; syncNotice = 'Syncing…'; showSyncStatus();
  const uid = account.uid;
  try {
    do {
      const sent = activeSnapshot;
      const merged = await syncAccount(uid, sent);
      if (uid !== account?.uid) return;
      const latest = mergeSnapshots(activeSnapshot, merged);
      applySnapshot(latest);
      if (localStorage.getItem(guestKey)) {
        localStorage.removeItem(guestKey);
        localStorage.removeItem(key);
      }
      if (JSON.stringify(latest) === JSON.stringify(merged)) break;
    } while (account?.uid === uid);
    syncNotice = 'Synced with Google · ' + new Date().toLocaleTimeString('en-HK', {hour:'numeric', minute:'2-digit'});
  } catch (error) { syncError = true; syncNotice = `${error.message} Changes are saved on this device.`; }
  finally { syncing = false; showSyncStatus(); }
}
async function activateAccount(user) {
  if (!user?.uid) return;
  account = user;
  activeKey = `${key}:user:${user.uid}`;
  const cached = read(activeKey) || emptySnapshot();
  applySnapshot(mergeSnapshots(cached, read(guestKey) || emptySnapshot()));
  await runSync();
}
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const format = (date, options) => new Intl.DateTimeFormat('en-HK', {...options, timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
const readable = date => format(date, {weekday:'long', day:'numeric', month:'long', year:'numeric'});
const short = date => format(date, {weekday:'short', day:'numeric', month:'short'});
const labelSubject = code => subjects[code]?.[0] || code;
const today = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Hong_Kong'});
const minutes = time => { const [hours, mins] = time.split(':').map(Number); return hours * 60 + mins; };
const nowMinutes = () => minutes(new Intl.DateTimeFormat('en-GB', {hour:'2-digit', minute:'2-digit', hourCycle:'h23', timeZone:'Asia/Hong_Kong'}).format(new Date()));
const options = (list, selected) => list.map(([value, text]) => `<option value="${escapeHTML(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHTML(text)}</option>`).join('');
const subjectOptions = selected => options(homeworkSubjects.map(code => [code, labelSubject(code)]), selected);
const dueText = item => !item.due ? 'no confirmed lesson yet' : item.due.period
  ? `${short(item.due.date)} · P${item.due.period}` : `${short(item.due.date)} · 17:00`;
const statusLabels = {overdue:'Overdue', today:'Due today', upcoming:'Coming up', unconfirmed:'Unconfirmed', completed:'Completed'};
const dayNames = {regular:'Normal timetable', special:'Special timetable', exam:'Examinations', holiday:'No school', off:'No lessons', opening:'Opening ceremony', finished:'S6 finished', outside:'Before term'};

// Quiet segmented text toggle built from real radio inputs.
function toggle(name, list, selected, label) {
  return `<div class="toggle" role="radiogroup" aria-label="${escapeHTML(label)}">${list.map(([value, text]) =>
    `<label><input type="radio" name="${name}" value="${escapeHTML(value)}" ${String(value) === String(selected) ? 'checked' : ''}><span>${escapeHTML(text)}</span></label>`).join('')}</div>`;
}
const label = text => `<h2 class="label">${text}</h2>`;

/* ---------- Today ---------- */

function lessonList(date) {
  const lessons = lessonsOn(date, state.overrides);
  if (!lessons.length) return `<p class="quiet-line">No ordinary lessons.</p><p class="hint">Special and exam timetables can be entered when the school publishes them.</p>`;
  const live = date === today();
  const now = live ? nowMinutes() : -1;
  const rows = [];
  lessons.forEach((lesson, index) => {
    const [start, end] = periodTimes[state.timeMode][lesson.period - 1];
    const current = live && now >= minutes(start) && now < minutes(end);
    const past = live && now >= minutes(end);
    const due = state.homework.filter(h => { if (h.done) return false; const d = resolveHomework(h, state.overrides).due; return d?.date === date && d?.period === lesson.period; });
    const where = `${escapeHTML(lesson.room || 'TBC')} · ${escapeHTML(lesson.teacher)}`;
    const dueMark = due.length ? `<span class="due-mark">${due.length} due</span>` : '';
    const add = `<button class="add-inline" data-new-subject="${lesson.subject}" aria-label="Add ${escapeHTML(lesson.name)} homework" title="Add homework">${icon('add')}</button>`;
    if (current) {
      const progress = Math.round((now - minutes(start)) / (minutes(end) - minutes(start)) * 100);
      rows.push(`<li class="lesson now"><span class="time"><b>${start}</b>${end}</span><div class="lesson-body"><span class="now-tag">Now · ${minutes(end) - now} min left</span><strong>${escapeHTML(lesson.name)}</strong><span class="where">${where}</span>${dueMark}<span class="bar" role="progressbar" aria-label="Lesson progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><i style="width:${Math.max(progress, 3)}%"></i></span></div>${add}</li>`);
    } else {
      rows.push(`<li class="lesson ${past ? 'past' : ''}"><span class="time"><b>${start}</b>${end}</span><div class="lesson-body"><strong>${escapeHTML(lesson.name)}${dueMark}</strong><span class="where">${where}</span></div>${add}</li>`);
    }
    const next = lessons[index + 1];
    if (next) {
      const nextStart = periodTimes[state.timeMode][next.period - 1][0];
      if (minutes(nextStart) > minutes(end)) rows.push(`<li class="break"><span>${minutes(nextStart) - minutes(end) >= 45 ? 'Lunch' : 'Break'}</span><span class="mono">${end}–${nextStart}</span></li>`);
    }
  });
  return `<ol class="lessons">${rows.join('')}</ol>`;
}

function dueSoon() {
  const upcoming = visibleHomework(state.homework, state.overrides).slice(0, 3);
  const open = state.homework.filter(item => !item.done).length;
  const body = upcoming.length
    ? `<ul class="due-list">${upcoming.map(item => {
      const status = homeworkStatus(item, today());
      return `<li><button class="due-row" data-view="homework"><span class="dot ${status}"></span><span><strong>${escapeHTML(item.title)}</strong><small><span class="subject">${escapeHTML(labelSubject(item.subject))}</span> · <span class="mono">${escapeHTML(dueText(item))}</span>${status !== 'upcoming' ? ` · <em class="${status}">${statusLabels[status]}</em>` : ''}</small></span></button></li>`;
    }).join('')}</ul>`
    : `<p class="quiet-line small">Nothing to hand in.</p>`;
  return `<section class="block">
    <div class="block-head">${label('Homework')}<span class="head-actions"><button class="link" data-compose>+ Add</button>${open ? `<button class="link muted" data-view="homework">All ${open} →</button>` : ''}</span></div>
    ${body}</section>`;
}

function todayView() {
  const info = dayInfo(state.date, state.overrides);
  const lessons = lessonsOn(state.date, state.overrides);
  const lastEnd = lessons.length ? periodTimes[state.timeMode][lessons.at(-1).period - 1][1] : '';
  const isToday = state.date === today();
  const showNotice = info.label && info.label !== 'Normal timetable';
  const noticeTone = info.type === 'holiday' || info.type === 'finished' ? 'muted' : 'warn';
  return `<header class="hero">
      <div class="hero-row">
        <h1 class="display">${format(state.date, {weekday:'long'})}</h1>
        <div class="stepper"><button class="icon-btn" data-shift="-1" aria-label="Previous day">${icon('chevron_left')}</button><button class="icon-btn" data-shift="1" aria-label="Next day">${icon('chevron_right')}</button></div>
      </div>
      <p class="sub">${format(state.date, {day:'numeric', month:'long', year:'numeric'})}${isToday ? '' : ` · <button class="link" data-today>Back to today</button>`}</p>
      <p class="cycle">${info.cycle ? `<span class="cycle-letter">Day ${info.cycle}</span>` : `<span class="cycle-letter none">${dayNames[info.type] ?? 'No lessons'}</span>`}${lessons.length ? `<span class="cycle-meta">${lessons.length} lessons · until <span class="mono">${lastEnd}</span></span>` : ''}</p>
      ${showNotice ? `<p class="notice ${noticeTone}"><span>${escapeHTML(info.label)}</span><button class="link" data-view="settings">Adjust day</button></p>` : ''}
    </header>
    <section class="block">
      <div class="block-head">${label('Lessons')}<span class="head-note">${state.timeMode === 'winter' ? 'Winter' : 'Summer'} times</span></div>
      ${lessonList(state.date)}
    </section>
    ${dueSoon()}`;
}

/* ---------- Calendar ---------- */

function calendarView() {
  const [year, month] = state.date.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const now = today();
  const cells = Array.from({length:first}, () => '<span></span>');
  for (let n = 1; n <= days; n++) {
    const date = `${year}-${String(month).padStart(2,'0')}-${String(n).padStart(2,'0')}`;
    const info = dayInfo(date, state.overrides);
    const flag = info.type === 'regular' && /check/i.test(info.label);
    const selected = date === state.date;
    cells.push(`<button class="day ${info.type} ${selected ? 'selected' : ''} ${date === now ? 'is-today' : ''} ${flag ? 'flag' : ''}" data-pick="${date}" aria-label="${readable(date)}, ${info.cycle ? `Day ${info.cycle}` : escapeHTML(dayNames[info.type] ?? info.type)}" ${selected ? 'aria-pressed="true"' : ''}><span class="num">${n}</span><span class="letter">${info.cycle || ''}</span></button>`);
  }
  const monthName = format(`${year}-${String(month).padStart(2,'0')}-01`, {month:'long'});
  const info = dayInfo(state.date, state.overrides);
  const count = lessonsOn(state.date, state.overrides).length;
  return `<header class="hero">
      <div class="hero-row"><h1 class="display">${monthName} <span class="year">${year}</span></h1>
        <div class="stepper"><button class="icon-btn" data-step="-1" aria-label="Previous month">${icon('chevron_left')}</button><button class="icon-btn" data-step="1" aria-label="Next month">${icon('chevron_right')}</button></div></div>
    </header>
    <section class="block">
      <div class="month">${['S','M','T','W','T','F','S'].map(day => `<span class="wd" aria-hidden="true">${day}</span>`).join('')}${cells.join('')}</div>
      <p class="legend"><span><b class="mono">A–F</b> cycle day</span><span><i class="sw special"></i> special / exams</span><span><i class="sw flag"></i> check changes</span></p>
    </section>
    <section class="block picked">
      <p class="picked-date">${format(state.date, {weekday:'long', day:'numeric', month:'long'})}</p>
      <p class="picked-info">${info.cycle ? `<span class="cycle-letter small">Day ${info.cycle}</span> · ` : ''}${count ? `${count} lessons` : escapeHTML(dayNames[info.type] ?? 'No lessons')}${info.label && info.label !== 'Normal timetable' ? `<br><span class="note">${escapeHTML(info.label)}</span>` : ''}</p>
      <button class="button" data-view="today">Open day →</button>
    </section>`;
}

/* ---------- Homework ---------- */

function duePreview(item) {
  if (!item.due) return `<span class="warn">No confirmed lesson before S6 ends.</span>`;
  const when = format(item.due.date, {weekday:'long', day:'numeric', month:'short'});
  return item.due.period
    ? `Due <strong>${when}</strong> · <span class="mono">Day ${escapeHTML(item.due.cycle)} · P${item.due.period}</span><br><small>${item.dueMode === 'date' ? 'The date stays fixed; the period follows the first subject lesson that day.' : 'Moves automatically if that school day changes.'}</small>`
    : `Due <strong>${when}</strong> · <span class="mono">17:00</span><br><small>Fixed date, not tied to a lesson.</small>`;
}

function homeworkItem(item) {
  const status = homeworkStatus(item, today());
  const steps = Array.isArray(item.steps) ? item.steps : [];
  const finished = steps.filter(step => step.done).length;
  const summary = [steps.length ? `${finished}/${steps.length} steps` : 'Steps', item.notes ? 'notes' : ''].filter(Boolean).join(' · ');
  const id = escapeHTML(item.id);
  return `<li class="task ${item.done ? 'done' : ''}">
    <button class="check" data-toggle="${id}" aria-label="${item.done ? 'Mark incomplete' : 'Mark complete'}" aria-pressed="${item.done}">${item.done ? icon('check') : ''}</button>
    <div class="task-body">
      <strong>${escapeHTML(item.title)}</strong>
      <small><span class="subject">${escapeHTML(labelSubject(item.subject))}</span> · <span class="mono">${escapeHTML(dueText(item))}</span>${status !== 'upcoming' && status !== 'completed' ? ` · <em class="${status}">${statusLabels[status]}</em>` : ''}</small>
      <details class="more" data-id="${id}" ${state.expanded.has(item.id) ? 'open' : ''}><summary>${summary}</summary>
        ${item.notes ? `<p class="notes">${escapeHTML(item.notes)}</p>` : ''}
        ${steps.length ? `<ul class="steps">${steps.map(step => `<li><button class="step-check ${step.done ? 'on' : ''}" data-step-toggle="${id}" data-step-id="${escapeHTML(step.id)}" aria-label="${step.done ? 'Reopen' : 'Complete'} step">${icon(step.done ? 'check_box' : 'check_box_outline_blank')}</button><span class="${step.done ? 'done' : ''}">${escapeHTML(step.title)}</span><button class="icon-btn tiny" data-step-remove="${id}" data-step-id="${escapeHTML(step.id)}" aria-label="Remove step">${icon('close')}</button></li>`).join('')}</ul>` : ''}
        <form class="step-form" data-task-id="${id}"><input name="step" maxlength="100" placeholder="Add a smaller step…" aria-label="New homework step" required><button class="link" type="submit">Add</button></form>
        <div class="task-actions"><button class="link" data-edit="${id}">Edit</button><button class="link danger" data-remove="${id}">Delete</button></div>
      </details>
    </div>
  </li>`;
}

function groupedHomework(items) {
  const groups = [];
  for (const item of items) {
    const status = homeworkStatus(item, today());
    if (groups.at(-1)?.status !== status) groups.push({status, items: []});
    groups.at(-1).items.push(item);
  }
  return groups.map(group => `<h3 class="label ${group.status}">${statusLabels[group.status]}</h3><ul class="tasks">${group.items.map(homeworkItem).join('')}</ul>`).join('');
}

function homeworkView() {
  const editing = state.homework.find(item => item.id === state.editingId);
  const draft = editing ?? {subject: state.prefillSubject ?? 'ECON', afterDate: state.date > LAST_S6_DAY ? LAST_S6_DAY : state.date, dueMode:'nextLesson', dueDate:'', reminderDays:1, title:'', notes:''};
  const preview = resolveHomework(draft, state.overrides);
  const items = visibleHomework(state.homework, state.overrides, state.filter, state.subjectFilter);
  const open = state.homework.filter(item => !item.done).length;
  const composerOpen = state.composing || Boolean(editing);
  return `<header class="hero">
      <h1 class="display">Homework</h1>
      <p class="sub">${open ? `<strong class="count">${open}</strong> open` : 'All caught up'} · due dates follow your lessons</p>
    </header>
    <section class="block" id="homework-section">
      <details class="composer" ${composerOpen ? 'open' : ''}><summary class="button">${editing ? 'Editing homework' : '+ Add homework'}</summary>
      <form id="homework-form" class="form"><h2 class="sr-only">${editing ? 'Edit homework' : 'Add homework'}</h2>
        <input class="title-input" name="title" maxlength="160" value="${escapeHTML(draft.title)}" placeholder="What to hand in" aria-label="What to hand in" required>
        <div class="row2">
          <label class="field"><span>Subject</span><select name="subject">${subjectOptions(draft.subject)}</select></label>
          <label class="field"><span>Set on</span><input type="date" name="afterDate" value="${escapeHTML(draft.afterDate)}" min="2026-09-01" max="${LAST_S6_DAY}" required></label>
        </div>
        <div class="field"><span>Due</span>${toggle('dueMode', [['nextLesson','Next lesson'],['date','Specific date']], draft.dueMode === 'date' ? 'date' : 'nextLesson', 'Due rule')}</div>
        <label class="field" id="manual-date-field" ${draft.dueMode !== 'date' ? 'hidden' : ''}><span>Due date</span><input type="date" name="dueDate" value="${escapeHTML(draft.dueDate || draft.afterDate)}" min="${escapeHTML(draft.afterDate)}"></label>
        <p id="due-preview" class="due-preview" role="status">${duePreview(preview)}</p>
        <details class="extra" ${draft.notes || Number(draft.reminderDays ?? 1) !== 1 ? 'open' : ''}><summary>Reminder &amp; notes</summary>
          <label class="field"><span>Calendar reminder</span><select name="reminderDays">${options(reminderDays.map(days => [days, days === 0 ? 'At due time' : `${days} day${days === 1 ? '' : 's'} before`]), Number(draft.reminderDays ?? 1))}</select></label>
          <label class="field"><span>Notes</span><textarea name="notes" rows="3" maxlength="1000" placeholder="Page numbers, instructions, link…">${escapeHTML(draft.notes)}</textarea></label>
        </details>
        <p class="form-error" id="form-error" role="alert" hidden></p>
        <div class="form-actions"><button class="button primary" type="submit">${editing ? 'Save changes' : 'Add homework'}</button><button class="link muted" type="button" data-cancel-edit>Cancel</button></div>
      </form></details>
    </section>
    <section class="block">
      <div class="filters">${toggle('homework-filter', [['open','Open'],['completed','Done'],['all','All']], state.filter, 'Show homework')}
        <select id="homework-subject-filter" class="plain-select" aria-label="Filter by subject">${options([['all','All subjects'], ...homeworkSubjects.map(code => [code, labelSubject(code)])], state.subjectFilter)}</select></div>
      <div class="homework-list">${items.length ? groupedHomework(items) : `<p class="quiet-line small">${state.homework.length ? 'Nothing matches these filters.' : 'Nothing here yet.'}</p>`}</div>
    </section>`;
}

/* ---------- Settings (the deeper layer) ---------- */

function syncSection() {
  return `<section class="block setting">${label('Sync')}
      <p class="hint" role="status">${escapeHTML(syncNotice)}</p>
      ${account ? `<p class="setting-date">${escapeHTML(account.email || account.displayName || 'Google account')}</p><button class="link muted" data-sync="signout">Sign out</button>` : `<button class="button" data-sync="signin" ${syncBusy ? 'disabled' : ''}>Sign in with Google</button>`}
      <p class="hint">Homework and timetable changes are saved here and synchronized when your Google account is connected.</p></section>`;
}

function settingsView() {
  const override = state.overrides[state.date] ?? {};
  const info = dayInfo(state.date, state.overrides);
  return `<header class="hero"><h1 class="display">Settings</h1><p class="sub">Class 6B · ${account ? 'synced with your Google account' : 'data stays on this device'}</p></header>
    ${syncSection()}
    <section class="block setting">
      ${label('Lesson times')}
      ${toggle('time-mode', [['summer','Summer'],['winter','Winter']], state.timeMode, 'Lesson times')}
      <p class="hint">The school has not published the changeover date, so switch manually.</p>
    </section>
    <section class="block setting">
      ${label('Adjust a day')}
      <p class="setting-date">${format(state.date, {weekday:'long', day:'numeric', month:'long'})}<span class="mono">${info.cycle ? ` · Day ${info.cycle}` : ''}</span></p>
      <p class="hint">Pick another date from Today or Calendar. Homework deadlines recalculate immediately.</p>
      <div class="row2">
        <label class="field"><span>Status</span><select id="day-type">${options([['default','School calendar'],['regular','Normal lessons'],['special','Special timetable'],['holiday','No school / cancelled']], override.type ?? 'default')}</select></label>
        <label class="field"><span>Cycle letter</span><select id="cycle-type">${options([['default','Auto'], ...'ABCDEF'.split('').map(letter => [letter, `Day ${letter}`])], override.cycle ?? 'default')}</select></label>
      </div>
      <p class="hint">The school’s published letter wins unless you override it. S6 lessons stop after 1 February.</p>
    </section>
    <section class="block setting">
      ${label('Calendar export')}
      <button class="button" data-export>${icon('ios_share')}Export .ics</button>
      <p class="hint">Import into Apple or Google Calendar, including homework reminders. It does not live-sync — export again after changes.</p>
    </section>
    <section class="block setting">
      ${label('About')}
      <p class="hint">Timing follows the printed A–F letters from the school calendar. Verify exceptions with the school before relying on them for critical deadlines. This version does not send background notifications.</p>
    </section>`;
}

/* ---------- Shell ---------- */

function render() {
  const open = state.homework.filter(item => !item.done).length;
  const tab = (view, text) => `<button class="tab ${state.view === view ? 'active' : ''}" data-view="${view}" ${state.view === view ? 'aria-current="page"' : ''}>${text}${view === 'homework' && open ? `<sup>${open}</sup>` : ''}</button>`;
  const body = {today: todayView, calendar: calendarView, homework: homeworkView, settings: settingsView}[state.view]();
  app.innerHTML = `<div class="shell view-${state.view}">
  <nav class="top" aria-label="Main">
    <button class="brand" data-view="today" aria-label="Timing, go to Today"><img src="./icon.svg" alt="" width="26" height="26"><span>timing</span></button>
    <div class="tabs">${tab('today', 'Today')}${tab('calendar', 'Calendar')}${tab('homework', 'Homework')}</div>
    <button class="icon-btn settings-btn ${state.view === 'settings' ? 'active' : ''}" data-view="settings" aria-label="Settings" ${state.view === 'settings' ? 'aria-current="page"' : ''}>${icon('tune')}</button>
  </nav>
  <p class="sync-indicator ${syncError ? 'error' : ''}" role="status">${escapeHTML(syncNotice)}</p>
  <main>${body}</main>
</div>`;
}

app.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  // A form's submit click must reach its submit event before the DOM is rebuilt.
  if (button.type === 'submit' && button.closest('form')) return;
  const viewBefore = state.view;
  if (button.dataset.pick) state.date = button.dataset.pick;
  if (button.dataset.view) state.view = button.dataset.view;
  if (button.dataset.shift) state.date = addDays(state.date, Number(button.dataset.shift));
  if (button.dataset.today !== undefined) state.date = today();
  const compose = button.dataset.compose !== undefined;
  if (compose) { state.view = 'homework'; state.editingId = null; state.prefillSubject = null; state.composing = true; }
  if (button.dataset.newSubject) {
    state.prefillSubject = button.dataset.newSubject;
    state.editingId = null;
    state.composing = true;
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
  if (button.dataset.edit) { state.editingId = button.dataset.edit; state.composing = true; state.view = 'homework'; }
  if (button.dataset.cancelEdit !== undefined) { state.editingId = null; state.prefillSubject = null; state.composing = false; }
  if (button.dataset.remove && confirm('Remove this homework?')) {
    state.homework = state.homework.filter(h => h.id !== button.dataset.remove);
    if (state.editingId === button.dataset.remove) state.editingId = null;
  }
  if (button.dataset.sync === 'signin') { void signIn(); return; }
  if (button.dataset.sync === 'signout') { void signOut(); return; }
  if (button.dataset.export !== undefined) {
    const url = URL.createObjectURL(new Blob([calendarICS(state.homework, state.overrides, state.timeMode)], {type:'text/calendar;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'timing-s6-calendar.ics'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (state.view !== 'homework' && viewBefore === 'homework' && !state.editingId) state.composing = false;
  persist(); render();
  if (button.dataset.newSubject || button.dataset.edit || compose) {
    app.querySelector('#homework-form')?.scrollIntoView({behavior:'smooth', block:'start'});
    app.querySelector('#homework-form input[name="title"]')?.focus({preventScroll:true});
  } else if (button.dataset.view && state.view !== viewBefore) {
    globalThis.scrollTo?.({top:0});
  }
});
// Remember which <details> panels are open so a re-render does not collapse them.
app.addEventListener('toggle', event => {
  const panel = event.target;
  if (panel.matches?.('.composer')) state.composing = panel.open;
  if (panel.matches?.('.more')) panel.open ? state.expanded.add(panel.dataset.id) : state.expanded.delete(panel.dataset.id);
}, true);
async function signIn() {
  if (syncBusy) return;
  syncBusy = true; syncError = false; render();
  try {
    const user = await googleSignIn();
    if (!user) throw new Error('Google sign-in did not return an account.');
    await activateAccount(user);
  } catch (error) { syncError = true; syncNotice = error.message; }
  finally { syncBusy = false; render(); }
}
async function signOut() {
  try {
    await googleSignOut();
    account = null;
    activeKey = guestKey;
    applySnapshot(read(guestKey) || emptySnapshot());
    syncError = false; syncNotice = 'Signed out. New changes will stay on this device.';
  } catch (error) { syncError = true; syncNotice = error.message; }
  render();
}
app.addEventListener('change', event => {
  const control = event.target.id || event.target.name;
  if (control === 'homework-filter') { state.filter = event.target.value; render(); return; }
  if (control === 'homework-subject-filter') { state.subjectFilter = event.target.value; render(); return; }
  if (event.target.closest('#homework-form')) { updateDraftPreview(); return; }
  // Only settings controls re-render; typing in a step field must not replace its form mid-submit.
  if (!['time-mode', 'day-type', 'cycle-type'].includes(control)) return;
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
  form.querySelector('#due-preview').innerHTML = duePreview(resolveHomework(draft, state.overrides));
}
app.addEventListener('submit', event => {
  if (event.target.matches('.step-form')) {
    event.preventDefault();
    const task = state.homework.find(h => h.id === event.target.dataset.taskId);
    const title = String(new FormData(event.target).get('step') ?? '').trim();
    if (task && title) {
      if (!Array.isArray(task.steps)) task.steps = [];
      task.steps.push({id:crypto.randomUUID(), title:title.slice(0, 100), done:false});
      state.expanded.add(task.id);
      persist(); render();
      app.querySelector(`.step-form[data-task-id="${task.id}"] input`)?.focus();
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
    state.composing = false;
    persist(); render();
  } catch (error) {
    const message = app.querySelector('#form-error');
    message.textContent = error.message;
    message.hidden = false;
  }
});
render();
refreshWidget(state, today());
// Collect homework completed from a widget, then republish the snapshot.
async function collectWidgetCompletions() {
  const ids = await takeWidgetCompletions();
  if (completeFromWidget(state.homework, ids)) { persist(); render(); }
  else refreshWidget(state, today());
}
void collectWidgetCompletions();
document.addEventListener?.('visibilitychange', () => { if (document.visibilityState === 'visible') void collectWidgetCompletions(); });
onWidgetOpen(target => {
  state.view = target.view;
  if (target.compose) { state.editingId = null; state.prefillSubject = null; state.composing = true; }
  if (target.id) { state.filter = 'open'; state.subjectFilter = 'all'; state.expanded.add(target.id); }
  render();
  if (target.id) app.querySelector(`[data-id="${CSS.escape(target.id)}"]`)?.scrollIntoView({block:'center'});
  if (target.compose) app.querySelector('#homework-form input[name="title"]')?.focus();
});
// Keep the "now" lesson current without disturbing a form that is being filled in.
const clock = setInterval(() => {
  const active = globalThis.document?.activeElement;
  if (state.view === 'today' && !(active && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName))) render();
}, 60000);
clock?.unref?.();

/* ---------- Sync ---------- */

if (cloudConfigured) {
  void currentAccount().then(user => user && activateAccount(user)).catch(error => {
    syncError = true; syncNotice = `${error.message} Local data is available.`; render();
  });
  window.addEventListener('online', () => { if (account) void runSync(); });
  window.addEventListener('focus', () => { if (account) void runSync(); });
  setInterval(() => { if (account && document.visibilityState === 'visible') void runSync(); }, 30_000);
}
if (globalThis.navigator && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
