import test from 'node:test';
import assert from 'node:assert/strict';
import { customerAccountStatus } from './customerActivation.js';

test('activation and app activity are distinct from connection and CRM status', () => {
  assert.equal(customerAccountStatus({ account_status: 'NOT_ACTIVATED', status: 'WON' }).label, 'Not activated');
  assert.equal(customerAccountStatus({ account_status: 'ACTIVE' }).label, 'Account activated');
  assert.equal(customerAccountStatus({ account_status: 'ACTIVE', has_app_activity: true }).activity, 'App activity recorded');
  assert.equal(customerAccountStatus({ account_status: 'ACTIVE' }).activity, '');
  assert.equal(customerAccountStatus({ account_status: 'DISABLED' }).canResend, false);
  assert.equal(customerAccountStatus({ activation_pending: true, is_pending_connection: true }), null);
  assert.equal(customerAccountStatus({}), null);
  assert.equal(customerAccountStatus({ activation_pending: true }).canResend, true);
});
