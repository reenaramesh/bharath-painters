import { continueMeasurementPath } from "./measurementRecords.js";

const validId = value => /^[1-9]\d*$/.test(String(value ?? ""));
const familyId = quotation => String(quotation.revision_of || quotation.id);

export function visitCompletionRequest(visit) {
  return visit.followup_id
    ? { url: `/quotations/tasks/${visit.followup_id}/`, payload: { is_completed: true } }
    : { url: `/quotations/site-visits/${visit.id}/`, payload: { status: "COMPLETED" } };
}

export function visitQuotationPath(visit) {
  if (!validId(visit.customer)) return null;
  const params = new URLSearchParams({ customer: String(visit.customer) });
  if (validId(visit.property)) params.set("property", String(visit.property));
  if (validId(visit.opportunity)) params.set("lead", String(visit.opportunity));
  return `/quotations/new?${params}`;
}

export function visitMeasurementPath(visit, records, contractorId) {
  return validId(visit.property) ? continueMeasurementPath(visit.property, records, contractorId) : null;
}

// Completion is explicitly supplied by the click handler; dates never complete a visit.
export async function completeVisitHandoff(visit, destination, { complete, navigate }) {
  if (!destination || visit.status === "CANCELLED") return false;
  if (visit.status !== "COMPLETED" && !await complete(visit)) return false;
  navigate(destination);
  return true;
}

export function schedulableQuotations(quotations, schedules, { contractorAuthorized = false } = {}) {
  const byId = new Map(quotations.map(quotation => [String(quotation.id), quotation]));
  const scheduledFamilies = new Set(schedules.map(schedule => {
    const quotation = byId.get(String(schedule.quotation));
    return quotation ? familyId(quotation) : String(schedule.quotation);
  }));
  const latest = new Map();
  for (const quotation of quotations) {
    if (!contractorAuthorized && quotation.status === "DRAFT") continue;
    const family = familyId(quotation);
    const current = latest.get(family);
    if (!current || Number(quotation.version_number || 1) > Number(current.version_number || 1)) latest.set(family, quotation);
  }
  const eligible = contractorAuthorized ? ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "SCHEDULED", "CONVERTED"] : ["ACCEPTED"];
  return quotations.filter(quotation => eligible.includes(quotation.status)
    && latest.get(familyId(quotation)) === quotation && !scheduledFamilies.has(familyId(quotation)));
}

export function resolveScheduleQuery(quotationId, schedules, schedulable, quotations = []) {
  if (!quotationId) return { kind: "none" };
  const byId = new Map(quotations.map(quotation => [String(quotation.id), quotation]));
  const requested = byId.get(String(quotationId));
  const schedule = schedules.find(item => String(item.quotation) === String(quotationId))
    || (requested && schedules.find(item => {
      const quotation = byId.get(String(item.quotation));
      return quotation && familyId(quotation) === familyId(requested);
    }));
  if (schedule?.needs_reschedule) return { kind: "reschedule", path: "/work-reschedules" };
  if (schedule) return { kind: "schedule", schedule };
  if (schedulable.some(quotation => String(quotation.id) === String(quotationId))) return { kind: "proposal", quotation: String(quotationId) };
  return { kind: "unavailable" };
}

export function needsKickoffAdvance(schedule) {
  return ["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(schedule.status)
    && !(schedule.payment_status === "NOT_REQUESTED" && Number(schedule.receipt_advance_total || 0) > 0)
    && ["NOT_REQUESTED", "AWAITING_PAYMENT", "PENDING_CONFIRMATION"].includes(schedule.payment_status);
}

export function quotationCustomerDisplay(search, selectedCustomer, selectedId) {
  return selectedId && selectedCustomer ? selectedCustomer.name || search : search;
}
