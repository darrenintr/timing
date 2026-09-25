import test from 'node:test';
import assert from 'node:assert/strict';

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
});
