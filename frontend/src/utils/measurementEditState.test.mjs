import test from 'node:test';
import assert from 'node:assert/strict';
import { measurementEditState } from './measurementEditState.js';

test('locked measurements are read-only even without a submission timestamp', () => {
  const state = measurementEditState({ measurement_editing_available: true }, { status: 'LOCKED', submitted_at: null });
  assert.equal(state.status, 'LOCKED');
  assert.equal(state.readOnly, true);
  assert.equal(state.canSubmit, true);
  assert.equal(state.submitLabel, 'Submit');
  assert.match(state.reason, /used in a quotation/);
});

test('locked status remains authoritative after submission', () => {
  const state = measurementEditState({}, { status: 'LOCKED', submitted_at: '2026-10-17T12:00:00Z' });
  assert.equal(state.status, 'LOCKED');
  assert.equal(state.readOnly, true);
  assert.equal(state.canSubmit, false);
  assert.equal(state.submitLabel, 'Submitted');
});

test('drafts and new calculations remain editable when schema is available', () => {
  for (const record of [null, { status: 'DRAFT' }, { status: 'IN_PROGRESS' }]) {
    const state = measurementEditState({ measurement_editing_available: true }, record);
    assert.equal(state.readOnly, false);
    assert.equal(state.canSubmit, true);
    assert.equal(state.submitLabel, 'Submit');
  }
});

test('completed submitted records retain backend editing policy and cannot submit twice', () => {
  const state = measurementEditState({}, { status: 'COMPLETED', submitted_at: '2026-10-17T12:00:00Z' });
  assert.equal(state.status, 'COMPLETED');
  assert.equal(state.readOnly, false);
  assert.equal(state.canSubmit, false);
  assert.equal(state.submitLabel, 'Submitted');
});

test('missing rollout schema blocks edits regardless of record stage', () => {
  const state = measurementEditState({ measurement_editing_available: false }, { status: 'IN_PROGRESS' });
  assert.equal(state.status, 'IN_PROGRESS');
  assert.equal(state.readOnly, true);
  assert.equal(state.canSubmit, false);
  assert.match(state.reason, /temporarily unavailable/);
});

test('older response without explicit status preserves submitted display fallback', () => {
  assert.equal(measurementEditState({}, { submitted_at: '2026-10-17T12:00:00Z' }).status, 'SUBMITTED');
});
