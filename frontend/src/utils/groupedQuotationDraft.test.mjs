import test from 'node:test';
import assert from 'node:assert/strict';
import { measurement, masters, exampleAssignments } from '../preview/quotationGrouping/fixtures.js';
import { assignmentQuotationItems } from './groupedQuotation.js';
import { isGroupedDraft, restoreDraftAssignments, groupedDraftItems } from './groupedQuotationDraft.js';

const saved = () => ({ status: 'DRAFT', quotation_type: 'MEASUREMENT', measurement_record: measurement.id, rooms: measurement.rooms.map(room => ({id: room.id + 100, property_room: room.id, name: room.name})), items: assignmentQuotationItems(measurement, exampleAssignments(), masters).map((item, index) => ({...item, id: index + 200, room: null})) });
test('grouped draft reopens group workspace; manual and sent quotations retain their editor', () => {
 const draft = saved();
 assert.equal(isGroupedDraft(draft), true);
 assert.equal(isGroupedDraft({...draft, status:'SENT'}), false);
 assert.equal(isGroupedDraft({...draft, quotation_type:'MANUAL_LUMPSUM'}), false);
});
test('second edit restores group membership, special walls, rates and persistent line IDs', () => {
 const draft=saved();
 const state=restoreDraftAssignments(draft.items);
 const first=groupedDraftItems(measurement,state,masters,draft.items,draft.rooms);
 assert.equal(first.length,draft.items.length);
 for(let index=0;index<first.length;index++) {
  assert.equal(Number(first[index].rate),Number(draft.items[index].rate));
  for(const key of ['id','quantity','description','coats','unit','service_category','paint_type','paint_brand','specification_details']) assert.deepEqual(first[index][key],draft.items[index][key], key);
 }
 const second=groupedDraftItems(measurement,restoreDraftAssignments(first),masters,first,draft.rooms);
 assert.deepEqual(second,first);
 const changed={...state,rates:{...state.rates,[state.groups[0].id]:99}};
 assert.equal(groupedDraftItems(measurement,changed,masters,draft.items,draft.rooms)[0].rate,99);
});
