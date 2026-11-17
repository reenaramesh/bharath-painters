import { useEffect, useRef, useState } from "react";
import api from "../../api/client";
import useDraftUnsavedChanges from "../../hooks/useDraftUnsavedChanges";
import ContractorDialog from "../ContractorDialog";
import { Button } from "../ui";
import CustomerFollowUpChoice from "../customers/CustomerFollowUpChoice";
import GeneralCustomerFollowUp from "../customers/GeneralCustomerFollowUp";
import { customerCanWork } from "../customers/customer-workflow";
import LeadFollowUpForm from "../leads/LeadFollowUpForm";
import { quickUpdateDirty } from "../leads/lead-quick-update";
import { requestError } from "../leads/lead-format";

const rowsFrom = data => Array.isArray(data) ? data : data?.results || [];

export default function TaskFollowupWorkspace({ target, onClose, onSaved }) {
  const [customer, setCustomer] = useState(null);
  const [mode, setMode] = useState("choice");
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsError, setLeadsError] = useState("");
  const [retry, setRetry] = useState(0);
  const [leadRetry, setLeadRetry] = useState(0);
  const [selectedLead, setSelectedLead] = useState(null);
  const [generalDrafts, setGeneralDrafts] = useState({});
  const [leadDrafts, setLeadDrafts] = useState({});
  const version = useRef(0);
  const alive = useRef(true);
  const targetRef = useRef(target);
  targetRef.current = target;
  const customerId = target?.customer;
  useEffect(() => { alive.current = true; return () => { alive.current = false; version.current += 1; }; }, []);
  useDraftUnsavedChanges(Object.values(generalDrafts).some(draft => draft.edited) || Object.values(leadDrafts).some(quickUpdateDirty), true, { preservePathname: "/tasks" });

  useEffect(() => {
    const request = ++version.current;
    setCustomer(null); setSelectedLead(null); setMode("choice"); setLeads([]); setError(""); setLeadsError("");
    if (!customerId) { setLoading(false); return undefined; }
    const controller = new AbortController();
    setLoading(true);
    api.get(`/quotations/customers/${customerId}/`, { signal: controller.signal }).then(({ data }) => {
      if (request !== version.current) return;
      if (!customerCanWork(data)) { setError("This customer is unavailable for follow-ups. Refresh the Tasks page."); return; }
      setCustomer(data);
    }).catch(failure => { if (request === version.current) setError(requestError(failure, "Customer details could not be refreshed. Please retry.")); })
      .finally(() => { if (request === version.current) setLoading(false); });
    return () => { version.current += 1; controller.abort(); };
  }, [customerId, retry]);

  useEffect(() => {
    if (!customer || String(customer.id) !== String(customerId)) return undefined;
    const request = version.current;
    let active = true;
    const controller = new AbortController();
    setLeadsLoading(true); setLeadsError("");
    api.get("/quotations/leads/", { params: { customer: customer.id }, signal: controller.signal }).then(({ data }) => {
      if (active && request === version.current) setLeads(rowsFrom(data).filter(lead => String(lead.customer) === String(customer.id)));
    }).catch(failure => {
      if (active && request === version.current) { setLeads([]); setLeadsError(requestError(failure, "Enquiries could not be loaded. Retry, or add a general follow-up.")); }
    }).finally(() => { if (active && request === version.current) setLeadsLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [customer, customerId, leadRetry]);

  function generalDraftChanged(draft) {
    if (!customerId) return;
    setGeneralDrafts(previous => { const next = { ...previous }; if (draft) next[customerId] = draft; else delete next[customerId]; return next; });
  }
  function leadDraftChanged(draft) {
    if (!selectedLead) return;
    const key = selectedLead.id;
    setLeadDrafts(previous => { const next = { ...previous }; if (draft) next[key] = draft; else delete next[key]; return next; });
  }
  function chooseLead(lead) {
    if (!customer || String(customer.id) !== String(customerId) || String(lead.customer) !== String(customer.id) || !lead.can_follow_up || lead.is_closed) return;
    setSelectedLead(lead); setMode("lead");
  }
  async function saved(message) {
    const expected = customerId;
    if (!alive.current || (targetRef.current && String(targetRef.current.customer) !== String(expected))) return;
    onClose();
    await onSaved(message);
  }
  if (!target) return null;
  if (!customer || String(customer.id) !== String(customerId)) return <ContractorDialog title="Add follow-up" description={target.customer_name} size="md" onClose={onClose} popupProtection="readonly">
    <div className="space-y-4" aria-busy={loading || Boolean(customer)}>{loading || customer ? <p role="status">Checking customer access…</p> : <div role="alert"><p>{error || "Loading the customer…"}</p><Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Retry customer</Button></div>}<Button variant="secondary" onClick={onClose}>Close</Button></div>
  </ContractorDialog>;
  const pending = (customer.follow_ups || []).filter(row => !row.is_completed && row.next_follow_up && Number.isFinite(Date.parse(row.next_follow_up))).sort((left, right) => Date.parse(left.next_follow_up) - Date.parse(right.next_follow_up));
  return <>
    {mode === "choice" && <CustomerFollowUpChoice customer={customer} existingFollowUps={pending} leads={leads} loading={leadsLoading} error={leadsError} onRetry={() => setLeadRetry(value => value + 1)} onGeneral={() => setMode("general")} onLead={chooseLead} onClose={onClose} />}
    {mode === "general" && <GeneralCustomerFollowUp key={customer.id} customer={customer} draft={generalDrafts[customer.id]} onDraftChange={generalDraftChanged} open onClose={onClose} onSaved={saved} />}
    {mode === "lead" && selectedLead && <LeadFollowUpForm key={selectedLead.id} item={selectedLead} draft={leadDrafts[selectedLead.id]} onDraftChange={leadDraftChanged} dialogOpen onClose={onClose} onSaved={saved} />}
  </>;
}
