// ============================================================================
// PREVIEW SCREENS A–E: registration, profiles, admin catalogue, branding
// ============================================================================

import { useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  Building2,
  Check,
  HardHat,
  Info,
  Plus,
  Power,
  Ruler,
  Users,
} from "lucide-react";
import { ALL_UNITS, CLEANING_CATEGORY_TEMPLATE, formulaSupport } from "../data";
import { PROVIDER_REGISTRATION_TYPES as REG_TYPES, ROLE_TERMS } from "../branding";
import { usePreview } from "../state";
import {
  Button,
  CategoryIcon,
  Checkbox,
  Field,
  Input,
  PageHeader,
  Pill,
  PreviewBanner,
  SectionCard,
  SimulatedTag,
  StatCard,
  StatGrid,
  UnsupportedNote,
} from "../components";

const SLUG = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ===========================================================================
// SCREEN A — Provider registration choice: Contractor / Employee
// ===========================================================================
export function ScreenRegistration() {
  const { dispatch } = usePreview();
  const [choice, setChoice] = useState("CONTRACTOR");
  const [completeLater, setCompleteLater] = useState(true);
  const [saved, setSaved] = useState(null);

  const identityFields = [
    { label: "Full name", value: "Meera Iyer", required: true },
    { label: "Mobile", value: "+91 90000 00099", required: true },
    { label: "Email", value: "meera.iyer@example.invalid", required: false },
    { label: "Password", value: "(hashed — never captured in preview)", required: true },
  ];
  const selected = REG_TYPES.find((t) => t.identifier === choice);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Screen A · Registration"
        title="Create your provider account"
        description="Identity and login are collected here. Profession selection happens afterwards, in profile completion."
        actions={<SimulatedTag>Simulated form</SimulatedTag>}
      />
      <PreviewBanner />

      <SectionCard title="Existing required identity & login information">
        <div className="grid gap-3 sm:grid-cols-2">
          {identityFields.map((f) => (
            <Field key={f.label} label={f.label} required={f.required} hint={f.required ? "Required today" : "Optional"}>
              <Input defaultValue={f.value} readOnly />
            </Field>
          ))}
        </div>
        <UnsupportedNote>
          These fields match the existing registration payloads. The preview does not submit them anywhere.
        </UnsupportedNote>
      </SectionCard>

      <SectionCard
        title="Provider account type"
        description="Exactly two provider choices. Vendor is not a third account type."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {REG_TYPES.map((t) => {
            const active = choice === t.identifier;
            const Icon = t.identifier === "CONTRACTOR" ? Building2 : HardHat;
            return (
              <button
                key={t.identifier}
                onClick={() => setChoice(t.identifier)}
                className={`rounded-xl border p-4 text-left transition ${
                  active ? "border-[#176b9b] bg-[#f2f7fb] ring-1 ring-[#176b9b]/15" : "border-[#e5e9f2] hover:border-[#c7d0de]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? "bg-[#176b9b] text-white" : "bg-[#eef2ff] text-[#4f46e5]"}`}>
                    <Icon size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.95rem] font-extrabold text-[#172033]">{t.label}</p>
                    {t.note && <p className="mt-0.5 text-[0.66rem] font-semibold text-[#98a2b3]">{t.note}</p>}
                    <p className="mt-1.5 text-[0.76rem] leading-relaxed text-[#667085]">{t.blurb}</p>
                  </div>
                  {active && <Check size={18} className="shrink-0 text-[#176b9b]" />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-[#e5e9f2] bg-[#f9fafb] p-3.5">
          <p className="text-[0.78rem] font-bold text-[#172033]">Interface label vs internal role constant</p>
          <p className="mt-1 text-[0.72rem] leading-relaxed text-[#667085]">
            The screen says <strong>Employee</strong>. The stored role stays{" "}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-[0.68rem]">{selected?.internalRole ?? "CONTRACTOR"}</code> so
            existing {ROLE_TERMS.PAINTER} accounts and APIs keep working. Only the label changed.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="After registration: profession is a separate step">
        <div className="flex flex-wrap items-center gap-2.5">
          <Checkbox checked={completeLater} onChange={setCompleteLater} label="Complete later" hint="Leaves the profile as a draft with a completion meter." />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setSaved({ choice, completeLater });
              if (choice === "CONTRACTOR") {
                dispatch({ type: "SET_PROFILE_DRAFT", personaKey: "main", personaId: "main", value: completeLater });
              }
            }}
          >
            Simulate registration
          </Button>
          {saved && (
            <Pill tone="success">
              Simulated: {REG_TYPES.find((t) => t.identifier === saved.choice)?.label}
              {saved.completeLater ? " · draft profile" : " · profile required"}
            </Pill>
          )}
        </div>
        <UnsupportedNote>
          A draft profile cannot publish, apply for work, or accept an assignment until the minimum details exist.
        </UnsupportedNote>
      </SectionCard>

      <SectionCard title="The same contractor can do all of this at once">
        <StatGrid cols="sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Direct customer projects", true],
            ["Outsource part of a project", true],
            ["Receive outsourced work", true],
            ["Manage own employees", true],
          ].map(([label]) => (
            <StatCard key={label} icon={Check} label={label} value="Supported" tone="success" />
          ))}
        </StatGrid>
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// SCREEN B — Contractor profile: core service + additional services
// ===========================================================================
export function ScreenContractorProfile() {
  const { state, dispatch } = usePreview();
  const profile = state.profiles.main;
  const catalogue = state.catalogue;
  const active = catalogue.filter((c) => c.isActive);
  const core = catalogue.find((c) => c.identifier === profile.coreServiceIdentifier);
  const additionalCats = catalogue.filter(
    (c) => c.isActive && c.identifier !== profile.coreServiceIdentifier && profile.additionalServiceIdentifiers.includes(c.identifier),
  );
  const selectedSubs = additionalCats.flatMap((c) =>
    c.subServices
      .filter((s) => s.isActive !== false && profile.additionalSubServiceIdentifiers.includes(s.identifier))
      .map((s) => ({ category: c, sub: s })),
  );

  const canPublish =
    !!profile.businessName && !!profile.baseLocation && !!profile.coreServiceIdentifier;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Screen B · Contractor profile"
        title="Core service and additional services"
        description="One core service drives branding. Additional services are explicit and never change it."
        actions={<SimulatedTag>Mock profile</SimulatedTag>}
      />
      <PreviewBanner />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <SectionCard
            title="Business identity"
            description="Existing personal and business fields, unchanged."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Business name" required>
                <Input defaultValue={profile.businessName} readOnly />
              </Field>
              <Field label="Business logo" hint="Existing logo + shape fields">
                <div className="flex items-center gap-2.5 rounded-lg border border-[#e5e9f2] px-3 py-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#176b9b] text-[0.7rem] font-extrabold text-white">
                    {profile.logoText}
                  </span>
                  <span className="text-[0.76rem] font-semibold text-[#475467]">{profile.businessName}.png</span>
                </div>
              </Field>
              <Field label="Base location" required>
                <Input defaultValue={profile.baseLocation} readOnly />
              </Field>
              <Field label="Years in business">
                <Input defaultValue={profile.yearsInBusiness} readOnly />
              </Field>
              <Field label="Service areas" required hint="Comma separated, stored as the existing list field">
                <Input defaultValue={profile.serviceAreas.join(", ")} readOnly />
              </Field>
              <Field label="Team size">
                <Input defaultValue={profile.numberOfEmployees} readOnly />
              </Field>
            </div>
          </SectionCard>

          <SectionCard
            title="Core service — exactly one"
            description="Changing this changes your workspace heading."
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((c) => {
                const isCore = c.identifier === profile.coreServiceIdentifier;
                return (
                  <button
                    key={c.identifier}
                    onClick={() => dispatch({ type: "SET_CORE_SERVICE", personaKey: "main", personaId: "main", identifier: c.identifier })}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                      isCore ? "border-[#176b9b] bg-[#f2f7fb] ring-1 ring-[#176b9b]/15" : "border-[#e5e9f2] hover:border-[#c7d0de]"
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
            {catalogue.some((c) => !c.isActive) && (
              <UnsupportedNote>
                Inactive categories are hidden here. They cannot be newly selected, but existing references are preserved.
              </UnsupportedNote>
            )}
          </SectionCard>

          <SectionCard
            title="Additional services"
            description="Add or remove extra services without touching your core identity."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {active
                .filter((c) => c.identifier !== profile.coreServiceIdentifier)
                .map((c) => {
                  const on = profile.additionalServiceIdentifiers.includes(c.identifier);
                  return (
                    <Checkbox
                      key={c.identifier}
                      checked={on}
                      onChange={() =>
                        dispatch({
                          type: "TOGGLE_ADDITIONAL_SERVICE",
                          personaKey: "main",
                          personaId: "main",
                          identifier: c.identifier,
                          selected: !on,
                        })
                      }
                      label={`${c.name} — ${c.contractorLabel}`}
                      hint="Selecting a category does not claim every sub-service."
                    />
                  );
                })}
            </div>
          </SectionCard>

          <SectionCard
            title="Individual sub-services you actually offer"
            description="Pick the specific work, not just the category."
          >
            <div className="space-y-3">
              {additionalCats.map((c) => (
                <div key={c.identifier}>
                  <p className="mb-2 flex items-center gap-1.5 text-[0.75rem] font-bold text-[#172033]">
                    <CategoryIcon name={c.icon} size={14} /> {c.name}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {c.subServices
                      .filter((s) => s.isActive !== false)
                      .map((s) => {
                        const on = profile.additionalSubServiceIdentifiers.includes(s.identifier);
                        return (
                          <Checkbox
                            key={s.identifier}
                            checked={on}
                            onChange={() =>
                              dispatch({
                                type: "TOGGLE_ADDITIONAL_SUBSERVICE",
                                personaKey: "main",
                                personaId: "main",
                                subServiceIdentifier: s.identifier,
                                selected: !on,
                              })
                            }
                            label={s.name}
                          />
                        );
                      })}
                  </div>
                </div>
              ))}
              {additionalCats.length === 0 && (
                <p className="text-[0.78rem] text-[#667085]">
                  No additional services selected. Add one above to choose sub-services.
                </p>
              )}
            </div>
            {selectedSubs.some((s) => s.category.identifier === "tile-work") && (
              <div className="mt-3 rounded-xl border border-[#dbe7f3] bg-[#f5f9fd] p-3">
                <p className="text-[0.75rem] font-bold text-[#1d4e6f]">Tile Grouting selected alone</p>
                <p className="mt-1 text-[0.72rem] leading-relaxed text-[#475467]">
                  You claimed only Tile Grouting — not Tile Installation or Tile Repair — while your core service and
                  workspace branding stay unchanged.
                </p>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Preview result">
            <div className="rounded-xl border border-[#e5e9f2] bg-[#f9fafb] p-3.5">
              <p className="text-[0.66rem] font-bold uppercase tracking-wide text-[#98a2b3]">Workspace heading</p>
              <p className="mt-0.5 text-lg font-extrabold text-[#172033]">{core?.workspaceName ?? "Bharath Apps"}</p>
              <p className="mt-1 text-[0.74rem] text-[#667085]">
                You are listed as a <strong>{core?.contractorLabel}</strong>
              </p>
              <div className="mt-3 border-t border-[#e5e9f2] pt-3">
                <p className="text-[0.66rem] font-bold uppercase tracking-wide text-[#98a2b3]">Additional services</p>
                {additionalCats.length === 0 ? (
                  <p className="mt-0.5 text-[0.76rem] text-[#667085]">None</p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {additionalCats.map((c) => (
                      <Pill key={c.identifier} tone="info">{c.name}</Pill>
                    ))}
                    {selectedSubs.map(({ sub }) => (
                      <Pill key={sub.identifier} tone="neutral">{sub.name}</Pill>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Publish readiness">
            <ul className="space-y-2">
              {[
                ["Business name", !!profile.businessName],
                ["Base location", !!profile.baseLocation],
                ["Core service", !!profile.coreServiceIdentifier],
                ["Service areas", profile.serviceAreas.length > 0],
              ].map(([label, ok]) => (
                <li key={label} className="flex items-center justify-between gap-2 text-[0.78rem]">
                  <span className="text-[#475467]">{label}</span>
                  {ok ? <Pill tone="success">Ready</Pill> : <Pill tone="warning">Missing</Pill>}
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <Checkbox
                checked={profile.profileDraft}
                onChange={(v) => dispatch({ type: "SET_PROFILE_DRAFT", personaKey: "main", personaId: "main", value: v })}
                label="Keep as draft (Complete later)"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={!canPublish}>Publish profile</Button>
              {!canPublish && <UnsupportedNote>Publishing requires the minimum details above.</UnsupportedNote>}
            </div>
            {profile.profileDraft && (
              <div className="mt-2">
                <p className="text-[0.72rem] text-[#667085]">
                  Draft at {profile.profileCompletionPercent}% — cannot publish, apply for work, or accept an assignment.
                </p>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Team management">
            <p className="text-[0.78rem] leading-relaxed text-[#475467]">
              {profile.teamManagement.canCreateEmployees ? "Enabled" : "Disabled"} — reuses the existing invitation and
              acceptance flow.
            </p>
            <p className="mt-2 text-[0.72rem] text-[#667085]">
              An Employee is not a team member until they accept. The preview does not send invitations.
            </p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// SCREEN C — Employee profile: primary trade + additional skills
// ===========================================================================
export function ScreenEmployeeProfile() {
  const { state, dispatch } = usePreview();
  const emp = state.employee;
  const catalogue = state.catalogue.filter((c) => c.isActive);
  const primary = catalogue.find((c) => c.identifier === emp.primaryTradeIdentifier);
  const extra = catalogue.filter((c) => emp.additionalSkillIdentifiers.includes(c.identifier));
  const extraSubs = extra.flatMap((c) =>
    c.subServices.filter((s) => emp.additionalSubServiceIdentifiers.includes(s.identifier)).map((s) => ({ c, s })),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Screen C · Employee profile"
        title="Primary trade and additional skills"
        description="Existing PAINTER role, presented with the Employee label."
        actions={<SimulatedTag>Mock profile</SimulatedTag>}
      />
      <PreviewBanner />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <SectionCard title="Personal & contact details">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name"><Input defaultValue={emp.name} readOnly /></Field>
              <Field label="Age"><Input defaultValue={emp.age} readOnly /></Field>
              <Field label="Mobile"><Input defaultValue={emp.phone} readOnly /></Field>
              <Field label="Email"><Input defaultValue={emp.email} readOnly /></Field>
              <Field label="Work location" required><Input defaultValue={emp.workLocation} readOnly /></Field>
              <Field label="Preferred work areas" required><Input defaultValue={emp.preferredWorkAreas.join(", ")} readOnly /></Field>
              <Field label="Experience (years)"><Input defaultValue={emp.experienceYears} readOnly /></Field>
            </div>
          </SectionCard>

          <SectionCard title="Primary trade — exactly one">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {catalogue.map((c) => {
                const isPrimary = c.identifier === emp.primaryTradeIdentifier;
                return (
                  <button
                    key={c.identifier}
                    onClick={() => dispatch({ type: "TOGGLE_EMPLOYEE_TRADE", kind: "primary", identifier: c.identifier })}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                      isPrimary ? "border-[#176b9b] bg-[#f2f7fb] ring-1 ring-[#176b9b]/15" : "border-[#e5e9f2] hover:border-[#c7d0de]"
                    }`}
                  >
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isPrimary ? "bg-[#176b9b] text-white" : "bg-[#eef2ff] text-[#4f46e5]"}`}>
                      <CategoryIcon name={c.icon} size={15} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[0.82rem] font-bold text-[#172033]">{c.name}</p>
                      <p className="truncate text-[0.66rem] text-[#667085]">{c.employeeSingular}</p>
                      {isPrimary && <Pill tone="success" className="mt-1">Primary trade</Pill>}
                    </div>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Additional skills">
            <div className="grid gap-2 sm:grid-cols-2">
              {catalogue
                .filter((c) => c.identifier !== emp.primaryTradeIdentifier)
                .map((c) => {
                  const on = emp.additionalSkillIdentifiers.includes(c.identifier);
                  return (
                    <Checkbox
                      key={c.identifier}
                      checked={on}
                      onChange={() => dispatch({ type: "TOGGLE_EMPLOYEE_TRADE", kind: "additional", identifier: c.identifier })}
                      label={`${c.name}`}
                      hint={`${c.employeePlural} · ${c.subServices.length} sub-services available`}
                    />
                  );
                })}
            </div>
          </SectionCard>

          {extra.length > 0 && (
            <SectionCard title="Individual sub-skills">
              <div className="space-y-3">
                {extra.map((c) => (
                  <div key={c.identifier}>
                    <p className="mb-2 flex items-center gap-1.5 text-[0.75rem] font-bold text-[#172033]">
                      <CategoryIcon name={c.icon} size={14} /> {c.name}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {c.subServices.filter((s) => s.isActive !== false).map((s) => {
                        const on = emp.additionalSubServiceIdentifiers.includes(s.identifier);
                        return (
                          <Checkbox
                            key={s.identifier}
                            checked={on}
                            onChange={() => dispatch({ type: "TOGGLE_EMPLOYEE_SUBSKILL", subServiceIdentifier: s.identifier })}
                            label={s.name}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        <div className="space-y-4">
          <SectionCard title="Preview result">
            <div className="rounded-xl border border-[#e5e9f2] bg-[#f9fafb] p-3.5">
              <p className="text-[0.66rem] font-bold uppercase tracking-wide text-[#98a2b3]">Workspace heading</p>
              <p className="mt-0.5 text-lg font-extrabold text-[#172033]">{primary?.workspaceName ?? "Bharath Apps"}</p>
              <p className="mt-1 text-[0.74rem] text-[#667085]">You appear as an {primary?.employeeSingular ?? "Employee"}</p>
              <div className="mt-3 border-t border-[#e5e9f2] pt-3">
                <p className="text-[0.66rem] font-bold uppercase tracking-wide text-[#98a2b3]">Role storage</p>
                <p className="mt-0.5 text-[0.78rem] font-semibold text-[#172033]">{emp.internalRoleLabel}</p>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-[#667085]">
                  The stored constant is untouched. No existing account is renamed.
                </p>
              </div>
              {extraSubs.length > 0 && (
                <div className="mt-3 border-t border-[#e5e9f2] pt-3">
                  <p className="text-[0.66rem] font-bold uppercase tracking-wide text-[#98a2b3]">Extra skills</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {extraSubs.map(({ s }) => (<Pill key={s.identifier} tone="info">{s.name}</Pill>))}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Availability">
            <p className="text-[0.78rem] text-[#475467]">
              {emp.availability.status} from {emp.availability.availableFrom}
            </p>
            <p className="mt-1 text-[0.72rem] text-[#667085]">{emp.availability.weeklyDays.join(" · ")}</p>
            <UnsupportedNote>{emp.availability.note}</UnsupportedNote>
          </SectionCard>

          <SectionCard title="Wage preferences">
            <p className="text-[0.8rem] font-bold text-[#172033]">₹{emp.wagePreference.expectedDaily} / day</p>
            <UnsupportedNote>{emp.wagePreference.note}</UnsupportedNote>
          </SectionCard>

          <SectionCard title="Team membership">
            <div className="flex items-center gap-2">
              <Users size={15} className="text-[#667085]" />
              <p className="text-[0.8rem] font-bold text-[#172033]">{emp.teamMembership.status}</p>
              <Pill tone="success">{emp.teamMembership.contractorId === "receiving" ? "Vista Living Interiors" : ""}</Pill>
            </div>
            <p className="mt-1.5 text-[0.72rem] leading-relaxed text-[#667085]">{emp.teamMembership.note}</p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// SCREEN D — Admin service catalogue
// ===========================================================================
export function ScreenAdminCatalogue() {
  const { state, dispatch } = usePreview();
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({
    name: CLEANING_CATEGORY_TEMPLATE.name,
    workspaceName: CLEANING_CATEGORY_TEMPLATE.workspaceName,
    contractorLabel: CLEANING_CATEGORY_TEMPLATE.contractorLabel,
    employeeSingular: CLEANING_CATEGORY_TEMPLATE.employeeSingular,
    employeePlural: CLEANING_CATEGORY_TEMPLATE.employeePlural,
    icon: CLEANING_CATEGORY_TEMPLATE.icon,
    units: CLEANING_CATEGORY_TEMPLATE.units,
    subServices: CLEANING_CATEGORY_TEMPLATE.subServices,
  });
  const [newSub, setNewSub] = useState({ identifier: "", name: "" });
  const [newSubTarget, setNewSubTarget] = useState(state.catalogue[0]?.identifier ?? "");
  const [created, setCreated] = useState(null);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const cleaningExists = state.catalogue.some((c) => c.identifier === "cleaning");

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Screen D · Admin catalogue"
        title="Service catalogue"
        description="Extends the existing service master data. Reuses the existing pricing units and ordering."
        actions={
          <>
            <SimulatedTag>Mock admin</SimulatedTag>
            <Button onClick={() => setShowForm((v) => !v)}>
              <Plus size={14} /> {showForm ? "Hide" : "Create category"}
            </Button>
          </>
        }
      />
      <PreviewBanner />

      <SectionCard
        title="Existing pricing units"
        description="Reused as-is. A category may only offer units that already exist."
      >
        <div className="flex flex-wrap gap-1.5">
          {ALL_UNITS.map((u) => (<Pill key={u.identifier} tone="neutral"><Ruler size={11} className="mr-1 inline" />{u.name}</Pill>))}
        </div>
      </SectionCard>

      {showForm && (
        <SectionCard
          title="Create a service category"
          description="Pre-filled with the Cleaning example. Saving adds it to every provider's selection list immediately — no code change."
          action={<Pill tone="info">Admin only</Pill>}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Category name" required>
              <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Stable identifier" required hint="Lowercase slug. Never changes once in use.">
              <Input value={SLUG(draft.name)} onChange={(e) => set("name", e.target.value)} readOnly className="font-mono" />
            </Field>
            <Field label="Workspace display name" required>
              <Input value={draft.workspaceName} onChange={(e) => set("workspaceName", e.target.value)} />
            </Field>
            <Field label="Contractor professional label" required>
              <Input value={draft.contractorLabel} onChange={(e) => set("contractorLabel", e.target.value)} />
            </Field>
            <Field label="Employee singular label" required>
              <Input value={draft.employeeSingular} onChange={(e) => set("employeeSingular", e.target.value)} />
            </Field>
            <Field label="Employee plural label" required>
              <Input value={draft.employeePlural} onChange={(e) => set("employeePlural", e.target.value)} />
            </Field>
            <Field label="Icon" hint="From the shared icon set">
              <select
                value={draft.icon}
                onChange={(e) => set("icon", e.target.value)}
                className="w-full rounded-lg border border-[#d9deea] bg-white px-3 py-2 text-sm"
              >
                {["paintbrush", "droplet", "zap", "hammer", "layers", "sparkles", "shield-check", "grid", "boxes"].map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-3">
            <p className="mb-1.5 text-[0.72rem] font-bold uppercase tracking-wide text-[#475467]">Applicable units</p>
            <div className="flex flex-wrap gap-2">
              {ALL_UNITS.map((u) => {
                const on = draft.units.includes(u.identifier);
                return (
                  <Checkbox
                    key={u.identifier}
                    checked={on}
                    onChange={() => set("units", on ? draft.units.filter((x) => x !== u.identifier) : [...draft.units, u.identifier])}
                    label={u.name}
                  />
                );
              })}
            </div>
          </div>

          <div className="mt-3">
            <p className="mb-1.5 text-[0.72rem] font-bold uppercase tracking-wide text-[#475467]">Sub-services</p>
            <div className="space-y-1.5">
              {draft.subServices.map((s) => (
                <div key={s.identifier} className="flex items-center gap-2 rounded-lg border border-[#e5e9f2] px-3 py-2">
                  <span className="text-[0.78rem] font-bold text-[#172033]">{s.name}</span>
                  <code className="rounded bg-[#f4f6fa] px-1.5 py-0.5 font-mono text-[0.66rem] text-[#667085]">{s.identifier}</code>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              disabled={!draft.name || !draft.workspaceName || !draft.contractorLabel || draft.units.length === 0}
              onClick={() => {
                dispatch({
                  type: "CREATE_CATEGORY",
                  category: {
                    name: draft.name,
                    identifier: SLUG(draft.name),
                    workspaceName: draft.workspaceName,
                    contractorLabel: draft.contractorLabel,
                    employeeSingular: draft.employeeSingular,
                    employeePlural: draft.employeePlural,
                    icon: draft.icon,
                    units: draft.units,
                    subServices: draft.subServices,
                  },
                });
                setCreated(SLUG(draft.name));
                setShowForm(false);
              }}
            >
              Create category
            </Button>
            {created && <Pill tone="success">Created “{created}” — now selectable by providers</Pill>}
            {cleaningExists && <Pill tone="warning">Cleaning already exists</Pill>}
          </div>
          <UnsupportedNote>
            Admins can create categories and sub-services using existing functionality. Admin configuration does not create
            new calculation engines — unit and formula behaviour stays as implemented in code.
          </UnsupportedNote>
        </SectionCard>
      )}

      <SectionCard
        title="Add a sub-service to an existing category"
        description="Sub-services are added without code changes."
      >
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Category">
            <select
              value={newSubTarget}
              onChange={(e) => setNewSubTarget(e.target.value)}
              className="w-full rounded-lg border border-[#d9deea] bg-white px-3 py-2 text-sm"
            >
              {state.catalogue.map((c) => (<option key={c.identifier} value={c.identifier}>{c.name}</option>))}
            </select>
          </Field>
          <Field label="Sub-service name">
            <Input placeholder="e.g. POP False Ceiling" value={newSub.name} onChange={(e) => setNewSub((s) => ({ ...s, name: e.target.value }))} />
          </Field>
          <Button
            onClick={() => {
              if (!newSub.name.trim()) return;
              dispatch({
                type: "ADD_SUB_SERVICE",
                identifier: newSubTarget,
                subService: { name: newSub.name.trim(), identifier: SLUG(newSub.name) },
              });
              setNewSub({ name: "", identifier: "" });
            }}
          >
            <Plus size={14} /> Add sub-service
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Categories" description="Deactivation blocks new selection but keeps every existing reference." dense>
        <div className="divide-y divide-[#e5e9f2]">
          {state.catalogue
            .slice()
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((c) => (
              <div key={c.identifier} className={`p-3.5 ${c.isActive ? "" : "bg-[#f9fafb]"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${c.isActive ? "bg-[#eef2ff] text-[#4f46e5]" : "bg-[#f4f6fa] text-[#98a2b3]"}`}>
                      <CategoryIcon name={c.icon} size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[0.88rem] font-bold text-[#172033]">
                        {c.name}
                        <code className="rounded bg-[#f4f6fa] px-1.5 py-0.5 font-mono text-[0.64rem] font-medium text-[#667085]">{c.identifier}</code>
                        <Pill tone={c.isActive ? "success" : "neutral"}>{c.isActive ? "Active" : "Inactive"}</Pill>
                        {!c.seededByAdmin && <Pill tone="info">Added in preview</Pill>}
                      </p>
                      <p className="mt-0.5 text-[0.72rem] text-[#667085]">
                        Workspace <strong>{c.workspaceName}</strong> · Contractor <strong>{c.contractorLabel}</strong> · Employee{" "}
                        <strong>{c.employeeSingular}/{c.employeePlural}</strong>
                      </p>
                      <p className="mt-1 text-[0.7rem] text-[#98a2b3]">
                        Order {c.displayOrder} · Units: {c.units.map((u) => ALL_UNITS.find((x) => x.identifier === u)?.name ?? u).join(", ")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.subServices.map((s) => (
                          <span
                            key={s.identifier}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[0.7rem] ${
                              s.isActive === false
                                ? "border-[#e5e9f2] bg-[#f4f6fa] text-[#98a2b3] line-through"
                                : "border-[#e5e9f2] bg-white text-[#475467]"
                            }`}
                          >
                            {s.name}
                            <button
                              onClick={() =>
                                dispatch({
                                  type: "TOGGLE_SUB_SERVICE",
                                  categoryIdentifier: c.identifier,
                                  subServiceIdentifier: s.identifier,
                                  isActive: s.isActive !== false,
                                })
                              }
                              className="ml-0.5 text-[#98a2b3] hover:text-[#172033]"
                              title={s.isActive === false ? "Reactivate" : "Deactivate"}
                            >
                              <Power size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Button
                      variant="secondary"
                      onClick={() => dispatch({ type: "TOGGLE_CATEGORY_ACTIVE", identifier: c.identifier, isActive: c.isActive })}
                    >
                      <Power size={13} /> {c.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => dispatch({ type: "UPDATE_CATEGORY", identifier: c.identifier, patch: { displayOrder: Math.max(1, c.displayOrder - 1) } })}
                        className="rounded-md border border-[#e5e9f2] px-2 py-1 text-[0.7rem] hover:bg-[#f4f6fa]"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => dispatch({ type: "UPDATE_CATEGORY", identifier: c.identifier, patch: { displayOrder: c.displayOrder + 1 } })}
                        className="rounded-md border border-[#e5e9f2] px-2 py-1 text-[0.7rem] hover:bg-[#f4f6fa]"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 rounded-lg border border-dashed border-[#e5e9f2] bg-white px-3 py-2">
                  <p className="flex items-start gap-1.5 text-[0.7rem] text-[#667085]">
                    <Info size={12} className="mt-0.5 shrink-0" />
                    <span>{formulaSupport(c.identifier).description}</span>
                  </p>
                </div>
              </div>
            ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// SCREEN E — Personalised workspace heading and labels
// ===========================================================================
export function ScreenWorkspaceBranding() {
  const { state, branding } = usePreview();
  const [previewKey, setPreviewKey] = useState("painting");

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Screen E · Branding"
        title="Personalised workspace heading and labels"
        description="Resolved centrally from the core service. Additional services are excluded by design."
        actions={<SimulatedTag>Resolver demo</SimulatedTag>}
      />
      <PreviewBanner />

      <SectionCard title="Your live workspace heading">
        <div className="rounded-xl border border-[#e5e9f2] bg-[#f9fafb] p-4">
          <p className="text-[0.66rem] font-bold uppercase tracking-wide text-[#98a2b3]">Parent platform (never changes)</p>
          <p className="mt-0.5 text-[0.95rem] font-extrabold text-[#176b9b]">Bharath Apps</p>
          <p className="mt-3 text-[0.66rem] font-bold uppercase tracking-wide text-[#98a2b3]">Personalised workspace</p>
          <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-[#172033]">{branding.workspaceName}</p>
          <p className="mt-1.5 text-[0.8rem] text-[#667085]">
            Professional label: <strong>{branding.professionalSingular}</strong> · Employee label:{" "}
            <strong>{branding.employeeSingular}/{branding.employeePlural}</strong>
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Try each core service">
        <div className="flex flex-wrap gap-1.5">
          {state.catalogue.map((c) => (
            <button
              key={c.identifier}
              onClick={() => setPreviewKey(c.identifier)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.74rem] font-semibold ${
                previewKey === c.identifier ? "border-[#176b9b] bg-[#f2f7fb] text-[#172033]" : "border-[#e5e9f2] text-[#667085] hover:border-[#c7d0de]"
              }`}
            >
              <CategoryIcon name={c.icon} size={13} /> {c.name}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            ["Workspace heading", state.catalogue.find((c) => c.identifier === previewKey)?.workspaceName],
            ["Contractor label", state.catalogue.find((c) => c.identifier === previewKey)?.contractorLabel],
            ["Employee labels", `${state.catalogue.find((c) => c.identifier === previewKey)?.employeeSingular} / ${state.catalogue.find((c) => c.identifier === previewKey)?.employeePlural}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-[#e5e9f2] bg-white p-3">
              <p className="text-[0.64rem] font-bold uppercase tracking-wide text-[#98a2b3]">{k}</p>
              <p className="mt-0.5 text-[0.92rem] font-bold text-[#172033]">{v}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Generic modules keep generic names">
        <div className="flex flex-wrap gap-1.5">
          {["Customers", "Opportunities", "Measurements", "Quotations", "Jobs", "Calendar", "Invoices", "Payments", "Messages"].map((m) => (
            <Pill key={m} tone="neutral">{m}</Pill>
          ))}
        </div>
        <UnsupportedNote>
          These names do not change for a Plumber, a Cleaner or an Interior Professional.
        </UnsupportedNote>
      </SectionCard>

      <SectionCard title="Additional services must not change the core identity">
        <div className="rounded-xl border border-[#dbe7f3] bg-[#f5f9fd] p-4">
          <p className="text-[0.78rem] font-bold text-[#1d4e6f]">HomeRefix — worked example from the brief</p>
          <ul className="mt-2 space-y-1 text-[0.76rem] text-[#475467]">
            <li>Core service: <strong>Painting</strong></li>
            <li>Additional services: Bathroom Waterproofing, Tile Grouting, False Ceiling</li>
            <li>
              Workspace: <strong className="text-[#176b9b]">Bharath Painters</strong>
            </li>
          </ul>
          <p className="mt-2 text-[0.74rem] text-[#667085]">
            The workspace stays Bharath Painters because the core service is Painting. Selecting False Ceiling as an
            additional service does not rename it.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Historical records are never relabelled">
        <div className="rounded-xl border border-dashed border-[#e5e9f2] bg-white p-3.5">
          <p className="flex items-start gap-2 text-[0.76rem] font-bold text-[#b42318]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> “Wall Painting” stays “Wall Painting”
          </p>
          <div className="mt-2 space-y-1.5">
            {state.project.customerQuotation.historicalLineItems.map((h) => (
              <div key={h.id} className="rounded-lg border border-[#e5e9f2] bg-[#f9fafb] px-3 py-2">
                <p className="text-[0.76rem] font-semibold text-[#172033]">{h.descriptionSnapshot}</p>
                <p className="text-[0.68rem] text-[#667085]">
                  Quotation {h.quotationNumber} · issued {h.issuedOn}
                </p>
                <p className="mt-1 text-[0.68rem] text-[#176b9b]">Rendered from its own snapshot. Branding does not rewrite it.</p>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="A new admin-created category becomes selectable immediately">
        <p className="text-[0.78rem] leading-relaxed text-[#475467]">
          The catalogue below is read live from preview state. Create Cleaning on screen D, then open screen B or C — it
          appears with no code change and no reload.
        </p>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {state.catalogue.map((c) => (
            <div key={c.identifier} className={`rounded-lg border px-3 py-2 ${c.isActive ? "border-[#e5e9f2] bg-white" : "border-[#e5e9f2] bg-[#f9fafb] opacity-60"}`}>
              <p className="flex items-center gap-1.5 text-[0.78rem] font-bold text-[#172033]">
                <CategoryIcon name={c.icon} size={13} /> {c.name}
              </p>
              <p className="text-[0.66rem] text-[#667085]">{c.workspaceName}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Contractor Network is available to every contractor">
        <div className="grid gap-2 sm:grid-cols-3">
          {[<BriefcaseBusiness key="n" />, <Users key="t" />, <Building2 key="b" />].map((icon, i) => (
            <div key={i} className="rounded-lg border border-[#e5e9f2] bg-white px-3 py-2.5 text-[0.78rem] font-semibold text-[#172033]">
              {["Contractor Network", "Work Outsourced", "Work Received"][i]}
            </div>
          ))}
        </div>
        <UnsupportedNote>Available to both contractor personas regardless of core service.</UnsupportedNote>
      </SectionCard>
    </div>
  );
}

