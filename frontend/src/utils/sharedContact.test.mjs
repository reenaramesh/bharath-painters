import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSharedContact } from './sharedContact.js';

test('extracts name and formatted mobile from Truecaller text', () => {
  assert.deepEqual(parseSharedContact({ text: 'Ravi Kumar\n+91 98765 43212\nhttps://www.truecaller.com/search/in/9876543212' }), { name: 'Ravi Kumar', mobile: '+91 98765 43212' });
});
test('number-only share leaves name empty', () => {
  assert.deepEqual(parseSharedContact({ text: '9876543212' }), { name: '', mobile: '9876543212' });
});
test('supports labeled text and explicit title', () => {
  assert.deepEqual(parseSharedContact({ title: 'Ravi Kumar', text: 'Mobile: 9876543212' }), { name: 'Ravi Kumar', mobile: '9876543212' });
  assert.deepEqual(parseSharedContact({ text: 'Name: Ravi Kumar\nPhone: +919876543212' }), { name: 'Ravi Kumar', mobile: '+919876543212' });
});
test('invalid input is retained for review', () => {
  assert.deepEqual(parseSharedContact({ title: 'Ravi', text: '123' }), { name: 'Ravi', mobile: '123' });
});
