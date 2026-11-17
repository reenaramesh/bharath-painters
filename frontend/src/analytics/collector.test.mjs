import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActivityCollector, resolveScreen } from './collector.js';
import { readFileSync } from 'node:fs';

const routes = [{ screen: '/customers/:id', module: 'customers' }, { screen: '/dashboard', module: 'dashboard' }];
test('canonical routes never transmit record IDs or query contents', () => {
  assert.deepEqual(resolveScreen('/customers/123?secret=otp', routes), routes[0]);
  assert.equal(resolveScreen('/login', routes), undefined);
});
function setup() {
  let now = 0, counter = 0;
  const batches = [];
  const actions=[{id:'save_customer',modules:['customers']},{id:'draft_saved',modules:['dashboard']}];
  const collector = new ActivityCollector({ now: () => now, uuid: () => String(++counter), sessionId: 'session', send: async batch => batches.push(batch), routes, actions });
  return { collector, batches, advance: ms => { now += ms; } };
}
test('foreground engagement excludes hidden and idle time', async () => {
  const { collector: c, batches, advance } = setup();
  c.visit('/dashboard');
  advance(10000); c.tick();
  c.visibility(false); advance(10000); c.tick();
  c.visibility(true); advance(40000); c.tick();
  await c.flush();
  assert.equal(batches.flatMap(b => b.events).filter(e => e.kind === 'engagement').reduce((s,e) => s + e.duration_ms, 0), 40000);
});
test('navigation and scroll milestones deduplicate and engagement belongs to old screen', async () => {
  const { collector: c, batches, advance } = setup();
  c.visit('/dashboard'); c.visit('/dashboard');
  c.scroll(0.76); c.scroll(0.9); c.scroll(1);
  advance(1000); c.visit('/customers/12');
  await c.flush();
  const events = batches.flatMap(b => b.events);
  assert.equal(events.filter(e => e.kind === 'module_opened').length, 2);
  assert.deepEqual(events.filter(e => e.kind === 'scroll').map(e => e.milestone), [25,50,75,100]);
  assert.equal(events.find(e => e.kind === 'engagement').screen, '/dashboard');
});
test('retries preserve UUIDs and queue is bounded', async () => {
  const { collector: c } = setup();
  let attempts = [];
  c.send = async b => { attempts.push(b.events.map(e => e.id)); if (attempts.length === 1) throw Error('offline'); };
  c.visit('/dashboard'); await c.flush(); await c.flush();
  assert.deepEqual(attempts[0], attempts[1]);
  for (let i=0;i<200;i++) c.visit(i%2 ? '/dashboard' : '/customers/1');
  assert.ok(c.queue.length <= 100);
});
test('background return after inactivity starts a new session', () => {
  const { collector: c, advance } = setup();
  c.visit('/dashboard'); c.visibility(false); advance(1800001); c.visibility(true);
  assert.notEqual(c.sessionId, 'session');
});
test('frequent input is not an event per interaction', () => {
  const { collector: c, advance } = setup(); c.visit('/dashboard');
  for (let i=0; i<1000; i++) { advance(1); c.activity(); }
  assert.equal(c.queue.filter(row => row.event.kind === 'engagement').length, 0);
});
test('audited taxonomy groups aliases and preserves backend parity', () => {
  const frontend = JSON.parse(readFileSync(new URL('./taxonomy.json', import.meta.url)));
  const backend = JSON.parse(readFileSync(new URL('../../../backend/application_analytics/taxonomy.json', import.meta.url)));
  assert.deepEqual(frontend, backend);
  for (const [path, module] of [['/applicator', 'dashboard'], ['/job-activity', 'job-activity'], ['/work-reschedules','schedules'], ['/provider-profile','settings']]) {
    assert.equal(resolveScreen(path, frontend)?.module, module);
  }
});

test('visits carry stable identities and ordered navigation without raw paths',async()=>{
  const {collector:c,batches,advance}=setup();
  c.visit('/dashboard');advance(1000);c.visit('/customers/99');await c.flush();
  const events=batches.flatMap(batch=>batch.events);
  assert.ok(events.every(event=>event.visit_id && event.sequence>0));
  assert.deepEqual(events.map(event=>event.sequence),events.map((_,index)=>index+1));
  const navigation=events.find(event=>event.kind==='navigation');
  assert.equal(navigation.previous_screen,'/dashboard');
  assert.equal(navigation.screen,'/customers/:id');
  assert.equal(events.find(event=>event.kind==='screen_left').reason,'module_exit');
  assert.doesNotMatch(JSON.stringify(events),/customers\/99/);
});

test('workflows complete on allowed success or abandon on departure and ignore unknown actions',async()=>{
  const {collector:c,batches}=setup();c.visit('/customers/9');
  c.beginWorkflow('save_customer');c.beginWorkflow('save_customer');c.feature('save_customer');
  c.feature('password',{value:'secret'});c.beginWorkflow('save_customer');c.visit('/dashboard');await c.flush();
  const events=batches.flatMap(batch=>batch.events);
  assert.equal(events.filter(event=>event.kind==='workflow_started').length,2);
  assert.equal(events.filter(event=>event.kind==='workflow_completed').length,1);
  assert.equal(events.filter(event=>event.kind==='workflow_abandoned').length,1);
  assert.doesNotMatch(JSON.stringify(events),/password|secret/);
});

test('background actions and stale request context are discarded; read actions deduplicate per visit',()=>{
  const {collector:c}=setup();c.visit('/customers/1');const context=c.context();
  c.feature('save_customer',{once:true});c.feature('save_customer',{once:true});
  assert.equal(c.queue.filter(row=>row.event.kind==='feature_action').length,1);
  c.visit('/customers/2');c.feature('save_customer',{context});
  c.visibility(false);c.feature('save_customer');
  assert.equal(c.queue.filter(row=>row.event.kind==='feature_action').length,1);
});

test('idle timeout ends once, caps foreground engagement and resumes a new visible visit',async()=>{
  const {collector:c,batches,advance}=setup();c.visit('/dashboard');
  advance(1800001);c.tick();c.tick();await c.flush();
  const events=batches.flatMap(batch=>batch.events);
  assert.equal(events.filter(event=>event.kind==='session_ended').length,1);
  assert.equal(events.find(event=>event.kind==='session_ended').reason,'idle_timeout');
  assert.equal(events.filter(event=>event.kind==='engagement').reduce((total,event)=>total+event.duration_ms,0),30000);
  c.activity();assert.notEqual(c.sessionId,'session');
  assert.equal(c.queue.filter(row=>row.event.kind==='screen_viewed').length,1);
});

test('page exit closes only the visit; explicit logout closes the session once',()=>{
  const {collector:c}=setup();c.visit('/dashboard');c.leave();c.leave();
  assert.equal(c.queue.filter(row=>row.event.kind==='screen_left').length,1);
  assert.equal(c.queue.filter(row=>row.event.kind==='session_ended').length,0);
  c.end('logout');c.end('logout');
  assert.equal(c.queue.filter(row=>row.event.kind==='session_ended').length,1);
});

test('sanitized errors accept fixed classes only and no error object',()=>{
  const {collector:c}=setup();c.visit('/customers/1');
  c.error('save_customer','server');c.error('save_customer','password=secret');
  assert.equal(c.queue.filter(row=>row.event.kind==='error').length,1);
  assert.equal(c.queue.find(row=>row.event.kind==='error').event.error_code,'server');
});

test('action catalogs match on client and server',()=>{
  const frontend=JSON.parse(readFileSync(new URL('./actions.json',import.meta.url)));
  const backend=JSON.parse(readFileSync(new URL('../../../backend/application_analytics/actions.json',import.meta.url)));
  assert.deepEqual(frontend,backend);
});

test('foreground request can complete while hidden without renewing activity or counting hidden time',()=>{
  const {collector:c,advance}=setup();c.visit('/customers/1');c.beginWorkflow('save_customer');
  const context=c.context(),lastActivity=c.lastActivity;
  c.visibility(false);advance(10000);c.feature('save_customer',{context});
  assert.equal(c.queue.filter(row=>row.event.kind==='workflow_completed').length,1);
  assert.equal(c.lastActivity,lastActivity);
  const hiddenContext=c.context();c.feature('save_customer',{context:hiddenContext});
  assert.equal(c.queue.filter(row=>row.event.kind==='feature_action').length,1);
  assert.equal(c.queue.filter(row=>row.event.kind==='engagement').length,0);
});

test('contractor attendance management cannot emit an employee self-check-in',()=>{
  const c=new ActivityCollector({send:async()=>{},sessionId:'s',role:'CONTRACTOR',routes:[{screen:'/in-house-applicators',module:'employees'}],actions:[{id:'check_in_submitted',modules:['employees'],roles:['EMPLOYEE']}]});
  c.visit('/in-house-applicators');c.beginWorkflow('check_in_submitted');c.feature('check_in_submitted');
  assert.equal(c.queue.filter(row=>row.event.action).length,0);
});
