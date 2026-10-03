import test from 'node:test';
import assert from 'node:assert/strict';

test('Today shows the week strip and a touch swipe over the lessons changes day', async () => {
  const listeners = {};
  const app = {set innerHTML(value) { this.html = value; }, get innerHTML() { return this.html; },
    addEventListener(name, callback) { listeners[name] = callback; }, querySelector() { return null; }};
  globalThis.document = {querySelector: () => app};
  globalThis.localStorage = {getItem: () => null, setItem() {}, removeItem() {}};
  await import('../src/main.js');
  assert.match(app.innerHTML, /<nav class="week"/);
  assert.equal((app.innerHTML.match(/class="wk-day/g) || []).length, 7);
  assert.equal((app.innerHTML.match(/class="tab tab-/g) || []).length, 4, 'all four destinations are tabs');
  const selected = () => app.innerHTML.match(/data-pick="([\d-]+)"[^>]*aria-pressed="true"/)[1];
  const start = selected();
  const lessons = {closest: selector => selector.includes('.day-swipe') ? {} : null};
  listeners.pointerdown({target:lessons, pointerId:1, pointerType:'mouse', clientX:240, clientY:150});
  listeners.pointerup({pointerId:1, clientX:100, clientY:150, preventDefault(){}});
  assert.equal(selected(), start, 'a mouse drag selects text instead of changing day');
  listeners.pointerdown({target:lessons, pointerId:2, pointerType:'touch', clientX:240, clientY:150});
  listeners.pointerup({pointerId:2, clientX:100, clientY:155, preventDefault(){}});
  assert.notEqual(selected(), start);
  assert.match(app.innerHTML, /<main class="enter enter-day-next/, 'the day change plays a one-shot transition');
  listeners.click({target:{closest: () => ({type:'button', dataset:{today:''}, closest: () => null})}});
  assert.equal(selected(), start);
});
