import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardWithInvoiceCount } from './dashboardInvoiceCount.js';

test('dashboard count follows the invoice register rather than a missing or stale dashboard field',()=>{
 const invoice={id:17,invoice_number:'GST-INV-2026-27-00001'};
 const missing={counts:{quotations:2}};
 assert.equal(dashboardWithInvoiceCount(missing,[invoice]).counts.invoices,1);
 assert.equal(dashboardWithInvoiceCount({counts:{invoices:0}},[invoice]).counts.invoices,1);
 assert.equal(dashboardWithInvoiceCount({counts:{invoices:1}},[]).counts.invoices,0);
 assert.equal(dashboardWithInvoiceCount(missing,{count:4,results:[invoice]}).counts.invoices,4);
 assert.equal(dashboardWithInvoiceCount({counts:{invoices:1}},null).counts.invoices,1);
 assert.equal(dashboardWithInvoiceCount(missing,null).counts.invoices,null);
 assert.equal('invoices' in missing.counts,false);
});
