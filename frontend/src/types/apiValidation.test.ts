import assert from 'node:assert/strict';
import test from 'node:test';
import { isAttendanceRecord, isInvoicePaymentRecord, isMeasurementVersionRecord, isProjectScopeRecord, isQuotationLineRecord, isQuotationRecord, isWorkAssignmentRecord, normalizeApiError, parsePage } from './apiValidation.ts';

test('normalizes API errors without losing permission, validation, conflict or network meaning', () => {
  assert.equal(normalizeApiError({ response: { status: 403, data: { detail: 'Forbidden' } } }).kind, 'PERMISSION');
  assert.deepEqual(normalizeApiError({ response: { status: 400, data: { mobile: ['Invalid'] } } }).fieldErrors, { mobile: ['Invalid'] });
  assert.equal(normalizeApiError({ response: { status: 409, data: { detail: 'Stale version' } } }).kind, 'CONFLICT');
  assert.equal(normalizeApiError({ request: {} }).kind, 'NETWORK');
});

test('parses paginated and plain-list responses only when every record passes the supplied guard', () => {
  const isPositiveId = (value: unknown): value is { id: number } =>
    typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'number' && value.id > 0;
  assert.deepEqual(parsePage({ count: 1, next: null, previous: null, results: [{ id: 7 }] }, isPositiveId), {
    count: 1, next: null, previous: null, results: [{ id: 7 }],
  });
  assert.equal(parsePage([{ id: 0 }], isPositiveId), null);
  assert.equal(parsePage({ count: 1, results: [{ id: '7' }] }, isPositiveId), null);
});

test('validates critical API records at runtime and keeps money as decimal strings', () => {
  assert.equal(isMeasurementVersionRecord({ id: 1, property: 8, contractor: 4, version: 2, status: 'DRAFT', updated_at: '2026-10-17T08:00:00Z', total_sqft: '120.50' }), true);
  assert.equal(isMeasurementVersionRecord({ id: 1, property: 8, contractor: 4, version: '2', status: 'DRAFT', updated_at: 'now' }), false);
  assert.equal(isInvoicePaymentRecord({ id: 1, invoice: 8, amount: '125.10', payment_mode: 'UPI', received_date: '2026-10-17', source_schedule: 4, source_receipt: null }), true);
  assert.equal(isInvoicePaymentRecord({ id: 1, invoice: 8, amount: '125.10', payment_mode: 'UPI', received_date: '2026-10-17' }), true);
  assert.equal(isInvoicePaymentRecord({ id: 1, invoice: 8, amount: 125.1, payment_mode: 'UPI', received_date: '2026-10-17', source_schedule: null, source_receipt: null }), false);
  assert.equal(isInvoicePaymentRecord({ id: 1, invoice: 8, amount: '125.10', payment_mode: 'UPI', received_date: '2026-10-17', source_schedule: 4, source_receipt: 5 }), false);
  assert.equal(isAttendanceRecord({ id: 3, membership: 4, date: '2026-10-17', status: 'PRESENT', approval_status: 'PENDING', marked_at: '2026-10-17T08:00:00Z', overtime_hours: '0.00' }), true);
  assert.equal(isQuotationRecord({ id: 3, quotation_number: 'Q-3', customer: 4, property: null, measurement_record: null, quotation_type: 'MANUAL_LUMPSUM', status: 'DRAFT', subtotal: '100.00', discount: '0.00', gst_percentage: '0.00', gst_mode: 'NO_GST', gst_amount: '0.00', grand_total: '100.00', discount_mode: 'OVERALL', discount_type: 'FIXED', discount_value: '0.00', updated_at: '2026-10-17T08:00:00Z' }), true);
  assert.equal(isQuotationLineRecord({ id: 9, description: 'Painting', calculation_method: 'AREA', quantity: '10.00', rate: '12.50', amount: '125.00' }), true);
  assert.equal(isWorkAssignmentRecord({ id: 3, schedule: 8, painter: 4, status: 'ACCEPTED', wage_type: 'DAILY', agreed_wage: '900.00', source_application: null, source_booking: 7 }), true);
  assert.equal(isProjectScopeRecord({ id: 6, quotation: 3, title: 'Painting', status: 'CONFIRMED', handling: 'INTERNAL', source_quotation_item: null, source_work_change_item: null }), true);
  assert.equal(isProjectScopeRecord({ id: 6, quotation: 3, title: 'Painting', status: 'CONFIRMED', handling: 'INTERNAL', source_quotation_item: 10, source_work_change_item: 12 }), false);
});
