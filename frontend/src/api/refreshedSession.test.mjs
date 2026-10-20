import test from 'node:test';
import assert from 'node:assert/strict';
import { persistRefreshedSession } from './refreshedSession.js';

function storage() {
  const values=new Map([['bharath_access','old-access'],['bharath_refresh','old-refresh']]);
  return {getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
}
test('successful refresh persists rotated refresh token as well as access token',()=>{
  const store=storage();
  assert.equal(persistRefreshedSession(store,{access:'new-access',refresh:'new-refresh'}),'new-access');
  assert.equal(store.getItem('bharath_refresh'),'new-refresh');
  assert.equal(store.getItem('bharath_access'),'new-access');
});
test('older nonrotating response keeps existing refresh token',()=>{
  const store=storage();persistRefreshedSession(store,{access:'new-access'});
  assert.equal(store.getItem('bharath_refresh'),'old-refresh');
});
test('malformed refresh response cannot partially replace the current session',()=>{
  for(const data of [null,{}, {access:''},{access:[],refresh:'new'},{access:'new',refresh:''}]) {
    const store=storage();assert.throws(()=>persistRefreshedSession(store,data));
    assert.equal(store.getItem('bharath_access'),'old-access');
    assert.equal(store.getItem('bharath_refresh'),'old-refresh');
  }
});
