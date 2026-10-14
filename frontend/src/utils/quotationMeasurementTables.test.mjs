import test from 'node:test';
import assert from 'node:assert/strict';
import { quotationMeasurementTables, measuredTotal } from './quotationMeasurementTables.js';
const rooms = [{id:1,name:'Living room'},{id:2,name:'Balcony'},{id:3,name:'Utility room'}];
test('basement ceiling and exterior walls stay in one property sheet with doors', () => {
  const tables = quotationMeasurementTables({rooms:[{id:1,name:'Basement',painting_area:'INTERIOR'},{id:2,name:'External walls',painting_area:'EXTERIOR'}],surfaces:[
    {room:1,work_area:'INTERIOR',surface_type:'CEILING',net_area:150},
    {room:1,work_area:'INTERIOR',surface_type:'DOOR',net_area:20},
    {room:2,work_area:'EXTERIOR',surface_type:'WALL',net_area:200},
  ]});
  assert.equal(tables.length,1);
  assert.deepEqual(tables[0].types,['WALL','CEILING','DOOR']);
  assert.deepEqual(tables[0].rows.map(row=>row.name),['Basement','External walls']);
  assert.equal(measuredTotal(tables[0].rows[0],'CEILING'),150);
});
test('legacy exterior surfaces appear once when a virtual exterior room exists', () => {
  const tables = quotationMeasurementTables({rooms:[{id:null,name:'Exterior'}],surfaces:[{room:null,work_area:'EXTERIOR',surface_type:'WALL',net_area:100}]});
  assert.equal(tables[0].rows.length,1);
  assert.equal(tables[0].rows.reduce((total,row)=>total+measuredTotal(row,'WALL'),0),100);
});
test('balcony and utility room share the wall/ceiling table including exterior measurements', () => {
  const tables = quotationMeasurementTables({rooms,surfaces:[
    {room:1,surface_type:'WALL',net_area:80},
    {room:2,surface_type:'WALL',net_area:30,work_area:'EXTERIOR'},
    {room:2,surface_type:'CEILING',net_area:20},
    {room:3,surface_type:'WALL',net_area:15},
  ]});
  assert.equal(tables.length,1);
  assert.deepEqual(tables[0].rows.map(row=>row.name), ['Living room','Balcony','Utility room']);
  assert.equal(measuredTotal(tables[0].rows[1],'WALL'),30);
});
test('no door/window columns or empty extra table when none measured', () => {
  const tables = quotationMeasurementTables({rooms,surfaces:[{room:1,surface_type:'WALL',net_area:80},
    {room:1,surface_type:'DOOR',gross_area:0,net_area:0}]});
  assert.deepEqual(tables.map(table=>table.types), [['WALL']]);
});
test('custom table measurements keep balcony in other-surfaces table without unused doors/windows', () => {
  const tables = quotationMeasurementTables({rooms,surfaces:[{room:2,surface_type:'OTHER',area_group_name:'Table',net_area:6}]});
  assert.deepEqual(tables[0].types,['OTHER']);
  assert.equal(tables[0].rows[0].name,'Balcony');
});
test('a measured fully deducted door remains visible at zero net', () => {
  const tables = quotationMeasurementTables({rooms,surfaces:[{room:2,surface_type:'DOOR',gross_area:21,net_area:0,deduction_area:21}]});
  assert.deepEqual(tables[0].types,['DOOR']);
  assert.equal(measuredTotal(tables[0].rows[0],'DOOR'),0);
});
