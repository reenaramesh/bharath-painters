import test from 'node:test';
import assert from 'node:assert/strict';
import { quotationTotals } from './quotationPricing.js';

const items=[{quantity:345,rate:10,discount_type:'PERCENTAGE',discount_value:10},{quantity:125,rate:10,discount_type:'FIXED',discount_value:50}];
test('exclusive line discounts and GST extra match backend cents',()=>{
 const totals=quotationTotals(items,{discount_mode:'LINE',discount_type:'PERCENTAGE',discount_value:10,gst_mode:'GST_EXTRA',gst_percentage:18});
 assert.deepEqual([totals.subtotal,totals.discount,totals.gst,totals.total],[4700,395,774.9,5079.9]);
 assert.equal(totals.lines[0].net,3105);
 assert.equal(totals.lines[0].quantity,345);
 assert.equal(quotationTotals(items,{discount_mode:'LINE',gst_mode:'GST_EXTRA',gst_percentage:'18.50'}).total,5101.42);
});
test('overall percentage, fixed and included GST use existing tax rules',()=>{
 assert.equal(quotationTotals(items,{discount_value:10,discount_type:'PERCENTAGE',gst_mode:'GST_EXTRA',gst_percentage:18}).total,4991.4);
 assert.equal(quotationTotals(items,{discount_value:125,discount_type:'FIXED',gst_mode:'NO_GST'}).total,4575);
 const included=quotationTotals(items,{discount_mode:'LINE',gst_mode:'GST_INCLUDED',gst_percentage:18});
 assert.equal(included.total,4305);assert.equal(included.gst,656.69);
});
test('bankers rounding, fixed discount caps and zero totals match Decimal engine',()=>{
 assert.equal(quotationTotals([{quantity:1,rate:'0.05',discount_type:'PERCENTAGE',discount_value:10}],{discount_mode:'LINE'}).discount,0);
 assert.equal(quotationTotals([{quantity:1,rate:10,discount_type:'FIXED',discount_value:99}],{discount_mode:'LINE',gst_mode:'GST_EXTRA',gst_percentage:18}).total,0);
});
test('edited rates override the last saved amount in previews',()=>{
 assert.equal(quotationTotals([{quantity:2,rate:50,amount:20}],{}).subtotal,100);
});

test('combined discounts apply overall discount after line reductions, then GST',()=>{
 const settings={discount_mode:'BOTH',discount_type:'PERCENTAGE',discount_value:10,gst_mode:'GST_EXTRA',gst_percentage:18};
 const totals=quotationTotals(items,settings);
 assert.deepEqual([totals.subtotal,totals.lineDiscount,totals.overallDiscount,totals.discount,totals.gst,totals.total],[4700,395,430.5,825.5,697.41,4571.91]);
 assert.deepEqual(totals.lines.map(line=>line.net),[3105,1200]);
 assert.equal(quotationTotals(items,{...settings,discount_type:'FIXED',discount_value:125}).total,4932.4);
 assert.equal(quotationTotals(items,{...settings,gst_mode:'GST_INCLUDED'}).gst,591.03);
 assert.equal(quotationTotals(items,{...settings,gst_mode:'NO_GST'}).total,3874.5);
 assert.equal(quotationTotals(items,{...settings,discount_type:'FIXED',discount_value:100000}).total,0);
});
