import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import api from "../api/client";

const emptyDraft = { title: "", apartment_community: "", location: "", address: "", pincode: "", description: "", work_completed: "", completed_on: "", photo: null };
const input = "mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 outline-none focus:border-[#176b9b]";

export default function ContractorCompletedProjects() {
  const [projects, setProjects] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [mapLink, setMapLink] = useState("");
  const [mapResult, setMapResult] = useState(null);
  const [mapLoading, setMapLoading] = useState(false);

  async function lookUpMap() {
    setMapLoading(true); setMapResult(null); setError("");
    try {
      const { data } = await api.post("/accounts/profile-card/projects/map-lookup/", { url: mapLink.trim() });
      setMapResult(data);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "The Maps address could not be fetched. Enter it manually.");
    } finally { setMapLoading(false); }
  }

  function useMapResult() {
    setDraft((current) => ({ ...current,
      apartment_community: mapResult.apartment_community || current.apartment_community,
      location: mapResult.city || current.location,
      address: mapResult.address || current.address,
      pincode: mapResult.pincode || current.pincode,
    }));
    setMapResult(null);
  }

  useEffect(() => {
    api.get("/accounts/profile-card/projects/")
      .then(({ data }) => setProjects(data))
      .catch(() => setError("Completed projects could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  async function addProject(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setError("");
    try {
      const payload = new FormData();
      ["title", "apartment_community", "location", "address", "pincode", "description", "work_completed", "completed_on"].forEach((field) => payload.append(field, draft[field]));
      if (draft.photo) payload.append("photo", draft.photo);
      const { data } = editingId
        ? await api.patch(`/accounts/profile-card/projects/${editingId}/`, payload, { headers: { "Content-Type": "multipart/form-data" } })
        : await api.post("/accounts/profile-card/projects/", payload, { headers: { "Content-Type": "multipart/form-data" } });
      setProjects((current) => editingId ? current.map((project) => project.id === editingId ? data : project) : [data, ...current]);
      setDraft(emptyDraft);
      setMapLink(""); setMapResult(null);
      setEditingId(null);
      form.reset();
    } catch (requestError) {
      setError(formatError(requestError.response?.data) || "Project could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProject(projectId) {
    setError("");
    try {
      await api.delete(`/accounts/profile-card/projects/${projectId}/`);
      setProjects((current) => current.filter((project) => project.id !== projectId));
    } catch (requestError) {
      setError(formatError(requestError.response?.data) || "Project could not be removed.");
    }
  }

  function editProject(project) {
    setDraft({ title: project.title || "", apartment_community: project.apartment_community || "", location: project.location || "", address: project.address || "", pincode: project.pincode || "", description: project.description || "", work_completed: project.work_completed || "", completed_on: project.completed_on || "", photo: null });
    setEditingId(project.id);
    document.getElementById("project-editor")?.scrollIntoView({ behavior: "smooth" });
  }

  return <div className="mx-auto max-w-4xl space-y-6 pb-8">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-[#176b9b]">Digital profile</p><h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Completed projects</h1></div>
      <Link to="/profile" className="rounded-xl border border-[#b9d1dc] px-4 py-2.5 text-sm font-bold text-[#1d5e7b]">View digital profile</Link>
    </div>

    <section className="rounded-2xl border bg-white p-5 sm:p-6">
      <h2 className="text-lg font-bold">Your projects</h2>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="mt-4 text-sm text-slate-500">Loading projects...</p> : <>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{projects.map((project) => <article key={project.id} className="flex gap-3 rounded-xl border p-3">{project.photo ? <img src={project.photo} alt={project.title} className="h-16 w-16 rounded-lg object-cover" /> : <span className="h-16 w-16 shrink-0 rounded-lg bg-slate-100" />}<div className="min-w-0 flex-1"><b className="block text-sm">{project.title}</b>{project.completed_on && <p className="mt-1 text-xs font-semibold text-slate-600">Completed on {new Date(project.completed_on).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</p>}{project.apartment_community && <p className="text-xs font-semibold text-[#1d5e7b]">{project.apartment_community}</p>}{project.address && <p className="mt-1 text-xs text-slate-500">{project.address}</p>}{project.location && <p className="text-xs text-slate-500">{project.location}{project.pincode ? ` · ${project.pincode}` : ""}</p>}{project.description && <p className="mt-1 text-xs text-slate-600">{project.description}</p>}{project.work_completed && <p className="mt-1 text-xs text-slate-700"><b>Work completed:</b> {project.work_completed}</p>}<button type="button" onClick={() => editProject(project)} className="mt-2 text-xs font-bold text-[#176b9b]">Edit details</button></div><button type="button" onClick={() => deleteProject(project.id)} aria-label={`Remove ${project.title}`} className="self-start rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></article>)}</div>
        {!projects.length && <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-slate-500">No completed projects added yet.</p>}
      </>}
    </section>

    <section id="project-editor" className="rounded-2xl border bg-white p-5 sm:p-6">
      <h2 className="text-lg font-bold">{editingId ? "Edit completed project" : "Add completed project"}</h2>
      <form onSubmit={addProject} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Project title *<input required maxLength="160" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Apartment repaint" className={input} /></label>
        <div className="rounded-xl border bg-slate-50 p-3 sm:col-span-2">
          <label className="text-sm font-medium">Google Maps place link (optional)<input type="url" value={mapLink} onChange={(event) => { setMapLink(event.target.value); setMapResult(null); }} placeholder="https://maps.app.goo.gl/..." className={input} /></label>
          <button type="button" disabled={!mapLink.trim() || mapLoading} onClick={lookUpMap} className="mt-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50">{mapLoading ? "Finding address..." : "Fetch address"}</button>
          {mapResult && <div className="mt-3 rounded-lg border bg-white p-3 text-sm"><p className="font-semibold">Check this location before using it</p><p className="mt-1">{mapResult.apartment_community || "Unnamed place"}</p><p className="text-slate-600">{mapResult.address}</p><p className="text-slate-600">{mapResult.city || "City missing"} · {mapResult.pincode || "PIN missing"}</p><button type="button" onClick={useMapResult} className="mt-2 rounded-lg bg-[#176b9b] px-3 py-2 font-semibold text-white">Use this address</button></div>}
          <p className="mt-2 text-xs text-slate-500">If Google Maps has no city or PIN, enter it below. Always check the address before saving.</p>
        </div>
        <label className="text-sm font-medium">Apartment / gated community (optional)<input maxLength="160" value={draft.apartment_community} onChange={(event) => setDraft((current) => ({ ...current, apartment_community: event.target.value }))} placeholder="Skyline Bagmane Champagne Hills" className={input} /></label>
        <label className="text-sm font-medium">City / location<input maxLength="160" value={draft.location} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} placeholder="Bangalore" className={input} /></label>
        <label className="text-sm font-medium sm:col-span-2">Site address<textarea rows="2" value={draft.address} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} placeholder="Building, street, area and PIN code" className={input} /></label>
        <label className="text-sm font-medium">PIN code<input inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={draft.pincode} onChange={(event) => setDraft((current) => ({ ...current, pincode: event.target.value.replace(/\D/g, "") }))} placeholder="560001" className={input} /></label>
        <label className="text-sm font-medium sm:col-span-2">Project details<textarea rows="2" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Brief description of the project" className={input} /></label>
        <label className="text-sm font-medium sm:col-span-2">Work completed<textarea rows="3" value={draft.work_completed} onChange={(event) => setDraft((current) => ({ ...current, work_completed: event.target.value }))} placeholder="Painting, waterproofing and finishing completed" className={input} /></label>
        <label className="text-sm font-medium">Completed on <span className="font-normal text-slate-400">(select date)</span><input type="date" value={draft.completed_on} onChange={(event) => setDraft((current) => ({ ...current, completed_on: event.target.value }))} className={input} /></label>
        <label className="text-sm font-medium sm:col-span-2">Project photo<input type="file" accept="image/*" onChange={(event) => setDraft((current) => ({ ...current, photo: event.target.files?.[0] || null }))} className="mt-2 block w-full text-sm" /></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2"><button disabled={saving} className="min-h-11 rounded-xl bg-[#176b9b] px-5 font-bold text-white disabled:opacity-50">{saving ? "Saving project..." : editingId ? "Save project changes" : "Add completed project"}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(emptyDraft); setMapLink(""); setMapResult(null); }} className="min-h-11 rounded-xl border px-5 font-bold text-slate-600">Cancel edit</button>}</div>
      </form>
    </section>
  </div>;
}

function formatError(data) {
  if (!data) return "";
  return Object.entries(data).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(" ") : typeof value === "object" ? JSON.stringify(value) : value}`).join(" ");
}
