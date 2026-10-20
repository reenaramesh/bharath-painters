import test from 'node:test';
import assert from 'node:assert/strict';
import { quotationServiceDetails } from './quotationServiceDetails.js';
import { saveGeneralService, assignmentQuotationItems } from './groupedQuotation.js';
import { restoreDraftAssignments } from './groupedQuotationDraft.js';
import { draftSavePayload } from './quotationDraftSave.js';

const measurement={id:7,version:2,rooms:[{id:1,name:'Bedroom 1'}],surfaces:[{id:11,room:1,surface_type:'WALL',net_area:100}]};
const masters={categories:[{id:1,name:'Painting'}],paintTypes:[],brands:[],units:[{id:1,name:'sqft'}]};
test('lumpsum surface metadata persists without introducing measured assignment references',()=>{
  const item={id:20,description:'Paint room',quantity:2,rate:100,calculation_method:'MANUAL',specification_details:{surface:'WALL',finish:'Saved finish'}};
  const payload=draftSavePayload({updated_at:'saved-version'},{quotation_type:'MANUAL_LUMPSUM'},[],[item]);
  assert.deepEqual(payload.items[0].specification_details,{surface:'WALL',finish:'Saved finish'});
  assert.equal(quotationServiceDetails(payload.items[0]).surface,'Walls');
  assert.equal(payload.items[0].quantity,2);
  assert.equal(payload.items[0].rate,100);
  assert.equal(payload.items[0].specification_details.kind,undefined);
});
test('general-service review shows the selected room and surface across draft restore',()=>{
  const state=saveGeneralService({groups:[],specials:[],services:[],rates:{}},{id:'service',room_id:1,surface:'WALL',quantity:2,unit:1,spec:{service_category:1,description:'Repair cracks',coats:1}},measurement,masters);
  state.rates.service=20;
  const item=assignmentQuotationItems(measurement,state,masters)[0];
  assert.equal(item.room_name,'Bedroom 1');
  const values=quotationServiceDetails({...item,room_name:'Painting'},masters);
  assert.equal(values.roomArea,'Bedroom 1');
  assert.equal(values.surface,'Walls');
  assert.equal(values.description,'Repair cracks');
  assert.equal(item.quantity,2);
  const restored=assignmentQuotationItems(measurement,restoreDraftAssignments([item]),masters)[0];
  assert.equal(quotationServiceDetails(restored).roomArea,'Bedroom 1');
  assert.equal(quotationServiceDetails(restored).surface,'Walls');
});
test('group scope uses real room names and named surface categories without changing manual items',()=>{
  const values=quotationServiceDetails({room_name:'Area group',description:'Texture finish',specification_details:{kind:'group',surface:'OTHER:Texture Walls',contributions:[{room_name:'Bedroom 1',quantity:50},{room_name:'Living Room',quantity:70}]}});
  assert.equal(values.roomArea,'Bedroom 1, Living Room');
  assert.equal(values.surface,'Texture Walls');
  assert.equal(quotationServiceDetails({room_name:'Kitchen',description:'Cabinet repair'}).roomArea,'Kitchen');
  assert.equal(quotationServiceDetails({room_name:'Kitchen'}).surface,'');
});
