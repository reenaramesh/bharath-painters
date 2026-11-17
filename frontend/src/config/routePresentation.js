// Presentation only. Existing route/page/backend guards remain the authority.
const rules = [
  [/^\/preview\//, 'preview', 'Preview', true],
  [/^\/(login|register|customer-register|forgot-password|verify-email)(\/|$)/, 'authentication', 'Account access', true],
  [/^\/(employee-activation|join\/property|customer-link|contractor-profile|share-contact)(\/|$)/, 'public', 'Bharath Painters', true],
  [/^\/application-analytics(\/|$)/, 'analytics', 'Application Analytics'],
  [/^\/(customer-connections|contractors|painters|support-staff|admin-integrations|packages|billing|revenue)(\/|$)/, 'administration', 'Administration'],
  [/^\/properties\/[^/]+\/(measurements|measurement-records)/, 'measurements', 'Measurements'],
  [/^\/(measurement|measurements|measurement-calculator|measurement-trial|measurement-access)(\/|$)/, 'measurements', 'Measurements'],
  [/^\/(quotations|customer-quotations)(\/|$)/, 'quotations', 'Quotations'],
  [/^\/(invoices|customer-invoices|contractor-revenue|in-house-earnings|my-packages)(\/|$)|^\/customers\/[^/]+\/project-account/, 'finance', 'Payments & earnings'],
  [/^\/customer\/(connections|connection-requests)(\/|$)/, 'connections', 'Connections'],
  [/^\/(properties|customer-properties|property-access)(\/|$)/, 'properties', 'Properties'],
  [/^\/(customers|call-inbox|opportunities|leads|new-opportunity|tasks|site-visits)(\/|$)/, 'crm', 'Customers & leads'],
  [/^\/(in-house-applicators|in-house-employees|attendance)(\/|$)/, 'employment', 'Employment & attendance'],
  [/^\/(jobs|job-activity|painter-seeking|find-painter|applicator-availability|applicator-bookings)(\/|$)/, 'jobs', 'Work network'],
  [/^\/(contractor-network|subcontract-work-orders|applicator-team|painter-contacts)(\/|$)/, 'network', 'People & work orders'],
  [/^\/(work-schedules|work-changes|work-reschedules|work-photos|completed-work|completed-projects|painter-assignments|work-reviews)(\/|$)/, 'work', 'Work management'],
  [/^\/(support-workspace|support-tickets)(\/|$)/, 'support', 'Support'],
  [/^\/(messages|service-requests|customer-reviews)(\/|$)/, 'communication', 'Messages & requests'],
  [/^\/(master-services|colors-shades)(\/|$)/, 'catalogue', 'Services & colours'],
  [/^\/(reports|activity-log)(\/|$)/, 'reports', 'Reports & activity'],
  [/^\/(settings|appearance|account-security|profile|provider-profile|applicator-profile|contractor-theme|customer\/profile)(\/|$)/, 'settings', 'Account & settings'],
  [/^\/(dashboard|applicator|customer-dashboard)(\/|$)/, 'overview', 'Dashboard'],
];

export function routePresentation(pathname) {
  const path = String(pathname || '/').split('?')[0];
  const [, module, title, publicPage = false] = rules.find(([pattern]) => pattern.test(path)) || [null, 'workspace', 'Workspace'];
  return { module, title, public: publicPage };
}

export function presentationRole(role, employment) {
  return role === 'PAINTER' && employment === 'in-house' ? 'EMPLOYEE' : role;
}

// Rebase the former default onto the approved palette, retaining custom choices.
export function hasCustomPresentationTheme(colors) {
  return Boolean(colors?.['--app-primary'] && colors?.['--app-accent']
    && (colors['--app-primary'].toUpperCase() !== '#5740EC' || colors['--app-accent'].toUpperCase() !== '#FB4B8B'));
}
