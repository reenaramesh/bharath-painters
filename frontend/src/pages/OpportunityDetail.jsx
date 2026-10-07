import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CalendarClock,
  FileText,
  History,
  MapPin,
  Phone,
  Save,
  StickyNote,
  Target,
  Wrench,
} from "lucide-react";
import api from "../api/client";
import BackButton from "../components/BackButton";
import { ErrorState, LoadingState, PageHeader, StatusBadge } from "../components/ui";
import "./crm-pages.css";
import {
  LOST_REASON_OPTIONS,
  OPPORTUNITY_STAGES,
  PRIORITY_OPTIONS,
  SOURCE_OPTIONS,
  stageLabel,
  money,
} from "../utils/opportunityOptions";

const input =
  "mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900";
const card = "rounded-2xl border border-slate-200 bg-white p-5";

function optionLabel(value) {
  const found = SOURCE_OPTIONS.find(([option]) => option === value);
  return found ? found[1] : String(value || "-").replaceAll("_", " ").toLowerCase();
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString("en-GB") : "-";
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-GB");
}

function Field({ label: text, children }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {text}
      </p>
      <div className="mt-1 text-sm font-semibold text-slate-900">{children}</div>
    </div>
  );
}

export default function OpportunityDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [lostReason, setLostReason] = useState("");
  const [lostNote, setLostNote] = useState("");

  // The API exposes a contractor-scoped lead list and a PATCH detail route,
  // so the record is read from the list and matched on its id.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/quotations/leads/?view=all");
      const rows = Array.isArray(data) ? data : data.results || [];
      const found = rows.find((row) => String(row.id) === String(id));
      if (!found) {
        setItem(null);
        setError(
          "This opportunity does not exist, or it belongs to another account.",
        );
        return;
      }
      setItem(found);
      setLostReason(found.lost_reason || "");
      setLostNote(found.lost_note || "");
      setError("");
    } catch {
      setError("Opportunity could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Site visits are contractor-scoped; keep only the ones for this opportunity.
  useEffect(() => {
    let active = true;
    api
      .get("/quotations/site-visits/")
      .then(({ data }) => {
        if (!active) return;
        const rows = Array.isArray(data) ? data : data.results || [];
        setVisits(rows.filter((row) => String(row.opportunity) === String(id)));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id, item?.stage]);

  const history = useMemo(() => item?.history || [], [item]);

  function startEditing() {
    setDraft({
      title: item.title || "",
      description: item.description || "",
      priority: item.priority || "MEDIUM",
      estimated_value: item.estimated_value ?? "",
      next_follow_up: item.next_follow_up
        ? new Date(item.next_follow_up).toISOString().slice(0, 16)
        : "",
      notes: item.notes || "",
    });
    setFormError("");
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setFormError("");
  }

  function messageFor(requestError, fallback) {
    const data = requestError?.response?.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const parts = Object.values(data).flat().filter(Boolean);
      if (parts.length) return parts.join(" ");
    }
    return fallback;
  }

  async function saveDetails(event) {
    event.preventDefault();
    if (!draft.title.trim()) {
      setFormError("Enter the requirement title.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const { data } = await api.patch(`/quotations/leads/${id}/`, {
        title: draft.title.trim(),
        description: draft.description,
        priority: draft.priority,
        estimated_value: draft.estimated_value === "" ? null : draft.estimated_value,
        next_follow_up: draft.next_follow_up || null,
        notes: draft.notes,
      });
      setItem((current) => ({ ...current, ...data }));
      setEditing(false);
    } catch (requestError) {
      setFormError(
        messageFor(requestError, "Opportunity could not be saved."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStage(stage) {
    if (!item || stage === item.stage) return;
    const payload = { stage };
    if (stage === "LOST") {
      if (!lostReason) {
        setFormError("Select a reason for losing this opportunity.");
        return;
      }
      payload.lost_reason = lostReason;
      payload.lost_note = lostNote;
    }
    setSaving(true);
    setFormError("");
    try {
      const { data } = await api.patch(`/quotations/leads/${id}/`, payload);
      setItem((current) => ({ ...current, ...data }));
      if (data.lost_reason) setLostReason(data.lost_reason);
      if (data.lost_note !== undefined) setLostNote(data.lost_note);
    } catch (requestError) {
      setFormError(messageFor(requestError, "Stage could not be updated."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 crm-page crm-opportunity-detail">
        <BackButton fallback="/opportunities" label="Back to opportunities" />
        <LoadingState label="Loading opportunity details..." />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="space-y-6 crm-page crm-opportunity-detail">
        <BackButton fallback="/opportunities" label="Back to opportunities" />
        <div className="crm-detail-error"><ErrorState message={error || "Opportunity not found."} onRetry={load} />
          <div className="mt-3 flex justify-center">
            <Link
              to="/opportunities"
              className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Back to opportunities
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const overdue =
    item.next_follow_up && new Date(item.next_follow_up) <= new Date();

  return (
      <div className="space-y-6 crm-page crm-opportunity-detail">
      <BackButton fallback="/opportunities" label="Back to opportunities" />

      <PageHeader eyebrow="Sales opportunity" title={item.title} description={item.reference_no || `OPP-${item.id}`} actions={<StatusBadge status={item.stage} label={stageLabel(item.stage)} tone={opportunityTone(item.stage)} />} />

      {formError && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Customer">
          <Link
            to={`/customers/${item.customer}`}
            className="hover:text-amber-700 hover:underline"
          >
            {item.customer_name}
          </Link>
          <span className="block text-xs font-normal text-slate-500">
            {item.customer_mobile}
            {item.customer_bharath_id ? ` Â· ${item.customer_bharath_id}` : ""}
          </span>
        </Field>
        <Field label="Service">{item.service_name || "-"}</Field>
        <Field label="Estimated value">
          {item.estimated_value ? money(item.estimated_value) : "-"}
        </Field>
        <Field label="Priority">{optionLabel(item.priority)}</Field>
        <Field label="Property">
          {item.property_name || "Not selected"}
        </Field>
        <Field label="Lead source">{optionLabel(item.source)}</Field>
        <Field label="Expected start">
          {formatDate(item.expected_start_date)}
        </Field>
        <Field label="Site visit">
          {item.site_visit_required ? "Required" : "Not required"}
        </Field>
      </div>

      {/* STAGE */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-slate-900">Opportunity stage</h2>
          <span className="text-xs text-slate-500">
            Updated {formatDateTime(item.updated_at)}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {OPPORTUNITY_STAGES.map((value) => (
            <button
              key={value}
              type="button"
              disabled={saving}
              onClick={() => changeStage(value)}
              className={`rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-60 ${
                value === item.stage
                  ? "bg-slate-950 text-white"
                  : "border bg-white text-slate-600 hover:border-slate-900"
              }`}
            >
              {stageLabel(value)}
            </button>
          ))}
        </div>

        {item.stage === "LOST" && (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">
              Lost reason: {optionLabel(item.lost_reason)}
            </p>
            {item.lost_note && (
              <p className="mt-1 whitespace-pre-line">{item.lost_note}</p>
            )}
          </div>
        )}

        {(item.stage === "LOST" || item.stage === "CANCELLED") && !editing && (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-slate-600">
              Record a lost reason
              <select
                value={lostReason}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setLostReason(event.target.value)}
                className="mt-1.5 block rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-slate-900"
              >
                <option value="">Select reason</option>
                {LOST_REASON_OPTIONS.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1 text-xs font-semibold text-slate-600">
              Note
              <input
                value={lostNote}
                onChange={(event) => setLostNote(event.target.value)}
                placeholder="What happened?"
                className={input}
              />
            </label>
            <button
              type="button"
              disabled={saving || !lostReason}
              onClick={() => changeStage("LOST")}
              className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}
      </section>

      {/* NEXT FOLLOW-UP */}
      <section
        className={`${card} flex flex-wrap items-center justify-between gap-3`}
      >
        <div className="flex items-center gap-3">
          <CalendarClock className="h-5 w-5 text-slate-400" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Next follow-up
            </p>
            <p
              className={`text-sm font-bold ${
                overdue ? "text-red-600" : "text-slate-900"
              }`}
            >
              {formatDateTime(item.next_follow_up)}
              {overdue ? " Â· due" : ""}
            </p>
          </div>
        </div>
        {item.customer_mobile && (
          <a
            href={`tel:${item.customer_mobile}`}
            className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold hover:border-slate-900"
          >
            <Phone className="h-4 w-4" />
            Call {item.customer_name}
          </a>
        )}
      </section>

      {/* DETAILS / EDIT */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-slate-900">Requirement details</h2>
          {!editing ? (
            <button
              type="button"
              onClick={startEditing}
              className="rounded-xl border px-4 py-2.5 text-sm font-semibold hover:border-slate-900"
            >
              Edit
            </button>
          ) : null}
        </div>

        {editing ? (
          <form onSubmit={saveDetails} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold sm:col-span-2">
              Requirement title
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
                className={input}
              />
            </label>
            <label className="text-sm font-semibold">
              Priority
              <select
                value={draft.priority}
                onChange={(event) =>
                  setDraft({ ...draft, priority: event.target.value })
                }
                className={input}
              >
                {PRIORITY_OPTIONS.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Estimated value (â‚¹)
              <input
                type="number"
                min="0"
                value={draft.estimated_value}
                onChange={(event) =>
                  setDraft({ ...draft, estimated_value: event.target.value })
                }
                className={input}
              />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              Next follow-up
              <input
                type="datetime-local"
                value={draft.next_follow_up}
                onChange={(event) =>
                  setDraft({ ...draft, next_follow_up: event.target.value })
                }
                className={input}
              />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              Requirement description
              <textarea
                rows="3"
                value={draft.description}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
                className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
              />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              Internal notes
              <textarea
                rows="2"
                value={draft.notes}
                onChange={(event) =>
                  setDraft({ ...draft, notes: event.target.value })
                }
                className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
              />
            </label>
            <div className="flex justify-end gap-2 border-t pt-4 sm:col-span-2">
              <button
                type="button"
                onClick={cancelEditing}
                className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 space-y-4">
            <Detail icon={Wrench} title="Requirement">
              {item.description || "No description recorded."}
            </Detail>
            <Detail icon={StickyNote} title="Internal notes">
              {item.notes || "No internal notes."}
            </Detail>
          </div>
        )}
      </section>

      {/* LINKED RECORDS */}
      <section className={card}>
        <h2 className="font-bold text-slate-900">Linked records</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {item.quotation_id ? (
            <Link
              to={`/quotations/${item.quotation_id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 hover:border-slate-900"
            >
              <span className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-slate-400" />
                <span>
                  <span className="block text-sm font-bold text-slate-900">
                    {item.quotation_number || `Quotation #${item.quotation_id}`}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {stageLabel(item.quotation_status) || "Quotation"}
                  </span>
                </span>
              </span>
              <span className="text-xs font-semibold text-slate-400">Open</span>
            </Link>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400">
              <FileText className="h-5 w-5" />
              No quotation linked yet
            </div>
          )}

          {item.job_id ? (
            <Link
              to="/work-schedules"
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 hover:border-slate-900"
            >
              <span className="flex items-center gap-3">
                <CalendarClock className="h-5 w-5 text-slate-400" />
                <span>
                  <span className="block text-sm font-bold text-slate-900">
                    Work schedule #{item.job_id}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {stageLabel(item.job_status) || "Scheduled"}
                  </span>
                </span>
              </span>
              <span className="text-xs font-semibold text-slate-400">Open</span>
            </Link>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400">
              <CalendarClock className="h-5 w-5" />
              No work scheduled yet
            </div>
          )}
        </div>
      </section>

      {/* SITE VISITS */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-slate-900">Site visits</h2>
          <Link
            to="/site-visits"
            className="text-sm font-semibold text-slate-600 underline hover:text-slate-950"
          >
            Manage site visits
          </Link>
        </div>
        {visits.length ? (
          <ul className="mt-4 space-y-2">
            {visits.map((visit) => (
              <li
                key={visit.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-sm"
              >
                <span className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  <span className="font-semibold text-slate-900">
                    {formatDate(visit.scheduled_date)}
                    {visit.scheduled_time ? ` Â· ${visit.scheduled_time}` : ""}
                  </span>
                </span>
                <span className="text-slate-500">
                  {stageLabel(visit.status)}
                  {visit.contact_person ? ` Â· ${visit.contact_person}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            No site visits recorded for this opportunity.
          </p>
        )}
      </section>

      {/* HISTORY */}
      <section className={card}>
        <h2 className="flex items-center gap-2 font-bold text-slate-900">
          <History className="h-4 w-4 text-slate-400" />
          Stage history
        </h2>
        {history.length ? (
          <ol className="mt-4 space-y-3">
            {history.map((event) => (
              <li key={event.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {event.from_stage
                      ? `${stageLabel(event.from_stage)} â†’ ${stageLabel(event.to_stage)}`
                      : stageLabel(event.to_stage)}
                  </p>
                  {event.note && (
                    <p className="text-slate-600">{event.note}</p>
                  )}
                  <p className="text-xs text-slate-400">
                    {formatDateTime(event.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No stage changes yet.</p>
        )}
      </section>
    </div>
  );
}

function Detail({ icon: Icon, title, children }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </p>
      <p className="mt-1.5 whitespace-pre-line text-sm text-slate-700">
        {children}
      </p>
    </div>
  );
}

function opportunityTone(value) {
  if (["WON", "COMPLETED"].includes(value)) return "success";
  if (["LOST", "CANCELLED"].includes(value)) return "danger";
  if (["FOLLOW_UP", "NEGOTIATION"].includes(value)) return "warning";
  if (["NEW", "CONTACTED", "SITE_VISIT", "MEASUREMENT", "QUOTATION", "IN_PROGRESS"].includes(value)) return "info";
  return "neutral";
}
