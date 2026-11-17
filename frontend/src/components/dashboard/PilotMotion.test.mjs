import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { transformWithOxc } from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = await readFile(new URL('./PilotMotion.jsx', import.meta.url), 'utf8');
const compiled = await transformWithOxc(source, 'PilotMotion.jsx', { jsx: { runtime: 'automatic' } });
const code = compiled.code.replace(/from\s+(['"])([^'"]+)\1/g, (_, _quote, path) => `from ${JSON.stringify(import.meta.resolve(path))}`);
const { AnimatedValue } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('count-up keeps the exact accessible value, respects reduced motion and cancels on unmount', async () => {
  let frame;
  let cancelled = false;
  let reduced = true;
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = {
    matchMedia: () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: callback => { frame = callback; return 42; },
    cancelAnimationFrame: () => { cancelled = true; },
  };
  globalThis.document = { visibilityState: 'visible' };
  const element = { textContent: '' };
  let view;
  try {
    await act(async () => { view = create(React.createElement(AnimatedValue, { value: 1234, format: n => n.toLocaleString('en-IN') }), { createNodeMock: () => element }); });
    assert.equal(frame, undefined);
    assert.equal(view.root.findByProps({ className: 'sr-only' }).children.join(''), '1,234');
    reduced = false;
    await act(async () => view.update(React.createElement(AnimatedValue, { value: 2000 })));
    assert.equal(typeof frame, 'function');
    frame(10); frame(600);
    assert.equal(element.textContent, '2,000');
    reduced = true;
    await act(async () => view.update(React.createElement(AnimatedValue, { value: 2500 })));
    assert.equal(element.textContent, '2,500', 'a reduced-motion refresh must not retain the previous animated value');
    assert.equal(view.root.findByProps({ className: 'sr-only' }).children.join(''), '2,500');
    await act(async () => view.unmount());
    assert.equal(cancelled, true);
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
  }
});
