import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleChoices,resetOfferSource,allocationItems,categoryGroups } from './workOrderOfferWizard.js';
import { initialWorkOrderMargins,workOrderPricingPayload } from './workOrderPricing.js';

test('customer/property dependencies exclude unrelated quotations and clear incompatible selections',()=>{
 const source={customer:'1',property:'4',quotation:'8'};
 const catalog={properties:[{id:4,customer:1},{id:5,customer:2}],quotations:[{id:8,customer:1,property:4},{id:9,customer:1,property:5},{id:10,customer:2,property:4}]};
 assert.deepEqual(eligibleChoices(catalog,source).quotations.map(row=>row.id),[8]);
 assert.deepEqual(resetOfferSource(source,'customer','2'),{customer:'2',property:'',quotation:''});
 assert.deepEqual(resetOfferSource(source,'property','5'),{customer:'1',property:'5',quotation:''});
});
test('master categories and exclusive vendor allocation preserve unassigned items',()=>{
 const items=[{id:1,service_category:4,description:'Wall'},{id:2,service_category:4},{id:3,service_category:5}];
 const groups=categoryGroups(items,[{id:4,name:'Painting'},{id:5,name:'Electrical'}]);
 assert.equal(groups[0].name,'Painting');assert.equal(groups[0].items.length,2);
 const allocation={1:'8',2:'9',3:''};assert.deepEqual(allocationItems(allocation,'8'),[1]);assert.deepEqual(allocationItems(allocation,'9'),[2]);
 const state={...initialWorkOrderMargins(items,null,{id:7}),allocation_mode:true};
 assert.equal(state.gst_mode,'NO_GST');
 const payload=workOrderPricingPayload(items,[1],state);assert.equal(payload.lines.length,1);assert.equal(payload.gst_mode,'NO_GST');
 assert.throws(()=>workOrderPricingPayload(items,[1,1],state));assert.throws(()=>workOrderPricingPayload(items,[99],state));
});
test('allocated Draft restores independent saved GST without inheriting customer tax',()=>{
 const state=initialWorkOrderMargins([{id:1}],{id:4,quotation:7,private_pricing:{allocated_item_ids:[1]},pricing_quote:{pricing:{gst_mode:'GST_INCLUDED',gst_percentage:'18.00'}}});
 assert.equal(state.allocation_mode,true);assert.equal(state.gst_mode,'GST_INCLUDED');assert.equal(state.gst_percentage,'18.00');
 const fresh=initialWorkOrderMargins([{id:1}],null,{id:7,gst_mode:'GST_EXTRA',gst_percentage:'18'});assert.equal(fresh.gst_mode,'NO_GST');
});
