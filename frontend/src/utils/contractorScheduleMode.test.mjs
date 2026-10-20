import test from 'node:test';
import assert from 'node:assert/strict';
import { schedulableQuotations } from './salesHandoffs.js';

test('contractor-authorized scheduling includes unaccepted latest active quotations only',()=>{
 const quotes=[
  {id:1,status:'SENT',version_number:1},
  {id:2,status:'DRAFT',version_number:1},
  {id:3,status:'VIEWED',version_number:1},
  {id:4,status:'REJECTED'}, {id:5,status:'EXPIRED'}, {id:6,status:'REVISION_REQUESTED'},
  {id:7,status:'ACCEPTED',version_number:1},
  {id:8,status:'SENT',revision_of:1,version_number:2},
  {id:9,status:'CANCELLED'}, {id:10,status:'COMPLETED'},
 ];
 assert.deepEqual(schedulableQuotations(quotes,[],{contractorAuthorized:true}).map(q=>q.id),[2,3,7,8]);
 assert.deepEqual(schedulableQuotations(quotes,[{quotation:1}],{contractorAuthorized:true}).map(q=>q.id),[2,3,7]);
 assert.deepEqual(schedulableQuotations(quotes,[]).map(q=>q.id),[7]);
});
