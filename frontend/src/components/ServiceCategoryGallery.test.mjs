import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import React from 'react';
import {act,create} from 'react-test-renderer';
import {transformWithOxc} from 'vite';
import {SERVICE_CATEGORIES} from './serviceCategories.js';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const stub=`data:text/javascript;base64,${Buffer.from(`import React from ${JSON.stringify(import.meta.resolve('react'))}; export const Link=({to,children,...props})=>React.createElement('a',{href:to,...props},children); export const useLanguage=()=>({t:key=>key}); export default function Art(){return React.createElement('span',{'aria-hidden':true});}`).toString('base64')}`;
const url=new URL('./ServiceCategoryGallery.jsx',import.meta.url);
let source=(await readFile(url,'utf8')).replace(/import "\.\/service-category-gallery.css";/,'');
const result=await transformWithOxc(source,url.pathname,{jsx:{runtime:'automatic'}});
const code=result.code.replace(/from\s+(["'])([^"']+)\1/g,(_m,_q,path)=>`from ${JSON.stringify(path==='react-router-dom'||path.endsWith('/LanguageContext')||path==='./ServiceIllustration'?stub:path.startsWith('.')?new URL(path,url).href:import.meta.resolve(path))}`);
const Gallery=(await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
test('default gallery preserves seven catalogue links with service names',async()=>{
 let view;await act(async()=>{view=create(React.createElement(Gallery));});
 const links=view.root.findAllByType('a');assert.equal(links.length,8);assert.ok(links.every(link=>link.props.href==='/master-services'));
 assert.deepEqual(links.slice(1).map(link=>link.props['aria-label']),SERVICE_CATEGORIES.map(service=>`${service.label} service catalogue`));await act(async()=>view.unmount());
});
test('selection uses real buttons, exposes pressed state and calls category and reset callbacks',async()=>{
 let selected,reset=0,view;await act(async()=>{view=create(React.createElement(Gallery,{selectedService:'painting',onSelect:service=>{selected=service;},onReset:()=>reset++}));});
 const buttons=view.root.findAllByType('button');assert.equal(buttons.length,8);
 assert.equal(buttons.filter(button=>button.props['aria-pressed']===true).length,1);
 buttons[2].props.onClick();assert.equal(selected.id,'plumbing');assert.equal(selected.search,'Plumbing');buttons[0].props.onClick();assert.equal(reset,1);
 await act(async()=>view.unmount());
});
test('master selection preserves search through section changes and retains all catalogue actions',async()=>{
 const source=await readFile(new URL('../pages/MasterServices.jsx',import.meta.url),'utf8');
 assert.match(source,/setSearch\(gallerySearchRef.current\)/);assert.match(source,/gallerySearchRef.current = service.search/);assert.match(source,/group.key === "categories"/);
 for(const action of ['downloadTemplate','downloadCurrent','uploadMaster','resetOrder','QuotationDefaults','startTouchReorder','canManageItem'])assert.ok(source.includes(action),action);
 assert.match(source,/View all \/ Clear filters/);
});
