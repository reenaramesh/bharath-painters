import {test} from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { installAnalyticsRequests } from './apiActivity.js';
import { installFeatureTracking } from './features.js';

function setup(status=201,data={id:7,status:'DRAFT'}) {
  const recorded=[];
  const remove=installFeatureTracking({context:()=>({sessionId:'s',visitId:'v'}),beginWorkflow:action=>recorded.push(['start',action]),feature:(action,options)=>recorded.push(['feature',action,options]),error:(...args)=>recorded.push(['error',...args])});
  const api=axios.create({adapter:async config=>({status,data,config,headers:{}})});
  installAnalyticsRequests(api);
  return {api,recorded,remove};
}
test('successful quotation persistence emits names only, excluding pricing previews and request contents',async()=>{
  const {api,recorded,remove}=setup();
  try {
    await api.post('/quotations/create/',{password:'secret',notes:'private'});
    await api.post('/quotations/preview-pdf/',{notes:'private'});
    assert.deepEqual(recorded.filter(row=>row[0]==='feature').map(row=>row[1]),['quotation_created','draft_saved']);
    assert.doesNotMatch(JSON.stringify(recorded),/secret|private|password|notes/);
  } finally {remove();}
});
test('attendance records successful pending check-in, not approval or arbitrary status responses',async()=>{
  const {api,recorded,remove}=setup(201,{id:8,status:'PRESENT',approval_status:'PENDING'});
  try {await api.post('/jobs/in-house-applicators/123/attendance/',{note:'private'});
    assert.ok(recorded.some(row=>row[1]==='check_in_submitted'));
    assert.doesNotMatch(JSON.stringify(recorded),/123|private/);
  } finally {remove();}
});
test('read actions require meaningful response shape and never inspect private values',async()=>{
  const {api,recorded,remove}=setup(200,{property:{id:7,address:'PRIVATE'}});
  try {await api.get('/quotations/customer-portal/properties/7/?token=secret');
    assert.equal(recorded[0][1],'shared_property_opened');
    assert.equal(recorded[0][2].once,true);
    assert.doesNotMatch(JSON.stringify(recorded),/PRIVATE|secret|token/);
  } finally {remove();}
});
test('failed requests produce sanitized error class only and no successful action',async()=>{
  const {api,recorded,remove}=setup();
  api.defaults.adapter=async config=>{throw Object.assign(Error('password=private'),{config,response:{status:409,data:{message:'private'}}});};
  try {await assert.rejects(api.post('/jobs/8/apply/'));
    const errors=recorded.filter(row=>row[0]==='error');
    assert.equal(errors[0][2],'conflict');
    assert.equal(recorded.filter(row=>row[0]==='feature').length,0);
    assert.doesNotMatch(JSON.stringify(recorded),/private|password/);
  } finally {remove();}
});

test('initial page read is recorded when the collector becomes ready before its response',async()=>{
  const {api,remove}=setup();remove();
  let finish;
  api.defaults.adapter=config=>new Promise(resolve=>{finish=()=>resolve({status:200,data:{property:{id:7}},config,headers:{}});});
  const request=api.get('/quotations/customer-portal/properties/7/');
  await new Promise(resolve=>setTimeout(resolve,0));
  const recorded=[];
  const cleanup=installFeatureTracking({context:()=>({sessionId:'s',visitId:'v'}),feature:action=>recorded.push(action)});
  try {finish();await request;assert.deepEqual(recorded,['shared_property_opened']);} finally {cleanup();}
});

test('rejecting or revising a quotation never starts an acceptance workflow',async()=>{
  const {api,recorded,remove}=setup(200,{status:'REJECTED'});
  try {await api.post('/quotations/customer-portal/quotations/7/action/',{action:'REJECT',note:'private'});
    assert.deepEqual(recorded,[]);
  } finally {remove();}
});
