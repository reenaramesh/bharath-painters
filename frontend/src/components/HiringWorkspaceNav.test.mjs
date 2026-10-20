import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { transformWithOxc } from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const stub = `data:text/javascript;base64,${Buffer.from(`import React from ${JSON.stringify(import.meta.resolve('react'))}; export const Link=({to,children,...props})=>React.createElement('a',{href:to,...props},children); export const useLocation=()=>globalThis.__hiringLocation; export const useOutletContext=()=>({employmentStatus:'freelance'}); export const useAuth=()=>globalThis.__hiringAuth; export const useLanguage=()=>({t:(key,options)=>options?.defaultValue||key});`).toString('base64')}`;
const url = new URL('./HiringWorkspaceNav.jsx',import.meta.url);
let source=await readFile(url,'utf8');
source=source.replace(/import useAuth from [^;]+;/,`import {useAuth} from ${JSON.stringify(stub)};`);
const transformed=await transformWithOxc(source,url.pathname,{jsx:{runtime:'automatic'}});
const code=transformed.code.replace(/from\s+(["'])([^"']+)\1/g,(_m,_q,path)=>`from ${JSON.stringify(path==='react-router-dom'||path.endsWith('/LanguageContext')?stub:path.startsWith('data:')?path:path.startsWith('.')?new URL(path.endsWith('.js')?path:path+'.js',url).href:import.meta.resolve(path))}`);
const Nav=(await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;

test('contractor sections stay ordered, select deep links, and respect each existing visibility setting',async()=>{
 globalThis.__hiringAuth={user:{role:'CONTRACTOR'},menuVisibility:{}};
 globalThis.__hiringLocation={pathname:'/painters/contacts/15',search:''};
 let view;
 await act(async()=>{view=create(React.createElement(Nav));});
 const links=()=>view.root.findAllByType('a');
 assert.equal(view.root.findByType('nav').props['aria-label'],'Jobs & Applications sections');
 assert.deepEqual(links().map(a=>a.props.href),['/jobs','/job-activity','/applicator-bookings','/painter-contacts','/applicator-team']);
 assert.equal(links().find(a=>a.props['aria-current']==='page').props.href,'/painter-contacts');
 globalThis.__hiringLocation={pathname:'/painter-seeking',search:''};
 await act(async()=>view.update(React.createElement(Nav)));
 assert.equal(links().find(a=>a.props['aria-current']==='page').props.href,'/jobs');
 globalThis.__hiringAuth={user:{role:'CONTRACTOR'},menuVisibility:{CONTRACTOR:['jobs','bookings']}};
 await act(async()=>view.update(React.createElement(Nav)));
 assert.deepEqual(links().map(a=>a.props.href),['/job-activity','/painter-contacts','/applicator-team']);
 globalThis.__hiringAuth={user:{role:'PAINTER'},menuVisibility:{}};
 globalThis.__hiringLocation={pathname:'/job-activity',search:''};
 await act(async()=>view.update(React.createElement(Nav)));
 assert.equal(view.root.findByType('nav').props['aria-label'],'Hiring workspace');
 assert.deepEqual(links().map(a=>a.props.href),['/applicator-availability','/jobs','/job-activity','/applicator-bookings']);
 await act(async()=>view.unmount());
});
