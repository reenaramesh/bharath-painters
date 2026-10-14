import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { transformWithOxc } from 'vite';
import { rememberQuotationSubmission } from './quotationSubmission.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const stub = `import React from ${JSON.stringify(import.meta.resolve('react'))};
export const useParams=()=>({id:'42'});
export const useLocation=()=>({state:{}});
export const useNavigate=()=> (...args)=>globalThis.__quotationNavigation=args;
export const Link=({to,children,...props})=>React.createElement('a',{href:to,...props},children);
export default {
get:async path=>{globalThis.__quotationCalls.push(['get',path]);return {data:path==='/quotations/42/'?globalThis.__quotationFixture:path==='/quotations/customers/1/'?{name:'Customer'}:path==='/quotations/properties/2/'?{name:'Property'}:[]}},
patch:async(...args)=>{globalThis.__quotationCalls.push(['patch',...args]);if(globalThis.__quotationFailure)throw globalThis.__quotationFailure;return {data:{}}},
post:async(...args)=>{globalThis.__quotationCalls.push(['post',...args]);if(globalThis.__quotationPostFailure)throw globalThis.__quotationPostFailure;return {data:{id:43}}},delete:async()=>({})};
export const BackButton=()=>null;
export const SearchableSelect=()=>null;
export const QuotationLineDiscountSummary=()=>null;
export const QuotationLineItemPopup=({children})=>React.createElement('div',null,children);
export const QuotationRevisionHistory=()=>null;
export const QuotationRevisionDetails=()=>null;
export const QuotationRevisionPriceChanges=()=>null;
export const QuotationDiscountControls=props=>React.createElement("discount-controls",props);
export const GroupedQuotationDraftEditor=()=>null;
export const QuotationBuilder=props=>React.createElement("unified-builder",props);
export const previewPdf=()=>{};
export const Button=({children,loading,variant,...props})=>React.createElement('button',props,children);
export const PageHeader=({title,description,actions})=>React.createElement('header',null,title,description,actions);
export const ErrorState=({message})=>React.createElement('p',null,message);
export const LoadingState=()=>null;
export const StatusBadge=({status})=>React.createElement('span',null,status);
export const SectionCard=({children})=>React.createElement('section',null,children);`;
const stubUrl=`data:text/javascript;base64,${Buffer.from(stub).toString('base64')}`;
async function loadPage(name) {
  const url=new URL('../pages/'+name+'.jsx',import.meta.url);
  let source=await fs.readFile(url,'utf8');
  source=source.replace('import QuotationDocumentItems, { QuotationDocumentItemDetails } from "../components/QuotationDocumentItems.jsx";','const QuotationDocumentItems=()=>null; const QuotationDocumentItemDetails=()=>null;');
  source=source.replace('import { QuotationLineItemPopup } from "../components/QuotationLineItemPopup.jsx";','import { QuotationLineItemPopup } from '+JSON.stringify(stubUrl)+';');
  source=source.replace(/^import "\.\/quotation-measurement.css";$/m,'');
  source=source.replace(/import \{ QuotationRevisionHistory, QuotationRevisionDetails, QuotationRevisionPriceChanges \} from ["'][^"']+["'];/,`import { QuotationRevisionHistory, QuotationRevisionDetails, QuotationRevisionPriceChanges } from ${JSON.stringify(stubUrl)};`);
  for(const component of ['BackButton','SearchableSelect','GroupedQuotationDraftEditor','QuotationDiscountControls','QuotationLineDiscountSummary','QuotationBuilder','QuotationLineItemPopup']) source=source.replace(new RegExp('import '+component+' from [\"\'][^\"\']+[\"\'];'),`import {${component}} from ${JSON.stringify(stubUrl)};`);
  const transformed=await transformWithOxc(source,url.pathname,{jsx:{runtime:'automatic'}});
  const code=transformed.code.replace(/from\s+(["'])([^"']+)\1/g,(_match,_quote,path)=>`from ${JSON.stringify(path==='react-router-dom'||path.endsWith('/api/client')||path.endsWith('/ui')||path.endsWith('/PdfPreview')?stubUrl:path.startsWith('.')?new URL(path+(path.endsWith('.js')||path.endsWith('.jsx')?'':'.js'),url).href:path.startsWith('data:')?path:import.meta.resolve(path))}`);
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
}
const Editor=await loadPage('QuotationEdit');
const Detail=await loadPage('QuotationDetail');
const fixture=status=>({id:42,status,can_edit:status==='DRAFT',can_delete:status==='DRAFT',customer:1,property:2,quotation_type:'MANUAL_LUMPSUM',updated_at:'2026-10-10T10:00:00Z',rooms:[],items:[],gst_mode:'NO_GST',gst_percentage:0,discount_type:'FIXED',discount_value:0,notes:'Saved notes'});

test('detail offers revision editing after submission until acceptance, while preserving draft-only deletion', async()=>{
  for(const status of ['DRAFT','SENT','VIEWED','ACCEPTED','REVISION_REQUESTED','REJECTED','EXPIRED','COMPLETED','CONVERTED']) {
    globalThis.__quotationFixture={...fixture(status),revision_draft:status==='REVISION_REQUESTED'?{id:43}:null};
    globalThis.__quotationCalls=[];
    let view;await act(async()=>{view=create(React.createElement(Detail));});
    assert.equal(view.root.findAllByProps({href:'/quotations/42/edit'}).length,status==='DRAFT'?1:0,status);
    assert.equal(view.root.findAllByType('button').filter(button=>button.children.includes('Delete')).length,status==='DRAFT'?1:0,status);
    const canRevise=['SENT','VIEWED','REVISION_REQUESTED','REJECTED','EXPIRED'].includes(status);
    const revisionButton=view.root.findAllByType('button').find(button=>button.children.includes('Edit quotation'));
    assert.equal(Boolean(revisionButton),canRevise,status);
    if(canRevise){await act(async()=>revisionButton.props.onClick());assert.deepEqual(globalThis.__quotationCalls.find(call=>call[0]==='post'),['post','/quotations/42/revision-draft/',{}]);assert.deepEqual(globalThis.__quotationNavigation,['/quotations/43/edit']);}
    if(status==='REVISION_REQUESTED') assert.equal(view.root.findAllByProps({href:'/quotations/43'}).length,1);
    await act(async()=>view.unmount());
  }
});

test('revision action explains when the connected API has not been updated',async()=>{
 globalThis.__quotationFixture=fixture('SENT');globalThis.__quotationCalls=[];
 globalThis.__quotationPostFailure={response:{status:404,data:'<!doctype html><title>Not Found</title>'}};
 let view;await act(async()=>{view=create(React.createElement(Detail));});
 const button=view.root.findAllByType('button').find(entry=>entry.children.includes('Edit quotation'));
 await act(async()=>button.props.onClick());
 assert.match(JSON.stringify(view.toJSON()),/connected API does not have quotation revision editing enabled yet/);
 await act(async()=>view.unmount());
 globalThis.__quotationPostFailure=null;
});

test('direct submitted edit URLs stop before loading editable masters or form', async()=>{
  for(const status of ['SENT','ACCEPTED','COMPLETED','CANCELLED']) {
    globalThis.__quotationFixture=fixture(status);globalThis.__quotationCalls=[];
    let view;await act(async()=>{view=create(React.createElement(Editor));});
    assert.equal(view.root.findAllByType('form').length,0);
    assert.deepEqual(globalThis.__quotationCalls,[['get','/quotations/42/']]);
    assert.equal(view.root.findByType('header').children[0],'This version is preserved');
    await act(async()=>view.unmount());
  }
});

test('Send from grouped review preserves the existing customer login and sharing dialog',async()=>{
 const previousWindow=globalThis.window;
 globalThis.window={location:{origin:'http://qa.example'}};
 globalThis.__quotationFixture=fixture('SENT');globalThis.__quotationCalls=[];
 rememberQuotationSubmission(42,{status:'SENT',customer_id:'QA-CUSTOMER',customer_mobile:'test-mobile',temporary_password:'synthetic-only'});
 let view;
 try {
  await act(async()=>{view=create(React.createElement(Detail));});
  assert.equal(view.root.findAllByType('button').filter(button=>button.children.includes('Copy login details')).length,1);
  assert.equal(view.root.findAllByType('h2').filter(heading=>heading.children.includes('Final quotation submitted')).length,1);
  await act(async()=>view.unmount());view=null;
  await act(async()=>{view=create(React.createElement(Detail));});
  assert.equal(view.root.findAllByType('button').filter(button=>button.children.includes('Copy login details')).length,0,'handoff is consumed once');
 } finally {
  if(view)await act(async()=>view.unmount());
  globalThis.window=previousWindow;
 }
});

test('server-denied Draft edit is hidden and direct URL remains read-only', async()=>{
 globalThis.__quotationFixture={...fixture('DRAFT'),can_edit:false};globalThis.__quotationCalls=[];
 let view;await act(async()=>{view=create(React.createElement(Detail));});
 assert.equal(view.root.findAllByProps({href:'/quotations/42/edit'}).length,0);
 await act(async()=>view.unmount());
 await act(async()=>{view=create(React.createElement(Editor));});
 assert.equal(view.root.findAllByType('form').length,0);
 assert.equal(view.root.findByType('header').children[0],'Draft editing is unavailable');
 await act(async()=>view.unmount());
});

test('legacy Draft delegates intact saved data to the shared builder',async()=>{
 globalThis.__quotationFixture=fixture('DRAFT');globalThis.__quotationCalls=[];
 let view;await act(async()=>{view=create(React.createElement(Editor));});
 assert.deepEqual(view.root.findByType('unified-builder').props.initialQuotation,globalThis.__quotationFixture);
 assert.deepEqual(globalThis.__quotationCalls,[['get','/quotations/42/']]);
 await act(async()=>view.unmount());
});

test('lump-sum item form uses two columns on wider screens and phones',async()=>{
 const builder=await fs.readFile(new URL('../pages/QuotationBuilder.jsx',import.meta.url),'utf8');
 const css=await fs.readFile(new URL('../components/quotation-line-item-popup.css',import.meta.url),'utf8');
 assert.match(builder,/lsq-item-form \$\{lumpsum \? "is-lumpsum"/);
 assert.match(css,/@media \(min-width:640px\)[\s\S]*?\.lsq-item-form\.is-lumpsum \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media \(max-width:639px\)[\s\S]*?\.lsq-item-form\.is-lumpsum \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
