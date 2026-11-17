import { ArrowRight, CalendarClock, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../ui";
import { stageLabel } from "../../utils/opportunityOptions";
import "./lead-workspace.css";
import { localDateTime } from "./lead-format";

export function LeadStage({ item }) {
  const stage = item.workflow_stage || item.stage;
  const label = item.is_closed && stage === "COMPLETED" ? "Closed · Settled" : stage === "WON" ? "Accepted" : stage === "COMPLETED" ? "Work completed" : stageLabel(stage);
  return <StatusBadge status={stage} label={label} tone={item.is_closed ? "neutral" : ["WON", "COMPLETED"].includes(stage) ? "success" : stage === "NEGOTIATION" ? "warning" : "brand"} />;
}
export function LeadAction({ item, className = "" }) {
  return <Link className={`lead-primary-action ${className}`} to={item.next_action?.url || `/opportunities/${item.id}`}>{item.next_action?.label || "Open lead"}<ArrowRight size={15} aria-hidden="true" /></Link>;
}
export function LeadContact({ item }) {
  return <a className="lead-call" href={`tel:${item.customer_mobile}`} aria-label={`Call ${item.customer_name}`}><Phone size={16} aria-hidden="true" /></a>;
}
export function LeadDue({ item }) {
  return <span className={`lead-due ${item.queue_flags?.overdue ? "is-overdue" : ""}`}><CalendarClock size={14} aria-hidden="true" />{item.queue_flags?.overdue ? "Overdue · " : ""}{localDateTime(item.next_action?.due_at)}</span>;
}
