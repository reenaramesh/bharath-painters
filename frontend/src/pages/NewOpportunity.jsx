import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, ContactRound, Plus } from "lucide-react";
import api from "../api/client";
import BackButton from "../components/BackButton";
import CustomerConnectionFlow from "../components/CustomerConnectionFlow";
import CustomerContactPicker from "../components/CustomerContactPicker";
import { Button, PageHeader } from "../components/ui";
import { apiDateTime, requestError, sourceLabel } from "../components/leads/lead-format";
import { SOURCE_OPTIONS, PRIORITY_OPTIONS } from "../utils/opportunityOptions";
import useAuth from "../context/useAuth";
import useLeadAssignees from "../components/leads/useLeadAssignees";
import { LeadAssigneeSelect } from "../components/leads/LeadAssignment";
import useDraftUnsavedChanges from "../hooks/useDraftUnsavedChanges";
import { customerCanWork } from "../components/customers/customer-workflow";
import "../components/leads/lead-workspace.css";

export default function NewOpportunity() {
  const { user } = useAuth();
  return <NewOpportunityForm key={`${user?.id}-${user?.role}`} user={user} />;
}

function NewOpportunityForm({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const requestedCustomer = query.get("customer") || "";
  const fromTasks = query.get("from") === "tasks";
  const team = useLeadAssignees(user?.role === "CONTRACTOR");
  const [assignee, setAssignee] = useState("self");
  const [client, setClient] = useState(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [services, setServices] = useState([]);
  const [properties, setProperties] = useState([]);
  const [existing, setExisting] = useState([]);
  const [existingError, setExistingError] = useState("");
  const [allowAnother, setAllowAnother] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [preselection, setPreselection] = useState({ customer: requestedCustomer, state: requestedCustomer ? "loading" : "idle", error: "" });
  const [preselectionAttempt, setPreselectionAttempt] = useState(0);
  const [edited, setEdited] = useState(false);
  const editedRef = useRef(false);
  const selectedRef = useRef(null);
  const customerRequest = useRef(0);
  const optionsRequest = useRef(0);
  const requestedCustomerRef = useRef(requestedCustomer);
  requestedCustomerRef.current = requestedCustomer;
  const live = useRef(true);
  const creationKey = useRef(crypto.randomUUID());
  const [form, setForm] = useState({ title: "", description: "", service_type: "", property: "", source: "", source_detail: "", priority: "MEDIUM", estimated_value: "", expected_start_date: "", site_visit_required: false, next_follow_up: "", notes: "" });
  const markEdited = () => { editedRef.current = true; setEdited(true); };
  const update = (key, value) => { markEdited(); setForm(current => ({ ...current, [key]: value })); };
  const allowNavigation = useDraftUnsavedChanges(edited, user?.role === "CONTRACTOR", { preservePathname: "/opportunities/new" });
  // This account-scoped form stays mounted for query-only navigation, retaining
  // its draft. A changed link never replaces a customer the user has chosen.
  const preselectionPending = Boolean(requestedCustomer) && (preselection.customer !== requestedCustomer || ["loading", "error"].includes(preselection.state));
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; customerRequest.current += 1; };
  }, []);
  useEffect(() => {
    const request = ++customerRequest.current;
    let active = true;
    setShowContacts(false); setShowCustomer(false);
    if (!requestedCustomer || user?.role !== "CONTRACTOR") {
      setPreselection({ customer: requestedCustomer, state: "idle", error: "" });
      return () => { active = false; };
    }
    if (editedRef.current) {
      setPreselection({ customer: requestedCustomer, state: "retained", error: "" });
      return () => { active = false; };
    }
    setPreselection({ customer: requestedCustomer, state: "loading", error: "" });
    const current = () => active && live.current && request === customerRequest.current && requestedCustomerRef.current === requestedCustomer;
    async function preselect() {
      try {
        if (!/^\d+$/.test(requestedCustomer)) throw new Error("Invalid customer link.");
        const { data } = await api.get(`/quotations/customers/${requestedCustomer}/`);
        if (!current()) return;
        if (String(data.id) !== requestedCustomer) throw new Error("Customer link could not be verified.");
        selectClient(data, false, false);
        setPreselection({ customer: requestedCustomer, state: "ready", error: "" });
      } catch {
        if (current()) setPreselection({ customer: requestedCustomer, state: "error", error: "This customer could not be selected. Their connection may be unavailable. Retry or find another customer." });
      }
    }
    preselect();
    return () => { active = false; };
  }, [requestedCustomer, preselectionAttempt, user?.role]);
  useEffect(() => {
    if (user?.role !== "CONTRACTOR") return;
    let active = true;
    api.get("/quotations/service-types/").then(({ data }) => { if (active) setServices(data.results || data); }).catch(() => { if (active) setError("Service categories could not be loaded. You can still describe the requested service."); });
    return () => { active = false; };
  }, [user?.role]);
  useEffect(() => {
    if (!client || user?.role !== "CONTRACTOR") return;
    const request = ++optionsRequest.current;
    let active = true;
    const current = () => active && live.current && request === optionsRequest.current && String(selectedRef.current?.id) === String(client.id);
    setLoadingOptions(true); setExistingError(""); setExisting([]); setAllowAnother(false);
    Promise.all([api.get(`/quotations/leads/?customer=${client.id}&queue=active`), api.get(`/quotations/properties/?customer=${client.id}`)])
      .then(([leads, sites]) => { if (current()) { setExisting(leads.data.results || leads.data); setProperties(sites.data.results || sites.data); } })
      .catch(() => { if (current()) setExistingError("Existing enquiries and properties could not be checked. Retry before saving this lead."); })
      .finally(() => { if (current()) setLoadingOptions(false); });
    return () => { active = false; };
  }, [client, user?.role, optionsAttempt]);
  function selectClient(data, newlyAdded, manual = true) {
    if (!live.current) return;
    if (!customerCanWork(data)) throw new Error("This customer relationship is unavailable for creating leads.");
    const previous = selectedRef.current;
    const sameCustomer = String(previous?.id) === String(data.id);
    const nextIsNewCustomer = newlyAdded ?? (sameCustomer ? previous.isNewCustomer : false);
    const changed = !sameCustomer || previous.isNewCustomer !== nextIsNewCustomer;
    customerRequest.current += 1;
    optionsRequest.current += 1;
    selectedRef.current = { id: data.id, isNewCustomer: nextIsNewCustomer };
    if (manual) {
      markEdited();
      setPreselection({ customer: requestedCustomer, state: "manual", error: "" });
    }
    setClient(data); setIsNewCustomer(nextIsNewCustomer);
    setLoadingOptions(true); setExistingError("");
    if (changed) {
      setProperties([]);
      setForm(current => ({ ...current, property: "", source: nextIsNewCustomer ? "" : "EXISTING_CUSTOMER", source_detail: "" }));
      creationKey.current = crypto.randomUUID();
    }
  }
  async function saveCustomer(values) {
    const request = ++customerRequest.current;
    const { data } = await api.post("/quotations/customers/", values);
    if (!live.current || request !== customerRequest.current || requestedCustomerRef.current !== requestedCustomer) return data;
    if (!data.already_saved) selectClient(data, true);
    return data;
  }
  async function useCustomer(customer) {
    const request = ++customerRequest.current;
    const { data } = await api.get(`/quotations/customers/${customer.id}/`);
    if (!live.current || request !== customerRequest.current || requestedCustomerRef.current !== requestedCustomer) return;
    selectClient(data);
  }
  function openCustomers(add = false) {
    customerRequest.current += 1;
    setPreselection({ customer: requestedCustomer, state: "manual", error: "" });
    if (add) setShowCustomer(true);
    else setShowContacts(true);
  }
  function closeCustomers() {
    customerRequest.current += 1;
    setShowCustomer(false); setShowContacts(false);
  }
  const pickerRequest = customerRequest.current;
  async function save(event) {
    event.preventDefault();
    if (saving || !client || preselectionPending || loadingOptions || existingError || (existing.length && !allowAnother)) return;
    if (isNewCustomer && !form.source) { setError("Choose how this new customer found you."); return; }
    setSaving(true); setError("");
    try {
      const { data } = await api.post("/quotations/leads/", { ...form, assigned_user: assignee === "self" ? user.id : assignee ? Number(assignee) : null, source: isNewCustomer ? form.source : "EXISTING_CUSTOMER", source_detail: isNewCustomer ? form.source_detail : "", title: form.title.trim(), customer: client.id, service_type: form.service_type || null, property: form.property || null, estimated_value: form.estimated_value || null, expected_start_date: form.expected_start_date || null, next_follow_up: apiDateTime(form.next_follow_up), creation_key: creationKey.current });
      if (!live.current) return;
      allowNavigation();
      navigate(`/opportunities/${data.id}`);
    } catch (failure) { if (live.current) setError(requestError(failure, "Lead could not be saved. Your details are retained; please retry.")); }
    finally { if (live.current) setSaving(false); }
  }
  if (user?.role !== "CONTRACTOR") return <div className="lead-workspace lead-panel"><h2>Contractor access only</h2><p className="lead-muted mt-3">Your contractor creates and assigns enquiries.</p><Link className="lead-primary-action mt-4" to="/opportunities">Back to my leads</Link></div>;
  return <div className="lead-workspace space-y-5">
    {fromTasks ? <Link className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950 bp-ui-action" to="/tasks">Back to Tasks</Link> : <BackButton fallback="/opportunities" label="Back to leads" />}
    <PageHeader eyebrow="Capture an enquiry" title="New lead" description="Find the customer, record the service they need and choose the next step." />
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    <section className="lead-panel"><h2>1. Customer</h2>
      {preselectionPending && preselection.state !== "error" && <p role="status" className="lead-muted mt-4">Checking the linked customer...</p>}
      {preselection.customer === requestedCustomer && preselection.state === "error" && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{preselection.error}</p><Button className="mt-3" variant="secondary" onClick={() => setPreselectionAttempt(value => value + 1)}>Retry customer</Button></div>}
      {preselection.state === "retained" && <p role="status" className="lead-muted mt-4">Your current lead draft is retained. Use Change customer to choose a different contact.</p>}
      {client ? <div className="lead-row-heading mt-4 justify-between"><div><p className="font-bold">{client.name}</p><p className="lead-muted mt-1">{client.mobile}</p></div><Button variant="secondary" disabled={saving} onClick={() => openCustomers()}>Change customer</Button></div>
        : <div className="mt-4"><p className="lead-muted mb-4">Choose a saved contact or add a new customer.</p><div className="flex flex-wrap gap-3"><Button onClick={() => openCustomers()}><ContactRound size={17} aria-hidden="true" />Find customer</Button><Button variant="secondary" onClick={() => openCustomers(true)}><Plus size={17} aria-hidden="true" />Add customer</Button></div></div>}
    </section>
    {client && <>
      {loadingOptions && <p role="status" className="lead-muted">Checking existing enquiries and properties…</p>}
      {existingError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{existingError}</p><Button className="mt-3" variant="secondary" onClick={() => setOptionsAttempt(value => value + 1)}>Retry enquiry check</Button></div>}
      {existing.length > 0 && <section className="lead-panel">
        <div className="lead-row-heading justify-between"><div><h2>{existing.length} open enquiries for {client.name}</h2><p className="lead-muted mt-2">Continue an existing enquiry or record a separate requirement.</p></div><Button variant="secondary" onClick={() => { markEdited(); setAllowAnother(true); }} disabled={allowAnother || saving}><Plus size={16} aria-hidden="true" />{allowAnother ? "Separate enquiry selected" : "Create another enquiry"}</Button></div>
        {!allowAnother && existing.slice(0, 3).map(lead => <Link className="lead-linked" key={lead.id} to={`/opportunities/${lead.id}`}><span className="font-semibold">{lead.title}</span><span className="lead-muted block mt-1">{lead.reference_no} · {sourceLabel(lead.source)}</span></Link>)}
        {(allowAnother || existing.length > 3) && <details className="mt-3"><summary className="lead-details-toggle">{allowAnother ? "View existing enquiries" : "View more enquiries"}</summary>{(allowAnother ? existing : existing.slice(3)).map(lead => <Link className="lead-linked" key={lead.id} to={`/opportunities/${lead.id}`}><span className="font-semibold">{lead.title}</span><span className="lead-muted block mt-1">{lead.reference_no} · {sourceLabel(lead.source)}</span></Link>)}</details>}
      </section>}
      <form onSubmit={save}><fieldset disabled={saving || preselectionPending || loadingOptions || Boolean(existingError) || (existing.length > 0 && !allowAnother)} className="space-y-5 min-w-0">
        <section className="lead-panel"><h2>2. What service do they need?</h2><div className="lead-form-grid">
          <label className="lead-field lead-full"><span>Requested service / enquiry *</span><input required maxLength={180} value={form.title} onChange={e => update("title", e.target.value)} placeholder="e.g. 2BHK interior painting" /></label>
          <label className="lead-field lead-full"><span>Requirement details</span><textarea rows={3} value={form.description} onChange={e => update("description", e.target.value)} placeholder="Rooms, surfaces, condition and what the customer wants" /></label>
          {isNewCustomer && <><label className="lead-field"><span>Lead source *</span><select aria-label="Lead source" required value={form.source} onChange={e => update("source", e.target.value)}><option value="">Choose source</option>{SOURCE_OPTIONS.filter(([key]) => key !== "CUSTOMER_APP").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="lead-field"><span>Source details</span><input maxLength={255} value={form.source_detail} onChange={e => update("source_detail", e.target.value)} placeholder="Referrer, campaign or other context" /></label></>}
        </div>{isNewCustomer && <p className="lead-muted mt-3">Record how this new customer found you.</p>}</section>
        <section className="lead-panel"><h2>3. Owner & next step</h2><div className="lead-form-grid"><LeadAssigneeSelect value={assignee} onChange={value => { markEdited(); setAssignee(value); }} team={team} /><label className="lead-field"><span>First follow-up · India time</span><input type="datetime-local" value={form.next_follow_up} onChange={e => update("next_follow_up", e.target.value)} /></label><label className="lead-field"><span>Priority</span><select aria-label="Priority" value={form.priority} onChange={e => update("priority", e.target.value)}>{PRIORITY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><p className="lead-muted mt-3">Choose who will handle the enquiry. You can change the owner later.</p></section>
        <section className="lead-panel"><details><summary className="lead-details-toggle">Additional details · optional</summary><div className="lead-form-grid">
          <label className="lead-field"><span>Service category</span><select aria-label="Service category" value={form.service_type} onChange={e => update("service_type", e.target.value)}><option value="">Not selected</option>{services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
          <label className="lead-field"><span>Property</span><select aria-label="Property" value={form.property} onChange={e => update("property", e.target.value)}><option value="">Add later</option>{properties.map(site => <option key={site.id} value={site.id}>{site.name || site.property_type}</option>)}</select></label>
          <label className="lead-field"><span>Estimated value (₹)</span><input type="number" min="0" step="0.01" value={form.estimated_value} onChange={e => update("estimated_value", e.target.value)} /></label>
          <label className="lead-field"><span>Expected start</span><input type="date" value={form.expected_start_date} onChange={e => update("expected_start_date", e.target.value)} /></label>
          <label className="lead-field lead-full"><span>Internal notes</span><textarea rows={2} value={form.notes} onChange={e => update("notes", e.target.value)} /></label>
          <label className="flex items-center gap-2 text-sm lead-full"><input style={{ width: 18, minHeight: 18 }} type="checkbox" checked={form.site_visit_required} onChange={e => update("site_visit_required", e.target.checked)} />Site visit required</label>
        </div></details></section>
        <div className="flex justify-end"><Button type="submit" disabled={saving}>{saving ? "Saving lead…" : "Save lead"}<ArrowRight size={16} aria-hidden="true" /></Button></div>
      </fieldset></form>
    </>}
    {showCustomer && <CustomerConnectionFlow onClose={closeCustomers} onNewCustomer={saveCustomer} onExistingCustomer={useCustomer} existingActionLabel="Use this customer" requireConnected />}
    {showContacts && <CustomerContactPicker onClose={closeCustomers} onSelect={data => {
      if (pickerRequest === customerRequest.current && requestedCustomerRef.current === requestedCustomer) selectClient(data);
    }} onAddCustomer={() => { setShowContacts(false); openCustomers(true); }} />}
  </div>;
}
