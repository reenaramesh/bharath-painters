import useMobileView from "../hooks/useMobileView.js";
import { recentFirst } from "../utils/workspaceLists.js";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ClipboardCheck,
  History,
  MessageSquareWarning,
  MapPin,
} from "lucide-react";
import api from "../api/client";
import { EmptyState, ErrorState, LoadingState, SectionCard, StatusBadge } from "../components/ui";
import WorkOrderPricingPanel from "../components/WorkOrderPricingPanel";
import { workOrderMoney } from "../utils/workOrderPricing";
import SubcontractQuotePanel from "../components/SubcontractQuotePanel";
import SubcontractTeamPanel from "../components/SubcontractTeamPanel";
import SubcontractBillingPanel from "../components/SubcontractBillingPanel";
import SubcontractAdditionalWorkPanel from "../components/SubcontractAdditionalWorkPanel";
import {
  apiErrorMessage,
  isDestructive,
  needsNote,
  prettyDate,
  prettyTime,
  rupees,
  TRANSITION_LABELS,
} from "../utils/subcontract";

export default function SubcontractWorkOrderDetail() {
  const mobile = useMobileView();
  const { id } = useParams();
  const navigate = useNavigate();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [editingPricing, setEditingPricing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return api
      .get(`/outsourcing/work-orders/${id}/`)
      .then(({ data }) => {
        setWorkOrder(data);
        setError("");
      })
      .catch((err) => setError(apiErrorMessage(err, "This work order could not be loaded.")))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => {
    api
      .get(`/outsourcing/work-orders/${id}/`)
      .then(({ data }) => setWorkOrder(data))
      .catch(() => {});
  }, [id]);

  const run = async (action) => {
    setActionError("");
    setBusy(true);
    try {
      await action();
      refresh();
    } catch (err) {
      setActionError(apiErrorMessage(err, "That change could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (status, note = "", scopeProgress = undefined) =>
    !editingPricing && run(() =>
      api.post(`/outsourcing/work-orders/${id}/transition/`, { status, note, ...(status === "SUBMITTED_FOR_REVIEW" && scopeProgress ? { scope_progress: scopeProgress } : {}) }),
    );

  const requestCorrection = (note) =>
    run(() => api.post(`/outsourcing/work-orders/${id}/corrections/`, { note }));

  if (loading) return <LoadingState label="Loading work order…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!workOrder) {
    return (
      <EmptyState
        title="Work order not found"
        
      />
    );
  }

  const isMain = workOrder.viewer_authority === "MAIN";
  const isReceiving = workOrder.viewer_authority === "RECEIVING";
  const counterparty = isReceiving ? workOrder.main_contractor_name : workOrder.receiving_contractor_name;

  // CORRECTION_REQUESTED is served by its own endpoint so the mandatory note
  // can never be skipped, so it is filtered out of the generic action bar.
  const transitions = (workOrder.allowed_transitions || []).filter(
    (status) => status !== "CORRECTION_REQUESTED",
  );
  const canAskForCorrections =
    isMain && workOrder.status === "SUBMITTED_FOR_REVIEW" && (workOrder.completions || []).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/subcontract-work-orders"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> All work orders
        </Link>
      </div>

      <header className="rounded-2xl border bg-white p-6 bp-ui-page-header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs text-slate-500">{workOrder.reference}</p>
            <h1 className="mt-1 text-2xl font-bold bp-ui-page-title">{workOrder.project_title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {isReceiving ? "Sent by" : "Sent to"} {counterparty || "—"} · Project{" "}
              {workOrder.quotation_reference}
            </p>
          </div>
          <StatusBadge status={workOrder.status} />
        </div>

        {workOrder.site_address && (
          <p className="mt-3 flex items-start gap-2 text-sm text-slate-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            {workOrder.site_address}
          </p>
        )}

        <dl className="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-4">
          <HeaderFigure label="Pricing" value={workOrder.material_mode ? workOrderMoney(workOrder.agreed_amount) : Number(workOrder.agreed_amount) > 0 ? rupees(workOrder.agreed_amount) : "Awaiting subcontractor quote"} strong />
          <HeaderFigure label="Scopes shared" value={(workOrder.scopes || []).length} />
          <HeaderFigure label="Required from" value={prettyDate(workOrder.required_start_date)} />
          <HeaderFigure label="Required by" value={prettyDate(workOrder.required_end_date)} />
        </dl>
      </header>

      {!editingPricing && (transitions.length > 0 || canAskForCorrections) && (
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-bold bp-ui-section-heading">What you can do now</h2>
          {actionError && (
            <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {transitions.map((status) =>
              needsNote(status) ? (
                <NoteAction
                  key={status}
                  status={status}
                  busy={busy}
                  scopes={workOrder.scopes || []}
                  onConfirm={(note, progress) => changeStatus(status, note, progress)}
                />
              ) : (
                <ConfirmAction
                  key={status}
                  status={status}
                  busy={busy}
                  onConfirm={(note) => changeStatus(status, note)}
                />
              ),
            )}
            {canAskForCorrections && (
              <CorrectionAction busy={busy} onConfirm={requestCorrection} />
            )}
          </div>
        </section>
      )}

      {workOrder.agreed_scope_summary && (
        <SectionCard title="Agreed scope">
          <p className="whitespace-pre-line text-sm text-slate-600">
            {workOrder.agreed_scope_summary}
          </p>
          {workOrder.instructions && (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              {workOrder.instructions}
            </p>
          )}
        </SectionCard>
      )}

      {!workOrder.material_mode && <SectionCard title="Scopes shared for this work">
        <ScopeSnapshot scopes={workOrder.scopes || []} />
      </SectionCard>}

      {workOrder.material_mode ? <WorkOrderPricingPanel workOrder={workOrder} isMain={isMain} onChanged={refresh} onEditing={setEditingPricing}/> : <SubcontractQuotePanel
        workOrder={workOrder}
        isMain={isMain}
        onChanged={refresh}
      />}

      {(workOrder.completions || []).length > 0 && (
        <SectionCard title="Work submitted">
          <CompletionList workOrder={workOrder} isMain={isMain} />
        </SectionCard>
      )}

      {isReceiving && <SubcontractTeamPanel workOrder={workOrder} onChanged={refresh} />}

      <SubcontractAdditionalWorkPanel
        workOrder={workOrder}
        isMain={isMain}
        onChanged={refresh}
      />

      <SubcontractBillingPanel workOrder={workOrder} isMain={isMain} onChanged={refresh} />

      {(workOrder.events || []).length > 0 && (
        <SectionCard title="History">
          <ol className="space-y-3">
            {(mobile ? recentFirst(workOrder.events) : workOrder.events).map((event) => (
              <li key={event.id} className="flex gap-3">
                <History className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <p className="text-sm">
                    <b>{event.actor_name || "System"}</b>{" "}
                    {event.from_status ? `${humanise(event.from_status)} → ` : ""}
                    <b>{humanise(event.to_status)}</b>
                  </p>
                  {event.note && <p className="text-sm text-slate-600">{event.note}</p>}
                  <p className="text-xs text-slate-400">{prettyTime(event.created_at)}</p>
                </div>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}

      <div className="pb-4">
        <button
          onClick={() => navigate("/subcontract-work-orders")}
          className="text-sm font-semibold text-slate-600 hover:text-slate-900 bp-ui-action"
        >
          Back to work orders
        </button>
      </div>
    </div>
  );
}

function HeaderFigure({ label, value, strong }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-0.5 ${strong ? "text-lg font-bold" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}

function ScopeSnapshot({ scopes }) {
  if (scopes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-5 text-sm text-slate-500">
        No project scopes were shared. The shared description above is the whole contract.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm bp-ui-table">
        <thead className="border-b text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2 pr-3">Scope</th>
            <th className="py-2 pr-3">Service</th>
            <th className="py-2 pr-3">Qty</th>
            <th className="py-2 text-right">Included</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {scopes.map((scope) => (
            <tr key={scope.id}>
              <td className="py-3 pr-3 font-semibold">
                {scope.title_snapshot}
                {scope.work_description_snapshot && (
                  <p className="text-xs font-normal text-slate-500">
                    {scope.work_description_snapshot}
                  </p>
                )}
              </td>
              <td className="py-3 pr-3 text-slate-600">{scope.category_name_snapshot || "—"}</td>
              <td className="py-3 pr-3">
                {scope.quantity} {scope.unit_name_snapshot}
              </td>
              <td className="py-3 text-right font-semibold">
                {scope.is_included ? "Yes" : "No"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
    </div>
  );
}

function CompletionList({ workOrder, isMain }) {
  return (
    <ul className="space-y-4">
      {workOrder.completions.map((completion) => (
        <li key={completion.id} className="rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">
              Submission {completion.submission_number}
              {completion.is_current ? " · latest" : ""}
            </p>
            <p className="text-xs text-slate-500">
              {completion.submitted_by_name} · {prettyTime(completion.submitted_at)}
            </p>
          </div>
          {completion.summary && (
            <p className="mt-2 text-sm text-slate-600">{completion.summary}</p>
          )}
          {completion.scope_progress?.length > 0 && <ul className="mt-2 space-y-1 text-sm text-slate-600">{completion.scope_progress.map(progress => <li key={progress.work_order_scope_id}>{progress.scope_title}: reported {progress.reported_quantity}{progress.accepted_quantity && Number(progress.accepted_quantity) > 0 ? ` · accepted ${progress.accepted_quantity}` : ""}</li>)}</ul>}

          {(completion.correction_requests || []).length > 0 && (
            <ul className="mt-3 space-y-2">
              {completion.correction_requests.map((correction) => (
                <li
                  key={correction.id}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    correction.resolved_at
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-amber-50 text-amber-800"
                  }`}
                >
                  <b>{correction.requested_by_name}</b> asked: {correction.note}
                  <p className="text-xs">
                    {correction.resolved_at
                      ? `Resolved ${prettyDate(correction.resolved_at)}`
                      : "Still open"}
                    {correction.resolution_note ? ` · ${correction.resolution_note}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {isMain && completion.open_correction_count > 0 && (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              Waiting for a fresh submission before you can approve.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

// The note is mandatory for these, so ask for it inline instead of confirming.
function NoteAction({ status, busy, onConfirm, scopes = [] }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [quantities, setQuantities] = useState({});
  const label = TRANSITION_LABELS[status] || humanise(status);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white bp-ui-action"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl bg-slate-50 p-3">
      <p className="text-sm font-semibold">
        {status === "SUBMITTED_FOR_REVIEW" ? "What did you finish?" : "Add a note"}
      </p>
      <textarea
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        className="mt-2 w-full rounded-lg border px-3 py-2 text-sm bp-ui-control"
        placeholder={
          status === "SUBMITTED_FOR_REVIEW"
            ? "Two coat putty done on internal walls. Ladder work tomorrow."
            : "Explain the change"
        }
      />
      {status === "SUBMITTED_FOR_REVIEW" && scopes.filter(scope => scope.is_included).length > 0 && <fieldset className="mt-3 space-y-2"><legend className="text-sm font-semibold">Quantity completed in this submission</legend>{scopes.filter(scope => scope.is_included).map(scope => <label key={scope.id} className="grid grid-cols-[1fr_8rem] items-center gap-3 text-sm"><span>{scope.title_snapshot || scope.work_description_snapshot || scope.category_name_snapshot} · up to {scope.quantity} {scope.unit_name_snapshot}</span><input aria-label={`Completed quantity for ${scope.title_snapshot || scope.work_description_snapshot || scope.category_name_snapshot}`} type="number" min="0" max={scope.quantity} step="0.01" required value={quantities[scope.id] ?? "0"} onChange={event => setQuantities(current => ({ ...current, [scope.id]: event.target.value }))} className="w-full rounded-lg border px-3 py-2 bp-ui-control" /></label>)}</fieldset>}
      <div className="mt-2 flex gap-2">
        <button
          disabled={busy || !note.trim()}
          onClick={() => onConfirm(note, status === "SUBMITTED_FOR_REVIEW" && scopes.filter(scope => scope.is_included).length ? scopes.filter(scope => scope.is_included).map(scope => ({ scope_id: scope.id, quantity: quantities[scope.id] ?? "0" })) : undefined)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 bp-ui-action"
        >
          {label}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg border px-4 py-2 text-sm font-semibold bp-ui-action"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ConfirmAction({ status, busy, onConfirm }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const label = TRANSITION_LABELS[status] || humanise(status);
  const destructive = isDestructive(status);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={(`rounded-xl px-4 py-2.5 text-sm font-bold ${
          destructive
            ? "border border-red-200 text-red-700"
            : "bg-slate-900 text-white"
        }`) + " bp-ui-action"}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl bg-slate-50 p-3">
      <p className="text-sm font-semibold">
        {label}? {destructive ? "This cannot be undone." : ""}
      </p>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note (optional)"
        className="mt-2 w-full rounded-lg border px-3 py-2 text-sm bp-ui-control"
      />
      <div className="mt-2 flex gap-2">
        <button
          disabled={busy}
          onClick={() => onConfirm(note)}
          className={(`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
            destructive ? "bg-red-600" : "bg-slate-900"
          }`) + " bp-ui-action"}
        >
          Yes, {label.toLowerCase()}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg border px-4 py-2 text-sm font-semibold bp-ui-action"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CorrectionAction({ busy, onConfirm }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-bold text-amber-800 bp-ui-action"
      >
        <MessageSquareWarning className="h-4 w-4" /> Ask for corrections
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-900">
        <ClipboardCheck className="mr-1 inline h-4 w-4" />
        What needs correcting?
      </p>
      <textarea
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        className="mt-2 w-full rounded-lg border px-3 py-2 text-sm bp-ui-control"
        placeholder="Patch the seepage stain near the window."
      />
      <div className="mt-2 flex gap-2">
        <button
          disabled={busy || !note.trim()}
          onClick={() => onConfirm(note)}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 bp-ui-action"
        >
          Send correction request
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg border px-4 py-2 text-sm font-semibold bp-ui-action"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function humanise(status) {
  return String(status || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}
