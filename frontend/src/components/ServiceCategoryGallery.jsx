import { useId } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import ServiceIllustration from "./ServiceIllustration";
import "./service-category-gallery.css";

import { SERVICE_CATEGORIES } from "./serviceCategories.js";

export default function ServiceCategoryGallery({ onSelect, selectedService, onReset }) {
  const { t } = useLanguage();
  const headingId = useId();
  return <section className="bp-service-gallery" aria-labelledby={headingId}>
    <header className="bp-service-gallery-heading">
      <div><p>{t("Built for service teams")}</p><h2 id={headingId}>{t("Service categories")}</h2></div>
      {onSelect ? onReset && <button type="button" className="bp-service-gallery-action" onClick={onReset}>{t("View all")}<ArrowRight size={15} aria-hidden="true" /></button> : <Link to="/master-services" className="bp-service-gallery-action">{t("Manage catalogue")}<ArrowRight size={15} aria-hidden="true" /></Link>}
    </header>
    <div className="bp-service-gallery-grid" role="group" aria-label={t("Service categories")}>
      {SERVICE_CATEGORIES.map(service => {
        const content = <><ServiceIllustration className="bp-service-gallery-art" service={service.artwork} width={64} height={64} /><span>{t(service.label)}</span></>;
        return onSelect
          ? <button type="button" key={service.id} className="bp-service-gallery-tile" aria-pressed={selectedService === service.id} onClick={() => onSelect(service)}>{content}</button>
          : <Link key={service.id} className="bp-service-gallery-tile" to="/master-services" aria-label={t(`${service.label} service catalogue`)}>{content}</Link>;
      })}
    </div>
  </section>;
}
