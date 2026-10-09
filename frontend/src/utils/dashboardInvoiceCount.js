export function dashboardWithInvoiceCount(dashboard, register) {
  const count = Array.isArray(register) ? register.length
    : Number.isInteger(register?.count) && register.count >= 0 ? register.count
    : Array.isArray(register?.results) ? register.results.length : null;
  return {
    ...dashboard,
    counts: { ...dashboard.counts, invoices: count ?? dashboard.counts?.invoices ?? null },
  };
}
