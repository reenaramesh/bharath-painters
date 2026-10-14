import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeProjects, indiaDate, parseSchedules, publicImage } from '../src/core/dashboardPresentation.ts';
test('today uses IST across the UTC day boundary',()=>{
  assert.equal(indiaDate(new Date('2026-10-08T19:00:00Z')), '2026-10-09');
});
test('active projects deduplicate quotations and omit cancelled/pending work',()=>{
  const rows=parseSchedules(['CONFIRMED','IN_PROGRESS','CANCELLED','PENDING'].map((status,id)=>({id,quotation:id<2?12:13,property:'Home',customer:'Customer',start_date:'2026-10-09',end_date:'2026-10-10',status})));
  assert.equal(activeProjects(rows),1);
  assert.equal(activeProjects([]),0);
});
test('invalid supplements fail rather than showing sample or fabricated totals',()=>{
  assert.throws(()=>parseSchedules({results:[]}));
  assert.throws(()=>parseSchedules([{id:1}]));
  assert.equal(publicImage('javascript:alert(1)'),null);
  assert.equal(publicImage('https://example.com/public-photo.png'),'https://example.com/public-photo.png');
});
