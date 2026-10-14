import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { transformWithOxc } from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const stub = `import React from ${JSON.stringify(import.meta.resolve('react'))};
export const QuotationLineItemPopup=({children})=>React.createElement('dialog',{open:true},children);
export const QuotationMobileLines=()=>null;
export default ()=>false;`;
const stubUrl = `data:text/javascript;base64,${Buffer.from(stub).toString('base64')}`;
const url = new URL('../components/QuotationPricingRows.jsx', import.meta.url);
async function componentModule(moduleUrl) {
  let source=(await fs.readFile(moduleUrl,'utf8')).replace(/import\s+['"][^'"]+\.css['"];?/g,'');
  for(const match of [...source.matchAll(/from\s+(['"])([^'"]+)\1/g)]) {
    const name=match[2];
    const target=name.startsWith('.')?new URL(name,moduleUrl):null;
    const resolved=name.includes('QuotationLineItemPopup')||name.includes('useMobileView')?stubUrl:target?.pathname.endsWith('.jsx')?await componentModule(target):target?.href||import.meta.resolve(name);
    source=source.replace(match[0],`from ${JSON.stringify(resolved)}`);
  }
  const result=await transformWithOxc(source,moduleUrl.pathname,{jsx:{runtime:'automatic'}});
  const code=result.code.replace(/from\s+(['"])([^'"]+)\1/g,(match,_q,name)=>name.startsWith('data:')||name.startsWith('file:')?match:`from ${JSON.stringify(import.meta.resolve(name))}`);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const {default:Rows}=await import(await componentModule(url));

test('Editable Pricing separates process and specifications in the requested order', async () => {
  let view, edited;
  const item = {id: 2, description:'Interior Walls | Smooth finish | Process: Putty + Primer + Paint', quantity:330, rate:20, coats:2, paint_brand_name:'Paint brand', paint_type_name:'Emulsion', specification_details:{kind:'group', painting_process:'PUTTY_PRIMER_PAINT', base_description:'Smooth finish', primer_coats:1, process_materials:{primer:{brand:8,product:9},putty:{brand:8,product:9,coats:2}}}};
  await act(async () => { view=create(React.createElement(Rows,{items:[item],form:{discount_mode:'BOTH'},units:[],masters:{brands:[{id:8,name:'Primer brand'}],paintTypes:[{id:9,name:'Primer product'}]},onChange(){},onEdit(value){edited=value;}})); });
  const headers=view.root.findAllByType('th').map(node=>node.children.join(''));
  assert.deepEqual(headers.slice(0,8),['Service / Product Category','Room / Area & Surface','Description','Brand / Product','Coats','Sqft','Rate','Total']);
  const cell = name => view.root.findByProps({'data-label':name});
  assert.equal(view.root.findAllByProps({'data-label':'Painting Process'}).length,0);
  assert.equal(cell('Description').children.join(''),'Smooth finish');
  assert.equal(cell('Brand / Product').findByType('span').children.join(''),'Paint brand');
  assert.equal(cell('Brand / Product').findByType('small').children.join(''),'Emulsion');
  assert.equal(cell('Coats').children.join(''),'2');
  assert.equal(view.root.findAllByProps({'aria-label':'Line 1 quantity'}).length,0);
  assert.equal(view.root.findAllByProps({'aria-label':'Line 1 rate'}).length,0);
  assert.equal(cell('Sqft').children.join(''),'330');
  assert.match(cell('Rate').children.join(''),/20/);
  assert.equal(view.root.findAllByProps({'aria-label':'Edit pricing for work item 1'}).length,0);
  assert.equal(view.root.findAllByType('p').some(node=>node.children.join('').includes('Net amounts include line discounts')),false);
  await act(async()=>view.root.findByProps({'aria-label':'Edit specifications for work item 1'}).props.onClick());
  assert.equal(edited.id,item.id);
  await act(async()=>view.unmount());
});

test('Step 3 exposes line discounts without Edit pricing or inline quantity/rate fields', async () => {
  let view, edited;
  function Harness() {
    const [items,setItems]=React.useState([{ id:1, description:'Repair',quantity:2,rate:100,custom_unit:'Job',calculation_method:'MANUAL' }]);
    return React.createElement(Rows,{items,form:{discount_mode:'LINE'},units:[],popupOnly:true,
      onChange:(item,key,value)=>setItems(current=>current.map(line=>({...line,[key]:value}))),onEdit:item=>{edited=item;}});
  }
  await act(async()=>{view=create(React.createElement(Harness));});
  assert.equal(view.root.findAllByProps({'aria-label':'Edit pricing for work item 1'}).length,0);
  assert.equal(view.root.findAllByProps({'aria-label':'Line 1 rate'}).length,0);
  assert.equal(view.root.findAllByProps({'aria-label':'Line 1 quantity'}).length,0);
  const discount=view.root.findByProps({'aria-label':'Line 1 discount'});
  assert.equal(discount.props.disabled,false);
  await act(async()=>discount.props.onChange({target:{value:'25'}}));
  const net=view.root.findByProps({'data-label':'Net'}).findByType('output').children.join('');
  assert.match(net,/175/);
  await act(async()=>view.root.findByProps({'aria-label':'Edit specifications for work item 1'}).props.onClick());
  assert.equal(edited.discount_value,'25');
  await act(async()=>view.unmount());
});
