import test from 'node:test';
import assert from 'node:assert/strict';

test('a half-typed homework form survives a re-render and clears after saving', async () => {
  const listeners = {};
  const stored = new Map();
  const app = {
    set innerHTML(value) { this.html = value; }, get innerHTML() { return this.html; },
    addEventListener(name, callback) { listeners[name] = callback; }, querySelector() { return null; }
  };
  globalThis.document = {querySelector: () => app};
  globalThis.localStorage = {getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key)};
  globalThis.FormData = class {
    constructor(form) { this.values = form.values; }
    get(name) { return this.values[name]; }
    [Symbol.iterator]() { return Object.entries(this.values)[Symbol.iterator](); }
  };
  await import('../src/main.js');
  const action = dataset => ({type:'button', dataset, closest: () => null});
  listeners.click({target:{closest: () => action({compose:''})}});
  const form = {id:'homework-form', matches: () => false, closest: selector => selector === '#homework-form' ? form : null,
    values:{title:'Half-typed essay', subject:'GEOG', afterDate:'2026-09-24', dueMode:'nextLesson', dueDate:'', reminderDays:'1', notes:'Page 12'}};
  listeners.input({target:form});
  listeners.click({target:{closest: () => action({view:'homework'})}});
  assert.match(app.innerHTML, /value="Half-typed essay"/);
  assert.match(app.innerHTML, /Page 12/);
  assert.match(app.innerHTML, /<option value="GEOG" selected>/);
  listeners.submit({target:form, preventDefault(){}});
  listeners.click({target:{closest: () => action({compose:''})}});
  assert.doesNotMatch(app.innerHTML, /value="Half-typed essay"/, 'a saved draft does not reappear in the next form');
});
