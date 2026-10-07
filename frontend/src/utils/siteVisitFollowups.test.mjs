import test from "node:test";
import assert from "node:assert/strict";
import { siteVisitFollowups } from "./siteVisitFollowups.js";

test("site visits created from customer followups preserve identity and local schedule", () => {
  const when = new Date(2026, 9, 7, 0, 15);
  const tasks = [{ id: 12, follow_up_type: "SITE_VISIT", next_follow_up: when.toISOString(), customer_name: "Site customer", comment: "Measure walls", is_completed: false }, { id: 13, follow_up_type: "CALL", next_follow_up: when.toISOString() }, { id: 14, follow_up_type: "SITE_VISIT", next_follow_up: when.toISOString(), is_completed: true }];
  const visits = siteVisitFollowups(tasks);
  assert.deepEqual(visits.map((visit) => visit.id), ["followup-12", "followup-14"]);
  assert.equal(visits[0].scheduled_date, "2026-10-07");
  assert.equal(visits[0].scheduled_time, "00:15");
  assert.equal(visits[0].notes, "Measure walls");
  assert.deepEqual(siteVisitFollowups(tasks, { status: "COMPLETED", date: "2026-10-07" }).map((visit) => visit.followup_id), [14]);
  assert.equal(siteVisitFollowups(tasks, { date: "2026-10-08" }).length, 0);
  assert.equal(tasks[0].id, 12);
});
