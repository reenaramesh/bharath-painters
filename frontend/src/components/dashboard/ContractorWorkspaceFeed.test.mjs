import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { transformWithOxc } from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const stub = dataUrl(`import React from ${JSON.stringify(import.meta.resolve('react'))};
export const Link=({children,...props})=>React.createElement('a',props,children);
export const PremiumDashboardPanel=({title,action,children,...props})=>React.createElement('section',props,React.createElement('h2',null,title),action,children);
export const PremiumDashboardEmpty=({title,description})=>React.createElement('p',null,title,description);
export const PremiumDashboardIcon=()=>null;
export const StatusBadge=({status,label})=>React.createElement('span',null,label || status);
export const menuRouteEnabled=(_role,visibility,path)=>!visibility.hidden?.includes(path);
export default function useAuth(){return globalThis.feedAuth;}
export const api={get:(...args)=>globalThis.feedGet(...args)};`);
const source=await readFile(new URL('./ContractorWorkspaceFeed.jsx',import.meta.url),'utf8');
let code=(await transformWithOxc(source,'ContractorWorkspaceFeed.jsx',{jsx:{runtime:'automatic'}})).code;
code=code.replace(/from\s+(['"])([^'"]+)\1/g,(_match,_quote,path)=>`from ${JSON.stringify(path.startsWith('.') || path==='react-router-dom' ? stub : import.meta.resolve(path))}`);
code=code.replace(/import api from ([^;]+);/,'import { api } from $1;');
const Component=(await import(dataUrl(code))).default;
const text=node=>typeof node==='string'?node:(Array.isArray(node)?node:node?.children || []).map(text).join('');
const auth=(hidden=[])=>{globalThis.feedAuth={user:{id:1,role:'CONTRACTOR'},menuVisibility:{hidden}};};

test('real role-gated sources show four rows without private activity contents and do not reload on ordinary rerender',async()=>{
  auth();const calls=[];
  globalThis.feedGet=async(url,config)=>{calls.push([url,config]);return {data:url==='/jobs/list/'?{jobs:Array.from({length:5},(_,i)=>({id:i+1,title:`Painting ${i}`,city:'Bengaluru',status:'OPEN'}))}:{results:[{id:9,module:'quotations',action:'CREATE',action_display:'Created',description:'PRIVATE',metadata:{password:'SECRET'},created_at:'2026-10-28T05:00:00Z'}]}};};
  let view;await act(async()=>{view=create(React.createElement(Component,{refreshKey:1}));});
  assert.deepEqual(calls.map(row=>row[0]).sort(),['/jobs/list/','/quotations/activity-logs/']);
  assert.equal(view.root.findAllByType('li').length,5);
  assert.match(text(view.toJSON()),/Painting 0/);assert.doesNotMatch(text(view.toJSON()),/Painting 4|PRIVATE|SECRET/);
  assert.ok(view.root.findAllByType('a').every(row=>['/jobs','/activity-log'].includes(row.props.to)));
  await act(async()=>view.update(React.createElement(Component,{refreshKey:1})));
  assert.equal(calls.length,2);
  await act(async()=>view.unmount());
});

test('hidden modules and noncontractors make no corresponding requests',async()=>{
  auth(['/jobs']);const calls=[];globalThis.feedGet=async url=>{calls.push(url);return {data:[]};};
  let view;await act(async()=>{view=create(React.createElement(Component));});
  assert.deepEqual(calls,['/quotations/activity-logs/']);assert.match(text(view.toJSON()),/No recent activity/);
  await act(async()=>view.unmount());
  globalThis.feedAuth={user:{id:2,role:'CUSTOMER'},menuVisibility:{}};
  await act(async()=>{view=create(React.createElement(Component));});
  assert.equal(view.toJSON(),null);assert.equal(calls.length,1);await act(async()=>view.unmount());
});

test('one failed source does not hide the other and retry recovers independently',async()=>{
  auth();let failed=true;const calls=[];globalThis.feedGet=async url=>{calls.push(url);if(url==='/jobs/list/'&&failed)throw Error('private server detail');return {data:url==='/jobs/list/'?{jobs:[]}:[]};};
  let view;await act(async()=>{view=create(React.createElement(Component));});
  assert.match(text(view.toJSON()),/Jobs could not be loaded/);assert.match(text(view.toJSON()),/No recent activity/);assert.doesNotMatch(text(view.toJSON()),/private server detail/);
  failed=false;await act(async()=>view.root.findByProps({'aria-label':'Retry recent jobs'}).props.onClick());
  assert.match(text(view.toJSON()),/No current jobs/);assert.equal(calls.filter(url=>url.includes('activity')).length,1);
  await act(async()=>view.unmount());
});

test('stale responses after account change cannot populate the next account',async()=>{
  auth();const pending=[];globalThis.feedGet=url=>new Promise(resolve=>pending.push({url,resolve}));
  let view;await act(async()=>{view=create(React.createElement(Component));});
  globalThis.feedAuth={user:{id:2,role:'CONTRACTOR'},menuVisibility:{hidden:[]}};
  await act(async()=>view.update(React.createElement(Component)));
  await act(async()=>{for(const request of pending.slice(0,2))request.resolve({data:{jobs:[{id:1,title:'Old account'}]}});});
  assert.doesNotMatch(text(view.toJSON()),/Old account/);
  await act(async()=>view.unmount());
});
