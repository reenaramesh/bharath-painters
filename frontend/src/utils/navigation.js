// Module pages and safe fallbacks for back navigation.
// Each detail/edit/workflow route maps to the list page it belongs to,
// so a directly-opened URL always has a sensible place to return to.

export const MODULE_FALLBACKS = {
  // Customers module
  "/customers/:id": "/customers",
  "/customers/:id/quotations": "/customers",
  "/customers/:id/quotations/:quotationId": "/customers",

  // Quotations module
  "/quotations": "/dashboard",
  "/quotations/new": "/quotations",
  "/quotations/manual": "/quotations",
  "/quotations/:id": "/quotations",
  "/quotations/:id/edit": "/quotations",
  "/quotations/:id/reset": "/quotations",

  // Properties module
  "/properties": "/dashboard",
  "/properties/new": "/properties",
  "/properties/:id": "/properties",
  "/properties/:id/edit": "/properties",
  "/properties/:id/measurements": "/properties",

  // Properties (customer side)
  "/customer-properties/:id": "/customer-properties",
  "/customer-quotations/:id": "/customer-quotations",
  "/customer-invoices": "/customer-dashboard",

  // Invoices module
  "/invoices": "/dashboard",
  "/invoices/:id": "/invoices",
  "/billing": "/dashboard",

  // Jobs / tasks / schedules
  "/jobs/:id": "/jobs",
  "/tasks/:id": "/tasks",
  "/work-schedules/:id": "/work-schedules",
  "/work-reschedules/:id": "/work-reschedules",
  "/completed-work/:id": "/completed-work",
  "/work-photos": "/dashboard",

  // Leads
  "/leads/:id": "/leads",

  // Sales opportunities
  "/opportunities/:id": "/opportunities",

  // People
  "/find-painter": "/dashboard",
  "/painters/:id": "/painters",
  "/contractors/:id": "/contractors",
  "/painter-assignments": "/painters",
  "/painter-seeking": "/painters",
  "/in-house-applicators/new": "/in-house-applicators",
  "/in-house-applicators/:id": "/in-house-applicators",
  "/in-house-employees/new": "/in-house-applicators",
  "/in-house-employees/:id": "/in-house-applicators",
  "/applicator-team/:id": "/applicator-team",
  "/applicator-profile": "/dashboard",
  "/applicator-bookings": "/dashboard",
  "/applicator-availability": "/dashboard",

  // Support / misc
  "/support-tickets/:id": "/support-tickets",
  "/service-requests/:id": "/service-requests",
  "/measurement-access": "/dashboard",
  "/measurement-trial": "/dashboard",
  "/coming-soon": "/dashboard",

  // Revenue / reports
  "/reports": "/dashboard",
  "/admin-revenue": "/dashboard",
  "/contractor-revenue": "/dashboard",
  "/admin-billing": "/dashboard",
  "/in-house-earnings": "/dashboard",
};

// Patterns that cannot be resolved from the table above are matched here.
const PATTERN_RULES = [
  [/^\/quotations\/new$/, "/quotations"],
  [/^\/quotations\/manual/, "/quotations"],
  [/^\/quotations\/\d+\/edit$/, "/quotations"],
  [/^\/quotations\/\d+\/reset$/, "/quotations"],
  [/^\/quotations\/\d+$/, "/quotations"],
  [/^\/quotations$/, "/dashboard"],
  [/^\/customers\/\d+\/quotations\/\d+$/, "/customers"],
  [/^\/customers\/\d+\/quotations$/, "/customers"],
  [/^\/customers\/\d+$/, "/customers"],
  [/^\/properties\/\d+\/measurements$/, "/properties"],
  [/^\/properties\/\d+\/edit$/, "/properties"],
  [/^\/properties\/\d+$/, "/properties"],
  [/^\/properties$/, "/dashboard"],
  [/^\/customer-properties\/\d+$/, "/customer-properties"],
  [/^\/customer-quotations\/\d+$/, "/customer-quotations"],
  [/^\/invoices\/\d+$/, "/invoices"],
  [/^\/jobs\/\d+$/, "/jobs"],
  [/^\/tasks\/\d+$/, "/tasks"],
  [/^\/work-schedules\/\d+$/, "/work-schedules"],
  [/^\/work-reschedules\/\d+$/, "/work-reschedules"],
  [/^\/leads\/\d+$/, "/leads"],
  [/^\/opportunities\/\d+$/, "/opportunities"],
  [/^\/painters\/\d+$/, "/painters"],
  [/^\/contractors\/\d+$/, "/contractors"],
  [/^\/in-house-applicators\/\d+$/, "/in-house-applicators"],
  [/^\/in-house-employees\/\d+$/, "/in-house-applicators"],
  [/^\/applicator-team\/\d+$/, "/applicator-team"],
  [/^\/support-tickets\/\d+$/, "/support-tickets"],
  [/^\/service-requests\/\d+$/, "/service-requests"],
];

/**
 * Back navigation for builder/workflow pages that aren't using BackButton.
 * Same priority rules as resolveBackTarget.
 */
export function goBackFromBuilder(location, navigate, fallback) {
  const { target } = resolveBackTarget({
    location,
    fallback,
    explicitReturn: location.state?.returnTo || location.state?.customerPath,
  });
  navigate(target);
}

/**
 * Returns the module list page a path belongs to,
 * or null when the path itself IS a module page (nothing to fall back to).
 */
export function getModuleFallback(pathname) {
  if (!pathname) return null;
  const clean = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  if (clean === "/") return null;

  for (const [pattern, target] of Object.entries(MODULE_FALLBACKS)) {
    const regex = new RegExp(
      `^${pattern.replace(/:\d*[^/]+/g, "[^/]+").replace(/:\w+/g, "[^/]+")}/?$`,
    );
    if (regex.test(clean)) return target;
  }
  for (const [regex, target] of PATTERN_RULES) {
    if (regex.test(clean)) return target;
  }
  return null;
}

/**
 * Picks the best back target.
 * Priority:
 *  1. explicit returnTo/customerPath state passed by the linking page
 *  2. in-app history (previous entry exists and is in-app)
 *  3. module list page the current route belongs to
 *  4. caller-provided fallback
 */
export function resolveBackTarget({
  location,
  fallback = "/dashboard",
  explicitReturn,
}) {
  // 1. Explicit return path passed via navigation state
  if (
    explicitReturn &&
    explicitReturn !== location.pathname &&
    explicitReturn.startsWith("/")
  ) {
    return { target: explicitReturn, source: "explicit" };
  }

  // 2. Browser history: only if we actually have an in-app previous entry
  const idx = Number(window.history.state?.idx ?? 0);
  if (idx > 0) {
    return { target: -1, source: "history" };
  }

  // 3. No history — resolve the module list page instead of the raw fallback
  //    so a directly-opened detail page never dumps the user on a random page.
  const moduleFallback = getModuleFallback(location.pathname);
  if (moduleFallback) return { target: moduleFallback, source: "module" };

  // 4. Last resort: caller's fallback
  return { target: fallback, source: "fallback" };
}
