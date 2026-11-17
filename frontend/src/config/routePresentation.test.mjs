import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { routePresentation, presentationRole, hasCustomPresentationTheme } from './routePresentation.js';

test('every actual production route has a named presentation module without exposing record paths', async () => {
  const audit = JSON.parse(await readFile(new URL('../../../docs/ui-transformation/route-audit.json', import.meta.url), 'utf8'));
  const routes = audit.routes;
  assert.ok(routes.length >= 100);
  for (const row of routes) {
    const path = row.path || row.route;
    if (!path || path === '*' || path.startsWith('/preview/')) continue;
    const result = routePresentation(path.replace(/:[^/]+/g, '12345'));
    assert.ok(result.module, path);
    assert.notEqual(result.module, 'workspace', path);
    assert.ok(result.title, path);
    assert.ok(!result.title.includes('12345'), path);
  }
});

test('presentation separates admin connections, customer connections and sensitive module types', () => {
  assert.equal(routePresentation('/customer-connections').module, 'administration');
  assert.equal(routePresentation('/customer/connections').module, 'connections');
  assert.equal(routePresentation('/properties/42/measurements').module, 'measurements');
  assert.equal(routePresentation('/quotations/42/edit').module, 'quotations');
  assert.equal(routePresentation('/application-analytics/modules/jobs').module, 'analytics');
  assert.equal(routePresentation('/in-house-applicators').module, 'employment');
  assert.equal(routePresentation('/login').public, true);
});

test('employee appearance derives only from resolved in-house painter membership', () => {
  assert.equal(presentationRole('PAINTER', 'in-house'), 'EMPLOYEE');
  assert.equal(presentationRole('PAINTER', 'unavailable'), 'PAINTER');
  assert.equal(presentationRole('PAINTER', 'loading'), 'PAINTER');
  assert.equal(presentationRole('CUSTOMER', 'in-house'), 'CUSTOMER');
  assert.equal(presentationRole('SUPPORT', 'freelance'), 'SUPPORT');
});

test('saved custom appearance stays distinct from rebased default presentation', () => {
  assert.equal(hasCustomPresentationTheme(null), false);
  assert.equal(hasCustomPresentationTheme({ '--app-primary': '#5740ec', '--app-accent': '#fb4b8b' }), false);
  assert.equal(hasCustomPresentationTheme({ '--app-primary': '#245b75', '--app-accent': '#508398' }), true);
  assert.equal(hasCustomPresentationTheme({ '--app-primary': '#5740EC', '--app-accent': '#10B981' }), true);
});
