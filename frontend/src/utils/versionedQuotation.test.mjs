import test from 'node:test';
import assert from 'node:assert/strict';
import { persistVersionedQuotation } from './versionedQuotation.js';

test('editing a sent quotation saves a new version and sends the new identity',async()=>{
 const ref={current:{id:3,status:'SENT'}}, calls=[];
 const api={post:async(path,payload)=>{calls.push([path,payload]);return {data:path.endsWith('/versions/')?{id:8,status:'DRAFT'}:{id:8,status:'SENT'}};}};
 const saved=await persistVersionedQuotation(api,ref,null,{notes:'Changed',rooms:[],items:[]},true);
 assert.equal(saved.id,8);assert.equal(ref.current.id,8);
 assert.deepEqual(calls.map(([path])=>path),['/quotations/3/versions/','/quotations/8/submit/']);
 assert.match(calls[0][1].edit_request_id,/^[0-9a-f-]{36}$/);
});
test('lost save response retries same payload/token and preserves original identity until confirmed',async()=>{
 const source={id:3},ref={current:source},calls=[];let fail=true;
 const api={post:async(path,payload)=>{calls.push([path,payload]);if(fail){fail=false;throw new Error('Lost response');}return {data:{id:8,status:'DRAFT'}};}};
 await assert.rejects(persistVersionedQuotation(api,ref,null,{notes:'Changed'},false));
 assert.equal(ref.current,source);
 await persistVersionedQuotation(api,ref,null,{notes:'Changed'},false);
 assert.deepEqual(calls[0],calls[1]);
});

test('issued grouped quotations retain their grouped editor when creating a version',async()=>{
 const {isGroupedQuotation}=await import('./groupedQuotationDraft.js');
 for(const status of ['DRAFT','SENT','VIEWED','ACCEPTED','SCHEDULED','IN_PROGRESS','COMPLETED','REJECTED','EXPIRED','CONVERTED','CANCELLED','REVISION_REQUESTED']) {
  assert.equal(isGroupedQuotation({status,quotation_type:'MEASUREMENT',measurement_record:1,items:[{specification_details:{kind:'group'}}]}),true,status);
 }
});
