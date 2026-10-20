import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import {create,act} from 'react-test-renderer';
import {transformWithOxc} from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const stub=`import React from ${JSON.stringify(import.meta.resolve('react'))};
export const SectionCard=({children})=>React.createElement('section',null,children);
export const FormField=({as,label,children,...props})=>React.createElement(as==='select'?'select':'input',{'aria-label':label,...props},children);`;
const stubUrl=`data:text/javascript;base64,${Buffer.from(stub).toString('base64')}`;
const url=new URL('../components/QuotationDiscountControls.jsx',import.meta.url);
const transformed=await transformWithOxc(await fs.readFile(url,'utf8'),url.pathname,{jsx:{runtime:'automatic'}});
const code=transformed.code.replace(/from\s+(["'])([^"']+)\1/g,(_match,_quote,path)=>`from ${JSON.stringify(path==='./ui'?stubUrl:path.startsWith('.')?new URL(path,url).href:import.meta.resolve(path))}`);
const {default:Controls}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('mode switching retains individual percentage/fixed discounts and shows precise totals',async()=>{
 let latest;
 function Harness(){
  const [form,setForm]=React.useState({discount_mode:'OVERALL',discount_type:'FIXED',discount_value:0,gst_mode:'GST_EXTRA',gst_percentage:18});
  const [items,setItems]=React.useState([{id:1,quantity:345,rate:10,description:'Normal walls'},{id:2,quantity:125,rate:10,description:'Texture'}]);
  latest={form,items};
  return React.createElement(Controls,{form,items,onChange:(name,value)=>setForm(current=>({...current,[name]:value})),onLineChange:(item,field,value)=>setItems(current=>current.map(line=>line.id===item.id?{...line,[field]:value}:line))});
 }
 let view;await act(async()=>{view=create(React.createElement(Harness));});
 const change=async(label,value)=>act(async()=>view.root.findByProps({'aria-label':label}).props.onChange({target:{value}}));
 await change('Discount mode','LINE');
 await change('Line 1 discount type','PERCENTAGE');await change('Line 1 discount','10');
 await change('Line 2 discount','50');
 assert.match(view.root.findByProps({role:'status'}).children.join(''),/5,079\.90/);
 await change('Discount mode','OVERALL');await change('Overall discount','125');
 assert.equal(latest.items[0].discount_value,'10');
 await change('Discount mode','LINE');
 assert.equal(view.root.findByProps({'aria-label':'Line 1 discount'}).props.value,'10');
 assert.match(view.root.findByProps({role:'status'}).children.join(''),/5,079\.90/);
 await change('Discount mode','BOTH');
 assert.equal(view.root.findByProps({'aria-label':'Overall discount'}).props.value,'125');
 assert.equal(view.root.findByProps({'aria-label':'Line 1 discount'}).props.value,'10');
 assert.match(view.root.findByProps({role:'status'}).children.join(''),/4,932\.40/);
 await act(async()=>view.unmount());
});
