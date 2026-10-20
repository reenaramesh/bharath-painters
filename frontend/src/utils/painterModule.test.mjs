import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleNavigation, activeNavigation } from '../config/navigation.js';
import { getModuleFallback } from './navigation.js';

test('contractors have a dedicated Painters destination separate from employees', () => {
  const navigation = visibleNavigation('CONTRACTOR');
  const painters = navigation.find(item => item.id === 'painter-contacts');
  assert.ok(painters);
  assert.equal(painters.route, '/painter-contacts');
  assert.notEqual(painters.route, navigation.find(item => item.id === 'employees').route);
});
test('painter contact details keep the Painters module active', () => {
  assert.equal(activeNavigation(visibleNavigation('CONTRACTOR'), '/painters/contacts/123')?.id, 'painter-contacts');
});
test('painter work history opens its existing history filter and outranks applications', () => {
  assert.equal(activeNavigation(visibleNavigation('PAINTER'), '/job-activity?section=HISTORY')?.id, 'painter-history');
  assert.equal(activeNavigation(visibleNavigation('PAINTER'), '/job-activity?section=POSTS')?.id, 'painter-applications');
});
test('customers and painters cannot see contractor painter contacts in navigation', () => {
  for (const role of ['CUSTOMER', 'PAINTER']) assert.equal(visibleNavigation(role).some(item => item.id === 'painter-contacts'), false);
});
test('direct painter detail links return to the private painter module', () => {
  assert.equal(getModuleFallback('/painters/contacts/123'), '/painter-contacts');
});
