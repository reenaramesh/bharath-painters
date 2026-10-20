const amount = value => Number(value || 0);
const isOvertimeCorrection = row => row.attendance_component === "OVERTIME"
  || String(row.reference || "").startsWith("attendance-ot-correction:");
const correctionAmount = row => row.entry_type === "DEBIT_ADJUSTMENT" ? amount(row.amount)
  : row.entry_type === "CREDIT_ADJUSTMENT" ? -amount(row.amount) : 0;

export function employeePayrollSummary(attendance = [], ledger = []) {
  const approved = attendance.filter(row => row.approval_status === "APPROVED");
  const daysWorked = approved.reduce((total, row) => total + (
    row.status === "PRESENT" ? 1 : row.status === "HALF_DAY" ? 0.5 : 0
  ), 0);
  const overtimeHours = approved.reduce((total, row) => total + amount(row.overtime_hours), 0);
  const earning = ledger.reduce((total, row) => total + (
    ["EARNING", "BONUS"].includes(row.entry_type) ? amount(row.amount) : 0
  ), 0);
  const overtimePay = ledger.reduce((total, row) => total + (
    row.entry_type === "OVERTIME" ? amount(row.amount)
      : isOvertimeCorrection(row) ? correctionAmount(row) : 0
  ), 0);
  const advanceDeduction = ledger.reduce((total, row) => total + (
    row.entry_type === "ADVANCE" ? amount(row.amount) : 0
  ), 0);
  const adjustments = ledger.reduce((total, row) => total + (
    isOvertimeCorrection(row) ? 0 : correctionAmount(row)
  ), 0);
  return {
    daysWorked,
    earning,
    overtimeHours,
    overtimePay,
    advanceDeduction,
    adjustments,
    totalEarning: earning + overtimePay + adjustments - advanceDeduction,
  };
}
