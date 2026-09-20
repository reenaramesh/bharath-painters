import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, BriefcaseBusiness, Eye, Pencil, Search } from "lucide-react";
import api from "../api/client";
import AdminDirectoryModal from "../components/AdminDirectoryModal";
import DirectoryPagination, { paginate } from "../components/DirectoryPagination";

export default function Contractors() {
  const [contractors, setContractors] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const load = useCallback(async () => { setLoading(true); try { const { data } = await api.get("/accounts/contractors/"); setContractors(data.results || data); setError(""); } catch { setError("Contractors could not be loaded."); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);
  const filtered = useMemo(() => { const term = search.toLowerCase(); return contractors.filter((item) => [item.company_name, item.owner_name, item.mobile, item.email, item.bharath_id, item.service_areas, item.office_address].some((value) => String(value || "").toLowerCase().includes(term))); }, [contractors, search]);
  const { pageRows, totalPages, safePage } = paginate(filtered, page, pageSize);
  useEffect(() => { if (safePage !== page) setPage(safePage); }, [page, safePage]);

  return <div className="space-y-6">
    <header><p className="text-sm font-semibold text-amber-600">Verified professionals</p><h1 className="mt-1 text-3xl font-bold">Contractors</h1><p className="mt-2 text-slate-500">View and manage all verified contractor profiles.</p></header>
    <section className="overflow-hidden rounded-2xl border bg-white">
      <div className="border-b p-4"><label className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company, owner, mobile, ID or service area" className="w-full bg-transparent text-sm outline-none" /></label></div>
      {error && <p className="p-6 text-red-700">{error}</p>}
      {loading ? <p className="p-12 text-center text-slate-500">Loading contractors...</p> : <ContractorTable rows={pageRows} select={setSelected} />}
      {!loading && <DirectoryPagination total={filtered.length} page={safePage} totalPages={totalPages} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />}
    </section>
    {selected && <AdminDirectoryModal type="contractors" item={selected.item} mode={selected.mode} close={() => setSelected(null)} saved={load} />}
  </div>;
}

function ContractorTable({ rows, select }) {
  const headers = ["Company", "Owner", "Bharath ID", "Contact", "Experience", "Applicators", "Service areas", "Office address", "Actions"];
  return <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left text-sm"><thead className="bg-slate-950 text-xs uppercase text-white"><tr>{headers.map((label) => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y">{rows.length ? rows.map((item) => <tr key={item.id} className="hover:bg-slate-50"><td className="px-4 py-3"><div className="flex items-center gap-3">{item.company_logo ? <img src={item.company_logo} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-950 text-white"><BriefcaseBusiness className="h-4 w-4" /></span>}<span className="flex items-center gap-1.5 font-semibold">{item.company_name}<BadgeCheck className="h-4 w-4 text-blue-600" /></span></div></td><Cell>{item.owner_name || "—"}</Cell><Cell strong>{item.bharath_id || "—"}</Cell><Cell><p>{item.mobile || "—"}</p><p className="text-xs text-slate-500">{item.email || "—"}</p></Cell><Cell>{item.years_in_business || 0} years</Cell><Cell>{item.number_of_painters || 0}</Cell><Cell wrap>{item.service_areas || "—"}</Cell><Cell wrap>{item.office_address || "—"}</Cell><td className="whitespace-nowrap px-4 py-3"><button onClick={() => select({ item, mode: "view" })} className="mr-2 inline-flex items-center gap-1 rounded-lg border px-3 py-2 font-semibold"><Eye className="h-4 w-4" />View</button><button onClick={() => select({ item, mode: "edit" })} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-2 font-semibold text-white"><Pencil className="h-4 w-4" />Edit</button></td></tr>) : <tr><td colSpan="9" className="p-12 text-center text-slate-400">No verified contractors found.</td></tr>}</tbody></table></div>;
}
function Cell({ children, strong, wrap }) { return <td className={`px-4 py-3 ${strong ? "font-semibold text-blue-700" : ""} ${wrap ? "max-w-xs whitespace-normal" : "whitespace-nowrap"}`}>{children}</td>; }
