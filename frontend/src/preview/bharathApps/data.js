// ============================================================================
// BHARATH APPS — PREVIEW MOCK DATA
// ----------------------------------------------------------------------------
// 100% fictional. No real people, businesses, phone numbers, emails, addresses
// or bank details. Nothing here is ever sent to the Django backend: the preview
// imports no API client and performs no network mutation of any kind.
//
// Every amount, record and status in the preview is SIMULATED.
// ============================================================================

export const SIMULATED_LABEL = "Simulated preview record";
export const MOCK_MONEY_PREFIX = "Preview";

// ---------------------------------------------------------------------------
// 1. Admin-managed service catalogue (seed)
// ---------------------------------------------------------------------------
// NOTE ON "Cleaning": the brief lists Cleaning among the initial example
// categories but also asks the preview to demonstrate an admin adding it live
// and a new provider selecting it without code changes. To make that step real
// rather than theatre, Cleaning is intentionally ABSENT from this seed. Screen
// D pre-fills the "Create category" form with the exact Cleaning values so it
// can be added in one click.
export const SEED_CATALOGUE = [
  {
    id: "cat-painting",
    name: "Painting",
    identifier: "painting",
    workspaceName: "Bharath Painters",
    contractorLabel: "Painter",
    employeeSingular: "Employee",
    employeePlural: "Employees",
    icon: "paintbrush",
    units: ["sqft", "running-foot", "item"],
    displayOrder: 1,
    isActive: true,
    seededByAdmin: true,
    subServices: [
      { id: "sub-painting-interior", name: "Interior Painting", identifier: "interior-painting" },
      { id: "sub-painting-exterior", name: "Exterior Painting", identifier: "exterior-painting" },
      { id: "sub-painting-texture", name: "Texture Painting", identifier: "texture-painting" },
    ],
  },
  {
    id: "cat-plumbing",
    name: "Plumbing",
    identifier: "plumbing",
    workspaceName: "Bharath Plumbers",
    contractorLabel: "Plumber",
    employeeSingular: "Employee",
    employeePlural: "Employees",
    icon: "droplet",
    units: ["item", "hour", "fixed-amount"],
    displayOrder: 2,
    isActive: true,
    seededByAdmin: true,
    subServices: [
      { id: "sub-plumbing-leak", name: "Leak Repair", identifier: "leak-repair" },
      { id: "sub-plumbing-tap", name: "Tap Installation", identifier: "tap-installation" },
      { id: "sub-plumbing-pipe", name: "Pipe Replacement", identifier: "pipe-replacement" },
    ],
  },
  {
    id: "cat-electrical",
    name: "Electrical",
    identifier: "electrical",
    workspaceName: "Bharath Electricians",
    contractorLabel: "Electrician",
    employeeSingular: "Employee",
    employeePlural: "Employees",
    icon: "zap",
    units: ["item", "hour", "fixed-amount"],
    displayOrder: 3,
    isActive: true,
    seededByAdmin: true,
    subServices: [
      { id: "sub-electrical-wiring", name: "Wiring & Rewiring", identifier: "wiring-rewiring" },
      { id: "sub-electrical-switches", name: "Switch & Socket", identifier: "switch-socket" },
      { id: "sub-electrical-panel", name: "Panel Installation", identifier: "panel-installation" },
    ],
  },
  {
    id: "cat-carpentry",
    name: "Carpentry",
    identifier: "carpentry",
    workspaceName: "Bharath Carpenters",
    contractorLabel: "Carpenter",
    employeeSingular: "Employee",
    employeePlural: "Employees",
    icon: "hammer",
    units: ["sqft", "running-foot", "item", "fixed-amount"],
    displayOrder: 4,
    isActive: true,
    seededByAdmin: true,
    subServices: [
      { id: "sub-carpentry-doors", name: "Doors & Frames", identifier: "doors-frames" },
      { id: "sub-carpentry-mods", name: "Modular Furniture", identifier: "modular-furniture" },
      { id: "sub-carpentry-repair", name: "Carpentry Repair", identifier: "carpentry-repair" },
    ],
  },
  {
    id: "cat-interiors",
    name: "Interiors",
    identifier: "interiors",
    workspaceName: "Bharath Interiors",
    contractorLabel: "Interior Professional",
    employeeSingular: "Employee",
    employeePlural: "Employees",
    icon: "layers",
    units: ["sqft", "running-foot", "item", "fixed-amount"],
    displayOrder: 5,
    isActive: true,
    seededByAdmin: true,
    subServices: [
      { id: "sub-interiors-design", name: "Interior Design", identifier: "interior-design" },
      { id: "sub-interiors-execution", name: "Turnkey Execution", identifier: "turnkey-execution" },
      { id: "sub-interiors-modular", name: "Modular Kitchens", identifier: "modular-kitchens" },
    ],
  },
  {
    id: "cat-waterproofing",
    name: "Waterproofing",
    identifier: "waterproofing",
    workspaceName: "Bharath Waterproofers",
    contractorLabel: "Waterproofing Professional",
    employeeSingular: "Employee",
    employeePlural: "Employees",
    icon: "shield-check",
    units: ["sqft", "item", "fixed-amount"],
    displayOrder: 6,
    isActive: true,
    seededByAdmin: true,
    subServices: [
      { id: "sub-wp-bathroom", name: "Bathroom Waterproofing", identifier: "bathroom-waterproofing" },
      { id: "sub-wp-terrace", name: "Terrace Waterproofing", identifier: "terrace-waterproofing" },
    ],
  },
  {
    id: "cat-tile-work",
    name: "Tile Work",
    identifier: "tile-work",
    workspaceName: "Bharath Tile Works",
    contractorLabel: "Tile Professional",
    employeeSingular: "Employee",
    employeePlural: "Employees",
    icon: "grid",
    units: ["sqft", "item", "fixed-amount"],
    displayOrder: 7,
    isActive: true,
    seededByAdmin: true,
    subServices: [
      { id: "sub-tile-install", name: "Tile Installation", identifier: "tile-installation" },
      { id: "sub-tile-repair", name: "Tile Repair", identifier: "tile-repair" },
      { id: "sub-tile-grout", name: "Tile Grouting", identifier: "tile-grouting" },
    ],
  },
  {
    id: "cat-false-ceiling",
    name: "False Ceiling",
    identifier: "false-ceiling",
    workspaceName: "Bharath False Ceilings",
    contractorLabel: "False Ceiling Professional",
    employeeSingular: "Employee",
    employeePlural: "Employees",
    icon: "boxes",
    units: ["sqft", "running-foot", "fixed-amount"],
    displayOrder: 8,
    isActive: true,
    seededByAdmin: true,
    subServices: [
      { id: "sub-fc-gypsum", name: "Gypsum Ceiling", identifier: "gypsum-ceiling" },
      { id: "sub-fc-grid", name: "Grid Ceiling", identifier: "grid-ceiling" },
    ],
  },
];

// Prefill for the "Create category" form on screen D (one click adds Cleaning).
export const CLEANING_CATEGORY_TEMPLATE = {
  name: "Cleaning",
  identifier: "cleaning",
  workspaceName: "Bharath Cleaning Services",
  contractorLabel: "Cleaner",
  employeeSingular: "Employee",
  employeePlural: "Employees",
  icon: "sparkles",
  units: ["sqft", "item", "hour", "day", "fixed-amount"],
  subServices: [
    { name: "Deep Cleaning", identifier: "deep-cleaning" },
    { name: "Sofa Cleaning", identifier: "sofa-cleaning" },
    { name: "Bathroom Cleaning", identifier: "bathroom-cleaning" },
  ],
};

export const ALL_UNITS = [
  { identifier: "sqft", name: "Square feet" },
  { identifier: "running-foot", name: "Running foot" },
  { identifier: "item", name: "Item" },
  { identifier: "hour", name: "Hour" },
  { identifier: "day", name: "Day" },
  { identifier: "fixed-amount", name: "Fixed amount" },
];

// Only Painting carries the painting deduction formulas today.
export const FORMULA_SUPPORT = {
  painting: {
    supportsPaintDeductions: true,
    description:
      "Painting calculation type + sqft: gross area, opening deductions and net area apply.",
  },
  default: {
    supportsPaintDeductions: false,
    description:
      "No painting deduction formula for this trade. Quantity x rate only — " +
      "opening deductions are NOT applied.",
  },
};

export function formulaSupport(categoryIdentifier) {
  return FORMULA_SUPPORT[categoryIdentifier] || FORMULA_SUPPORT.default;
}

// ---------------------------------------------------------------------------
// 2. Personas (preview only)
// ---------------------------------------------------------------------------
// Phone numbers are 10-digit strings in the reserved +91 9xxxx range using the
// fictional 90000-90099 block. These are placeholders, not real numbers.
export const PERSONAS = [
  {
    id: "admin",
    label: "Admin",
    name: "Kavya Nair",
    internalRole: "ADMIN",
    internalRoleLabel: "Admin",
    accountTypeLabel: "Admin",
    businessName: "Bharath Apps Platform",
    phone: "+91 90000 00001",
    initials: "KN",
  },
  {
    id: "main",
    label: "Main contractor",
    name: "Ravi Menon",
    internalRole: "CONTRACTOR",
    internalRoleLabel: "Contractor",
    accountTypeLabel: "Contractor",
    businessName: "HomeRefix",
    phone: "+91 90000 00010",
    initials: "RM",
  },
  {
    id: "receiving",
    label: "Receiving contractor",
    name: "Anita Sharma",
    internalRole: "CONTRACTOR",
    internalRoleLabel: "Contractor",
    accountTypeLabel: "Contractor",
    businessName: "Vista Living Interiors",
    phone: "+91 90000 00020",
    initials: "AS",
  },
  {
    id: "employee",
    label: "Employee",
    name: "Imran Pasha",
    internalRole: "PAINTER",
    internalRoleLabel: "Employee",
    internalRoleLabelIsRenamed: true,
    accountTypeLabel: "Employee",
    businessName: "Vista Living Interiors (assigned)",
    phone: "+91 90000 00030",
    initials: "IP",
  },
  {
    id: "customer",
    label: "Customer",
    name: "Deepa Nair",
    internalRole: "CUSTOMER",
    internalRoleLabel: "Customer",
    accountTypeLabel: "Customer",
    businessName: "Whitefield Apartment (resident)",
    phone: "+91 90000 00040",
    initials: "DN",
  },
];

// ---------------------------------------------------------------------------
// 3. Provider profiles
// ---------------------------------------------------------------------------
export const SEED_PROFILES = {
  main: {
    personaId: "main",
    // Registration collected identity + login only. Profession is chosen in
    // profile completion, which is why profileDraft exists.
    registration: {
      fullName: "Ravi Menon",
      mobile: "+91 90000 00010",
      email: "ravi.menon@example.invalid",
      password: "(not captured in preview)",
      accountType: "CONTRACTOR",
    },
    profileDraft: true,
    profileCompletionPercent: 72,
    businessName: "HomeRefix",
    logoText: "HR",
    businessCategory: "home-services",
    yearsInBusiness: 11,
    numberOfEmployees: 9,
    baseLocation: "Whitefield, Bengaluru",
    serviceAreas: ["Whitefield", "Hope Farm", "Brookefield", "Electronic City"],
    // ONE core service
    coreServiceIdentifier: "painting",
    // MULTIPLE additional services, explicit sub-service level selection
    additionalServiceIdentifiers: ["tile-work"],
    additionalSubServiceIdentifiers: ["tile-grouting"],
    // Fictional contact handles. No live endpoint behind these.
    contact: {
      phone: "+91 90000 00010",
      email: "ravi.menon@example.invalid",
      bharathId: "BA-CTR-4021",
    },
    portfolio: [
      { id: "pf-1", title: "Indiranagar 3BHK repaint", locality: "Indiranagar", completedOn: "2026-02-18" },
      { id: "pf-2", title: "Sarjapur villa interior", locality: "Sarjapur", completedOn: "2025-11-04" },
      { id: "pf-3", title: "Koramangala 2BHK touch-up", locality: "Koramangala", completedOn: "2025-08-22" },
    ],
    teamManagement: {
      canCreateEmployees: true,
      canApproveBookings: true,
      employeeCount: 9,
      note: "Reuses the existing invitation/acceptance flow. An Employee is never a team member until they accept.",
    },
    minimumToPublish: ["businessName", "baseLocation", "coreServiceIdentifier"],
    minimumToApplyForWork: ["coreServiceIdentifier", "serviceAreas"],
    minimumToAcceptAssignment: ["businessName", "coreServiceIdentifier", "baseLocation"],
  },
  receiving: {
    personaId: "receiving",
    registration: {
      fullName: "Anita Sharma",
      mobile: "+91 90000 00020",
      email: "anita.sharma@example.invalid",
      password: "(not captured in preview)",
      accountType: "CONTRACTOR",
    },
    profileDraft: false,
    profileCompletionPercent: 100,
    businessName: "Vista Living Interiors",
    logoText: "VL",
    businessCategory: "home-services",
    yearsInBusiness: 7,
    numberOfEmployees: 5,
    baseLocation: "Marathahalli, Bengaluru",
    serviceAreas: ["Marathahalli", "Whitefield", "Bellandur", "Brookefield", "Sarjapur"],
    coreServiceIdentifier: "interiors",
    additionalServiceIdentifiers: ["false-ceiling", "carpentry"],
    additionalSubServiceIdentifiers: ["gypsum-ceiling", "carpentry-repair"],
    contact: {
      phone: "+91 90000 00020",
      email: "anita.sharma@example.invalid",
      bharathId: "BA-CTR-4188",
    },
    portfolio: [
      { id: "pf-4", title: "Bellandur apartment turnkey", locality: "Bellandur", completedOn: "2026-01-30" },
      { id: "pf-5", title: "Kadugodi kitchen interior", locality: "Kadugodi", completedOn: "2025-09-15" },
    ],
    teamManagement: {
      canCreateEmployees: true,
      canApproveBookings: true,
      employeeCount: 5,
      note: "Own team. This contractor assigns only their own employees to outsourced work.",
    },
    minimumToPublish: ["businessName", "baseLocation", "coreServiceIdentifier"],
    minimumToApplyForWork: ["coreServiceIdentifier", "serviceAreas"],
    minimumToAcceptAssignment: ["businessName", "coreServiceIdentifier", "baseLocation"],
  },
};

export const SEED_EMPLOYEE = {
  personaId: "employee",
  registration: {
    fullName: "Imran Pasha",
    mobile: "+91 90000 00030",
    email: "imran.pasha@example.invalid",
    password: "(not captured in preview)",
    accountType: "PAINTER",
    accountTypeLabel: "Employee",
  },
  profileDraft: false,
  profileCompletionPercent: 100,
  internalRole: "PAINTER",
  internalRoleLabel: "PAINTER (unchanged)",
  displayRoleLabel: "Employee",
  name: "Imran Pasha",
  age: 29,
  phone: "+91 90000 00030",
  email: "imran.pasha@example.invalid",
  // ONE primary trade
  primaryTradeIdentifier: "false-ceiling",
  // MULTIPLE additional skills at sub-service level
  additionalSkillIdentifiers: ["carpentry"],
  additionalSubServiceIdentifiers: ["carpentry-repair"],
  // Work location + preferred work areas
  workLocation: "Whitefield, Bengaluru",
  preferredWorkAreas: ["Whitefield", "Hope Farm", "Brookefield"],
  experienceYears: 6,
  availability: {
    status: "available",
    availableFrom: "2026-03-02",
    weeklyDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    note: "Reuses the existing availability model and its blocking rules.",
  },
  wagePreference: {
    mode: "daily",
    expectedDaily: 850,
    expectedWeekly: null,
    note: "Existing wage preference fields. No payment is initiated by this preview.",
  },
  existingWork: [
    { id: "ew-1", trade: "Gypsum Ceiling", employer: "Vista Living Interiors", year: 2025 },
    { id: "ew-2", trade: "Modular Furniture", employer: "Nova Joinery", year: 2024 },
  ],
  teamMembership: {
    contractorId: "receiving",
    status: "accepted",
    note: "Member of the receiving contractor's team because they ACCEPTED an invitation. Not automatic.",
  },
};

// ---------------------------------------------------------------------------
// 4. Contractor network
// ---------------------------------------------------------------------------
// Discoverable = opted in to the network AND published AND verified.
export const SEED_NETWORK_DIRECTORY = [
  {
    contractorKey: "receiving",
    bharathId: "BA-CTR-4188",
    businessName: "Vista Living Interiors",
    coreServiceIdentifier: "interiors",
    additionalServiceIdentifiers: ["false-ceiling", "carpentry"],
    additionalSubServiceIdentifiers: ["gypsum-ceiling", "carpentry-repair"],
    baseLocation: "Marathahalli, Bengaluru",
    serviceAreas: ["Marathahalli", "Whitefield", "Bellandur", "Brookefield", "Sarjapur"],
    verified: true,
    networkOptIn: true,
    rating: 4.6,
    completedJobs: 38,
    yearsInBusiness: 7,
    phone: "+91 90000 00020",
    email: "anita.sharma@example.invalid",
  },
  {
    contractorKey: "net-ceiling-quick",
    bharathId: "BA-CTR-4310",
    businessName: "QuickFix Ceilings",
    coreServiceIdentifier: "false-ceiling",
    additionalServiceIdentifiers: [],
    additionalSubServiceIdentifiers: ["gypsum-ceiling", "grid-ceiling"],
    baseLocation: "BTM Layout, Bengaluru",
    serviceAreas: ["BTM Layout", "Electronic City"],
    verified: true,
    networkOptIn: true,
    rating: 4.2,
    completedJobs: 14,
    yearsInBusiness: 4,
    phone: "+91 90000 00051",
    email: "ops.quickfix@example.invalid",
  },
  {
    contractorKey: "net-tile-pro",
    bharathId: "BA-CTR-4402",
    businessName: "TilePro Works",
    coreServiceIdentifier: "tile-work",
    additionalServiceIdentifiers: ["waterproofing"],
    additionalSubServiceIdentifiers: ["tile-grouting", "bathroom-waterproofing"],
    baseLocation: "Rajajinagar, Bengaluru",
    // Coverage reaches Whitefield even though the office is 40 km away —
    // this is the "service coverage, not just office location" case.
    serviceAreas: ["Rajajinagar", "Malleshwaram", "Whitefield"],
    verified: true,
    networkOptIn: true,
    rating: 4.5,
    completedJobs: 61,
    yearsInBusiness: 9,
    phone: "+91 90000 00052",
    email: "hello.tilepro@example.invalid",
  },
  {
    contractorKey: "net-plumb-right",
    bharathId: "BA-CTR-4455",
    businessName: "RightFlow Plumbing",
    coreServiceIdentifier: "plumbing",
    additionalServiceIdentifiers: [],
    additionalSubServiceIdentifiers: ["leak-repair", "tap-installation"],
    baseLocation: "Jayanagar, Bengaluru",
    serviceAreas: ["Jayanagar", "JP Nagar"],
    verified: true,
    networkOptIn: true,
    rating: 4.3,
    completedJobs: 27,
    yearsInBusiness: 5,
    phone: "+91 90000 00053",
    email: "team.rightflow@example.invalid",
  },
  {
    contractorKey: "net-hidden",
    bharathId: "BA-CTR-4499",
    businessName: "Silent Mode Carpentry",
    coreServiceIdentifier: "carpentry",
    additionalServiceIdentifiers: [],
    additionalSubServiceIdentifiers: ["carpentry-repair"],
    baseLocation: "Yelahanka, Bengaluru",
    serviceAreas: ["Yelahanka"],
    // Opted OUT of discovery. Must never appear in network search results.
    verified: true,
    networkOptIn: false,
    rating: 4.0,
    completedJobs: 5,
    yearsInBusiness: 2,
    phone: "+91 90000 00054",
    email: "hello.silentmode@example.invalid",
  },
];

export const SEED_CONNECTIONS = [
  {
    id: "conn-1",
    fromKey: "main",
    toKey: "receiving",
    status: "CONNECTED",
    initiatedBy: "main",
    requestedAt: "2026-02-26T10:12:00+05:30",
    respondedAt: "2026-02-26T18:40:00+05:30",
    method: "verified_account",
    note: "Connected. One permanent contractor identity and one login each.",
  },
];

// A saved contact is private to its owner until an explicit invitation is
// accepted. It never becomes a registered account or a public listing.
export const SEED_SAVED_CONTACTS = [
  {
    id: "contact-1",
    ownerKey: "main",
    contactName: "Sunil Rao (site contact)",
    phone: "+91 90000 00077",
    email: "sunil.rao@example.invalid",
    note: "Society manager. Known contact — private to HomeRefix.",
    visibility: "PRIVATE_TO_OWNER",
    linkedContractorKey: null,
    invitationStatus: "NOT_INVITED",
  },
];

// ---------------------------------------------------------------------------
// 5. Customer project — Whitefield Apartment
// ---------------------------------------------------------------------------
// NOTE: there is no separate Project model today. `quotations.Quotation` owns
// the overall work, `jobs.WorkSchedule` is its execution record and
// `quotations.Invoice` is its billing record. The preview mirrors that: one
// project object owns the scopes, and its customer-facing quotation is one
// record with multiple service scopes.
export const SEED_PROJECT = {
  id: "proj-1",
  // Ownership mirrors Quotation.contractor
  mainContractorKey: "main",
  customerPersonaId: "customer",
  customerName: "Deepa Nair",
  customerContact: {
    // Explicitly shared for execution — safe to show to a receiving contractor.
    phone: "+91 90000 00040",
    email: "deepa.nair@example.invalid",
    shareWithSubcontractor: true,
  },
  // Main-contractor-private. Never visible to the receiving contractor.
  customerContactPrivate: {
    alternatePhone: "+91 90000 00041",
    gstNumber: "29ABCDE1234F1Z5",
    notes: "Prefers Saturday site visits. Pays by UPI.",
    visibleTo: ["main", "admin"],
  },
  property: {
    id: "prop-1",
    name: "Whitefield Apartment",
    type: "Apartment",
    addressLine: "Flat 704, Palm Grove Residency, Whitefield",
    locality: "Whitefield",
    city: "Bengaluru",
    pincode: "560066",
    pincodeGenerated: true,
    areaSqft: 1240,
  },
  // Measurement versioning is preserved: v3 is current, v1/v2 retained.
  measurement: {
    currentVersion: 3,
    versions: [
      { version: 1, createdOn: "2026-02-10", note: "First site measurement.", isCurrent: false },
      { version: 2, createdOn: "2026-02-14", note: "Bedroom 2 wall length corrected.", isCurrent: false },
      { version: 3, createdOn: "2026-02-19", note: "Kitchen false ceiling area finalised.", isCurrent: true },
    ],
    surfaces: 14,
    openings: 23,
  },
  // Multiple service scopes on ONE project.
  scopes: [
    {
      id: "scope-1",
      name: "Interior painting — living, dining, bedrooms",
      categoryIdentifier: "painting",
      subServiceIdentifier: "interior-painting",
      unit: "sqft",
      calculationType: "WALL_CEILING",
      quantity: 1850,
      unitRate: 96,
      // Painting deduction evidence retained from the existing formulas.
      grossArea: 1898,
      deductionArea: 48,
      additionArea: 0,
      netArea: 1850,
      priceFormula: "net_area x rate",
      handling: "INTERNAL",
      workOrderId: null,
    },
    {
      id: "scope-2",
      name: "Tile grouting — kitchen and utility",
      categoryIdentifier: "tile-work",
      subServiceIdentifier: "tile-grouting",
      unit: "sqft",
      calculationType: "CUSTOM",
      quantity: 420,
      unitRate: 74,
      grossArea: 420,
      deductionArea: 0,
      additionArea: 0,
      netArea: 420,
      priceFormula: "quantity x rate (no painting deduction formula)",
      handling: "INTERNAL",
      workOrderId: null,
    },
    {
      id: "scope-3",
      name: "False ceiling — living and dining (gypsum)",
      categoryIdentifier: "false-ceiling",
      subServiceIdentifier: "gypsum-ceiling",
      unit: "sqft",
      calculationType: "CUSTOM",
      quantity: 640,
      unitRate: 188,
      grossArea: 640,
      deductionArea: 0,
      additionArea: 0,
      netArea: 640,
      priceFormula: "quantity x rate (no painting deduction formula)",
      handling: "SUBCONTRACTED",
      workOrderId: "wo-1",
    },
  ],
  photos: [
    { id: "ph-1", name: "living-before.jpg", stage: "BEFORE", sharedWithSubcontractor: true },
    { id: "ph-2", name: "ceiling-frame.jpg", stage: "BEFORE", sharedWithSubcontractor: true },
    { id: "ph-3", name: "customer-private-unrelated.jpg", stage: "BEFORE", sharedWithSubcontractor: false },
  ],
  internalNotes: [
    {
      id: "note-1",
      authorKey: "main",
      text: "Customer is price sensitive. Do not reveal my subcontractor rate to them.",
      visibility: "PRIVATE",
    },
  ],
  requiredDates: {
    siteStartDate: "2026-03-05",
    siteEndDate: "2026-03-14",
  },
  customerQuotation: {
    number: "BP/QTN/2025-26/0417",
    revision: 2,
    status: "ACCEPTED",
    issuedOn: "2026-02-21",
    // MAIN CONTRACTOR MARGIN — private to the main contractor.
    marginPercent: 18,
    lineItems: [
      {
        id: "li-1",
        descriptionSnapshot: "Interior Painting — Wall + Ceiling (1850 sqft)",
        categoryIdentifier: "painting",
        subServiceIdentifier: "interior-painting",
        unit: "sqft",
        quantity: 1850,
        rate: 112,
        amount: 207200,
      },
      {
        id: "li-2",
        descriptionSnapshot: "Tile Grouting — Kitchen & Utility (420 sqft)",
        categoryIdentifier: "tile-work",
        subServiceIdentifier: "tile-grouting",
        unit: "sqft",
        quantity: 420,
        rate: 82,
        amount: 34440,
      },
      {
        id: "li-3",
        descriptionSnapshot: "False Ceiling — Gypsum, Living & Dining (640 sqft)",
        categoryIdentifier: "false-ceiling",
        subServiceIdentifier: "gypsum-ceiling",
        unit: "sqft",
        quantity: 640,
        rate: 232,
        amount: 148480,
      },
    ],
    // A historical line item whose wording must never be rewritten.
    historicalLineItems: [
      {
        id: "li-h1",
        descriptionSnapshot: "Wall Painting — Hall (600 sqft)",
        issuedOn: "2025-08-14",
        quotationNumber: "BP/QTN/2025-26/0192",
      },
    ],
    subtotal: 390120,
    discountAmount: 0,
    gstPercent: 18,
    gstAmount: 70221.6,
    total: 460341.6,
  },
};

// ---------------------------------------------------------------------------
// 6. Outsourced work order
// ---------------------------------------------------------------------------
export const SEED_WORK_ORDER = {
  id: "wo-1",
  reference: "SUB/2025-26/0007",
  projectId: "proj-1",
  scopeIds: ["scope-3"],
  mainContractorKey: "main",
  receivingContractorKey: "receiving",
  connectionId: "conn-1",
  status: "DRAFT",
  createdOn: "2026-03-01",
  // Exactly what is shared. Nothing outside this list is readable by the
  // receiving contractor.
  sharedScope: [
    {
      scopeId: "scope-3",
      name: "False ceiling — living and dining (gypsum)",
      categoryIdentifier: "false-ceiling",
      subServiceIdentifier: "gypsum-ceiling",
      unit: "sqft",
      quantity: 640,
      description:
        "Gypsum false ceiling with cove lighting recess in living and dining. " +
        "Frame and boards to be supplied by the receiving contractor.",
    },
  ],
  sharedMeasurement: {
    version: 3,
    totalAreaSqft: 640,
    note: "Version 3 shared. Versions 1 and 2 remain private to the main contractor.",
  },
  sharedPhotos: ["ph-1", "ph-2"],
  sharedLocation: {
    addressLine: "Flat 704, Palm Grove Residency, Whitefield",
    locality: "Whitefield",
    city: "Bengaluru",
    pincode: "560066",
    siteContact: { name: "Deepa Nair", phone: "+91 90000 00040" },
  },
  requiredDates: { start: "2026-03-08", end: "2026-03-12" },
  quote: null,
  agreed: null,
  assignments: [],
  progressUpdates: [],
  completionSubmission: null,
  correctionRequests: [],
  additionalWorkRequests: [],
  declinedReason: null,
  cancelledReason: null,
};

export const SUBQUOTE_DRAFT = {
  lines: [
    {
      id: "sq-1",
      description: "Gypsum false ceiling — 640 sqft",
      unit: "sqft",
      quantity: 640,
      rate: 96,
      amount: 61440,
    },
    {
      id: "sq-2",
      description: "Cove lighting recess — 22 running foot",
      unit: "running-foot",
      quantity: 22,
      rate: 310,
      amount: 6820,
    },
    {
      id: "sq-3",
      description: "Site setup and disposal",
      unit: "fixed-amount",
      quantity: 1,
      rate: 4500,
      amount: 4500,
    },
  ],
  subtotal: 72760,
  additionalWorksNote: "",
  validDays: 15,
  total: 72760,
};

// ---------------------------------------------------------------------------
// 7. Financials — three separate relationships, three separate ledgers
// ---------------------------------------------------------------------------
// a) Customer -> Main contractor
// b) Main contractor -> Receiving contractor
// c) Receiving contractor -> their own employee (wage record only)
export const SEED_FINANCIALS = {
  customerToMain: {
    relationship: "Customer -> Main contractor",
    invoiceNumber: "BP/INV/2025-26/0417",
    issuedOn: "2026-03-01",
    status: "PART_PAID",
    lines: [
      { descriptionSnapshot: "Interior Painting — Wall + Ceiling", amount: 207200 },
      { descriptionSnapshot: "Tile Grouting — Kitchen & Utility", amount: 34440 },
      { descriptionSnapshot: "False Ceiling — Gypsum, Living & Dining", amount: 148480 },
    ],
    total: 390120,
    payments: [
      {
        id: "pay-c1",
        date: "2026-03-02",
        amount: 195060,
        mode: "UPI",
        reference: "PREVIEW-UPI-8841",
        note: "50% advance recorded by the main contractor.",
      },
    ],
  },
  mainToReceiving: {
    relationship: "Main contractor -> Receiving contractor",
    invoiceNumber: "BP/SUBINV/2025-26/0007",
    issuedOn: null,
    status: "NOT_ISSUED",
    // Derived from the agreed subcontract price, not from the customer invoice.
    lines: [],
    total: 0,
    payments: [],
    rule:
      "A customer payment NEVER settles this balance. Customer -> Main contractor, " +
      "Main contractor -> Receiving contractor and Receiving contractor -> Employee " +
      "are three independent relationships.",
  },
  receivingToEmployee: {
    relationship: "Receiving contractor -> Employee",
    wageRecordNumber: "PREVIEW-WAGE/WK-11",
    periodLabel: "Week of 2026-03-09",
    lines: [],
    total: 0,
    note: "Wage accrual only. The preview initiates no transfer of any kind.",
  },
};

// ---------------------------------------------------------------------------
// 8. Messages — explicit, user-initiated only. Nothing is ever sent.
// ---------------------------------------------------------------------------
export const SEED_MESSAGES = [
  {
    id: "msg-1",
    workOrderId: "wo-1",
    fromKey: "main",
    toKey: "receiving",
    body: "Sharing the false ceiling scope from the Whitefield Apartment job. Please quote for 640 sqft.",
    sentAt: "2026-03-01T09:20:00+05:30",
    delivery: "IN_APP_ONLY",
  },
];

// ---------------------------------------------------------------------------
// 9. Simulated activity log — every preview action is recorded here
// ---------------------------------------------------------------------------
export const SIMULATED_ACTIONS = [
  {
    id: "sim-0",
    at: "2026-03-01T09:20:00+05:30",
    actorPersonaId: "main",
    action: "Sent subcontractor quotation request for False Ceiling (640 sqft).",
    simulated: true,
  },
];

// ---------------------------------------------------------------------------
// 10. Preview verification checklist — rendered as a live panel
// ---------------------------------------------------------------------------
export const PREVIEW_CHECKS = [
  { id: "core-branding", label: "Core-service change updates the workspace heading" },
  { id: "additional-stable", label: "Additional services never change core branding" },
  { id: "subservice-alone", label: "A single sub-service can be selected on its own" },
  { id: "admin-catalogue", label: "An admin-created category appears in profile selection" },
  { id: "separate-acceptance", label: "Connection acceptance is separate from work acceptance" },
  { id: "shared-scope", label: "Shared scope excludes unrelated information" },
  { id: "payment-separation", label: "Customer payment does not settle the subcontractor balance" },
  { id: "history-safe", label: "Historical documents keep their original wording" },
  { id: "formula-guard", label: "Painting formulas do not apply to other trades" },
];