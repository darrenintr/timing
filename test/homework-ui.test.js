import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackup} from '../src/backup.js';

test('Add homework click reaches submit instead of replacing the form first', async () => {
  const listeners = {};
  let renders = 0;
  const stored = new Map();
  const app = {
    set innerHTML(value) { this.html = value; renders++; },
    get innerHTML() { return this.html; },
    addEventListener(name, callback) { listeners[name] = callback; },
    querySelector() { return null; }
  };
  globalThis.document = {querySelector: () => app};
  globalThis.localStorage = {getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key)};
  const homework = () => Object.values(JSON.parse(stored.get('timing-s6-v1:guest')).homework).filter(entry => entry.value).map(entry => entry.value);
  globalThis.FormData = class {
    constructor(form) { this.values = form.values; }
    get(name) { return this.values[name]; }
    [Symbol.iterator]() { return Object.entries(this.values)[Symbol.iterator](); }
  };
  await import('../src/main.js');
  const firstRender = renders;
  const form = {id:'homework-form', matches: () => false, values:{...{
    title:'Economics worksheet',subject:'ECON',afterDate:'2026-09-24',dueMode:'nextLesson',dueDate:'2026-09-24',reminderDays:'1',notes:''
  }}};
  const button = {type:'submit', closest: selector => selector === 'form' ? form : button};
  listeners.click({target:{closest: () => button}});
  assert.equal(renders, firstRender, 'the submit button must not rerender the form');
  listeners.submit({target:form, preventDefault(){}});
  assert.equal(homework()[0].title, 'Economics worksheet');
  assert.match(app.innerHTML, /Economics worksheet/);
  const savedId = homework()[0].id;
  const firstRevision = JSON.parse(stored.get('timing-s6-v1:guest')).homework[savedId].rev[0];
  const action = dataset => ({type:'button',dataset,closest: () => null});
  listeners.click({target:{closest: () => action({view:'homework'})}});
  assert.match(app.innerHTML, /id="homework-form"/);
  assert.ok(app.innerHTML.indexOf('id="homework-form"') < app.innerHTML.indexOf('homework-list'), 'the form comes before the list');
  assert.doesNotMatch(app.innerHTML, /class="month"/, 'the homework view stays focused and does not render the calendar');
  const stepForm = {matches: selector => selector === '.step-form', dataset:{taskId:savedId}, values:{step:'Read Chapter 7'}};
  listeners.submit({target:stepForm, preventDefault(){}});
  assert.equal(homework()[0].steps[0].title, 'Read Chapter 7');
  listeners.click({target:{closest: () => action({edit:savedId})}});
  assert.match(app.innerHTML, /Edit homework/);
  form.values.title = 'Economics worksheet revised';
  listeners.submit({target:form, preventDefault(){}});
  const updated = homework()[0];
  assert.equal(updated.id, savedId);
  assert.equal(updated.steps[0].title, 'Read Chapter 7');
  assert.equal(updated.title, 'Economics worksheet revised');
  const editedRevision = JSON.parse(stored.get('timing-s6-v1:guest')).homework[savedId].rev[0];
  assert.ok(editedRevision > firstRevision, 'edits receive a newer sync revision');

  listeners.click({target:{closest: () => action({view:'today'})}});
  listeners.click({target:{closest: () => action({view:'homework'})}});
  assert.match(app.innerHTML, /role="dialog" aria-modal="true" aria-label="Homework"/);
  assert.match(app.innerHTML, /class="shell view-today" inert/);
  listeners.click({target:{closest: () => action({compose:''})}});
  form.values.title = 'Added from Today';
  listeners.submit({target:form, preventDefault(){}});
  assert.match(app.innerHTML, /Added from Today/);
  assert.match(app.innerHTML, /role="dialog" aria-modal="true"/);
  listeners.click({target:{closest: () => action({closeHomework:''})}});
  assert.doesNotMatch(app.innerHTML, /class="homework-overlay"/);
  assert.match(app.innerHTML, /class="shell view-today"/);

  const topHomework = {...action({view:'homework'}), closest: selector => selector === '.top' ? {} : null};
  listeners.click({target:{closest: () => topHomework}});
  assert.match(app.innerHTML, /class="shell view-homework"/);
  assert.doesNotMatch(app.innerHTML, /class="homework-overlay"/);

  listeners.click({target:{closest: () => action({view:'calendar'})}});
  listeners.click({target:{closest: () => action({pick:'2026-01-31'})}});
  listeners.click({target:{closest: () => action({step:'1'})}});
  assert.match(app.innerHTML, /data-pick="2026-02-28"[^>]*aria-pressed="true"/);
  const swipeTarget = {closest: selector => selector === '.calendar-swipe' ? {} : null};
  listeners.pointerdown({target:swipeTarget, pointerId:1, clientX:240, clientY:150});
  listeners.pointerup({pointerId:1, clientX:130, clientY:155, preventDefault(){}});
  assert.match(app.innerHTML, /data-pick="2026-03-28"[^>]*aria-pressed="true"/);
  listeners.pointerdown({target:swipeTarget, pointerId:2, clientX:240, clientY:150});
  listeners.pointerup({pointerId:2, clientX:130, clientY:270, preventDefault(){throw Error('vertical scrolling was blocked');}});
  assert.match(app.innerHTML, /data-pick="2026-03-28"[^>]*aria-pressed="true"/);
  globalThis.confirm = () => true;
  const restored = {...updated, id:'restored', title:'From backup'};
  const backup = createBackup({homework:[restored], overrides:{'2026-10-02':{type:'holiday'}}, timeMode:'winter'});
  listeners.change({target:{id:'backup-file', files:[{size:backup.length, text:async () => backup}]}});
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(homework().some(item => item.id === 'restored'), 'imported homework is persisted');
  assert.equal(JSON.parse(stored.get('timing-s6-v1:guest')).timeMode.value, 'winter');
});
