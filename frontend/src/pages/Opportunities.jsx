import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, SlidersHorizontal } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import useDraftUnsavedChanges from "../hooks/useDraftUnsavedChanges";
import { Button, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import LeadActionRail from "../components/leads/LeadActionRail";
import LeadListRecords from "../components/leads/LeadListRecords";
import LeadFollowUpForm from "../components/leads/LeadFollowUpForm";
import { quickUpdateDirty } from "../components/leads/lead-quick-update";
import { LEAD_ACTIONS } from "../components/leads/lead-action-config";
import useLeadAssignees from "../components/leads/useLeadAssignees";
import { OPPORTUNITY_STAGES, SOURCE_OPTIONS, PRIORITY_OPTIONS, stageLabel } from "../utils/opportunityOptions";

const legacyTitles = { overdue: "Overdue actions", today: "Due today", needs_action: "Needs action", awaiting_decision: "Awaiting decision", closed: "Closed history", unassigned: "Unassigned leads" };
const emptyFilters = { stage: "", source: "", priority: "", date_from: "", date_to: "", assigned_user: "" };

export default function Opportunities() {
  const { user } = useAuth();
  return <OpportunitiesWorkspace key={user?.id || "signed-out"} />;
}

function OpportunitiesWorkspace() {
  const { user } = useAuth();
  const contractor = user?.role === "CONTRACTOR";
  const team = useLeadAssignees(contractor);
  const [params, setParams] = useSearchParams();
  const queue = params.get("queue") || "active";
  const customer = params.get("customer") || "";
  const selectedAssignee = params.get("assigned_user") || "";
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [retry, setRetry] = useState(0);
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [updating, setUpdating] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [notice, setNotice] = useState("");
  const listHeading = useRef(null);
  const restoreAfterRefresh = useRef(false);
  useDraftUnsavedChanges(Object.values(drafts).some(quickUpdateDirty), true, { preservePathname: "/opportunities" });
  const version = useRef(0);
  const summaryVersion = useRef(0);
  const setBoardParams = next => setParams(next);
  const changeQueue = key => { const next = new URLSearchParams(params); next.set("queue", key); setBoardParams(next); };
  const retryRefresh = () => { setRetry(value => value + 1); setSummaryRetry(value => value + 1); };
  function draftChanged(value) {
    setDrafts(current => {
      const next = { ...current };
      if (value) next[updating.id] = value;
      else delete next[updating.id];
      return next;
    });
  }
  function updateSaved() {
    setNotice("Update saved.");
    restoreAfterRefresh.current = true;
    setUpdating(null);
    retryRefresh();
  }
  useEffect(() => {
    const requestId = ++version.current;
    const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      const query = new URLSearchParams();
      if (customer) query.set("customer", customer);
      if (selectedAssignee) query.set("assigned_user", selectedAssignee);
      Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
      if (search.trim()) query.set("search", search.trim());
      const current = () => version.current === requestId;
      api.get(`/quotations/leads/?${query}&queue=${encodeURIComponent(queue)}`)
        .then(({ data }) => { if (current()) setItems(data); })
        .catch(failure => { if (current()) {
          if ([401, 403, 404].includes(failure.response?.status)) setItems([]);
          setError("Leads could not be refreshed or access has changed. Please retry.");
        } })
        .finally(() => { if (current()) {
          setLoading(false);
          if (restoreAfterRefresh.current) {
            restoreAfterRefresh.current = false;
            window.requestAnimationFrame(() => { if (document.activeElement === document.body) listHeading.current?.focus(); });
          }
        } });
    }, search ? 300 : 0);
    return () => { window.clearTimeout(timer); version.current += 1; };
  }, [search, filters, queue, retry, customer, selectedAssignee, user?.id]);
  useEffect(() => {
    const requestId = ++summaryVersion.current;
    const timer = window.setTimeout(() => {
      setSummaryLoading(true); setSummaryError("");
      const query = new URLSearchParams();
      if (customer) query.set("customer", customer);
      if (selectedAssignee) query.set("assigned_user", selectedAssignee);
      Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
      if (search.trim()) query.set("search", search.trim());
      const current = () => summaryVersion.current === requestId;
      api.get(`/quotations/leads/summary/?${query}`)
        .then(({ data }) => { if (current()) setSummary(data); })
        .catch(failure => { if (current()) {
          if ([401, 403, 404].includes(failure.response?.status)) setSummary(null);
          setSummaryError("Action counts could not be loaded.");
        } })
        .finally(() => { if (current()) setSummaryLoading(false); });
    }, search ? 300 : 0);
    return () => { window.clearTimeout(timer); summaryVersion.current += 1; };
  }, [search, filters, summaryRetry, customer, selectedAssignee, user?.id]);
  const update = (key, value) => {
    if (key === "assigned_user") { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setBoardParams(next); }
    else setFilters(current => ({ ...current, [key]: value }));
  };
  const currentTitle = LEAD_ACTIONS.find(action => action.key === queue)?.label || legacyTitles[queue] || "All active leads";
  const hasFilters = Boolean(search || customer || selectedAssignee || Object.values(filters).some(Boolean));
  const ownerFilter = <label className="lead-field"><span>Lead owner</span><select value={selectedAssignee} onChange={event => update("assigned_user", event.target.value)} disabled={team.loading}>
    <option value="">All team members</option><option value={user?.id}>Myself</option><option value="unassigned">Unassigned</option>{team.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
  </select></label>;
  return <div className="lead-workspace space-y-5">
    <PageHeader eyebrow={contractor ? "Your daily workspace" : "Your assigned enquiries"} title={contractor ? "Leads & follow-ups" : "My leads"} description={contractor ? "Assign each enquiry, see what needs attention and keep the next action clear." : "Contact your assigned customers and keep the contractor updated."} actions={contractor ? <Link className="lead-primary-action" to="/opportunities/new"><Plus size={17} aria-hidden="true" />New lead</Link> : undefined} />
    {notice && <div className="lead-quick-notice" role="status"><span>{notice}</span>{(error || summaryError) && <><span>The saved update is safe. Refresh the board to see the latest information.</span><Button variant="secondary" onClick={retryRefresh}>Retry refresh</Button></>}</div>}
    {customer && <div className="lead-panel lead-row-heading justify-between text-sm"><p>Showing this customer's leads.</p><button type="button" className="lead-details-toggle" onClick={() => { const next = new URLSearchParams(params); next.delete("customer"); setBoardParams(next); }}>Show all customers</button></div>}
    <section className="lead-panel" aria-label="Find leads">
      <div className="lead-filterbar"><input className="lead-search" type="search" aria-label="Search leads" placeholder="Search customer, phone, service or reference" value={search} onChange={event => setSearch(event.target.value)} />{contractor && <div className="lead-owner-filter">{ownerFilter}</div>}</div>
      {contractor && team.error && <p role="alert" className="lead-muted mt-2">{team.error} <button type="button" className="lead-inline-button" onClick={team.retry}>Retry team list</button></p>}
      <details className="mt-3"><summary className="lead-details-toggle"><SlidersHorizontal size={14} className="mr-2 inline" aria-hidden="true" />Stage, source, priority & dates</summary><div className="lead-filters">
        <label className="lead-field"><span>Stage</span><select value={filters.stage} onChange={event => update("stage", event.target.value)}><option value="">All stages</option>{OPPORTUNITY_STAGES.map(key => <option key={key} value={key}>{stageLabel(key)}</option>)}</select></label>
        <label className="lead-field"><span>Source</span><select value={filters.source} onChange={event => update("source", event.target.value)}><option value="">All sources</option>{SOURCE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="lead-field"><span>Priority</span><select value={filters.priority} onChange={event => update("priority", event.target.value)}><option value="">All priorities</option>{PRIORITY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="lead-field"><span>Received from</span><input type="date" max={filters.date_to || undefined} value={filters.date_from} onChange={event => update("date_from", event.target.value)} /></label>
        <label className="lead-field"><span>Received to</span><input type="date" min={filters.date_from || undefined} value={filters.date_to} onChange={event => update("date_to", event.target.value)} /></label>
      </div></details>
      {hasFilters && <Button variant="secondary" className="mt-3" onClick={() => { setSearch(""); setFilters({ ...emptyFilters }); const next = new URLSearchParams(params); next.delete("customer"); next.delete("assigned_user"); setBoardParams(next); }}>Clear filters</Button>}
    </section>
    <div className="lead-workspace-grid">
      <LeadActionRail summary={summary} queue={queue} onChoose={changeQueue} loading={summaryLoading} error={summaryError} onRetry={() => setSummaryRetry(value => value + 1)} contractor={contractor} />
      <section className="lead-panel lead-results" aria-busy={loading} aria-label="Lead results">
        <div className="lead-list-header lead-list-compact-header"><h2 ref={listHeading} tabIndex={-1}>{currentTitle}<span className="lead-list-count" role="status"> · {items.length}{loading && items.length ? " · Refreshing…" : ""}</span></h2><span className="lead-muted">Dates in India time</span></div>
        {error && <ErrorState message={error} onRetry={() => setRetry(value => value + 1)} />}
        {loading && !items.length ? <LoadingState label="Loading leads…" /> : items.length ? <LeadListRecords items={items} contractor={contractor} onUpdate={setUpdating} /> : !error && <EmptyState title={summary?.total === 0 && !hasFilters ? contractor ? "Your lead workspace starts here" : "No leads assigned yet" : `No ${currentTitle.toLowerCase()} leads`} description={summary?.total === 0 && !hasFilters ? contractor ? "Add an enquiry, assign the owner and plan the first contact." : "Leads will appear here when your contractor assigns them to you." : hasFilters ? "Clear filters or choose another action to see more leads." : "You're up to date in this category. Choose All active to see other enquiries."} />}
      </section>
    </div>
    {updating && <LeadFollowUpForm key={updating.id} item={updating} draft={drafts[updating.id]} onDraftChange={draftChanged} dialogOpen onClose={() => setUpdating(null)} onSaved={updateSaved} />}
  </div>;
}
