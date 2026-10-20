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
export const useLocation=()=>({state:{},search:globalThis.__quotationSearch||'',key:'test-route'});
export const useAuth=()=>({user:{role:'CONTRACTOR'}});
export const useNavigate=()=> (...args)=>globalThis.__quotationNavigation=args;
export const Link=({to,children,...props})=>React.createElement('a',{href:to,...props},children);
export default {
get:async path=>{globalThis.__quotationCalls.push(['get',path]);return {data:path==='/quotations/42/'?globalThis.__quotationFixture:path==='/quotations/customers/1/'?{name:'Customer'}:path==='/quotations/properties/2/'?{name:'Property'}:[]}},
patch:async(...args)=>{globalThis.__quotationCalls.push(['patch',...args]);if(globalThis.__quotationFailure)throw globalThis.__quotationFailure;return {data:{}}},delete:async()=>({})};
export const BackButton=()=>null;
export const SearchableSelect=()=>null;
export const QuotationLineDiscountSummary=()=>null;
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
  source=source.replace(/^import "\.\/quotation-measurement.css";$/m,'');
  source=source.replace(/import QuotationDocumentItems, \{ QuotationDocumentItemDetails \} from ["'][^"']+["'];/, 'const QuotationDocumentItems=()=>null; const QuotationDocumentItemDetails=()=>null;');
  source=source.replace(/import \{ QuotationLineItemPopup \} from ["'][^"']+["'];/, 'const QuotationLineItemPopup=()=>null;');
  source=source.replace(/import \{ QuotationRevisionHistory, QuotationRevisionDetails, QuotationRevisionPriceChanges \} from ["'][^"']+["'];/,`import { QuotationRevisionHistory, QuotationRevisionDetails, QuotationRevisionPriceChanges } from ${JSON.stringify(stubUrl)};`);
  for(const component of ['BackButton','SearchableSelect','GroupedQuotationDraftEditor','QuotationDiscountControls','QuotationLineDiscountSummary','QuotationBuilder','useAuth']) source=source.replace(new RegExp('import '+component+' from [\"\'][^\"\']+[\"\'];'),`import {${component}} from ${JSON.stringify(stubUrl)};`);
  const transformed=await transformWithOxc(source,url.pathname,{jsx:{runtime:'automatic'}});
  const code=transformed.code.replace(/from\s+(["'])([^"']+)\1/g,(_match,_quote,path)=>`from ${JSON.stringify(path==='react-router-dom'||path.endsWith('/api/client')||path.endsWith('/ui')||path.endsWith('/PdfPreview')?stubUrl:path.startsWith('.')?new URL(path+(path.endsWith('.js')||path.endsWith('.jsx')||path.endsWith('.ts')||path.endsWith('.tsx')?'':'.js'),url).href:path.startsWith('data:')?path:import.meta.resolve(path))}`);
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
}
const Editor=await loadPage('QuotationEdit');
const Detail=await loadPage('QuotationDetail');
const fixture=status=>({id:42,status,can_edit:status==='DRAFT',can_create_version:true,can_delete:status==='DRAFT',customer:1,property:2,quotation_type:'MANUAL_LUMPSUM',updated_at:'2026-10-10T10:00:00Z',rooms:[],items:[],gst_mode:'NO_GST',gst_percentage:0,discount_type:'FIXED',discount_value:0,notes:'Saved notes'});

test('detail offers version editing at every stage and deletion only on Draft', async()=>{
  for(const status of ['DRAFT','SENT','ACCEPTED','REVISION_REQUESTED','COMPLETED','CONVERTED']) {
    globalThis.__quotationFixture={...fixture(status),revision_draft:status==='REVISION_REQUESTED'?{id:43}:null};
    globalThis.__quotationCalls=[];
    let view;await act(async()=>{view=create(React.createElement(Detail));});
    assert.equal(view.root.findAllByProps({href:'/quotations/42/edit'}).length,1,status);
    assert.equal(view.root.findAllByType('button').filter(button=>button.children.includes('Delete')).length,status==='DRAFT'?1:0,status);
    if(status==='REVISION_REQUESTED') assert.equal(view.root.findAllByProps({href:'/quotations/43'}).length,1);
    await act(async()=>view.unmount());
  }
});

test('direct submitted edit URLs open the shared version editor', async()=>{
  for(const status of ['SENT','ACCEPTED','COMPLETED','CANCELLED']) {
    globalThis.__quotationFixture=fixture(status);globalThis.__quotationCalls=[];
    let view;await act(async()=>{view=create(React.createElement(Editor));});
    assert.equal(view.root.findAllByType('form').length,0);
    assert.deepEqual(globalThis.__quotationCalls,[['get','/quotations/42/']]);
    assert.deepEqual(view.root.findByType('unified-builder').props.initialQuotation,globalThis.__quotationFixture);
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
 globalThis.__quotationFixture={...fixture('DRAFT'),can_edit:false,can_create_version:false};globalThis.__quotationCalls=[];
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
