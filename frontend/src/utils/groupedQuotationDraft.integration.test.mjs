import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import {create,act} from 'react-test-renderer';
import {transformWithOxc} from 'vite';
import {measurement,masters,exampleAssignments} from '../preview/quotationGrouping/fixtures.js';
import {assignmentQuotationItems} from './groupedQuotation.js';
import {recoveryKey,readRecovery,writeRecovery} from './quotationRecovery.js';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const browserStorage = () => {
 const values=new Map();
 return {getItem:key=>values.get(key) ?? null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
};
function resetBrowser() {
 const events=new EventTarget();
 globalThis.window={localStorage:browserStorage(),sessionStorage:browserStorage(),addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)};
 window.localStorage.setItem('bharath_user',JSON.stringify({id:1}));
}
const fixture=()=>({id:42,customer:1,property:2,status:'DRAFT',can_edit:true,can_create_version:true,quotation_type:'MEASUREMENT',measurement_record:measurement.id,updated_at:'2026-10-11T01:00:00Z',discount_mode:'LINE',discount_type:'FIXED',discount_value:'0',gst_mode:'NO_GST',gst_percentage:'0',notes:'Saved notes',rooms:measurement.rooms.map(room=>({id:room.id+100,property_room:room.id,name:room.name})),items:assignmentQuotationItems(measurement,exampleAssignments(),masters).map((line,index)=>({...line,id:200+index,room:null}))});
const stub=`import React from ${JSON.stringify(import.meta.resolve('react'))};
const params=new URLSearchParams(),location={pathname:'/quotations/new',state:{}};
export const useSearchParams=()=>[params,()=>{}];export const useLocation=()=>globalThis.__builderLocation || location;export const useNavigate=()=>target=>globalThis.__builderNavigate=target;
export const useAuth=()=>({user:{id:1,role:'CONTRACTOR'}});
export const useDraftUnsavedChanges=()=>()=>{};
export const api={get:async path=>{if(globalThis.__builderReadFailure && path.endsWith('/measurement-records/'))throw Error('Measurement loading unavailable');const m=globalThis.__builderMasters,q=globalThis.__builderFixture;const lists={'service-categories':m.categories,'service-types':m.services || [],'paint-types':m.paintTypes,'brands':m.brands,'units':m.units,'work-descriptions':[],'colors':[],'areas':[]};let data=lists[path.split('/').filter(Boolean).at(-1)] || [];if(path==='/quotations/customers/')data=[{id:1,name:'Saved customer'}];if(path==='/quotations/properties/')data=[{id:2,customer:1,name:'Saved site'}];if(path.endsWith('/rooms/'))data=globalThis.__builderMeasurement.rooms;if(path.endsWith('/measurements/'))data=globalThis.__builderMeasurement.surfaces;if(path.endsWith('/measurement-records/'))data=[{id:q.measurement_record,version:3}];if(path.includes('contractor-profile'))data={quotation_terms_conditions:'New default',quotation_prepared_by:'New preparer'};return {data};},patch:async(path,payload)=>{globalThis.__builderCalls.push(['patch',path,payload]);if(globalThis.__builderWait)await globalThis.__builderWait;if(globalThis.__builderFailure)throw globalThis.__builderFailure;return {data:{...globalThis.__builderFixture,updated_at:'2026-10-11T02:00:00Z'}};},post:async(path,payload)=>{globalThis.__builderCalls.push(['post',path,payload]);if(path.endsWith('/versions/')){if(globalThis.__builderWait)await globalThis.__builderWait;if(globalThis.__builderFailure)throw globalThis.__builderFailure;return {data:{...globalThis.__builderFixture,id:43,version_number:2,updated_at:'2026-10-11T02:00:00Z'}};}if(globalThis.__builderSendFailure)throw globalThis.__builderSendFailure;return {data:{...globalThis.__builderFixture}};}};
export const GroupedQuotationWorkspace=props=>React.createElement('workspace',props);
export const QuotationPricingRows=props=>React.createElement('pricing-rows',props);
export const QuotationDocumentItems=()=>null;
export const QuotationWorkItemSummary=props=>React.createElement('work-item-summary',props);
export const QuotationDiscountControls=props=>React.createElement('financial-controls',props);
export const QuotationLineItemPopup=props=>React.createElement("dialog",props,props.children);export const SearchableSelect=()=>null;export const CustomerConnectionFlow=()=>null;export const PropertyForm=()=>null;export const SpecialWallSheet=()=>null;export const previewPdf=()=>{};
export const Button=({children,loading,variant,...props})=>React.createElement('button',{type:'button',...props},children);export const PageHeader=({title,description})=>React.createElement('h1',null,title,description);export const StatusBadge=()=>null;`;
const stubUrl=`data:text/javascript;base64,${Buffer.from(stub).toString('base64')}`;
const sourceUrl=new URL('../pages/QuotationBuilder.jsx',import.meta.url);
let source=await fs.readFile(sourceUrl,'utf8');source=source.replace(/import \{ QuotationLineItemPopup \} from ["'][^"']+["'];/,`import {QuotationLineItemPopup} from ${JSON.stringify(stubUrl)};`);source=source.replace(/^import ["'][^"']+\.css["'];$/gm,'');
source=source.replace(/import useAuth from ["'][^"']+["'];/,`import {useAuth} from ${JSON.stringify(stubUrl)};`);
for(const name of ['QuotationDocumentItems','api','useDraftUnsavedChanges','GroupedQuotationWorkspace','QuotationPricingRows','QuotationWorkItemSummary','QuotationDiscountControls','SearchableSelect','CustomerConnectionFlow','PropertyForm','SpecialWallSheet'])source=source.replace(new RegExp('import '+name+' from [\"\'][^\"\']+[\"\'];'),`import {${name}} from ${JSON.stringify(stubUrl)};`);
const transformed=await transformWithOxc(source,sourceUrl.pathname,{jsx:{runtime:'automatic'}});
const code=transformed.code.replace(/from\s+(["'])([^"']+)\1/g,(_m,_q,name)=>`from ${JSON.stringify(name==='react-router-dom'||name.endsWith('/ui')||name.endsWith('/PdfPreview')?stubUrl:name.startsWith('data:')?name:name.startsWith('.')?new URL(name.endsWith('.js')?name:name+'.js',sourceUrl).href:import.meta.resolve(name))}`);
const {default:Builder}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const button=(view,name)=>view.root.findAllByType('button').find(node=>node.children.includes(name));
test('review deletion confirms and releases a measured assignment without API writes',async()=>{
 const view=await open();
 try {
  await act(async()=>button(view,'Continue').props.onClick());
  await act(async()=>button(view,'Continue').props.onClick());
  let rows=view.root.findByType('pricing-rows');
  const originalCount=rows.props.items.length;
  window.confirm=()=>false;
  await act(async()=>rows.props.onDelete(rows.props.items[0]));
  assert.equal(view.root.findByType('pricing-rows').props.items.length,originalCount);
  window.confirm=()=>true;
  await act(async()=>rows.props.onDelete(rows.props.items[0]));
  assert.equal(view.root.findByType('pricing-rows').props.items.length,originalCount-1);
  assert.equal(globalThis.__builderCalls.length,0);
 } finally { await act(async()=>view.unmount()); }
});
async function open(){resetBrowser();globalThis.__builderFixture=fixture();globalThis.__builderMasters=masters;globalThis.__builderMeasurement=measurement;globalThis.__builderCalls=[];delete globalThis.__builderFailure;delete globalThis.__builderSendFailure;let view;await act(async()=>{view=create(React.createElement(Builder,{initialQuotation:globalThis.__builderFixture}));});return view;}
test('shared builder restores grouped Draft and navigates all three stages without writes',async()=>{
 const view=await open();try{
  assert.equal(view.root.findAllByProps({id:'quotation-area-calculation'})[0].props.disabled,true);
  await act(async()=>button(view,'Continue').props.onClick());assert.equal(view.root.findByType('workspace').props.phase,undefined);
  await act(async()=>button(view,'Continue').props.onClick());const rows=view.root.findByType('pricing-rows');assert.equal(rows.props.items.length,fixture().items.length);assert.equal(globalThis.__builderCalls.length,0);
  assert.equal(view.root.findByType('financial-controls').props.showLineControls,true);
  assert.equal(rows.props.canEdit,true);
  assert.equal(view.root.findByType('financial-controls').props.showHelp,false);
  const heading=view.root.findAllByType('h2').find(node=>node.children.includes('Review & Finalize'));
  assert.equal(heading.parent.findAllByType('span').some(node=>node.children.join('') === `Measurement version ${measurement.version}`),true);
  assert.equal(view.root.findAllByType('dt').some(node=>node.children.includes('Measurement version')),false);
 }finally{await act(async()=>view.unmount());}
});
test('shared pricing changes save atomically; failed save keeps edits and retry uses original identity',async()=>{
 const view=await open();try{
  await act(async()=>button(view,'Continue').props.onClick());await act(async()=>button(view,'Continue').props.onClick());
  const rows=view.root.findByType('pricing-rows'),line=rows.props.items[0];
  await act(async()=>rows.props.onChange(line,'discount_type','PERCENTAGE'));await act(async()=>view.root.findByType('pricing-rows').props.onChange(view.root.findByType('pricing-rows').props.items[0],'discount_value','15'));
  globalThis.__builderFailure={response:{status:409,data:{detail:'Draft changed in another session.'}}};
  await act(async()=>button(view,'Save new version').props.onClick());
  assert.equal(view.root.findByType('pricing-rows').props.items[0].discount_value,'15');assert.match(view.root.findByProps({role:'alert'}).children.join(''),/another session/);
  delete globalThis.__builderFailure;await act(async()=>button(view,'Save new version').props.onClick());
  const request=globalThis.__builderCalls.at(-1);assert.equal(request[0],'post');assert.equal(request[1],'/quotations/42/versions/');assert.equal(request[2].expected_updated_at,fixture().updated_at);assert.equal(request[2].items[0].discount_value,'15');assert.equal(request[2].items[0].id,200);assert.equal(request[2].status,undefined);assert.equal(globalThis.__builderCalls.filter(([method,path])=>method==='post' && path.endsWith('/submit/')).length,0);assert.equal(globalThis.__builderCalls[0][2].edit_request_id,request[2].edit_request_id);assert.equal(globalThis.__builderNavigate,'/quotations/43');
 }finally{await act(async()=>view.unmount());}
});

test('manual Create does not populate measured lines when property measurements load',async()=>{
 resetBrowser();
 globalThis.__builderLocation={pathname:'/quotations/new-manual',state:{}};
 globalThis.__builderFixture=fixture();globalThis.__builderMasters=masters;globalThis.__builderMeasurement=measurement;globalThis.__builderCalls=[];
 let view;
 try{
  await act(async()=>{view=create(React.createElement(Builder));});
  await act(async()=>button(view,'Saved customer').props.onClick());
  await act(async()=>view.root.findAllByType('select')[0].props.onChange({target:{value:'2'}}));
  await act(async()=>button(view,'Continue').props.onClick());
  assert.equal(view.root.findByType('work-item-summary').props.items.length,0);
  await act(async()=>view.root.findByType('work-item-summary').props.onAdd());
  assert.equal(view.root.findByType('work-item-summary').props.items.length,1);
  assert.equal(globalThis.__builderCalls.length,0);
 }finally{if(view)await act(async()=>view.unmount());delete globalThis.__builderLocation;}
});

test('remount after refresh recovers actual builder pricing and stage without API writes',async()=>{
 let view=await open();
 try {
  await act(async()=>button(view,'Continue').props.onClick());
  await act(async()=>button(view,'Continue').props.onClick());
  let rows=view.root.findByType('pricing-rows');
  await act(async()=>rows.props.onChange(rows.props.items[0],'discount_value','23'));
  window.dispatchEvent(new Event('pagehide'));
  await act(async()=>view.unmount());
  await act(async()=>{view=create(React.createElement(Builder,{initialQuotation:globalThis.__builderFixture}));});
  rows=view.root.findByType('pricing-rows');
  assert.equal(rows.props.items[0].discount_value,'23');
  assert.equal(rows.props.items[0].id,200);
  assert.equal(globalThis.__builderCalls.length,0);
 }finally{await act(async()=>view.unmount());}
});

test('disabled persistent storage keeps saved Draft usable without writes',async()=>{
 let view=await open();
 await act(async()=>view.unmount());
 Object.defineProperty(window,'localStorage',{get(){throw Error('Browser storage blocked');},configurable:true});
 try {
  await act(async()=>{view=create(React.createElement(Builder,{initialQuotation:globalThis.__builderFixture}));});
  assert.equal(globalThis.__builderCalls.length,0);
  await act(async()=>button(view,'Continue').props.onClick());
  await act(async()=>button(view,'Continue').props.onClick());
  assert.equal(view.root.findByType('pricing-rows').props.items[0].id,200);
  assert.equal(globalThis.__builderCalls.length,0);
 }finally{await act(async()=>view.unmount());resetBrowser();}
});

test('pending atomic save disables inputs and repeated clicks do not submit twice',async()=>{
 const view=await open();let release,operation;
 try{
  await act(async()=>button(view,'Continue').props.onClick());await act(async()=>button(view,'Continue').props.onClick());
  globalThis.__builderWait=new Promise(resolve=>{release=resolve;});
  const save=button(view,'Save new version').props.onClick;
  await act(async()=>{operation=save();});
  assert.ok(view.root.findAllByType('fieldset').some(node=>node.props.disabled===true));
  await act(async()=>{save();});assert.equal(globalThis.__builderCalls.length,1);
  await act(async()=>{release();await operation;});assert.equal(view.root.findAllByType('fieldset').some(node=>node.props.disabled===true),false);
 }finally{delete globalThis.__builderWait;if(release)release();await act(async()=>view.unmount());}
});


test('failed measurement reload does not erase recovered Create groups or measurement version',async()=>{
 resetBrowser();
 globalThis.__builderFixture=fixture();globalThis.__builderMasters=masters;globalThis.__builderMeasurement=measurement;globalThis.__builderCalls=[];
 const key=recoveryKey(1,'/quotations/new','');
 const state={form:{customer:1,property:2,discount_mode:'LINE',discount_type:'FIXED',discount_value:0,gst_mode:'NO_GST',gst_percentage:0,notes:'Retain even when loading fails',valid_until:'2100-01-01'},items:[],groupAssignments:exampleAssignments(),selectedRoomIds:measurement.rooms.map(room=>room.id),selectedFieldIds:[],specialWalls:[],selectedMeasurementId:String(measurement.id),useMeasurements:true,step:1,customerSearch:'Saved customer'};
 writeRecovery(window.localStorage,key,state,null);
 globalThis.__builderReadFailure=true;
 let view;
 try {
  await act(async()=>{view=create(React.createElement(Builder));});
  const retained=readRecovery(window.localStorage,key,null);
  assert.equal(retained.selectedMeasurementId,String(measurement.id));
  assert.deepEqual(retained.groupAssignments.groups,state.groupAssignments.groups);
  assert.equal(retained.form.notes,state.form.notes);
  assert.equal(globalThis.__builderCalls.length,0);
 }finally{delete globalThis.__builderReadFailure;if(view)await act(async()=>view.unmount());resetBrowser();}
});
