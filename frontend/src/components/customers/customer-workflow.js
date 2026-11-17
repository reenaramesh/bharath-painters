export function customerCanWork(customer) {
  if (!customer || customer.is_saved_contact || customer.is_pending_connection || customer.account_status === "DISABLED" || customer.status === "CANCELLED") return false;
  return !customer.connection_status || customer.connection_status === "CONNECTED";
}

export function customerWhatsApp(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}` : "";
}

export function pendingCustomerFollowups(rows = []) {
  return rows.filter(row => !row.is_completed && row.next_follow_up && Number.isFinite(Date.parse(row.next_follow_up)))
    .sort((left, right) => Date.parse(left.next_follow_up) - Date.parse(right.next_follow_up));
}

export function initialGeneralFollowup() {
  return { follow_up_type: "CALL", comment: "", next_choice: "", next_follow_up: "", edited: false, submission: null };
}
