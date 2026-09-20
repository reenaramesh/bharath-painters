import { useCallback, useEffect, useState } from "react";
import { Copy, MessageCircle, Search, Trash2, UserPlus, Users, X } from "lucide-react";
import api from "../api/client";
import { Link } from "react-router-dom";
import Person from "../components/ApplicatorPerson";

export default function ApplicatorTeam() {
  const [team, setTeam] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [credentials, setCredentials] = useState(null);

  const load = useCallback(async () => {
    try {
      const teamResponse = await api.get("/jobs/my-team/");
      setTeam(teamResponse.data || []);
      setError("");
    } catch (err) { setError(readError(err, "Paint Applicator team could not be loaded.")); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(member) {
    if (!confirm(`Remove ${member.name} from your team? Existing job assignments will remain unchanged.`)) return;
    setSaving(member.id);
    try { await api.delete(`/jobs/my-team/${member.membership_id}/`); await load(); }
    catch (err) { setError(readError(err, "Team member could not be removed.")); }
    finally { setSaving(null); }
  }

  async function createApplicator(form) {
    setSaving("create");
    try {
      const { data } = await api.post("/jobs/my-team/create-applicator/", form);
      setShowCreate(false); setCredentials(data.credentials); await load();
    } catch (err) { setError(readError(err, "Paint Applicator account could not be created.")); }
    finally { setSaving(null); }
  }

  return <div className="space-y-6"><header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-amber-600">Applicator registration</p><h1 className="mt-1 text-3xl font-bold">Register Applicator</h1><p className="mt-2 text-slate-500">Register applicators, create their login credentials and manage the registered list.</p></div><button onClick={() => setShowCreate(true)} className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"><UserPlus className="h-4 w-4" />Register New Applicator</button></header>
    {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <Link to="/find-painter" className="flex items-center gap-2 rounded-2xl border bg-white p-5 font-semibold"><Search className="h-5 w-5" />Find Painter</Link>
    <section className="overflow-hidden rounded-2xl border bg-white"><header className="flex items-center justify-between border-b p-5"><div><h2 className="font-bold">Registered Applicators</h2><p className="mt-1 text-sm text-slate-500">Available for selection during work assignment.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold">{team.length}</span></header>{team.length ? <div className="divide-y">{team.map((item) => <Person key={item.membership_id} item={item} action={<button disabled={saving === item.id} onClick={() => remove(item)} className="rounded-xl border border-red-200 p-3 text-red-600 disabled:opacity-50" title="Remove from team"><Trash2 className="h-4 w-4" /></button>} />)}</div> : <div className="p-14 text-center text-slate-400"><Users className="mx-auto h-10 w-10" /><p className="mt-3">No applicators registered yet.</p></div>}</section>
    {showCreate && <CreateApplicator saving={saving === "create"} onClose={() => setShowCreate(false)} onSubmit={createApplicator} />}
    {credentials && <Credentials credentials={credentials} onClose={() => setCredentials(null)} />}
  </div>;
}

function CreateApplicator({ saving, onClose, onSubmit }) { const initial = { name: "", mobile: "", email: "", password: "", experience_years: 0, skills: "", preferred_locations: "", daily_wage: "", weekly_wage: "", willing_to_travel: false, emergency_contact_name: "", emergency_contact_number: "", upi_id: "" }; const [form, setForm] = useState(initial); const input = "mt-2 w-full rounded-xl border px-3 py-3 font-normal"; const field = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) }); return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6"><div className="flex justify-between"><div><h2 className="text-xl font-bold">Register Paint Applicator</h2><p className="mt-1 text-sm text-slate-500">The account will be verified and added directly to your team.</p></div><button type="button" onClick={onClose}><X /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Full name"><input required {...field("name")} className={input} /></Field><Field label="Mobile number"><input required {...field("mobile")} className={input} /></Field><Field label="Email"><input type="email" {...field("email")} className={input} /></Field><Field label="Login password"><input type="text" minLength="8" {...field("password")} placeholder="Leave blank to generate" className={input} /></Field><Field label="Experience in years"><input type="number" min="0" {...field("experience_years")} className={input} /></Field><Field label="Preferred locations"><input required {...field("preferred_locations")} placeholder="HAL, Bengaluru" className={input} /></Field><Field label="Daily wage"><input type="number" min="0" {...field("daily_wage")} className={input} /></Field><Field label="Weekly wage"><input type="number" min="0" {...field("weekly_wage")} className={input} /></Field><Field label="Skills" wide><textarea required rows="3" {...field("skills")} placeholder="Interior, exterior, texture, enamel, polish..." className={input} /></Field><Field label="Emergency contact name"><input {...field("emergency_contact_name")} className={input} /></Field><Field label="Emergency contact mobile"><input {...field("emergency_contact_number")} className={input} /></Field><Field label="UPI ID"><input {...field("upi_id")} className={input} /></Field><label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold"><input type="checkbox" checked={form.willing_to_travel} onChange={(e) => setForm({ ...form, willing_to_travel: e.target.checked })} />Willing to travel</label></div><button disabled={saving} className="mt-6 w-full rounded-xl bg-slate-950 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Creating account..." : "Register Applicator"}</button></form></div>; }
function Credentials({ credentials, onClose }) { const message = `Bharath Painters Paint Applicator login\nName: ${credentials.name}\nMobile: ${credentials.mobile}\nPassword: ${credentials.password}\nBharath ID: ${credentials.bharath_id}\nLogin: ${window.location.origin}/login`; const copy = () => navigator.clipboard.writeText(message); return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-6"><div className="flex justify-between"><div><h2 className="text-xl font-bold">Account created successfully</h2><p className="mt-1 text-sm text-slate-500">Share these credentials securely. The password is shown here once.</p></div><button onClick={onClose}><X /></button></div><div className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 text-sm"><p>Name: <b>{credentials.name}</b></p><p>Mobile: <b>{credentials.mobile}</b></p><p>Password: <b>{credentials.password}</b></p><p>Bharath ID: <b>{credentials.bharath_id}</b></p></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><button onClick={copy} className="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-semibold"><Copy className="h-4 w-4" />Copy credentials</button><a href={`https://wa.me/91${credentials.mobile}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white"><MessageCircle className="h-4 w-4" />Send WhatsApp</a></div></div></div>; }
function Field({ label, wide, children }) { return <label className={`text-sm font-semibold ${wide ? "sm:col-span-2" : ""}`}>{label}{children}</label>; }
function readError(error, fallback) { const data = error.response?.data; return data?.detail || Object.values(data || {}).flat().join(" ") || fallback; }
