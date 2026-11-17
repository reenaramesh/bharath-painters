import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";
import useDraftUnsavedChanges from "../hooks/useDraftUnsavedChanges";
import CustomerForm from "../components/CustomerForm";
import CustomerActivationShare from "../components/CustomerActivationShare";
import { ErrorState, LoadingState } from "../components/ui";
import LeadFollowUpForm from "../components/leads/LeadFollowUpForm";
import { quickUpdateDirty } from "../components/leads/lead-quick-update";
import { requestError } from "../components/leads/lead-format";
import CustomerProfileView from "../components/customers/CustomerProfileView";
import CustomerFollowUpChoice from "../components/customers/CustomerFollowUpChoice";
import GeneralCustomerFollowUp from "../components/customers/GeneralCustomerFollowUp";
import { customerCanWork } from "../components/customers/customer-workflow";
import "./mobile-workspace.css";
import "./crm-pages.css";

export default function CustomerDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  return <CustomerProfileResource key={`${user?.id}-${id}`} id={id} user={user} />;
}

function CustomerProfileResource({ id, user }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsError, setLeadsError] = useState("");
  const [callEvents, setCallEvents] = useState([]);
  const [callsLoading, setCallsLoading] = useState(false);
  const [callsError, setCallsError] = useState("");
  const [dialog, setDialog] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadDrafts, setLeadDrafts] = useState({});
  const [generalDraft, setGeneralDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [activationLink, setActivationLink] = useState(null);
  const [activationBusy, setActivationBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [completingId, setCompletingId] = useState(null);
  const live = useRef(true);
  const customerRef = useRef(customer);
  customerRef.current = customer;
  const reads = useRef({ customer: 0, leads: 0, calls: 0 });
  const activationLock = useRef(false);
  const editLock = useRef(false);
  const completionLock = useRef(false);
  const requestLock = useRef(false);
  const canWork = user?.role === "CONTRACTOR" && customerCanWork(customer);
  useDraftUnsavedChanges(Boolean(generalDraft?.edited) || Object.values(leadDrafts).some(quickUpdateDirty), true, { preservePathname: `/customers/${id}` });

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; reads.current.customer += 1; reads.current.leads += 1; reads.current.calls += 1; };
  }, []);
  const loadCustomer = useCallback(async () => {
    if (!live.current) return null;
    const version = ++reads.current.customer;
    setLoading(true);
    try {
      const { data } = await api.get(`/quotations/customers/${id}/`);
      if (!live.current || version !== reads.current.customer) return null;
      customerRef.current = data; setCustomer(data); setError("");
      return data;
    } catch (failure) {
      if (live.current && version === reads.current.customer) {
        if ([401, 403, 404].includes(failure.response?.status)) { customerRef.current = null; setCustomer(null); setDialog(null); setSelectedLead(null); }
        setError(requestError(failure, "Customer details could not be refreshed. Your saved changes are retained. Please retry."));
      }
      return null;
    } finally { if (live.current && version === reads.current.customer) setLoading(false); }
  }, [id]);
  const loadLeads = useCallback(async () => {
    if (!live.current || !customerCanWork(customerRef.current)) return null;
    const version = ++reads.current.leads;
    setLeadsLoading(true);
    try {
      const { data } = await api.get("/quotations/leads/", { params: { customer: id } });
      if (!live.current || version !== reads.current.leads || !customerCanWork(customerRef.current)) return null;
      const rows = (Array.isArray(data) ? data : data.results || []).filter(lead => String(lead.customer) === String(id));
      setLeads(rows); setLeadsError(""); return rows;
    } catch (failure) {
      if (live.current && version === reads.current.leads) { setLeads([]); setLeadsError(requestError(failure, "Enquiries could not be refreshed. Please retry.")); }
      return null;
    } finally { if (live.current && version === reads.current.leads) setLeadsLoading(false); }
  }, [id]);
  const loadCalls = useCallback(async () => {
    if (!live.current || !customerCanWork(customerRef.current)) return null;
    const version = ++reads.current.calls;
    setCallsLoading(true);
    try {
      const { data } = await api.get(`/call-inbox/customers/${id}/events/`);
      if (!live.current || version !== reads.current.calls || !customerCanWork(customerRef.current)) return null;
      setCallEvents(data.results || []); setCallsError(""); return data;
    } catch (failure) {
      if (live.current && version === reads.current.calls) {
        if ([401, 403, 404].includes(failure.response?.status)) setCallEvents([]);
        setCallsError(requestError(failure, "Incoming calls could not be loaded."));
      }
      return null;
    } finally { if (live.current && version === reads.current.calls) setCallsLoading(false); }
  }, [id]);
  useEffect(() => { loadCustomer(); }, [loadCustomer]);
  useEffect(() => {
    if (canWork) { loadLeads(); loadCalls(); }
    else { reads.current.leads += 1; reads.current.calls += 1; setLeads([]); setCallEvents([]); setLeadsLoading(false); setCallsLoading(false); }
  }, [canWork, loadLeads, loadCalls]);
  const refresh = useCallback(async () => {
    const data = await loadCustomer();
    if (data && customerCanWork(data)) await Promise.allSettled([loadLeads(), loadCalls()]);
  }, [loadCustomer, loadLeads, loadCalls]);
  const openFollowUp = useCallback(() => {
    if (!live.current || user?.role !== "CONTRACTOR" || !customerCanWork(customerRef.current)) return;
    setActionError(""); setDialog("choice"); loadLeads();
  }, [loadLeads, user?.role]);
  useEffect(() => {
    const focused = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", focused);
    window.addEventListener("bp-open-customer-followup", openFollowUp);
    return () => { window.removeEventListener("focus", focused); window.removeEventListener("bp-open-customer-followup", openFollowUp); };
  }, [refresh, openFollowUp]);
  function chooseLead(lead) {
    if (!canWork || String(lead.customer) !== String(id) || lead.can_follow_up !== true || lead.is_closed) return;
    setDialog(null); setSelectedLead(lead);
  }
  function leadDraftChanged(draft) {
    const key = selectedLead.id;
    setLeadDrafts(current => { const next = { ...current }; if (draft) next[key] = draft; else delete next[key]; return next; });
  }
  async function saved(message) {
    if (!live.current) return;
    setSelectedLead(null); setDialog(null); setSuccess(message || "Update saved."); setActionError("");
    await refresh();
  }
  async function updateCustomer(values, { changedFields } = {}) {
    if (editLock.current || !customerRef.current) return false;
    editLock.current = true; setSaving(true); setEditError("");
    const original = customerRef.current;
    const normalize = value => String(value ?? "").trim();
    const fields = ["name", "mobile", "email", "gst_number", "whatsapp", "address", "city", "pincode", "status", "notes"];
    const changes = Object.fromEntries(fields.filter(field => (!changedFields || changedFields.includes(field)) && normalize(values[field]) !== normalize(original[field])).map(field => [field, values[field]]));
    try {
      if (Object.keys(changes).length) {
        const { data } = await api.patch(`/quotations/customers/${id}/`, changes);
        if (!live.current) return false;
        customerRef.current = data; setCustomer(data);
      }
      if (!live.current) return false;
      setEditing(false); setSuccess(Object.keys(changes).length ? "Customer details saved." : "No changes were needed.");
      await loadCustomer();
      return true;
    } catch (failure) { if (live.current) setEditError(requestError(failure, "Customer details could not be saved. Your entries are retained.")); return false; }
    finally { editLock.current = false; if (live.current) setSaving(false); }
  }
  async function completeFollowUp(task) {
    if (completionLock.current || !canWork || task.is_completed || !task.next_follow_up) return;
    completionLock.current = true; setCompletingId(task.id); setActionError("");
    try {
      const fresh = await loadCustomer();
      if (!live.current || !customerCanWork(fresh)) return;
      const selected = (fresh.follow_ups || []).find(row => Number(row.id) === Number(task.id));
      if (!selected || !selected.next_follow_up) throw new Error("This scheduled follow-up is no longer available. Refresh the customer.");
      if (!selected.is_completed) {
        const { data } = await api.patch(`/quotations/tasks/${task.id}/`, { is_completed: true });
        if (!live.current) return;
        setCustomer(current => current ? { ...current, follow_ups: current.follow_ups.map(row => row.id === task.id ? { ...row, ...data, is_completed: true } : row) } : current);
      }
      setSuccess("Follow-up marked as done."); await refresh();
    } catch (failure) { if (live.current) setActionError(requestError(failure, failure.message || "Follow-up could not be completed.")); }
    finally { completionLock.current = false; if (live.current) setCompletingId(null); }
  }
  async function shareActivation() {
    if (activationLock.current || !canWork) return;
    activationLock.current = true; setActivationBusy(true); setActionError("");
    try {
      const { data } = await api.post(`/quotations/customers/${id}/${activationLink ? "share-link" : "activate-account"}/`);
      if (!live.current) return;
      if (data.share_link) setActivationLink({ ...customerRef.current, ...data, id: Number(id) });
      else { setActivationLink(null); await loadCustomer(); }
    } catch (failure) { if (live.current) setActionError(requestError(failure, "Activation link could not be prepared.")); }
    finally { activationLock.current = false; if (live.current) setActivationBusy(false); }
  }
  const canRequestConnection = customer?.is_saved_contact === true && customer.account_status !== "DISABLED" && !["PENDING", "RECONNECT_PENDING", "BLOCKED"].includes(customer.connection_status);
  async function requestConnection() {
    if (requestLock.current || !canRequestConnection) return;
    requestLock.current = true; setRequestBusy(true); setActionError("");
    try {
      await api.post("/quotations/contractor/customer-connections/request/", { mobile: customerRef.current.mobile });
      if (!live.current) return;
      setSuccess("Connection request sent."); await refresh();
    } catch (failure) { if (live.current) setActionError(requestError(failure, "The connection request could not be sent.")); }
    finally { requestLock.current = false; if (live.current) setRequestBusy(false); }
  }
  if (!customer) return <div className="crm-page crm-customer-detail">{loading ? <LoadingState label="Loading customer details..." /> : <ErrorState message={error || "Customer not found."} onRetry={loadCustomer} />}</div>;
  return <>
    <CustomerProfileView customer={customer} leads={leads}
      loading={loading} error={error || actionError} success={success} onRetry={() => { setActionError(""); refresh(); }}
      onFollowUp={openFollowUp} onEdit={() => setEditing(true)} onActivate={shareActivation} activationBusy={activationBusy}
      onRequestConnection={requestConnection} requestBusy={requestBusy} canWork={canWork} canRequestConnection={canRequestConnection}
      callEvents={callEvents} callsLoading={callsLoading} callsError={callsError} onRetryCalls={loadCalls} onComplete={completeFollowUp} completingId={completingId} />
    <CustomerForm initialValue={customer} onSubmit={updateCustomer} onClose={() => { if (!editLock.current) setEditing(false); }} saving={saving} error={editError} open={editing} preserveDraft draftPath={`/customers/${id}`} />
    {dialog === "choice" && canWork && <CustomerFollowUpChoice customer={customer} leads={leads} loading={leadsLoading} error={leadsError} onRetry={loadLeads} onGeneral={() => setDialog("general")} onLead={chooseLead} onClose={() => setDialog(null)} />}
    <GeneralCustomerFollowUp customer={customer} draft={generalDraft} onDraftChange={setGeneralDraft} open={dialog === "general" && canWork} onClose={() => setDialog(null)} onSaved={saved} />
    {selectedLead && canWork && <LeadFollowUpForm key={selectedLead.id} item={selectedLead} draft={leadDrafts[selectedLead.id]} onDraftChange={leadDraftChanged} dialogOpen onClose={() => setSelectedLead(null)} onSaved={saved} />}
    {activationLink && canWork && <CustomerActivationShare key={activationLink.share_link} customer={activationLink} contractor={user} busy={activationBusy} error={actionError} onRegenerate={shareActivation} onClose={() => { if (!activationLock.current) { setActivationLink(null); loadCustomer(); } }} />}
  </>;
}
