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

test('quotation detail presents server-calculated totals, lines and linked source records', () => {
  const record = mapRecord({
    id: 88, quotation_number: 'BA-2026-0088', quotation_type: 'MEASUREMENT', status: 'DRAFT',
    customer: 12, customer_details: { id: 12, name: 'Anita Rao' },
    property: 19, property_details: { id: 19, name: 'Lake View Home' }, measurement_record: 22,
    quotation_date: '2026-10-17', valid_until: '2026-11-17', subtotal: '18000.00',
    discount: '1000.00', discount_amount: '1000.00', gst_amount: '3060.00', grand_total: '20060.00',
    gst_mode: 'GST_EXTRA', gst_percentage: '18',
    items: [{ id: 4, description: 'Interior painting', quantity: '900.00', unit: 'sqft', rate: '20.00', amount: '18000.00' }],
  }, 'quotations');

  assert.equal(record.reference, 'BA-2026-0088');
  assert.equal(record.customerId, '12');
  assert.equal(record.propertyId, '19');
  assert.ok(record.details.some(item => item.label === 'Measurement record' && item.value === '22'));
  assert.ok(record.details.some(item => item.label === 'Discount' && item.value === '1000.00'));
  assert.ok(record.details.some(item => item.label === 'GST' && item.value === '18% · GST EXTRA'));
  assert.ok(record.details.some(item => item.value.includes('Interior painting · 900.00 sqft · ₹20.00 · ₹18000.00')));
  assert.ok(record.details.some(item => item.label === 'Grand total' && item.value === '20060.00'));
});
