import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { transformWithOxc } from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const router = `data:text/javascript;base64,${Buffer.from(`import React from ${JSON.stringify(import.meta.resolve('react'))};export const Link=({to,children,...props})=>React.createElement('a',{href:to,...props},children);`).toString('base64')}`;
const url = new URL('../components/QuotationRevisionDetails.jsx', import.meta.url);
const source = await fs.readFile(url, 'utf8');
const transformed = await transformWithOxc(source, url.pathname, {jsx:{runtime:'automatic'}});
const code = transformed.code.replace(/from\s+(["'])([^"']+)\1/g, (_match, _quote, path) => `from ${JSON.stringify(path==='react-router-dom'?router:import.meta.resolve(path))}`);
const { QuotationRevisionHistory, QuotationRevisionDetails, QuotationRevisionPriceChanges } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('version history links to the correct role route and identifies the current version', async () => {
  for (const customer of [false,true]) {
    let view;
    await act(async()=>{view=create(React.createElement(QuotationRevisionHistory,{customer,currentId:2,versions:[
      {id:1,version_number:1,quotation_number:'Q-V1',status:'REVISION_REQUESTED',grand_total:'100',quotation_date:'2026-10-11'},
      {id:2,version_number:2,quotation_number:'Q-V2',status:'SENT',grand_total:'90',quotation_date:'2026-10-11'},
    ]}));});
    assert.equal(view.root.findByType('a').props.href,`${customer?'/customer-quotations':'/quotations'}/1`);
    assert.equal(view.root.findByProps({'aria-current':'page'}).children.includes('Current version'),true);
    await act(async()=>view.unmount());
  }
});

test('discount and specification changes remain visible when gross amounts did not change',async()=>{
  let view;
  await act(async()=>{view=create(React.createElement(QuotationRevisionDetails,{changes:{
    discount_changes:[{description:'Paint',room:'Bedroom',previous_type:'FIXED',previous_value:'0',current_type:'PERCENTAGE',current_value:'10'}],
    specification_changes:[{description:'Paint',room:'Bedroom',fields:{coats:{previous:2,current:3},specification_details:{previous:{schema_version:1,assignment_id:'internal-trace',primer_coats:0},current:{schema_version:1,assignment_id:'internal-trace',primer_coats:1}}}}],
    quotation_changes:{gst_mode:{previous:'NO_GST',current:'GST_EXTRA'}},
  }}));});
  const text=JSON.stringify(view.toJSON());
  for(const expected of ['Discount changes','Scope and specification changes','Quotation settings','10%','Coats','GST']) assert.ok(text.includes(expected),expected);
  assert.ok(text.includes('Primer coats'));
  assert.ok(!text.includes('internal-trace'));
  await act(async()=>view.unmount());
});

test('mobile comparison includes both net values and the net difference', async()=>{
  let view;
  await act(async()=>{view=create(React.createElement(QuotationRevisionPriceChanges,{lines:[{
    room:'Walls - Bedroom 1',description:'Finish',previous_price:100,current_price:100,
    previous_net:100,current_net:90,net_difference:-10,
  }]}));});
  const text=JSON.stringify(view.toJSON());
  for(const expected of ['Previous net','Current net','Difference','100.00','90.00','-10.00','Walls - Bedroom 1']) assert.ok(text.includes(expected),expected);
  await act(async()=>view.unmount());
});
