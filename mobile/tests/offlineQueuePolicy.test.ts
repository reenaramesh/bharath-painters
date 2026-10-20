import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedMobileOperation, mobileOperationReviewPath } from '../src/core/offlineQueuePolicy.ts';

test('offline measurement queue accepts contractor room creation and rejects unrelated paths', () => {
  assert.equal(isAllowedMobileOperation('measurement', '/quotations/properties/20/rooms/?new=1'), true);
  assert.equal(isAllowedMobileOperation('measurement', '/accounts/users/'), false);
});
test('routes offline conflicts to the matching property or role-appropriate attendance workspace', () => {
  assert.equal(mobileOperationReviewPath('measurement', '/quotations/properties/20/rooms/?new=1', 'CONTRACTOR'), '/module/measurements?propertyId=20');
  assert.equal(mobileOperationReviewPath('attendance', '/jobs/in-house-applicators/34/attendance/', 'CONTRACTOR'), '/module/employees?membershipId=34');
  assert.equal(mobileOperationReviewPath('attendance', '/jobs/in-house-applicators/34/attendance/', 'PAINTER'), '/role?tab=ATTENDANCE');
});
