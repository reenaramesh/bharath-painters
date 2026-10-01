// ============================================================================
// BHARATH APPS — PREVIEW shared components
// ----------------------------------------------------------------------------
// Built on the existing design system in src/index.css (.bp-page-header,
// .bp-eyebrow, .bp-section-card, .bp-stat-card, .bp-badge, .bp-button,
// .bp-state) plus lucide-react, matching the conventions of the real pages.
// ============================================================================

import {
  AlertTriangle,
  BadgeCheck,
  Boxes,
  Droplet,
  Grid3x3,
  Hammer,
  Info,
  Layers,
  Lock,
  Paintbrush,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { SIMULATED_LABEL } from "./data";

// Catalogue stores an icon KEY. This map resolves it to a component, so an
// admin can pick from a fixed set without shipping code.
export const ICON_MAP = {
  paintbrush: Paintbrush,
  droplet: Droplet,
  zap: Zap,
  hammer: Hammer,
  layers: Layers,
  sparkles: Sparkles,
  "shield-check": ShieldCheck,
  grid: Grid3x3,
  boxes: Boxes,
};

export function CategoryIcon({ name, size = 16, className = "" }) {
  const Icon = ICON_MAP[name] ?? Sparkles;
  return <Icon size={size} className={className} />;
}

export const money = (n) =>
  `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// --- banners ---------------------------------------------------------------

/** The persistent "this is not real" banner. */
export function PreviewBanner({ compact = false }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
      <AlertTriangle size={15} className="shrink-0" />
      <p className={`${compact ? "text-[0.7rem]" : "text-xs"} font-semibold`}>
        PREVIEW ONLY — fictional data. Nothing is saved, sent, booked or charged.
      </p>
      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-amber-800">
        No API calls
      </span>
    </div>
  );
}

/** Marks an individual value or record as simulated. */
export function SimulatedTag({ children = SIMULATED_LABEL, tone = "warning" }) {
  return <span className={`bp-badge bp-badge-${tone}`}>{children}</span>;
}

/** Explains why a control is unavailable instead of rendering a dead button. */
export function UnsupportedNote({ children }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-[0.72rem] leading-relaxed text-[#667085]">
      <Info size={13} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function DeniedPanel({ title = "Not shared", children }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-[#d0d5dd] bg-[#f9fafb] px-3 py-3">
      <Lock size={15} className="mt-0.5 shrink-0 text-[#98a2b3]" />
      <div className="min-w-0">
        <p className="text-xs font-bold text-[#475467]">{title}</p>
        <div className="mt-1 text-[0.72rem] leading-relaxed text-[#667085]">{children}</div>
      </div>
    </div>
  );
}

// --- page furniture --------------------------------------------------------

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

export function SectionCard({ title, description, action, children, className = "", dense = false }) {
  return (
    <section className={`bp-section-card ${className}`}>
      {(title || action) && (
        <header>
          <div className="min-w-0">
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={dense ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, tone = "brand", icon: Icon }) {
  return (
    <article className="bp-stat-card">
      {Icon && <span className={`bp-stat-icon bp-stat-${tone}`}><Icon size={18} /></span>}
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {hint && <small>{hint}</small>}
      </div>
    </article>
  );
}

export function StatGrid({ children, cols = "sm:grid-cols-2 xl:grid-cols-4" }) {
  return <div className={`grid grid-cols-1 gap-3 ${cols}`}>{children}</div>;
}

export function StatusBadge({ status, label }) {
  const meta = {
    CONNECTED: ["success", "Connected"],
    REQUESTED: ["info", "Request sent"],
    PENDING: ["warning", "Pending"],
    REJECTED: ["danger", "Rejected"],
    CANCELLED: ["danger", "Cancelled"],
    ACCEPTED: ["success", "Accepted"],
    ACTIVE: ["success", "Active"],
    INACTIVE: ["neutral", "Inactive"],
    TRUE: ["success", "Yes"],
    FALSE: ["neutral", "No"],
    ALLOW: ["success", "Allowed"],
    DENY: ["danger", "Denied"],
    OWN_ONLY: ["info", "Own records only"],
    ASSIGNED_ONLY: ["info", "Assigned only"],
    PRIVATE_TO_OWNER: ["neutral", "Private to owner"],
    NOT_INVITED: ["neutral", "Not invited"],
    INVITATION_PENDING: ["warning", "Invitation pending"],
    VERIFIED: ["success", "Verified"],
  }[status] ?? ["neutral", status];

  return <span className={`bp-badge bp-badge-${meta[0]}`}>{label ?? meta[1]}</span>;
}

export function WorkStatusBadge({ status, label }) {
  const tones = {
    neutral: "neutral", info: "info", warning: "warning",
    success: "success", danger: "danger",
  };
  const pretty = String(status)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
  return <span className={`bp-badge bp-badge-${tones[label] ?? "neutral"}`}>{label ?? pretty}</span>;
}

// --- form controls ---------------------------------------------------------

const fieldCls =
  "w-full rounded-lg border border-[#d9deea] bg-white px-3 py-2 text-sm outline-none focus:border-[#6366f1] focus:shadow-[0_0_0_4px_rgb(99_102_241/0.11)]";

export function Field({ label, hint, children, required = false }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.72rem] font-bold uppercase tracking-wide text-[#475467]">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[0.68rem] leading-snug text-[#98a2b3]">{hint}</span>}
    </label>
  );
}

export function Input(props) {
  return <input {...props} className={`${fieldCls} ${props.className ?? ""}`} />;
}

export function Textarea(props) {
  return <textarea {...props} className={`${fieldCls} ${props.className ?? ""}`} />;
}

export function Select({ options, ...props }) {
  return (
    <select {...props} className={`${fieldCls} ${props.className ?? ""}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Button({ variant = "primary", className = "", ...props }) {
  const v = variant === "secondary" ? "bp-button-secondary" : "bp-button-primary";
  return (
    <button
      type="button"
      {...props}
      className={`bp-button ${v} disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    />
  );
}

export function Checkbox({ checked, onChange, label, hint, disabled = false }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition ${
        checked
          ? "border-[#176b9b] bg-[#f2f7fb]"
          : "border-[#e5e9f2] bg-white hover:border-[#c7d0de]"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#176b9b]"
      />
      <span className="min-w-0">
        <span className="block text-[0.8rem] font-semibold leading-snug text-[#172033]">{label}</span>
        {hint && <span className="mt-0.5 block text-[0.68rem] leading-snug text-[#667085]">{hint}</span>}
      </span>
    </label>
  );
}

export function Pill({ children, tone = "neutral", className = "" }) {
  return <span className={`bp-badge bp-badge-${tone} ${className}`}>{children}</span>;
}

// --- misc ------------------------------------------------------------------

export function Avatar({ initials, tone = "brand" }) {
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[0.72rem] font-extrabold text-white ${
        tone === "brand" ? "bg-[#176b9b]" : tone === "accent" ? "bg-[#7c3aed]" : "bg-[#475467]"
      }`}
    >
      {initials}
    </span>
  );
}

export function KeyValue({ label, value, mono = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.66rem] font-bold uppercase tracking-wide text-[#98a2b3]">{label}</dt>
      <dd className={`mt-0.5 truncate text-[0.82rem] font-semibold text-[#172033] ${mono ? "font-mono" : ""}`}>
        {value ?? "—"}
      </dd>
    </div>
  );
}

export function EmptyState({ title, description }) {
  return (
    <div className="bp-state">
      <Boxes size={32} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function VerifiedTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-700">
      <BadgeCheck size={12} /> Verified
    </span>
  );
}