import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import useAuth from '../../context/useAuth';
import { useLanguage } from '../../i18n/LanguageContext';
import { activeNavigation, visibleNavigation } from '../../config/navigation';
import { menuRouteEnabled } from '../../utils/menuVisibility';
import { routePresentation } from '../../config/routePresentation';

export default function WorkspaceBreadcrumbs({ employmentStatus }) {
  const { user, menuVisibility } = useAuth();
  const { t } = useLanguage();
  const { pathname, search } = useLocation();
  if (['/dashboard', '/applicator', '/customer-dashboard', '/messages'].includes(pathname)) return null;
  const entries = visibleNavigation(user?.role, employmentStatus).filter(entry => menuRouteEnabled(user?.role, menuVisibility, entry.route));
  const active = activeNavigation(entries, pathname + search);
  const title = routePresentation(pathname).title;
  const home = user?.role === 'CUSTOMER' ? '/customer-dashboard' : '/dashboard';
  return <nav className="premium-breadcrumbs" aria-label={t('Breadcrumb')}><ol>
    <li><Link to={home}><Home size={14} aria-hidden="true" /><span className="ml-2">{t('Home')}</span></Link></li>
    <li><ChevronRight size={13} aria-hidden="true" />{active && active.route.split('?')[0] !== pathname
      ? <><Link to={active.route}>{t(active.label)}</Link><ChevronRight size={13} aria-hidden="true" /><span aria-current="page">{t(title)}</span></>
      : <span aria-current="page">{t(active?.label || title)}</span>}</li>
  </ol></nav>;
}
