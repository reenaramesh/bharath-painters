import { useCallback, useEffect, useState } from "react";
import { Copy, MessageCircle, Search, UserPlus, Users } from "lucide-react";
import api from "../api/client";
import { Dialog } from "../components/ui/Dialog";
import { Button, PageHeader } from "../components/ui";
import { Link } from "react-router-dom";
import Person from "../components/ApplicatorPerson";
import useAuth from "../context/useAuth";
import { buildPainterWelcomeMessage, whatsappNumber } from "../utils/welcomeMessages";

export default function ApplicatorTeam() {
  const { user } = useAuth();
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

  async function createApplicator(form) {
    setSaving("create");
    try {
      const { data } = await api.post("/jobs/my-team/create-applicator/", form);
      setShowCreate(false); setCredentials(data.credentials); await load();
    } catch (err) { setError(readError(err, "Paint Applicator account could not be created.")); }
    finally { setSaving(null); }
  }

  return <div className="space-y-6"><PageHeader eyebrow="Painter network" title="Refer Painter" description="Review referred painter profiles and your existing team connections." actions={<Button onClick={() => setShowCreate(true)}><UserPlus className="h-4 w-4" aria-hidden="true"/>Refer Painter</Button>}/>
    {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <Link to="/applicator-bookings" className="flex items-center gap-2 rounded-2xl border bg-white p-5 font-semibold"><Search className="h-5 w-5" />Book Applicator</Link>
    <section className="overflow-hidden rounded-2xl border bg-white"><header className="flex items-center justify-between border-b p-5"><div><h2 className="font-bold bp-ui-section-heading">Referred Painters</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold">{team.length}</span></header>{team.length ? <div className="divide-y">{team.map((item) => <Person key={item.membership_id} item={item} showAvailability={false} />)}</div> : <div className="p-14 text-center text-slate-400"><Users className="mx-auto h-10 w-10" /><p className="mt-3">No painters referred yet.</p></div>}</section>
    {showCreate && <CreateApplicator saving={saving === "create"} error={error} onClose={() => setShowCreate(false)} onSubmit={createApplicator} />}
    {credentials && <Credentials credentials={credentials} contractor={user} onClose={() => setCredentials(null)} />}
  </div>;
}

function CreateApplicator({ saving, error, onClose, onSubmit }) { const initial = { name: "", mobile: "", email: "", password: "", experience_years: 0, skills: "", preferred_locations: "", daily_wage: "", weekly_wage: "", willing_to_travel: false, emergency_contact_name: "", emergency_contact_number: "", upi_id: "" }; const [form, setForm] = useState(initial); const input = "mt-2 w-full rounded-xl border px-3 py-3 font-normal"; const field = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) }); return <Dialog title="Refer Painter" icon={UserPlus} size="lg" onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-5">{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Full name"><input required {...field("name")} className={(input) + " bp-ui-control"} /></Field><Field label="Mobile number"><input required {...field("mobile")} className={(input) + " bp-ui-control"} /></Field><Field label="Email"><input type="email" {...field("email")} className={(input) + " bp-ui-control"} /></Field><Field label="Login password"><input type="text" minLength="8" {...field("password")} placeholder="Leave blank to generate" className={(input) + " bp-ui-control"} /></Field><Field label="Experience in years"><input type="number" min="0" {...field("experience_years")} className={(input) + " bp-ui-control"} /></Field><Field label="Preferred locations"><input required {...field("preferred_locations")} placeholder="HAL, Bengaluru" className={(input) + " bp-ui-control"} /></Field><Field label="Daily wage"><input type="number" min="0" {...field("daily_wage")} className={(input) + " bp-ui-control"} /></Field><Field label="Weekly wage"><input type="number" min="0" {...field("weekly_wage")} className={(input) + " bp-ui-control"} /></Field><Field label="Skills" wide><textarea required rows="3" {...field("skills")} placeholder="Interior, exterior, texture, enamel, polish..." className={(input) + " bp-ui-control"} /></Field><Field label="Emergency contact name"><input {...field("emergency_contact_name")} className={(input) + " bp-ui-control"} /></Field><Field label="Emergency contact mobile"><input {...field("emergency_contact_number")} className={(input) + " bp-ui-control"} /></Field><Field label="UPI ID"><input {...field("upi_id")} className={(input) + " bp-ui-control"} /></Field><label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold"><input type="checkbox" checked={form.willing_to_travel} onChange={(e) => setForm({ ...form, willing_to_travel: e.target.checked })} />Willing to travel</label></div><button disabled={saving} className="mt-6 w-full rounded-xl bg-slate-950 py-3 font-semibold text-white disabled:opacity-50 bp-ui-action">{saving ? "Creating profile..." : "Create Painter Profile"}</button></form></Dialog>; }
function Credentials({ credentials, contractor, onClose }) { const message = buildPainterWelcomeMessage(credentials, contractor); const copy = () => navigator.clipboard.writeText(message); return <Dialog title="Painter profile created" icon={Users} onClose={onClose}><div className="mt-5 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{message}</div><div className="mt-5 grid grid-cols-2 gap-3"><button onClick={copy} className="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-semibold bp-ui-action"><Copy className="h-4 w-4" />Copy</button><a href={`https://wa.me/${whatsappNumber(credentials.mobile)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white"><MessageCircle className="h-4 w-4" />WhatsApp</a></div><button onClick={onClose} className="mt-3 w-full rounded-xl border px-4 py-3 font-semibold bp-ui-action">Done</button></Dialog>; }
function Field({ label, wide, children }) { return <label className={`text-sm font-semibold ${wide ? "sm:col-span-2" : ""}`}>{label}{children}</label>; }
function readError(error, fallback) { const data = error.response?.data; return data?.detail || Object.values(data || {}).flat().join(" ") || fallback; }
