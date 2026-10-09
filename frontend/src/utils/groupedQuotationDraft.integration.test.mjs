import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { transformWithOxc } from 'vite';
import { measurement, masters, exampleAssignments } from '../preview/quotationGrouping/fixtures.js';
import { assignmentQuotationItems } from './groupedQuotation.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const calls=[];
const stub = `import React from ${JSON.stringify(import.meta.resolve('react'))};
export const useNavigate=()=>target=>globalThis.__draftEditorNavigate=target;
export default {post:async (...args)=>{globalThis.__draftEditorCalls.push(['post',...args]);return {data:{quotation:{rooms:globalThis.__draftEditorRooms}}}},patch:async (...args)=>{globalThis.__draftEditorCalls.push(['patch',...args]);return {data:{}}}};
export const Workspace=props=>React.createElement('workspace',props);
export const BackButton=()=>null;
export const Button=({children,loading,variant,...props})=>React.createElement('button',{type:'button',...props},children);
export const FormField=()=>null;
export const PageHeader=()=>null;
export const SectionCard=({children})=>React.createElement('section',null,children);`;
const stubUrl=`data:text/javascript;base64,${Buffer.from(stub).toString('base64')}`;
const sourceUrl=new URL('../components/GroupedQuotationDraftEditor.jsx',import.meta.url);
let source=await fs.readFile(sourceUrl,'utf8');
source=source.replace('import GroupedQuotationWorkspace from "./GroupedQuotationWorkspace";',`import {Workspace as GroupedQuotationWorkspace} from ${JSON.stringify(stubUrl)};`)
 .replace('import BackButton from "./BackButton";',`import {BackButton} from ${JSON.stringify(stubUrl)};`);
const transformed=await transformWithOxc(source,sourceUrl.pathname,{jsx:{runtime:'automatic'}});
const code=transformed.code.replace(/from\s+(["'])([^"']+)\1/g,(_match,_quote,name)=>`from ${JSON.stringify(name==='react-router-dom'||name.endsWith('/api/client')||name==='./ui'?stubUrl:name.startsWith('.')?new URL(name,sourceUrl).href:name.startsWith('data:')?name:import.meta.resolve(name))}`);
const {default:Editor}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('draft edit opens paint-area phase and updates the same draft on repeated edits', async()=>{
 globalThis.__draftEditorCalls=calls;
 const rooms=measurement.rooms.map(room=>({id:room.id+100,property_room:room.id,name:room.name}));
 globalThis.__draftEditorRooms=rooms;
 let quotation={id:42,status:'DRAFT',quotation_type:'MEASUREMENT',measurement_record:measurement.id,rooms,items:assignmentQuotationItems(measurement,exampleAssignments(),masters).map((item,index)=>({...item,id:index+200}))};
 const form={status:'DRAFT',discount_value:5,gst_percentage:18,notes:'Keep these notes'};
 for(let pass=0;pass<2;pass++){
  let view;
  await act(async()=>{view=create(React.createElement(Editor,{quotation,form,setForm:()=>{},measurement,masters}));});
  const workspace=view.root.findByType('workspace');
  assert.equal(workspace.props.phase,'assignments');
  assert.ok(workspace.props.state.groups.length>0);
  assert.equal(view.root.findAllByType('form')[0].findAllByType('workspace').length,0,'workspace buttons cannot accidentally submit the draft');
  await act(async()=>{view.root.findAllByType('button').find(button=>button.children.includes('Continue to final quotation')).props.onClick();});
  await act(async()=>{view.root.findByType('form').props.onSubmit({preventDefault(){}});});
  const patch=calls.at(-1);
  assert.equal(patch[0],'patch');assert.equal(patch[1],'/quotations/42/');
  assert.equal(patch[2].notes,form.notes);
  assert.deepEqual(patch[2].items.map(item=>item.id),quotation.items.map(item=>item.id));
  assert.equal(globalThis.__draftEditorNavigate,'/quotations/42');
  quotation={...quotation,items:patch[2].items};
  await act(async()=>view.unmount());
 }
 assert.equal(calls.filter(call=>call[0]==='patch').length,2);
 assert.ok(calls.filter(call=>call[0]==='post').every(call=>call[1].endsWith('/rooms/sync/')),'never creates a replacement quotation');
 delete globalThis.__draftEditorCalls;delete globalThis.__draftEditorRooms;delete globalThis.__draftEditorNavigate;
});
