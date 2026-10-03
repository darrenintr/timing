import test from 'node:test';
import assert from 'node:assert/strict';

test('natural requests, assistants and the existing form share persistence and duplicate handling', async t => {
  t.mock.timers.enable({apis:['Date'], now:new Date('2026-10-03T04:12:00Z')});
  const listeners = {}, stored = new Map();
  const nodes = new Map();
  const app = {
    set innerHTML(value) { this.html = value; }, get innerHTML() { return this.html; },
    addEventListener(name, callback) { listeners[name] = callback; },
    querySelector(selector) { return nodes.get(selector) ?? null; }
  };
  globalThis.document = {querySelector: () => app};
  globalThis.localStorage = {getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key)};
  globalThis.FormData = class {
    constructor(form) { this.values = form.values; }
    get(name) { return this.values[name]; }
    [Symbol.iterator]() { return Object.entries(this.values)[Symbol.iterator](); }
  };
  const {createHomework} = await import('../src/main.js');
  const homework = () => Object.values(JSON.parse(stored.get('timing-s6-v1:guest')).homework)
    .filter(entry => entry.value).map(entry => entry.value);
  const action = dataset => ({type:'button',dataset,closest: () => null});
  listeners.click({target:{closest: () => action({view:'homework'})}});
  assert.match(app.innerHTML, /id="homework-request-form"/);
  const form = {id:'homework-request-form',matches: () => false,
    values:{text:'Add ICT homework: finish the database worksheet, due 2027-02-03 at 4 PM'}};
  const textarea = {value:form.values.text,closest: selector => selector === '#homework-request-form' ? form : null};
  listeners.input({target:textarea});
  listeners.click({target:{closest: () => action({view:'homework'})}});
  assert.match(app.innerHTML, /finish the database worksheet, due 2027-02-03 at 4 PM<\/textarea>/, 'text survives redraw');
  listeners.submit({target:form,preventDefault(){}});
  assert.equal(homework().length, 1);
  const item = homework()[0];
  assert.equal(item.title, 'finish the database worksheet');
  assert.equal(item.dueTime, '16:00');
  assert.equal(item.due, undefined, 'persist only the rule');
  assert.match(app.innerHTML, /Added: finish the database worksheet/);
  const snapshot = stored.get('timing-s6-v1:guest');
  const retry = createHomework({subject:'ICT',description:item.title,dueDate:item.dueDate,dueTime:'4 PM'});
  assert.equal(retry.created, false);
  assert.equal(retry.homework.id, item.id);
  assert.equal(retry.savedLocally, true);
  assert.equal(stored.get('timing-s6-v1:guest'), snapshot, 'duplicate does not create a sync revision');

  const manual = {id:'homework-form',matches: () => false,values:{
    subject:item.subject,title:item.title,afterDate:item.afterDate,dueMode:'date',dueDate:item.dueDate,dueTime:item.dueTime,notes:'',reminderDays:'1'}};
  listeners.submit({target:manual,preventDefault(){}});
  assert.equal(homework().length, 1, 'the normal form also uses the shared action');
  listeners.click({target:{closest: () => action({edit:item.id})}});
  assert.match(app.innerHTML, /name="dueTime" value="16:00"/);
  manual.values.title = 'Revised worksheet';
  listeners.submit({target:manual,preventDefault(){}});
  assert.equal(homework()[0].dueTime, '16:00');
  assert.equal(homework()[0].id, item.id);

  const error = {hidden:true,textContent:''};
  nodes.set('#homework-request-notice', error);
  form.values.text = 'Add ICT homework: read the worksheet';
  listeners.submit({target:form,preventDefault(){}});
  assert.equal(error.hidden, false);
  assert.match(error.textContent, /when the homework is due/);
  assert.equal(homework().length, 1);
});
