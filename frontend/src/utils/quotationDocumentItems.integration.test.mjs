import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React, {useState} from 'react';
import {create,act} from 'react-test-renderer';
import {transformWithOxc} from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const url=new URL('../components/QuotationDocumentItems.jsx',import.meta.url);
const source=(await fs.readFile(url,'utf8')).replace(/^import ['"][^'"]+\.css['"];?$/gm,'');
const result=await transformWithOxc(source,url.pathname,{jsx:{runtime:'automatic'}});
const code=result.code.replace(/from\s+(['"])([^'"]+)\1/g,(_m,_q,name)=>`from ${JSON.stringify(name.startsWith('.')?new URL(name,url).href:import.meta.resolve(name))}`);
const {default:Items,QuotationDocumentItemDetails}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const item={id:1,service_category_name:'Painting',brand_name:'Paint brand',paint_type_name:'Emulsion',coats:2,quantity:330,rate:20,amount:6600,unit_name:'sqft',specification_details:{painting_process:'PUTTY_PRIMER_PAINT',base_description:'Smooth finish',surface:'WALL'}};
test('mobile box opens the complete readable item details',async()=>{
  let view;
  function Harness(){const [selected,setSelected]=useState(null);return React.createElement(React.Fragment,null,React.createElement(Items,{items:[item],form:{discount_mode:'LINE'},onView:setSelected}),selected&&React.createElement(QuotationDocumentItemDetails,{item:selected,form:{discount_mode:'LINE'}}));}
  await act(async()=>{view=create(React.createElement(Harness));});
  assert.equal(view.root.findAllByProps({className:'quotation-document-detail-grid'}).length,0);
  const card=view.root.findByProps({className:'quotation-document-card'});
  await act(async()=>card.props.onClick());
  const details=view.root.findByProps({className:'quotation-document-detail-grid'});
  const labels=details.findAllByType('dt').map(node=>node.children.join(''));
  assert.equal(labels.includes('Painting Process'),false);
  assert.ok(labels.includes('Description'));
  assert.ok(labels.includes('Brand / Product'));
  assert.ok(labels.includes('Unit'));
  const text=details.findAllByType('dd').map(node=>node.children.join('')).join('|');
  assert.doesNotMatch(text,/Putty \+ Primer \+ Paint/);
  assert.match(text,/Smooth finish/);
  assert.match(text,/Paint brand \/ Emulsion/);
  await act(async()=>view.unmount());
});
