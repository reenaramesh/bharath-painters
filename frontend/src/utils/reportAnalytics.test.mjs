import test from 'node:test';
import assert from 'node:assert/strict';
import { userReportSeries, monthlyReportSeries } from './reportAnalytics.js';
test('uses actual role counts and statuses, without fabricating unavailable users',()=>{
 const data={contractors:[{verification_status:'VERIFIED'},{verification_status:'PENDING'}],applicators:[{verification_status:'VERIFIED'}],customers:[{status:'NEW'},{status:'WON'}]};
 const result=userReportSeries(data);
 assert.deepEqual(result.roles.map(r=>r.value),[2,1,2]);
 assert.equal(result.verification.find(r=>r.label==='Verified').value,2);
 assert.equal(result.customers.find(r=>r.label==='New').value,1);
 assert.equal(userReportSeries(null),null);
});
test('sorts monthly data and keeps exact values including overpayments',()=>{
 const result=monthlyReportSeries([{month:'2026-10-01',billed:'100',paid:'110'},{month:'2026-09-01',billed:'50',paid:'25'}]);
 assert.equal(result[0].month,'2026-09-01');
 assert.equal(result[1].due,-10);
 assert.deepEqual(monthlyReportSeries([]),[]);
});
