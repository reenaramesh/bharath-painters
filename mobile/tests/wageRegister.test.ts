import test from 'node:test';
import assert from 'node:assert/strict';
import { modulePath } from '../src/core/moduleRecords.ts';
import { canOpenModule } from '../src/core/navigation.ts';

test('wage register resolves its existing monthly aggregate API', () => {
  assert.equal(modulePath('wage-register'), '/jobs/wage-register/');
});

test('wage register remains limited to verified contractors with employee access', () => {
  const contractor = { role: 'CONTRACTOR' as const, is_verified: true, verification_status: 'VERIFIED' };
  assert.equal(canOpenModule(contractor, 'wage-register', []), true);
  assert.equal(canOpenModule(contractor, 'wage-register', ['employees']), false);
  assert.equal(canOpenModule({ ...contractor, is_verified: false }, 'wage-register', []), false);
  assert.equal(canOpenModule({ ...contractor, role: 'PAINTER' }, 'wage-register', []), false);
});
