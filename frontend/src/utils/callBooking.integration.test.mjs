import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { transformWithOxc } from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const uiStub = `import React from ${JSON.stringify(import.meta.resolve('react'))}; export default ({children,title})=>React.createElement('section',null,React.createElement('h2',null,title),children);`;
const uiUrl = `data:text/javascript;base64,${Buffer.from(uiStub).toString('base64')}`;
const url = new URL('../components/CallVisitConversionDialog.jsx', import.meta.url);
let source = (await fs.readFile(url, 'utf8')).replace("import api from '../api/client';", 'const api = { post: (...args) => globalThis.__callBookingApi.post(...args) };');
for (const match of [...source.matchAll(/from\s+(['"])([^'"]+)\1/g)]) {
  const name = match[2];
  const resolved = name.includes('ContractorDialog') || name.includes('CustomerActivationShare') ? uiUrl : name.startsWith('.') ? new URL(`${name}.js`, url).href : import.meta.resolve(name);
  source = source.replace(match[0], `from ${JSON.stringify(resolved)}`);
}
const result = await transformWithOxc(source, url.pathname, { jsx: { runtime: 'automatic' } });
const code = result.code.replace(/from\s+(['"])([^'"]+)\1/g, (match, _quote, name) => name.startsWith('data:') || name.startsWith('file:') ? match : `from ${JSON.stringify(import.meta.resolve(name))}`);
const { default: Conversion } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const text = (node) => typeof node === 'string' ? node : (node?.children || []).map(text).join('');

test('pending approval and retry failure retain entered visit details without reporting a booked visit', async () => {
  let view;
  let booked = 0;
  globalThis.__callBookingApi = { post: async (path) => {
    if (path.endsWith('/share-link/')) return { data: { share_link: '/customer-link/test', link_purpose: 'CONNECTION' } };
    throw { response: { data: { code: 'CUSTOMER_APPROVAL_REQUIRED', detail: 'Customer approval is required.' } } };
  } };
  try {
    await act(async () => { view = create(React.createElement(MemoryRouter, null, React.createElement(Conversion, { event: { id: 7, matched_customer: 2, customer_name: 'Caller', phone_number: '9000000000' }, onClose() {}, onBooked() { booked++; } }))); });
    for (const [name, value] of Object.entries({ date: '2030-05-12', time: '10:30', comment: 'Keep these notes' })) {
      await act(async () => view.root.findByProps({ name }).props.onChange({ target: { name, value } }));
    }
    await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(booked, 0);
    assert.match(text(view.toJSON()), /Customer approval is required/);
    assert.match(text(view.toJSON()), /Share approval link/);
    assert.doesNotMatch(text(view.toJSON()), /Site visit booked/);
    assert.equal(view.root.findByProps({ name: 'comment' }).props.value, 'Keep these notes');
    assert.equal(view.root.findByProps({ name: 'date' }).props.value, '2030-05-12');
    globalThis.__callBookingApi.post = async () => { throw new Error('Network unavailable'); };
    await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(booked, 0);
    assert.match(text(view.toJSON()), /Network unavailable/);
    assert.equal(view.root.findByProps({ name: 'time' }).props.value, '10:30');
  } finally {
    if (view) await act(async () => view.unmount());
    delete globalThis.__callBookingApi;
  }
});

test('booking a new unregistered customer preserves the explicit activation-share handoff', async () => {
  let view;
  let booked = 0;
  const calls = [];
  globalThis.__callBookingApi = { post: async (path) => {
    calls.push(path);
    if (path.endsWith('add-customer/')) return { data: { action: 'CREATE' } };
    if (path === '/quotations/customers/') return { data: { id: 2, name: 'New caller', connection_status: 'CONNECTED', activation_pending: true, share_link: '/customer-link/activation-test', link_purpose: 'ACTIVATION' } };
    if (path.endsWith('link-customer/')) return { data: { id: 7, matched_customer: 2 } };
    return { data: { booked_follow_up: 33, booked_visit: { next_follow_up: '2030-05-12T05:00:00Z' } } };
  } };
  try {
    await act(async () => { view = create(React.createElement(MemoryRouter, null, React.createElement(Conversion, { event: { id: 7, caller_name: 'New caller', phone_number: '9000000000' }, onClose() {}, onBooked() { booked++; } }))); });
    for (const [name, value] of Object.entries({ date: '2030-05-12', time: '10:30' })) await act(async () => view.root.findByProps({ name }).props.onChange({ target: { name, value } }));
    await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(booked, 1);
    const shareButton = view.root.findAllByType('button').find((node) => text(node) === 'Share customer activation link');
    assert.ok(shareButton, 'New customer activation remains available after booking');
    await act(async () => shareButton.props.onClick());
    const share = view.root.findAll((node) => node.props.customer?.link_purpose === 'ACTIVATION');
    assert.equal(share.length, 1);
    assert.equal(share[0].props.customer.share_link, '/customer-link/activation-test');
    assert.equal(calls.length, 4, 'Opening the share view does not send a message or create another request');
  } finally {
    if (view) await act(async () => view.unmount());
    delete globalThis.__callBookingApi;
  }
});
