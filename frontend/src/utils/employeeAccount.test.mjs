import test from 'node:test';
import assert from 'node:assert/strict';
import { employeeRegistration, employeeSelectionDraft } from './employeeAccount.js';

test('registration comes from account readiness, separately from employment and verification', () => {
  assert.equal(employeeRegistration({ registration_status: 'UNREGISTERED', is_active: true, is_verified: true }).label, 'Unregistered');
  assert.equal(employeeRegistration({ registration_status: 'REGISTERED', is_active: false }).label, 'Registered');
  assert.equal(employeeRegistration({ is_active: true, bharath_id: 'BP-P-1' }), null);
  assert.equal(employeeRegistration({ registration_status: 'REGISTERED', can_resend_activation: true }).canResend, false);
  assert.equal(employeeRegistration({ registration_status: 'UNREGISTERED', can_resend_activation: true }).canResend, true);
});

test('selecting a registered account fills available profile details without replacing employment terms', () => {
  const draft = { name: '', mobile: '', skills: '', experience_years: 0, salary_amount: '24000', job_title: 'Supervisor', trade: 'Painter', custom_fields: { 7: 'South' } };
  const selected = employeeSelectionDraft(draft, { name: 'Ravi', mobile: '+919011800020', skills: 'Walls', experience_years: 4 });
  assert.deepEqual(selected, { ...draft, name: 'Ravi', mobile: '+919011800020', skills: 'Walls', experience_years: 4 });
  assert.equal(draft.mobile, '');
  assert.equal(employeeSelectionDraft(draft, { name: 'Ravi', mobile: '9011800020' }).experience_years, 0);
});
