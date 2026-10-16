import { PageHeader } from './ui';
import { useLanguage } from '../i18n/LanguageContext';
import ServiceIllustration from './ServiceIllustration';

export default function DashboardWelcomeBanner({ eyebrow, title, description, actions, service, icon: Icon, label }) {
  const { t } = useLanguage();
  return <section className="dashboard-welcome-banner contractor-welcome" aria-label={t(label || 'Workspace overview')}>
    <PageHeader eyebrow={typeof eyebrow === 'string' ? t(eyebrow) : eyebrow} title={title}
      description={typeof description === 'string' ? t(description) : description} actions={actions} />
    {service ? <ServiceIllustration className="contractor-welcome-art" service={service} width={170} height={170} />
      : Icon ? <span className="dashboard-welcome-symbol contractor-welcome-art" aria-hidden="true"><Icon strokeWidth={1.25} /></span> : null}
  </section>;
}
