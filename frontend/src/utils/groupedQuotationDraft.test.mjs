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

test('saved custom units and service fields are retained instead of master defaults', () => {
 const draft=saved();
 draft.items[0]={...draft.items[0],unit:null,custom_unit:'Square metres',custom_service_type:'Saved treatment',line_type:'PAINT',specification_details:{...draft.items[0].specification_details,finish:'Satin'}};
 const items=groupedDraftItems(measurement,restoreDraftAssignments(draft.items),masters,draft.items,draft.rooms);
 assert.equal(items[0].unit,null);
 assert.equal(items[0].custom_unit,'Square metres');
 assert.equal(items[0].custom_service_type,'Saved treatment');
 assert.equal(items[0].specification_details.finish,'Satin');
});
test('explicit service and unit edits override the saved selection',()=>{
 const draft=saved();
 draft.items[0]={...draft.items[0],service_type:99,unit:null,custom_unit:'Saved area unit'};
 const state=restoreDraftAssignments(draft.items);
 state.groups[0]={...state.groups[0],unit:1,spec:{...state.groups[0].spec,service_type:''}};
 const line=groupedDraftItems(measurement,state,masters,draft.items,draft.rooms)[0];
 assert.equal(line.service_type,null);
 assert.equal(line.unit,1);
});
test('editing a group retains the explicit save-description-to-master choice',()=>{
 const draft=saved(),state=restoreDraftAssignments(draft.items);
 state.groups[0].spec.promote_to_master=true;
 assert.equal(groupedDraftItems(measurement,state,masters,draft.items,draft.rooms)[0].promote_to_master,true);
});

test('grouped custom master names and explicit promotion flags use existing request fields',()=>{
 const draft=saved(),state=restoreDraftAssignments(draft.items);
 state.groups[0].spec={...state.groups[0].spec,service_category:'',custom_service_category:'New Painting',paint_type:'',custom_product_type:'New finish',paint_brand:'',custom_brand:'New brand',save_service_category_to_master:true,save_product_type_to_master:true,save_brand_to_master:true};
 const line=assignmentQuotationItems(measurement,state,masters)[0];
 for(const [field,expected] of Object.entries({custom_service_category:'New Painting',custom_product_type:'New finish',custom_brand:'New brand',save_service_category_to_master:true,save_product_type_to_master:true,save_brand_to_master:true}))assert.equal(line[field],expected,field);
 const edited=groupedDraftItems(measurement,state,masters,draft.items,draft.rooms)[0];
 assert.equal(edited.custom_product_type,'New finish');assert.equal(edited.save_brand_to_master,true);
 const reopened=restoreDraftAssignments([{...edited,service_category:null,paint_type:null,paint_brand:null}]);
 assert.equal(reopened.groups[0].spec.custom_service_category,'New Painting');
 assert.equal(reopened.groups[0].spec.custom_product_type,'New finish');
});
