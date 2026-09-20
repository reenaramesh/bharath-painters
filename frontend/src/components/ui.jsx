import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";

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

const tones = {
  VERIFIED: "success",
  ACTIVE: "success",
  ACCEPTED: "success",
  COMPLETED: "success",
  PAID: "success",
  PENDING: "warning",
  DRAFT: "neutral",
  NEW: "info",
  SENT: "info",
  IN_PROGRESS: "info",
  REJECTED: "danger",
  CANCELLED: "danger",
  SUSPENDED: "danger",
  FAILED: "danger",
};
export function StatusBadge({ status, className = "" }) {
  const value = String(status || "Unknown").toUpperCase();
  return (
    <span
      className={`bp-badge bp-badge-${tones[value] || "neutral"} ${className}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function StatCard({ icon: Icon, label, value, hint, tone = "brand" }) {
  return (
    <article className="bp-stat-card">
      <span className={`bp-stat-icon bp-stat-${tone}`}>{Icon && <Icon />}</span>
      <div>
        <p>{label}</p>
        <strong>{value ?? 0}</strong>
        {hint && <small>{hint}</small>}
      </div>
    </article>
  );
}
export function LoadingState({ label = "Loading data..." }) {
  return (
    <div className="bp-state">
      <LoaderCircle className="animate-spin" />
      <p>{label}</p>
    </div>
  );
}
export function EmptyState({
  title = "Nothing here yet",
  description = "New records will appear here.",
}) {
  return (
    <div className="bp-state">
      <Inbox />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
export function ErrorState({ message = "Something went wrong.", onRetry }) {
  return (
    <div className="bp-state bp-state-error">
      <AlertCircle />
      <strong>Unable to load</strong>
      <p>{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="bp-button bp-button-secondary">
          Try again
        </button>
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
      {children}
    </section>
  );
}
