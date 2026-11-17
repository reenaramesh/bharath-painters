import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const pending = [];
let queueGets = false;
globalThis.__authSession = { user:null, login:(...args)=>new Promise((resolve,reject)=>pending.push({args:["LOGIN",...args],resolve,reject})), googleLogin:()=>{} };
globalThis.__authApi = { post: (...args) => new Promise((resolve, reject) => pending.push({ args, resolve, reject })), get: (...args) => queueGets ? new Promise((resolve,reject)=>pending.push({args,resolve,reject})) : Promise.resolve({ data: {} }) };
const cache = new Map();
async function load(url) {
  if (cache.has(url.href)) return cache.get(url.href);
  let source = await readFile(url, 'utf8');
  source = source.replace(/import\s+["'][^"']+\.css["'];?/g, '').replace(/import api from [^;]+;/, 'const api = globalThis.__authApi;').replace(/import RegistrationConsent from [^;]+;/, 'function RegistrationConsent({onConsentChange}) { useEffect(() => { onConsentChange({ready:true, policyVersion:"current"}); }, [onConsentChange]); return null; }');
  source = source.replace(/import useAuth from [^;]+;/, 'const useAuth = () => globalThis.__authSession;')
    .replace(/import \{ useLanguage \} from [^;]+;/, 'const useLanguage = () => ({t:key=>key});')
    .replace(/import LanguageSelector from [^;]+;/, 'const LanguageSelector = () => null;')
    .replace(/import ServiceIllustration from [^;]+;/, 'const ServiceIllustration = () => null;')
    .replace(/import \{ Dialog \} from [^;]+;/, 'const Dialog = () => null;')
    .replace('import.meta.env.VITE_GOOGLE_CLIENT_ID', 'globalThis.__authGoogleClientId');
  // Register only originally imports useState; the policy stub needs useEffect.
  source = source.replace(/import \{ useState \} from "react";/, 'import { useEffect, useState } from "react";');
  const result = await transformWithOxc(source, url.pathname, { jsx: { runtime: 'automatic' } });
  const imports = [...result.code.matchAll(/from\s+(["'])([^"']+)\1/g)];
  let code = result.code;
  for (const match of imports) {
    const specifier = match[2];
    const resolved = specifier.startsWith('.') ? await load(new URL(specifier.match(/\.[cm]?[jt]sx?$/) ? specifier : `${specifier}.jsx`, url)) : import.meta.resolve(specifier);
    code = code.replace(match[0], `from ${JSON.stringify(resolved)}`);
  }
  const data = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  cache.set(url.href, data);
  return data;
}
const components = {};
for (const name of ['Register','CustomerRegister','ForgotPassword','InHouseEmployeeActivation','Login']) components[name] = (await import(await load(new URL(`./${name}.jsx`, import.meta.url)))).default;
function Destination() { const location = useLocation(); return React.createElement('output', {}, location.pathname + JSON.stringify(location.state)); }
function Navigator() { globalThis.__authTestNavigate = useNavigate(); return null; }
async function mount(name, entry = '/') {
 let view;
 await act(async () => {
  view=create(React.createElement(MemoryRouter,{initialEntries:[entry]}, React.createElement(Navigator), React.createElement(Routes,{},
   React.createElement(Route,{path:name==='InHouseEmployeeActivation'?'/employee-activation/:token':'/',element:React.createElement(components[name])}),
   ...['/login','/other','/dashboard','/customer-dashboard'].map(path=>React.createElement(Route,{key:path,path,element:React.createElement(Destination)}))
  )), {createNodeMock:()=>({clientWidth:400,innerHTML:''})});
 });
 return view;
}
const text = view => JSON.stringify(view.toJSON());
const button = (view, label) => view.root.findAllByType('button').find(node => node.children.some(child => typeof child === 'string' && child.includes(label)));
const field = (view, name) => view.root.findAllByType('input').find(node => node.props.name === name || node.props.id === name);
async function change(node, value) { await act(async () => node.props.onChange({target:{name:node.props.name,value}})); }
async function submit(view) { await act(async () => { view.root.findByType('form').props.onSubmit({preventDefault(){}}); }); }
async function respond(data) { const request = pending.shift(); assert.ok(request, 'expected an API request'); await act(async () => request.resolve(['LOGIN','GOOGLE'].includes(request.args[0]) ? data : {data})); return request; }
async function reject(data, headers = {}) { await act(async () => pending.shift().reject({response:{data,headers}})); }
async function recoveryOtp(view, data = {}) {
 await change(view.root.findByType('input'), '9876543210'); await submit(view); await respond({can_reset:true,masked_email:'private@example.com',bharath_id:'PRIVATE',...data});
 await act(async()=>{ button(view,'Send').props.onClick(); }); await respond({challenge_id:'opaque-first',test_otp:'123456',resend_after_seconds:60});
}

test('recovery never exposes account lookup details or developer OTP and begins a resend cooldown', async () => {
 const view = await mount('ForgotPassword');
 try { await recoveryOtp(view); assert.doesNotMatch(text(view),/private@example.com|PRIVATE|123456|Development/); assert.equal(button(view,'Resend').props.disabled,true); assert.match(text(view),/60s/); } finally { await act(async()=>view.unmount()); }
});

test('registration verifies its delivered code and prevents immediate resend without exposing developer OTP', async () => {
 const view=await mount('Register');
 try {
 for (const [name,value] of Object.entries({name:'Painter',mobile:'9876543210',email:'user@example.com',password:'Examplepass123!'})) await change(field(view,name),value);
 await submit(view); await respond({email_verification_pending:true,challenge_id:'initial',masked_email:'u***@example.com',test_otp:'654321',resend_after_seconds:60});
 assert.doesNotMatch(text(view),/654321|Development/); assert.equal(button(view,'Resend').props.disabled,true);
 await change(view.root.findByProps({autoComplete:'one-time-code'}),'123456'); await submit(view);
 assert.equal(pending[0].args[0],'/accounts/register/email/verify/'); assert.equal(pending[0].args[1].challenge_id,'initial');
 await respond({email_verified:true}); assert.match(text(view),/registered/);
 } finally { await act(async()=>view.unmount()); }
});

test('customer registration verifies email before preserving its property destination', async () => {
 const view=await mount('CustomerRegister');
 try {
 for (const [name,value] of Object.entries({name:'Customer',mobile:'9876543210',email:'customer@example.com',password:'Examplepass123!'})) await change(field(view,name),value);
 await submit(view); await respond({email_verification_pending:true,challenge_id:'customer-challenge',masked_email:'c***@example.com',property_id:42,resend_after_seconds:60});
 assert.ok(view.root.findAllByProps({autoComplete:'one-time-code'}).length,'pending email must be verified before sign in');
 await change(view.root.findByProps({autoComplete:'one-time-code'}),'123456'); await submit(view); await respond({email_verified:true});
 assert.match(text(view),/customerRegistered/); assert.match(text(view),/customer-properties\/42/);
 } finally { await act(async()=>view.unmount()); }
});


test('restarting recovery clears its old challenge and allows a different mobile without the old cooldown', async () => {
 const view=await mount('ForgotPassword');
 try {
 await recoveryOtp(view);
 await act(async()=>{button(view,'Use another').props.onClick();});
 await change(view.root.findByType('input'),'9123456789'); await submit(view); await respond({can_reset:true});
 assert.equal(button(view,'Send').props.disabled,false,'a new account must not inherit the previous account cooldown');
 } finally { await act(async()=>view.unmount()); }
});

test('recovery resend waits, replaces its challenge, clears the old OTP and announces invalid or expired codes', async (t) => {
 t.mock.timers.enable({apis:['Date','setInterval']});
 const view=await mount('ForgotPassword');
 try {
 await recoveryOtp(view);
 await change(view.root.findByProps({autoComplete:'one-time-code'}),'111111');
 await submit(view); assert.equal(pending[0].args[1].challenge_id,'opaque-first'); await reject({otp:['Code has expired. Request a new code.']});
 assert.match(view.root.findByProps({role:'alert'}).children.join(''),/expired/);
 await act(async()=>t.mock.timers.tick(60000));
 assert.equal(button(view,'Resend').props.disabled,false);
 await act(async()=>{button(view,'Resend').props.onClick();}); await respond({challenge_id:'opaque-second',resend_after_seconds:30});
 assert.equal(view.root.findByProps({autoComplete:'one-time-code'}).props.value,'');
 assert.equal(button(view,'Resend').props.disabled,true);
 await change(view.root.findByProps({autoComplete:'one-time-code'}),'222222'); await submit(view);
 assert.deepEqual(pending[0].args[1],{challenge_id:'opaque-second',otp:'222222'});
 await respond({reset_token:'one-use-reset-token'});
 await change(field(view,'new-password'),'Betterpass123!');
 await change(view.root.findAllByType('input')[1],'Different123!'); await submit(view);
 assert.equal(pending.length,0); assert.match(text(view),/Passwords do not match/);
 await change(view.root.findAllByType('input')[1],'Betterpass123!'); await submit(view);
 assert.deepEqual(pending[0].args[1],{reset_token:'one-use-reset-token',new_password:'Betterpass123!',confirm_password:'Betterpass123!'});
 await respond({message:'Password reset.'});
 assert.match(text(view),/passwordReset/); assert.doesNotMatch(text(view),/one-use-reset-token|Betterpass123/);
 } finally { await act(async()=>view.unmount()); t.mock.timers.reset(); }
});

test('registration recovers from delivery failure, respects throttle and verifies only the latest challenge', async (t) => {
 t.mock.timers.enable({apis:['Date','setInterval']});
 const view=await mount('Register');
 try {
 await act(async()=>{button(view,'Employee')?.props.onClick();});
 // Role buttons contain their visible label in a paragraph.
 const employee=view.root.findAllByProps({'aria-pressed':false}).find(node=>node.props.onClick);
 if(employee) await act(async()=>{employee.props.onClick();});
 for (const [name,value] of Object.entries({name:'Employee',mobile:'9876543210',email:'user@example.com',password:'Examplepass123!'})) await change(field(view,name),value);
 await submit(view); assert.equal(pending[0].args[0],'/accounts/register/painter/');
 await respond({email_verification_pending:true,email_verification_error:'Email could not be delivered.'});
 assert.match(text(view),/Email could not be delivered/); assert.equal(button(view,'Resend').props.disabled,false);
 await act(async()=>{button(view,'Resend').props.onClick();});
 const request=pending.shift(); assert.deepEqual(request.args[1],{mobile:'9876543210',password:'Examplepass123!'});
 await act(async()=>request.reject({response:{status:429,headers:{'retry-after':'12'},data:{detail:'Wait before requesting another code.'}}}));
 assert.equal(button(view,'Resend').props.disabled,true); assert.match(text(view),/12s/);
 await act(async()=>t.mock.timers.tick(12000));
 await act(async()=>{button(view,'Resend').props.onClick();}); await respond({challenge_id:100,masked_email:'u***@example.com',resend_after_seconds:1});
 await change(view.root.findByProps({autoComplete:'one-time-code'}),'111111');
 await act(async()=>t.mock.timers.tick(1000)); await act(async()=>{button(view,'Resend').props.onClick();}); await respond({challenge_id:101,resend_after_seconds:60});
 assert.equal(view.root.findByProps({autoComplete:'one-time-code'}).props.value,'');
 await change(view.root.findByProps({autoComplete:'one-time-code'}),'333333'); await submit(view); assert.equal(pending[0].args[1].challenge_id,101);
 await reject({otp:['The code is invalid.']});
 const input=view.root.findByProps({autoComplete:'one-time-code'}); assert.equal(input.props['aria-invalid'],true); assert.equal(input.props['aria-describedby'],'registration-code-error'); assert.match(text(view),/code is invalid/);
 } finally { await act(async()=>view.unmount()); t.mock.timers.reset(); }
});

test('customer without an email keeps the existing direct sign-in path', async () => {
 const view=await mount('CustomerRegister');
 try {
 for(const [name,value] of Object.entries({name:'Customer',mobile:'9876543210',password:'Examplepass123!'})) await change(field(view,name),value);
 assert.equal(field(view,'email').props.required,false);
 await submit(view); await respond({}); assert.match(text(view),/customerRegistered/);
 } finally { await act(async()=>view.unmount()); }
});

test('identity fields cannot change while registration or recovery requests are pending', async () => {
 for (const name of ['Register','CustomerRegister','ForgotPassword']) {
 const view=await mount(name);
 try {
 if(name==='ForgotPassword') await change(view.root.findByType('input'),'9876543210');
 else for(const [key,value] of Object.entries({name:'Account',mobile:'9876543210',email:'user@example.com',password:'Examplepass123!'})) await change(field(view,key),value);
 await submit(view);
 assert.ok(view.root.findAllByType('input').every(node=>node.props.disabled),'identity and credentials must be locked while request is pending');
 assert.ok(view.root.findAllByType('select').every(node=>node.props.disabled),'role must be locked while request is pending');
 await reject({detail:'Connection unavailable. Try again.'});
 assert.ok(view.root.findAllByType('input').every(node=>!node.props.disabled));
 assert.match(text(view),/Connection unavailable/);
 } finally { if(pending.length) await reject({detail:'Cancelled'}); await act(async()=>view.unmount()); }
 }
});

test('unmounted registration verification ignores a delayed success response', async () => {
 const Verification=(await import(await load(new URL('../components/RegistrationEmailVerification.jsx',import.meta.url)))).default;
 let completed=0,view;
 await act(async()=>{view=create(React.createElement(Verification,{initialVerification:{challenge_id:'late'},mobile:'9876543210',password:'Examplepass123!',email:'user@example.com',onVerified:()=>completed++}));});
 await change(view.root.findByType('input'),'123456'); await submit(view); await act(async()=>view.unmount()); await respond({email_verified:true});
 assert.equal(completed,0,'a stale request cannot redirect after leaving verification');
});

test('recovery network failure is announced, retains identity, and supports retry', async () => {
 const view=await mount('ForgotPassword');
 try {
 await change(view.root.findByType('input'),'9876543210'); await submit(view); await act(async()=>pending.shift().reject(new Error('Network error')));
 assert.match(view.root.findByProps({role:'alert'}).children.join(''),/Try again/);
 assert.equal(view.root.findByType('input').props.value,'9876543210');
 assert.equal(view.root.findByType('input').props['aria-invalid'],true);
 await submit(view); await respond({can_reset:true}); await act(async()=>{button(view,'Send').props.onClick();}); await act(async()=>pending.shift().reject(new Error('Network error')));
 assert.match(text(view),/Code could not be sent/); assert.equal(button(view,'Send').props.disabled,false);
 await act(async()=>{button(view,'Send').props.onClick();}); await respond({challenge_id:'retried',resend_after_seconds:60});
 await change(view.root.findByProps({autoComplete:'one-time-code'}),'123456'); await submit(view);
 assert.equal(view.root.findByType('form').findAllByType('button')[0].props.disabled,true); assert.equal(button(view,'Use another').props.disabled,true);
 await respond({reset_token:'expired-token'});
 await change(field(view,'new-password'),'Examplepass123!'); await change(view.root.findAllByType('input')[1],'Examplepass123!'); await submit(view); await reject({reset_token:['This reset request has expired or was already used. Start again.']});
 assert.match(text(view),/expired or was already used/); assert.equal(field(view,'new-password').props.value,'Examplepass123!');
 await act(async()=>{button(view,'Use another').props.onClick();}); assert.equal(view.root.findAllByProps({autoComplete:'new-password'}).length,0);
 } finally { await act(async()=>view.unmount()); }
});

test('recovery explains a server rate-limit delay before the first code request', async (t) => {
 t.mock.timers.enable({apis:['Date','setInterval']});
 const view=await mount('ForgotPassword');
 try {
 await change(view.root.findByType('input'),'9876543210'); await submit(view); await respond({can_reset:true});
 await act(async()=>{button(view,'Send').props.onClick();});
 await act(async()=>pending.shift().reject({response:{status:429,headers:{'retry-after':'5'},data:{detail:'Please wait before trying again.'}}}));
 assert.match(text(view),/5s/,'the disabled send action must explain when retry is available');
 await act(async()=>t.mock.timers.tick(5000)); assert.equal(button(view,'Send').props.disabled,false);
 } finally { await act(async()=>view.unmount()); t.mock.timers.reset(); }
});

test('recovery shows production email unavailability without losing identity or claiming a code was sent', async () => {
 const view=await mount('ForgotPassword');
 try {
 await change(view.root.findByType('input'),'9876543210'); await submit(view); await respond({can_reset:true});
 await act(async()=>{button(view,'Send').props.onClick();});
 await reject({detail:'Password recovery email is temporarily unavailable. Please try again later.'});
 assert.match(text(view),/Password recovery email is temporarily unavailable/);
 assert.equal(button(view,'Send').props.disabled,false);
 assert.equal(view.root.findAllByProps({autoComplete:'one-time-code'}).length,0);
 await act(async()=>{button(view,'Send').props.onClick();});
 const request=pending[0]; assert.equal(request.args[1].mobile,'9876543210');
 await respond({challenge_id:'retry-after-configuration-fix',resend_after_seconds:60});
 assert.equal(view.root.findAllByProps({autoComplete:'one-time-code'}).length,1);
 } finally { await act(async()=>view.unmount()); }
});

test('pending registration and lookup submissions cannot create duplicate requests', async () => {
 for(const name of ['Register','CustomerRegister','ForgotPassword']) {
 const view=await mount(name);
 try {
 if(name==='ForgotPassword') await change(view.root.findByType('input'),'9876543210');
 else for(const [key,value] of Object.entries({name:'Account',mobile:'9876543210',email:'user@example.com',password:'Examplepass123!'})) await change(field(view,key),value);
 await submit(view); await submit(view); assert.equal(pending.length,1,`${name} should ignore another submit while pending`);
 } finally { while(pending.length) await reject({detail:'Test completed'}); await act(async()=>view.unmount()); }
 }
});

test('email verification can resume from sign in using credentials, with retry, throttle and already-verified feedback', async (t) => {
 const appSource=await readFile(new URL('../App.jsx',import.meta.url),'utf8');
 const loginSource=await readFile(new URL('./Login.jsx',import.meta.url),'utf8');
 assert.match(appSource,/path="\/verify-email"/,'resume verification must have a public route');
 assert.match(loginSource,/to="\/verify-email"/,'sign in must link to resume verification');
 components.VerifyEmail=(await import(await load(new URL('./VerifyEmail.jsx',import.meta.url)))).default;
 t.mock.timers.enable({apis:['Date','setInterval']});
 const view=await mount('VerifyEmail');
 try {
 await change(field(view,'verify-email-mobile'),'9876543210'); await change(field(view,'verify-email-password'),'Examplepass123!');
 await submit(view); assert.deepEqual(pending[0].args,['/accounts/register/email/request/',{mobile:'9876543210',password:'Examplepass123!'}]);
 await reject({detail:'Account details are incorrect.'}); assert.match(text(view),/Account details are incorrect/); assert.equal(field(view,'verify-email-mobile').props.value,'9876543210');
 await submit(view); await act(async()=>pending.shift().reject(new Error('Network error'))); assert.match(text(view),/Try again/);
 await submit(view); await act(async()=>pending.shift().reject({response:{status:429,headers:{'retry-after':'2'},data:{detail:'Please wait.'}}})); assert.match(text(view),/2s/); assert.equal(view.root.findByType('form').findAllByType('button')[0].props.disabled,true);
 await act(async()=>t.mock.timers.tick(2000)); await submit(view); await act(async()=>pending.shift().reject({response:{status:409,data:{detail:'Email already verified.'}}})); assert.match(text(view),/Email already verified/); assert.ok(view.root.findAllByProps({href:'/login'}).length);
 await submit(view); await respond({email_verification_pending:true,challenge_id:'resumed',masked_email:'u***@example.com',resend_after_seconds:60});
 await change(view.root.findByProps({autoComplete:'one-time-code'}),'123456'); await submit(view); assert.equal(pending[0].args[1].challenge_id,'resumed'); await respond({email_verified:true}); assert.match(text(view),/emailVerified/);
 } finally { await act(async()=>view.unmount()); t.mock.timers.reset(); }
});


test('employee activation announces loading and offers retry after a network error', async () => {
 queueGets=true;
 const view=await mount('InHouseEmployeeActivation','/employee-activation/first');
 try {
 assert.match(text(view),/Checking.*activation/i);
 await act(async()=>pending.shift().reject(new Error('offline')));
 const retry=button(view,'Retry'); assert.ok(retry,'failed activation lookup must offer retry');
 await act(async()=>{retry.props.onClick();}); await respond({name:'Employee A',mobile:'9876543210'});
 assert.ok(view.root.findAllByType('form').length);
 await change(view.root.findAllByType('input')[0],'Examplepass123!'); await change(view.root.findAllByType('input')[1],'Differentpass123!'); await submit(view);
 assert.equal(pending.length,0); assert.match(text(view),/Passwords do not match/);
 assert.ok(view.root.findAllByType('input').every(node=>node.props['aria-describedby']));
 await change(view.root.findAllByType('input')[1],'Examplepass123!'); await submit(view);
 assert.ok(view.root.findAllByType('input').every(node=>node.props.disabled));
 await reject({password:['Choose a stronger password.']}); assert.match(text(view),/stronger password/);
 await submit(view); await respond({detail:'Password set successfully.'});
 assert.equal(view.root.findAllByType('input').length,0); assert.match(text(view),/Sign in/);
 } finally {while(pending.length) await reject({detail:'cancelled'}); await act(async()=>view.unmount()); queueGets=false;}
});

test('employee token changes clear credentials and ignore delayed prior-token submit results', async () => {
 queueGets=true;
 const view=await mount('InHouseEmployeeActivation','/employee-activation/first');
 try {
 await respond({name:'Employee A',mobile:'9876543210'});
 for(const input of view.root.findAllByType('input')) await change(input,'Examplepass123!'); await submit(view);
 await act(async()=>globalThis.__authTestNavigate('/employee-activation/second'));
 assert.equal(view.root.findAllByType('form').length,0,'a previous employee form cannot remain during a new token lookup');
 await respond({detail:'Old token password set.'});
 await respond({name:'Employee B',mobile:'9123456780'});
 assert.doesNotMatch(text(view),/Employee A|Old token password/);
 assert.ok(view.root.findAllByType('input').every(node=>node.props.value===''));
 } finally {while(pending.length) await reject({detail:'cancelled'});await act(async()=>view.unmount());queueGets=false;}
});

test('password sign in locks credentials and ignores duplicate submissions', async () => {
 const view=await mount('Login');
 try {
 await change(view.root.findAllByType('input')[0],'9876543210'); await change(view.root.findAllByType('input')[1],'Examplepass123!'); await submit(view); await submit(view);
 assert.equal(pending.length,1); assert.ok(view.root.findAllByType('input').every(node=>node.props.disabled));
 await reject({detail:'Account details are incorrect.'}); assert.match(text(view),/Account details are incorrect/);
 assert.equal(view.root.findAllByType('input')[0].props.value,'9876543210');
 await submit(view); await respond({role:'PAINTER'}); assert.match(text(view),/dashboard/);
 }finally {while(pending.length) await reject({detail:'cancelled'});await act(async()=>view.unmount());}
});

test('leaving password sign in prevents a delayed response from redirecting another page', async () => {
 const view=await mount('Login');
 try {
 await change(view.root.findAllByType('input')[0],'9876543210'); await change(view.root.findAllByType('input')[1],'Examplepass123!'); await submit(view);
 await act(async()=>globalThis.__authTestNavigate('/other')); await respond({role:'CONTRACTOR'});
 assert.match(text(view),/other/);
 }finally {while(pending.length) await reject({detail:'cancelled'});await act(async()=>view.unmount());}
});


test('Google sign in ignores a delayed callback after leaving the sign-in page', async () => {
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 let callback,view;
 globalThis.__authGoogleClientId='local-test-client';
 globalThis.window={google:{accounts:{id:{initialize:options=>{callback=options.callback;},renderButton:()=>{}}}}};
 globalThis.document={querySelector:()=>({})};
 globalThis.__authSession.googleLogin=(...args)=>new Promise((resolve,reject)=>pending.push({args:['GOOGLE',...args],resolve,reject}));
 try {
 view=await mount('Login'); assert.equal(typeof callback,'function');
 await act(async()=>{callback({credential:'local-fake-credential'});});
 await act(async()=>globalThis.__authTestNavigate('/other')); await respond({role:'CONTRACTOR'});
 assert.match(text(view),/other/);
 await act(async()=>{callback({credential:'local-fake-credential'});}); assert.equal(pending.length,0,'callbacks after unmount must not begin a sign-in request');
 } finally {
 while(pending.length) await reject({detail:'cancelled'});if(view) await act(async()=>view.unmount());
 globalThis.window=previousWindow;globalThis.document=previousDocument;globalThis.__authGoogleClientId=undefined;
 }
});

test('registration failures preserve readable text and associate errors with the retained fields', async () => {
 for(const name of ['Register','CustomerRegister']) {
 const view=await mount(name);
 try {
 for(const [key,value] of Object.entries({name:'Account',mobile:'9876543210',email:'user@example.com',password:'Examplepass123!'})) await change(field(view,key),value);
 await submit(view); await reject('Registration temporarily unavailable. Try again.');
 const alert=view.root.findByProps({role:'alert'}); assert.equal(alert.children.join(''),'Registration temporarily unavailable. Try again.');
 assert.ok(view.root.findAllByType('input').every(input=>input.props['aria-describedby']===alert.props.id));
 assert.equal(field(view,'email').props.value,'user@example.com');
 }finally {while(pending.length) await reject({detail:'cancelled'});await act(async()=>view.unmount());}
 }
});

test('sign in error region exists before submit and describes both credential fields', async () => {
 const view=await mount('Login');
 try {
 const alert=view.root.findByProps({role:'alert'});assert.equal(alert.children.length,0);
 assert.ok(view.root.findAllByType('input').every(input=>input.props['aria-describedby']===alert.props.id));
 } finally {await act(async()=>view.unmount());}
});

test('invalid employee activation links never expose a password form and offer sign in', async () => {
 queueGets=true;const view=await mount('InHouseEmployeeActivation','/employee-activation/invalid');
 try {
 const request=pending.shift();await act(async()=>request.reject({response:{status:404,data:{detail:'Activation link is invalid or expired.'}}}));
 assert.match(text(view),/invalid or expired/);assert.equal(view.root.findAllByType('form').length,0);assert.equal(button(view,'Retry'),undefined);assert.ok(view.root.findAllByProps({href:'/login'}).length);
 }finally {while(pending.length) await reject({detail:'cancelled'});await act(async()=>view.unmount());queueGets=false;}
});


test('Google callbacks cannot start overlapping sign-in requests', async () => {
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 let callback,view;
 globalThis.__authGoogleClientId='local-test-client';
 globalThis.window={google:{accounts:{id:{initialize:options=>{callback=options.callback;},renderButton:()=>{}}}}};
 globalThis.document={querySelector:()=>({})};
 globalThis.__authSession.googleLogin=(...args)=>new Promise((resolve,reject)=>pending.push({args:['GOOGLE',...args],resolve,reject}));
 try {
 view=await mount('Login');
 await act(async()=>{callback({credential:'local-fake-credential'});callback({credential:'local-fake-credential'});});
 assert.equal(pending.length,1,'only one Google login may be pending');
 await respond({role:'CUSTOMER'});assert.match(text(view),/customer-dashboard/);
 }finally {while(pending.length) await reject({detail:'cancelled'});if(view)await act(async()=>view.unmount());globalThis.window=previousWindow;globalThis.document=previousDocument;globalThis.__authGoogleClientId=undefined;}
});

test('password login selects the correct dashboard for each supported account role', async () => {
 for(const role of ['CUSTOMER','CONTRACTOR','PAINTER']) {
 const view=await mount('Login');
 try {
 await change(view.root.findAllByType('input')[0],'9876543210');await change(view.root.findAllByType('input')[1],'Examplepass123!');await submit(view);await respond({role});
 assert.match(text(view),role==='CUSTOMER'?/customer-dashboard/:/\/dashboard/);
 }finally {while(pending.length)await reject({detail:'cancelled'});await act(async()=>view.unmount());}
 }
});
