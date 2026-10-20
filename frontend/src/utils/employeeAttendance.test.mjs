import test from "node:test";
import assert from "node:assert/strict";
import { attendanceMonthDays, attendancePayload, localDateKey } from "./employeeAttendance.js";

test("attendance calendar handles leap years and prevents selecting future dates", () => {
  const days = attendanceMonthDays("2024-02", "2024-02-15");
  assert.equal(days.length, 29);
  assert.equal(days.filter(day => day.selectable).length, 15);
  assert.equal(attendanceMonthDays("2025-02", "2025-02-28").length, 28);
  assert.deepEqual(attendanceMonthDays("2026-13"), []);
  assert.equal(localDateKey(new Date(2026, 9, 12)), "2026-10-12");
});

test("selected attendance dates are unique while single-day payloads stay compatible", () => {
  const form = { date: "2026-10-12", status: "HALF_DAY", overtime_hours: "1.5", note: "Site work" };
  assert.deepEqual(attendancePayload(form, false, []), form);
  assert.deepEqual(attendancePayload(form, true, ["2026-10-11", "2026-10-10", "2026-10-11"]), { dates: ["2026-10-10", "2026-10-11"], status: "HALF_DAY", overtime_hours: "1.5", note: "Site work" });
  assert.throws(() => attendancePayload(form, true, []), /Select at least one/);
  assert.equal(form.date, "2026-10-12");
});
