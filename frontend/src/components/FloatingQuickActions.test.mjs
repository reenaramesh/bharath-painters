import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { transformWithOxc } from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let source = await readFile(new URL('./FloatingQuickActions.jsx', import.meta.url), 'utf8');
source = source.replace(/import useAuth from [^;]+;/, 'const useAuth = () => ({ user: { role: "CONTRACTOR" }, menuVisibility: {} });')
  .replace(/import \{ visibleNavigation \} from [^;]+;/, 'const visibleNavigation = () => [{ route: "/messages" }];')
  .replace(/import \{ menuRouteEnabled \} from [^;]+;/, 'const menuRouteEnabled = () => true;')
  .replace(/import \{ Link \} from [^;]+;/, 'const Link = "a";')
  .replace(/import ["'][^"']+\.css["'];/, '');
const compiled = await transformWithOxc(source, 'FloatingQuickActions.jsx', { jsx: { runtime: 'automatic' } });
const code = compiled.code.replace(/from\s+(['"])([^'"]+)\1/g, (_, _quote, path) => `from ${JSON.stringify(import.meta.resolve(path))}`);
const FloatingQuickActions = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;

test('message composer stays unobstructed while other pages retain quick actions', async () => {
  let view;
  await act(async () => { view = create(React.createElement(FloatingQuickActions, { pathname: '/messages' })); });
  assert.equal(view.toJSON(), null);
  await act(async () => view.update(React.createElement(FloatingQuickActions, { pathname: '/dashboard' })));
  assert.equal(view.root.findByProps({ 'aria-label': 'Open quick actions' }).type, 'button');
  await act(async () => view.unmount());
});
