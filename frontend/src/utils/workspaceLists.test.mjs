import test from "node:test";
import assert from "node:assert/strict";
import { customerConnectionDirectory, recentFirst, workOrderPriority } from "./workspaceLists.js";

test("connection tabs include saved pending contacts and deduplicate the directory", () => {
  const { directoryRows, connectionRows } = customerConnectionDirectory(
    [{ id: 1, name: "Connected", connection_status: "CONNECTED", status: "NEW" }],
    [{ id: 2, name: "Saved", connection_status: "PENDING", is_saved_contact: true }, { id: 3, name: "Waiting", connection_status: "RECONNECT_PENDING" }],
    [{ id: 21, status: "PENDING", customer: { id: 2, masked_mobile: "******1234" } }, { id: 22, status: "REJECTED", customer: { id: 4, masked_customer_id: "BP-C-****" } }],
  );
  assert.equal(directoryRows.length, 4);
  assert.equal(connectionRows.filter(row => row.status === "PENDING").length, 1);
  assert.equal(connectionRows.find(row => row.status === "RECONNECT_PENDING").id, null);
  assert.equal(connectionRows.find(row => row.status === "REJECTED").customer.mobile, "");
  assert.equal(directoryRows.find(row => row.id === 1).status, "NEW");
});

test("latest connection wins without treating account activation as a connection status", () => {
  const { directoryRows, connectionRows } = customerConnectionDirectory([{ id: 1, account_status: "NOT_ACTIVATED", connection_status: "CONNECTED" }], [], [
    { id: 1, status: "REJECTED", requested_at: "2026-10-01", customer: { id: 1 } },
    { id: 2, status: "CONNECTED", requested_at: "2026-10-12", customer: { id: 1 } },
  ]);
  assert.equal(directoryRows.length, 1);
  assert.equal(connectionRows[0].status, "CONNECTED");
  assert.equal(directoryRows[0].account_status, "NOT_ACTIVATED");
});

test("recent records sort newest first without mutating their source", () => {
  const rows = [{ id: 1, created_at: "2026-10-01" }, { id: 2, created_at: "2026-10-12" }, { id: 3 }];
  assert.deepEqual(recentFirst(rows).map(row => row.id), [2, 1, 3]);
  assert.deepEqual(rows.map(row => row.id), [1, 2, 3]);
});

test("upcoming work orders precede older open work and completed work", () => {
  const rows = [
    { id: 1, status: "COMPLETED", created_at: "2026-10-12" },
    { id: 2, status: "DRAFT", created_at: "2026-10-11" },
    { id: 3, status: "SCHEDULED", required_start_date: "2026-10-14" },
    { id: 4, status: "ACCEPTED", required_start_date: "2026-10-12" },
    { id: 5, status: "SENT", created_at: "2026-10-12" },
  ];
  assert.deepEqual(rows.sort((a, b) => workOrderPriority(a, b, "2026-10-12")).map(row => row.id), [4, 3, 5, 2, 1]);
});
