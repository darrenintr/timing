import { addDays, dayInfo, lessonsOn, LAST_S6_DAY, periodTimes, resolveHomework, subjects } from './schedule.js';
import { homeworkStatus, homeworkSubjects, normalizeHomework, reminderDays, visibleHomework } from './homework.js';
import { calendarICS } from './calendar-export.js';
import { icon } from './icons.js';
import { cloudConfigured, currentAccount, googleSignIn, googleSignOut, nativeApp, syncAccount } from './cloud.js';
import { captureChanges, emptySnapshot, fromLegacy, materialize, mergeSnapshots, revisionClock } from './sync-data.js';
import { completeFromWidget, widgetData } from './widget-data.js';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { onWidgetOpen, refreshWidget, takeWidgetCompletions } from './native-widget.js';
import { createBackup, mergeBackup, parseBackup } from './backup.js';

const key = 'timing-s6-v1';
const views = ['today', 'calendar', 'homework', 'settings'];
let storageWarning = '';
let storageAvailable = true;
let recoveredRaw = null;
const memory = new Map();
const storage = {
  getItem(name) {
    if (memory.has(name)) return memory.get(name);
    try { return localStorage.getItem(name); }
    catch { storageAvailable = false; storageWarning = 'Device storage is unavailable. Changes may be lost when this window closes; export a backup.'; return null; }
  },
  setItem(name, value) {
    memory.set(name, value);
    try { localStorage.setItem(name, value); return true; }
    catch { storageAvailable = false; storageWarning = 'Device storage is full or unavailable. Changes may be lost when this window closes; export a backup.'; return false; }
  },
  removeItem(name) {
    memory.delete(name);
    try { localStorage.removeItem(name); }
    catch { storageAvailable = false; storageWarning = 'Device storage is unavailable. Changes may be lost when this window closes; export a backup.'; }
  }
};
const read = name => {
  const raw = storage.getItem(name);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (name !== key && (!value || value.version !== 1 ||
        !value.homework || typeof value.homework !== 'object' || Array.isArray(value.homework) ||
        !value.overrides || typeof value.overrides !== 'object' || Array.isArray(value.overrides))) {
      throw new Error('Invalid saved snapshot');
    }
    return value;
  }
  catch {
    const recovery = `${name}:unreadable:${Date.now()}`;
    recoveredRaw = raw;
    if (storage.setItem(recovery, raw)) storage.removeItem(name);
    storageWarning = 'Unreadable saved data was found. Download the recovery copy in Settings before making more changes.';
    return null;
  }
};
const saved = read(key) || {};
const guestKey = `${key}:guest`;
const deviceKey = `${key}:device`;
const accountKey = `${key}:account`;
const userKey = uid => `${key}:user:${uid}`;
const device = storage.getItem(deviceKey) || crypto.randomUUID();
storage.setItem(deviceKey, device);
// A signed-in device opens on that account's offline copy, not an empty guest copy,
// so the first render, the widget snapshot and widget check-offs use the right data.
const rememberedUid = cloudConfigured ? storage.getItem(accountKey) : null;
let activeKey = rememberedUid ? userKey(rememberedUid) : guestKey;
let activeSnapshot = rememberedUid ? read(activeKey) || emptySnapshot() : read(guestKey) || fromLegacy(saved, device);
storage.setItem(activeKey, JSON.stringify(activeSnapshot));
let account = null, syncBusy = false, syncNotice = cloudConfigured ? 'Saved on this device. Sign in to sync.' : 'Google sync needs a Firebase project configuration. Your data stays on this device.';
let syncError = false, syncing = false, revision = revisionClock(device, activeSnapshot);
let backupNotice = '', updateReady = false;
const local = materialize(activeSnapshot);
const state = {
  date: new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Hong_Kong'}),
  homework: local.homework,
  overrides: local.overrides,
  timeMode: local.timeMode,
  view: views.includes(hashView()) ? hashView() : views.includes(saved.view) ? saved.view : 'today',
  filter: 'open', subjectFilter: 'all', editingId: null, prefillSubject: null,
  composing: false, expanded: new Set(), draft: null, homeworkOverlay: false
};
function hashView() {
  const hash = globalThis.location?.hash?.slice(1);
  return views.includes(hash) ? hash : null;
}
let followToday = true;
const app = document.querySelector('#app');
if (nativeApp) document.documentElement.classList.add('native-app');

/* ---------- Motion ----------
   The whole view is redrawn from a string, so motion is one-shot: an action names the
   transition it wants, the next render plays it, and later redraws (clock, sync) stay still. */
let motion = 'boot';
let flash = null;
let lastOpenCount = null;
const animated = () => !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
const direction = (from, to) => to > from ? 'next' : 'prev';
const mondayOf = date => addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
function viewMotion(view) { motion = views.indexOf(view) > views.indexOf(state.view) ? 'forward' : 'back'; }
function dayMotion(from, to) {
  if (from === to) return;
  motion = `day-${direction(from, to)}`;
  if (mondayOf(from) !== mondayOf(to)) motion += ' week-change';
}
// Selection pills (tab, week day, calendar day) glide from where they were to where they are.
function measureFlip() {
  if (!app.querySelectorAll || !animated()) return null;
  return new Map([...app.querySelectorAll('[data-flip]')].map(element => [element.dataset.flip, element.getBoundingClientRect()]));
}
function playFlip(before) {
  if (!before?.size) return;
  for (const element of app.querySelectorAll('[data-flip]')) {
    const from = before.get(element.dataset.flip);
    if (!from || !element.animate) continue;
    const to = element.getBoundingClientRect();
    const dx = from.left - to.left, dy = from.top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(from.width - to.width) < 1) continue;
    element.animate([
      {transform:`translate(${dx}px,${dy}px)`, width:`${from.width}px`, height:`${from.height}px`},
      {transform:'none', width:`${to.width}px`, height:`${to.height}px`}
    ], {duration:420, easing:'cubic-bezier(.34,1.32,.5,1)'});
  }
}
// Play an exit on rows that are about to leave the list, then commit the change.
function leave(element, className, commit, duration = 260) {
  if (!element?.classList || !animated()) { commit(); return; }
  element.classList.add(className);
  setTimeout(commit, duration);
}
function nudge(element, keyframes, options) {
  if (element?.animate && animated()) element.animate(keyframes, options);
}

/* ---------- History ----------
   Each tab is a #hash, so the browser and Android back button return to Today
   (or close the homework sheet) instead of leaving the app. */
function navigate(view) {
  if (view === state.view) return false;
  viewMotion(view);
  const history = globalThis.history;
  if (history?.pushState) {
    if (state.view === 'today') history.pushState({view, fromToday:true}, '', `#${view}`);
    else if (view === 'today' && history.state?.fromToday) history.back();
    else history.replaceState({view, fromToday:history.state?.fromToday}, '', `#${view}`);
  }
  state.view = view;
  return true;
}
const recordView = () => globalThis.history?.replaceState?.({view:state.view}, '', `#${state.view}`);
function feedback(kind = 'tap') {
  if (nativeApp) {
    const pulse = kind === 'success' ? Haptics.notification({type:NotificationType.Success})
      : kind === 'selection' ? Haptics.selectionChanged()
      : Haptics.impact({style:ImpactStyle.Light});
    void pulse.catch(() => {});
  } else if (kind !== 'selection') globalThis.navigator?.vibrate?.(kind === 'success' ? 18 : 8);
}
function showSyncStatus() {
  const panel = app.querySelector('.sync-indicator');
  if (panel && panel.textContent !== syncNotice) {
    panel.classList.toggle('error', syncError);
    panel.textContent = syncNotice;
    nudge(panel, [{opacity:0, transform:'translateY(-3px)'}, {opacity:1, transform:'none'}], {duration:240, easing:'ease-out'});
  } else panel?.classList.toggle('error', syncError);
  const warning = app.querySelector('.storage-indicator');
  if (warning) { warning.textContent = storageWarning; warning.hidden = !storageWarning; }
}
const currentData = () => ({homework:state.homework, overrides:state.overrides, timeMode:state.timeMode});
function persist() {
  const before = JSON.stringify(activeSnapshot);
  activeSnapshot = captureChanges(activeSnapshot, materialize(activeSnapshot), currentData(), revision);
  storage.setItem(activeKey, JSON.stringify(activeSnapshot));
  showSyncStatus();
  refreshWidget(state, today());
  if (account && before !== JSON.stringify(activeSnapshot)) void runSync();
}
function applySnapshot(snapshot) {
  activeSnapshot = snapshot;
  revision = revisionClock(device, snapshot);
  Object.assign(state, materialize(snapshot));
  storage.setItem(activeKey, JSON.stringify(snapshot));
  showSyncStatus();
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
      if (storage.getItem(guestKey)) {
        storage.removeItem(guestKey);
        storage.removeItem(key);
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
  activeKey = userKey(user.uid);
  storage.setItem(accountKey, user.uid);
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
      rows.push(`<li class="lesson now" style="--i:${rows.length}"><span class="time"><b>${start}</b>${end}</span><div class="lesson-body"><span class="now-tag"><i class="live" aria-hidden="true"></i>Now · ${minutes(end) - now} min left</span><strong>${escapeHTML(lesson.name)}</strong><span class="where">${where}</span>${dueMark}<span class="bar" role="progressbar" aria-label="Lesson progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><i style="width:${Math.max(progress, 3)}%"></i></span></div>${add}</li>`);
    } else {
      rows.push(`<li class="lesson ${past ? 'past' : ''}" style="--i:${rows.length}"><span class="time"><b>${start}</b>${end}</span><div class="lesson-body"><strong>${escapeHTML(lesson.name)}${dueMark}</strong><span class="where">${where}</span></div>${add}</li>`);
    }
    const next = lessons[index + 1];
    if (next) {
      const nextStart = periodTimes[state.timeMode][next.period - 1][0];
      if (minutes(nextStart) > minutes(end)) rows.push(`<li class="break" style="--i:${rows.length}"><span>${minutes(nextStart) - minutes(end) >= 45 ? 'Lunch' : 'Break'}</span><span class="mono">${end}–${nextStart}</span></li>`);
    }
  });
  return `<ol class="lessons">${rows.join('')}</ol>`;
}

function dueSoon() {
  const upcoming = visibleHomework(state.homework, state.overrides).slice(0, 3);
  const open = state.homework.filter(item => !item.done).length;
  const body = upcoming.length
    ? `<ul class="due-list">${upcoming.map((item, index) => {
      const status = homeworkStatus(item, today());
      return `<li style="--i:${index}"><button class="due-row" data-view="homework"><span class="dot ${status}"></span><span><strong>${escapeHTML(item.title)}</strong><small><span class="subject">${escapeHTML(labelSubject(item.subject))}</span> · <span class="mono">${escapeHTML(dueText(item))}</span>${status !== 'upcoming' ? ` · <em class="${status}">${statusLabels[status]}</em>` : ''}</small></span></button></li>`;
    }).join('')}</ul>`
    : `<p class="quiet-line small">Nothing to hand in.</p>`;
  return `<section class="block">
    <div class="block-head">${label('Homework')}<span class="head-actions"><button class="link" data-compose>+ Add</button>${open ? `<button class="link muted" data-view="homework">All ${open} →</button>` : ''}</span></div>
    ${body}</section>`;
}

// The school week around the chosen day: one tap to any day, letters at a glance.
function weekStrip() {
  const monday = mondayOf(state.date);
  const now = today();
  const days = Array.from({length:7}, (_, index) => addDays(monday, index)).map((date, index) => {
    const info = dayInfo(date, state.overrides);
    const selected = date === state.date;
    return `<button class="wk-day ${info.type} ${selected ? 'selected' : ''} ${date === now ? 'is-today' : ''}" style="--i:${index}" data-pick="${date}" aria-label="${readable(date)}, ${info.cycle ? `Day ${info.cycle}` : escapeHTML(dayNames[info.type] ?? info.type)}" ${selected ? 'aria-pressed="true"' : ''}>${selected ? `<i class="wk-pill" data-flip="wk-pill-${monday}"></i>` : ''}<span class="wk-name">${format(date, {weekday:'narrow'})}</span><span class="wk-num">${Number(date.slice(8))}</span><span class="wk-letter">${info.cycle || (info.type === 'holiday' || info.type === 'off' ? '·' : '')}</span></button>`;
  });
  return `<nav class="week" aria-label="Week of ${format(monday, {day:'numeric', month:'long'})}">${days.join('')}</nav>`;
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
      ${weekStrip()}
      <p class="cycle">${info.cycle ? `<span class="cycle-letter">Day ${info.cycle}</span>` : `<span class="cycle-letter none">${dayNames[info.type] ?? 'No lessons'}</span>`}${lessons.length ? `<span class="cycle-meta">${lessons.length} lessons · until <span class="mono">${lastEnd}</span></span>` : ''}</p>
      ${showNotice ? `<p class="notice ${noticeTone}"><span>${escapeHTML(info.label)}</span><button class="link" data-view="settings">Adjust day</button></p>` : ''}
    </header>
    <section class="block day-swipe" aria-label="Lessons, swipe left or right to change day">
      <div class="block-head">${label('Lessons')}<span class="head-note">${state.timeMode === 'winter' ? 'Winter' : 'Summer'} times</span></div>
      ${lessonList(state.date)}
    </section>
    ${dueSoon()}`;
}

/* ---------- Calendar ---------- */

function changeMonth(direction) {
  const [year, month, day] = state.date.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + direction, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  state.date = `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  motion = `month-${direction > 0 ? 'next' : 'prev'}`;
  followToday = state.date === today();
  feedback('selection');
  persist(); render();
}

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
    cells.push(`<button class="day ${info.type} ${selected ? 'selected' : ''} ${date === now ? 'is-today' : ''} ${flag ? 'flag' : ''}" style="--i:${first + n}" data-pick="${date}" aria-label="${readable(date)}, ${info.cycle ? `Day ${info.cycle}` : escapeHTML(dayNames[info.type] ?? info.type)}" ${selected ? 'aria-pressed="true"' : ''}>${selected ? `<i class="day-pill" data-flip="day-pill-${year}-${month}"></i>` : ''}<span class="num">${n}</span><span class="letter">${info.cycle || ''}</span></button>`);
  }
  const monthName = format(`${year}-${String(month).padStart(2,'0')}-01`, {month:'long'});
  const info = dayInfo(state.date, state.overrides);
  const count = lessonsOn(state.date, state.overrides).length;
  return `<header class="hero">
      <div class="hero-row"><h1 class="display">${monthName} <span class="year">${year}</span></h1>
        <div class="stepper"><button class="icon-btn" data-step="-1" aria-label="Previous month">${icon('chevron_left')}</button><button class="icon-btn" data-step="1" aria-label="Next month">${icon('chevron_right')}</button></div></div>
      ${state.date === now ? '' : `<p class="sub">${format(state.date, {day:'numeric', month:'short'})} selected · <button class="link" data-today>Back to today</button></p>`}
    </header>
    <section class="block calendar-swipe" aria-label="Calendar, swipe left or right to change month">
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

function homeworkItem(item, index = 0) {
  const status = homeworkStatus(item, today());
  const steps = Array.isArray(item.steps) ? item.steps : [];
  const finished = steps.filter(step => step.done).length;
  const summary = [steps.length ? `${finished}/${steps.length} steps` : 'Steps', item.notes ? 'notes' : ''].filter(Boolean).join(' · ');
  const id = escapeHTML(item.id);
  const flashed = flash?.task === item.id ? flash.kind : '';
  return `<li class="task ${item.done ? 'done' : ''} ${flashed}" style="--i:${index}" data-task="${id}">
    <button class="check" data-toggle="${id}" aria-label="${item.done ? 'Mark incomplete' : 'Mark complete'}" aria-pressed="${item.done}">${item.done ? icon('check') : ''}</button>
    <div class="task-body">
      <strong>${escapeHTML(item.title)}</strong>
      <small><span class="subject">${escapeHTML(labelSubject(item.subject))}</span> · <span class="mono">${escapeHTML(dueText(item))}</span>${status !== 'upcoming' && status !== 'completed' ? ` · <em class="${status}">${statusLabels[status]}</em>` : ''}</small>
      <details class="more" data-id="${id}" ${state.expanded.has(item.id) ? 'open' : ''}><summary>${summary}</summary>
        ${item.notes ? `<p class="notes">${escapeHTML(item.notes)}</p>` : ''}
        ${steps.length ? `<ul class="steps">${steps.map(step => `<li class="${flash?.step === step.id ? flash.kind : ''}"><button class="step-check ${step.done ? 'on' : ''}" data-step-toggle="${id}" data-step-id="${escapeHTML(step.id)}" aria-label="${step.done ? 'Reopen' : 'Complete'} step">${icon(step.done ? 'check_box' : 'check_box_outline_blank')}</button><span class="${step.done ? 'done' : ''}">${escapeHTML(step.title)}</span><button class="icon-btn tiny" data-step-remove="${id}" data-step-id="${escapeHTML(step.id)}" aria-label="Remove step">${icon('close')}</button></li>`).join('')}</ul>` : ''}
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
  return groups.map(group => `<h3 class="label ${group.status}">${statusLabels[group.status]}</h3><ul class="tasks">${group.items.map((item, index) => homeworkItem(item, index)).join('')}</ul>`).join('');
}

function homeworkView() {
  const editing = state.homework.find(item => item.id === state.editingId);
  const base = editing ?? {subject: state.prefillSubject ?? 'ECON', afterDate: state.date > LAST_S6_DAY ? LAST_S6_DAY : state.date, dueMode:'nextLesson', dueDate:'', reminderDays:1, title:'', notes:''};
  // What was typed survives a background sync or clock redraw.
  const draft = state.draft?.editingId === state.editingId ? {...base, ...state.draft.values} : base;
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
      ${label('Data backup')}
      <p class="hint">Save your homework and timetable changes as a JSON file. Import merges a backup with the data on this device; matching homework from the backup wins.</p>
      <div class="backup-actions"><button class="button" data-backup="export">Export backup</button><button class="button" data-backup="import">Import backup</button></div>
      ${recoveredRaw ? '<button class="link" data-backup="recovery">Download unreadable data</button>' : ''}
      <input id="backup-file" type="file" accept=".json,application/json" hidden>
      ${backupNotice ? `<p class="hint" role="status">${escapeHTML(backupNotice)}</p>` : ''}
    </section>
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
      ${label('Scriptable widget')}
      <button class="button" data-scriptable-export>Copy widget data</button>
      <p class="hint" id="scriptable-export-status" role="status">Open the <a href="https://github.com/darrenintr/timing/blob/main/scriptable/Timing%20Widget.js" target="_blank" rel="noopener noreferrer">Timing Widget script</a> in Scriptable after copying. Copy again after changing homework or the timetable.</p>
    </section>
    <section class="block setting">
      ${label('About')}
      <p class="hint">Timing follows the printed A–F letters from the school calendar. Verify exceptions with the school before relying on them for critical deadlines. This version does not send background notifications.</p>
    </section>`;
}

async function copyScriptableSnapshot() {
  const status = app.querySelector('#scriptable-export-status');
  const data = JSON.stringify({source:'timing-scriptable-v1', exportedAt:new Date().toISOString(), snapshot:widgetData(state, today())});
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(data);
    else {
      const field = document.createElement('textarea');
      field.value = data;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      if (!copied) throw new Error('Copy failed');
    }
    if (status) status.textContent = 'Copied. Open Scriptable and run Timing Widget once to update the Home Screen widget.';
  } catch (error) {
    if (status) status.textContent = 'Clipboard access failed. Try copying again after allowing pasteboard access.';
  }
}

/* ---------- Shell ---------- */

let overlayReturnFocus = null;
let overlayClosing = false;
function closeHomeworkOverlay(fromHistory = false) {
  if (overlayClosing || !state.homeworkOverlay) return;
  if (!fromHistory && globalThis.history?.state?.overlay) globalThis.history.back();
  feedback();
  const finish = () => {
    overlayClosing = false;
    state.homeworkOverlay = false;
    state.editingId = null;
    state.prefillSubject = null;
    state.composing = false;
    render();
    if (overlayReturnFocus) app.querySelector(overlayReturnFocus)?.focus?.({preventScroll:true});
    overlayReturnFocus = null;
  };
  const overlay = app.querySelector('.homework-overlay');
  if (!overlay) { finish(); return; }
  overlayClosing = true;
  leave(overlay, 'closing', finish, 220);
}

// The whole view is redrawn, so find the focused control again by its identifying attributes.
function focusSelector(element) {
  if (!element || !app.contains?.(element) || !globalThis.CSS?.escape) return null;
  if (element.id) return `#${CSS.escape(element.id)}`;
  const attributes = [...element.attributes].filter(({name}) => name.startsWith('data-') || name === 'name' ||
    (name === 'value' && element.type === 'radio'));
  if (!attributes.length) return null;
  return element.tagName.toLowerCase() + attributes.map(({name, value}) => `[${name}="${CSS.escape(value)}"]`).join('');
}
const tabs = [['today', 'Today', 'today'], ['calendar', 'Calendar', 'calendar_month'], ['homework', 'Homework', 'assignment'], ['settings', 'Settings', 'tune']];
function render() {
  const focused = focusSelector(globalThis.document?.activeElement);
  const before = measureFlip();
  const enter = motion;
  motion = null;
  const open = state.homework.filter(item => !item.done).length;
  const bump = lastOpenCount !== null && open !== lastOpenCount;
  lastOpenCount = open;
  const tab = ([view, text, glyph]) => {
    const active = state.view === view;
    const badge = view === 'homework' && open ? `<sup class="tab-badge${bump ? ' bump' : ''}" aria-label="${open} open">${open}</sup>` : '';
    return `<button class="tab tab-${view}${active ? ' active' : ''}" data-view="${view}" ${active ? 'aria-current="page"' : ''}>${active ? '<i class="tab-pill" data-flip="tab-pill"></i>' : ''}<span class="tab-icon">${icon(active && view !== 'settings' ? `${glyph}_fill` : glyph)}</span><span class="tab-label">${text}</span>${badge}</button>`;
  };
  const body = {today: todayView, calendar: calendarView, homework: homeworkView, settings: settingsView}[state.view]();
  app.innerHTML = `<div class="shell view-${state.view}${enter === 'boot' ? ' booting' : ''}" ${state.homeworkOverlay ? 'inert aria-hidden="true"' : ''}>
  <nav class="top" aria-label="Main">
    <button class="brand" data-view="today" aria-label="Timing, go to Today"><img src="./icon.svg" alt="" width="26" height="26"><span>timing</span></button>
    <div class="tabs">${tabs.map(tab).join('')}</div>
  </nav>
  <p class="sync-indicator ${syncError ? 'error' : ''}" role="status">${escapeHTML(syncNotice)}</p>
  <p class="storage-indicator" role="alert" ${storageWarning ? '' : 'hidden'}>${escapeHTML(storageWarning)}</p>
  ${updateReady ? '<p class="update-indicator" role="status">An update is ready. <button class="link" data-update>Reload app</button></p>' : ''}
  <main class="${enter && !state.homeworkOverlay ? `enter ${enter.split(' ').map(name => `enter-${name}`).join(' ')}` : ''}">${body}</main>
</div>${state.homeworkOverlay ? `<div class="homework-overlay ${enter === 'sheet' ? 'opening' : ''}"><button class="overlay-backdrop" data-close-homework tabindex="-1" aria-label="Close homework"></button><section class="homework-dialog" role="dialog" aria-modal="true" aria-label="Homework"><button class="icon-btn overlay-close" data-close-homework aria-label="Close homework">${icon('close')}</button><div class="overlay-content">${homeworkView()}</div></section></div>` : ''}`;
  flash = null;
  playFlip(before);
  if (focused) app.querySelector(focused)?.focus({preventScroll:true});
}

function shiftDay(days) {
  const from = state.date;
  state.date = addDays(state.date, days);
  dayMotion(from, state.date);
  followToday = state.date === today();
  feedback('selection');
  persist(); render();
}

app.addEventListener('click', event => {
  // Opening a <details> panel plays its reveal once; a redraw that keeps it open does not.
  const summary = event.target.closest?.('summary');
  const panel = summary?.parentElement;
  if (panel?.matches?.('details') && !panel.open) panel.classList.add('opening');
  const button = event.target.closest('button');
  if (!button) return;
  // A form's submit click must reach its submit event before the DOM is rebuilt.
  if (button.type === 'submit' && button.closest('form')) return;
  if (button.dataset.closeHomework !== undefined) { closeHomeworkOverlay(); return; }
  if (overlayClosing) return;
  const viewBefore = state.view, dateBefore = state.date;
  const openOverlay = viewBefore === 'today' && !state.homeworkOverlay && !button.closest('.top') &&
    (button.dataset.compose !== undefined || button.dataset.newSubject || button.dataset.view === 'homework');
  if (openOverlay) {
    overlayReturnFocus = button.dataset.compose !== undefined ? '[data-compose]' : button.dataset.newSubject
      ? `[data-new-subject="${button.dataset.newSubject}"]` : '[data-view="homework"]';
    state.homeworkOverlay = true;
    motion = 'sheet';
    globalThis.history?.pushState?.({view:'today', overlay:true}, '', '#today');
  }
  if (button.dataset.pick) {
    state.date = button.dataset.pick;
    if (state.view === 'today') dayMotion(dateBefore, state.date);
    else if (state.date !== dateBefore) motion = 'pick';
    feedback('selection');
  }
  if (button.dataset.view && !openOverlay) {
    navigate(button.dataset.view);
    state.homeworkOverlay = false;
  }
  if (button.dataset.shift) { shiftDay(Number(button.dataset.shift)); return; }
  if (button.dataset.today !== undefined) {
    state.date = today();
    if (state.view === 'calendar' && dateBefore.slice(0, 7) !== state.date.slice(0, 7)) motion = `month-${direction(dateBefore, state.date)}`;
    else if (state.view === 'calendar') motion = 'pick';
    else dayMotion(dateBefore, state.date);
    feedback('selection');
  }
  const compose = button.dataset.compose !== undefined;
  if (compose || button.dataset.newSubject || button.dataset.edit || button.dataset.cancelEdit !== undefined) state.draft = null;
  if (compose) { if (!openOverlay && !state.homeworkOverlay) navigate('homework'); state.editingId = null; state.prefillSubject = null; state.composing = true; }
  if (button.dataset.newSubject) {
    state.prefillSubject = button.dataset.newSubject;
    state.editingId = null;
    state.composing = true;
    if (!state.homeworkOverlay) navigate('homework');
  }
  if (button.dataset.step) { changeMonth(Number(button.dataset.step)); return; }
  if (state.date !== dateBefore || button.dataset.today !== undefined) followToday = state.date === today();
  if (button.dataset.toggle) {
    const item = state.homework.find(h => h.id === button.dataset.toggle);
    if (item) {
      item.done = !item.done;
      feedback(item.done ? 'success' : 'tap');
      flash = {task:item.id, kind:item.done ? 'just-done' : 'just-opened'};
      // Completing from the Open list: let the row tick and fold away before it leaves.
      if (item.done && state.filter === 'open') {
        leave(button.closest('.task'), 'completing', () => { persist(); render(); }, 420);
        return;
      }
    }
  }
  if (button.dataset.stepToggle || button.dataset.stepRemove) {
    const task = state.homework.find(h => h.id === (button.dataset.stepToggle || button.dataset.stepRemove));
    const step = task?.steps?.find(step => step.id === button.dataset.stepId);
    if (step && button.dataset.stepToggle) { step.done = !step.done; feedback(step.done ? 'success' : 'tap'); flash = {step:step.id, kind:'just-done'}; }
    if (step && button.dataset.stepRemove) {
      leave(button.closest('li'), 'removing', () => { task.steps = task.steps.filter(part => part.id !== step.id); persist(); render(); }, 200);
      return;
    }
  }
  if (button.dataset.edit) { state.editingId = button.dataset.edit; state.composing = true; if (!state.homeworkOverlay) navigate('homework'); }
  if (button.dataset.cancelEdit !== undefined) { state.editingId = null; state.prefillSubject = null; state.composing = false; }
  if (button.dataset.remove && confirm('Remove this homework?')) {
    const id = button.dataset.remove;
    leave(button.closest('.task'), 'removing', () => {
      state.homework = state.homework.filter(h => h.id !== id);
      if (state.editingId === id) state.editingId = null;
      persist(); render();
    });
    return;
  }
  if (button.dataset.sync === 'signin') { void signIn(); return; }
  if (button.dataset.sync === 'signout') { void signOut(); return; }
  if (button.dataset.update !== undefined) { location.reload(); return; }
  if (button.dataset.backup === 'export') {
    const url = URL.createObjectURL(new Blob([createBackup(currentData())], {type:'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = `timing-backup-${today()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    backupNotice = 'Backup downloaded.'; render(); return;
  }
  if (button.dataset.backup === 'recovery' && recoveredRaw) {
    const url = URL.createObjectURL(new Blob([recoveredRaw], {type:'text/plain'}));
    const link = document.createElement('a'); link.href = url; link.download = `timing-recovery-${today()}.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (button.dataset.backup === 'import') { app.querySelector('#backup-file')?.click(); return; }
  if (button.dataset.scriptableExport !== undefined) { void copyScriptableSnapshot(); return; }
  if (button.dataset.export !== undefined) {
    const url = URL.createObjectURL(new Blob([calendarICS(state.homework, state.overrides, state.timeMode)], {type:'text/calendar;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'timing-s6-calendar.ics'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (state.view !== 'homework' && !state.homeworkOverlay && viewBefore === 'homework' && !state.editingId) state.composing = false;
  if (openOverlay || button.dataset.view && state.view !== viewBefore) feedback();
  persist(); render();
  if (button.dataset.newSubject || button.dataset.edit || compose) {
    if (!state.homeworkOverlay) app.querySelector('#homework-form')?.scrollIntoView({behavior:'smooth', block:'start'});
    app.querySelector('#homework-form input[name="title"]')?.focus({preventScroll:true});
  } else if (openOverlay) {
    app.querySelector('.overlay-close')?.focus({preventScroll:true});
  } else if (state.view !== viewBefore) {
    globalThis.scrollTo?.({top:0, behavior:'instant'});
  }
});

// Horizontal swipes: months on the calendar, days on Today's lessons.
let swipe = null;
app.addEventListener('pointerdown', event => {
  if (state.view === 'calendar' && event.target.closest?.('.calendar-swipe')) swipe = {kind:'month'};
  // A mouse drag over the lessons selects text instead of changing day.
  else if (state.view === 'today' && event.pointerType !== 'mouse' && event.target.closest?.('.day-swipe, .hero')) swipe = {kind:'day'};
  else return;
  Object.assign(swipe, {id:event.pointerId, x:event.clientX, y:event.clientY});
});
app.addEventListener('pointerup', event => {
  if (!swipe || event.pointerId !== swipe.id) return;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  const {kind} = swipe;
  swipe = null;
  if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
  event.preventDefault();
  if (kind === 'month') changeMonth(dx < 0 ? 1 : -1);
  else shiftDay(dx < 0 ? 1 : -1);
});
app.addEventListener('pointercancel', () => { swipe = null; });
// Back and forward move between tabs; Back also closes the homework sheet.
globalThis.addEventListener?.('popstate', event => {
  if (state.homeworkOverlay && !event.state?.overlay) { closeHomeworkOverlay(true); return; }
  const view = event.state?.view ?? hashView() ?? 'today';
  if (view === state.view || overlayClosing) return;
  viewMotion(view);
  state.view = view;
  if (view !== 'homework' && !state.editingId) state.composing = false;
  feedback();
  render();
  globalThis.scrollTo?.({top:0, behavior:'instant'});
});
// Keyboard: ←/→ change day or month, T jumps to today, 1–4 switch tabs.
document.addEventListener?.('keydown', event => {
  if (state.homeworkOverlay || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target?.closest?.('input, select, textarea, [contenteditable], details.more')) return;
  const tabIndex = ['1', '2', '3', '4'].indexOf(event.key);
  if (tabIndex >= 0 && navigate(views[tabIndex])) { feedback('selection'); render(); globalThis.scrollTo?.({top:0, behavior:'instant'}); return; }
  if (event.key === 't' || event.key === 'T') {
    if (state.date === today()) return;
    const from = state.date;
    state.date = today(); followToday = true;
    if (state.view === 'calendar') motion = from.slice(0, 7) === state.date.slice(0, 7) ? 'pick' : `month-${direction(from, state.date)}`;
    else dayMotion(from, state.date);
    persist(); render(); return;
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (event.target?.closest?.('.month, .week, .toggle')) return;
  const step = event.key === 'ArrowRight' ? 1 : -1;
  if (state.view === 'today') { event.preventDefault(); shiftDay(step); }
  else if (state.view === 'calendar') { event.preventDefault(); changeMonth(step); }
});
document.addEventListener?.('keydown', event => {
  if (!state.homeworkOverlay) return;
  if (event.key === 'Escape') { event.preventDefault(); closeHomeworkOverlay(); return; }
  if (event.key !== 'Tab') return;
  const focusable = [...app.querySelectorAll('.homework-dialog button:not([disabled]), .homework-dialog input:not([disabled]), .homework-dialog select:not([disabled]), .homework-dialog textarea:not([disabled]), .homework-dialog summary')]
    .filter(element => element.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}, true);
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
function useGuestData() {
  account = null;
  storage.removeItem(accountKey);
  activeKey = guestKey;
  applySnapshot(read(guestKey) || emptySnapshot());
}
async function signOut() {
  try {
    await googleSignOut();
    useGuestData();
    syncError = false; syncNotice = 'Signed out. New changes will stay on this device.';
  } catch (error) { syncError = true; syncNotice = error.message; }
  render();
}
app.addEventListener('change', event => {
  if (event.target.id === 'backup-file') {
    const file = event.target.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        if (file.size > 5_000_000) throw new Error('The backup is too large to import.');
        const imported = parseBackup(await file.text());
        if (!confirm(`Import ${imported.homework.length} homework items and ${Object.keys(imported.overrides).length} day overrides? Matching items from the backup will win.`)) return;
        Object.assign(state, mergeBackup(currentData(), imported));
        persist();
        backupNotice = storageAvailable
          ? 'Backup imported. Your data is saved on this device and will sync if you are signed in.'
          : 'Backup imported into this session. Device storage is unavailable; export a fresh backup now.';
      } catch (error) { backupNotice = error.message; }
      render();
    })();
    return;
  }
  const control = event.target.id || event.target.name;
  if (control === 'homework-filter') { state.filter = event.target.value; feedback('selection'); render(); return; }
  if (control === 'homework-subject-filter') { state.subjectFilter = event.target.value; feedback('selection'); render(); return; }
  const homeworkForm = event.target.closest('#homework-form');
  if (homeworkForm) { feedback('selection'); saveDraft(homeworkForm); updateDraftPreview(); return; }
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
  feedback('selection'); persist(); render();
});
function saveDraft(form) {
  state.draft = {editingId: state.editingId, values: Object.fromEntries(new FormData(form))};
}
app.addEventListener('input', event => {
  const form = event.target.closest('#homework-form');
  if (form) { saveDraft(form); updateDraftPreview(); }
});
function updateDraftPreview() {
  const form = app.querySelector('#homework-form');
  if (!form) return;
  const data = new FormData(form);
  const manual = data.get('dueMode') === 'date';
  const manualField = form.querySelector('#manual-date-field');
  if (manualField.hidden === manual) {
    manualField.hidden = !manual;
    if (manual) nudge(manualField, [{opacity:0, transform:'translateY(-6px)'}, {opacity:1, transform:'none'}], {duration:240, easing:'cubic-bezier(.2,0,0,1)'});
  }
  const dueInput = form.querySelector('[name="dueDate"]');
  dueInput.min = String(data.get('afterDate'));
  const draft = { subject:String(data.get('subject')), afterDate:String(data.get('afterDate')), dueMode:String(data.get('dueMode')), dueDate:String(data.get('dueDate')) };
  const preview = form.querySelector('#due-preview');
  const next = duePreview(resolveHomework(draft, state.overrides));
  if (preview.innerHTML === next) return;
  preview.innerHTML = next;
  nudge(preview, [{opacity:.35, transform:'translateY(3px)'}, {opacity:1, transform:'none'}], {duration:260, easing:'cubic-bezier(.2,0,0,1)'});
}
app.addEventListener('submit', event => {
  if (event.target.matches('.step-form')) {
    event.preventDefault();
    const task = state.homework.find(h => h.id === event.target.dataset.taskId);
    const title = String(new FormData(event.target).get('step') ?? '').trim();
    if (task && title) {
      if (!Array.isArray(task.steps)) task.steps = [];
      const step = {id:crypto.randomUUID(), title:title.slice(0, 100), done:false};
      task.steps.push(step);
      state.expanded.add(task.id);
      flash = {step:step.id, kind:'just-added'};
      feedback('success');
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
    feedback('success');
    flash = {task:item.id, kind:'just-saved'};
    state.draft = null;
    persist(); render();
  } catch (error) {
    const message = app.querySelector('#form-error');
    message.textContent = error.message;
    message.hidden = false;
    feedback();
    nudge(message, [{transform:'translateX(0)'}, {transform:'translateX(-6px)'}, {transform:'translateX(5px)'}, {transform:'translateX(-3px)'}, {transform:'translateX(0)'}], {duration:320, easing:'ease-out'});
  }
});
recordView();
render();
refreshWidget(state, today());
// Collect homework completed from a widget, then republish the snapshot.
async function collectWidgetCompletions() {
  const ids = await takeWidgetCompletions();
  if (completeFromWidget(state.homework, ids)) { persist(); render(); }
  else refreshWidget(state, today());
}
void collectWidgetCompletions();
document.addEventListener?.('visibilitychange', () => {
  if (document.visibilityState === 'visible') { void collectWidgetCompletions(); refreshClock(); }
});
onWidgetOpen(target => {
  if (target.view !== state.view) viewMotion(target.view);
  state.view = target.view;
  state.homeworkOverlay = false;
  recordView();
  if (target.compose) { state.editingId = null; state.prefillSubject = null; state.composing = true; state.draft = null; }
  if (target.id) { state.filter = 'open'; state.subjectFilter = 'all'; state.expanded.add(target.id); }
  render();
  if (target.id) app.querySelector(`[data-id="${CSS.escape(target.id)}"]`)?.scrollIntoView({block:'center'});
  if (target.compose) app.querySelector('#homework-form input[name="title"]')?.focus();
});
// Keep the "now" lesson current without disturbing a form that is being filled in.
function refreshClock() {
  if (followToday && state.date !== today()) state.date = today();
  const active = globalThis.document?.activeElement;
  if (state.view === 'today' && !state.homeworkOverlay && !(active && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName))) render();
}
const clock = setInterval(refreshClock, 60000);
clock?.unref?.();

/* ---------- Sync ---------- */

if (cloudConfigured) {
  void currentAccount().then(user => {
    if (user) return activateAccount(user);
    // The session ended elsewhere: its offline copy stays saved for the next sign-in.
    if (rememberedUid) { useGuestData(); syncNotice = 'Signed out. Sign in again to sync.'; render(); }
  }).catch(error => {
    syncError = true; syncNotice = `${error.message} Local data is available.`; render();
  });
  window.addEventListener('online', () => { if (account) void runSync(); });
  window.addEventListener('focus', () => { if (account) void runSync(); });
  setInterval(() => { if (account && document.visibilityState === 'visible') void runSync(); }, 30_000);
}
const hostedWeb = !nativeApp && /^https?:$/.test(globalThis.location?.protocol ?? '');
if (globalThis.navigator && 'serviceWorker' in navigator && !hostedWeb) {
  // Remove a worker registered by an earlier packaged version.
  navigator.serviceWorker.getRegistrations().then(list => list.forEach(registration => registration.unregister())).catch(() => {});
} else if (globalThis.navigator && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'TIMING_UPDATE_READY') {
      updateReady = true;
      if (!document.activeElement?.closest('form')) render();
    }
  });
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
