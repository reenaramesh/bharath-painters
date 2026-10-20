import test from 'node:test';
import assert from 'node:assert/strict';
import { draftSavePayload, draftSaveError } from './quotationDraftSave.js';

test('one payload retains room snapshots and maps new and existing room references', () => {
  const quotation = {updated_at:'2026-10-10T10:00:00Z'};
  const rooms = [{id:9,property_room:2,name:'Saved',length:'12.50'}, {property_room:3,name:'New'}];
  const items = [{id:20,room:9,quantity:5}, {room:'property-3',quantity:7}];
  const payload = draftSavePayload(quotation,{status:'DRAFT',notes:'Keep'},rooms,items);
  assert.equal(payload.expected_updated_at,quotation.updated_at);
  assert.equal(payload.status,undefined);
  assert.deepEqual(payload.items.map(item=>item.room_index),[0,1]);
  assert.ok(payload.items.every(item=>!('room' in item)));
  assert.equal(payload.rooms[0].length,'12.50');
  assert.equal(payload.items[0].id,20);
});

test('validation and conflict messages remain useful without clearing edits', () => {
  assert.match(draftSaveError({response:{data:{items:[{rate:['Rate cannot be negative.']}]}}}),/Rate cannot be negative/);
  assert.match(draftSaveError({response:{status:409,data:{detail:'Draft changed in another session.'}}}),/another session/);
  assert.equal(draftSaveError({response:{status:500,data:'<html>Debug traceback</html>'}}),'Draft could not be saved. Your edits are still available here. Try again.');
});

test('quotation room IDs cannot be confused with property room IDs from another table', () => {
 const rooms=[{id:10,property_room:20,name:'First'},{id:20,property_room:30,name:'Second'}];
 const payload=draftSavePayload({updated_at:'saved'}, {}, rooms, [{id:99,room:20}]);
 assert.equal(payload.items[0].room_index,1);
});
