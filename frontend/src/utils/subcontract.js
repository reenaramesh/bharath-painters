// Shared helpers for the multi-trade subcontract module.
// The API is the only authority on what a user may do, so the backend sends
// `viewer_authority` and `allowed_transitions` with every work order and this
// file just renders whatever it is told. Never duplicate a rule here.

export const rupees = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const prettyDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const prettyTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

// Pulls the first readable message out of a DRF error body so forms can show
// field errors instead of "Request failed with status code 400".
export function apiErrorMessage(err, fallback = "Something went wrong.") {
  const data = err?.response?.data;
  if (!data) return err?.message || fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  for (const value of Object.values(data)) {
    const text = Array.isArray(value) ? value[0] : value;
    if (typeof text === "string" && text.trim()) return text;
  }
  return fallback;
}

export const isApiError = (err, status) => err?.response?.status === status;

// Terminal states never show an action bar, which stops the UI offering a
// button that the workflow would reject anyway.
export const CLOSED_STATES = ["COMPLETED", "CANCELLED", "WITHDRAWN", "DECLINED"];

export const isClosed = (status) => CLOSED_STATES.includes(status);

// Connections are directional but always rendered from the viewer's side, so
// the backend tells us which end we are looking at instead of guessing by name.
export function connectionCounterparty(row) {
  const mine = row?.viewer_authority === "REQUESTER";
  const id = mine ? row.recipient : row.requester;
  const company = mine ? row.recipient_company : row.requester_company;
  const person = mine ? row.recipient_name : row.requester_name;
  const label = [company, person].filter(Boolean).join(" · ") || "Contractor";
  return { id, label, isRequester: mine };
}

// Labels for the statuses the workflow can move a work order into. Only the
// targets listed in `allowed_transitions` are ever rendered.
export const TRANSITION_LABELS = {
  SENT: "Send to contractor",
  ACCEPTED: "Accept this work",
  DECLINED: "Decline this work",
  WITHDRAWN: "Withdraw offer",
  SCHEDULED: "Mark scheduled",
  IN_PROGRESS: "Start work",
  SUBMITTED_FOR_REVIEW: "Submit for review",
  COMPLETED: "Approve as complete",
  CANCELLED: "Cancel work order",
  DRAFT: "Reopen as draft",
};

export const DESTRUCTIVE_TRANSITIONS = ["CANCELLED", "WITHDRAWN", "DECLINED"];

// Statuses where a note carries meaning rather than just an audit trail entry.
export const NOTE_REQUIRED_TRANSITIONS = ["SUBMITTED_FOR_REVIEW", "CORRECTION_REQUESTED"];

export const PAYMENT_MODES = [
  ["UPI", "UPI"],
  ["BANK_TRANSFER", "Bank transfer"],
  ["CASH", "Cash"],
  ["CHEQUE", "Cheque"],
  ["CARD", "Card"],
  ["OTHER", "Other"],
];

export const WAGE_TYPES = [
  ["DAILY", "Daily wage"],
  ["WEEKLY", "Weekly wage"],
  ["MONTHLY", "Monthly salary"],
  ["PIECE", "Piece rate"],
];

export const isDestructive = (status) => DESTRUCTIVE_TRANSITIONS.includes(status);
export const needsNote = (status) => NOTE_REQUIRED_TRANSITIONS.includes(status);