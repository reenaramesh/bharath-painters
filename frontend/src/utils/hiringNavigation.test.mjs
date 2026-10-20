import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleNavigation, activeNavigation } from '../config/navigation.js';
import { menuEnabled, menuRouteEnabled } from './menuVisibility.js';

const helpers = await import('./hiringNavigation.js').catch(()=>({}));
const ids = ['jobs','job-activity','bookings','painter-contacts','referrals'];

test('schedule workspace groups authorized history and preserves restricted fallback',()=>{
  for (const role of ['CONTRACTOR','CUSTOMER']) {
    const source=visibleNavigation(role);
    const result=helpers.consolidateScheduleNavigation(source,role);
    assert.equal(result.filter(entry=>['schedule-workspace','schedules','completed'].includes(entry.id)).length,1);
    assert.equal(activeNavigation(result,'/completed-work')?.id,'schedule-workspace');
    assert.equal(activeNavigation(result,'/work-reschedules')?.id,'schedule-workspace');
    const restricted=source.filter(entry=>entry.id!=='schedules');
    assert.deepEqual(helpers.consolidateScheduleNavigation(restricted,role),restricted);
    const noHistory=source.filter(entry=>entry.id!=='completed');
    assert.deepEqual(helpers.consolidateScheduleNavigation(noHistory,role),noHistory);
  }
});

test('contractors see one hiring entry covering every enabled existing section',()=>{
  assert.equal(typeof helpers.consolidateHiringNavigation,'function');
  const entries=helpers.consolidateHiringNavigation(visibleNavigation('CONTRACTOR'),'CONTRACTOR');
  const hiring=entries.filter(entry=>entry.group==='Hiring & Network');
  assert.equal(hiring.length,1);
  assert.equal(hiring[0].label,'Jobs & Applications');
  assert.equal(hiring[0].route,'/jobs');
  for(const route of ['/jobs','/painter-seeking','/job-activity?section=APPLIED','/applicator-bookings','/find-painter','/painter-contacts/15','/painters/contacts/15','/applicator-team']) {
    assert.equal(activeNavigation(entries,route)?.id,hiring[0].id,route);
  }
  for(const label of ['Jobs','Applications & Invitations','Bookings & Requests','Painter Contacts','Contacts & Referrals']) assert.ok(hiring[0].searchTerms.includes(label));
  assert.equal(hiring[0].badge,'applicator_bookings');
});

test('disabled sections remain hidden and cannot become the landing route or search terms',()=>{
  assert.equal(typeof helpers.consolidateHiringNavigation,'function');
  const visibility={CONTRACTOR:['jobs','bookings','painter-contacts']};
  const source=visibleNavigation('CONTRACTOR').filter(e=>menuEnabled('CONTRACTOR',visibility,e.id));
  const entries=helpers.consolidateHiringNavigation(source,'CONTRACTOR');
  const hiring=entries.find(e=>e.group==='Hiring & Network');
  assert.equal(hiring.route,'/job-activity');
  assert.equal(menuRouteEnabled('CONTRACTOR',visibility,hiring.route),true);
  assert.equal(hiring.badge,undefined);
  assert.ok(!hiring.aliases.includes('/jobs'));
  assert.ok(!hiring.searchTerms.includes('Painter Contacts'));
  assert.equal(helpers.consolidateHiringNavigation(source.filter(e=>!ids.includes(e.id)),'CONTRACTOR').filter(e=>e.group==='Hiring & Network').length,0);
});

test('painter navigation and unrelated contractor destinations are unchanged',()=>{
  assert.equal(typeof helpers.consolidateHiringNavigation,'function');
  for(const role of ['PAINTER','CUSTOMER','ADMIN','SUPPORT']) {
    const source=visibleNavigation(role);
    assert.deepEqual(helpers.consolidateHiringNavigation(source,role),source);
  }
  const source=visibleNavigation('CONTRACTOR');
  const result=helpers.consolidateHiringNavigation(source,'CONTRACTOR');
  assert.deepEqual(result.filter(e=>e.group!=='Hiring & Network'),source.filter(e=>e.group!=='Hiring & Network'));
});
