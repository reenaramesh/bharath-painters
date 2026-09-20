import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Search } from "lucide-react";
import api from "../api/client";

export default function CompletedWork() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/jobs/work-schedules/")
      .then(({ data }) => {
        setItems(data.filter((item) => item.status === "COMPLETED"));
        setError("");
      })
      .catch(() => setError("Completed work could not be loaded."));
  }, []);

  const visible = useMemo(
    () => items.filter((item) =>
      [item.quotation_number, item.customer, item.property, item.contractor]
        .some((value) => String(value || "").toLowerCase().includes(search.toLowerCase())),
    ),
    [items, search],
  );

  return <div className="space-y-6">
    <header><p className="text-sm font-semibold text-amber-600">Project planning</p><h1 className="mt-1 text-3xl font-bold">Completed work</h1><p className="mt-2 text-slate-500">Finished projects, work dates and assigned Paint Applicators.</p></header>
    {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <section className="overflow-hidden rounded-2xl border bg-white">
      <div className="border-b p-4"><label className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3"><Search className="h-4 w-4 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quotation, customer, contractor or property" className="w-full bg-transparent text-sm outline-none"/></label></div>
      {visible.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Quotation</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Property</th><th className="px-5 py-3">Work dates</th><th className="px-5 py-3">Completed on</th><th className="px-5 py-3">Paint Applicators</th></tr></thead><tbody className="divide-y">{visible.map((item) => <tr key={item.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-bold">{item.quotation_number}</td><td className="px-5 py-4 font-semibold">{item.customer}</td><td className="px-5 py-4 text-slate-600">{item.property}</td><td className="px-5 py-4" data-sort-value={item.start_date}>{item.start_date} to {item.end_date}</td><td className="px-5 py-4" data-sort-value={item.work_completed_at || ""}>{item.work_completed_at ? new Date(item.work_completed_at).toLocaleString("en-IN") : "-"}</td><td className="px-5 py-4">{item.painters.length ? item.painters.map((painter) => painter.name).join(", ") : "-"}</td></tr>)}</tbody></table></div> : <div className="p-14 text-center text-slate-400"><CalendarCheck className="mx-auto h-10 w-10"/><p className="mt-3">No completed work found.</p></div>}
    </section>
  </div>;
}
