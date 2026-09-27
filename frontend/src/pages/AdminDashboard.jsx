/* eslint-disable no-unused-vars -- WorkingTable is retained for the planned detailed active-work view. */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  BriefcaseBusiness,
  Copy,
  Download,
  FileText,
  MessageCircle,
  Paintbrush,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import api from "../api/client";
import MobileDashboardShortcuts from "../components/MobileDashboardShortcuts";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
} from "../components/ui";

const sections = [
  { key: "contractors", label: "Contractors", icon: BriefcaseBusiness },
  { key: "applicators", label: "Paint Applicators", icon: Paintbrush },
  { key: "customers", label: "Customers", icon: Users },
  { key: "messages", label: "Conversations", icon: MessageCircle },
  { key: "quotations", label: "Quotations", icon: FileText },
];
const columns = {
  contractors: [
    ["company", "Company"],
    ["name", "Owner"],
    ["mobile", "Mobile"],
    ["bharath_id", "Bharath ID"],
    ["working_today", "Today"],
    ["current_work", "Current project / customer"],
    ["work_dates", "Work dates"],
    ["service_areas", "Service areas"],
    ["team_size", "Team"],
  ],
  applicators: [
    ["name", "Name"],
    ["mobile", "Mobile"],
    ["bharath_id", "Bharath ID"],
    ["working_today", "Today"],
    ["current_work", "Current project / customer"],
    ["work_dates", "Work dates"],
    ["experience_years", "Experience"],
    ["skills", "Skills"],
    ["locations", "Locations"],
    ["teams", "Teams"],
  ],
  customers: [
    ["bharath_id", "Customer ID"],
    ["name", "Customer"],
    ["mobile", "Mobile"],
    ["email", "Email"],
    ["city", "City"],
    ["status", "Status"],
    ["source", "Source"],
    ["contractor", "Contractor"],
    ["portal_enabled", "Portal"],
  ],
  messages: [
    ["created_at", "Date/time"],
    ["contractor", "Contractor"],
    ["customer_bharath_id", "Customer ID"],
    ["customer", "Customer"],
    ["sender", "Sender"],
    ["sender_role", "Role"],
    ["text", "Message"],
    ["read", "Read"],
  ],
  quotations: [
    ["number", "Quotation"],
    ["quotation_date", "Date"],
    ["contractor", "Contractor"],
    ["customer_bharath_id", "Customer ID"],
    ["customer", "Customer"],
    ["property", "Property"],
    ["status", "Status"],
    ["items", "Lines"],
    ["grand_total", "Total"],
  ],
};

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [section, setSection] = useState("contractors");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState({ key: "created_at", direction: "desc" });
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const load = useCallback(async () => {
    try {
      const { data: response } = await api.get("/quotations/admin-dashboard/");
      const sections = [
        "contractors",
        "applicators",
        "customers",
        "messages",
        "quotations",
      ];
      if (
        !response?.counts ||
        sections.some((key) => !Array.isArray(response[key]))
      ) {
        throw new Error("The backend returned an unexpected admin dashboard response.");
      }
      setData(response);
      setError("");
    } catch (requestError) {
      const statusCode = requestError.response?.status;
      const detail = requestError.response?.data?.detail;
      const message = requestError.message || "";
      setError(
        detail ||
          (message.includes("unexpected admin dashboard response")
            ? message
            : statusCode === 401
              ? "Your admin session has expired. Sign in again."
              : statusCode === 403
                ? "The current account does not have administrator access."
              : statusCode === 404
                  ? "The admin dashboard API route was not found on the backend."
                  : statusCode >= 500
                    ? `The backend failed to load the admin dashboard (HTTP ${statusCode}).`
                    : !requestError.response
                      ? "The backend could not be reached. Check the API URL and backend status."
                      : `Admin dashboard could not be loaded (HTTP ${statusCode}).`),
      );
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setFilter("ALL");
    setSort({
      key: section === "messages" ? "created_at" : columns[section][0][0],
      direction: section === "messages" ? "desc" : "asc",
    });
  }, [section]);
  const rows = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    const statusKey =
      section === "contractors" || section === "applicators"
        ? "verification_status"
        : section === "messages"
          ? "sender_role"
          : "status";
    return [...data[section]]
      .filter(
        (row) =>
          (!term ||
            Object.values(row).some((value) =>
              String(value ?? "")
                .toLowerCase()
                .includes(term),
            )) &&
          (filter === "ALL" || String(row[statusKey]) === filter),
      )
      .sort((a, b) => {
        const first = sortable(a[sort.key]);
        const second = sortable(b[sort.key]);
        return (
          (first > second ? 1 : first < second ? -1 : 0) *
          (sort.direction === "asc" ? 1 : -1)
        );
      });
  }, [data, filter, search, section, sort]);
  const filterOptions = useMemo(() => {
    if (!data) return [];
    const key =
      section === "contractors" || section === "applicators"
        ? "verification_status"
        : section === "messages"
          ? "sender_role"
          : "status";
    return [
      ...new Set(data[section].map((row) => row[key]).filter(Boolean)),
    ].sort();
  }, [data, section]);
  const editable = ["contractors", "applicators", "customers"].includes(
    section,
  );
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [section, search, filter, pageSize]);
  async function saveRecord(form) {
    setSaving(true);
    setError("");
    try {
      const response = editing?.id
        ? await api.patch(
            `/quotations/admin-dashboard/${section}/${editing.id}/`,
            form,
          )
        : await api.post(`/quotations/admin-dashboard/${section}/`, form);
      if (response.data.credentials) setCredentials(response.data.credentials);
      setEditing(null);
      await load();
    } catch (err) {
      const details = err.response?.data || {};
      const message =
        Object.entries(details)
          .map(
            ([field, value]) =>
              `${field === "detail" ? "" : `${field}: `}${Array.isArray(value) ? value.join(" ") : value}`,
          )
          .join(" ") || "Record could not be saved.";
      setError(message);
      window.alert(message);
    } finally {
      setSaving(false);
    }
  }
  async function deleteAccess(row) {
    if (
      !confirm(
        `Delete access for ${row.name || row.company}?\n\nThe account will no longer be able to sign in. Quotations, invoices, projects, payments and audit history will be preserved.`,
      )
    )
      return;
    setSaving(true);
    try {
      await api.delete(`/quotations/admin-dashboard/${section}/${row.id}/`);
      await load();
    } catch (err) {
      setError(
        Object.values(err.response?.data || {})
          .flat()
          .join(" ") || "Record could not be deactivated.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function exportAll() {
    try {
      const response = await api.get("/quotations/admin-dashboard/export/", {
        responseType: "blob",
      });
      downloadBlob(
        response.data,
        `bharath-painters-people-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch {
      setError("Excel export could not be downloaded.");
    }
  }
  function exportCurrentCsv() {
    const selected = columns[section];
    const content = [
      selected.map(([, label]) => csv(label)).join(","),
      ...rows.map((row) => selected.map(([key]) => csv(row[key])).join(",")),
    ].join("\r\n");
    downloadBlob(
      new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" }),
      `${section}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }
  if (!data)
    return error ? (
      <ErrorState message={error} onRetry={load} />
    ) : (
      <LoadingState label="Loading administration data..." />
    );
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Operations dashboard"
        description="Monitor people, live work, communication and quotation activity from one workspace."
        actions={
          <>
            <button
              onClick={exportAll}
              className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-semibold"
            >
              <Download className="h-4 w-4" />
              Export all people
            </button>
            {editable && (
              <button
                onClick={() => setEditing({})}
                className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                Add{" "}
                {section === "applicators"
                  ? "Paint Applicator"
                  : section.slice(0, -1)}
              </button>
            )}
            <button
              onClick={load}
              className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-semibold"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh data
            </button>
          </>
        }
      />
      <MobileDashboardShortcuts />
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}
      <ActiveTodayCounts
        contractors={
          data.contractors.filter((item) => item.working_today).length
        }
        applicators={
          data.applicators.filter((item) => item.working_today).length
        }
        openSection={setSection}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {sections.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`rounded-2xl text-left transition ${section === key ? "ring-2 ring-indigo-500 ring-offset-2" : ""}`}
          >
            <StatCard
              icon={icon}
              label={label}
              value={data.counts[key]}
              tone={section === key ? "brand" : "info"}
            />
          </button>
        ))}
      </div>
      <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row">
          <label className="flex flex-1 items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${sections.find((item) => item.key === section).label.toLowerCase()}...`}
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-xl border px-4 py-3 text-sm"
          >
            <option value="ALL">All statuses / roles</option>
            {filterOptions.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <button
            onClick={exportCurrentCsv}
            className="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold"
          >
            <Download className="h-4 w-4" />
            Export current CSV
          </button>
        </div>
        <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-3">
          <p className="text-sm font-semibold">{rows.length} records</p>
          <p className="text-xs text-slate-400">
            Click a column heading to sort
          </p>
        </div>
        <DataTable
          section={section}
          rows={pagedRows}
          sort={sort}
          setSort={setSort}
          editable={editable}
          onEdit={setEditing}
          onDelete={deleteAccess}
          saving={saving}
        />
        <div className="flex flex-col gap-3 border-t bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Showing {rows.length ? (page - 1) * pageSize + 1 : 0}–
            {Math.min(page * pageSize, rows.length)} of {rows.length}
          </p>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border bg-white px-2 py-2 text-xs"
            >
              {[25, 50, 75, 100].map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
            <button
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
              className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs font-semibold">
              {page} / {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
      {editing && (
        <RecordModal
          section={section}
          record={editing}
          contractors={data.contractors}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={saveRecord}
        />
      )}
      {credentials && (
        <CredentialModal
          credentials={credentials}
          onClose={() => setCredentials(null)}
        />
      )}
    </div>
  );
}

function ActiveTodayCounts({ contractors, applicators, openSection }) {
  const cards = [
    {
      key: "contractors",
      label: "Contractors working today",
      value: contractors,
      icon: BriefcaseBusiness,
    },
    {
      key: "applicators",
      label: "Paint Applicators working today",
      value: applicators,
      icon: Paintbrush,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-4">
      {cards.map(({ key, label, value, icon: Icon }) => (
        <button
          key={key}
          onClick={() => openSection(key)}
          className="flex items-center gap-2 rounded-xl border bg-white p-3 text-left transition hover:border-emerald-300 hover:shadow-sm sm:gap-4 sm:rounded-2xl sm:p-5"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 sm:h-12 sm:w-12 sm:rounded-xl">
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <div>
            <p className="text-[10px] text-slate-500 sm:text-sm">{label}</p>
            <p className="mt-0.5 text-2xl font-bold sm:mt-1 sm:text-3xl">
              {value}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
function WorkingTable({ title, icon: Icon, rows, type, open }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-white">
      <header className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-bold">{title}</h2>
            <p className="text-xs text-slate-500">{rows.length} active today</p>
          </div>
        </div>
        <button onClick={open} className="text-sm font-semibold">
          View all
        </button>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">
                {type === "contractors" ? "Company / contractor" : "Applicator"}
              </th>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Project / customer</th>
              <th className="px-4 py-3">Work dates</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">
                      {type === "contractors" ? row.company : row.name}
                    </p>
                    {type === "contractors" && (
                      <p className="text-xs text-slate-500">{row.name}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.bharath_id || "—"}
                  </td>
                  <td className="px-4 py-3">{row.current_work || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.work_dates || "—"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="p-8 text-center text-slate-400">
                  Nobody is scheduled to work today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DataTable({
  section,
  rows,
  sort,
  setSort,
  editable,
  onEdit,
  onDelete,
  saving,
}) {
  function choose(key) {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="sticky top-0 bg-white">
          <tr>
            {columns[section].map(([key, label]) => (
              <th key={key} className="border-b px-4 py-3">
                <button
                  onClick={() => choose(key)}
                  className="flex items-center gap-1 font-bold"
                >
                  {label}
                  <ArrowDownUp
                    className={`h-3.5 w-3.5 ${sort.key === key ? "text-slate-950" : "text-slate-300"}`}
                  />
                </button>
              </th>
            ))}
            {editable && <th className="border-b px-4 py-3">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id} className="border-b hover:bg-slate-50">
                {columns[section].map(([key]) => (
                  <td
                    key={key}
                    className={`max-w-xs px-4 py-3 ${key === "text" || key === "skills" || key === "service_areas" ? "whitespace-normal" : "whitespace-nowrap"}`}
                  >
                    {display(key, row[key])}
                  </td>
                ))}
                {editable && (
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      onClick={() => onEdit(row)}
                      className="mr-2 rounded-lg border p-2"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      disabled={saving}
                      onClick={() => onDelete(row)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 font-semibold text-red-600 hover:bg-red-50"
                      title="Delete account access"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns[section].length + (editable ? 1 : 0)}
                className="p-12 text-center text-slate-400"
              >
                No matching records.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function display(key, value) {
  if (key === "grand_total")
    return `₹${Number(value || 0).toLocaleString("en-IN")}`;
  if (key === "created_at" || key === "updated_at")
    return value ? new Date(value).toLocaleString() : "—";
  if (key === "quotation_date")
    return value ? new Date(`${value}T00:00:00`).toLocaleDateString() : "—";
  if (key === "working_today")
    return (
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-bold ${value ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
      >
        {value ? "WORKING" : "NOT WORKING"}
      </span>
    );
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (
    ["status", "verification_status", "availability", "sender_role"].includes(
      key,
    )
  )
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">
        {String(value || "—").replaceAll("_", " ")}
      </span>
    );
  return value || "—";
}
function sortable(value) {
  if (value == null) return "";
  if (!Number.isNaN(Number(value)) && value !== "") return Number(value);
  return String(value).toLowerCase();
}

function RecordModal({
  section,
  record,
  contractors,
  saving,
  onClose,
  onSave,
}) {
  const blank =
    section === "contractors"
      ? {
          name: "",
          company: "",
          mobile: "",
          email: "",
          password: "",
          verification_status: "VERIFIED",
          service_areas: "",
          address: "",
          gst_number: "",
          number_of_painters: 0,
        }
      : section === "applicators"
        ? {
            name: "",
            mobile: "",
            email: "",
            password: "",
            verification_status: "VERIFIED",
            experience_years: 0,
            skills: "",
            locations: "",
            availability: "AVAILABLE",
            daily_wage: "",
            weekly_wage: "",
          }
        : {
            name: "",
            mobile: "",
            email: "",
            city: "",
            address: "",
            requirement: "",
            contractor_id: contractors[0]?.id || "",
            status: "NEW",
            source: "OTHER",
          };
  const [form, setForm] = useState({ ...blank, ...record, password: "" });
  const input = "mt-2 w-full rounded-xl border px-3 py-3 font-normal";
  const change = (name) => ({
    value: form[name] ?? "",
    onChange: (e) => setForm({ ...form, [name]: e.target.value }),
  });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6"
      >
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-bold">
              {record.id ? "Edit" : "Create"}{" "}
              {section === "applicators"
                ? "Paint Applicator"
                : section.slice(0, -1)}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Changes are recorded without deleting related business history.
            </p>
          </div>
          <button type="button" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input required {...change("name")} className={input} />
          </Field>
          <Field label="Mobile">
            <input required {...change("mobile")} className={input} />
          </Field>
          <Field label="Email">
            <input type="email" {...change("email")} className={input} />
          </Field>
          {section !== "customers" && (
            <Field
              label={
                record.id
                  ? "New password (optional)"
                  : "Password (blank = generated)"
              }
            >
              <input
                type="text"
                minLength={form.password ? 8 : undefined}
                {...change("password")}
                className={input}
              />
            </Field>
          )}
          {section === "contractors" && (
            <>
              <Field label="Company">
                <input required {...change("company")} className={input} />
              </Field>
              <Field label="Verification">
                <Verification
                  value={form.verification_status}
                  onChange={(value) =>
                    setForm({ ...form, verification_status: value })
                  }
                  className={input}
                />
              </Field>
              <Field label="Service areas" wide>
                <input {...change("service_areas")} className={input} />
              </Field>
              <Field label="Office address" wide>
                <textarea rows="2" {...change("address")} className={input} />
              </Field>
              <Field label="GST number">
                <input {...change("gst_number")} className={input} />
              </Field>
              <Field label="Applicator count">
                <input
                  type="number"
                  min="0"
                  {...change("number_of_painters")}
                  className={input}
                />
              </Field>
            </>
          )}
          {section === "applicators" && (
            <>
              <Field label="Verification">
                <Verification
                  value={form.verification_status}
                  onChange={(value) =>
                    setForm({ ...form, verification_status: value })
                  }
                  className={input}
                />
              </Field>
              <Field label="Availability">
                <select {...change("availability")} className={input}>
                  <option>AVAILABLE</option>
                  <option>BUSY</option>
                  <option>OFFLINE</option>
                </select>
              </Field>
              <Field label="Experience years">
                <input
                  type="number"
                  min="0"
                  {...change("experience_years")}
                  className={input}
                />
              </Field>
              <Field label="Preferred locations">
                <input {...change("locations")} className={input} />
              </Field>
              <Field label="Daily wage">
                <input
                  type="number"
                  min="0"
                  {...change("daily_wage")}
                  className={input}
                />
              </Field>
              <Field label="Weekly wage">
                <input
                  type="number"
                  min="0"
                  {...change("weekly_wage")}
                  className={input}
                />
              </Field>
              <Field label="Skills" wide>
                <textarea rows="3" {...change("skills")} className={input} />
              </Field>
            </>
          )}
          {section === "customers" && (
            <>
              <Field label="Contractor">
                <select required {...change("contractor_id")} className={input}>
                  {contractors.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.company} · {item.mobile}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select {...change("status")} className={input}>
                  {[
                    "NEW",
                    "CONTACTED",
                    "FOLLOW_UP",
                    "SITE_VISIT",
                    "QUOTATION_SENT",
                    "NEGOTIATION",
                    "WON",
                    "LOST",
                    "CANCELLED",
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Source">
                <select {...change("source")} className={input}>
                  {[
                    "WEBSITE",
                    "PHONE",
                    "WHATSAPP",
                    "FACEBOOK",
                    "INSTAGRAM",
                    "GOOGLE",
                    "REFERRAL",
                    "WALK_IN",
                    "OTHER",
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="City">
                <input {...change("city")} className={input} />
              </Field>
              <Field label="Address" wide>
                <textarea rows="2" {...change("address")} className={input} />
              </Field>
              <Field label="Requirement" wide>
                <textarea
                  rows="3"
                  {...change("requirement")}
                  className={input}
                />
              </Field>
            </>
          )}
        </div>
        <button
          disabled={saving}
          className="mt-6 w-full rounded-xl bg-slate-950 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save record"}
        </button>
      </form>
    </div>
  );
}
function Verification({ value, onChange, className }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option>VERIFIED</option>
      <option>PENDING</option>
      <option>UNDER_REVIEW</option>
      <option>REJECTED</option>
      <option>SUSPENDED</option>
    </select>
  );
}
function Field({ label, wide, children }) {
  return (
    <label className={`text-sm font-semibold ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}
function CredentialModal({ credentials, onClose }) {
  const text = `Mobile: ${credentials.mobile}\nPassword: ${credentials.password}\nBharath ID: ${credentials.bharath_id}`;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-bold">Account created</h2>
            <p className="mt-1 text-sm text-slate-500">
              Copy the password now; it will not be shown again.
            </p>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </div>
        <pre className="mt-5 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm">
          {text}
        </pre>
        <button
          onClick={() => navigator.clipboard.writeText(text)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white"
        >
          <Copy className="h-4 w-4" />
          Copy credentials
        </button>
      </div>
    </div>
  );
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function csv(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
