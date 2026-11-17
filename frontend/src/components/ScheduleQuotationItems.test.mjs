import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import React from 'react';
import { act, create } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__scheduleQuotationReact = React;
const source = await readFile(new URL('./ScheduleQuotationItems.jsx', import.meta.url),'utf8');
let path;
globalThis.__scheduleQuotationApi = { get: async url => { path=url; return {data:{items:[{id:1,service_category_name:'Painting'},{id:2,service_category_name:'Cleaning'}],rooms:[]}}; } };
let code = source.replace(/import\s+["'][^"']+\.css["'];?/g,'')
  .replace(/import api from [^;]+;/,'const api=globalThis.__scheduleQuotationApi;')
  .replace(/import QuotationDocumentItems[^;]+;/,'const QuotationDocumentItems=({items})=>React.createElement("output",null,items.map(row=>row.id).join(",")); const QuotationDocumentItemDetails=()=>null;')
  .replace(/import \{ QuotationLineItemPopup \}[^;]+;/,'const QuotationLineItemPopup=({children})=>children;')
  .replace(/import \{ Link \}[^;]+;/,'const Link=({children})=>React.createElement("a",null,children);');
code = (await transformWithOxc(code,'ScheduleQuotationItems.jsx',{jsx:{runtime:'automatic'}})).code;
for (const match of [...code.matchAll(/from\s+(["'])([^"']+)\1/g)]) {
  const specifier = match[2].startsWith('.') ? new URL(match[2], import.meta.url).href : import.meta.resolve(match[2]);
  code=code.replace(match[0],`from ${JSON.stringify(specifier)}`);
}
const Component=(await import(`data:text/javascript;base64,${Buffer.from('const React=globalThis.__scheduleQuotationReact;'+code).toString('base64')}`)).default;

test('customer quote endpoint and category filter preserve original item identity',async()=>{
  let selected='unset', view;
  await act(async()=>{view=create(React.createElement(Component,{quotationId:7,role:'CUSTOMER',onFilterItems:value=>{selected=value;}}));});
  assert.equal(path,'/quotations/customer-portal/quotations/7/');
  assert.equal(view.root.findByType('output').children[0],'1,2');
  await act(async()=>view.root.findByType('select').props.onChange({target:{value:'painting'}}));
  assert.equal(view.root.findByType('output').children[0],'1');
  assert.deepEqual(selected,['1']);
  await act(async()=>view.root.findByType('select').props.onChange({target:{value:''}}));
  assert.equal(selected,null);
  await act(async()=>view.unmount());
});
