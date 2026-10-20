import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceRepository, parseDashboard } from '../src/core/workspace.ts';
const dashboard = { contractor_name: 'Real company', profile_completion: { percent: 80, missing: [] }, counts: { customers: 4, properties: 3, quotations: 2, quotation_value: '1000', active_leads: 1, invoices: 1, due_tasks: 0, unread_messages: 0, site_visits: 0, new_requests: 0 }, recent_customers: [], recent_quotations: [], tasks: [], site_visits: [], pipeline: [] };
test('workspace deduplicates reads, caches for 60 seconds and refreshes explicitly', async () => {
  let calls = 0, time = 0;
  const repository = new WorkspaceRepository({ get: async <T>(path: string) => { calls++; return (path.includes('dashboard') ? dashboard : { company_name: 'Real company', bank_account_number: 'private' }) as T; } }, () => time);
  const [a, b] = await Promise.all([repository.load(1), repository.load(1)]);
  assert.equal(a, b); assert.equal(calls, 4);
  assert.equal('bank_account_number' in a.profile!, false);
  await repository.load(1); assert.equal(calls, 4);
  await repository.load(1, true); assert.equal(calls, 8);
  time = 60_001; await repository.load(1); assert.equal(calls, 12);
  await repository.load(2); assert.equal(calls, 16);
  repository.clear(); await repository.load(2); assert.equal(calls, 20);
});
test('profile failure does not substitute demo values or fail the dashboard', async () => {
  const repository = new WorkspaceRepository({ get: async <T>(path: string) => { if (path.includes('profile')) throw new Error('offline'); return dashboard as T; } });
  const result = await repository.load(1);
  assert.equal(result.dashboard.counts.customers, 4); assert.equal(result.profile, null); assert.ok(result.profileError);
});
test('invalid dashboard responses are rejected', () => {
  assert.throws(() => parseDashboard({ ...dashboard, counts: { customers: 24 } }));
  assert.throws(() => parseDashboard({ ...dashboard, tasks: null }));
});
test('logout invalidates an in-flight workspace read', async () => {
  let finish!: (value: unknown) => void;
  const repository = new WorkspaceRepository({ get: <T>(path: string) => path.includes('dashboard') ? new Promise(resolve => { finish = resolve as (value: unknown) => void; }) : Promise.resolve({} as T) });
  const read = repository.load(1); repository.clear(); finish(dashboard);
  await assert.rejects(read, /session has changed/);
});
