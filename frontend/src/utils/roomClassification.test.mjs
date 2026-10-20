import test from 'node:test';
import assert from 'node:assert/strict';
import { roomCategory, roomCategoryLabel } from './roomClassification.js';

test('contractor room choice overrides Utility master default without reclassifying surfaces',()=>{
  const masters=[{id:20,name:'Utility',painting_area:'INTERIOR'}];
  const surfaces=[{room:2,work_area:'INTERIOR'}];
  assert.equal(roomCategory({id:2,room_type:20,painting_area:'EXTERIOR'},surfaces,masters),'EXTERIOR');
  assert.equal(surfaces[0].work_area,'INTERIOR');
  assert.equal(roomCategory({id:2,painting_area:'OTHER'},surfaces,masters),'OTHER');
});
test('legacy room defaults use saved classification or master without guessing from names',()=>{
  assert.equal(roomCategory({id:2,name:'Utility'},[{room:2,work_area:'EXTERIOR'}]),'EXTERIOR');
  assert.equal(roomCategory({id:2,name:'Utility'},[{room:2,work_area:'INTERIOR'},{room:2,work_area:'EXTERIOR'}]),'OTHER');
  assert.equal(roomCategory({id:2,name:'Utility'},[]),'OTHER');
  assert.equal(roomCategory({id:2,room_type:20},[],[{id:20,painting_area:'INTERIOR'}]),'INTERIOR');
  assert.equal(roomCategoryLabel('OTHER'),'Others');
});
