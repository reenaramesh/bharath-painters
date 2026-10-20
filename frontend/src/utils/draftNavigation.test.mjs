import test from 'node:test';
import assert from 'node:assert/strict';
import { installDraftNavigationGuard } from './draftNavigation.js';

test('dirty navigation is blocked until confirmed; clean saves do not prompt', () => {
  const listeners = new Map();
  let dirty=true, confirmed=false, calls=0, prompts=0;
  const browser={history:{state:{idx:1},go(){}},confirm:()=>{prompts++;return confirmed;},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const navigator={push:()=>calls++,replace:()=>calls++,go:()=>calls++};
  const original=navigator.push;
  const dispose=installDraftNavigationGuard(browser,navigator,()=>dirty);
  navigator.push('/quotations');assert.equal(calls,0);
  confirmed=true;navigator.push('/quotations');assert.equal(calls,1);
  dirty=false;navigator.replace('/saved');assert.equal(calls,2);assert.equal(prompts,2);
  dispose();assert.equal(navigator.push,original);assert.equal(listeners.size,0);
});

test('reload warns and cancelled browser Back restores the previous history entry', () => {
  const listeners=new Map();let delta;
  const browser={history:{state:{idx:3},go:value=>delta=value},confirm:()=>false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const dispose=installDraftNavigationGuard(browser,{push(){},replace(){},go(){}},()=>true);
  let prevented=false;
  listeners.get('beforeunload')({preventDefault:()=>prevented=true});assert.ok(prevented);
  listeners.get('popstate')({state:{idx:2},stopImmediatePropagation(){}});assert.equal(delta,1);
  dispose();
});
