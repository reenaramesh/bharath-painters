import test from 'node:test';
import assert from 'node:assert/strict';
import { measurement, masters } from '../preview/quotationGrouping/fixtures.js';
import { saveGroup, saveSpecial, saveGeneralService, specificationLines } from './groupedQuotation.js';

test('multiple surfaces and rooms use one group; special walls are billed once', () => {
 let state={groups:[],specials:[],services:[],rates:{}};
 const spec={service_category:1,paint_type:1,paint_brand:1,coats:2,primer_coats:1};
 state=saveGroup(state,{id:'multi',name:'Walls and ceilings',surface:'WALL',surfaces:['WALL','CEILING'],room_ids:[1,2],spec},measurement,masters);
 state=saveSpecial(state,{id:'texture',name:'Texture',room_id:1,surface_ids:[14],spec:{...spec,service_category:2,paint_type:4}},measurement,masters);
 const lines=specificationLines(measurement,state);
 assert.equal(lines[0].quantity,1015);
 assert.equal(lines[1].quantity,125);
 assert.throws(()=>saveGroup(state,{id:'duplicate',name:'Duplicate ceiling',surface:'CEILING',room_ids:[1],spec},measurement,masters),/already assigned/);
});
test('deselecting every surface cannot fall back to an old surface silently',()=>{
 const state={groups:[],specials:[],services:[],rates:{}};
 const draft={id:'empty',name:'Empty',surface:'WALL',surfaces:[],room_ids:[1],spec:{service_category:1,paint_type:1,coats:2,primer_coats:1}};
 assert.throws(()=>saveGroup(state,draft,measurement,masters),/Select existing surfaces/);
});
test('legacy products without a category remain usable from existing masters',()=>{
 const catalogue={...masters,paintTypes:[...masters.paintTypes,{id:99,name:'Legacy global product',service_category:null}]};
 const state={groups:[],specials:[],services:[],rates:{}};
 const saved=saveGeneralService(state,{id:'general',room_id:'',unit:2,quantity:1,spec:{service_category:5,paint_type:99,description:'Existing global product'}},measurement,catalogue);
 assert.equal(saved.services[0].spec.paint_type,99);
});
