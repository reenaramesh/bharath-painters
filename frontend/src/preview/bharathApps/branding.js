// ============================================================================
// BHARATH APPS — central platform configuration + label resolver (PREVIEW)
// ----------------------------------------------------------------------------
// This is a resolver, NOT a global text replacement layer.
//
// Rules encoded here:
//  1. "Bharath Apps" is always the parent platform identity and is never
//     renamed. Before a provider picks a core service, the workspace heading
//     is simply "Bharath Apps".
//  2. The CORE service alone personalises the workspace heading and the
//     professional labels.
//  3. Additional services NEVER change the core identity.
//  4. Generic modules keep generic names regardless of core service.
//  5. Historical records keep their originally stored wording. Branding is
//     applied at READ time for the workspace shell only; issued documents and
//     historical line items are rendered from their own snapshots
//     (see resolveHistoricalLabel / historicalLineItems).
// ============================================================================

export const PLATFORM = {
  name: "Bharath Apps",
  short: "BA",
  // Reserved domain brand. No TLD is confirmed, so nothing in this preview
  // touches deployment URLs, DNS, OAuth callbacks, CORS or email config.
  domainBrand: "bharathapps",
};

// These module names stay identical for every profession.
export const GENERIC_MODULES = Object.freeze([
  "Customers",
  "Opportunities",
  "Measurements",
  "Quotations",
  "Jobs",
  "Calendar",
  "Invoices",
  "Payments",
  "Messages",
]);

// Fallback used before profession selection is complete (profile draft).
const UNSELECTED = Object.freeze({
  coreServiceIdentifier: null,
  coreServiceName: null,
  workspaceName: PLATFORM.name,
  professionalSingular: "Professional",
  professionalPlural: "Professionals",
  isProfessionSelected: false,
});

/**
 * Resolve every profession-derived label from the core service only.
 *
 * @param {string|null} coreServiceIdentifier stable catalogue identifier
 * @param {object[]} catalogue admin-managed service categories
 */
export function resolveBranding(coreServiceIdentifier, catalogue = []) {
  if (!coreServiceIdentifier) return { ...UNSELECTED, platform: PLATFORM };

  const core = catalogue.find((row) => row.identifier === coreServiceIdentifier);
  if (!core) return { ...UNSELECTED, platform: PLATFORM };

  return {
    coreServiceIdentifier: core.identifier,
    coreServiceName: core.name,
    // Personalised workspace heading — derived from the core service only.
    workspaceName: core.workspaceName,
    professionalSingular: core.contractorLabel,
    professionalPlural: core.employeePlural,
    employeeSingular: core.employeeSingular,
    isProfessionSelected: true,
    platform: PLATFORM,
  };
}

/**
 * Workspace heading for a provider account.
 * Falls back to the platform name when no core service has been chosen, which
 * is what a registration draft and a profile with "Complete later" must show.
 */
export function workspaceHeading(branding) {
  return branding?.isProfessionSelected ? branding.workspaceName : PLATFORM.name;
}

/**
 * Sub-heading under the workspace heading.
 * Additional services are listed for information only and deliberately do not
 * take part in brand selection.
 */
export function workspaceSubheading(branding, additionalServices = []) {
  if (!branding?.isProfessionSelected) {
    return "Choose your core service to personalise your workspace.";
  }
  if (!additionalServices.length) {
    return `You are listed as a ${branding.professionalSingular}.`;
  }
  return `${additionalServices.length} additional service${
    additionalServices.length === 1 ? "" : "s"
  } listed — your ${branding.workspaceName} identity is unchanged.`;
}

/**
 * Brand-safety note rendered wherever a historical record is displayed.
 */
export const HISTORY_POLICY =
  "Issued documents and historical line items keep their original wording. " +
  "Changing your core service renames your workspace only — it never rewrites " +
  "a description, a quotation number, an invoice number or a measurement.";

// ---------------------------------------------------------------------------
// Historical record helpers — read the stored snapshot, never the live brand.
// ---------------------------------------------------------------------------

/**
 * Resolve the wording for a historical record.
 * `snapshot` is the value captured at issue time. It always wins.
 */
export function resolveHistoricalLabel(record) {
  const snapshot =
    record?.descriptionSnapshot ?? record?.itemDescription ?? record?.name ?? "";
  return {
    label: snapshot,
    source: "snapshot",
    note: HISTORY_POLICY,
  };
}

/**
 * A quotation / invoice line item as it appeared when issued.
 * Illustrates that "Wall Painting" is NOT relabelled when a provider later
 * switches their core service to another trade.
 */
export function historicalLineItems(lineItems, currentBranding) {
  return (lineItems || []).map((item) => ({
    ...item,
    renderedDescription: item.descriptionSnapshot,
    currentBrandWouldRender: currentBranding?.coreServiceName
      ? `${currentBranding.coreServiceName} — ${item.descriptionSnapshot}`
      : item.descriptionSnapshot,
    isRebranded: false,
  }));
}

// ---------------------------------------------------------------------------
// Terminology map used by the persona / role layer.
// The internal role constant stays PAINTER for backwards compatibility; only
// the interface label changes. See README in this folder.
// ---------------------------------------------------------------------------

export const ROLE_TERMS = Object.freeze({
  // internal constant -> interface label
  PAINTER: "Employee",
  CONTRACTOR: "Contractor",
  CUSTOMER: "Customer",
  ADMIN: "Admin",
  SUPPORT: "Support",
});

// The two provider registration choices. Vendor is deliberately absent.
export const PROVIDER_REGISTRATION_TYPES = Object.freeze([
  {
    identifier: "CONTRACTOR",
    label: "Contractor",
    blurb:
      "Run a business. Manage customer projects, outsource scope to other " +
      "contractors, and manage your own employees.",
  },
  {
    identifier: "PAINTER",
    label: "Employee",
    internalRole: "PAINTER",
    blurb:
      "Work on site. Get offers from contractors, manage your availability " +
      "and wage preferences.",
    note:
      "Stored with the existing PAINTER role for compatibility. Only the " +
      "interface label changes in this preview.",
  },
]);