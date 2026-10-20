import test from 'node:test';
import assert from 'node:assert/strict';
import { continueMeasurementPath } from './measurementRecords.js';

test('continues an owned editable measurement rather than starting another for exterior', () => {
  const records = [{ id: 86, contractor: 4, status: 'IN_PROGRESS' }, { id: 85, contractor: 4, status: 'DRAFT' }];
  assert.equal(continueMeasurementPath(59, records, 4), '/properties/59/measurements?measurement=86');
  assert.equal(continueMeasurementPath(59, records, 4, '85'), '/properties/59/measurements?measurement=85');
});

test('new revision is required when measurements are locked, submitted or another contractor owns them', () => {
  const records = [{ id: 1, contractor: 4, status: 'LOCKED' }, { id: 2, contractor: 5, status: 'DRAFT' }, { id: 3, contractor: 4, status: 'DRAFT', submitted_at: '2026-10-13' }];
  assert.equal(continueMeasurementPath(59, records, 4), '/properties/59/measurements?new=1');
});
