import assert from 'node:assert/strict';
import test from 'node:test';
import { compareDecimalStrings, parseDecimalString, validateMeasurementDeductions } from './calculationSafety.ts';

test('accepts finite decimal strings without converting them through binary floating point', () => {
  assert.equal(parseDecimalString(' 0.10 '), '0.10');
  assert.equal(parseDecimalString('9007199254740993.01'), '9007199254740993.01');
  assert.equal(parseDecimalString(0.1), null);
  assert.equal(parseDecimalString('NaN'), null);
  assert.equal(parseDecimalString('-1.00'), null);
  assert.equal(parseDecimalString('-1.00', { allowNegative: true }), '-1.00');
});

test('compares decimal strings exactly at different scales', () => {
  assert.equal(compareDecimalStrings('0.10', '0.1'), 0);
  assert.equal(compareDecimalStrings('12.009', '12.01'), -1);
  assert.equal(compareDecimalStrings('9007199254740993', '9007199254740992'), 1);
});

test('rejects deductions above the server-provided gross area without recalculating area', () => {
  assert.deepEqual(validateMeasurementDeductions('10.00', '2.50'), { ok: true });
  assert.deepEqual(validateMeasurementDeductions('10.00', '10.01'), { ok: false, reason: 'DEDUCTION_EXCEEDS_GROSS' });
  assert.deepEqual(validateMeasurementDeductions('not-a-number', '0'), { ok: false, reason: 'INVALID_DECIMAL' });
  assert.deepEqual(validateMeasurementDeductions('10', '-1'), { ok: false, reason: 'INVALID_DECIMAL' });
});
