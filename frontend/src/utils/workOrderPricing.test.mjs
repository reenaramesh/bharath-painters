import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkOrderPricing, workOrderPricingItems, workOrderPricingPayload } from './workOrderPricing.js';
import { quotationTotals } from './quotationPricing.js';
const items=[{id:1,description:'Paint walls',quantity:'10',rate:'987.65',amount:'9876.50',discount_type:'PERCENTAGE',discount_value:'77'}];
test('material prices start editable but customer discounts are never copied to payable terms',()=>{
 const state=initialWorkOrderPricing(items);
 const rows=workOrderPricingItems(items,[1],state);
 assert.equal(rows[0].rate,'987.65');assert.equal(rows[0].discount_value,0);
 state.rates.WITH_MATERIAL[1]='11.11';state.discount_mode='LINE';state.discounts[1]={type:'PERCENTAGE',value:'10'};
 assert.equal(quotationTotals(workOrderPricingItems(items,[1],state),state).total,99.99);
 const dto=workOrderPricingPayload(items,[1],state);
 assert.equal(dto.lines[0].unit_rate,'11.11');assert.equal(dto.original_rate,undefined);assert.equal(dto.customer_discount,undefined);
});
test('labour requires an explicit rate or a valid private adjustment; half-even matches backend',()=>{
 const state=initialWorkOrderPricing(items);state.material_mode='WITHOUT_MATERIAL';
 assert.throws(()=>workOrderPricingPayload(items,[1],state),/labour/i);
 state.labour_method='SELLING_PERCENT';state.adjustment_percent='50';
 assert.equal(workOrderPricingItems(items,[1],state)[0].rate,'493.82');
 assert.equal(workOrderPricingPayload(items,[1],state).adjustment_percent,'50');
 state.adjustment_percent='';assert.throws(()=>workOrderPricingPayload(items,[1],state),/percentage/i);
});
test('reopen keeps material mode, rates, line and overall discount settings',()=>{
 const order={material_mode:'WITHOUT_MATERIAL',private_pricing:{labour_method:'DIRECT'},scopes:[{id:44,source_quotation_item:1}],pricing_quote:{pricing:{discount_mode:'LINE',discount_type:'FIXED',discount_value:'5',gst_mode:'NO_GST',gst_percentage:'0'},quote_lines:[{source_scope:44,unit_rate:'12.34',discount_type:'FIXED',discount_value:'2'}]}};
 const state=initialWorkOrderPricing(items,order);
 assert.equal(workOrderPricingItems(items,[1],state)[0].rate,'12.34');
 assert.equal(workOrderPricingPayload(items,[1],state).lines[0].discount_value,'2');
 assert.equal(state.discount_value,'5');assert.equal(state.discount_mode,'LINE');
});
