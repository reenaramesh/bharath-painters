import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HardHat, Pencil, Plus, Trash2, X } from "lucide-react";
import api from "../api/client";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "./ui";
import { apiErrorMessage, prettyDate, rupees } from "../utils/subcontract";

const STATUSES = [
  ["PROPOSED", "Proposed"],
  ["CONFIRMED", "Confirmed"],
  ["IN_PROGRESS", "In progress"],
  ["COMPLETED", "Completed"],
  ["CANCELLED", "Cancelled"],
];

const emptyScope = {
  title: "",
  category: "",
  work_description: "",
  unit: "",
  quantity: "",
  unit_rate: "",
  status: "PROPOSED",
  handling: "INTERNAL",
  target_start_date: "",
  target_end_date: "",
  notes: "",
};

// One addressable service line per project. Scopes are what the outsourcing
// flow shares with another contractor, so this list stays on the quotation
// where the work is already defined.
export default function ProjectScopesPanel({ quotationId }) {
  const [scopes, setScopes] = useState([]);
  const [catalogue, setCatalogue] = useState([]);
  const [descriptions, setDescriptions] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyScope);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scopeCall, categoryCall, descriptionCall, unitCall] = await Promise.all([
        api.get("/quotations/project-scopes/", { params: { quotation: quotationId } }),
        api.get("/quotations/service-categories/"),
        api.get("/quotations/work-descriptions/"),
        api.get("/quotations/units/"),
      ]);
      setScopes(Array.isArray(scopeCall.data) ? scopeCall.data : scopeCall.data?.results || []);
      setCatalogue(categoryCall.data?.results || categoryCall.data || []);
      setDescriptions(descriptionCall.data?.results || descriptionCall.data || []);
      setUnits(unitCall.data?.results || unitCall.data || []);
      setError("");
    } catch (err) {
      setError(apiErrorMessage(err, "Project scopes could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [quotationId]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryById = useMemo(
    () => Object.fromEntries(catalogue.map((item) => [String(item.id), item])),
    [catalogue],
  );
  const unitById = useMemo(
    () => Object.fromEntries(units.map((item) => [String(item.id), item])),
    [units],
  );

  // Only units the chosen service actually offers are offered here, matching the
  // server-side rule that rejects anything else.
  const allowedUnits = useMemo(() => {
    const category = categoryById[form.category];
    if (!category) return units;
    const offered = (category.units || []).map(String);
    return offered.length ? units.filter((unit) => offered.includes(String(unit.id))) : units;
  }, [form.category, categoryById, units]);

  const descriptionChoices = useMemo(
    () =>
      descriptions.filter((row) => String(row.service_category || "") === String(form.category)),
    [descriptions, form.category],
  );

  const startAdd = () => {
    setEditing("new");
    setForm(emptyScope);
    setFormError("");
  };

  const startEdit = (scope) => {
    setEditing(scope.id);
    setForm({
      title: scope.title || "",
      category: scope.category ? String(scope.category) : "",
      work_description: scope.work_description ? String(scope.work_description) : "",
      unit: scope.unit ? String(scope.unit) : "",
      quantity: scope.quantity ?? "",
      unit_rate: scope.unit_rate ?? "",
      status: scope.status || "PROPOSED",
      handling: scope.handling || "INTERNAL",
      target_start_date: scope.target_start_date || "",
      target_end_date: scope.target_end_date || "",
      notes: scope.notes || "",
    });
    setFormError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    const payload = {
      title: form.title,
      category: form.category ? Number(form.category) : null,
      work_description: form.work_description ? Number(form.work_description) : null,
      unit: form.unit ? Number(form.unit) : null,
      quantity: form.quantity || "0",
      unit_rate: form.unit_rate || "0",
      status: form.status,
      handling: form.handling,
      target_start_date: form.target_start_date || null,
      target_end_date: form.target_end_date || null,
      notes: form.notes,
    };
    try {
      if (editing === "new") {
        await api.post("/quotations/project-scopes/", { ...payload, quotation: Number(quotationId) });
      } else {
        await api.patch(`/quotations/project-scopes/${editing}/`, payload);
      }
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(apiErrorMessage(err, "That scope could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (scope) => {
    setError("");
    try {
      await api.delete(`/quotations/project-scopes/${scope.id}/`);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "That scope could not be removed."));
    }
  };

  const total = scopes.reduce((sum, scope) => sum + Number(scope.amount || 0), 0);
  const outsourced = scopes.filter((scope) => scope.handling === "OUTSOURCED");

  return (
    <section className="quotation-scopes rounded-2xl border bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Project scopes</h2>
          
        </div>
        {editing ? (
          <button
            onClick={() => setEditing(null)}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
          >
            Close
          </button>
        ) : (
          <button
            onClick={startAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" /> Add scope
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={submit} className="mt-5 rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">
              {editing === "new" ? "New scope" : `Edit ${form.title || "scope"}`}
            </h3>
            <button type="button" onClick={() => setEditing(null)} aria-label="Close">
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          {formError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p>}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ScopeField label="Scope name" required>
              <input
                required
                maxLength={200}
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Terrace waterproofing"
              />
            </ScopeField>
            <ScopeField label="Type of service">
              <select
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value, work_description: "" })
                }
              >
                <option value="">Choose a service</option>
                {catalogue
                  .filter((item) => item.is_active !== false)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </ScopeField>
            <ScopeField label="Work description" hint="Must belong to the service above">
              <select
                value={form.work_description}
                onChange={(event) => setForm({ ...form, work_description: event.target.value })}
                disabled={!form.category}
              >
                <option value="">Optional</option>
                {descriptionChoices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </ScopeField>
            <ScopeField label="Unit">
              <select
                value={form.unit}
                onChange={(event) => setForm({ ...form, unit: event.target.value })}
              >
                <option value="">No unit</option>
                {allowedUnits.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </ScopeField>
            <ScopeField label="Quantity">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.quantity}
                onChange={(event) => setForm({ ...form, quantity: event.target.value })}
              />
            </ScopeField>
            <ScopeField label="Rate">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.unit_rate}
                onChange={(event) => setForm({ ...form, unit_rate: event.target.value })}
              />
            </ScopeField>
            <ScopeField label="Status">
              <select
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                {STATUSES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </ScopeField>
            <ScopeField label="Handling" hint="Outsourced scopes can be sent to a connected contractor">
              <select
                value={form.handling}
                onChange={(event) => setForm({ ...form, handling: event.target.value })}
              >
                <option value="INTERNAL">In-house</option>
                <option value="OUTSOURCED">Outsourced</option>
              </select>
            </ScopeField>
            <ScopeField label="Target start">
              <input
                type="date"
                value={form.target_start_date}
                onChange={(event) => setForm({ ...form, target_start_date: event.target.value })}
              />
            </ScopeField>
            <ScopeField label="Target end">
              <input
                type="date"
                value={form.target_end_date}
                onChange={(event) => setForm({ ...form, target_end_date: event.target.value })}
              />
            </ScopeField>
            <div className="sm:col-span-2">
              <ScopeField label="Notes">
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  placeholder="Access, materials, who supplies what"
                />
              </ScopeField>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Amount{" "}
              <b className="text-slate-900">
                {rupees(Number(form.quantity || 0) * Number(form.unit_rate || 0))}
              </b>
            </p>
            <button
              disabled={saving}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
            >
              {saving ? "Saving…" : "Save scope"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="mt-4">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {!error && loading && <LoadingState label="Loading project scopes…" />}

      {!error && !loading && (
        <>
          {scopes.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No scopes yet"
                description="Add a scope for each service on this project so you can track and outsource them separately."
              />
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {scopes.map((scope) => (
                <article key={scope.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-slate-500">{scope.reference}</p>
                      <h3 className="mt-1 font-bold">{scope.title}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {[scope.work_description_name, scope.category_name]
                          .filter(Boolean)
                          .join(" · ") || "No service set"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={scope.status} />
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          scope.handling === "OUTSOURCED"
                            ? "bg-violet-100 text-violet-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {scope.handling === "OUTSOURCED" ? "Outsourced" : "In-house"}
                      </span>
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-400">Quantity</dt>
                      <dd className="font-semibold">
                        {scope.quantity} {scope.unit_name || unitById[String(scope.unit)]?.name || ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-400">Rate</dt>
                      <dd className="font-semibold">{rupees(scope.unit_rate)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-400">Amount</dt>
                      <dd className="font-bold">{rupees(scope.amount)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-400">Target</dt>
                      <dd className="font-semibold">
                        {scope.target_start_date || scope.target_end_date
                          ? `${prettyDate(scope.target_start_date)} – ${prettyDate(scope.target_end_date)}`
                          : "—"}
                      </dd>
                    </div>
                  </dl>

                  {scope.notes && <p className="mt-3 text-sm text-slate-600">{scope.notes}</p>}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {scope.handling === "OUTSOURCED" && (
                      <Link
                        to={`/subcontract-work-orders?quotation=${quotationId}&scope=${scope.id}`}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white"
                      >
                        <HardHat className="h-4 w-4" /> Send to contractor
                      </Link>
                    )}
                    {scope.shared_work_orders?.length > 0 && (
                      <span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                        Shared on {scope.shared_work_orders.length} work order
                        {scope.shared_work_orders.length > 1 ? "s" : ""}
                      </span>
                    )}
                    <span className="flex-1" />
                    <button
                      onClick={() => startEdit(scope)}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => remove(scope)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                </article>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 text-sm">
                <p className="text-slate-600">
                  {scopes.length} scope{scopes.length > 1 ? "s" : ""} · {outsourced.length} outsourced
                </p>
                <p className="text-lg font-bold">{rupees(total)}</p>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ScopeField({ label, required, children }) {
  return (
    <label className="block">
      <span className="mb-2 block font-semibold">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      
    </label>
  );
}