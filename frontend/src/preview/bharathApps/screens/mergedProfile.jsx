// ============================================================================
// PREVIEW SCREEN M: the merged Business Profile page.
//
// This screen previews ONE page that replaces today's two:
//   /settings            -> ContractorSettings, "Contractor and company details"
//   /provider-profile    -> ProviderProfile, "Core service and additional services"
//
// Both write to different backend models, and three fields (service areas,
// years in business, team size) exist in BOTH. The screen shows the intended
// end state: one input per concept, four tabs, one completion meter.
// ============================================================================

import { useState } from "react";
import {
  BadgeCheck,
  Building2,
  Info,
  Lock,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { usePreview } from "../state";
import {
  Button,
  CategoryIcon,
  Field,
  Input,
  PageHeader,
  Pill,
  PreviewBanner,
  SectionCard,
  SimulatedTag,
  Textarea,
  UnsupportedNote,
} from "../components";

const TABS = [
  { id: "trade", label: "Trade", hint: "Core service, additional services, publish" },
  { id: "identity", label: "Business identity", hint: "Name, location, areas, years, team" },
  { id: "compliance", label: "Compliance & finance", hint: "Tax, bank, certificates, documents" },
  { id: "presence", label: "Presence", hint: "Social links and work skills" },
];

// Fields that exist in both models today. The merged page shows one input and
// the server writes both rows, so the contractor directory and the digital card
// (which read ContractorProfile) never drift from what the trade profile shows.
const MIRRORED = [
  ["Service areas", "contractor_profile.service_areas", "provider_profile.service_areas"],
  ["Years in business", "contractor_profile.years_in_business", "provider_profile.years_in_business"],
  ["Team size", "contractor_profile.number_of_painters", "provider_profile.team_size"],
];

function TabBar({ active, onChange, tabs }) {
  return (
    <div
      role="tablist"
      aria-label="Business profile sections"
      className="flex gap-1 overflow-x-auto rounded-xl border border-[#e5e9f2] bg-white p-1"
    >
      {tabs.map((tab) => {
        const on = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={on}
            title={tab.hint}
            onClick={() => onChange(tab.id)}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-[0.78rem] font-bold transition ${
              on ? "bg-[#176b9b] text-white" : "text-[#475467] hover:bg-[#f4f6fa]"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function SaveBar({ label, note }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e9f2] bg-white px-4 py-3">
      <p className="text-[0.72rem] text-[#667085]">{note}</p>
      <div className="flex items-center gap-2.5">
        {saved && <Pill tone="success">Saved</Pill>}
        <Button onClick={() => setSaved(true)}>{label}</Button>
      </div>
    </div>
  );
}

/** Read-only checkbox — used where the flag is not editable on this page. */
function StaticCheck({ label, hint }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-[#e5e9f2] bg-white px-3 py-2.5">
      <BadgeCheck size={15} className="mt-0.5 shrink-0 text-[#176b9b]" />
      <span className="min-w-0">
        <span className="block text-[0.8rem] font-semibold leading-snug text-[#172033]">{label}</span>
        {hint && <span className="mt-0.5 block text-[0.68rem] leading-snug text-[#667085]">{hint}</span>}
      </span>
    </div>
  );
}

export function ScreenMergedBusinessProfile() {
  const { state, dispatch, activeProfile, branding } = usePreview();
  const [tab, setTab] = useState("trade");

  const isEmployee = state.activePersonaId === "employee";
  // PAINTER cannot write ContractorProfile today - the endpoint refuses any
  // role other than CONTRACTOR - so the two compliance tabs are not offered.
  const tabs = isEmployee ? TABS.slice(0, 2) : TABS;

  const catalogue = state.catalogue;
  const coreId = isEmployee ? state.employee.primaryTradeIdentifier : activeProfile?.coreServiceIdentifier;
  const additionalIds = isEmployee
    ? state.employee.additionalSkillIdentifiers
    : activeProfile?.additionalServiceIdentifiers ?? [];
  const subIds = isEmployee ? [] : activeProfile?.additionalSubServiceIdentifiers ?? [];

  const additional = catalogue.filter(
    (c) => c.isActive && c.identifier !== coreId && additionalIds.includes(c.identifier),
  );
  const claimedSubs = catalogue.flatMap((c) =>
    (c.identifier === coreId ? [c] : additional)
      .flatMap((cat) => cat.subServices.filter((s) => subIds.includes(s.identifier)))
      .map((s) => ({ cat, sub: s })),
  );

  const completion = isEmployee ? state.employee.profileCompletionPercent : activeProfile?.profileCompletionPercent ?? 0;
  const years = isEmployee ? state.employee.experienceYears : activeProfile?.yearsInBusiness;
  const areas = isEmployee
    ? state.employee.preferredWorkAreas.join(", ")
    : (activeProfile?.serviceAreas ?? []).join(", ");
  // An Employee has no team size - the field belongs to a business, not a person.
  const team = isEmployee ? null : activeProfile?.numberOfEmployees;
  const location = isEmployee ? state.employee.workLocation : activeProfile?.baseLocation;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Screen M · Merged Business Profile"
        title="Business Profile"
        description="One /settings page for trade, identity, compliance and presence. Legacy profile routes redirect to its sections."
        actions={<SimulatedTag>Simulated merge</SimulatedTag>}
      />
      <PreviewBanner />

      {/* ONE meter. The old pages each had their own percentage. */}
      <SectionCard title="Profile completeness" description="Single meter for the whole page.">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f2f7fb] text-lg font-extrabold text-[#176b9b]">
            {completion}%
          </div>
          <div className="min-w-0">
            <p className="text-[0.86rem] font-bold text-[#172033]">
              {branding.workspaceName} · {branding.professionalSingular}
            </p>
            <p className="text-[0.72rem] text-[#667085]">
              Driven by the core service. The old /settings page had a second, separate
              completion meter for company details - it is folded into this one.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Pill tone="neutral">Route: /settings</Pill>
            <Pill tone="warning">Legacy profile routes redirect here</Pill>
          </div>
        </div>
      </SectionCard>

      <TabBar active={tab} onChange={setTab} tabs={tabs} />

      {/* ---------------------------------------------------------------- */}
      {tab === "trade" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <SectionCard
              title="Core service — exactly one"
              description="Changing this changes your workspace heading."
            >
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {catalogue.filter((c) => c.isActive).map((c) => {
                  const isCore = c.identifier === coreId;
                  return (
                    <button
                      key={c.identifier}
                      onClick={() =>
                        isEmployee
                          ? dispatch({ type: "TOGGLE_EMPLOYEE_TRADE", kind: "primary", identifier: c.identifier })
                          : dispatch({ type: "SET_CORE_SERVICE", personaKey: state.activePersonaId, personaId: state.activePersonaId, identifier: c.identifier })
                      }
                      className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                        isCore
                          ? "border-[#176b9b] bg-[#f2f7fb] ring-1 ring-[#176b9b]/15"
                          : "border-[#e5e9f2] hover:border-[#c7d0de]"
                      }`}
                    >
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isCore ? "bg-[#176b9b] text-white" : "bg-[#eef2ff] text-[#4f46e5]"}`}>
                        <CategoryIcon name={c.icon} size={15} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[0.82rem] font-bold text-[#172033]">{c.name}</p>
                        <p className="truncate text-[0.66rem] text-[#667085]">{c.workspaceName}</p>
                        {isCore && <Pill tone="success" className="mt-1">Core service</Pill>}
                      </div>
                    </button>
                  );
                })}
              </div>
              {!isEmployee && <UnsupportedNote>Switching the core service drops the sub-service claims of the trade you leave, so the next save is never rejected.</UnsupportedNote>}
            </SectionCard>

            <SectionCard
              title={isEmployee ? "Additional skills" : "Additional services"}
              description={
                isEmployee
                  ? "Extra trades this Employee can take on."
                  : "Add extra trades without touching the core identity."
              }
            >
              <div className="flex flex-wrap gap-2">
                {catalogue.filter((c) => c.isActive && c.identifier !== coreId).map((c) => {
                  const on = additionalIds.includes(c.identifier);
                  return (
                    <button
                      key={c.identifier}
                      onClick={() =>
                        isEmployee
                          ? dispatch({ type: "TOGGLE_EMPLOYEE_TRADE", kind: "additional", identifier: c.identifier })
                          : dispatch({ type: "TOGGLE_ADDITIONAL_SERVICE", personaKey: state.activePersonaId, personaId: state.activePersonaId, identifier: c.identifier })
                      }
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.76rem] font-bold transition ${
                        on ? "border-[#176b9b] bg-[#f2f7fb] text-[#176b9b]" : "border-[#e5e9f2] text-[#475467]"
                      }`}
                    >
                      <CategoryIcon name={c.icon} size={13} />
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            {!isEmployee && (
              <SectionCard
                title="Sub-services you actually offer"
                description="Pick the specific work, not just the category."
              >
                {claimedSubs.length === 0 ? (
                  <p className="text-[0.78rem] text-[#667085]">
                    Choose a core service first, then claim the sub-services you offer.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {claimedSubs.map(({ cat, sub }) => (
                      <li
                        key={`${cat.identifier}-${sub.identifier}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[#e5e9f2] px-3 py-2"
                      >
                        <span className="truncate text-[0.8rem] text-[#172033]">
                          <span className="font-bold">{cat.name}</span> › {sub.name}
                        </span>
                        <Pill tone="neutral">Claimed</Pill>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            )}
          </div>

          <div className="space-y-4">
            <SectionCard title="Brand snapshot" description="Frozen at publish.">
              <div className="space-y-2 text-[0.78rem]">
                {[
                  ["Workspace name", branding.workspaceName],
                  ["You are listed as", branding.professionalSingular],
                  ["Your crew is called", branding.professionalPlural],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <span className="text-[#667085]">{k}</span>
                    <span className="font-bold text-[#172033]">{v}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-[0.68rem] text-[#667085]">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                Additional services never change these labels.
              </p>
            </SectionCard>

            {!isEmployee && (
              <SectionCard title="Subcontract and network">
                <div className="space-y-2.5">
                  <StaticCheck label="Accept subcontract work" hint="Lets connected contractors send you work orders." />
                  <StaticCheck label="Appear in the contractor network" />
                </div>
                <Button className="mt-3 w-full" variant="secondary">
                  <Sparkles className="h-3.5 w-3.5" /> Publish profile
                </Button>
              </SectionCard>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {tab === "identity" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <SectionCard
            title="Business identity"
            description="One input per concept. The three amber fields are written to both models on save."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Legal / company name" hint="Printed on quotes, PDFs and invoices">
                <Input defaultValue={isEmployee ? "— employee has no company —" : activeProfile?.businessName} readOnly={isEmployee} />
              </Field>
              <Field label="Workspace name" hint="Leave blank to use the core service name">
                <Input defaultValue={branding.workspaceName} readOnly={isEmployee} />
              </Field>
              <Field label="Headline" hint="One line other contractors see first">
                <Input defaultValue={isEmployee ? "Carpenter, 6 years on site" : "Waterproofing and terrace repainting specialist"} readOnly={isEmployee} />
              </Field>
              <Field label="Tagline">
                <Input defaultValue={isEmployee ? "Fixed in 3 days" : "Fixed in 3 days"} readOnly={isEmployee} />
              </Field>
              <Field label="Base location" required>
                <Input defaultValue={location} readOnly={isEmployee} />
              </Field>
              <Field label="About" hint="What you take on, and what you do not">
                <Textarea
                  rows={3}
                  defaultValue={isEmployee ? "Fitted kitchens and wardrobe repairs." : "We take terrace and bathroom waterproofing, and repaint society flats."}
                  readOnly={isEmployee}
                />
              </Field>

              <Field label={isEmployee ? "Preferred work areas" : "Service areas"} required hint="Comma separated">
                <Input defaultValue={areas} readOnly={isEmployee} />
              </Field>
              <Field label={isEmployee ? "Experience (years)" : "Years in business"}>
                <Input type="number" defaultValue={years ?? ""} readOnly={isEmployee} />
              </Field>
              {!isEmployee && (
                <Field label="Team size" hint="Headcount, not painters — a plumber is not a painter">
                  <Input type="number" defaultValue={team ?? ""} />
                </Field>
              )}
              <Field label="Company logo / owner photo" hint="Existing upload fields">
                <div className="flex items-center gap-2.5 rounded-lg border border-[#e5e9f2] px-3 py-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#176b9b] text-[0.7rem] font-extrabold text-white">
                    {isEmployee ? "IP" : (activeProfile?.logoText ?? "IP")}
                  </span>
                  <span className="text-[0.76rem] font-semibold text-[#475467]">
                    Upload (mock)
                  </span>
                </div>
              </Field>
            </div>

            {isEmployee ? (
              <div className="mt-4 rounded-xl border border-dashed border-[#d0d5dd] bg-[#f9fafb] p-3">
                <p className="flex items-start gap-1.5 text-[0.7rem] text-[#667085]">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                  An Employee writes to <code className="font-mono">painter_profile</code> only.
                  The <code className="font-mono">contractor_profile</code> mirror described below does
                  not apply here, so no dual write happens.
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-[#f5e2b8] bg-[#fdf8ec] p-3">
                <p className="text-[0.72rem] font-bold text-[#8a6a12]">
                  These three are duplicated in the database today
                </p>
                <ul className="mt-2 space-y-1.5">
                  {MIRRORED.map(([label, a, b]) => (
                    <li key={label} className="text-[0.68rem] text-[#8a6a12]">
                      <span className="font-bold">{label}</span> — saved once, written to{" "}
                      <code className="font-mono">{a}</code> and mirrored to{" "}
                      <code className="font-mono">{b}</code>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[0.66rem] text-[#8a6a12]">
                  The contractor directory, QR card and PDF all read the first column, so this is
                  what keeps them consistent.
                </p>
              </div>
            )}
          </SectionCard>

          <div className="space-y-4">
            <SectionCard title="Where these fields are read">
              <ul className="space-y-1.5 text-[0.72rem] text-[#475467]">
                {[
                  "Contractor directory & search",
                  "QR / digital profile card",
                  "Quotation and invoice PDFs",
                  "Network search coverage filter",
                  "Admin dashboards",
                ].map((row) => (
                  <li key={row} className="flex items-start gap-1.5">
                    <BadgeCheck className="mt-0.5 h-3 w-3 shrink-0 text-[#176b9b]" />
                    {row}
                  </li>
                ))}
              </ul>
            </SectionCard>
            <SectionCard title="Removed from this page">
              <p className="flex items-start gap-1.5 text-[0.72rem] text-[#475467]">
                <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                Change-password is no longer here. It exists once at
                <span className="font-bold"> /account-security</span>.
              </p>
            </SectionCard>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {tab === "compliance" && (
        <div className="space-y-4">
          <SectionCard
            title="Contact and tax details"
            description="Moved across unchanged from the old /settings page."
            action={<Pill tone="neutral">ContractorProfile</Pill>}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Owner / proprietor name", "Ravi Menon"],
                ["GSTIN", "29ABCDE1234F1Z5"],
                ["PAN", "ABCDE1234F"],
                ["Contact mobile", "+91 90000 00010"],
                ["Contact email", "ravi.menon@example.invalid"],
                ["Office address", "2nd Floor, Whitefield Main Rd, Bengaluru"],
              ].map(([label, value]) => (
                <Field key={label} label={label}>
                  <Input defaultValue={value} />
                </Field>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Payment details" action={<Pill tone="neutral">ContractorProfile</Pill>}>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Bank account name", "HomeRefix Solutions"],
                ["Account number", "XXXX XXXX 4417"],
                ["IFSC", "HDFC0001742"],
              ].map(([label, value]) => (
                <Field key={label} label={label}>
                  <Input defaultValue={value} />
                </Field>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Certificates and documents" action={<Pill tone="neutral">ContractorProfile</Pill>}>
            <ul className="space-y-1.5">
              {[
                ["GST registration certificate", "Uploaded"],
                ["Trade licence", "Uploaded"],
                ["Insurance certificate", "Missing"],
              ].map(([label, state_]) => (
                <li
                  key={label}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#e5e9f2] px-3 py-2"
                >
                  <span className="text-[0.8rem] text-[#172033]">{label}</span>
                  <Pill tone={state_ === "Uploaded" ? "success" : "warning"}>{state_}</Pill>
                </li>
              ))}
            </ul>
            <Button variant="secondary" className="mt-3">
              <Plus className="h-3.5 w-3.5" /> Upload document
            </Button>
          </SectionCard>

          <SaveBar label="Save compliance" note="One save per tab. Nothing on this tab touches the trade profile." />
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {tab === "presence" && (
        <div className="space-y-4">
          <SectionCard
            title="Online presence"
            description="Moved across unchanged from the old /settings page."
            action={<Pill tone="neutral">ContractorProfile</Pill>}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Website", "https://homerefix.example.invalid"],
                ["Instagram", "@homerefix"],
                ["LinkedIn", "HomeRefix Solutions"],
                ["Google Business", "Listed, unverified"],
              ].map(([label, value]) => (
                <Field key={label} label={label}>
                  <Input defaultValue={value} />
                </Field>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Work skills" description="Plain list, reused by search and the profile card.">
            <Textarea rows={3} defaultValue={"Waterproofing, terrace coating, society flat repaint, putty work"} />
          </SectionCard>

          <SaveBar label="Save presence" note="Social links are fictional in this preview. Nothing is sent anywhere." />
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      <SectionCard title="How this replaces the two old pages">
        <div className="grid gap-2 text-[0.74rem] sm:grid-cols-3">
          {[
            ["Old", "/settings — company details", "→ tab 2, 3 and 4"],
            ["Old", "/provider-profile — trade", "→ tab 1, unchanged"],
            ["New", "/settings — everything", "Legacy profile routes redirect here"],
          ].map(([tag, from, to]) => (
            <div key={from} className="rounded-lg border border-[#e5e9f2] p-3">
              <p className="flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-wide text-[#667085]">
                {tag === "Old" ? <Building2 className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                {tag}
              </p>
              <p className="mt-1 font-bold text-[#172033]">{from}</p>
              <p className="text-[#667085]">{to}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
