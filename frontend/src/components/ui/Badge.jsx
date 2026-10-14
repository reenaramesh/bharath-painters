import { useLanguage } from "../../i18n/LanguageContext";

const tones = {
  VERIFIED: "success",
  ACTIVE: "success",
  ACCEPTED: "success",
  APPROVED: "success",
  COMPLETED: "success",
  PAID: "success",
  CONNECTED: "success",
  PENDING: "warning",
  PART_PAID: "warning",
  CORRECTION_REQUESTED: "warning",
  DRAFT: "neutral",
  NEW: "info",
  SENT: "info",
  IN_PROGRESS: "info",
  SUBMITTED_FOR_REVIEW: "info",
  SCHEDULED: "info",
  ISSUED: "info",
  PROPOSED: "info",
  EXPIRED: "neutral",
  RELEASED: "neutral",
  REJECTED: "danger",
  DECLINED: "danger",
  CANCELLED: "danger",
  WITHDRAWN: "danger",
  BLOCKED: "danger",
  VOID: "danger",
  SUSPENDED: "danger",
  FAILED: "danger",
};

const badgeTones = ["success", "warning", "danger", "info", "neutral"];

export function Badge({ children, tone = "neutral", className = "", ...props }) {
  return (
    <span className={`bp-badge bp-badge-${tone} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, label, tone, className = "" }) {
  const { t } = useLanguage();
  const rawStatus = String(status || label || "Unknown");
  const semanticTone = String(tone || tones[rawStatus.toUpperCase()] || "neutral").toLowerCase();
  const badgeTone = badgeTones.includes(semanticTone) ? semanticTone : "neutral";
  const visibleText = String(label || rawStatus.toUpperCase());
  return (
    <Badge tone={badgeTone} className={className}>
      {label ? t(label) : t(`statuses:${rawStatus.toLowerCase()}`, { defaultValue: visibleText.replaceAll("_", " ") })}
    </Badge>
  );
}