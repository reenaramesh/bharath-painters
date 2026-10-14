import test from "node:test";
import assert from "node:assert/strict";
import { contactRole, showMessageTime, messageActions } from "./chatPresentation.mjs";

test("contact role identifies the other participant", () => {
  assert.equal(contactRole("CUSTOMER", {}), "Contractor");
  assert.equal(contactRole("PAINTER", {}), "Contractor");
  assert.equal(contactRole("CONTRACTOR", { participant_type: "PAINTER" }), "Painter");
  assert.equal(contactRole("CONTRACTOR", { painter_id: 4 }), "Painter");
  assert.equal(contactRole("CONTRACTOR", { customer_id: 3 }), "Customer");
});

test("consecutive messages from one sender in the same minute share a timestamp", () => {
  const first = { is_mine: true, created_at: "2026-10-09T10:00:01Z" };
  assert.equal(showMessageTime(first, { ...first, created_at: "2026-10-09T10:00:59Z" }), false);
  assert.equal(showMessageTime(first, { ...first, is_mine: false }), true);
  assert.equal(showMessageTime(first, { ...first, created_at: "2026-10-09T10:01:00Z" }), true);
  assert.equal(showMessageTime(first), true);
});

test("message options preserve server edit permissions and hide deleted actions", () => {
  assert.deepEqual(messageActions({}), ["reply", "forward"]);
  assert.deepEqual(messageActions({ can_edit: true }), ["reply", "forward", "edit", "delete"]);
  assert.deepEqual(messageActions({ deleted_at: "2026-10-09", can_edit: true }), []);
});
