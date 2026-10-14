import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryKey, readRecovery, writeRecovery, clearRecovery, openRecovery } from './quotationRecovery.js';

const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const state = { form: { notes: 'Unsubmitted notes', discount_value: 12 }, items: [{ rate: 17, discount_type: 'FIXED', discount_value: 5 }], groupAssignments: { groups: [{ id: 'area-1' }], specials: [], services: [], rates: {} }, selectedRoomIds: [1], selectedFieldIds: [], specialWalls: [], selectedMeasurementId: '3', useMeasurements: true, step: 2 };

test('refresh recovery retains full inputs and stage without any API save', () => {
  const store = storage(), key = recoveryKey(8, '/quotations/new', '?property=2');
  assert.equal(writeRecovery(store, key, state, null), true);
  assert.deepEqual(readRecovery(store, key, null), state);
  clearRecovery(store, key);
  assert.equal(readRecovery(store, key, null), null);
});
test('recovery is isolated by account, route and source and refuses stale server Drafts', () => {
  const store = storage(), key = recoveryKey(8, '/quotations/5/edit', '');
  writeRecovery(store, key, state, 'version-1');
  assert.equal(readRecovery(store, recoveryKey(9, '/quotations/5/edit', ''), 'version-1'), null);
  assert.equal(readRecovery(store, recoveryKey(8, '/quotations/new', '?property=3'), null), null);
  assert.equal(readRecovery(store, key, 'version-2'), null);
  assert.equal(readRecovery(store, key, 'version-1'), null);
  assert.equal(recoveryKey(null, '/quotations/new', ''), null);
});
test('corrupt or unavailable browser storage never breaks editing', () => {
  const store = storage(); store.setItem('key', 'broken');
  assert.equal(readRecovery(store, 'key', null), null);
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('blocked'); } };
  assert.equal(writeRecovery(blocked, 'key', state, null), false);
  assert.equal(readRecovery(blocked, 'key', null), null);
  assert.doesNotThrow(() => clearRecovery(blocked, 'key'));
});

test('plain New Quotation reopening resumes the latest source-specific Create for that account', () => {
  const store=storage(), key=recoveryKey(8,'/quotations/new-measured','?property=2&measurement=3');
  writeRecovery(store,key,state,null);
  const reopened=openRecovery(store,null,8,'/quotations/new','',null);
  assert.deepEqual(reopened,{key,state});
  assert.equal(openRecovery(store,null,9,'/quotations/new','',null).state,null);
  assert.equal(openRecovery(store,null,8,'/quotations/new','?property=99',null).state,null);
  assert.equal(openRecovery(store,null,8,'/quotations/new-manual','',null).state,null);
  clearRecovery(store,key);
  assert.equal(openRecovery(store,null,8,'/quotations/new','',null).state,null);
});
test('reopening Edit ignores presentation query changes and imports an existing tab recovery copy', () => {
  const store=storage(),tab=storage(),key=recoveryKey(8,'/quotations/5/edit','');
  writeRecovery(tab,key,state,'version-1');
  assert.deepEqual(openRecovery(store,tab,8,'/quotations/5/edit','?view=pricing','version-1'),{key,state});
  assert.deepEqual(readRecovery(store,key,'version-1'),state);
  clearRecovery(store,key);
  clearRecovery(tab,key);
  assert.equal(openRecovery(store,tab,8,'/quotations/5/edit','','version-1').state,null);
});
