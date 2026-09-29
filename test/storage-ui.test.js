import test from 'node:test';
import assert from 'node:assert/strict';

test('the app remains usable and warns when browser storage rejects writes', async () => {
  const app = {set innerHTML(value) { this.html = value; }, get innerHTML() { return this.html; },
    addEventListener() {}, querySelector() { return null; }};
  globalThis.document = {querySelector: () => app};
  globalThis.localStorage = {getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem() {}};
  await import('../src/main.js');
  assert.match(app.innerHTML, /Device storage is full or unavailable/);
  assert.match(app.innerHTML, /Today/);
});
