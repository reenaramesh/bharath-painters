import test from 'node:test';
import assert from 'node:assert/strict';
import { roomContribution, saveGroup, specificationLines, assignmentQuotationItems, groupSurfaces } from './groupedQuotation.js';
import { surfaceCategoryTotals, combinedSurfaceCategoryTotals } from './paintingMeasurements.js';

test('property output combines wall totals across work areas while retaining ceilings', () => {
  const totals = combinedSurfaceCategoryTotals([{surface_type:'WALL',work_area:'INTERIOR',net_area:80},{surface_type:'WALL',work_area:'EXTERIOR',net_area:20},{surface_type:'CEILING',work_area:'INTERIOR',net_area:50}]);
  assert.deepEqual(totals.categories.map(entry=>[entry.surface,entry.quantity]),[['WALL',100],['CEILING',50]]);
  assert.equal(totals.overall,150);
});
import { restoreDraftAssignments } from './groupedQuotationDraft.js';

const measurement = { id: 7, version: 2, rooms: [{ id: 1, name: 'Bedroom' }], surfaces: [
  { id: 11, room: 1, work_area: 'INTERIOR', surface_type: 'WALL', net_area: 330 },
  { id: 12, room: 1, work_area: 'EXTERIOR', surface_type: 'WALL', net_area: 40 },
  { id: 13, room: 1, work_area: 'INTERIOR', surface_type: 'OTHER', area_group_name: 'Texture Walls', net_area: 110 },
  { id: 14, room: 1, work_area: 'INTERIOR', surface_type: 'CEILING', net_area: 120 },
] };
const masters = { categories: [{ id: 1, name: 'Painting' }], brands: [], paintTypes: [{ id: 2, name: 'Emulsion', service_category: 1 }], units: [{ id: 1, name: 'sqft' }] };
const draft = { id: 'item1', name: 'Interior Walls', work_area: 'INTERIOR', measurement_record: 7, painting_item: true, surface: 'WALL', room_ids: [1], spec: { service_category: 1, paint_type: 2, primer_coats: 1, coats: 2, painting_process: 'PRIMER_PAINT' } };
test('primer and putty materials survive quotation save and restore', () => {
  const process_materials = { primer: { brand: 3, product: 4 }, putty: { brand: 5, product: 6, coats: 2 } };
  const state = saveGroup({groups:[],specials:[],services:[],rates:{}}, {...draft, spec: {...draft.spec, process_materials}}, measurement, masters);
  const items = assignmentQuotationItems(measurement, state, masters);
  assert.deepEqual(items[0].specification_details.process_materials, process_materials);
  assert.deepEqual(restoreDraftAssignments(items).groups[0].spec.process_materials, process_materials);
});
test('multiple painting surfaces sum saved areas once, retain scope on restore and reject overlapping assignments', () => {
  const combined = {...draft,name:'Interior Walls + Ceiling',surfaces:['WALL','CEILING']};
  const state = saveGroup({groups:[],specials:[],services:[],rates:{}},combined,measurement,masters);
  state.rates.item1=20;
  assert.equal(specificationLines(measurement,state)[0].quantity,450);
  const items=assignmentQuotationItems(measurement,state,masters);
  assert.equal(items[0].quantity,450);
  assert.deepEqual(groupSurfaces(restoreDraftAssignments(items).groups[0]),['WALL','CEILING']);
  assert.throws(()=>saveGroup(state,{...draft,id:'duplicate',surface:'CEILING'},measurement,masters),/already assigned/i);
});
test('saved net areas stay separated by Painting Area and texture is counted once', () => {
  assert.equal(roomContribution(measurement, [], 1, 'WALL', 'INTERIOR').quantity, 330);
  const totals = surfaceCategoryTotals(measurement.surfaces);
  assert.equal(totals.overall, 600);
  assert.equal(totals.categories.find(x => x.work_area === 'INTERIOR' && x.surface === 'OTHER:Texture Walls').quantity, 110);
});
test('assignment area/version identity, own edits and JSON draft round trip', () => {
  let state = saveGroup({ groups: [], specials: [], services: [], rates: {} }, draft, measurement, masters);
  assert.throws(() => saveGroup(state, { ...draft, id: 'duplicate' }, measurement, masters), /already assigned/i);
  state = saveGroup(state, { ...draft, id: 'outside', work_area: 'EXTERIOR', name: 'Exterior Walls' }, measurement, masters);
  state = saveGroup(state, draft, measurement, masters);
  state.rates = { item1: 20, outside: 30 };
  assert.deepEqual(specificationLines(measurement, state).map(x => x.quantity), [330, 40]);
  const items = assignmentQuotationItems(measurement, state, masters);
  assert.equal(items[0].specification_details.work_area, 'INTERIOR');
  assert.equal(items[0].specification_details.painting_process, 'PRIMER_PAINT');
  assert.equal(restoreDraftAssignments(items).groups[0].work_area, 'INTERIOR');
  assert.throws(() => saveGroup(state, { ...draft, id: 'wrong', measurement_record: 8 }, measurement, masters), /measurement version/i);
});
