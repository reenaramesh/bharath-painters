import assert from 'node:assert/strict';
import test from 'node:test';
import { formatINRAmount } from './financialDisplay.ts';

test('formats API decimal strings without passing through binary floating point', () => {
  assert.equal(formatINRAmount('9007199254740993.00'), '₹9,00,71,99,25,47,40,993');
  assert.equal(formatINRAmount('123456.49'), '₹1,23,456');
  assert.equal(formatINRAmount('123456.50'), '₹1,23,457');
});

test('preserves negative amount display rounding and rejects non-decimal payloads', () => {
  assert.equal(formatINRAmount('-123456.50'), '-₹1,23,457');
  assert.equal(formatINRAmount('NaN'), null);
  assert.equal(formatINRAmount(12.5), null);
  assert.equal(formatINRAmount('12.345'), null);
});
