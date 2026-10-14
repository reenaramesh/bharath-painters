import test from 'node:test';
import assert from 'node:assert/strict';
import { measurement, masters, exampleAssignments } from '../preview/quotationGrouping/fixtures.js';
import { assignmentQuotationItems } from './groupedQuotation.js';
import { restoreDraftAssignments } from './groupedQuotationDraft.js';
import { builderDraftPayload, draftForm, persistQuotation, restoredGroupedItems } from './unifiedQuotation.js';
const saved=()=>({id:42,updated_at:'2026-10-11T01:00:00Z',customer:1,property:2,quotation_type:'MEASUREMENT',measurement_record:measurement.id,rooms:measurement.rooms.map(room=>({id:room.id+100,property_room:room.id,name:room.name})),items:assignmentQuotationItems(measurement,exampleAssignments(),masters).map((line,index)=>({...line,id:200+index,room:null}))});
test('saved blank/zero values take precedence over current profile defaults',()=>{
 for(const mode of ['OVERALL','LINE','BOTH'])assert.equal(draftForm({discount_mode:mode},{discount_mode:'BOTH'}).discount_mode,mode);
 assert.deepEqual(draftForm({notes:'',discount_value:0,show_product_key_features:false},{notes:'New profile',discount_value:50,show_product_key_features:true}),{notes:'',discount_value:0,show_product_key_features:false});
});
test('unchanged assignments preserve saved quantities/specifications despite changed measurement/master values',()=>{
 const quote=saved();quote.items[0]={...quote.items[0],quantity:'123.45',rate:'99.50',discount_type:'PERCENTAGE',discount_value:'12.50',color:123,custom_service_type:'Saved process',specification_details:{...quote.items[0].specification_details,finish:'Saved finish'}};
 const result=restoredGroupedItems(quote,measurement,restoreDraftAssignments(quote.items),masters);
 for(const key of ['id','quantity','rate','color','custom_service_type','specification_details','discount_type','discount_value'])assert.deepEqual(result[0][key],quote.items[0][key]);
 const state=restoreDraftAssignments(quote.items);state.rates[state.groups[0].id]='101';state.discounts[state.groups[0].id]={type:'FIXED',value:'15'};
 const edited=restoredGroupedItems(quote,measurement,state,masters)[0];assert.equal(edited.quantity,'123.45');assert.equal(edited.rate,'101');assert.equal(edited.discount_value,'15');
});
test('atomic edit payload preserves mixed line IDs and snapshots, maps rooms and rejects missing grouped rooms',()=>{
 const quote=saved();const extra={id:999,room:quote.rooms[0].id,description:'Saved legacy repair',quantity:'2',rate:'10',calculation_method:'MANUAL',custom_unit:'Job',unit:null};quote.items.push(extra);
 const lines=[...restoredGroupedItems(quote,measurement,restoreDraftAssignments(quote.items),masters),extra];
 const payload=builderDraftPayload(quote,{notes:'Edited',status:'DRAFT'},lines,measurement.rooms);
 assert.equal(payload.expected_updated_at,quote.updated_at);assert.equal(payload.status,undefined);assert.equal(payload.items.at(-1).id,999);assert.equal(payload.items.at(-1).room_index,0);assert.deepEqual(payload.rooms,quote.rooms);
 assert.throws(()=>builderDraftPayload(quote,{},[{description:'Invalid',specification_details:{room_ids:[99999]}}],measurement.rooms),/missing/);
});
test('material changes keep valid pricing-row references and saved quantity when scope is unchanged',()=>{
 const quote=saved(),state=restoreDraftAssignments(quote.items);quote.items[0].quantity='123.45';
 state.groups[0].spec.paint_brand=999;
 const line=restoredGroupedItems(quote,measurement,state,masters)[0];
 assert.equal(line.quantity,'123.45');assert.equal(line.id,quote.items[0].id);assert.equal(line.paint_brand,999);assert.ok(line.field_id.startsWith('assignment-'));assert.ok(line.room_name);
});
test('editing an independent general-service quantity does not recalculate saved measured groups',()=>{
 const quote=saved();quote.items[0].quantity='123.45';
 quote.items.push({id:900,description:'General repair',quantity:'3',rate:'10',unit:masters.units[0].id,service_category:masters.categories[0].id,calculation_method:'MANUAL',is_additional_service:true,specification_details:{kind:'service',assignment_id:'general-repair',name:'General repair',room_ids:[],measurement_record:measurement.id,measurement_version:measurement.version}});
 const state=restoreDraftAssignments(quote.items);state.services[0].quantity=5;
 const lines=restoredGroupedItems(quote,measurement,state,masters);
 assert.equal(lines[0].quantity,'123.45');assert.equal(lines.at(-1).quantity,5);
});
test('save and send failure keeps created identity; retry updates the same Draft rather than creating another',async()=>{
 const calls=[],ref={current:null};let failing=true;
 const api={post:async(path,payload)=>{calls.push(['post',path,payload]);if(path.endsWith('submit/') && failing)throw new Error('Send failed');return {data:{id:42,updated_at:'next',status:'DRAFT'}};},patch:async(path,payload)=>{calls.push(['patch',path,payload]);return {data:{id:42,updated_at:'latest',status:'DRAFT'}};}};
 await assert.rejects(persistQuotation(api,ref,{items:[]},null,true),error=>error.savedDraft.id===42);
 assert.equal(ref.current.id,42);failing=false;await persistQuotation(api,ref,{}, {expected_updated_at:'next'},true);
 assert.equal(calls.filter(([method,path])=>method==='post' && path==='/quotations/create/').length,1);assert.equal(calls[2][1],'/quotations/42/draft/');
});
test('failed atomic save preserves the previous saved reference and never submits',async()=>{
 const quote=saved(),ref={current:quote};let sends=0;
 const api={patch:async()=>{throw new Error('Conflict');},post:async()=>{sends++;}};
 await assert.rejects(persistQuotation(api,ref,null,{},true));assert.equal(ref.current,quote);assert.equal(sends,0);
});
