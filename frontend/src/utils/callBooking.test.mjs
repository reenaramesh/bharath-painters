import test from 'node:test';
import assert from 'node:assert/strict';
import { bookCallVisit, bookingPayload, callBookingIntent, bookedVisitUrl } from './callBooking.js';

const form = { name: 'Caller', date: '2030-05-12', time: '10:30', comment: 'Measure kitchen' };
test('deep links accept a positive owner-fetched event id and explicit booking action', () => {
  assert.deepEqual(callBookingIntent('?event=17&action=book'), { id: 17, book: true });
  for (const value of ['0', '-1', 'abc', '1.5', '1e2']) assert.equal(callBookingIntent(`?event=${value}`), null);
  assert.deepEqual(callBookingIntent('?event=17'), { id: 17, book: false });
});
test('visit payload uses the selected local date and time without fabricating a property', () => {
  assert.deepEqual(bookingPayload(form), { next_follow_up: new Date('2030-05-12T10:30').toISOString(), comment: 'Measure kitchen' });
  assert.throws(() => bookingPayload({ ...form, time: '' }), /date and time/);
});
test('connected call books directly and opens the existing visits destination', async () => {
  const paths = [];
  const api = { post: async (path, body) => { paths.push([path, body]); return { data: { booked_follow_up: 33, booked_visit: { next_follow_up: '2030-05-12T05:00:00Z' } } }; } };
  const result = await bookCallVisit(api, { event: { id: 7, matched_customer: 2 }, form });
  assert.equal(result.status, 'booked');
  assert.deepEqual(paths, [['/call-inbox/events/7/book-site-visit/', bookingPayload(form)]]);
  assert.match(bookedVisitUrl(result.event), /^\/site-visits\?/);
});
test('new caller is resolved, created through canonical customer API, linked, then booked', async () => {
  const paths = [];
  const prepared = [];
  const responses = [{ action: 'CREATE' }, { id: 2, name: 'Caller', connection_status: 'CONNECTED' }, { id: 7, matched_customer: 2 }, { booked_follow_up: 33 }];
  const api = { post: async (path) => { paths.push(path); return { data: responses.shift() }; } };
  const result = await bookCallVisit(api, { event: { id: 7, phone_number: '9000000000' }, form, onPrepared: (data) => prepared.push(data) });
  assert.equal(result.status, 'booked');
  assert.equal(prepared[0].id, 2);
  assert.deepEqual(paths, ['/call-inbox/events/7/add-customer/', '/quotations/customers/', '/call-inbox/events/7/link-customer/', '/call-inbox/events/7/book-site-visit/']);
});
test('pending consent retains saved identity and returns existing share path without claiming booking', async () => {
  const paths = [];
  const api = { post: async (path) => {
    paths.push(path);
    if (path.endsWith('book-site-visit/')) throw { response: { data: { code: 'CUSTOMER_APPROVAL_REQUIRED', detail: 'Approval needed' } } };
    return { data: { share_link: '/customer-link/token', link_purpose: 'CONNECTION' } };
  } };
  const result = await bookCallVisit(api, { event: { id: 7, matched_customer: 2 }, form });
  assert.equal(result.status, 'pending');
  assert.equal(result.share.share_link, '/customer-link/token');
  assert.deepEqual(paths, ['/call-inbox/events/7/book-site-visit/', '/quotations/customers/2/share-link/']);
});
test('failed linking retries use the saved customer and never create it twice', async () => {
  const paths = [];
  const api = { post: async (path) => { paths.push(path); throw new Error('Offline'); } };
  await assert.rejects(bookCallVisit(api, { event: { id: 7 }, customer: { id: 2 }, form }), /Offline/);
  assert.deepEqual(paths, ['/call-inbox/events/7/link-customer/']);
});
test('ordinary booking errors propagate and preserve form data', async () => {
  const api = { post: async () => { throw new Error('Offline'); } };
  await assert.rejects(bookCallVisit(api, { event: { id: 7, matched_customer: 2 }, form }), /Offline/);
  assert.equal(form.comment, 'Measure kitchen');
});
