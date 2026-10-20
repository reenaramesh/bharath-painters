import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GROUPS, visibleNavigation } from './navigation.js';

test('customer work navigation excludes contractor-only rescheduling', () => {
  const customer = visibleNavigation('CUSTOMER').map(entry => entry.route);
  assert.ok(customer.includes('/work-schedules'));
  assert.ok(customer.includes('/work-changes'));
  assert.ok(!customer.includes('/work-reschedules'));
  assert.ok(visibleNavigation('CONTRACTOR').some(entry => entry.route === '/work-schedules' && entry.aliases?.includes('/work-reschedules')));
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

test('every visible navigation item belongs to a rendered sidebar group for each role', () => {
  for (const role of ['CONTRACTOR', 'PAINTER', 'CUSTOMER', 'ADMIN', 'SUPPORT']) {
    for (const entry of visibleNavigation(role, 'in-house')) {
      if (entry.group === 'Account') continue; // These links render in the fixed footer.
      assert.ok(GROUPS.includes(entry.group), `${role} ${entry.id} uses missing sidebar group ${entry.group}`);
    }
  }
});

test('every visible deep link and alias has a declared React route', () => {
  const app = readFileSync(fileURLToPath(new URL('../App.jsx', import.meta.url)), 'utf8');
  const routes = new Set([...app.matchAll(/<Route\s+path="([^"]+)"/g)].map(match => match[1]));
  for (const role of ['CONTRACTOR', 'PAINTER', 'CUSTOMER', 'ADMIN', 'SUPPORT']) {
    const targets = new Set(visibleNavigation(role).flatMap(entry => [entry.route, ...(entry.aliases || [])]));
    for (const target of targets) {
      const path = target.split('?')[0];
      assert.ok(routes.has(path), `${role} navigation target ${path} has no route declaration`);
    }
  }
});

test('contractor navigation separates CRM, properties, quotations, work, portfolio, people and B2B', () => {
  const byId = Object.fromEntries(visibleNavigation('CONTRACTOR').map(entry => [entry.id, entry]));
  assert.equal(byId.customers.group, 'Customers & CRM');
  assert.equal(byId.tasks.group, 'Customers & CRM');
  assert.equal(byId.properties.group, 'Properties & Measurements');
  assert.equal(byId.quotations.group, 'Quotations');
  assert.equal(byId.schedules.group, 'Work Management');
  assert.equal(byId.completed.group, 'Work Management');
  assert.equal(byId.projects.group, 'Portfolio / Showcase');
  assert.equal(byId.employees.group, 'My Employees');
  assert.equal(byId['painter-contacts'].group, 'Hiring & Network');
});

test('contractor hiring and B2B destinations stay separately discoverable', () => {
  const entries = visibleNavigation('CONTRACTOR');
  for (const id of ['jobs', 'job-activity', 'bookings', 'painter-contacts', 'referrals']) {
    assert.equal(entries.find(entry => entry.id === id)?.group, 'Hiring & Network', `${id} should be in Hiring & Network`);
  }
  for (const id of ['subcontracts', 'network']) {
    assert.equal(entries.find(entry => entry.id === id)?.group, 'B2B Subcontracting', `${id} should be in B2B Subcontracting`);
  }
  assert.equal(entries.find(entry => entry.id === 'invoices')?.group, 'Finance');
  assert.equal(entries.find(entry => entry.id === 'receipts')?.group, 'Finance');
});

test('painter navigation separates finding work from active work and keeps earnings', () => {
  const entries = visibleNavigation('PAINTER', 'freelance');
  for (const id of ['available-work', 'painter-applications', 'painter-bookings', 'availability']) {
    assert.equal(entries.find(entry => entry.id === id)?.group, 'Find Work', `${id} should be grouped under Find Work`);
  }
  assert.equal(entries.find(entry => entry.id === 'assignments')?.group, 'My Work');
  assert.equal(entries.find(entry => entry.id === 'painter-history')?.route, '/job-activity?section=HISTORY');
  assert.equal(entries.find(entry => entry.id === 'painter-history')?.group, 'My Work');
  assert.equal(entries.find(entry => entry.id === 'earnings')?.group, 'My Work');
});

test('customer direct measurement access and admin workflows remain visible', () => {
  const customer = visibleNavigation('CUSTOMER');
  assert.ok(customer.some(entry => entry.route === '/measurement-access'));
  assert.ok(customer.some(entry => entry.route === '/work-schedules'));
  const adminRoutes = new Set(visibleNavigation('ADMIN').map(entry => entry.route));
  for (const route of ['/contractors', '/painters', '/billing', '/revenue', '/customer-connections', '/admin-integrations']) {
    assert.ok(adminRoutes.has(route), `Admin route ${route} remains visible`);
  }
});

test('painter appearance remains available through Settings without a duplicate sidebar item', () => {
  const painter = visibleNavigation('PAINTER');
  assert.ok(painter.some(entry => entry.id === 'settings' && entry.aliases.includes('/appearance')));
  assert.ok(!painter.some(entry => entry.id === 'appearance'));
});

test('contractor CRM exposes one Leads menu item while preserving legacy lead routes', () => {
  const contractor = visibleNavigation('CONTRACTOR');
  const leads = contractor.filter(entry => entry.label === 'Leads');
  assert.equal(leads.length, 1);
  assert.equal(leads[0].route, '/opportunities');
  assert.ok(!contractor.some(entry => entry.id === 'leads'));
  const app = readFileSync(fileURLToPath(new URL('../App.jsx', import.meta.url)), 'utf8');
  assert.match(app, /path="\/leads"/);
});

test('account links remain available in the fixed footer without a duplicate Account group', () => {
  assert.ok(!GROUPS.includes('Account'));
  for (const role of ['CONTRACTOR', 'PAINTER', 'CUSTOMER', 'ADMIN', 'SUPPORT']) {
    assert.ok(visibleNavigation(role).some(entry => entry.group === 'Account'));
  }
  const sidebar = readFileSync(fileURLToPath(new URL('../components/Sidebar.jsx', import.meta.url)), 'utf8');
  assert.match(sidebar, /<footer className="ws-nav-account">[\s\S]*account\.map/);
});
