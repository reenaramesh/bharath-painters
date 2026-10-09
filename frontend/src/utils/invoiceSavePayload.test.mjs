import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceSavePayload } from './invoiceSavePayload.js';
test('saving invoice details preserves the payment ledger by excluding payment summaries',()=>{
 const invoice={id:17,invoice_date:'2026-10-08',notes:'Updated notes',discount:'10',gst_percentage:'18',base_items:[{description:'Painting',quantity:'10',rate:'100'}],measurement_adjustments:[],amount_paid:'100',payment_mode:'',payments:[{payment_mode:'UPI',amount:'100'}],can_edit:true,grand_total:'1180',balance_due:'1080'};
 const payload=invoiceSavePayload(invoice);
 assert.equal(payload.notes,'Updated notes');
 assert.deepEqual(payload.base_items,invoice.base_items);
 for(const field of ['amount_paid','payment_mode','payments','can_edit','grand_total','balance_due','id'])assert.equal(field in payload,false,field);
 assert.equal(invoice.amount_paid,'100');
});
