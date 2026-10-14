export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function attendanceMonthDays(month, maxDate = localDateKey()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const [year, number] = month.split("-").map(Number);
  return Array.from({ length: new Date(year, number, 0).getDate() }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    return { date, day: index + 1, selectable: date <= maxDate };
  });
}

export function attendancePayload(form, multiple, selectedDates) {
  if (!multiple) return { ...form };
  if (!selectedDates.length) throw new Error("Select at least one attendance day.");
  const { date: _date, ...values } = form;
  return { ...values, dates: [...new Set(selectedDates)].sort() };
}
