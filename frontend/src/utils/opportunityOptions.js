// Shared option/config constants for the Sales Opportunities module.

export const OPPORTUNITY_STAGES = [
  "NEW",
  "CONTACTED",
  "FOLLOW_UP",
  "SITE_VISIT",
  "MEASUREMENT",
  "QUOTATION",
  "NEGOTIATION",
  "WON",
  "LOST",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

export const STAGE_STYLES = {
  NEW: "bg-blue-50 text-blue-700",
  CONTACTED: "bg-indigo-50 text-indigo-700",
  FOLLOW_UP: "bg-amber-50 text-amber-700",
  SITE_VISIT: "bg-purple-50 text-purple-700",
  MEASUREMENT: "bg-fuchsia-50 text-fuchsia-700",
  QUOTATION: "bg-cyan-50 text-cyan-700",
  NEGOTIATION: "bg-orange-50 text-orange-700",
  WON: "bg-emerald-50 text-emerald-700",
  LOST: "bg-red-50 text-red-700",
  IN_PROGRESS: "bg-violet-50 text-violet-700",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-slate-100 text-slate-600",
};

export const SOURCE_OPTIONS = [
  ["GOOGLE_SEARCH", "Google Search"],
  ["GOOGLE_PROFILE", "Google Business Profile"],
  ["GOOGLE_ADS", "Google Ads"],
  ["WEBSITE", "Website"],
  ["WHATSAPP", "WhatsApp"],
  ["PHONE", "Phone Call"],
  ["FACEBOOK", "Facebook"],
  ["INSTAGRAM", "Instagram"],
  ["REFERRAL", "Referral"],
  ["EXISTING_CUSTOMER", "Existing Customer"],
  ["WALK_IN", "Walk-in"],
  ["OTHER", "Other"],
];

export const PRIORITY_OPTIONS = [
  ["LOW", "Low"],
  ["MEDIUM", "Medium"],
  ["HIGH", "High"],
];

export const CLIENT_TYPE_OPTIONS = [
  ["HOMEOWNER", "Homeowner"],
  ["TENANT", "Tenant"],
  ["COMPANY", "Company"],
  ["PROPERTY_MANAGER", "Property Manager"],
  ["INTERIOR_DESIGNER", "Interior Designer"],
  ["ARCHITECT", "Architect"],
  ["BUILDER", "Builder"],
  ["REAL_ESTATE_AGENT", "Real Estate Agent"],
  ["OTHER", "Other"],
];

export const LOST_REASON_OPTIONS = [
  ["PRICE", "Price Too High"],
  ["COMPETITOR", "Competitor Selected"],
  ["POSTPONED", "Customer Postponed"],
  ["NO_RESPONSE", "No Response"],
  ["BUDGET", "Budget Issue"],
  ["SERVICE_UNAVAILABLE", "Service Not Available"],
  ["DUPLICATE", "Duplicate Enquiry"],
  ["INVALID", "Invalid Enquiry"],
  ["OTHER", "Other"],
];

export const FOLLOW_UP_OUTCOMES = [
  ["INTERESTED", "Interested"],
  ["CALL_LATER", "Call Later"],
  ["WAITING_DECISION", "Waiting for Decision"],
  ["REVISED_QUOTE", "Need Revised Quote"],
  ["NEGOTIATION", "Price Negotiation"],
  ["SITE_VISIT_REQUIRED", "Site Visit Required"],
  ["NOT_INTERESTED", "Not Interested"],
  ["COMPETITOR", "Competitor Selected"],
  ["NO_RESPONSE", "No Response"],
  ["WON", "Won"],
  ["LOST", "Lost"],
];

export function stageLabel(value) {
  if (value === "MEASUREMENT") return "Area Calculation";
  return String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}
