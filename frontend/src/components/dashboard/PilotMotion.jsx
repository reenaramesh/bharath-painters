import { useEffect, useRef } from "react";

const integer = value => Math.round(value).toLocaleString("en-IN");

/** Animate only the visual copy; assistive technology always gets the final value. */
export function AnimatedValue({ value, format = integer }) {
  const visual = useRef(null);
  const formatted = format(value);
  useEffect(() => {
    if (!visual.current) return undefined;
    visual.current.textContent = formatted;
    if (!Number.isFinite(value)) return undefined;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches || document.visibilityState !== "visible") return undefined;
    let frame;
    let start;
    const finish = () => {
      window.cancelAnimationFrame(frame);
      if (visual.current) visual.current.textContent = formatted;
    };
    const tick = time => {
      start ??= time;
      const progress = Math.min(1, (time - start) / 480);
      if (visual.current) visual.current.textContent = format(value * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    preference.addEventListener("change", finish);
    return () => { window.cancelAnimationFrame(frame); preference.removeEventListener("change", finish); };
  }, [value, format, formatted]);
  return <><span ref={visual} aria-hidden="true">{formatted}</span><span className="sr-only">{formatted}</span></>;
}

export function DashboardSkeleton() {
  return <div className="pilot-dashboard-skeleton" role="status" aria-label="Loading contractor dashboard">
    <span className="sr-only">Loading your workspace…</span>
    <div className="pilot-skeleton-hero" aria-hidden="true"><i /><i /><i /></div>
    <div className="pilot-skeleton-metrics" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index}><i /><i /><i /></div>)}</div>
    <div className="pilot-skeleton-panels" aria-hidden="true"><div /><div /></div>
  </div>;
}
