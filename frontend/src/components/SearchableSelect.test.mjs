import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { transformWithOxc } from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const icons = dataUrl('export const Search=()=>null;');
const source = await readFile(new URL('./SearchableSelect.jsx', import.meta.url), 'utf8');
const compiled = await transformWithOxc(source, 'SearchableSelect.jsx', { jsx: { runtime: 'automatic' } });
const code = compiled.code.replace(/from\s+(['"])([^'"]+)\1/g, (_m, _q, path) => `from ${JSON.stringify(path === 'lucide-react' ? icons : import.meta.resolve(path))}`);
const Select = (await import(dataUrl(code))).default;
const options = [{ value: 12, label: 'Alpha' }, { value: 'beta', label: 'Beta' }];
const key = name => ({ key: name, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } });

test('keyboard selects an active option without moving focus or submitting its form', async () => {
  const changes = [];
  let view;
  await act(async () => { view = create(React.createElement(Select, { options, value: '', onChange: v => changes.push(v), 'aria-label': 'Customer' })); });
  const input = () => view.root.findByType('input');
  assert.equal(input().props.role, 'combobox');
  assert.equal(input().props['aria-label'], 'Customer');
  const down = key('ArrowDown');
  await act(async () => input().props.onKeyDown(down));
  assert.equal(down.prevented, true);
  const active = view.root.findByProps({ id: input().props['aria-activedescendant'] });
  assert.equal(active.props.children, 'Alpha');
  assert.equal(active.props.role, 'option');
  assert.equal(active.props.tabIndex, -1);
  assert.equal(input().props['aria-controls'], view.root.findByProps({ role: 'listbox' }).props.id);
  const enter = key('Enter');
  await act(async () => input().props.onKeyDown(enter));
  assert.deepEqual(changes, [12]);
  assert.equal(enter.prevented, true);
  assert.equal(input().props.value, 'Alpha');
  assert.equal(input().props['aria-expanded'], false);
  assert.equal(input().props['aria-activedescendant'], undefined);
  await act(async () => view.unmount());
});

test('up/down wrap, Escape consumes only the open list, and Tab closes without trapping', async () => {
  let view;
  await act(async () => { view = create(React.createElement(Select, { options, value: '', onChange() {} })); });
  const input = () => view.root.findByType('input');
  await act(async () => input().props.onKeyDown(key('ArrowUp')));
  assert.equal(view.root.findByProps({ id: input().props['aria-activedescendant'] }).props.children, 'Beta');
  await act(async () => input().props.onKeyDown(key('ArrowDown')));
  assert.equal(view.root.findByProps({ id: input().props['aria-activedescendant'] }).props.children, 'Alpha');
  const escape = key('Escape');
  await act(async () => input().props.onKeyDown(escape));
  assert.equal(escape.prevented, true);
  assert.equal(escape.stopped, true);
  const closedEscape = key('Escape');
  await act(async () => input().props.onKeyDown(closedEscape));
  assert.equal(closedEscape.stopped, false);
  await act(async () => input().props.onFocus());
  const tab = key('Tab');
  await act(async () => input().props.onKeyDown(tab));
  assert.equal(input().props['aria-expanded'], false);
  assert.equal(tab.prevented, false);
  await act(async () => view.unmount());
});

test('controlled query clear preserves typed text, external selection syncs, and disabled controls stay closed', async () => {
  let view;
  function Controlled() {
    const [value, setValue] = React.useState(12);
    return React.createElement(Select, { options, value, onChange: setValue });
  }
  await act(async () => { view = create(React.createElement(Controlled)); });
  await act(async () => view.root.findByType('input').props.onChange({ target: { value: 'Be' } }));
  assert.equal(view.root.findByType('input').props.value, 'Be');
  assert.equal(view.root.findAllByProps({ role: 'option' }).length, 1);
  await act(async () => view.root.findByProps({ role: 'option' }).props.onClick());
  assert.equal(view.root.findByType('input').props.value, 'Beta');
  await act(async () => view.update(React.createElement(Select, { options, value: 12, onChange() {}, disabled: true, invalid: true })));
  const input = view.root.findByType('input');
  assert.equal(input.props.value, 'Alpha');
  assert.equal(input.props.disabled, true);
  assert.equal(input.props['aria-invalid'], true);
  await act(async () => input.props.onKeyDown(key('ArrowDown')));
  assert.equal(view.root.findAllByProps({ role: 'listbox' }).length, 0);
  assert.equal(view.root.findByType('input').props['aria-expanded'], false);
  await act(async () => view.unmount());
});

test('external values refresh the displayed selection and empty filtered results never expose a missing active option', async () => {
  let view;
  const props = { options, onChange() {} };
  await act(async () => { view = create(React.createElement(Select, { ...props, value: 12 })); });
  await act(async () => view.update(React.createElement(Select, { ...props, value: 'beta' })));
  assert.equal(view.root.findByType('input').props.value, 'Beta');
  await act(async () => view.root.findByType('input').props.onChange({ target: { value: 'missing' } }));
  await act(async () => view.root.findByType('input').props.onKeyDown(key('ArrowDown')));
  assert.equal(view.root.findByType('input').props['aria-activedescendant'], undefined);
  assert.equal(view.root.findAllByProps({ role: 'option' }).length, 0);
  await act(async () => view.update(React.createElement(Select, { ...props, value: '' })));
  assert.equal(view.root.findByType('input').props.value, 'missing');
  await act(async () => view.update(React.createElement(Select, { ...props, value: 12 })));
  assert.equal(view.root.findByType('input').props.value, 'Alpha');
  await act(async () => view.update(React.createElement(Select, { ...props, value: '' })));
  assert.equal(view.root.findByType('input').props.value, '');
  await act(async () => view.unmount());
});
