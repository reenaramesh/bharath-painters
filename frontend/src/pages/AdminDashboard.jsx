/* eslint-disable no-unused-vars -- WorkingTable is retained for the planned detailed active-work view. */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  BriefcaseBusiness,
  Copy,
  Download,
  Eye,
  EyeOff,
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
import { Link } from "react-router-dom";
import api from "../api/client";
import MobileDashboardShortcuts from "../components/MobileDashboardShortcuts";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
} from "../components/ui";
import "./admin-portal.css";

const sections = [
  { key: "contractors", label: "Contractors", icon: BriefcaseBusiness },
  { key: "applicators", label: "Employees", icon: Paintbrush },
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
    ["profile_completion", "Profile"],
    ["team_size", "Team"],
    ["service_areas", "Service areas"],
  ],
  applicators: [
    ["name", "Name"],
    ["mobile", "Mobile"],
    ["bharath_id", "Bharath ID"],
    ["experience_years", "Experience"],
    ["skills", "Skills"],
    ["teams", "Teams"],
  ],
  customers: [
    ["bharath_id", "Customer ID"],
    ["name", "Customer"],
    ["mobile", "Mobile"],
    ["city", "City"],
    ["contractor", "Contractor"],
    ["email", "Email"],
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
  const [repairMessage, setRepairMessage] = useState("");
  const [retiredAccounts, setRetiredAccounts] = useState(null);
  const [retiredSelection, setRetiredSelection] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState([]);
  const [supportQueries, setSupportQueries] = useState([]);
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
    api.get("/quotations/support-tickets/")
      .then(({ data: tickets }) => setSupportQueries(tickets.slice(0, 5)))
      .catch(() => setSupportQueries([]));
  }, []);
  useEffect(() => {
    setFilter("ALL");
    setSelectedIds([]);
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
  useEffect(() => setSelectedIds([]), [search, filter, page]);
  function toggleSelected(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  function togglePageSelection() {
    const ids = pagedRows.map((row) => row.id);
    setSelectedIds((current) => ids.every((id) => current.includes(id))
      ? current.filter((id) => !ids.includes(id))
      : [...new Set([...current, ...ids])]);
  }
  async function deleteSelected() {
    if (!selectedIds.length || saving) return;
    const count = selectedIds.length;
    const reason = window.prompt("Why are you deleting account access? This reason is saved to the audit history (10 to 1000 characters).");
    if (!reason || reason.trim().length < 10 || reason.trim().length > 1000) { if (reason !== null) window.alert("Enter a justification between 10 and 1000 characters."); return; }
    if (!window.confirm(`Delete access for ${count} selected ${section === "applicators" ? "paint applicator" : section.slice(0, -1)}${count === 1 ? "" : "s"}? Related business records will be preserved.`)) return;
    setSaving(true);
    const failed = [];
    for (const id of selectedIds) {
      try {
        await api.delete(`/quotations/admin-dashboard/${section}/${id}/`, { data: { reason: reason.trim() } });
      } catch {
        failed.push(id);
      }
    }
    await load();
    setSelectedIds(failed);
    if (failed.length) setError(`${count - failed.length} of ${count} records removed. ${failed.length} could not be removed; those selections remain checked.`);
    setSaving(false);
  }
  async function releaseDeletedCustomerNumbers() {
    if (saving || !window.confirm("Release mobile numbers held by deleted customers? This keeps historical business records.")) return;
    setSaving(true);
    setError("");
    setRepairMessage("");
    try {
      const { data: result } = await api.post("/quotations/admin-dashboard/release-deleted-customer-mobiles/");
      setRepairMessage(result.message);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Deleted customer numbers could not be released.");
    } finally {
      setSaving(false);
    }
  }
  async function openInactiveAccountNumbers() {
    const role = section === "contractors" ? "CONTRACTOR" : "PAINTER";
    setError("");
    try {
      const { data: result } = await api.get("/quotations/admin-dashboard/release-inactive-business-mobiles/", { params: { role } });
      setRetiredAccounts({ role, accounts: result.accounts });
      setRetiredSelection([]);
    } catch (err) {
      setError(err.response?.data?.detail || "Inactive accounts could not be loaded.");
    }
  }
  async function releaseInactiveAccountNumbers() {
    if (!retiredAccounts || !retiredSelection.length || saving) return;
    if (!window.confirm(`Release the mobile numbers of ${retiredSelection.length} selected inactive accounts? Those accounts will no longer be able to sign in.`)) return;
    setSaving(true);
    setError("");
    try {
      const { data: result } = await api.post("/quotations/admin-dashboard/release-inactive-business-mobiles/", {
        role: retiredAccounts.role,
        user_ids: retiredSelection,
      });
      setRepairMessage(result.message);
      setRetiredAccounts(null);
      setRetiredSelection([]);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Selected numbers could not be released.");
    } finally {
      setSaving(false);
    }
  }
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
    const reason = window.prompt(`Why are you deleting access for ${row.name || row.company}? This reason is saved to the audit history.`);
    if (!reason || reason.trim().length < 10 || reason.trim().length > 1000) { if (reason !== null) window.alert("Enter a justification between 10 and 1000 characters."); return; }
    if (!window.confirm(`Delete access for ${row.name || row.company}? Related business records will be preserved.`)) return;
    setSaving(true);
    try {
      await api.delete(`/quotations/admin-dashboard/${section}/${row.id}/`, { data: { reason: reason.trim() } });
      await load();
      setSelectedIds((current) => current.filter((id) => id !== row.id));
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
  async function suspendAccess(row) {
    const reason = window.prompt(`Why are you suspending ${row.name || row.company}'s account? This justification is saved to the audit history.`);
    if (!reason || reason.trim().length < 10 || reason.trim().length > 1000) { if (reason !== null) window.alert("Enter a justification between 10 and 1000 characters."); return; }
    if (!window.confirm(`Suspend ${row.name || row.company}'s sign-in and notifications?`)) return;
    setSaving(true); setError("");
    try {
      await api.post("/quotations/support-workspace/actions/", { action: "SUSPEND_ACCOUNT", target_id: row.id, reason: reason.trim() });
      await load();
      setRepairMessage("Account suspended. The reason was added to the support audit.");
    } catch (err) { setError(err.response?.data?.detail || err.response?.data?.reason || "Account could not be suspended."); }
    finally { setSaving(false); }
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
    <div className="admin-dashboard space-y-4">
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
            {section === "customers" && (
              <button
                type="button"
                disabled={saving}
                onClick={releaseDeletedCustomerNumbers}
                className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                Release deleted numbers
              </button>
            )}
            {(section === "contractors" || section === "applicators") && (
              <button
                type="button"
                disabled={saving}
                onClick={openInactiveAccountNumbers}
                className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                Release old deleted numbers
              </button>
            )}
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
      {repairMessage && (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{repairMessage}</p>
      )}
      <section className="rounded-xl border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Recent support conversations</h2></div><Link to="/support-tickets" className="rounded-lg border px-3 py-2 text-sm font-semibold text-[var(--app-primary)]">All support queries</Link></div><div className="mt-3 divide-y">{supportQueries.length ? supportQueries.map((ticket) => <Link key={ticket.id} to={`/support-tickets?ticket=${ticket.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-slate-50"><span className="min-w-0"><strong className="text-sm">{ticket.subject}</strong><span className="ml-2 text-xs text-slate-500">{ticket.ticket_number} · {ticket.requester_name}</span><span className="mt-1 block truncate text-xs text-slate-500">{ticket.description}</span></span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{ticket.status?.replaceAll("_", " ")}</span></Link>) : <p className="py-3 text-sm text-slate-500">No support queries found.</p>}</div></section>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {sections.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`admin-summary rounded-xl text-left transition ${section === key ? "is-active" : ""}`}
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
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row">
          <label className="flex flex-1 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${sections.find((item) => item.key === section).label.toLowerCase()}...`}
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          {section !== "customers" && (
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="ALL">All statuses / roles</option>
              {filterOptions.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          )}
          <button
            onClick={exportCurrentCsv}
            className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"
          >
            <Download className="h-4 w-4" />
            Export current CSV
          </button>
        </div>
        <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-2">
          <p className="text-sm font-semibold">{rows.length} records</p>
          <p className="text-xs text-slate-400">
            Click a column heading to sort
          </p>
        </div>
        {editable && selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b bg-[var(--app-soft)] px-4 py-2">
            <span className="text-sm font-semibold text-[var(--app-primary)]">{selectedIds.length} selected</span>
            <button type="button" disabled={saving} onClick={deleteSelected} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> {saving ? "Deleting..." : "Delete selected"}
            </button>
            <button type="button" disabled={saving} onClick={() => setSelectedIds([])} className="text-xs font-semibold text-slate-600 hover:underline">Clear selection</button>
          </div>
        )}
        <DataTable
          section={section}
          rows={pagedRows}
          startIndex={(page - 1) * pageSize}
          sort={sort}
          setSort={setSort}
          editable={editable}
          onEdit={setEditing}
          onDelete={deleteAccess}
          onSuspend={suspendAccess}
          saving={saving}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
          onTogglePageSelection={togglePageSelection}
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
      {retiredAccounts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="retired-account-title" className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="retired-account-title" className="text-lg font-bold">Release old deleted numbers</h2>
                
              </div>
              <button type="button" aria-label="Close" onClick={() => setRetiredAccounts(null)} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              {retiredAccounts.accounts.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm">No inactive accounts are holding mobile numbers.</p>}
              {retiredAccounts.accounts.map((account) => (
                <label key={account.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                  <input type="checkbox" checked={retiredSelection.includes(account.id)} onChange={() => setRetiredSelection((current) => current.includes(account.id) ? current.filter((id) => id !== account.id) : [...current, account.id])} />
                  <span className="min-w-0"><strong className="block truncate">{account.name}</strong><span className="text-slate-500">{account.bharath_id} · {account.mobile}</span></span>
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setRetiredAccounts(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button type="button" disabled={saving || !retiredSelection.length} onClick={releaseInactiveAccountNumbers} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Release {retiredSelection.length} numbers</button>
            </div>
          </div>
        </div>
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
      label: "Employees working today",
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
              <th className="px-4 py-3">Sl.</th>
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
              rows.map((row, index) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">{index + 1}</td>
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
                <td colSpan="5" className="p-8 text-center text-slate-400">
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
  startIndex,
  sort,
  setSort,
  editable,
  onEdit,
  onDelete,
  onSuspend,
  saving,
  selectedIds,
  onToggleSelected,
  onTogglePageSelection,
}) {
  function choose(key) {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }
  return (
    <div className="overflow-x-auto">
      <table className="admin-directory-table w-full text-left text-xs sm:text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="border-b px-2 py-2 sm:px-3">Sl.</th>
            {editable && <th className="border-b px-2 py-2 sm:px-3">
              <input type="checkbox" aria-label="Select all rows on this page" checked={rows.length > 0 && rows.every((row) => selectedIds.includes(row.id))} ref={(node) => { if (node) node.indeterminate = rows.some((row) => selectedIds.includes(row.id)) && !rows.every((row) => selectedIds.includes(row.id)); }} onChange={onTogglePageSelection} disabled={saving || rows.length === 0} className="h-4 w-4 accent-[var(--app-primary)]" />
            </th>}
            {columns[section].map(([key, label]) => (
              <th key={key} className="border-b px-2 py-2 sm:px-3">
                <button
                  onClick={() => choose(key)}
                  className="flex items-center gap-1 text-left font-bold"
                >
                  {label}
                  <ArrowDownUp
                    className={`h-3.5 w-3.5 ${sort.key === key ? "text-slate-950" : "text-slate-300"}`}
                  />
                </button>
              </th>
            ))}
            {editable && <th className="border-b px-2 py-2 sm:px-3">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={row.id} className="border-b hover:bg-slate-50">
                <td className="px-2 py-2 align-top text-slate-500 sm:px-3">{startIndex + index + 1}</td>
                {editable && <td className="px-2 py-2 align-top sm:px-3"><input type="checkbox" aria-label={`Select ${row.name || row.company}`} checked={selectedIds.includes(row.id)} onChange={() => onToggleSelected(row.id)} disabled={saving} className="h-4 w-4 accent-[var(--app-primary)]" /></td>}
                {columns[section].map(([key]) => (
                  <td
                    key={key}
                    className={`max-w-[220px] break-words px-2 py-2 align-top sm:px-3 ${key === "mobile" || key === "bharath_id" ? "whitespace-nowrap" : ""}`}
                  >
                    {display(key, row[key])}
                  </td>
                ))}
                {editable && (
                  <td className="whitespace-nowrap px-2 py-2 align-top sm:px-3">
                    {section !== "customers" && <button
                      disabled={saving}
                      onClick={() => onSuspend(row)}
                      className="mr-1 inline-flex items-center justify-center rounded-lg border border-amber-200 p-2 text-amber-700 hover:bg-amber-50"
                      title="Suspend account access with justification"
                      aria-label={`Suspend access for ${row.name || row.company}`}
                    ><EyeOff className="h-4 w-4" /></button>}
                    <button
                      onClick={() => onEdit(row)}
                      className="mr-1 rounded-lg border p-2 hover:bg-slate-50"
                      title="Edit"
                      aria-label={`Edit ${row.name || row.company}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      disabled={saving}
                      onClick={() => onDelete(row)}
                      className="inline-flex items-center justify-center rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
                      title="Delete account access"
                      aria-label={`Delete access for ${row.name || row.company}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns[section].length + (editable ? 3 : 1)}
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
  if (key === "profile_completion") return `${value ?? 0}%`;
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
  const [showPassword, setShowPassword] = useState(false);
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
            <input type="email" required={section === "contractors" && !record.id} {...change("email")} className={input} />
          </Field>
          {section !== "customers" && (
            <div className="text-sm font-semibold">
              <label htmlFor="admin-record-password">{record.id ? "New password (optional)" : section === "contractors" ? "Password" : "Password (blank = generated)"}</label>
              <span className="relative block">
                <input
                  id="admin-record-password"
                  type={showPassword ? "text" : "password"}
                  required={section === "contractors" && !record.id}
                  minLength={form.password ? 8 : undefined}
                  autoComplete="new-password"
                  {...change("password")}
                  className={`${input} pr-12`}
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute inset-y-0 right-1 top-2 grid w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </span>
            </div>
          )}
          {section === "contractors" && record.id && (
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
