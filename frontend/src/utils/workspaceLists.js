const recentFields = ["created_at", "timestamp", "requested_at", "requested_date", "next_follow_up", "start_date", "scheduled_date"];
const time = value => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function recentFirst(rows = [], fields = recentFields) {
  const date = row => fields.map(field => time(row[field])).find(value => value !== null) ?? 0;
  return [...rows].sort((a, b) => date(b) - date(a) || Number(b.id || 0) - Number(a.id || 0));
}

// Use local calendar dates: a work order beginning today is upcoming all day.
export function workOrderPriority(a, b, today) {
  const closed = row => ["COMPLETED", "CANCELLED", "DECLINED", "WITHDRAWN", "REJECTED", "EXPIRED"].includes(row.status);
  const upcoming = row => !closed(row) && row.required_start_date && row.required_start_date >= today;
  if (closed(a) !== closed(b)) return closed(a) ? 1 : -1;
  if (Boolean(upcoming(a)) !== Boolean(upcoming(b))) return upcoming(a) ? -1 : 1;
  if (upcoming(a) && a.required_start_date !== b.required_start_date) return a.required_start_date.localeCompare(b.required_start_date);
  return (time(b.created_at) ?? 0) - (time(a.created_at) ?? 0) || Number(b.id || 0) - Number(a.id || 0);
}

export function customerConnectionDirectory(customers, savedContacts, connections) {
  const directory = new Map([...customers, ...savedContacts].map(row => [String(row.id), { ...row }]));
  const byCustomer = new Map();
  for (const connection of recentFirst(connections)) {
    const key = connection.customer?.id ? String(connection.customer.id) : `connection-${connection.id}`;
    if (byCustomer.has(key)) continue;
    byCustomer.set(key, connection);
    const customer = connection.customer || {};
    const existing = directory.get(key);
    directory.set(key, {
      id: customer.id || `pending-${connection.id}`,
      status: "NEW",
      name: customer.name || customer.masked_customer_id || "Bharath Apps customer",
      mobile: customer.mobile || customer.masked_mobile || "",
      bharath_id: customer.bharath_id || customer.masked_customer_id || "",
      ...existing,
      connection_status: connection.status,
      connection_id: connection.id,
      requested_at: connection.requested_at,
      ...(["PENDING", "RECONNECT_PENDING"].includes(connection.status) ? { status: "PENDING", is_pending_connection: true } : {}),
    });
  }
  const connectionRows = [...directory.entries()].flatMap(([key, row]) => {
    const connection = byCustomer.get(key);
    const status = connection?.status || row.connection_status;
    if (!status || status === "NOT_CONNECTED") return [];
    return [{ ...connection, id: connection?.id || null, status, requested_at: connection?.requested_at || row.requested_at, customer: { ...connection?.customer, ...row, id: /^\d+$/.test(String(row.id)) ? row.id : undefined } }];
  });
  return { directoryRows: [...directory.values()], connectionRows };
}
