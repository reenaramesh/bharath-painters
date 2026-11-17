import { SOURCE_OPTIONS } from "../../utils/opportunityOptions.js";

export function localDateTime(value) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
export function apiDateTime(value) { return value ? new Date(`${value}:00+05:30`).toISOString() : null; }
export function inputDateTime(value) {
  if (!value) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function requestError(error, fallback) {
  const data = error.response?.data;
  return data && typeof data === "object" ? Object.values(data).flat().filter(value => typeof value === "string").join(" ") || fallback : fallback;
}
export function sourceLabel(value) { return SOURCE_OPTIONS.find(([key]) => key === value)?.[1] || "Other"; }
