import test from 'node:test';
import assert from 'node:assert/strict';
import { revealWorkspaceLink } from './useWorkspaceTabs.js';

const strip = () => ({scrollLeft: 100, getBoundingClientRect: () => ({left: 20, right: 320})});
const link = (left, right) => ({getBoundingClientRect: () => ({left, right})});
test('reveals only the clipped horizontal edge without scrolling visible tabs', () => {
 const navigation = strip();
 revealWorkspaceLink(navigation, link(270, 370));
 assert.equal(navigation.scrollLeft, 150);
 revealWorkspaceLink(navigation, link(-10, 80));
 assert.equal(navigation.scrollLeft, 120);
 revealWorkspaceLink(navigation, link(30, 200));
 assert.equal(navigation.scrollLeft, 120);
});
test('empty or permission-filtered navigation safely has no current link', () => {
 const navigation = strip();
 revealWorkspaceLink(navigation, null);
 revealWorkspaceLink(null, link(1, 2));
 assert.equal(navigation.scrollLeft, 100);
});

test('route changes, resize and keyboard focus reveal links and clean up observers', async () => {
 const React = await import('react');
 const {act, create} = await import('react-test-renderer');
 const {default: useWorkspaceTabs} = await import('./useWorkspaceTabs.js');
 globalThis.IS_REACT_ACT_ENVIRONMENT = true;
 const listeners = {};
 let current = link(300, 400);
 let resize;
 let disconnected = 0;
 const oldObserver = globalThis.ResizeObserver;
 globalThis.ResizeObserver = class {
   constructor(callback) { resize = callback; }
   observe() {}
   disconnect() { disconnected++; }
 };
 const properties = {};
 const navigation = {...strip(), style: {setProperty:(key,value)=>{properties[key]=value;}},
   closest:()=>({querySelector:()=>({getBoundingClientRect:()=>({height:64})})}),
   querySelector:()=>current, previousElementSibling:{classList:{contains:name=>name==='bp-workspace-tabs'}, getBoundingClientRect:()=>({height:58})},
   addEventListener:(event,callback)=>{listeners[event]=callback;},
   removeEventListener:event=>{delete listeners[event];}
 };
 function Tabs({route}) { return React.createElement('nav',{ref:useWorkspaceTabs(route)}); }
 let view;
 try {
   await act(async()=>{view=create(React.createElement(Tabs,{route:'/first'}),{createNodeMock:()=>navigation});});
   assert.equal(navigation.scrollLeft,180);
   assert.equal(properties['--bp-workspace-top'],'122px');
   current=link(-20,80);
   await act(async()=>view.update(React.createElement(Tabs,{route:'/second'})));
   assert.equal(navigation.scrollLeft,140);
   listeners.focusin({target:{closest:()=>link(300,350)}});
   assert.equal(navigation.scrollLeft,170);
   current=link(30,200); resize();
   assert.equal(navigation.scrollLeft,170);
   await act(async()=>view.unmount());
   assert.equal(disconnected,2);
   assert.equal(listeners.focusin,undefined);
 } finally { globalThis.ResizeObserver=oldObserver; }
});
