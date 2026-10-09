import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Eye, Palette, Pencil, Search } from "lucide-react";
import api from "../api/client";
import AdminDirectoryModal from "../components/AdminDirectoryModal";
import DirectoryPagination, { paginate } from "../components/DirectoryPagination";
import "./admin-directory.css";
import { profileImageStyle } from "../utils/profileImagePosition";

const availabilityColors = { AVAILABLE: "bg-emerald-50 text-emerald-700", BUSY: "bg-amber-50 text-amber-700", OFFLINE: "bg-slate-100 text-slate-600" };

export default function Painters() {
  const [painters, setPainters] = useState([]);
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
   const load = useCallback(async () => { setLoading(true); try { const { data } = await api.get("/accounts/painters/"); setPainters(data.results || data); setError(""); } catch { setError("Employees could not be loaded."); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, availability]);
  const filtered = useMemo(() => { const term = search.toLowerCase(); return painters.filter((item) => (availability === "ALL" || item.availability === availability) && [item.name, item.mobile, item.email, item.bharath_id, item.skills, item.preferred_locations].some((value) => String(value || "").toLowerCase().includes(term))); }, [painters, search, availability]);
  const { pageRows, totalPages, safePage } = paginate(filtered, page, pageSize);
  useEffect(() => { if (safePage !== page) setPage(safePage); }, [page, safePage]);

  return <div className="admin-people-directory space-y-4">
     <header><p className="text-sm font-semibold text-amber-600">Verified workforce</p><h1 className="mt-1 text-3xl font-bold">Employees</h1></header>
    <section className="overflow-hidden rounded-2xl border bg-white">
      <div className="flex flex-col gap-3 border-b p-4 md:flex-row"><label className="flex flex-1 items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, mobile, ID, skill or location" className="w-full bg-transparent text-sm outline-none" /></label><select value={availability} onChange={(event) => setAvailability(event.target.value)} className="rounded-xl border px-4 py-2.5 text-sm"><option value="ALL">All availability</option><option value="AVAILABLE">Available</option><option value="BUSY">Busy</option><option value="OFFLINE">Offline</option></select></div>
      {error && <p className="p-6 text-red-700">{error}</p>}
       {loading ? <p className="p-12 text-center text-slate-500">Loading employees...</p> : <PainterTable rows={pageRows} select={setSelected} />}
      {!loading && <DirectoryPagination total={filtered.length} page={safePage} totalPages={totalPages} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />}
    </section>
    {selected && <AdminDirectoryModal type="applicators" item={selected.item} mode={selected.mode} close={() => setSelected(null)} saved={load} />}
  </div>;
}

function PainterTable({ rows, select }) {
  useEffect(() => {
    rows.forEach((item) => {
      const image = [...document.images].find((candidate) => candidate.src === item.profile_photo);
      if (image) Object.assign(image.style, profileImageStyle(item.profile_photo_position));
    });
  }, [rows]);
  const headers = ["Employee", "Bharath ID", "Contact", "Availability", "Skills", "Actions"];
  return <div className="overflow-x-auto"><table className="w-full min-w-[660px] text-left text-sm"><thead className="bg-slate-950 text-xs uppercase text-white"><tr>{headers.map((label) => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y">{rows.length ? rows.map((item) => <tr key={item.id} className="hover:bg-slate-50"><td className="px-4 py-3"><div className="admin-person-identity">{item.profile_photo ? <img src={item.profile_photo} alt={item.name} className="h-10 w-10 rounded-lg object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-950 text-white"><Palette className="h-4 w-4" /></span>}<span className="flex items-center gap-1.5 font-semibold">{item.name}<BadgeCheck className="h-4 w-4 text-blue-600" /></span></div></td><Cell strong>{item.bharath_id || "—"}</Cell><Cell><p>{item.mobile || "—"}</p><p className="text-xs text-slate-500">{item.email || "—"}</p></Cell><Cell><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${availabilityColors[item.availability] || availabilityColors.OFFLINE}`}>{item.availability || "OFFLINE"}</span></Cell><Cell wrap>{item.skills || "—"}</Cell><td className="whitespace-nowrap px-4 py-3"><button onClick={() => select({ item, mode: "view" })} className="mr-2 inline-flex items-center gap-1 rounded-lg border px-3 py-2 font-semibold"><Eye className="h-4 w-4" />View</button><button onClick={() => select({ item, mode: "edit" })} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-2 font-semibold text-white"><Pencil className="h-4 w-4" />Edit</button></td></tr>) : <tr><td colSpan="6" className="p-12 text-center text-slate-400">No verified Paint Applicators found.</td></tr>}</tbody></table></div>;
}
function Cell({ children, strong, wrap }) { return <td className={`px-4 py-3 ${strong ? "font-semibold text-blue-700" : ""} ${wrap ? "max-w-xs whitespace-normal" : "whitespace-nowrap"}`}>{children}</td>; }
