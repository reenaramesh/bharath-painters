import test from 'node:test';
import assert from 'node:assert/strict';
import { enterSurface } from './premiumMotion.js';

test('reduced motion skips animation; preference changes and unmount cancel it without touching focus or form contents', () => {
  let changed;
  let cancelled = 0;
  let removed = false;
  const calls = [];
  const element = { value: 'unsaved local form', focus() { throw Error('motion must never steal focus'); } };
  const preference = { matches: true, addEventListener: (_name, listener) => { changed = listener; }, removeEventListener: () => { removed = true; } };
  const animate = (...args) => { calls.push(args); return { cancel() { cancelled += 1; } }; };
  enterSurface(element, { preference, animate })();
  assert.equal(calls.length, 0);
  preference.matches = false;
  const dispose = enterSurface(element, { preference, animate });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], { opacity: [.72, 1] }, 'route frames must not transform fixed dialogs/sticky actions');
  assert.equal(calls[0][2].duration, .24);
  preference.matches = true;
  changed();
  assert.equal(cancelled, 1);
  dispose();
  assert.equal(removed, true);
  assert.equal(element.value, 'unsaved local form');
});
