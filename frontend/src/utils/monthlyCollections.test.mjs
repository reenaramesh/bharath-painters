import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyCollections } from './monthlyCollections.js';

test('twelve collection bars sum real receipts exactly and exclude other years',()=>{
  const result=monthlyCollections([
    {date:'2026-01-04',amount:'0.10'}, {date:'2026-01-05',amount:'0.20'},
    {date:'2026-10-03T12:00:00Z',amount:'30500.25'},
    {date:'2025-10-01',amount:'900'}, {date:'not-a-date',amount:'800'},
  ],2026);
  assert.equal(result.length,12);
  assert.equal(result[0].amount,'0.30');
  assert.equal(result[9].amount,'30500.25');
  assert.equal(result[9].height,100);
  assert.equal(result[10].amount,'0.00');
  assert.equal(result[10].height,0);
});

test('empty data and malformed amounts never fabricate collections',()=>{
  assert.ok(monthlyCollections([],2026).every(row=>row.amount==='0.00' && row.height===0));
  assert.ok(monthlyCollections([{date:'2026-02-01',amount:'NaN'},{date:'2026-02-01',amount:null}],2026).every(row=>row.amount==='0.00'));
});

test('timestamp month boundaries match the payment register India timezone',()=>{
  const result=monthlyCollections([{date:'2025-12-31T20:00:00Z',amount:'50.00'}],2026);
  assert.equal(result[0].amount,'50.00');
});
