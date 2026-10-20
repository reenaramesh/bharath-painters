import test from 'node:test';
import assert from 'node:assert/strict';
import { quotationItemPresentation, quotationItemHeaders } from './quotationItemPresentation.js';

test('saved quotation columns show process and paint-only specifications', () => {
  const values = quotationItemPresentation({service_category_name:'Painting',brand_name:'Asian Paints',paint_type_name:'Emulsion',description:'generated scope | finish | process',coats:2,quantity:330,rate:20,specification_details:{painting_process:'PUTTY_PRIMER_PAINT',base_description:'Smooth finish',surface:'WALL',contributions:[{room_name:'Bedroom',quantity:330}],process_materials:{putty:{coats:1}}}});
  assert.deepEqual(quotationItemHeaders,['Service / Product Category','Room / Area & Surface','Description','Brand / Product','Coats','Sqft','Rate','Total','Actions']);
  assert.equal('process' in values,false);
  assert.equal(values.description,'Smooth finish');
  assert.equal(values.brandProduct,'Asian Paints / Emulsion');
  assert.equal(values.coats,2);
  assert.equal(values.roomSurface,'Bedroom / Walls');
});
test('customer payload names and legacy missing process remain readable', () => {
  const values=quotationItemPresentation({service_category:'Painting',paint_type:'Emulsion',paint_brand:'Asian Paints',room:'Bedroom',description:'Legacy finish',coats:2});
  assert.equal(values.category,'Painting');
  assert.equal(values.brandProduct,'Asian Paints / Emulsion');
  assert.equal(values.roomSurface,'Bedroom');
  assert.equal('process' in values,false);
});
