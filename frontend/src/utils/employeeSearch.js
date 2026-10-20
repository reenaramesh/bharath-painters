export function searchEmployees(employees = [], query = "") {
  const normalized = String(query).trim().toLocaleLowerCase();
  if (!normalized) return employees;
  return employees.filter(employee => [employee.name, employee.employee_code]
    .some(value => String(value || "").toLocaleLowerCase().includes(normalized)));
}
