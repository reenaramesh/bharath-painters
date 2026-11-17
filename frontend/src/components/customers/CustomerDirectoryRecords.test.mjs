import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { transformWithOxc } from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.document = { addEventListener() {}, removeEventListener() {} };
let source = await readFile(new URL('./CustomerDirectoryRecords.jsx', import.meta.url), 'utf8');
source = source.replace(/import \{ Link \} from [^;]+;/, 'const Link = "a";')
  .replace(/import \{ EmptyState, LoadingState \} from [^;]+;/, 'const EmptyState = "aside", LoadingState = "aside";')
  .replace(/import ["'][^"']+\.css["'];/, '');
const compiled = await transformWithOxc(source, 'CustomerDirectoryRecords.jsx', { jsx: { runtime: 'automatic' } });
const code = compiled.code.replace(/from\s+(['"])([^'"]+)\1/g, (_, _quote, path) => `from ${JSON.stringify(import.meta.resolve(path.startsWith('.') && !path.endsWith('.js') ? `${path}.js` : path))}`);
const Directory = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
const props = { propertiesByCustomer: {}, sort: { key: 'name', direction: 'asc' }, onSort() {}, onOpen() {}, onActivate() {}, activatingCustomerId: null };
const base = { id: 1, name: 'Connected customer', connection_status: 'CONNECTED', account_status: 'ACTIVE' };

test('desktop and mobile show actual last activity and honest unknown state', async () => {
  let view;
  const timestamp = '2026-10-29T04:30:00Z';
  await act(async () => { view = create(React.createElement(Directory, { ...props, customers: [{ ...base, last_activity_at: timestamp }, { ...base, id: 2 }] })); });
  const times = view.root.findAllByType('time');
  assert.equal(times.length, 2, 'one desktop cell and one mobile card');
  assert.ok(times.every(time => time.props.dateTime === timestamp));
  assert.match(JSON.stringify(view.toJSON()), /Last activity/);
  assert.match(JSON.stringify(view.toJSON()), /No recorded activity/);
  await act(async () => view.unmount());
});

test('restricted contacts do not render activity even if stale data supplies it', async () => {
  let view;
  await act(async () => { view = create(React.createElement(Directory, { ...props, customers: [{ ...base, connection_status: 'DISCONNECTED', last_activity_at: '2026-10-29T04:30:00Z' }] })); });
  assert.equal(view.root.findAllByType('time').length, 0);
  assert.match(JSON.stringify(view.toJSON()), /Not available/);
  await act(async () => view.unmount());
});
