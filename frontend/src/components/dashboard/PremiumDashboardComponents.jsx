import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { EmptyState, SectionCard } from "../ui";
import paintingIcon from "../../assets/services/painting.webp";
import plumbingIcon from "../../assets/services/plumbing.webp";
import electricalIcon from "../../assets/services/electrical.webp";
import carpentryIcon from "../../assets/services/carpentry.webp";
import cleaningIcon from "../../assets/services/cleaning.webp";
import waterproofingIcon from "../../assets/services/waterproofing.webp";
import falseCeilingIcon from "../../assets/services/false-ceiling.webp";

const serviceIllustrations = [
  { label: "Painting", image: paintingIcon },
  { label: "Plumbing", image: plumbingIcon },
  { label: "Electrical", image: electricalIcon },
  { label: "Carpentry", image: carpentryIcon },
  { label: "Cleaning", image: cleaningIcon },
  { label: "Waterproofing", image: waterproofingIcon },
  { label: "False ceiling", image: falseCeilingIcon },
];

export function PremiumServiceDirectory({ to = "/master-services" }) {
  return (
    <section className="premium-service-directory" aria-labelledby="premium-service-directory-title">
      <div className="premium-service-directory__heading">
        <div>
          <p className="premium-dashboard-section-kicker">Built for service teams</p>
          <h2 id="premium-service-directory-title">Service categories</h2>
        </div>
        <Link className="contractor-panel-link" to={to}>Manage catalogue <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
      <ul className="premium-service-directory__list">
        {serviceIllustrations.map(({ label, image }) => (
          <li key={label} data-service-icon>
            <span className="premium-service-directory__image"><img src={image} alt="" loading="lazy" width="1024" height="1024" /></span>
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PremiumDashboardIcon({ icon: Icon, tone = "blue", className = "" }) {
  return (
    <span className={`premium-dashboard-icon premium-dashboard-icon--${tone} ${className}`.trim()} aria-hidden="true">
      <Icon strokeWidth={2.2} />
    </span>
  );
}

export function PremiumDashboardMetric({ icon: Icon, label, value, hint, to, tone = "blue" }) {
  const content = (
    <>
      <span className="premium-dashboard-metric__top">
        <span className="premium-dashboard-metric__label">{label}</span>
        <PremiumDashboardIcon icon={Icon} tone={tone} />
      </span>
      <strong className="premium-dashboard-metric__value">{value ?? 0}</strong>
      {hint && <span className="premium-dashboard-metric__hint">{hint}</span>}
    </>
  );

  if (!to) return <article className="premium-dashboard-metric">{content}</article>;

  return (
    <Link className="premium-dashboard-metric premium-dashboard-metric--link" to={to}>
      {content}
      <span className="premium-dashboard-metric__arrow"><ArrowRight size={15} /></span>
    </Link>
  );
}

export function PremiumDashboardPanel({ title, action, children, className = "", bodyClassName = "" }) {
  return (
    <SectionCard
      title={title}
      action={action}
      className={`contractor-dashboard__panel ${className}`.trim()}
      bodyClassName={`contractor-dashboard__panel-body ${bodyClassName}`.trim()}
    >
      {children}
    </SectionCard>
  );
}

export function PremiumDashboardEmpty({ title, description }) {
  return <EmptyState title={title} description={description} className="premium-dashboard-empty" />;
}

export function PremiumDashboardProgress({ value, label }) {
  const progress = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div
      className="premium-dashboard-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
    >
      <span style={{ width: `${progress}%` }} />
    </div>
  );
}
