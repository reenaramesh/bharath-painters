import {test} from 'node:test';
import assert from 'node:assert/strict';
import { journeyLayout, activityLabel } from './presentation.js';

test('journey layout handles navigation loops without inventing paths or mutating source data',()=>{
  const links=[{source:'screen:/dashboard',target:'screen:/jobs',count:4},{source:'screen:/jobs',target:'screen:/dashboard',count:2},{source:'screen:/jobs',target:'action:job_applied',count:1}];
  const before=structuredClone(links),layout=journeyLayout(links);
  assert.equal(layout.links.length,3);
  assert.ok(layout.links.every(link=>Number.isFinite(link.y1)&&Number.isFinite(link.y2)));
  assert.deepEqual(links,before);
  assert.deepEqual(journeyLayout([]).links,[]);
});
test('action and lifecycle labels distinguish attempts, observed completions and inferred timeouts',()=>{
  const names={job_applied:'Apply for Job'};
  assert.match(activityLabel({kind:'workflow_started',action:'job_applied'},names),/Started.*Apply for Job/);
  assert.match(activityLabel({kind:'workflow_completed',action:'job_applied'},names),/Completed.*Apply for Job/);
  assert.match(activityLabel({kind:'error',action:'job_applied',error_code:'conflict'},names),/conflict/);
});
