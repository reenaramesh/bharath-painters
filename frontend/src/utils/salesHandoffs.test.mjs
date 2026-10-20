import test from "node:test";
import assert from "node:assert/strict";
import * as handoffs from "./salesHandoffs.js";

test("persisted and synthetic visits use their own completion endpoints", () => {
  assert.deepEqual(handoffs.visitCompletionRequest({ id: 9 }), { url: "/quotations/site-visits/9/", payload: { status: "COMPLETED" } });
  assert.deepEqual(handoffs.visitCompletionRequest({ id: "followup-5", followup_id: 5 }), { url: "/quotations/tasks/5/", payload: { is_completed: true } });
});

test("quotation handoffs preserve available customer, property and opportunity", () => {
  assert.equal(handoffs.visitQuotationPath({ customer: 4, property: 8, opportunity: 12 }), "/quotations/new?customer=4&property=8&lead=12");
  assert.equal(handoffs.visitQuotationPath({ customer: 4 }), "/quotations/new?customer=4");
  assert.equal(handoffs.visitQuotationPath({}), null);
  assert.equal(handoffs.visitQuotationPath({ customer: "4&property=999" }), null);
});

test("measurement handoffs resume only an owned editable record and require a property", () => {
  const records = [{ id: 30, contractor: 2, status: "SUBMITTED" }, { id: 31, contractor: 99, status: "DRAFT" }, { id: 32, contractor: 2, status: "IN_PROGRESS" }];
  assert.equal(handoffs.visitMeasurementPath({ property: 8 }, records, 2), "/properties/8/measurements?measurement=32");
  assert.equal(handoffs.visitMeasurementPath({ property: 8 }, [], 2), "/properties/8/measurements?new=1");
  assert.equal(handoffs.visitMeasurementPath({ customer: 4 }, records, 2), null);
});

test("failed completion cannot navigate and completed visits need no repeated PATCH", async () => {
  const navigated = [];
  await assert.rejects(handoffs.completeVisitHandoff({ status: "SCHEDULED" }, "/quotations/new", { complete: async () => { throw new Error("offline"); }, navigate: path => navigated.push(path) }), /offline/);
  assert.equal(await handoffs.completeVisitHandoff({ status: "SCHEDULED" }, "/quotations/new", { complete: async () => null, navigate: path => navigated.push(path) }), false);
  assert.deepEqual(navigated, []);
  let completed = 0;
  await handoffs.completeVisitHandoff({ status: "COMPLETED" }, "/quotations/new", { complete: async () => { completed++; }, navigate: path => navigated.push(path) });
  assert.equal(completed, 0);
  assert.deepEqual(navigated, ["/quotations/new"]);
});

test("navigation waits for successful explicit completion", async () => {
  const events = [];
  await handoffs.completeVisitHandoff({ status: "SCHEDULED", scheduled_date: "2000-01-01" }, "/quotations/new?customer=4", { complete: async () => { events.push("completed"); return { status: "COMPLETED" }; }, navigate: path => events.push(path) });
  assert.deepEqual(events, ["completed", "/quotations/new?customer=4"]);
});

test("portal scheduling keeps the approved version usable while a private edit exists", () => {
  const quotations = [{ id: 1, status: "ACCEPTED", version_number: 1 }, { id: 2, revision_of: 1, status: "DRAFT", version_number: 2 }, { id: 3, status: "ACCEPTED", version_number: 1 }, { id: 4, revision_of: 3, status: "ACCEPTED", version_number: 2 }, { id: 5, status: "ACCEPTED", version_number: 1 }];
  assert.deepEqual(handoffs.schedulableQuotations(quotations, [{ quotation: 3 }]).map(q => q.id), [1, 5]);
});

test("schedule query opens existing details, redirects expired dates and proposes only valid new quotations", () => {
  const schedule = { id: 6, quotation: 9, status: "CONFIRMED" };
  assert.deepEqual(handoffs.resolveScheduleQuery("9", [schedule], []), { kind: "schedule", schedule });
  assert.deepEqual(handoffs.resolveScheduleQuery("9", [{ ...schedule, needs_reschedule: true }], []), { kind: "reschedule", path: "/work-reschedules" });
  assert.deepEqual(handoffs.resolveScheduleQuery("10", [], [{ id: 10 }]), { kind: "proposal", quotation: "10" });
  assert.deepEqual(handoffs.resolveScheduleQuery("11", [], [{ id: 10 }]), { kind: "unavailable" });
  assert.deepEqual(handoffs.resolveScheduleQuery("", [], []), { kind: "none" });
});

test("kickoff schedule filter excludes paid, cancelled and completed work", () => {
  const rows = [{ id: 1, status: "PENDING", payment_status: "NOT_REQUESTED" }, { id: 2, status: "CONFIRMED", payment_status: "AWAITING_PAYMENT" }, { id: 3, status: "CONFIRMED", payment_status: "PENDING_CONFIRMATION" }, { id: 4, status: "CONFIRMED", payment_status: "CONFIRMED" }, { id: 5, status: "COMPLETED", payment_status: "NOT_REQUESTED" }, { id: 6, status: "CANCELLED", payment_status: "NOT_REQUESTED" }];
  assert.deepEqual(rows.filter(handoffs.needsKickoffAdvance).map(row => row.id), [1, 2, 3]);
});

test("customer deep-link prefill is visible while typed search and clearing remain explicit", () => {
  assert.equal(handoffs.quotationCustomerDisplay("", { id: 4, name: "Anita" }, 4), "Anita");
  assert.equal(handoffs.quotationCustomerDisplay("New search", { id: 4, name: "Anita" }, ""), "New search");
  assert.equal(handoffs.quotationCustomerDisplay("", undefined, ""), "");
});

test("cancelled visits never complete or navigate through a handoff", async () => {
  const events = [];
  assert.equal(await handoffs.completeVisitHandoff({ status: "CANCELLED" }, "/quotations/new", { complete: async () => events.push("complete"), navigate: path => events.push(path) }), false);
  assert.deepEqual(events, []);
});

test("schedule query resolves another quotation revision to its existing family schedule", () => {
  const quotations = [{ id: 1, status: "SCHEDULED", version_number: 1 }, { id: 2, revision_of: 1, status: "ACCEPTED", version_number: 2 }];
  const schedule = { id: 3, quotation: 1, status: "CONFIRMED" };
  assert.deepEqual(handoffs.resolveScheduleQuery("2", [schedule], [], quotations), { kind: "schedule", schedule });
});

test("receipt advances remove already paid work from kickoff payment attention", () => {
  assert.equal(handoffs.needsKickoffAdvance({ status: "CONFIRMED", payment_status: "NOT_REQUESTED", receipt_advance_total: "1200.00" }), false);
  assert.equal(handoffs.needsKickoffAdvance({ status: "IN_PROGRESS", payment_status: "PENDING_CONFIRMATION", receipt_advance_total: "0.00" }), true);
});

test("an explicit outstanding advance stays actionable after an earlier receipt", () => {
  for (const payment_status of ["AWAITING_PAYMENT", "PENDING_CONFIRMATION"]) {
    assert.equal(handoffs.needsKickoffAdvance({ status: "CONFIRMED", payment_status, receipt_advance_total: "1200.00" }), true);
  }
});
