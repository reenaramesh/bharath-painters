import test from "node:test";
import assert from "node:assert/strict";
import { searchEmployees } from "./employeeSearch.js";

const employees = [
  { membership_id: 4, name: "Ravi Kumar", employee_code: "BPE-2026-0004" },
  { membership_id: 8, name: "Suresh Patil", employee_code: "BPE-2026-0008" },
];

test("employee attendance selector searches by employee name or generated ID", () => {
  assert.deepEqual(searchEmployees(employees, "ravi"), [employees[0]]);
  assert.deepEqual(searchEmployees(employees, "0008"), [employees[1]]);
  assert.deepEqual(searchEmployees(employees, "unknown"), []);
});
