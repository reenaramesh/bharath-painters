import test from 'node:test';
import assert from 'node:assert/strict';
import { measurement, masters, exampleAssignments, defaultSpec } from '../preview/quotationGrouping/fixtures.js';
import { saveSpecial, deleteAssignment, specificationLines, assignmentQuotationItems } from './groupedQuotation.js';
import { restoreDraftAssignments } from './groupedQuotationDraft.js';

const processMasters = {...masters,services:[{id:91,name:'Primer'},{id:92,name:'Texture'}]};
const primer = () => ({id:'primer',name:'Separate primer',room_id:1,surface_ids:[14],exclude_from_standard:false,spec:{...defaultSpec,service_type:91}});

test('replacement texture and separate primer bill the wall once per distinct process and restore allocation',()=>{
 const state=saveSpecial(exampleAssignments(),primer(),measurement,processMasters);
 const lines=specificationLines(measurement,state);
 assert.equal(lines.find(line=>line.id==='bedrooms').quantity,1175);
 assert.equal(lines.find(line=>line.id==='primer').quantity,125);
 const saved=assignmentQuotationItems(measurement,{...state,rates:{...state.rates,primer:'5'}},processMasters);
 assert.equal(saved.find(item=>item.specification_details.assignment_id==='primer').specification_details.exclude_from_standard,false);
 const restored=restoreDraftAssignments(saved);
 assert.equal(restored.specials.find(line=>line.id==='primer').exclude_from_standard,false);
 assert.equal(specificationLines(measurement,restored).find(line=>line.id==='bedrooms').quantity,1175);
 const deleted=deleteAssignment(restored,'texture','special');
 assert.equal(specificationLines(measurement,deleted).find(line=>line.id==='bedrooms').quantity,1300,'deleting replacement restores standard area; primer does not deduct it');
});

test('additional wall processes require a distinct selected service and reject duplicate billing',()=>{
 assert.throws(()=>saveSpecial(exampleAssignments(),{...primer(),spec:{...defaultSpec}},measurement,processMasters),/service/i);
 const state=saveSpecial(exampleAssignments(),primer(),measurement,processMasters);
 assert.throws(()=>saveSpecial(state,{...primer(),id:'duplicate'},measurement,processMasters),/already|duplicate/i);
 const full={groups:[{id:'walls',name:'Primer walls',surface:'WALL',room_ids:[1],spec:{...defaultSpec,service_type:91}}],specials:[],rates:{}};
 assert.throws(()=>saveSpecial(full,primer(),measurement,processMasters),/already|duplicate/i);
});
