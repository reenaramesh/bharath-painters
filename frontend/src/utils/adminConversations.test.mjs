import test from 'node:test';
import assert from 'node:assert/strict';
import { groupAdminConversations } from './adminConversations.js';

test('groups contractors while keeping customer threads separate and chronological', () => {
  const messages = [
    {id:3,contractor_id:1,contractor:'Painter Co',conversation:11,customer:'Reena',text:'Reply',created_at:'2026-10-08T12:00:00Z'},
    {id:1,contractor_id:1,contractor:'Painter Co',conversation:11,customer:'Reena',text:'Hello',created_at:'2026-10-08T10:00:00Z'},
    {id:2,contractor_id:1,contractor:'Painter Co',conversation:12,customer:'Other customer',text:'Estimate',created_at:'2026-10-08T11:00:00Z'},
    {id:4,contractor_id:2,contractor:'Painter Co',conversation:13,customer:'Third customer',text:'Separate business',created_at:'2026-10-08T09:00:00Z'},
  ];
  const result=groupAdminConversations(messages);
  assert.equal(result.length,2);
  assert.equal(result[0].threads.length,2);
  assert.deepEqual(result[0].threads[0].messages.map(m=>m.id),[1,3]);
  assert.equal(result[0].latest.text,'Reply');
  assert.equal(messages[0].id,3);
});
test('supports existing API contractor names and preserves full threads when searching', () => {
  const messages=[{id:1,contractor:'Contractor A',conversation:1,customer:'Reena',text:'First',created_at:'2026-10-08'}, {id:2,contractor:'Contractor A',conversation:1,customer:'Reena',text:'Second',created_at:'2026-10-09'}];
  assert.equal(groupAdminConversations(messages,'first')[0].threads[0].messages.length,2);
  assert.equal(groupAdminConversations(messages,'unknown').length,0);
  assert.deepEqual(groupAdminConversations([]),[]);
});
