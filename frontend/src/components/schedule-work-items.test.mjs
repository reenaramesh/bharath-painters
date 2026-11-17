import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import React from 'react';
import { act, create } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const row = {item_id:7,description:'Living room walls',quantity:'120',unit:'sq ft',coats:2,room:'Living room',
  steps:[{id:'25ab6147-f7fd-4f3c-aed7-f4c65b619058',label:'Primer',status:'NOT_STARTED'}],note:'',version:0,scope_token:'scope',can_edit:true,is_current:true};
let gets=0, patches=[], failGet=false, canManage=true, conflict=false, confirmAllowed=true, parentStatus, apiStatus='IN_PROGRESS', includeRow=true, startCalls=0;
globalThis.__workApi = {get:async()=>{ gets++; if(failGet) throw Error('offline'); return {data:{schedule_status:apiStatus,can_manage:canManage,items:includeRow?[{...structuredClone(row),can_edit:canManage}]:[]}}; },
  patch:async(path,payload)=>{patches.push({path,payload});if(conflict)throw {response:{status:409,data:{detail:'Changed on server'}}};return {data:{...row,...payload,version:1}};}};
globalThis.__workConfirm=async()=>confirmAllowed;
async function load() {
  const url=new URL('./ScheduleWorkItems.jsx',import.meta.url);
  let source=await readFile(url,'utf8');
  source=source.replace(/import\s+["'][^"']+\.css["'];?/g,'')
    .replace(/import api from [^;]+;/,'const api=globalThis.__workApi;')
    .replace(/import \{ confirmAction \} from [^;]+;/,'const confirmAction=globalThis.__workConfirm;');
  let {code}=await transformWithOxc(source,url.pathname,{jsx:{runtime:'automatic'}});
  for(const match of [...code.matchAll(/from\s+(["'])([^"']+)\1/g)]) code=code.replace(match[0],`from ${JSON.stringify(import.meta.resolve(match[2]))}`);
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
}
const Component=await load();
let drafts={}, view;
async function render(visible=true){await act(async()=>{const props={scheduleId:2,visible,parentStatus,onStart:()=>{startCalls++;},drafts,onDraftsChange:next=>{drafts=typeof next==='function'?next(drafts):next;void render(visible);}}; if(view)view.update(React.createElement(Component,props));else view=create(React.createElement(Component,props));});}
const text=()=>JSON.stringify(view.toJSON());

test('one-line item scope shows only room, surface, quantity, service and product',async()=>{
  Object.assign(row,{surfaces:['WALL'],service:'Interior painting',product:'Emulsion',brand:'Hidden brand'});
  try {
    await render();await act(async()=>view.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
    const scope=view.root.findByProps({className:'swi-scope-inline'});
    assert.equal(scope.children.join(''),'Living room · Walls · 120 sq ft · Interior painting · Emulsion');
    assert.doesNotMatch(text(),/Living room walls|Hidden brand|2 coats/);
  } finally {delete row.surfaces;delete row.service;delete row.product;delete row.brand;}
});

test('compact checklist has no note editor and preserves existing notes when saving a step',async()=>{
  row.note='Previously saved private note';
  try {
    await render();await act(async()=>view.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
    assert.equal(view.root.findAllByType('textarea').length,0);
    assert.doesNotMatch(text(),/Previously saved private note|Line note/);
    await act(async()=>view.root.findByProps({className:'swi-step-name'}).props.onChange({target:{value:'Prepare surface'}}));
    await act(async()=>view.root.findAllByType('button').find(button=>button.children.includes('Save update')).props.onClick());
    assert.equal(patches[0].payload.note,'Previously saved private note');
    assert.equal(patches[0].payload.steps[0].label,'Prepare surface');
  } finally {row.note='';}
});

test('headers use quotation display names when older work scope fields are empty',async()=>{
  row.display_scope={room:'Living room, Bedroom',service:'Interior painting',product:'Emulsion',unit:'sq ft'};
  try {
    await render();await act(async()=>view.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
    const mobile=view.root.findByProps({className:'swi-scope-mobile'});
    const values=mobile.findAllByType('strong').map(node=>node.children.join(''));
    assert.equal(values[0],'Living room, Bedroom');
    assert.equal(values[3],'Interior painting');
    assert.equal(values[4],'Emulsion');
    assert.match(view.root.findByProps({className:'swi-scope-inline'}).children.join(''),/Living room, Bedroom.*Interior painting.*Emulsion/);
  } finally {delete row.display_scope;}
});

test('standalone workspace opens immediately and category IDs filter both checklist and notes',async()=>{
  const before=gets;
  await act(async()=>{view=create(React.createElement(Component,{scheduleId:2,visible:true,initiallyOpen:true,itemIds:[],drafts:{},onDraftsChange:()=>{}}));});
  assert.equal(gets,before+1);
  assert.match(text(),/No work steps match this filter/);
  assert.doesNotMatch(text(),/Living room walls/);
  await act(async()=>view.root.findAllByProps({role:'tab'}).find(node=>node.props.id.endsWith('notes')).props.onClick());
  assert.doesNotMatch(text(),/Living room walls/);
  await act(async()=>view.unmount());view=null;
});

test('empty lines stay empty until contractor adds an optional step', async()=>{
  const original=row.steps;
  row.steps=[];
  try {
    await render();
    await act(async()=>view.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
    assert.equal(view.root.findAllByType('select').length,0);
    assert.equal(view.root.findAllByType('input').length,0);
    assert.match(text(),/No steps yet/);
    assert.equal(view.root.findAllByProps({className:'swi-suggestions'}).length,0);
    assert.doesNotMatch(text(),/Suggested steps|Surface preparation|Final inspection/);
    assert.equal(Object.keys(drafts).length,0);
    const addButton=view.root.findAllByType('button').find(node=>node.children.includes('Add custom step'));
    assert.equal(addButton.parent.props.className,'swi-empty-action');
    assert.ok(addButton.parent.findAll(node=>node.children.includes('No steps yet')).length);
    await act(async()=>addButton.props.onClick());
    assert.equal(drafts[7].steps.length,1);
    assert.equal(drafts[7].steps[0].label,'');
  } finally {row.steps=original;}
});
afterEach(async()=>{
  if(view)await act(async()=>view.unmount());
  view=null;drafts={};gets=0;patches=[];failGet=false;canManage=true;conflict=false;
  confirmAllowed=true;parentStatus=undefined;apiStatus='IN_PROGRESS';includeRow=true;
});

test('loads on expansion, saves step edits and retains drafts when hidden',async()=>{
  await render(); assert.equal(gets,0);
  await act(async()=>view.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
  assert.equal(gets,1); assert.match(text(),/Living room/);
  await act(async()=>view.root.findByProps({className:'swi-step-name'}).props.onChange({target:{value:'Site note'}}));
  await act(async()=>view.root.findByType('select').props.onChange({target:{value:'COMPLETED'}}));
  await render(false); await render(true);
  assert.equal(view.root.findByProps({className:'swi-step-name'}).props.value,'Site note');
  await act(async()=>view.root.findAllByType('button').find(button=>button.children.includes('Save update')).props.onClick());
  assert.equal(patches.length,1); assert.equal(patches[0].payload.steps[0].status,'COMPLETED');
  assert.equal(patches[0].payload.note,''); assert.equal(Object.keys(drafts).length,0);
  await act(async()=>view.unmount());view=null;
});

test('independent load failure retries and customer view has no edit or note controls',async()=>{
  failGet=true;canManage=false;const before=gets;
  await render(); await act(async()=>view.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
  assert.match(text(),/could not be loaded/); failGet=false;
  await act(async()=>view.root.findAllByType('button').find(node=>node.children.includes('Retry')).props.onClick());
  assert.equal(gets,before+2);assert.equal(view.root.findAllByType('textarea').length,0);
  assert.equal(view.root.findAllByType('select').length,0);assert.match(text(),/Primer/);
  await act(async()=>view.unmount());view=null;canManage=true;
});

test('save conflict keeps draft and No to reload preserves it',async()=>{
  conflict=true;confirmAllowed=false;patches=[];
  await render();await act(async()=>view.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
  await act(async()=>view.root.findByProps({className:'swi-step-name'}).props.onChange({target:{value:'Keep this draft'}}));
  await act(async()=>view.root.findAllByType('button').find(node=>node.children.includes('Save update')).props.onClick());
  assert.match(text(),/Changed on server/);assert.equal(drafts[7].steps[0].label,'Keep this draft');
  await act(async()=>view.root.findAllByType('button').find(node=>node.children.includes('Reload saved line')).props.onClick());
  assert.equal(drafts[7].steps[0].label,'Keep this draft');
  await act(async()=>view.unmount());view=null;drafts={};conflict=false;confirmAllowed=true;
});

test('parent schedule start and completion refresh step controls without reopening',async()=>{
  parentStatus='CONFIRMED';apiStatus='CONFIRMED';
  await render();await act(async()=>view.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
  const before=gets;parentStatus='IN_PROGRESS';apiStatus='IN_PROGRESS';await render();
  assert.equal(gets,before+1);
  assert.equal(view.root.findByType('select').props.disabled,false);
  await act(async()=>view.root.findByProps({className:'swi-step-name'}).props.onChange({target:{value:'Recover this unsaved completion note'}}));
  parentStatus='COMPLETED';apiStatus='COMPLETED';await render();
  assert.equal(view.root.findAllByType('textarea').length,0);
  assert.match(text(),/Recover this unsaved completion note/);
  const discard=view.root.findAllByType('button').find(node=>node.children.includes('Discard draft'));
  assert.ok(discard);
  confirmAllowed=false;await act(async()=>discard.props.onClick());assert.ok(drafts[7]);
  confirmAllowed=true;await act(async()=>discard.props.onClick());assert.equal(Object.keys(drafts).length,0);
  await act(async()=>view.unmount());view=null;parentStatus=undefined;apiStatus='IN_PROGRESS';
});

test('removed quotation line retains unsaved work and note for recovery',async()=>{
  await render();await act(async()=>view.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
  await act(async()=>view.root.findByProps({className:'swi-step-name'}).props.onChange({target:{value:'Recover removed line note'}}));
  includeRow=false;
  await act(async()=>view.root.findAllByType('button').find(node=>node.props['aria-label']==='Refresh progress').props.onClick());
  assert.match(text(),/Unsaved update for a removed quotation line/);
  assert.match(text(),/Recover removed line note/);
  await act(async()=>view.root.findAllByType('button').find(node=>node.children.includes('Discard draft')).props.onClick());
  assert.equal(Object.keys(drafts).length,0);
  await act(async()=>view.unmount());view=null;includeRow=true;
});

test('fresh in-progress details enable every status despite a stale confirmed list',async()=>{
  parentStatus='CONFIRMED';apiStatus='IN_PROGRESS';
  await render();await act(async()=>view.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
  assert.equal(view.root.findAllByType('option').filter(option=>option.props.disabled).length,0);
  for(const value of ['IN_PROGRESS','ON_HOLD','COMPLETED']){
    await act(async()=>view.root.findByType('select').props.onChange({target:{value}}));
    assert.equal(view.root.findByType('select').props.value,value);
  }
  await act(async()=>view.unmount());view=null;drafts={};parentStatus=undefined;
});

test('unstarted schedule explains locked selector and offers explicit start action',async()=>{
  parentStatus='CONFIRMED';apiStatus='CONFIRMED';startCalls=0;
  await render();await act(async()=>view.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
  assert.equal(view.root.findByType('select').props.disabled,true);
  assert.match(text(),/Start work to update step statuses/);
  await act(async()=>view.root.findAllByType('button').find(node=>node.children.includes('Start work')).props.onClick());
  assert.equal(startCalls,1);
  await act(async()=>view.unmount());view=null;parentStatus=undefined;apiStatus='IN_PROGRESS';
});

test('Stitch checklist checkbox updates a draft and status filters show matching work',async()=>{
  patches=[];
  await render();await act(async()=>view.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
  const check=view.root.findByProps({type:'checkbox'});
  await act(async()=>check.props.onChange({target:{checked:true}}));
  assert.equal(drafts[7].steps[0].status,'COMPLETED');
  const filter=view.root.findAllByType('button').find(node=>node.props['aria-label']==='Filter work steps: Not started');
  await act(async()=>filter.props.onClick());
  assert.equal(filter.props['aria-pressed'],true);
  assert.equal(view.root.findAllByType('select').length,0);
  assert.match(text(),/No work steps match this filter/);
  await act(async()=>view.root.findAllByType('button').find(node=>node.props['aria-label']==='Filter work steps: All steps').props.onClick());
  await act(async()=>view.root.findAllByType('button').find(node=>node.children.includes('Save update')).props.onClick());
  assert.equal(patches[0].payload.steps[0].status,'COMPLETED');
  await act(async()=>view.unmount());view=null;drafts={};
});

test('status summary preserves checklist drafts without saving on tab changes',async()=>{
  patches=[];
  await render();await act(async()=>view.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
  await act(async()=>view.root.findByProps({className:'swi-step-name'}).props.onChange({target:{value:'Keep this field note'}}));
  const tabs=()=>view.root.findAllByProps({role:'tab'});
  assert.equal(tabs().length,2);
  await act(async()=>tabs()[1].props.onClick());
  assert.equal(tabs()[1].props['aria-selected'],true);
  assert.equal(view.root.findAllByType('textarea').length,0);
  assert.equal(drafts[7].steps[0].label,'Keep this field note');
  await act(async()=>tabs()[0].props.onClick());
  assert.equal(view.root.findByProps({className:'swi-step-name'}).props.value,'Keep this field note');
  assert.equal(patches.length,0);
  await act(async()=>view.unmount());view=null;drafts={};
});
