import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import React from 'react';
import {act, create} from 'react-test-renderer';
import {transformWithOxc} from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const ui=`import React from ${JSON.stringify(import.meta.resolve('react'))};export const Link=({to,children,...props})=>React.createElement('a',{href:to,...props},children);export const Button=({children,loading,variant,...props})=>React.createElement('button',{...props,disabled:props.disabled||loading},children);`;
const uiUrl=`data:text/javascript;base64,${Buffer.from(ui+"export default function ContractorDialog({title,children}){return React.createElement('div',{role:'dialog'},title,children);}").toString('base64')}`;
async function moduleUrl(name){
  const url=new URL(`./${name}.jsx`,import.meta.url);
  let source=(await readFile(url,'utf8')).replace(/import\s+["'][^"']+\.css["'];?/g,'')
    .replace(/import api from [^;]+;/,'const api=globalThis.__quotationScheduleApi;')
    .replace(/import \{ previewPdf \} from [^;]+;/,'const previewPdf=(...args)=>globalThis.__quotationPreview(...args);');
  let {code}=await transformWithOxc(source,url.pathname,{jsx:{runtime:'automatic'}});
  for(const match of [...code.matchAll(/from\s+(["'])([^"']+)\1/g)]) {
    const path=match[2];
    const resolved=path==='react-router-dom'||path.endsWith('/ui')||path.endsWith('/ContractorDialog')?uiUrl:path.endsWith('/ReopenWorkAction')?await moduleUrl('ReopenWorkAction'):import.meta.resolve(path);
    code=code.replace(match[0],`from ${JSON.stringify(resolved)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
async function load(name){return (await import(await moduleUrl(name))).default;}

let records=[],writes=[],reads=[],failLoad=false,failStart=false,views=[],previews=[],statusChanges=[];
const schedule={id:12,quotation:9,status:'CONFIRMED',start_date:'2099-10-26',end_date:'2099-10-28'};
globalThis.__quotationScheduleApi={get:async(path)=>{
  reads.push(path);
  if(failLoad)throw Error('offline');
  if(path.endsWith('/pdf/'))return {data:'pdf-bytes'};
  return {data:records};
},post:async(path,payload)=>{
  writes.push({path,payload});
  if(path.endsWith('/progress/')){if(failStart)throw {response:{data:{detail:'Start could not be saved.'}}};return {data:{...schedule,status:payload.action==='COMPLETE'?'COMPLETED':'IN_PROGRESS'}};}
  return {data:{...schedule,start_date:payload.start_date,end_date:payload.end_date}};
}};
globalThis.__quotationPreview=(...args)=>previews.push(args);
let Card,Reference;
async function mount(Component,props){let view;await act(async()=>{view=create(React.createElement(Component,props));});views.push(view);return view;}
const text=node=>Array.isArray(node)?node.map(text).join(''):typeof node==='string'?node:(node?.children||[]).map(text).join('');
const button=(view,name)=>view.root.findAllByType('button').find(node=>text(node)===name);
const props=()=>({quotation:{id:9,status:'SENT',property:3},onStatusChange:value=>statusChanges.push(value)});
afterEach(async()=>{for(const view of views)await act(async()=>view.unmount());views=[];records=[];writes=[];reads=[];previews=[];statusChanges=[];failLoad=false;failStart=false;});

test('dates saved from quotation create one linked contractor schedule then start it',async()=>{
  Card ||= await load('QuotationScheduleCard');
  const view=await mount(Card,props());
  const fields=view.root.findAllByType('input');
  await act(async()=>fields[0].props.onChange({target:{value:'2099-10-26'}}));
  await act(async()=>fields[1].props.onChange({target:{value:'2099-10-28'}}));
  await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.deepEqual(writes[0],{path:'/jobs/work-schedules/',payload:{quotation:9,start_date:'2099-10-26',end_date:'2099-10-28',scheduling_mode:'CONTRACTOR'}});
  await act(async()=>button(view,'Start work').props.onClick());
  assert.deepEqual(writes[1],{path:'/jobs/work-schedules/12/progress/',payload:{action:'START'}});
  assert.deepEqual(statusChanges,['IN_PROGRESS']);
  assert.match(text(view.toJSON()),/In progress/);
});

test('existing schedule starts directly and failed start preserves dates for retry',async()=>{
  Card ||= await load('QuotationScheduleCard');records=[schedule];failStart=true;
  const view=await mount(Card,props());
  await act(async()=>button(view,'Start work').props.onClick());
  assert.equal(writes.length,1);
  assert.match(text(view.toJSON()),/Start could not be saved/);
  assert.ok(button(view,'Start work'));
  failStart=false;
  await act(async()=>button(view,'Start work').props.onClick());
  assert.deepEqual(statusChanges,['IN_PROGRESS']);
  assert.equal(writes.filter(row=>row.path==='/jobs/work-schedules/').length,0);
});

test('load failure requires retry before date actions become available',async()=>{
  Card ||= await load('QuotationScheduleCard');failLoad=true;
  const view=await mount(Card,props());
  assert.match(text(view.toJSON()),/could not be loaded/);
  assert.equal(view.root.findAllByType('form').length,0);
  failLoad=false;
  await act(async()=>button(view,'Retry').props.onClick());
  assert.equal(view.root.findAllByType('form').length,1);
});

test('changing existing dates includes reason and cannot start unsaved dates',async()=>{
  Card ||= await load('QuotationScheduleCard');records=[schedule];
  const view=await mount(Card,props());
  await act(async()=>view.root.findAllByType('input')[1].props.onChange({target:{value:'2099-10-30'}}));
  assert.ok(button(view,'Start work').props.disabled);
  const reason=view.root.findAllByType('input').find(node=>node.props.name==='reason');
  assert.ok(reason.props.required);
  await act(async()=>reason.props.onChange({target:{value:'Site access changed'}}));
  await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.equal(writes[0].payload.reason,'Site access changed');
  assert.equal(writes[0].payload.quotation,9);
});

test('closed work schedule is read-only and links back to the same schedule',async()=>{
  Card ||= await load('QuotationScheduleCard');records=[{...schedule,status:'COMPLETED'}];
  const view=await mount(Card,props());
  assert.equal(view.root.findAllByType('form').length,0);
  assert.equal(button(view,'Start work'),undefined);
  assert.equal(view.root.findAllByType('a').find(node=>text(node)==='View schedule').props.href,'/work-schedules?quotation=9');
});

test('contractor can complete from quotation and initiate its final invoice',async()=>{
  Card ||= await load('QuotationScheduleCard');records=[{...schedule,status:'IN_PROGRESS'}];
  const view=await mount(Card,{...props(),quotation:{id:9,status:'IN_PROGRESS'}});
  await act(async()=>button(view,'Complete work').props.onClick());
  assert.deepEqual(writes[0],{path:'/jobs/work-schedules/12/progress/',payload:{action:'COMPLETE'}});
  assert.deepEqual(statusChanges,['COMPLETED']);
  assert.ok(button(view,'Reopen for rework'));
  assert.equal(view.root.findAllByType('a').find(node=>text(node)==='Create final invoice').props.href,'/quotations/9?action=invoice');
});

test('reopening requires an explicit issues and rework note',async()=>{
  const Reopen=await load('ReopenWorkAction');
  const updates=[];
  const view=await mount(Reopen,{schedule:{...schedule,status:'COMPLETED'},onUpdated:value=>updates.push(value)});
  await act(async()=>button(view,'Reopen for rework').props.onClick());
  await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.equal(writes.length,0);
  assert.match(text(view.toJSON()),/Describe the issues/);
  await act(async()=>view.root.findByType('textarea').props.onChange({target:{value:'Uneven finish; sand and repaint'}}));
  await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.deepEqual(writes[0].payload,{action:'REOPEN',note:'Uneven finish; sand and repaint'});
  assert.equal(updates[0].status,'IN_PROGRESS');
});

test('schedule reference opens its exact quotation in a modal PDF preview',async()=>{
  Reference ||= await load('ScheduleQuotationReference');
  const view=await mount(Reference,{quotationId:9,quotationNumber:'Q-9',role:'CONTRACTOR'});
  await act(async()=>button(view,'View quotation').props.onClick());
  assert.deepEqual(previews,[['pdf-bytes','Q-9.pdf',{modal:true}]]);
});

test('reference failure leaves a retryable button and visible local error',async()=>{
  Reference ||= await load('ScheduleQuotationReference');failLoad=true;
  const view=await mount(Reference,{quotationId:9,quotationNumber:'Q-9',role:'CUSTOMER'});
  await act(async()=>button(view,'View quotation').props.onClick());
  assert.equal(previews.length,0);
  assert.match(text(view.toJSON()),/Quotation could not be opened/);
  assert.ok(!button(view,'View quotation').props.disabled);
});

test('customer reference uses the customer quotation PDF access check',async()=>{
  Reference ||= await load('ScheduleQuotationReference');
  const view=await mount(Reference,{quotationId:9,quotationNumber:'Q-9',role:'CUSTOMER'});
  await act(async()=>button(view,'View quotation').props.onClick());
  assert.deepEqual(reads,['/quotations/customer-portal/quotations/9/pdf/']);
});

test('in-flight start is locked against repeat clicks',async()=>{
  Card ||= await load('QuotationScheduleCard');records=[schedule];
  const view=await mount(Card,props());
  const original=globalThis.__quotationScheduleApi.post;
  let resolve,count=0;
  globalThis.__quotationScheduleApi.post=()=>{count++;return new Promise(done=>{resolve=done;});};
  try {
    const start=button(view,'Start work').props.onClick;
    let pending;
    await act(async()=>{pending=start();void start();});
    assert.equal(count,1);
    await act(async()=>{resolve({data:{...schedule,status:'IN_PROGRESS'}});await pending;});
  } finally {globalThis.__quotationScheduleApi.post=original;}
});

test('in-flight quotation preview is ignored after reference unmounts',async()=>{
  Reference ||= await load('ScheduleQuotationReference');
  const view=await mount(Reference,{quotationId:9,quotationNumber:'Q-9',role:'CONTRACTOR'});
  const original=globalThis.__quotationScheduleApi.get;
  let resolve;
  globalThis.__quotationScheduleApi.get=()=>new Promise(done=>{resolve=done;});
  try {
    let pending;
    await act(async()=>{pending=button(view,'View quotation').props.onClick();});
    await act(async()=>view.unmount());
    await act(async()=>{resolve({data:'old-pdf'});await pending;});
    assert.deepEqual(previews,[]);
  } finally {globalThis.__quotationScheduleApi.get=original;}
});

test('preview keeps its opener focusable while preventing duplicate requests',async()=>{
  Reference ||= await load('ScheduleQuotationReference');
  const view=await mount(Reference,{quotationId:9,quotationNumber:'Q-9',role:'CONTRACTOR'});
  const original=globalThis.__quotationScheduleApi.get;
  let resolve,count=0;
  globalThis.__quotationScheduleApi.get=()=>{count++;return new Promise(done=>{resolve=done;});};
  try {
    let pending;
    const open=button(view,'View quotation').props.onClick;
    await act(async()=>{pending=open();void open();});
    const opener=view.root.findByType('button');
    assert.ok(!opener.props.disabled);
    assert.equal(opener.props['aria-disabled'],true);
    assert.equal(count,1);
    await act(async()=>{resolve({data:'pdf-bytes'});await pending;});
  } finally {globalThis.__quotationScheduleApi.get=original;}
});

test('a stale initial schedule response cannot overwrite date edits',async()=>{
  Card ||= await load('QuotationScheduleCard');
  const original=globalThis.__quotationScheduleApi.get;
  const pending=[];
  globalThis.__quotationScheduleApi.get=()=>new Promise(resolve=>pending.push(resolve));
  try {
    let view;
    await act(async()=>{view=create(React.createElement(React.StrictMode,null,React.createElement(Card,props())));});
    views.push(view);
    assert.equal(pending.length,2);
    await act(async()=>pending[1]({data:[]}));
    await act(async()=>view.root.findAllByType('input')[1].props.onChange({target:{value:'2099-12-31'}}));
    await act(async()=>pending[0]({data:[schedule]}));
    assert.equal(view.root.findAllByType('input')[1].props.value,'2099-12-31');
  } finally {globalThis.__quotationScheduleApi.get=original;}
});
