import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import React from 'react';
import { act, create } from 'react-test-renderer';
const url = new URL('./RegistrationConsent.jsx', import.meta.url);
const source = await readFile(url, 'utf8');
const pending = [];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__consentApi = { get: (...args) => new Promise((resolve, reject) => pending.push({ args, resolve, reject })) };
const transformed = await transformWithOxc(source.replace(/import api from [^;]+;/, 'const api = globalThis.__consentApi;').replace(/import \{ Dialog \} from [^;]+;/, 'const Dialog = ({ children }) => children;'), 'RegistrationConsent.jsx', { jsx: { runtime: 'automatic' } });
const code = transformed.code.replace(/from\s+(["'])([^"']+)\1/g, (_m, _q, specifier) => `from ${JSON.stringify(import.meta.resolve(specifier))}`);
const { default: Consent } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const policy = {policy_version:'current',terms_title:'Terms',terms_sections:[],privacy_title:'Privacy',privacy_sections:[],references:[]};
test('policy readiness is separate from acceptance and failures can retry without a checkbox', async () => {
 const updates=[]; let view; const onConsentChange=value=>updates.push(value);
 await act(async()=>{view=create(React.createElement(Consent,{role:'CUSTOMER',onConsentChange}));});
 assert.equal(updates.at(-1).accepted, false);
 await act(async()=>pending.shift().reject(new Error('offline')));
 const retry=view.root.findAllByType('button').find(button=>button.children.includes('Retry'));
 assert.ok(retry, 'a failed policy load must offer Retry');
 await act(async()=>retry.props.onClick());
 await act(async()=>pending.shift().resolve({data:policy}));
 assert.equal(updates.at(-1).ready,true);
 assert.equal(updates.at(-1).accepted,false);
 assert.equal(updates.at(-1).policyVersion,'current');
 assert.equal(view.root.findAllByType('input').length,0);
 assert.equal(view.root.findAllByType('a').length,2);
 await act(async()=>view.unmount());
});


test('role changes invalidate policy readiness and document links never accept on review', async () => {
 const updates=[]; const onConsentChange=value=>updates.push(value); let view;
 await act(async()=>{view=create(React.createElement(Consent,{role:'CONTRACTOR',onConsentChange}));});
 assert.equal(pending[0].args[1].params.role,'CONTRACTOR');
 await act(async()=>pending.shift().resolve({data:policy}));
 await act(async()=>view.root.findAllByType('a')[0].props.onClick({preventDefault(){}}));
 assert.equal(updates.at(-1).accepted,false);
 assert.ok(view.root.findAllByType('h3').some(node=>node.children.includes('Terms')));
 await act(async()=>view.update(React.createElement(Consent,{role:'PAINTER',onConsentChange})));
 assert.equal(updates.at(-1).ready,false);
 assert.equal(pending[0].args[1].params.role,'PAINTER');
 await act(async()=>pending.shift().resolve({data:{terms_sections:[],privacy_sections:[]}}));
 assert.equal(updates.at(-1).ready,false);
 assert.ok(view.root.findAllByProps({role:'alert'}).length);
 await act(async()=>view.unmount());
});
