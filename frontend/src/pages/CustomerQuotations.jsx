import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ChevronRight, Search } from "lucide-react";
import api from "../api/client";

const statusColors = {
  SENT: "bg-blue-50 text-blue-700",
  VIEWED: "bg-indigo-50 text-indigo-700",
  ACCEPTED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
  REVISION_REQUESTED: "bg-amber-50 text-amber-700",
  SCHEDULED: "bg-purple-50 text-purple-700",
  IN_PROGRESS: "bg-violet-50 text-violet-700",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CONVERTED: "bg-cyan-50 text-cyan-700",
};

export default function CustomerQuotations() {
  const [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("ALL");
  useEffect(() => {
    api
      .get("/quotations/customer-portal/quotations/", {
        params: { refresh: Date.now() },
      })
      .then(({ data }) => setItems(data || []))
      .catch(() => setError("Quotations could not be loaded."))
      .finally(() => setLoading(false));
  }, []);
  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) =>
      (status === "ALL" || item.status === status) &&
      (!term || [item.quotation_number, item.contractor_name, item.property_name, item.contractor_bharath_id].some((value) => String(value || "").toLowerCase().includes(term))),
    );
  }, [items, search, status]);
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-amber-600">Customer portal</p>
        <h1 className="mt-1 text-3xl font-bold">My quotations</h1>
        <p className="mt-2 text-slate-500">
          Compare contractor details, amount, schedule and quotation status.
        </p>
      </header>
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}
      <section className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-[1fr_220px]">
        <label className="flex min-w-0 items-center gap-3 rounded-xl bg-slate-50 px-4 py-3"><Search className="h-5 w-5 shrink-0 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quotation, contractor or property" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold"><option value="ALL">All statuses</option>{Object.keys(statusColors).map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select>
      </section>
      <section className="overflow-hidden rounded-2xl border bg-white">
        {loading ? (
          <p className="p-12 text-center text-slate-500">
            Loading quotations...
          </p>
        ) : visibleItems.length ? (
          <>
            <div className="grid gap-3 p-3 md:hidden">
              {visibleItems.map((item) => (
                <Link
                  key={item.id}
                  to={`/customer-quotations/${item.id}`}
                  className="block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3 bg-slate-950 p-4 text-white">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-300">
                        {item.quotation_number}
                      </p>
                      <h2 className="mt-1 truncate text-base font-bold">
                        {item.contractor_name || "Contractor"}
                      </h2>
                      <p className="mt-1 truncate text-xs text-slate-300">
                        {item.property_name || "Property"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusColors[item.status] || "bg-white/15 text-white"}`}
                    >
                      {item.status_display ||
                        String(item.status || "").replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-slate-200">
                    <div className="bg-white p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Quotation value
                      </p>
                      <p className="mt-1 text-lg font-extrabold text-slate-950">
                        ₹{Number(item.grand_total || 0).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="bg-white p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Created
                      </p>
                      <p className="mt-1 text-sm font-bold">
                        {formatDate(item.quotation_date)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Updated {formatDate(item.updated_at)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t bg-slate-50 p-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Schedule
                      </p>
                      <p className="mt-1 truncate text-xs font-semibold">
                        {item.schedule_start_date
                          ? `${formatDate(item.schedule_start_date)} to ${formatDate(item.schedule_end_date)}`
                          : "Not scheduled"}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700">
                      View <ChevronRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="hidden md:block" data-mobile-table="keep">
              <table className="w-full table-fixed text-left text-xs lg:text-sm">
                <thead className="bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-[6%] px-4 py-4">#</th>
                    <th className="w-[27%] px-4 py-4">Quotation / property</th>
                    <th className="w-[25%] px-4 py-4">Contractor</th>
                    <th className="w-[14%] px-4 py-4">Updated</th>
                    <th className="w-[12%] px-4 py-4 text-right">Value</th>
                    <th className="w-[16%] px-4 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleItems.map((item, index) => (
                    <tr key={item.id} className="align-middle transition hover:bg-slate-50">
                      <td className="px-4 py-4 font-bold text-slate-400">{index + 1}</td>
                      <td className="px-4 py-4"><p className="truncate font-bold text-slate-950">{item.quotation_number}</p><p className="mt-1 truncate text-xs text-slate-500">{item.property_name}</p><p className="mt-1 truncate text-[11px] text-slate-400">{item.schedule_start_date ? `Scheduled ${formatDate(item.schedule_start_date)} to ${formatDate(item.schedule_end_date)}` : `Created ${formatDate(item.quotation_date)}`}</p></td>
                      <td className="px-4 py-4"><div className="flex min-w-0 items-center gap-3"><span className={`grid h-9 shrink-0 place-items-center overflow-hidden bg-slate-950 text-white ${item.contractor_logo_shape === "ROUND" ? "w-9 rounded-full" : "w-14 rounded-lg"}`}>{item.contractor_logo ? <img src={item.contractor_logo} alt="" className={`h-full w-full ${item.contractor_logo_shape === "ROUND" ? "object-cover" : "bg-white object-contain p-0.5"}`} /> : <Building2 className="h-4 w-4" />}</span><div className="min-w-0"><p className="truncate font-bold text-slate-900">{item.contractor_name || "Contractor"}</p><p className="truncate text-[11px] text-slate-500">{item.contractor_bharath_id || item.contractor_mobile || "Bharath Painters contractor"}</p></div></div></td>
                      <td className="px-4 py-4"><p className="font-semibold text-slate-700">{formatDate(item.updated_at)}</p><p className="mt-1 text-xs text-slate-400">{formatTime(item.updated_at)}</p></td>
                      <td className="px-4 py-4 text-right text-base font-bold text-slate-900">₹{Number(item.grand_total || 0).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusColors[item.status] || "bg-slate-100 text-slate-700"}`}
                        >
                          {item.status_display ||
                            String(item.status || "").replaceAll("_", " ")}
                        </span>
                        <Link
                          to={`/customer-quotations/${item.id}`}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700"
                        >
                          View <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="p-12 text-center text-slate-500">
            {items.length ? "No quotations match your search or status." : "No final quotations submitted yet."}
          </p>
        )}
      </section>
    </div>
  );
}
function asDate(value) {
  if (!value) return null;
  return new Date(String(value).includes("T") ? value : `${value}T00:00:00`);
}
function formatDate(value) {
  const date = asDate(value);
  return date
    ? date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
}
function formatTime(value) {
  const date = asDate(value);
  return date && String(value).includes("T")
    ? date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : "";
}
