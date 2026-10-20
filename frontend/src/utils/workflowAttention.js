export function invoiceCollectionMatches(invoice, mode, today) {
  if (!['overdue', 'outstanding'].includes(mode)) return true;
  if (invoice.status === 'CANCELLED' || !(Number(invoice.balance_due) > 0)) return false;
  if (mode === 'outstanding') return true;
  if (typeof invoice.is_overdue === 'boolean') return invoice.is_overdue;
  const due = String(invoice.due_date || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(due) && due < today;
}

export function mergeAttentionRows(previous = [], next = []) {
  return [...new Map([...previous, ...next].map(row => [row.key ?? row.id, row])).values()];
}
