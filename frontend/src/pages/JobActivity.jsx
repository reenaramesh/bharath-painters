import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { EmptyState, ErrorState, PageHeader, SectionCard, StatusBadge } from "../components/ui";
import "./jobs-schedules.css";
import "./painter-portal.css";

const sections = [
  ["ALL", "All activity"],
  ["POSTS", "My posts"],
  ["ACCEPTED", "Accepted work"],
  ["HISTORY", "Work history"],
];

export default function JobActivity() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [section, setSection] = useState("ALL");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [transferTargets, setTransferTargets] = useState({});

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/jobs/activity/", {
        params: {
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        },
      });
      setRows(data.results || []);
      setError("");
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Job activity could not be loaded.",
      );
    }
  }, [dateFrom, dateTo]);
  useEffect(() => {
    load();
  }, [load]);

  async function cancellation(row, action) {
    const defaultReason =
      action === "APPROVE"
        ? row.cancellation_reason
        : user?.role === "CONTRACTOR"
          ? "Customer cancelled the service"
          : "Personal reason";
    const needsReason = action !== "REJECT";
    const reason = needsReason
      ? prompt("Reason for cancellation:", defaultReason || "")
      : "";
    if (needsReason && (reason === null || !reason.trim())) return;
    setSavingId(row.id);
    try {
      await api.post(`/jobs/applications/${row.application_id}/cancellation/`, {
        action,
        reason,
      });
      await load();
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Cancellation request could not be updated.",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function rate(row) {
    const subject =
      user?.role === "CONTRACTOR" ? "Paint Applicator" : "contractor";
    const rating = prompt(`Optional rating for the ${subject} (1 to 5):`, "5");
    if (rating === null || rating === "") return;
    const review = prompt("Optional feedback:", "") ?? "";
    setSavingId(row.id);
    try {
      await api.post(`/jobs/applications/${row.application_id}/rating/`, {
        rating,
        review,
      });
      await load();
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Rating could not be saved.",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function requestTransfer(row) {
    const targetJobId = transferTargets[row.id];
    if (!targetJobId) return;
    const reason = prompt(
      "Reason for requesting this transfer:",
      "Personal request",
    );
    if (reason === null) return;
    setSavingId(row.id);
    try {
      await api.post(`/jobs/applications/${row.application_id}/reassign/`, {
        target_job_id: targetJobId,
        reason,
      });
      await load();
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Transfer request could not be sent.",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function respondTransfer(row, action) {
    setSavingId(row.id);
    try {
      await api.post(`/jobs/transfers/${row.transfer_request.id}/respond/`, {
        action,
      });
      await load();
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Transfer request could not be updated.",
      );
    } finally {
      setSavingId(null);
    }
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (section === "ALL" || row.section === section) &&
        (!term ||
          [
            row.title,
            row.person,
            row.location,
            row.activity_type,
            row.status,
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(term),
          )),
    );
  }, [rows, search, section]);

  return (
    <div className={`space-y-6 jobs-schedules-page bp-job-activity-page ${user?.role === "PAINTER" ? "painter-portal-page painter-job-activity-page" : ""}`}>
      <PageHeader eyebrow="People and workforce" title="Job Activity" description={user?.role === "CONTRACTOR" ? "Review job posts, assignments, cancellation requests and work history." : "Review accepted jobs, request cancellation when required and see your history."} />
      {user?.role === "PAINTER" && <section className="painter-activity-focus" aria-label="Painter job activity summary"><div><span>Accepted work</span><strong>{rows.filter((row) => row.status === "ACCEPTED").length}</strong><small>Jobs you have accepted</small></div><div className="is-action"><span>Waiting on action</span><strong>{rows.filter((row) => ["CANCELLATION_REQUESTED", "TRANSFER_REQUESTED"].includes(row.status)).length}</strong><small>Requests to review</small></div><div><span>History records</span><strong>{rows.filter((row) => row.section === "HISTORY").length}</strong><small>Past work activity</small></div></section>}
      {error && <ErrorState message={error} onRetry={load} className="min-h-0 rounded-2xl border border-red-100 bg-white p-5" />}
      <SectionCard title="Activity records" description={`${visible.length} matching activity ${visible.length === 1 ? "record" : "records"}`} className="job-activity-card" bodyClassName="p-0">
        <div className="grid gap-3 border-b p-4 lg:grid-cols-[1fr_190px_190px]">
          <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search work, person or location"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <DateField label="From" value={dateFrom} change={setDateFrom} />
          <DateField
            label="Until"
            value={dateTo}
            change={setDateTo}
            min={dateFrom}
          />
        </div>
        <div className="flex flex-wrap gap-2 border-b p-4">
          {sections.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setSection(value)}
              aria-pressed={section === value}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${section === value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {label}{" "}
              <span className="ml-1 opacity-70">
                {value === "ALL"
                  ? rows.length
                  : rows.filter((row) => row.section === value).length}
              </span>
            </button>
          ))}
        </div>
        <div className="grid gap-3 p-3 md:hidden">
          {visible.map((row) => (
            <article
              key={row.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <header className="bg-slate-950 p-4 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                      {row.activity_type}
                    </p>
                    <h3 className="mt-1 truncate text-base font-bold">
                      {row.title}
                    </h3>
                    <p className="mt-1 truncate text-xs text-slate-300">
                      {row.person || "—"}
                    </p>
                  </div>
                  <StatusBadge status={row.status} label={String(row.status).replaceAll("_", " ")} tone={activityTone(row.status)} />
                </div>
              </header>
              <div className="grid grid-cols-2 gap-px bg-slate-200">
                <div className="bg-white p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Dates
                  </p>
                  <p className="mt-1 flex items-start gap-1 text-xs font-semibold">
                    <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {formatJobActivityDate(row.start_date)}
                    {row.end_date && row.end_date !== row.start_date
                      ? ` to ${formatJobActivityDate(row.end_date)}`
                      : ""}
                  </p>
                </div>
                <div className="bg-white p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Location
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs font-semibold">
                    {row.location || "—"}
                  </p>
                </div>
              </div>
              {(row.detail ||
                row.cancellation_reason ||
                row.transfer_request) && (
                <div className="border-t bg-slate-50 p-3 text-xs text-slate-600">
                  {row.cancellation_reason && (
                    <p className="mb-1 font-semibold text-amber-700">
                      Reason: {row.cancellation_reason}
                    </p>
                  )}
                  {row.transfer_request && (
                    <p className="mb-1 font-semibold text-blue-700">
                      Transfer to {row.transfer_request.target_job}:{" "}
                      {row.transfer_request.reason}
                    </p>
                  )}
                  <p>{row.detail}</p>
                </div>
              )}
              <div className="border-t p-3">
                <ActivityActions
                  row={row}
                  role={user?.role}
                  busy={savingId === row.id}
                  cancel={cancellation}
                  rate={rate}
                  target={transferTargets[row.id] || ""}
                  setTarget={(value) =>
                    setTransferTargets((old) => ({ ...old, [row.id]: value }))
                  }
                  requestTransfer={requestTransfer}
                  respondTransfer={respondTransfer}
                />
              </div>
            </article>
          ))}
          {!visible.length && <EmptyState title="No job activity found" description="Adjust the search or date filters to review other work." />}
        </div>
        <div
          className="hidden overflow-x-auto md:block"
          data-mobile-table="keep"
        >
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Work / Post</th>
                <th className="px-4 py-3">Contractor / Applicator</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4 font-semibold">
                    {row.activity_type}
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-900">
                    {row.title}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {row.person || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-4 w-4 text-slate-400" />
                      {formatJobActivityDate(row.start_date)}
                      {row.end_date && row.end_date !== row.start_date
                        ? ` to ${formatJobActivityDate(row.end_date)}`
                        : ""}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {row.location || "—"}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={row.status} label={String(row.status).replaceAll("_", " ")} tone={activityTone(row.status)} />
                  </td>
                  <td className="max-w-xs px-4 py-4 text-slate-500">
                    {row.cancellation_reason && (
                      <p className="mb-1 font-semibold text-amber-700">
                        Reason: {row.cancellation_reason}
                      </p>
                    )}
                    {row.transfer_request && (
                      <p className="mb-1 font-semibold text-blue-700">
                        Transfer to {row.transfer_request.target_job}:{" "}
                        {row.transfer_request.reason}
                      </p>
                    )}
                    {row.detail}
                  </td>
                  <td className="px-4 py-4">
                    <ActivityActions
                      row={row}
                      role={user?.role}
                      busy={savingId === row.id}
                      cancel={cancellation}
                      rate={rate}
                      target={transferTargets[row.id] || ""}
                      setTarget={(value) =>
                        setTransferTargets((old) => ({
                          ...old,
                          [row.id]: value,
                        }))
                      }
                      requestTransfer={requestTransfer}
                      respondTransfer={respondTransfer}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && <EmptyState title="No job activity found" description="Adjust the search or date filters to review other work." />}
        </div>
      </SectionCard>
    </div>
  );
}

function ActivityActions({
  row,
  role,
  busy,
  cancel,
  rate,
  target,
  setTarget,
  requestTransfer,
  respondTransfer,
}) {
  if (!row.application_id) return <span className="text-slate-300">—</span>;
  if (row.transfer_request)
    return row.transfer_request.can_respond ? (
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => respondTransfer(row, "REJECT")}
          className="rounded-lg border px-3 py-2 text-xs font-bold"
        >
          Decline transfer
        </button>
        <button
          disabled={busy}
          onClick={() => respondTransfer(row, "ACCEPT")}
          className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white"
        >
          Accept transfer
        </button>
      </div>
    ) : (
      <span className="text-xs font-semibold text-blue-700">
        Waiting for approval
      </span>
    );
  if (role === "PAINTER" && row.status === "ACCEPTED")
    return (
      <div className="flex min-w-64 flex-col gap-2">
        {row.transfer_options?.length > 0 && (
          <div className="flex gap-2">
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border bg-white px-2 py-2 text-xs"
            >
              <option value="">Transfer to another job</option>
              {row.transfer_options.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} · {job.start_date}
                </option>
              ))}
            </select>
            <button
              disabled={busy || !target}
              onClick={() => requestTransfer(row)}
              className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              Request
            </button>
          </div>
        )}
        <button
          disabled={busy}
          onClick={() => cancel(row, "REQUEST")}
          className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold text-amber-700 disabled:opacity-50"
        >
          Request cancellation
        </button>
      </div>
    );
  if (role === "PAINTER" && row.status === "CANCELLATION_REQUESTED")
    return (
      <span className="text-xs font-semibold text-amber-700">
        Waiting for contractor
      </span>
    );
  if (role === "CONTRACTOR" && row.status === "ACCEPTED")
    return (
      <button
        disabled={busy}
        onClick={() => cancel(row, "CANCEL")}
        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 disabled:opacity-50"
      >
        Cancel assignment
      </button>
    );
  if (role === "CONTRACTOR" && row.status === "CANCELLATION_REQUESTED")
    return (
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => cancel(row, "REJECT")}
          className="rounded-lg border px-3 py-2 text-xs font-bold"
        >
          Keep
        </button>
        <button
          disabled={busy}
          onClick={() => cancel(row, "APPROVE")}
          className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white"
        >
          Approve
        </button>
      </div>
    );
  if (row.status === "CANCELLED" && !row.my_rating)
    return (
      <button
        disabled={busy}
        onClick={() => rate(row)}
        className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50"
      >
        Rate (optional)
      </button>
    );
  if (row.my_rating)
    return (
      <span className="font-bold text-amber-600">★ {row.my_rating}/5</span>
    );
  return <span className="text-slate-300">—</span>;
}

function DateField({ label, value, change, min }) {
  return (
    <label className="rounded-xl bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
      {label}
      <input
        type="date"
        min={min || undefined}
        value={value}
        onChange={(event) => change(event.target.value)}
        className="mt-1 block w-full bg-transparent text-sm font-normal text-slate-900 outline-none"
      />
    </label>
  );
}

function activityTone(value) {
  if (["ACCEPTED", "COMPLETED", "FILLED"].includes(value)) return "success";
  if (["REJECTED", "CANCELLED"].includes(value)) return "danger";
  if (["CANCELLATION_REQUESTED", "PENDING"].includes(value)) return "warning";
  if (["APPLIED", "IN_PROGRESS", "ASSIGNED"].includes(value)) return "info";
  return "neutral";
}

function formatJobActivityDate(value) {
  if (!value) return "Date not set";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
