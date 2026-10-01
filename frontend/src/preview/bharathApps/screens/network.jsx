// ============================================================================
// PREVIEW SCREENS F–H: contractor network, project detail, request subcontract
// ============================================================================

import { useMemo, useState } from "react";
import {
  Ban,
  CalendarDays,
  Check,
  Handshake,
  Info,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Star,
  UserPlus,
} from "lucide-react";
import { formulaSupport } from "../data";
import { canPerform, STATUS_META, TRANSITION_LABELS, usePreview, WORK_ORDER_FLOW } from "../state";
import {
  Button,
  CategoryIcon,
  Checkbox,
  DeniedPanel,
  Field,
  Input,
  KeyValue,
  PageHeader,
  Pill,
  PreviewBanner,
  SectionCard,
  SimulatedTag,
  Textarea,
  UnsupportedNote,
  VerifiedTag,
  money,
} from "../components";

// ===========================================================================
// SCREEN F — Contractor Network
// ===========================================================================
export function ScreenNetwork() {
  const { state, dispatch } = usePreview();
  const [query, setQuery] = useState("");
  const [service, setService] = useState("");
  const [subService, setSubService] = useState("");
  const [location, setLocation] = useState("");
  const [openProfile, setOpenProfile] = useState(null);
  const [contactForm, setContactForm] = useState({ contactName: "", phone: "", email: "", note: "" });

  const activeCategories = state.catalogue.filter((c) => c.isActive);
  const connections = state.connections;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const loc = location.trim().toLowerCase();
    return state.directory
      // Opted-out contractors must never appear in discovery.
      .filter((d) => d.networkOptIn)
      .filter((d) => d.contractorKey !== "main")
      .filter((d) => {
        if (service && d.coreServiceIdentifier !== service) return false;
        if (subService && !d.additionalSubServiceIdentifiers.includes(subService)) return false;
        if (loc) {
          // Coverage is what matters, not just the office address.
          const covered = [d.baseLocation, ...d.serviceAreas].join(" ").toLowerCase();
          if (!covered.includes(loc)) return false;
        }
        if (!q) return true;
        return `${d.businessName} ${d.baseLocation}`.toLowerCase().includes(q);
      })
      .map((d) => {
        const cat = state.catalogue.find((c) => c.identifier === d.coreServiceIdentifier);
        const conn = connections.find(
          (c) => (c.fromKey === "main" && c.toKey === d.contractorKey) || (c.fromKey === d.contractorKey && c.toKey === "main"),
        );
        return { ...d, category: cat, connection: conn ?? null };
      });
  }, [state.directory, state.catalogue, connections, query, service, subService, location]);

  const subOptions = (service ? state.catalogue.find((c) => c.identifier === service) : null)?.subServices ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Screen F · Contractor Network"
        title="Find and connect with contractors"
        description="Search by service, sub-service and project location — considering service coverage, not just the office address."
        actions={<SimulatedTag>Mock network</SimulatedTag>}
      />
      <PreviewBanner />

      <SectionCard title="Find contractors">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Business name">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#98a2b3]" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name" className="pl-8" />
            </div>
          </Field>
          <Field label="Core service">
            <select value={service} onChange={(e) => { setService(e.target.value); setSubService(""); }} className="w-full rounded-lg border border-[#d9deea] bg-white px-3 py-2 text-sm">
              <option value="">Any service</option>
              {activeCategories.map((c) => (<option key={c.identifier} value={c.identifier}>{c.name}</option>))}
            </select>
          </Field>
          <Field label="Sub-service" hint="Select a single sub-service, not a category">
            <select value={subService} onChange={(e) => setSubService(e.target.value)} className="w-full rounded-lg border border-[#d9deea] bg-white px-3 py-2 text-sm">
              <option value="">Any sub-service</option>
              {subOptions.map((s) => (<option key={s.identifier} value={s.identifier}>{s.name}</option>))}
            </select>
          </Field>
          <Field label="Project location" hint="Matches office and covered areas">
            <div className="relative">
              <MapPin size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#98a2b3]" />
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Whitefield" className="pl-8" />
            </div>
          </Field>
        </div>

        {subService === "tile-grouting" && (
          <div className="mt-2.5 rounded-lg border border-[#dbe7f3] bg-[#f5f9fd] px-3 py-2 text-[0.74rem] text-[#1d4e6f]">
            Filtering on <strong>Tile Grouting</strong> only. Contractors who do not offer that specific sub-service are excluded,
            even if their core service is Tile Work.
          </div>
        )}

        <p className="mt-3 text-[0.74rem] font-semibold text-[#667085]">
          {results.length} discoverable contractor{results.length === 1 ? "" : "s"}
        </p>

        <div className="mt-2 grid gap-2.5 lg:grid-cols-2">
          {results.map((d) => (
            <div key={d.contractorKey} className="rounded-xl border border-[#e5e9f2] bg-white p-3.5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eef2ff] text-[#4f46e5]">
                  <CategoryIcon name={d.category?.icon} size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[0.88rem] font-bold text-[#172033]">
                    {d.businessName}
                    {d.verified && <VerifiedTag />}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[0.72rem] text-[#667085]">
                    <MapPin size={11} /> {d.baseLocation}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Pill tone="success">{d.category?.name}</Pill>
                    {d.additionalSubServiceIdentifiers.map((s) => {
                      const label = state.catalogue.flatMap((c) => c.subServices).find((x) => x.identifier === s)?.name ?? s;
                      return <Pill key={s} tone="neutral">{label}</Pill>;
                    })}
                  </div>
                  <p className="mt-1.5 text-[0.7rem] text-[#98a2b3]">
                    {d.serviceAreas.join(" · ")}
                  </p>
                  <p className="mt-1 flex items-center gap-2.5 text-[0.7rem] text-[#667085]">
                    <span className="inline-flex items-center gap-1"><Star size={11} className="text-amber-500" /> {d.rating}</span>
                    <span>{d.completedJobs} jobs</span>
                    <span>{d.yearsInBusiness} yrs</span>
                    <code className="rounded bg-[#f4f6fa] px-1 font-mono text-[0.62rem]">{d.bharathId}</code>
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {d.connection ? (
                  <>
                    <Pill tone={d.connection.status === "CONNECTED" ? "success" : d.connection.status === "REQUESTED" ? "info" : "neutral"}>
                      {d.connection.status === "CONNECTED" ? "Connected" : d.connection.status === "REQUESTED" ? "Request pending" : d.connection.status}
                    </Pill>
                    {d.connection.status === "REQUESTED" && d.contractorKey === "receiving" && (
                      <Button onClick={() => dispatch({ type: "RESPOND_CONNECTION", connectionId: d.connection.id, decision: "accept", personaId: "receiving" })}>
                        <Check size={13} /> Accept (as receiving contractor)
                      </Button>
                    )}
                    {d.connection.status === "REQUESTED" && (
                      <Button variant="secondary" onClick={() => dispatch({ type: "CANCEL_CONNECTION", connectionId: d.connection.id })}>
                        Cancel request
                      </Button>
                    )}
                    {d.connection.status === "CONNECTED" && (
                      <UnsupportedNote>Connected. Open Work Outsourced / Work Received to act on this relationship.</UnsupportedNote>
                    )}
                  </>
                ) : (
                  <Button onClick={() => dispatch({ type: "SEND_CONNECTION_REQUEST", toKey: d.contractorKey })}>
                    <UserPlus size={13} /> Request connection
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setOpenProfile(openProfile === d.contractorKey ? null : d.contractorKey)}>
                  View profile
                </Button>
              </div>

              {openProfile === d.contractorKey && (
                <div className="mt-3 space-y-2 rounded-lg border border-[#e5e9f2] bg-[#f9fafb] p-3">
                  <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    <KeyValue label="Bharath ID" value={d.bharathId} mono />
                    <KeyValue label="Phone" value={d.phone} />
                    <KeyValue label="Email" value={d.email} />
                    <KeyValue label="Core service" value={d.category?.name} />
                    <KeyValue label="Professional" value={d.category?.contractorLabel} />
                    <KeyValue label="Network opt-in" value="Yes" />
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => dispatch({ type: "SEND_MESSAGE", fromKey: "main", toKey: d.contractorKey, body: "Preview message: interested in working together." })}>
                      <MessageCircle size={13} /> Message
                    </Button>
                  </div>
                  <UnsupportedNote>Phone, email and Bharath ID are identifiers, not credentials. The preview sends nothing.</UnsupportedNote>
                </div>
              )}
            </div>
          ))}
          {results.length === 0 && (
            <div className="lg:col-span-2">
              <p className="text-[0.78rem] text-[#667085]">No contractors match those filters.</p>
            </div>
          )}
        </div>

        <UnsupportedNote>
          One contractor opted out of discovery and never appears in these results. Both parties keep one permanent contractor
          identity and one login.
        </UnsupportedNote>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Your connections" description="Send, accept, decline and cancel.">
          <div className="space-y-2">
            {connections.map((c) => {
              const other = state.directory.find((d) => d.contractorKey === (c.fromKey === "main" ? c.toKey : c.fromKey));
              return (
                <div key={c.id} className="rounded-lg border border-[#e5e9f2] bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[0.8rem] font-bold text-[#172033]">{other?.businessName ?? c.toKey}</p>
                      <p className="text-[0.7rem] text-[#667085]">{c.note}</p>
                    </div>
                    <Pill tone={c.status === "CONNECTED" ? "success" : c.status === "REQUESTED" ? "info" : "neutral"}>{c.status}</Pill>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 rounded-lg border border-[#e5e9f2] bg-[#f9fafb] p-3">
            <p className="text-[0.74rem] font-bold text-[#172033]">Guardrails</p>
            <ul className="mt-1.5 space-y-1 text-[0.72rem] text-[#667085]">
              <li className="flex items-start gap-1.5"><Ban size={12} className="mt-0.5 shrink-0" /> Self-connections are rejected.</li>
              <li className="flex items-start gap-1.5"><Ban size={12} className="mt-0.5 shrink-0" /> A duplicate request to the same contractor is rejected.</li>
              <li className="flex items-start gap-1.5"><ShieldAlert size={12} className="mt-0.5 shrink-0" /> Connection acceptance is separate from quotation acceptance and work confirmation.</li>
            </ul>
          </div>
        </SectionCard>

        <SectionCard
          title="Saved contacts"
          description="Private to you until a connection exists."
        >
          <div className="space-y-2">
            {state.savedContacts.map((c) => (
              <div key={c.id} className="rounded-lg border border-[#e5e9f2] bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[0.8rem] font-bold text-[#172033]">{c.contactName}</p>
                    <p className="text-[0.7rem] text-[#667085]">{c.phone} · {c.email}</p>
                    <p className="text-[0.68rem] text-[#98a2b3]">{c.note}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Pill tone="neutral">{c.visibility.replaceAll("_", " ").toLowerCase()}</Pill>
                    <Pill tone={c.invitationStatus === "NOT_INVITED" ? "neutral" : "warning"}>
                      {c.invitationStatus === "NOT_INVITED" ? "Not invited" : "Invitation pending"}
                    </Pill>
                  </div>
                </div>
                {c.invitationStatus === "NOT_INVITED" && (
                  <Button
                    className="mt-2"
                    variant="secondary"
                    onClick={() => dispatch({ type: "INVITE_SAVED_CONTACT", contactId: c.id, note: "Preview invitation." })}
                  >
                    <Send size={13} /> Invite explicitly
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Field label="Contact name"><Input value={contactForm.contactName} onChange={(e) => setContactForm({ ...contactForm, contactName: e.target.value })} placeholder="Fictional name" /></Field>
            <Field label="Phone"><Input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} placeholder="+91 90000 00000" /></Field>
            <Field label="Email"><Input value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} placeholder="name@example.invalid" /></Field>
            <Field label="Note"><Input value={contactForm.note} onChange={(e) => setContactForm({ ...contactForm, note: e.target.value })} placeholder="Optional" /></Field>
          </div>
          <Button
            className="mt-2"
            onClick={() => {
              if (!contactForm.contactName.trim()) return;
              dispatch({ type: "SAVE_CONTACT", ...contactForm });
              setContactForm({ contactName: "", phone: "", email: "", note: "" });
            }}
          >
            <Plus size={13} /> Save private contact
          </Button>
          <UnsupportedNote>
            Saving a contact creates no registered account and no public listing. Linking an invitation to an account requires
            verified ownership — a matching phone or email is not sufficient proof.
          </UnsupportedNote>
        </SectionCard>
      </div>
    </div>
  );
}

// ===========================================================================
// SCREEN G — Project detail with multiple service scopes
// ===========================================================================
export function ScreenProjectDetail() {
  const { state } = usePreview();
  const project = state.project;
  const isMain = state.activePersonaId === "main";
  const isReceiving = state.activePersonaId === "receiving";
  const isCustomer = state.activePersonaId === "customer";
  const employee = state.activePersonaId === "employee";

  const internal = project.scopes.filter((s) => s.handling === "INTERNAL");
  const subcontracted = project.scopes.filter((s) => s.handling === "SUBCONTRACTED");
  const projectTotal = project.scopes.reduce((s, x) => s + x.netArea * x.unitRate, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Screen G · Project detail"
        title={project.property.name}
        description="One project, multiple service scopes. Mixed-service quotation on a single record."
        actions={<SimulatedTag>Mock project</SimulatedTag>}
      />
      <PreviewBanner />

      <SectionCard title="Property">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KeyValue label="Type" value={project.property.type} />
          <KeyValue label="Address" value={project.property.addressLine} />
          <KeyValue label="Locality" value={project.property.locality} />
          <KeyValue label="Pincode" value={project.property.pincode} mono />
          <KeyValue label="Carpet area" value={`${project.property.areaSqft} sqft`} />
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill tone="neutral">Owner: {project.customerName}</Pill>
          <Pill tone="neutral">Main contractor: {state.profiles.main.businessName}</Pill>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {isReceiving || employee ? (
            <DeniedPanel title="Full customer project — not available">
              The receiving contractor sees only the shared work scope, shared files, the site location and the required dates
              for the work they accepted. The full project, its other scopes, the end-customer quotation and the main
              contractor's margin are not shared.
            </DeniedPanel>
          ) : null}

          {(isMain || isCustomer) && (
            <SectionCard
              title="Service scopes"
              description="Each scope carries its own service, sub-service and unit."
              action={<Pill tone="info">{project.scopes.length} scopes</Pill>}
              dense
            >
              <div className="divide-y divide-[#e5e9f2]">
                {project.scopes.map((s) => {
                  const cat = state.catalogue.find((c) => c.identifier === s.categoryIdentifier);
                  const sub = cat?.subServices.find((x) => x.identifier === s.subServiceIdentifier);
                  const fs = formulaSupport(s.categoryIdentifier);
                  return (
                    <div key={s.id} className="p-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eef2ff] text-[#4f46e5]">
                            <CategoryIcon name={cat?.icon} size={16} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[0.86rem] font-bold text-[#172033]">{s.name}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-[#667085]">
                              <Pill tone="success">{cat?.name}</Pill>
                              <Pill tone="neutral">{sub?.name}</Pill>
                              <span>{s.unit === "sqft" ? "sqft" : s.unit}</span>
                              <span>· {s.calculationType}</span>
                            </p>
                            <p className="mt-1 text-[0.72rem] text-[#98a2b3]">Formula: {s.priceFormula}</p>
                            {!fs.supportsPaintDeductions && (
                              <p className="mt-1 flex items-start gap-1.5 text-[0.7rem] text-[#b54708]">
                                <Info size={11} className="mt-0.5 shrink-0" />
                                Painting deduction formulas do not apply to {cat?.name}. Switching the unit will not introduce them.
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <Pill tone={s.handling === "INTERNAL" ? "success" : "warning"}>
                            {s.handling === "INTERNAL" ? "Handled internally" : "Outsourced"}
                          </Pill>
                          <p className="mt-1.5 text-[0.82rem] font-extrabold text-[#172033]">{money(s.netArea * s.unitRate)}</p>
                          <p className="text-[0.68rem] text-[#98a2b3]">{s.netArea} × {money(s.unitRate)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {(isReceiving || employee) && (
            <SectionCard
              title="Shared work scope"
              description="Exactly what was shared for execution. Nothing else from the project."
              action={<Pill tone="info">{state.workOrder.sharedScope.length} shared scope</Pill>}
            >
              <div className="space-y-3">
                {state.workOrder.sharedScope.map((s) => {
                  const cat = state.catalogue.find((c) => c.identifier === s.categoryIdentifier);
                  return (
                    <div key={s.scopeId} className="rounded-xl border border-[#e5e9f2] bg-white p-3.5">
                      <p className="flex items-center gap-2 text-[0.86rem] font-bold text-[#172033]">
                        <CategoryIcon name={cat?.icon} size={15} /> {s.name}
                      </p>
                      <p className="mt-1 text-[0.76rem] leading-relaxed text-[#475467]">{s.description}</p>
                      <p className="mt-1.5 text-[0.72rem] text-[#667085]">
                        {s.quantity} {s.unit} · {cat?.name}
                      </p>
                    </div>
                  );
                })}
                <div className="rounded-xl border border-[#e5e9f2] bg-[#f9fafb] p-3.5">
                  <p className="text-[0.72rem] font-bold uppercase tracking-wide text-[#98a2b3]">Shared measurement</p>
                  <p className="mt-1 text-[0.8rem] font-bold text-[#172033]">
                    Version {state.workOrder.sharedMeasurement.version} · {state.workOrder.sharedMeasurement.totalAreaSqft} sqft
                  </p>
                  <p className="mt-1 text-[0.7rem] text-[#667085]">{state.workOrder.sharedMeasurement.note}</p>
                </div>
                <div className="rounded-xl border border-[#e5e9f2] bg-[#f9fafb] p-3.5">
                  <p className="text-[0.72rem] font-bold uppercase tracking-wide text-[#98a2b3]">Shared photos</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {project.photos.filter((p) => state.workOrder.sharedPhotos.includes(p.id)).map((p) => (
                      <Pill key={p.id} tone="neutral">{p.name} · {p.stage}</Pill>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-[#e5e9f2] bg-[#f9fafb] p-3.5">
                  <p className="text-[0.72rem] font-bold uppercase tracking-wide text-[#98a2b3]">Site location & contact</p>
                  <p className="mt-1 text-[0.8rem] font-bold text-[#172033]">{state.workOrder.sharedLocation.addressLine}</p>
                  <p className="text-[0.72rem] text-[#667085]">{state.workOrder.sharedLocation.locality}, {state.workOrder.sharedLocation.city} — {state.workOrder.sharedLocation.pincode}</p>
                  <p className="mt-1.5 text-[0.74rem] text-[#475467]">
                    Site contact: {state.workOrder.sharedLocation.siteContact.name} · {state.workOrder.sharedLocation.siteContact.phone}
                  </p>
                </div>
                <div className="rounded-xl border border-[#e5e9f2] bg-[#f9fafb] p-3.5">
                  <p className="text-[0.72rem] font-bold uppercase tracking-wide text-[#98a2b3]">Required dates</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[0.8rem] font-bold text-[#172033]">
                    <CalendarDays size={14} /> {state.workOrder.requiredDates.start} → {state.workOrder.requiredDates.end}
                  </p>
                </div>
              </div>
            </SectionCard>
          )}
        </div>

        <div className="space-y-4">
          {(isMain || isCustomer) && (
            <>
              <SectionCard title="Measurement versions" description="Versioning preserved.">
                <div className="space-y-1.5">
                  {project.measurement.versions.map((v) => (
                    <div key={v.version} className={`rounded-lg border px-3 py-2 ${v.isCurrent ? "border-[#176b9b] bg-[#f2f7fb]" : "border-[#e5e9f2] bg-white"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[0.78rem] font-bold text-[#172033]">Version {v.version}</p>
                        {v.isCurrent ? <Pill tone="success">Current</Pill> : <Pill tone="neutral">Retained</Pill>}
                      </div>
                      <p className="text-[0.7rem] text-[#667085]">{v.createdOn} · {v.note}</p>
                    </div>
                  ))}
                </div>
                <UnsupportedNote>
                Selected by the contractor who owns the measurement.
              </UnsupportedNote>
              </SectionCard>

              {isMain && (
                <SectionCard title="Customer-facing quotation" description="Single record, mixed services.">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[0.74rem] text-[#667085]">{project.customerQuotation.number}</span>
                      <Pill tone="success">{project.customerQuotation.status}</Pill>
                    </div>
                    <div className="divide-y divide-[#e5e9f2] rounded-lg border border-[#e5e9f2]">
                      {project.customerQuotation.lineItems.map((li) => (
                        <div key={li.id} className="flex items-start justify-between gap-2 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-[0.74rem] font-semibold text-[#172033]">{li.descriptionSnapshot}</p>
                            <p className="text-[0.68rem] text-[#98a2b3]">{li.quantity} {li.unit} × {money(li.rate)}</p>
                          </div>
                          <p className="shrink-0 text-[0.76rem] font-bold text-[#172033]">{money(li.amount)}</p>
                        </div>
                      ))}
                    </div>
                    <dl className="space-y-1.5">
                      <div className="flex justify-between text-[0.74rem]"><dt className="text-[#667085]">Subtotal</dt><dd className="font-semibold">{money(project.customerQuotation.subtotal)}</dd></div>
                      <div className="flex justify-between text-[0.74rem]"><dt className="text-[#667085]">GST {project.customerQuotation.gstPercent}%</dt><dd className="font-semibold">{money(project.customerQuotation.gstAmount)}</dd></div>
                      <div className="flex justify-between border-t border-[#e5e9f2] pt-1.5 text-[0.8rem]"><dt className="font-bold">Total</dt><dd className="font-extrabold">{money(project.customerQuotation.total)}</dd></div>
                    </dl>
                  </div>
                  <div className="mt-3 rounded-lg border border-[#fde68a] bg-amber-50 p-3">
                    <p className="text-[0.72rem] font-bold text-amber-900">Main contractor only — margin {project.customerQuotation.marginPercent}%</p>
                    <p className="mt-0.5 text-[0.7rem] text-amber-800">
                      Never visible to the receiving contractor or to the end customer.
                    </p>
                  </div>
                </SectionCard>
              )}
            </>
          )}

          <SectionCard title="Scope split">
            <div className="space-y-2">
              <div>
                <p className="text-[0.72rem] font-bold uppercase tracking-wide text-[#98a2b3]">Handled internally</p>
                <p className="mt-0.5 text-[0.8rem] font-bold text-[#172033]">{money(internal.reduce((s, x) => s + x.netArea * x.unitRate, 0))}</p>
              </div>
              <div>
                <p className="text-[0.72rem] font-bold uppercase tracking-wide text-[#98a2b3]">Outsourced</p>
                <p className="mt-0.5 text-[0.8rem] font-bold text-[#172033]">{money(subcontracted.reduce((s, x) => s + x.netArea * x.unitRate, 0))}</p>
              </div>
              {isMain && (
                <div className="border-t border-[#e5e9f2] pt-2">
                  <p className="text-[0.72rem] font-bold uppercase tracking-wide text-[#98a2b3]">Project total (cost scope)</p>
                  <p className="mt-0.5 text-[0.9rem] font-extrabold text-[#172033]">{money(projectTotal)}</p>
                </div>
              )}
            </div>
            <UnsupportedNote>Cost scope, not the customer quotation. Customer-facing totals are on the quotation.</UnsupportedNote>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// SCREEN H — Select scope and request a subcontractor quotation
// ===========================================================================
export function ScreenRequestQuote() {
  const { state, dispatch } = usePreview();
  const project = state.project;
  const wo = state.workOrder;
  const [selected, setSelected] = useState(wo.sharedScope.map((s) => s.scopeId));
  const [target, setTarget] = useState("receiving");
  const [note, setNote] = useState("Please quote for the shared false ceiling scope.");
  const [sent, setSent] = useState(false);

  const isMain = state.activePersonaId === "main";
  const eligible = state.connections.filter((c) => c.status === "CONNECTED" && c.fromKey === "main");
  const targetDir = state.directory.find((d) => d.contractorKey === target);
  // A request may only be raised from Draft. Once sent, the button is disabled so
  // the same request cannot be raised twice.
  const canSend =
    isMain &&
    wo.status === "DRAFT" &&
    selected.length > 0 &&
    eligible.length > 0 &&
    note.trim().length > 0;
  const blockedReason = !isMain
    ? "Only the main contractor may open a scope for outsourcing."
    : wo.status !== "DRAFT"
      ? `This work order is ${STATUS_META[wo.status]?.label ?? wo.status}. A request can only be raised from Draft.`
      : selected.length === 0
        ? "Select at least one scope."
        : eligible.length === 0
          ? "Requires an accepted connection. Use screen F first."
          : "Add a message for the receiving contractor.";

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Screen H · Outsource"
        title="Select scope and request a subcontractor quotation"
        description="Share only the scope you intend to outsource. Everything else stays private."
        actions={<SimulatedTag>Mock request</SimulatedTag>}
      />
      <PreviewBanner />

      {!isMain && (
        <DeniedPanel title="Main contractor action">
          Only the main contractor can open a scope for outsourcing. The receiving contractor responds to a request; they do
          not create one.
        </DeniedPanel>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="1 · Choose the scope to outsource">
          <div className="space-y-2">
            {project.scopes.map((s) => {
              const cat = state.catalogue.find((c) => c.identifier === s.categoryIdentifier);
              const locked = !!s.workOrderId;
              return (
                <Checkbox
                  key={s.id}
                  checked={selected.includes(s.id)}
                  disabled={locked}
                  onChange={() =>
                    setSelected((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]))
                  }
                  label={s.name}
                  hint={locked ? "Already outsourced — create a linked work order instead." : `${cat?.name} · ${s.netArea} sqft · ${money(s.netArea * s.unitRate)} at your cost`}
                />
              );
            })}
          </div>
          <UnsupportedNote>
            "Handled internally" versus "included in this project" versus "skills needed for an assignment" are three
            separate questions. A painting contractor may include false-ceiling work in a project and outsource it without
            claiming that trade.
          </UnsupportedNote>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="2 · Choose a connected contractor">
            {eligible.length === 0 ? (
              <p className="text-[0.78rem] text-[#667085]">No accepted connections yet. Use screen F first.</p>
            ) : (
              <div className="space-y-2">
                {eligible.map((c) => {
                  const dir = state.directory.find((d) => d.contractorKey === c.toKey);
                  const active = target === c.toKey;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setTarget(c.toKey)}
                      className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition ${
                        active ? "border-[#176b9b] bg-[#f2f7fb]" : "border-[#e5e9f2] hover:border-[#c7d0de]"
                      }`}
                    >
                      <Handshake size={15} className={active ? "text-[#176b9b]" : "text-[#98a2b3]"} />
                      <div className="min-w-0">
                        <p className="truncate text-[0.8rem] font-bold text-[#172033]">{dir?.businessName}</p>
                        <p className="truncate text-[0.68rem] text-[#667085]">
                          {state.catalogue.find((x) => x.identifier === dir?.coreServiceIdentifier)?.name} · connected
                        </p>
                      </div>
                      {active && <Check size={15} className="ml-auto text-[#176b9b]" />}
                    </button>
                  );
                })}
              </div>
            )}
            <UnsupportedNote>
              Requests to contractors who are not yet connected must go through screen F first, so both parties keep a single
              permanent identity.
            </UnsupportedNote>
          </SectionCard>

          <SectionCard title="3 · Message and send">
            <Field label="Message to the receiving contractor" required>
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="mt-3 rounded-lg border border-[#e5e9f2] bg-[#f9fafb] p-3">
              <p className="text-[0.72rem] font-bold uppercase tracking-wide text-[#98a2b3]">What gets shared</p>
              <ul className="mt-1.5 space-y-1 text-[0.72rem] text-[#475467]">
                <li>• {selected.length} scope{selected.length === 1 ? "" : "s"} with description and quantity</li>
                <li>• Measurement version {wo.sharedMeasurement.version} for the selected area only</li>
                <li>• Shared photos only ({project.photos.filter((p) => p.sharedWithSubcontractor).length} of {project.photos.length})</li>
                <li>• Site address and site contact shared for execution</li>
                <li>• Required start and end dates</li>
              </ul>
              <p className="mt-2 text-[0.7rem] text-[#b54708]">
                Not shared: the end-customer quotation, the other scopes, private notes, other customers and properties.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                disabled={!canSend}
                onClick={() => {
                  const gate = canPerform("main", wo, "REQUEST_SENT");
                  if (!gate.allowed) return;
                  dispatch({ type: "TRANSITION", personaId: "main", toStatus: "REQUEST_SENT" });
                  setSent(true);
                }}
              >
                <Send size={13} /> Send request
              </Button>
              {!canSend && <UnsupportedNote>{blockedReason}</UnsupportedNote>}
              {sent && <Pill tone="success">Simulated — request recorded in the activity log</Pill>}
            </div>
            <UnsupportedNote>No email, SMS or WhatsApp is sent. The preview does not call any mutation API.</UnsupportedNote>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Allowed next steps from here" description="Who may perform each transition.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[0.76rem]">
            <thead>
              <tr className="border-b border-[#e5e9f2] text-[0.66rem] uppercase tracking-wide text-[#98a2b3]">
                <th className="py-2 pr-3">From</th>
                <th className="py-2 pr-3">To</th>
                <th className="py-2 pr-3">Who may act</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(WORK_ORDER_FLOW[wo.status] ?? {}).map(([to, actors]) => (
                <tr key={to} className="border-b border-[#f4f6fa]">
                  <td className="py-2 pr-3"><Pill tone={STATUS_META[wo.status]?.tone ?? "neutral"}>{STATUS_META[wo.status]?.label ?? wo.status}</Pill></td>
                  <td className="py-2 pr-3">{TRANSITION_LABELS[to] ?? to}</td>
                  <td className="py-2 pr-3 text-[#667085]">{actors.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {targetDir && (
          <UnsupportedNote>
            Target contractor covers {targetDir.serviceAreas.join(", ")}. The project is in {project.property.locality}.
          </UnsupportedNote>
        )}
      </SectionCard>
    </div>
  );
}