import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";
import { useId } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { ScriptKnownText } from '../i18n/ScriptText';

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="bp-page-header">
      <div className="min-w-0">
        {eyebrow && <p className="bp-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="bp-page-description">{description}</p>}
      </div>
      {actions && <div className="bp-page-actions">{actions}</div>}
    </header>
  );
}
export const AppPageHeader = PageHeader;

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
export function StatusBadge({ status, label, tone, className = "" }) {
  const { t } = useLanguage();
  const rawStatus = String(status || label || "Unknown");
  const semanticTone = String(tone || tones[rawStatus.toUpperCase()] || "neutral").toLowerCase();
  const badgeTone = badgeTones.includes(semanticTone) ? semanticTone : "neutral";
  const visibleText = String(label || rawStatus.toUpperCase());
  return (
    <span
      className={`bp-badge bp-badge-${badgeTone} ${className}`.trim()}
    >
      {label ? t(label) : t(`statuses:${rawStatus.toLowerCase()}`, { defaultValue: visibleText.replaceAll("_", " ") })}
    </span>
  );
}
export function Button({
  children,
  variant = "primary",
  type = "button",
  loading = false,
  disabled = false,
  className = "",
  ...props
}) {
  const variants = {
    primary: "bp-button-primary",
    secondary: "bp-button-secondary",
    quiet: "bp-button-quiet",
    danger: "bp-button-danger",
  };
  const variantClass = variants[variant] || variants.primary;
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`bp-button ${variantClass} ${className}`.trim()}
    >
      {loading && <LoaderCircle className="bp-button-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function CompactCard({ as: Component = "article", className = "", ...props }) {
  return <Component {...props} className={`bp-card ${className}`.trim()} />;
}

export function FormField({
  id,
  label,
  as: Control = "input",
  required = false,
  helpText,
  error,
  className = "",
  controlClassName = "",
  children,
  ...controlProps
}) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const helpId = helpText ? `${controlId}-help` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [controlProps["aria-describedby"], helpId, errorId]
    .filter(Boolean)
    .join(" ") || undefined;
  const invalid = error ? true : controlProps["aria-invalid"];
  const props = {
    ...controlProps,
    id: controlId,
    required,
    "aria-invalid": invalid,
    "aria-describedby": describedBy,
    className: `bp-control ${error ? "bp-control-invalid" : ""} ${controlClassName}`.trim(),
  };
  const control = Control === "input"
    ? <input {...props} />
    : <Control {...props}>{children}</Control>;

  return (
    <div className={`bp-field ${className}`.trim()}>
      <label className="bp-field-label" htmlFor={controlId}>
        {label}
        {required && <span className="bp-required" aria-hidden="true">*</span>}
      </label>
      {control}
      {helpText && <p id={helpId} className="bp-field-help">{helpText}</p>}
      {error && <p id={errorId} className="bp-field-error" role="alert">{error}</p>}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, hint, tone = "brand", className = "" }) {
  return (
    <article className={`bp-stat-card ${className}`.trim()}>
      <span className={`bp-stat-icon bp-stat-${tone}`} aria-hidden={Icon ? "true" : undefined}>{Icon && <Icon />}</span>
      <div>
        <p>{label}</p>
        <strong>{value ?? 0}</strong>
        {hint && <small>{hint}</small>}
      </div>
    </article>
  );
}
export function LoadingState({ label, className = "" }) {
  return (
    <div className={`bp-state ${className}`.trim()} role="status" aria-live="polite">
      <LoaderCircle className="bp-state-loader animate-spin" aria-hidden="true" />
      <p>{label || "Loading data..."}</p>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  className = "",
}) {
  return (
    <div className={`bp-state ${className}`.trim()} role="status">
      <Inbox aria-hidden="true" />
      <strong>{title || "Nothing here yet"}</strong>
      <p>{description || "New records will appear here."}</p>
    </div>
  );
}
export function ErrorState({ message, onRetry, className = "" }) {
  const { t } = useLanguage();
  return (
    <div className={`bp-state bp-state-error ${className}`.trim()} role="alert">
      <AlertCircle aria-hidden="true" />
      <strong>{t("Unable to load")}</strong>
      <p>{message ? <ScriptKnownText source={message} /> : "Something went wrong."}</p>
      {onRetry && (
        <Button type="button" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function Avatar({ name = "User", src, size = "md" }) {
  return src ? (
    <img src={src} alt="" className={`bp-avatar bp-avatar-${size}`} />
  ) : (
    <span className={`bp-avatar bp-avatar-${size}`}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
export function SectionCard({
  title,
  description,
  action,
  children,
  className = "",
  bodyClassName = "",
}) {
  return (
    <section className={`bp-section-card ${className}`}>
      <header>
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      <div className={`bp-section-card-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </section>
  );
}
