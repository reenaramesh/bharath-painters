import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpDown, Calculator, Search } from "lucide-react";
import api from "../api/client";
import MobilePageBack from "../components/MobilePageBack";

const colors = { DRAFT: "bg-slate-100 text-slate-700", SENT: "bg-blue-50 text-blue-700", VIEWED: "bg-cyan-50 text-cyan-700", ACCEPTED: "bg-emerald-50 text-emerald-700", SCHEDULED: "bg-indigo-50 text-indigo-700", IN_PROGRESS: "bg-violet-50 text-violet-700", COMPLETED: "bg-emerald-100 text-emerald-800", REJECTED: "bg-red-50 text-red-700", EXPIRED: "bg-amber-50 text-amber-700", CANCELLED: "bg-slate-100 text-slate-600" };
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const last7Days = () => { const today = new Date(); const start = new Date(today); start.setDate(today.getDate() - 6); return { from: dateKey(start), to: dateKey(today) }; };

export default function Quotations() {
  const navigate = useNavigate();
  const initialDates = last7Days();
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [datePreset, setDatePreset] = useState("ALL");
  const [dateFrom, setDateFrom] = useState(initialDates.from);
  const [dateTo, setDateTo] = useState(initialDates.to);
  const [sort, setSort] = useState({ key: "date", direction: "desc" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.allSettled([api.get("/quotations/"), api.get("/quotations/customers/"), api.get("/quotations/properties/")]).then(([quotes, customerResult, propertyResult]) => {
      if (quotes.status === "fulfilled") setQuotations(quotes.value.data.results || quotes.value.data || []);
      else setError(quotes.reason?.response?.data?.detail || "Quotations could not be loaded.");
      if (customerResult.status === "fulfilled") setCustomers(customerResult.value.data.results || customerResult.value.data || []);
      if (propertyResult.status === "fulfilled") setProperties(propertyResult.value.data.results || propertyResult.value.data || []);
      setLoading(false);
    });
  }, []);

  const customerMap = useMemo(() => Object.fromEntries(customers.map((item) => [item.id, item])), [customers]);
  const propertyMap = useMemo(() => Object.fromEntries(properties.map((item) => [item.id, item])), [properties]);
  const visible = useMemo(() => quotations.filter((quotation) => {
    const term = search.trim().toLowerCase();
    const customer = customerMap[quotation.customer];
    const property = propertyMap[quotation.property];
    const quotationDate = String(quotation.quotation_date || "");
    const matchesDate = datePreset === "ALL" || (dateFrom && dateTo && quotationDate >= dateFrom && quotationDate <= dateTo);
    return quotation.status !== "CONVERTED" && (status === "ALL" || quotation.status === status) && matchesDate && [quotation.quotation_number, customer?.name, property?.name, property?.address, property?.city].some((value) => String(value || "").toLowerCase().includes(term));
  }).sort((a, b) => {
    const values = (quotation) => {
      const customer = customerMap[quotation.customer];
      const property = propertyMap[quotation.property];
      return { date: quotation.quotation_date, number: quotation.quotation_number, customer: customer?.name, address: [property?.address, property?.city].filter(Boolean).join(", "), status: quotation.status, amount: Number(quotation.grand_total || 0) };
    };
    const first = values(a)[sort.key]; const second = values(b)[sort.key];
    const comparison = typeof first === "number" ? first - second : String(first || "").localeCompare(String(second || ""), undefined, { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? comparison : -comparison;
  }), [quotations, customerMap, propertyMap, search, status, datePreset, dateFrom, dateTo, sort]);

  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const chooseDatePreset = (value) => { const today = new Date(); setDatePreset(value); if (value === "ALL") { setDateFrom(""); setDateTo(""); } if (value === "TODAY") { const date = dateKey(today); setDateFrom(date); setDateTo(date); } if (value === "LAST_7") { const start = new Date(today); start.setDate(today.getDate() - 6); setDateFrom(dateKey(start)); setDateTo(dateKey(today)); } if (value === "THIS_MONTH") { setDateFrom(dateKey(new Date(today.getFullYear(), today.getMonth(), 1))); setDateTo(dateKey(today)); } };
  const summaryCards = [
    ["All Quotations", "ALL"], ["Drafts", "DRAFT"], ["Scheduled", "SCHEDULED"], ["Sent", "SENT"],
    ["Approved", "ACCEPTED"], ["Rejected", "REJECTED"], ["Completed", "COMPLETED"],
  ].map(([label, value]) => ({ label, value, count: quotations.filter((quotation) => quotation.status !== "CONVERTED" && (value === "ALL" || quotation.status === value)).length }));
  const chooseSummary = (value) => { setStatus(value); chooseDatePreset("ALL"); };

  return <div className="space-y-6">
    <MobilePageBack />
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-amber-600">Estimates and pricing</p><h1 className="mt-1 text-3xl font-bold">Quotations</h1></div><Link to="/quotations/new" className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"><Calculator className="h-4 w-4" />Create a New Quotation</Link></div>
    {error && <div className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">{summaryCards.map((card) => <button key={card.value} type="button" onClick={() => chooseSummary(card.value)} className={`flex min-h-24 flex-col justify-between rounded-2xl border p-4 text-left transition ${status === card.value ? "border-slate-950 bg-slate-950 text-white shadow-lg" : "bg-white hover:border-slate-400 hover:shadow-sm"}`}><span className={`text-xs font-bold uppercase tracking-wide ${status === card.value ? "text-slate-300" : "text-slate-500"}`}>{card.label}</span><strong className="text-2xl tabular-nums">{card.count}</strong></button>)}</section>
    <section className="overflow-hidden rounded-2xl border bg-white">
      <div className="flex flex-col gap-3 border-b p-4"><div className="flex flex-col gap-2 md:flex-row"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quotation, customer or address" className="w-full bg-transparent text-sm outline-none" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border px-4 py-2.5 text-sm"><option value="ALL">All active statuses</option>{["DRAFT", "SENT", "VIEWED", "ACCEPTED", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "REJECTED", "EXPIRED", "CANCELLED"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select><select value={datePreset} onChange={(event) => chooseDatePreset(event.target.value)} className="rounded-xl border px-4 py-2.5 text-sm"><option value="ALL">All dates</option><option value="TODAY">Today</option><option value="LAST_7">Last 7 days</option><option value="THIS_MONTH">This month</option><option value="CUSTOM">Custom dates</option></select></div>{datePreset === "CUSTOM" && <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><label className="text-xs font-semibold text-slate-500">From <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="ml-2 rounded-lg border px-3 py-2 text-sm font-normal text-slate-900" /></label><label className="text-xs font-semibold text-slate-500">To <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="ml-2 rounded-lg border px-3 py-2 text-sm font-normal text-slate-900" /></label></div>}</div>
      {loading ? (
        <p className="p-12 text-center text-slate-500">Loading quotations...</p>
      ) : (
        <>
          <div className="grid gap-3 p-3 md:hidden">
            {visible.map((quotation) => {
              const customer = customerMap[quotation.customer];
              const property = propertyMap[quotation.property];
              const address = [property?.address, property?.city, property?.pincode]
                .filter(Boolean)
                .join(", ");
              return (
                <button
                  type="button"
                  key={quotation.id}
                  onClick={() => navigate(`/quotations/${quotation.id}`)}
                  className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-400">
                        {quotation.quotation_number}
                      </p>
                      <h2 className="mt-1 truncate text-base font-bold text-slate-950">
                        {customer?.name || "Customer"}
                      </h2>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${colors[quotation.status] || "bg-slate-100"}`}>
                      {quotation.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-3 rounded-xl bg-slate-50 p-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Property</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-700">
                        {property?.name || address || "Property not specified"}
                      </p>
                      {property?.name && address && (
                        <p className="mt-0.5 truncate text-xs text-slate-500">{address}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Quotation value</p>
                      <p className="mt-1 whitespace-nowrap text-base font-extrabold text-slate-950">
                        {money(quotation.grand_total)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-slate-500">{quotation.quotation_date}</span>
                    <span className="font-bold text-blue-700">View quotation →</span>
                  </div>
                </button>
              );
            })}
            {!visible.length && (
              <p className="p-10 text-center text-sm text-slate-500">No quotations found.</p>
            )}
          </div>
          <div className="hidden overflow-x-auto md:block" data-mobile-table="keep">
            <table className="w-full min-w-[1040px] table-fixed text-left text-sm">
              <colgroup><col className="w-[6%]" /><col className="w-[12%]" /><col className="w-[19%]" /><col className="w-[17%]" /><col className="w-[24%]" /><col className="w-[11%]" /><col className="w-[11%]" /></colgroup>
              <thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">SL No.</th><SortHead title="Date" name="date" sort={sort} change={changeSort} /><SortHead title="Quotation no." name="number" sort={sort} change={changeSort} /><SortHead title="Customer name" name="customer" sort={sort} change={changeSort} /><SortHead title="Address" name="address" sort={sort} change={changeSort} /><SortHead title="Status" name="status" sort={sort} change={changeSort} /><SortHead title="Amount" name="amount" sort={sort} change={changeSort} right /></tr></thead>
              <tbody className="divide-y">{visible.map((quotation, index) => { const customer = customerMap[quotation.customer]; const property = propertyMap[quotation.property]; return <tr key={quotation.id} tabIndex="0" onClick={() => navigate(`/quotations/${quotation.id}`)} onKeyDown={(event) => { if (event.key === "Enter") navigate(`/quotations/${quotation.id}`); }} className="cursor-pointer transition odd:bg-white even:bg-slate-50/70 hover:!bg-blue-50"><td className="px-4 py-4 font-bold tabular-nums text-slate-400">{index + 1}</td><td className="px-4 py-4">{quotation.quotation_date}</td><td className="px-4 py-4 font-bold text-slate-950">{quotation.quotation_number}</td><td className="px-4 py-4 font-semibold">{customer?.name || "Customer"}</td><td className="px-4 py-4 text-slate-600">{[property?.address, property?.city, property?.pincode].filter(Boolean).join(", ") || property?.name || "—"}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors[quotation.status] || "bg-slate-100"}`}>{quotation.status.replaceAll("_", " ")}</span></td><td className="px-4 py-4 text-right font-bold tabular-nums">{money(quotation.grand_total)}</td></tr>; })}{!visible.length && <tr><td colSpan="7" className="p-12 text-center text-slate-500">No quotations found.</td></tr>}</tbody>
            </table>
          </div>
        </>
      )}
    </section>
  </div>;
}

function SortHead({ title, name, sort, change, right }) {
  return <th className={`px-4 py-3 ${right ? "text-right" : "text-left"}`}><button type="button" onClick={() => change(name)} className={`inline-flex items-center gap-1.5 ${right ? "w-full justify-end" : ""}`}>{title}<ArrowUpDown className={`h-3.5 w-3.5 ${sort.key === name ? "text-slate-950" : "text-slate-400"}`} /></button></th>;
}
