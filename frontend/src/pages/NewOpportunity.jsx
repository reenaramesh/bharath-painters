import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Plus, UserRound } from "lucide-react";
import api from "../api/client";
import BackButton from "../components/BackButton";
import {
  SOURCE_OPTIONS,
  PRIORITY_OPTIONS,
  CLIENT_TYPE_OPTIONS,
} from "../utils/opportunityOptions";

export default function NewOpportunity() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [matches, setMatches] = useState([]);
  const [client, setClient] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [clientForm, setClientForm] = useState({
    name: "",
    mobile: "",
    alternate_mobile: "",
    email: "",
    client_type: "",
    address: "",
    notes: "",
  });
  const [serviceTypes, setServiceTypes] = useState([]);
  const [properties, setProperties] = useState([]);
  const [savingClient, setSavingClient] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    service_type: "",
    property: "",
    source: "PHONE",
    priority: "MEDIUM",
    estimated_value: "",
    expected_start_date: "",
    site_visit_required: false,
    next_follow_up: "",
    notes: "",
  });

  const input =
    "mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900";

  // Load master data once
  useEffect(() => {
    api
      .get("/quotations/service-types/")
      .then(({ data }) => setServiceTypes(data.results || data))
      .catch(() => {});
  }, []);

  // Load the selected client's properties
  useEffect(() => {
    if (!client) {
      setProperties([]);
      return;
    }
    api
      .get(`/quotations/properties/?customer=${client.id}`)
      .then(({ data }) => setProperties(data.results || data))
      .catch(() => setProperties([]));
  }, [client]);

  const normalizedMobile = useMemo(
    () => String(clientForm.mobile).replace(/\D/g, "").slice(-10),
    [clientForm.mobile],
  );

  async function searchClients(event) {
    event?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError("");
    try {
      const { data } = await api.get(
        `/quotations/clients/search/?query=${encodeURIComponent(query.trim())}`,
      );
      setMatches(data.results || data);
      setSearched(true);
    } catch {
      setError("Client search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  async function createClient(event) {
    event.preventDefault();
    if (!clientForm.name.trim() || normalizedMobile.length !== 10) {
      setError("Client name and a valid 10-digit mobile number are required.");
      return;
    }
    setSavingClient(true);
    setError("");
    try {
      // Duplicate check with the exact digits before creating
      const { data: duplicates } = await api.get(
        `/quotations/clients/search/?query=${normalizedMobile}`,
      );
      const exact = (duplicates.results || duplicates).find(
        (item) =>
          String(item.mobile).replace(/\D/g, "").slice(-10) ===
          normalizedMobile,
      );
      if (
        exact &&
        !window.confirm(
          `A client with this mobile number already exists: ${exact.name} (${exact.bharath_id}).\n\nOK to select the existing client, Cancel to go back.`,
        )
      ) {
        setSavingClient(false);
        return;
      }
      if (exact) {
        selectClient(exact);
        setShowCreate(false);
        return;
      }
      const { data } = await api.post("/quotations/customers/", {
        ...clientForm,
        mobile: normalizedMobile,
      });
      setClient(data);
      setShowCreate(false);
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Client could not be created.",
      );
    } finally {
      setSavingClient(false);
    }
  }

  async function createOpportunity(event) {
    event.preventDefault();
    if (!client) {
      setError("Search and select a client first.");
      return;
    }
    if (!form.title.trim()) {
      setError("Enter the requirement title.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        customer: client.id,
        estimated_value: form.estimated_value || null,
        next_follow_up: form.next_follow_up || null,
        expected_start_date: form.expected_start_date || null,
        property: form.property || null,
        service_type: form.service_type || null,
      };
      const { data } = await api.post("/quotations/leads/", payload);
      navigate(`/opportunities/${data.id}`);
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Opportunity could not be saved.",
      );
      setSaving(false);
    }
  }

  function selectClient(item) {
    setClient(item);
    setQuery(`${item.name} · ${item.mobile}`);
    setSearched(false);
    setMatches([]);
  }

  return (
    <div className="space-y-6">
      <BackButton fallback="/opportunities" label="Back to opportunities" />
      <header>
        <p className="text-sm font-semibold text-amber-600">Sales</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          New Opportunity
        </h1>
        <p className="mt-2 text-slate-500">
          First identify the client, then describe what they need.
        </p>
      </header>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* STEP 1 — CLIENT */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-bold text-slate-900">
          1. Client{" "}
          <span className="text-sm font-normal text-slate-400">
            (search by mobile number)
          </span>
        </h2>
        {!client ? (
          <>
            <form
              onSubmit={searchClients}
              className="mt-4 flex flex-wrap gap-2"
            >
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Mobile number, name or email"
                className="min-w-[240px] flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
              />
              <button
                disabled={searching}
                className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </form>
            {searched && (
              <div className="mt-4">
                {matches.length ? (
                  <div className="space-y-2">
                    {matches.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => selectClient(item)}
                        className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-slate-900"
                      >
                        <div>
                          <p className="font-bold text-slate-900">
                            {item.name}
                          </p>
                          <p className="text-sm text-slate-500">
                            {item.mobile} · {item.bharath_id}
                          </p>
                        </div>
                        <div className="text-xs text-slate-500">
                          Properties: {item.properties} · Open opportunities:{" "}
                          {item.open_opportunities} · Jobs:{" "}
                          {item.completed_jobs}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                    No existing client found.
                  </div>
                )}
                <button
                  onClick={() => {
                    setClientForm((current) => ({
                      ...current,
                      mobile: /\d{6,}/.test(query)
                        ? query.replace(/\D/g, "").slice(-10)
                        : "",
                    }));
                    setShowCreate(true);
                  }}
                  className="mt-3 flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:border-slate-900"
                >
                  <Plus className="h-4 w-4" />
                  Create New Client
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-white">
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <p className="font-bold text-slate-900">
                  {client.name}{" "}
                  <span className="text-xs font-semibold text-emerald-700">
                    {client.bharath_id}
                  </span>
                </p>
                <p className="text-sm text-slate-600">{client.mobile}</p>
              </div>
            </div>
            <button
              onClick={() => {
                setClient(null);
                setQuery("");
              }}
              className="text-sm font-semibold text-slate-500 underline hover:text-slate-900"
            >
              Change client
            </button>
          </div>
        )}
      </section>

      {/* Quick client create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form
            onSubmit={createClient}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6"
          >
            <h2 className="text-xl font-bold">Quick create client</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Name *
                <input
                  required
                  value={clientForm.name}
                  onChange={(event) =>
                    setClientForm({ ...clientForm, name: event.target.value })
                  }
                  className={input}
                />
              </label>
              <label className="text-sm font-semibold">
                Mobile number *
                <input
                  required
                  inputMode="numeric"
                  value={clientForm.mobile}
                  onChange={(event) =>
                    setClientForm({ ...clientForm, mobile: event.target.value })
                  }
                  className={input}
                />
              </label>
              <label className="text-sm font-semibold">
                Alternate mobile
                <input
                  value={clientForm.alternate_mobile}
                  onChange={(event) =>
                    setClientForm({
                      ...clientForm,
                      alternate_mobile: event.target.value,
                    })
                  }
                  className={input}
                />
              </label>
              <label className="text-sm font-semibold">
                Email
                <input
                  type="email"
                  value={clientForm.email}
                  onChange={(event) =>
                    setClientForm({ ...clientForm, email: event.target.value })
                  }
                  className={input}
                />
              </label>
              <label className="text-sm font-semibold">
                Client type
                <select
                  value={clientForm.client_type}
                  onChange={(event) =>
                    setClientForm({
                      ...clientForm,
                      client_type: event.target.value,
                    })
                  }
                  className={input}
                >
                  <option value="">Select type</option>
                  {CLIENT_TYPE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold sm:col-span-2">
                Address
                <textarea
                  rows="2"
                  value={clientForm.address}
                  onChange={(event) =>
                    setClientForm({
                      ...clientForm,
                      address: event.target.value,
                    })
                  }
                  className={`mt-2 w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900`}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={savingClient}
                className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {savingClient ? "Saving..." : "Save client"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 2 — OPPORTUNITY */}
      {client && (
        <form onSubmit={createOpportunity} className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="font-bold text-slate-900">2. Opportunity details</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold sm:col-span-2">
                Requirement title *
                <input
                  required
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  placeholder="e.g. 2BHK interior painting"
                  className={input}
                />
              </label>
              <label className="text-sm font-semibold">
                Service
                <select
                  value={form.service_type}
                  onChange={(event) =>
                    setForm({ ...form, service_type: event.target.value })
                  }
                  className={input}
                >
                  <option value="">Select service</option>
                  {serviceTypes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Property
                <select
                  value={form.property}
                  onChange={(event) =>
                    setForm({ ...form, property: event.target.value })
                  }
                  className={input}
                >
                  <option value="">No property selected</option>
                  {properties.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || item.property_type}
                      {item.city ? ` · ${item.city}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Lead source
                <select
                  value={form.source}
                  onChange={(event) =>
                    setForm({ ...form, source: event.target.value })
                  }
                  className={input}
                >
                  {SOURCE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Priority
                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm({ ...form, priority: event.target.value })
                  }
                  className={input}
                >
                  {PRIORITY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Estimated value (₹)
                <input
                  type="number"
                  min="0"
                  value={form.estimated_value}
                  onChange={(event) =>
                    setForm({ ...form, estimated_value: event.target.value })
                  }
                  className={input}
                />
              </label>
              <label className="text-sm font-semibold">
                Expected start date
                <input
                  type="date"
                  value={form.expected_start_date}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      expected_start_date: event.target.value,
                    })
                  }
                  className={input}
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.site_visit_required}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      site_visit_required: event.target.checked,
                    })
                  }
                  className="h-4 w-4"
                />
                Site visit required
              </label>
              <label className="text-sm font-semibold">
                Next follow-up
                <input
                  type="datetime-local"
                  value={form.next_follow_up}
                  onChange={(event) =>
                    setForm({ ...form, next_follow_up: event.target.value })
                  }
                  className={input}
                />
              </label>
              <label className="text-sm font-semibold sm:col-span-2">
                Requirement description
                <textarea
                  rows="3"
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="text-sm font-semibold sm:col-span-2">
                Internal notes
                <textarea
                  rows="2"
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end border-t pt-4">
              <button
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {saving ? "Creating..." : "Create Opportunity"}
              </button>
            </div>
          </section>
        </form>
      )}
    </div>
  );
}
