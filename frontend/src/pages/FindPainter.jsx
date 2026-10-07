import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import api from "../api/client";
import Person from "../components/ApplicatorPerson";

export default function FindPainter() {
  const [team, setTeam] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(null);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [teamResponse, directoryResponse] = await Promise.all([api.get("/jobs/my-team/"), api.get("/accounts/painters/")]);
      setTeam(teamResponse.data || []);
      setDirectory(directoryResponse.data.results || directoryResponse.data || []);
      setError("");
    } catch (err) { setError(readError(err, "Painters could not be loaded.")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const teamIds = useMemo(() => new Set(team.map((item) => item.id)), [team]);
  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return directory.filter((item) => !teamIds.has(item.id) && [item.name, item.bharath_id, item.skills, item.preferred_locations, item.mobile].some((value) => String(value || "").toLowerCase().includes(term)));
  }, [directory, search, teamIds]);

  async function add(painter) {
    setSaving(painter.id);
    setSuccess("");
    try { await api.post("/jobs/my-team/", { painter_id: painter.id }); setSearch(""); await load(); setSuccess(`${painter.name} added to your team.`); }
    catch (err) { setError(readError(err, "Paint Applicator could not be added.")); }
    finally { setSaving(null); }
  }

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold text-amber-600">Verified workforce</p><h1 className="mt-1 text-3xl font-bold">Find Painter</h1></div>
      <Link to="/applicator-team" className="rounded-xl border bg-white px-5 py-3 text-sm font-semibold">View registered applicators</Link>
    </header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error} <button onClick={load} className="ml-2 font-bold">Retry</button></p>}
    {success && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{success}</p>}
    {loading ? <p className="p-8 text-center text-slate-500">Loading painters...</p> : <>
    <section className="rounded-2xl border bg-white p-5"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white"><Search className="h-5 w-5" /></span><div><h2 className="font-bold">Find verified Paint Applicators</h2></div></div><label className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3"><Search className="h-4 w-4 text-slate-400" /><input aria-label="Search painters" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Example: HAL, Bengaluru, texture painting" className="w-full bg-transparent text-sm outline-none" /></label>{search && <div className="mt-3 max-h-72 divide-y overflow-y-auto rounded-xl border">{results.length ? results.map((item) => <Person key={item.id} item={item} action={<button disabled={saving !== null} onClick={() => add(item)} className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Add to team</button>} />) : <p className="p-6 text-center text-sm text-slate-400">No matching verified Paint Applicators found.</p>}</div>}</section>
    {!search.trim() && null}
    </>}
  </div>;
}
function readError(error, fallback) { return Object.values(error.response?.data || {}).flat().join(" ") || fallback; }
