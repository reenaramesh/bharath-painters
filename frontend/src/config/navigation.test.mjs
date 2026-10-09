import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleNavigation } from './navigation.js';

test('customer work navigation excludes contractor-only rescheduling', () => {
  const customer = visibleNavigation('CUSTOMER').map(entry => entry.route);
  assert.ok(customer.includes('/work-schedules'));
  assert.ok(customer.includes('/work-changes'));
  assert.ok(!customer.includes('/work-reschedules'));
  assert.ok(visibleNavigation('CONTRACTOR').some(entry => entry.route === '/work-reschedules'));
});

test('painter work destinations respect resolved and unavailable employment', () => {
  const marketplace = ['/jobs', '/applicator-bookings', '/applicator-availability'];
  const freelance = visibleNavigation('PAINTER', 'freelance').map(entry => entry.route);
  for (const route of marketplace) assert.ok(freelance.includes(route));
  for (const employment of ['in-house', 'loading', 'unavailable']) {
    const routes = visibleNavigation('PAINTER', employment).map(entry => entry.route);
    for (const route of marketplace) assert.ok(!routes.includes(route));
    assert.ok(routes.includes('/painter-assignments'));
    assert.ok(routes.includes('/messages'));
  }
  assert.ok(visibleNavigation('PAINTER', 'in-house').some(entry => entry.route === '/in-house-applicators'));
});
