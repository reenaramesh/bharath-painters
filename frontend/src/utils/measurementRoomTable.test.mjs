import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measurementRoomTable } from './measurementRoomTable.js';
test('balconies share the room table across wall, ceiling and custom surfaces', () => {
  const result = measurementRoomTable([{id:1,name:'Bedroom'},{id:2,name:'Balcony'}], new Map([
    ['1',{net:120,groups:[{key:'WALL',label:'Wall',gross:100,net:100},{key:'CEILING',label:'Ceiling',gross:20,net:20}]}],
    ['2',{net:45,groups:[{key:'WALL',label:'Wall',gross:30,net:30},{key:'OTHER:Table',label:'Table',gross:15,net:15}]}],
  ]));
  assert.deepEqual(result.rows.map(row=>row.name), ['Bedroom','Balcony']);
  assert.deepEqual(result.columns.map(col=>col.label), ['Wall','Ceiling','Table']);
  assert.equal(result.net,165);
});
test('unused door/window categories and empty rooms do not appear', () => {
  const result = measurementRoomTable([{id:1,name:'Bedroom'},{id:2,name:'Empty'}], new Map([
    ['1',{net:100,groups:[{key:'WALL',label:'Wall',gross:100,net:100},{key:'DOOR',label:'Door',gross:0,net:0},{key:'WINDOW',label:'Window',gross:0,net:0}]}],
  ]));
  assert.deepEqual(result.columns.map(col=>col.key), ['WALL']);
  assert.equal(result.rows.length,1);
});
test('a fully deducted measured wall remains visible at zero net area', () => {
  const result = measurementRoomTable([{id:1,name:'Room'}], new Map([['1',{net:0,groups:[{key:'WALL',label:'Wall',gross:20,deduction:20,net:0}]}]]));
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].values.WALL,0);
});
test('door/window openings appear as references without increasing the room total', () => {
  const result = measurementRoomTable([{id:1,name:'Balcony'}], new Map([['1',{net:68,groups:[{
    key:'WALL',label:'Wall',gross:100,deduction:32,net:68,
    deductions:[{opening_type:'DOOR',area:20},{opening_type:'WINDOW',area:12}],
  }]}]]));
  assert.deepEqual(result.columns.map(col=>col.key), ['WALL','OPENING:DOOR','OPENING:WINDOW']);
  assert.equal(result.net,68);
});
test('reference-only openings remain listed without an empty wall column', () => {
  const result = measurementRoomTable([{id:1,name:'Balcony'}], new Map([['1',{net:0,groups:[{
    key:'WALL',label:'Wall',gross:0,deduction:0,addition:0,net:0,
    deductions:[{opening_type:'DOOR',area:20,effective_deduction:0}],
  }]}]]));
  assert.equal(result.rows.length,1);
  assert.deepEqual(result.columns.map(col=>col.key), ['OPENING:DOOR']);
});
