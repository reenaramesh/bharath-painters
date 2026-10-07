import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HardHat, Network, Plus } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { StatusBadge } from "../components/ui";
import { apiErrorMessage, connectionCounterparty, prettyDate, rupees } from "../utils/subcontract";

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "SENT", label: "Awaiting response" },
  { value: "ACTIVE", label: "In progress" },
  { value: "SUBMITTED_FOR_REVIEW", label: "Awaiting review" },
  { value: "COMPLETED", label: "Completed" },
];

export default function SubcontractWorkOrders() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  // A scope on the quotation screen links straight into this form, so the modal
  // opens on arrival with the project and scope already chosen.
  const [creating, setCreating] = useState(Boolean(searchParams.get("quotation")));
  const presetQuotation = searchParams.get("quotation") || "";
  const presetScope = searchParams.get("scope") || "";

  const closeCreate = () => {
    setCreating(false);
    if (searchParams.get("quotation") || searchParams.get("scope")) setSearchParams({});
  };

  const load = useCallback(
    () =>
      api
        .get("/outsourcing/work-orders/")
        .then(({ data }) => {
          setRows(Array.isArray(data) ? data : data?.results || []);
          setError("");
        })
        .catch((err) => setError(apiErrorMessage(err, "Subcontract work could not be loaded.")))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const tally = {};
    for (const row of rows) tally[row.status] = (tally[row.status] || 0) + 1;
    return tally;
  }, [rows]);

  const visible = useMemo(() => {
    if (filter === "ALL") return rows;
    if (filter === "ACTIVE") {
      return rows.filter((row) =>
        ["ACCEPTED", "SCHEDULED", "IN_PROGRESS", "CORRECTION_REQUESTED"].includes(row.status),
      );
    }
    return rows.filter((row) => row.status === filter);
  }, [rows, filter]);

  const isCustomer = user?.role === "CUSTOMER";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-amber-600">Outsourcing</p>
          <h1 className="mt-1 text-3xl font-bold">Subcontract Work Orders</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Work you send to another contractor, and work other contractors send to you. Money
            stays separate from your customer billing and from the wages you pay your own people.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/contractor-network"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
          >
            <Network className="h-4 w-4" /> Contractor Network
          </Link>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" /> Send work
          </button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total work orders" value={rows.length} />
        <Metric label="Awaiting review" value={counts.SUBMITTED_FOR_REVIEW || 0} tone="amber" />
        <Metric label="In progress" value={counts.IN_PROGRESS || 0} tone="blue" />
        <Metric
          label="Agreed value"
          value={rupees(rows.reduce((sum, row) => sum + Number(row.agreed_amount || 0), 0))}
          tone="green"
        />
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              filter === option.value
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-slate-500">
          Loading subcontract work…
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-slate-500">
          {rows.length === 0
            ? isCustomer
              ? "Subcontract work is between contractors and is not shown on customer accounts."
              : "No subcontract work yet. Connect with another contractor to send work."
            : "Nothing matches this filter."}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((row) => (
            <WorkOrderCard key={row.id} row={row} />
          ))}
        </div>
      )}

      {creating && (
        <CreateWorkOrder
          initialQuotation={presetQuotation}
          presetScope={presetScope}
          onClose={closeCreate}
          onCreated={() => {
            closeCreate();
            load();
          }}
        />
      )}
    </div>
  );
}

function Metric({ label, value, tone = "slate" }) {
  const tones = {
    slate: "text-slate-900",
    amber: "text-amber-600",
    blue: "text-sky-600",
    green: "text-emerald-600",
  };
  return (
    <article className="rounded-2xl border bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tones[tone]}`}>{value}</p>
    </article>
  );
}

function WorkOrderCard({ row }) {
  // The backend tells us which side of the trade this user is on, so the card
  // never guesses from names.
  const role = row.viewer_authority === "MAIN" ? "You sent this work" : "You received this work";
  const counterparty =
    row.viewer_authority === "MAIN" ? row.receiving_contractor_name : row.main_contractor_name;
  const openCorrections = row.correction_requests?.filter((item) => !item.resolved_at).length || 0;

  return (
    <Link
      to={`/subcontract-work-orders/${row.id}`}
      className="block rounded-2xl border bg-white p-5 transition hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-mono text-slate-500">{row.reference}</p>
          <h3 className="mt-1 truncate text-lg font-bold">{row.project_title || "Subcontract work"}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {role} · {counterparty || "—"}
          </p>
        </div>
        <StatusBadge status={row.status} />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Agreed</dt>
          <dd className="font-bold">{rupees(row.agreed_amount)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Scopes</dt>
          <dd className="font-bold">{row.scopes?.length || 0}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Start</dt>
          <dd className="font-bold">{prettyDate(row.required_start_date)}</dd>
        </div>
      </dl>

      {openCorrections > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          {openCorrections} correction{openCorrections > 1 ? "s" : ""} open
        </p>
      )}
    </Link>
  );
}

function CreateWorkOrder({ initialQuotation = "", presetScope = "", onClose, onCreated }) {
  const [quotations, setQuotations] = useState([]);
  const [connections, setConnections] = useState([]);
  const [form, setForm] = useState({
    quotation: initialQuotation,
    receiving_contractor: "",
    project_title: "",
    agreed_scope_summary: "",
    agreed_amount: "",
    required_start_date: "",
    required_end_date: "",
  });
  const [scopeChoices, setScopeChoices] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Only live projects can be outsourced, so filter out drafts and cancelled
    // quotations here rather than sending a status filter the API ignores.
    api
      .get("/quotations/")
      .then(({ data }) => {
        const all = Array.isArray(data) ? data : data?.results || [];
        setQuotations(
          all.filter((row) => ["ACCEPTED", "SCHEDULED", "IN_PROGRESS"].includes(row.status)),
        );
      })
      .catch(() => setQuotations([]));
    api
      .get("/quotations/contractor-connections/", { params: { status: "CONNECTED" } })
      .then(({ data }) => setConnections(Array.isArray(data) ? data : []))
      .catch(() => setConnections([]));
  }, []);

  // Only scopes belonging to the selected project can be shared, so the picker
  // refetches whenever the quotation changes. A scope linked from the quotation
  // screen arrives pre-selected.
  useEffect(() => {
    if (!form.quotation) {
      setScopeChoices([]);
      return;
    }
    api
      .get("/quotations/project-scopes/", { params: { quotation: form.quotation } })
      .then(({ data }) => {
        const rows = Array.isArray(data) ? data : [];
        const preset = presetScope ? rows.find((scope) => String(scope.id) === String(presetScope)) : null;
        if (preset) {
          // Carry the scope's own wording across so the contractor sees the same
          // line the main contractor priced.
          setForm((current) => ({
            ...current,
            project_title: current.project_title || preset.title,
            agreed_scope_summary:
              current.agreed_scope_summary ||
              [preset.work_description_name, preset.category_name].filter(Boolean).join(" · "),
            agreed_amount: current.agreed_amount || String(preset.amount || ""),
            required_start_date: current.required_start_date || preset.target_start_date || "",
            required_end_date: current.required_end_date || preset.target_end_date || "",
          }));
        }
        setScopeChoices(
          rows.map((scope) => ({
            ...scope,
            checked: presetScope ? String(scope.id) === String(presetScope) : false,
          })),
        );
      })
      .catch(() => setScopeChoices([]));
  }, [form.quotation, presetScope]);

  const selectedConnection = connections.find(
    (row) => String(connectionCounterparty(row).id) === String(form.receiving_contractor),
  );

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.post("/outsourcing/work-orders/", {
        quotation: Number(form.quotation),
        receiving_contractor: form.receiving_contractor
          ? Number(form.receiving_contractor)
          : null,
        project_title: form.project_title,
        agreed_scope_summary: form.agreed_scope_summary,
        agreed_amount: form.agreed_amount || "0",
        required_start_date: form.required_start_date || null,
        required_end_date: form.required_end_date || null,
        project_scope_ids: scopeChoices.filter((scope) => scope.checked).map((scope) => scope.id),
      });
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err, "The work order could not be created."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Send work to a contractor</h2>
            <p className="mt-1 text-sm text-slate-500">
              You can only send work to a contractor you are connected with.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-slate-400">
            ×
          </button>
        </div>

        {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="space-y-4">
          <Field label="Project (quotation)">
            <select
              required
              value={form.quotation}
              onChange={(event) => setForm({ ...form, quotation: event.target.value })}
            >
              <option value="">Choose a project</option>
              {quotations.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.quotation_number || `#${row.id}`} · {row.status}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Receiving contractor">
            <select
              required
              value={form.receiving_contractor}
              onChange={(event) =>
                setForm({ ...form, receiving_contractor: event.target.value })
              }
            >
              <option value="">Choose a connected contractor</option>
              {connections.map((row) => {
                const other = connectionCounterparty(row);
                return (
                  <option key={row.id} value={other.id}>
                    {other.label}
                  </option>
                );
              })}
            </select>
          </Field>

          {connections.length === 0 && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              You have no connected contractors yet. Open the Contractor Network to request a
              connection first.
            </p>
          )}

          {selectedConnection && (
            <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              Work will be linked to your connection with {selectedConnection ? connectionCounterparty(selectedConnection).label : "this contractor"} so both
              sides keep the history.
            </p>
          )}

          <Field label="Work title">
            <input
              required
              value={form.project_title}
              onChange={(event) => setForm({ ...form, project_title: event.target.value })}
              placeholder="Interior wall painting, second floor"
            />
          </Field>

          <Field label="Scope shared with the contractor">
            <textarea
              rows={3}
              value={form.agreed_scope_summary}
              onChange={(event) =>
                setForm({ ...form, agreed_scope_summary: event.target.value })
              }
              placeholder="What is included, what is excluded, who supplies what."
            />
          </Field>

          {form.quotation && (
            <fieldset className="rounded-xl border p-4">
              <legend className="px-2 text-sm font-semibold">Project scopes to share</legend>
              {scopeChoices.length === 0 ? (
                <p className="text-sm text-slate-500">
                  This project has no scopes yet, so nothing will be attached.
                </p>
              ) : (
                <div className="space-y-2">
                  {scopeChoices.map((scope) => (
                    <label key={scope.id} className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(scope.checked)}
                        onChange={(event) =>
                          setScopeChoices((current) =>
                            current.map((item) =>
                              item.id === scope.id
                                ? { ...item, checked: event.target.checked }
                                : item,
                            ),
                          )
                        }
                        className="mt-1"
                      />
                      <span>
                        <b>{scope.title}</b>
                        <span className="block text-xs text-slate-500">
                          {scope.work_description_name || scope.category_name} ·{" "}
                          {scope.quantity} {scope.unit_name} · {rupees(scope.amount)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Agreed amount (optional)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.agreed_amount}
                onChange={(event) => setForm({ ...form, agreed_amount: event.target.value })}
              />
            </Field>
            <Field label="Required from">
              <input
                type="date"
                value={form.required_start_date}
                onChange={(event) =>
                  setForm({ ...form, required_start_date: event.target.value })
                }
              />
            </Field>
            <Field label="Required by">
              <input
                type="date"
                value={form.required_end_date}
                onChange={(event) =>
                  setForm({ ...form, required_end_date: event.target.value })
                }
              />
            </Field>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            disabled={saving || !connections.length}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
          >
            <HardHat className="h-4 w-4" />
            {saving ? "Creating…" : "Create work order"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block font-semibold">{label}</span>
      {children}
    </label>
  );
}