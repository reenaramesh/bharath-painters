import test from "node:test";
import assert from "node:assert/strict";
import { employeePayrollSummary } from "./employeePayrollSummary.js";

test("monthly employee payroll summarizes approved days, overtime, advances and adjustments", () => {
  const summary = employeePayrollSummary(
    [
      { status: "PRESENT", approval_status: "APPROVED", overtime_hours: "2" },
      { status: "HALF_DAY", approval_status: "APPROVED", overtime_hours: "1.5" },
      { status: "PRESENT", approval_status: "PENDING", overtime_hours: "8" },
    ],
    [
      { entry_type: "EARNING", amount: "2250.00" },
      { entry_type: "BONUS", amount: "100.00" },
      { entry_type: "ADVANCE", amount: "300.00" },
      { entry_type: "DEBIT_ADJUSTMENT", amount: "100.00" },
      { entry_type: "CREDIT_ADJUSTMENT", amount: "40.00" },
      { entry_type: "PAYMENT", amount: "500.00" },
    ],
  );

  assert.deepEqual(summary, {
    daysWorked: 1.5,
    earning: 2350,
    overtimeHours: 3.5,
    overtimePay: 0,
    advanceDeduction: 300,
    adjustments: 60,
    totalEarning: 2110,
  });
});

test("monthly employee payroll shows zero amounts when no records exist", () => {
  assert.deepEqual(employeePayrollSummary([], []), {
    daysWorked: 0,
    earning: 0,
    overtimeHours: 0,
    overtimePay: 0,
    advanceDeduction: 0,
    adjustments: 0,
    totalEarning: 0,
  });
});

test("posted overtime is included once with net corrections and payments remain separate", () => {
  const summary = employeePayrollSummary(
    [{ status: "PRESENT", approval_status: "APPROVED", overtime_hours: "4" }],
    [
      { entry_type: "EARNING", amount: "800" },
      { entry_type: "BONUS", amount: "100" },
      { entry_type: "OVERTIME", amount: "400" },
      { entry_type: "CREDIT_ADJUSTMENT", amount: "400", attendance_component: "OVERTIME" },
      { entry_type: "DEBIT_ADJUSTMENT", amount: "200", attendance_component: "OVERTIME" },
      { entry_type: "CREDIT_ADJUSTMENT", amount: "100", attendance_component: "BASE" },
      { entry_type: "ADVANCE", amount: "50" },
      { entry_type: "PAYMENT", amount: "600" },
    ],
  );
  assert.equal(summary.earning, 900);
  assert.equal(summary.overtimeHours, 4);
  assert.equal(summary.overtimePay, 200);
  assert.equal(summary.adjustments, -100);
  assert.equal(summary.totalEarning, 950);
});

test("OT corrections reduce displayed OT pay without changing base adjustments", () => {
  for (const correction of [
    { attendance_component: "OVERTIME" },
    { reference: "attendance-ot-correction:42:2" },
  ]) {
    const summary = employeePayrollSummary([], [
      { entry_type: "EARNING", amount: "500" },
      { entry_type: "OVERTIME", amount: "400" },
      { entry_type: "CREDIT_ADJUSTMENT", amount: "200", ...correction },
    ]);
    assert.equal(summary.overtimePay, 200);
    assert.equal(summary.adjustments, 0);
    assert.equal(summary.totalEarning, 700);
  }
});
