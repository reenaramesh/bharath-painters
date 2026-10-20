import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { transformWithOxc } from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const stubUrl = `data:text/javascript;base64,${Buffer.from(`export const useAuth=()=>({user:globalThis.__otUser}); export default {get:(...args)=>globalThis.__otApi.get(...args),patch:(...args)=>globalThis.__otApi.patch(...args)};`).toString('base64')}`;
const componentUrl = new URL('./EmployeeOvertimeSettings.jsx', import.meta.url);
async function loadComponent() {
  let source;
  try { source = await fs.readFile(componentUrl, 'utf8'); } catch { return null; }
  source = source.replace(/import useAuth from [^;]+;/, `import { useAuth } from ${JSON.stringify(stubUrl)};`);
  const transformed = await transformWithOxc(source, componentUrl.pathname, { jsx: { runtime: 'automatic' } });
  const code = transformed.code.replace(/from\s+(["'])([^"']+)\1/g, (_match, _quote, path) => `from ${JSON.stringify(path.endsWith('/api/client') ? stubUrl : path.startsWith('.') ? new URL(path, componentUrl).href : path.startsWith('data:') ? path : import.meta.resolve(path))}`);
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
}
const Settings = await loadComponent();
const fixture = { overtime_rate_per_hour: '100.00', overtime_hourly_rate: '100.000000', overtime_rate_source: 'DAY_WAGE', overtime_effective_from: '2026-10-01', overtime_rate_history: [] };
async function mount(props = {}, api = {}) {
  assert.equal(typeof Settings, 'function', 'OT settings component exists');
  globalThis.__otUser = { role: 'CONTRACTOR' };
  globalThis.__otApi = { get: async () => ({ data: fixture }), patch: async () => ({ data: fixture }), ...api };
  let view;
  await act(async () => { view = create(React.createElement(Settings, { data: { membership_id: 4, is_active: true }, ...props })); });
  return view;
}
const text = view => JSON.stringify(view.toJSON());
const input = (view, name) => view.root.findByProps({ name });

test('hourly form sends direct rate and removes day controls', async () => {
 let sent;
 const view = await mount({}, {patch:async(_path,payload)=>{sent=payload;return {data:fixture};}});
 assert.equal(view.root.findAllByProps({name:'overtime_day_hours'}).length,0);
 assert.equal(view.root.findAllByProps({name:'overtime_day_wage'}).length,0);
 assert.equal(input(view,'overtime_rate_per_hour').props.value,'100.00');
 await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
 assert.equal(sent.overtime_rate_per_hour,'100.00');
 assert.equal('overtime_day_hours' in sent,false);
 assert.match(text(view),/OT pay per hour/);
 assert.doesNotMatch(text(view),/per day|OT day|8 hours/);
 await act(async()=>view.unmount());
});

test('settings show configured OT preview and retained failed save inputs', async () => {
  const view = await mount({}, { patch: async () => { throw { response: { data: { overtime_rate_per_hour: ['Rate is too high.'] } } }; } });
  assert.match(text(view), /400/);
  await act(async () => input(view, 'overtime_rate_per_hour').props.onChange({ target: { name: 'overtime_rate_per_hour', value: '900' } }));
  await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(input(view, 'overtime_rate_per_hour').props.value, '900');
  assert.match(text(view), /Rate is too high/);
  await act(async () => view.unmount());
});

test('saved fractional rate and history display hourly pay without day conversion', async () => {
  const saved = { ...fixture, overtime_rate_per_hour: '125.001250', overtime_rate_history: [{ id: 1, hourly_rate: '125.001250', effective_from: '2026-10-01' }] };
  const view = await mount({}, { get: async () => ({ data: saved }) });
  assert.match(text(view), /125\.00125/);
  assert.match(text(view), /500\.01/);
  assert.match(text(view), /per hour/);
  assert.doesNotMatch(text(view), /per day|OT day|8 hours/);
  await act(async () => view.unmount());
});
test('persisted settings stay saved when parent refresh fails', async () => {
  let refreshed = false;
  const view = await mount({ onSaved: async () => { refreshed = true; throw new Error('offline'); } });
  await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(refreshed, true);
  assert.match(text(view), /saved/i);
  assert.equal(view.root.findAllByProps({ role: 'alert' }).length, 0);
  await act(async () => view.unmount());
});
test('removed employees and noncontractors have no editable OT form', async () => {
  const view = await mount({ data: { membership_id: 4, is_active: false } });
  assert.equal(view.root.findAllByType('form').length, 0);
  await act(async () => view.update(React.createElement(Settings, { data: { membership_id: 4 } })));
  globalThis.__otUser = { role: 'APPLICATOR' };
  await act(async () => view.update(React.createElement(Settings, { data: { membership_id: 4 } })));
  assert.equal(view.root.findAllByType('form').length, 0);
  await act(async () => view.unmount());
});
test('load failure offers retry that restores settings', async () => {
  let attempts = 0;
  const view = await mount({}, { get: async () => { if (++attempts === 1) throw new Error('offline'); return { data: fixture }; } });
  assert.equal(view.root.findAllByType('form').length, 0);
  const retry = view.root.findAllByType('button').find(button => button.children.includes('Retry overtime settings'));
  assert.ok(retry);
  await act(async () => retry.props.onClick());
  assert.equal(view.root.findAllByType('form').length, 1);
  await act(async () => view.unmount());
});
test('late response for previous employee cannot overwrite current settings', async () => {
  let resolveOld;
  const view = await mount({}, { get: path => path.includes('/4/') ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ data: { ...fixture, overtime_rate_per_hour: '200.00' } }) });
  await act(async () => view.update(React.createElement(Settings, { data: { membership_id: 5 } })));
  await act(async () => resolveOld({ data: fixture }));
  assert.equal(input(view, 'overtime_rate_per_hour').props.value, '200.00');
  await act(async () => view.unmount());
});
test('read-only preview shows saved settings after editing permission changes', async () => {
  const view = await mount();
  await act(async () => input(view, 'overtime_rate_per_hour').props.onChange({ target: { name: 'overtime_rate_per_hour', value: '1600' } }));
  await act(async () => view.update(React.createElement(Settings, { data: { membership_id: 4, is_active: false } })));
  assert.match(text(view), /400/);
  assert.doesNotMatch(text(view), /1,600/);
  await act(async () => view.unmount());
});
test('duplicate submissions send one request and previous employee save cannot overwrite next employee', async () => {
  let finishSave;
  let saves = 0;
  let refreshes = 0;
  const view = await mount({ onSaved: async () => { refreshes++; } }, { patch: async () => { saves++; return new Promise(resolve => { finishSave = resolve; }); }, get: async path => ({ data: { ...fixture, overtime_rate_per_hour: path.includes('/5/') ? '200.00' : '100.00' } }) });
  let savePromise;
  await act(async () => {
    savePromise = view.root.findByType('form').props.onSubmit({ preventDefault() {} });
    await view.root.findByType('form').props.onSubmit({ preventDefault() {} });
  });
  assert.equal(saves, 1);
  await act(async () => view.update(React.createElement(Settings, { data: { membership_id: 5 } })));
  await act(async () => { finishSave({ data: fixture }); await savePromise; });
  assert.equal(input(view, 'overtime_rate_per_hour').props.value, '200.00');
  assert.equal(refreshes, 0);
  await act(async () => view.unmount());
});
