import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkOrderMargins, workOrderPricingPayload } from './workOrderPricing.js';

const items=[{id:1,rate:'10',quantity:'1000',amount:'10000'},{id:2,rate:'20',quantity:'25',amount:'500'}];
test('complete source stays read only in financial payload; mixed margins contain no rates or discounts',()=>{
 const state=initialWorkOrderMargins(items,null,{id:7});
 state.margins[1]={type:'PERCENTAGE',value:'15'};
 state.margins[2]={type:'FIXED',value:'100'};
 const before=structuredClone(items);
 const payload=workOrderPricingPayload(items,[1,2],state);
 assert.deepEqual(items,before);
 assert.equal(payload.lines[1].margin_type,'FIXED');
 assert.equal(payload.margin_mode,'LINE');
 assert.equal(payload.share_customer_contact,false);
 assert.equal(payload.show_pricing_adjustment,false);
 assert.ok(!('unit_rate' in payload.lines[0]));
 assert.ok(!('discount_value' in payload));
 assert.throws(()=>workOrderPricingPayload(items,[1],state),/complete/);
});
test('reopening restores the margin mode, per-line choices, frozen source and independent sharing flags',()=>{
 const order={id:9,quotation:7,material_mode:'WITH_MATERIAL',private_pricing:{
  source_snapshot:{items},margin:{margin_mode:'OVERALL',margin_type:'FIXED',margin_value:'25.01',lines:[{source_item:1,margin_type:'PERCENTAGE',margin_value:'15.00'}]},
  sharing_permissions:{share_site_pin:true,share_customer_address:false,share_customer_contact:true,show_pricing_adjustment:false}}};
 const state=initialWorkOrderMargins(items,order);
 assert.equal(state.margin_value,'25.01');
 assert.equal(state.margins[1].value,'15.00');
 assert.equal(state.source_snapshot,order.private_pricing.source_snapshot);
 assert.equal(state.work_order,9);
 const payload=workOrderPricingPayload(items,[1,2],state);
 assert.equal(payload.share_site_pin,true);
 assert.equal(payload.share_customer_address,false);
 assert.equal(payload.share_customer_contact,true);
});
