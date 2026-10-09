const editableFields = [
  "invoice_date", "due_date", "status", "customer_name", "customer_mobile", "billing_address",
  "property_name", "notes", "terms_conditions", "discount", "gst_percentage",
  "base_items", "measurement_adjustments",
];

// Payments use their own ledger endpoints; invoice-detail saves must not replay
// aggregate paid amounts or obsolete summary payment fields.
export function invoiceSavePayload(invoice) {
  return Object.fromEntries(editableFields.filter((field) => field in invoice).map((field) => [field, invoice[field]]));
}
