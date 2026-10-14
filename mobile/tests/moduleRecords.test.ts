import test from 'node:test';
import assert from 'node:assert/strict';
import { filterWorkOrders, mapRecord, moduleDetailPath, modulePath } from '../src/core/moduleRecords.ts';

test('subcontract work order reads use the existing outsourcing REST routes', () => {
  assert.equal(modulePath('subcontracts'), '/outsourcing/work-orders/');
  assert.equal(moduleDetailPath('subcontracts', '57'), '/outsourcing/work-orders/57/');
});

test('receiving contractor sees received-work identity without unconfirmed pricing', () => {
  const record = mapRecord({
    id: 57, reference: 'SWO-2026-057', project_title: 'Apartment repaint', status: 'SENT',
    viewer_authority: 'RECEIVING', main_contractor_name: 'Main contractor', receiving_contractor_name: 'Your team',
    quotation_reference: 'QT-42', agreed_amount: null, site_address: 'Bengaluru',
    scopes: [{ title_snapshot: 'Interior painting', quantity: '640', unit_name_snapshot: 'sqft', unit_rate: '1000' }],
  }, 'subcontracts');
  assert.equal(record.title, 'Apartment repaint');
  assert.match(record.subtitle, /You received this work/);
  assert.match(record.subtitle, /Main contractor/);
  assert.equal(record.amount, undefined);
  assert.equal(record.reference, 'SWO-2026-057');
  assert.ok(record.details.some(item => item.value.includes('Interior painting · 640 sqft')));
  assert.equal(JSON.stringify(record).includes('1000'), false);
});

test('main contractor can see agreed subcontract price but shared scope unit rates are omitted', () => {
  const record = mapRecord({
    id: 58, reference: 'SWO-2026-058', project_title: 'Villa exterior', status: 'ACCEPTED',
    viewer_authority: 'MAIN', receiving_contractor_name: 'Receiving contractor', agreed_amount: '25000',
    scopes: [{ title_snapshot: 'Exterior painting', quantity: '900', unit_name_snapshot: 'sqft', unit_rate: '12' }],
  }, 'subcontracts');
  assert.equal(record.amount, '25000');
  assert.match(record.subtitle, /You sent this work/);
  assert.equal(JSON.stringify(record).includes('unit_rate'), false);
});

test('work order filters match the existing web statuses', () => {
  const items = ['SENT', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'CORRECTION_REQUESTED', 'SUBMITTED_FOR_REVIEW', 'COMPLETED'].map(status => ({ status }));
  assert.equal(filterWorkOrders(items, 'ALL').length, 7);
  assert.deepEqual(filterWorkOrders(items, 'SENT').map(item => item.status), ['SENT']);
  assert.deepEqual(filterWorkOrders(items, 'ACTIVE').map(item => item.status), ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'CORRECTION_REQUESTED']);
  assert.deepEqual(filterWorkOrders(items, 'SUBMITTED_FOR_REVIEW').map(item => item.status), ['SUBMITTED_FOR_REVIEW']);
  assert.deepEqual(filterWorkOrders(items, 'COMPLETED').map(item => item.status), ['COMPLETED']);
});
