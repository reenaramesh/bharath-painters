import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberQuotationSubmission, consumeQuotationSubmission } from './quotationSubmission.js';
import * as submission from './quotationSubmission.js';

test('submission errors hide HTML server pages and advise checking before retrying', () => {
 const message = submission.quotationSubmissionError?.({response:{status:500,data:'<!DOCTYPE html><html><body>Server Error</body></html>'}});
 assert.equal(message, 'Sending could not be confirmed. Refresh the quotation to check its status before retrying.');
});

test('submission errors preserve structured validation details', () => {
 assert.equal(submission.quotationSubmissionError?.({response:{status:403,data:{detail:'The customer must accept your connection request.'}}}), 'The customer must accept your connection request.');
});

test('submission response is handed to its quotation once without persistent browser storage',()=>{
 const response={customer_id:'QA-CUSTOMER',customer_mobile:'test-mobile',temporary_password:'synthetic-only'};
 rememberQuotationSubmission(42,response);
 assert.deepEqual(consumeQuotationSubmission('42'),response);
 assert.equal(consumeQuotationSubmission(42),null);
});

test('another quotation cannot consume the handoff and old data expires',()=>{
 rememberQuotationSubmission(42,{status:'SENT'});
 assert.equal(consumeQuotationSubmission(43),null);
 assert.equal(consumeQuotationSubmission(42),null);
 rememberQuotationSubmission(42,{status:'SENT'},0);
 assert.equal(consumeQuotationSubmission(42,60001),null);
});
