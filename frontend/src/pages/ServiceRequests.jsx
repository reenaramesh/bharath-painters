import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  MapPin,
  Phone,
  Plus,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "../components/ui";
import "./communication-pages.css";

const statuses = [
  "NEW",
  "REVIEWING",
  "SITE_VISIT",
  "QUOTATION",
  "ACCEPTED",
  "COMPLETED",
  "CANCELLED",
];
const empty = {
  customer: "",
  service_type: "",
  title: "",
  description: "",
  preferred_date: "",
  address: "",
};

export default function ServiceRequests() {
  const { user } = useAuth();
  const isCustomer = user?.role === "CUSTOMER";
  const [requests, setRequests] = useState([]);
  const [options, setOptions] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    follow_up_type: "CALL",
    next_follow_up: "",
    comment: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const calls = [
        api.get("/quotations/service-requests/", {
          params: { search: search || undefined, status: status || undefined },
        }),
      ];
      if (isCustomer) calls.push(api.get("/quotations/service-requests/options/"));
      const [requestResponse, optionResponse] = await Promise.all(calls);
      setRequests(requestResponse.data);
      if (optionResponse) setOptions(optionResponse.data);
      setError("");
      setLoadFailed(false);
      window.dispatchEvent(new Event("portal-counts-changed"));
    } catch {
      setError("Service requests could not be loaded.");
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [isCustomer, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedContractor = useMemo(
    () => options.find((item) => String(item.customer) === String(form.customer)),
    [form.customer, options],
  );

  function chooseContractor(value) {
    const option = options.find((item) => String(item.customer) === value);
    setForm({ ...empty, customer: value, address: option?.default_address || "" });
  }

  async function createRequest(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/quotations/service-requests/", form);
      setRequests((current) => [data, ...current]);
      setShowForm(false);
      setForm(empty);
      setError("");
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {}).flat().join(" ") ||
          "Service request could not be submitted.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(item, value) {
    try {
      const { data } = await api.patch(`/quotations/service-requests/${item.id}/`, {
        status: value,
      });
      setRequests((current) =>
        current.map((request) => (request.id === data.id ? data : request)),
      );
    } catch {
      setError("Request status could not be updated.");
    }
  }

  async function addAsLead(item) {
    if (item.lead_id) window.location.assign("/leads");
    else setError("This request is still being synchronized with the Leads module.");
  }

  function openSchedule(item) {
    setSchedule(item);
    setScheduleForm({
      follow_up_type: "CALL",
      next_follow_up: "",
      comment: `Follow up for: ${item.title}`,
    });
  }

  async function saveSchedule(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const requestStatus =
        scheduleForm.follow_up_type === "SITE_VISIT" ? "SITE_VISIT" : "REVIEWING";
      await Promise.all([
        api.post(`/quotations/customers/${schedule.customer}/follow-ups/`, {
          ...scheduleForm,
          next_follow_up: scheduleForm.next_follow_up || null,
        }),
        api.patch(`/quotations/service-requests/${schedule.id}/`, {
          status: requestStatus,
        }),
      ]);
      setRequests((current) =>
        current.map((request) =>
          request.id === schedule.id ? { ...request, status: requestStatus } : request,
        ),
      );
      setSchedule(null);
      setError("");
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {}).flat().join(" ") ||
          "The follow-up could not be scheduled.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`space-y-6 communication-page service-requests-page ${isCustomer ? "customer-service-requests-page" : ""}`}>
      <PageHeader
        eyebrow="Painting services"
        title="Service requests"
        description={
          isCustomer
            ? "Request a new painting service and track its progress."
            : "Review and manage requests raised by your customers."
        }
        actions={
          isCustomer && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New request
            </Button>
          )
        }
      />

      {error && !loadFailed && (
        <p className="communication-alert" role="alert">
          {error}
        </p>
      )}

      {isCustomer && (
        <section className="customer-service-pulse" aria-label="Service request summary">
          <div className="is-action"><span>Needs attention</span><strong>{requests.filter((item) => ["NEW", "REVIEWING", "SITE_VISIT", "QUOTATION"].includes(item.status)).length}</strong><small>Requests still moving forward</small></div>
          <div><span>Active requests</span><strong>{requests.filter((item) => !["COMPLETED", "CANCELLED"].includes(item.status)).length}</strong><small>Being handled by contractors</small></div>
          <div className="is-complete"><span>Completed</span><strong>{requests.filter((item) => item.status === "COMPLETED").length}</strong><small>Finished service requests</small></div>
        </section>
      )}

      <SectionCard
        title="Service requests"
        description={
          loading
            ? "Loading current requests…"
            : `${requests.length} ${requests.length === 1 ? "request" : "requests"}`
        }
        className="service-request-list"
        bodyClassName="p-0"
      >
        <div className="service-request-filters flex flex-col gap-3 border-b p-4 sm:flex-row">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-50 px-4">
            <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="sr-only">Search customer, mobile, or service</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer, mobile or service"
              className="w-full min-w-0 bg-transparent text-sm outline-none"
            />
          </label>
          <label className="sr-only" htmlFor="service-request-status-filter">
            Filter by request status
          </label>
          <select
            id="service-request-status-filter"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border px-4 text-sm"
          >
            <option value="">All statuses</option>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {labelStatus(item)}
              </option>
            ))}
          </select>
        </div>

        {loadFailed ? (
          <ErrorState
            message={error}
            onRetry={load}
            className="communication-state"
          />
        ) : loading ? (
          <LoadingState label="Loading service requests…" className="communication-state" />
        ) : requests.length ? (
          <div className="service-request-records divide-y">
            {requests.map((item) => (
              <article key={item.id} className="service-request-record">
                <div className="service-request-icon" aria-hidden="true">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div className="service-request-main">
                  <div className="service-request-heading">
                    <div className="min-w-0">
                      <p className="service-request-type">
                        {item.service_name || "Painting service"}
                      </p>
                      <h2>{item.title}</h2>
                    </div>
                    <StatusBadge
                      status={item.status}
                      label={labelStatus(item.status)}
                      tone={requestTone(item.status)}
                    />
                  </div>

                  <p className="service-request-person">
                    {isCustomer
                      ? `Contractor · ${item.contractor_name || "Contractor"}`
                      : `Customer · ${item.customer_name || "Customer"}${item.customer_mobile ? ` · ${item.customer_mobile}` : ""}`}
                  </p>
                  {item.description && (
                    <p className="service-request-description">{item.description}</p>
                  )}
                  <div className="service-request-context">
                    {item.preferred_date && (
                      <span>
                        <CalendarDays aria-hidden="true" />
                        Preferred date · {formatRequestDate(item.preferred_date)}
                      </span>
                    )}
                    {item.address && (
                      <span>
                        <MapPin aria-hidden="true" />
                        {item.address}
                      </span>
                    )}
                  </div>

                  {!isCustomer && (
                    <div className="service-request-actions">
                      {item.customer_mobile && (
                        <a href={`tel:${item.customer_mobile}`} className="communication-action">
                          <Phone aria-hidden="true" />
                          Call customer
                        </a>
                      )}
                      <Button variant="secondary" onClick={() => addAsLead(item)} disabled={saving}>
                        <UserPlus aria-hidden="true" />
                        Add as lead
                      </Button>
                      <Button variant="secondary" onClick={() => openSchedule(item)}>
                        <CalendarPlus aria-hidden="true" />
                        Schedule follow-up
                      </Button>
                    </div>
                  )}
                </div>

                {isCustomer ? (
                  item.status !== "COMPLETED" &&
                  item.status !== "CANCELLED" && (
                    <Button
                      variant="danger"
                      className="service-request-cancel"
                      onClick={() => updateStatus(item, "CANCELLED")}
                    >
                      Cancel request
                    </Button>
                  )
                ) : (
                  <label className="service-request-status-control">
                    <span>Status</span>
                    <select
                      value={item.status}
                      onChange={(event) => updateStatus(item, event.target.value)}
                    >
                      {statuses.map((value) => (
                        <option key={value} value={value}>
                          {labelStatus(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No service requests found"
            description={
              isCustomer
                ? "Your requests will appear here after you submit one."
                : "Requests from your customers will appear here."
            }
            className="communication-state"
          />
        )}
      </SectionCard>

      {showForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-3 sm:p-4">
          <form
            onSubmit={createRequest}
            className="communication-dialog max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="bp-eyebrow">Customer request</p>
                <h2 className="mt-1 text-xl font-bold">New service request</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Tell your contractor what work you need.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="communication-icon-action"
                aria-label="Close new service request"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            {error && !loadFailed && (
              <p className="communication-alert mt-4" role="alert">
                {error}
              </p>
            )}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Contractor">
                <select
                  required
                  value={form.customer}
                  onChange={(event) => chooseContractor(event.target.value)}
                  className={input}
                >
                  <option value="">Select contractor</option>
                  {options.map((item) => (
                    <option key={item.customer} value={item.customer}>
                      {item.contractor_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Service">
                <select
                  value={form.service_type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      service_type: event.target.value,
                      title:
                        selectedContractor?.services.find(
                          (service) => String(service.id) === event.target.value,
                        )?.name || form.title,
                    })
                  }
                  className={input}
                >
                  <option value="">Other service</option>
                  {selectedContractor?.services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Request title">
                <input
                  required
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  className={input}
                />
              </Field>
              <Field label="Preferred date">
                <input
                  type="date"
                  value={form.preferred_date}
                  onChange={(event) =>
                    setForm({ ...form, preferred_date: event.target.value })
                  }
                  className={input}
                />
              </Field>
              <Field label="Work address" wide>
                <textarea
                  rows="2"
                  value={form.address}
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                  className={input}
                />
              </Field>
              <Field label="Describe the work" wide>
                <textarea
                  rows="4"
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  className={input}
                />
              </Field>
            </div>
            <Button type="submit" loading={saving} className="mt-6 w-full">
              {saving ? "Submitting…" : "Submit request"}
            </Button>
          </form>
        </div>
      )}

      {schedule && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-3 sm:p-4">
          <form
            onSubmit={saveSchedule}
            className="communication-dialog max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="bp-eyebrow">Request follow-up</p>
                <h2 className="mt-1 text-xl font-bold">Schedule customer follow-up</h2>
                <p className="mt-1 break-words text-sm text-slate-600">
                  {schedule.customer_name} · {schedule.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSchedule(null)}
                className="communication-icon-action"
                aria-label="Close follow-up form"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            {error && !loadFailed && (
              <p className="communication-alert mt-4" role="alert">
                {error}
              </p>
            )}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Activity">
                <select
                  value={scheduleForm.follow_up_type}
                  onChange={(event) =>
                    setScheduleForm({
                      ...scheduleForm,
                      follow_up_type: event.target.value,
                    })
                  }
                  className={input}
                >
                  <option value="CALL">Callback</option>
                  <option value="SITE_VISIT">Site visit</option>
                  <option value="MEETING">Meeting</option>
                  <option value="WHATSAPP">WhatsApp</option>
                </select>
              </Field>
              <Field label="Date and time">
                <input
                  required
                  type="datetime-local"
                  value={scheduleForm.next_follow_up}
                  onChange={(event) =>
                    setScheduleForm({
                      ...scheduleForm,
                      next_follow_up: event.target.value,
                    })
                  }
                  className={input}
                />
              </Field>
              <Field label="Task note" wide>
                <textarea
                  rows="3"
                  required
                  value={scheduleForm.comment}
                  onChange={(event) =>
                    setScheduleForm({ ...scheduleForm, comment: event.target.value })
                  }
                  className={input}
                />
              </Field>
            </div>
            <Button type="submit" loading={saving} className="mt-6 w-full">
              {saving ? "Scheduling…" : "Create scheduled task"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

function labelStatus(value) {
  return String(value || "Unknown")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function requestTone(value) {
  if (["ACCEPTED", "COMPLETED"].includes(value)) return "success";
  if (value === "CANCELLED") return "danger";
  if (["REVIEWING", "SITE_VISIT"].includes(value)) return "warning";
  if (["NEW", "QUOTATION"].includes(value)) return "info";
  return "neutral";
}

function formatRequestDate(value) {
  if (!value) return "Date not set";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

const input =
  "mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-slate-900";

function Field({ label, wide, children }) {
  return (
    <label
      className={`text-sm font-semibold text-slate-700 ${wide ? "sm:col-span-2" : ""}`}
    >
      {label}
      {children}
    </label>
  );
}
