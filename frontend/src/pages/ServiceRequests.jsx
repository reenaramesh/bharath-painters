import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarPlus, ClipboardList, MapPin, Phone, Plus, Search, UserPlus, X } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";

const statuses = ["NEW", "REVIEWING", "SITE_VISIT", "QUOTATION", "ACCEPTED", "COMPLETED", "CANCELLED"];
const empty = { customer: "", service_type: "", title: "", description: "", preferred_date: "", address: "" };

export default function ServiceRequests() {
  const { user } = useAuth();
  const isCustomer = user?.role === "CUSTOMER";
  const [requests, setRequests] = useState([]);
  const [options, setOptions] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [schedule, setSchedule] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({ follow_up_type: "CALL", next_follow_up: "", comment: "" });

  const load = useCallback(async () => {
    try {
      const calls = [api.get("/quotations/service-requests/", { params: { search: search || undefined, status: status || undefined } })];
      if (isCustomer) calls.push(api.get("/quotations/service-requests/options/"));
      const [requestResponse, optionResponse] = await Promise.all(calls);
      setRequests(requestResponse.data);
      if (optionResponse) setOptions(optionResponse.data);
      setError("");
      window.dispatchEvent(new Event("portal-counts-changed"));
    } catch {
      setError("Service requests could not be loaded.");
    }
  }, [isCustomer, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedContractor = useMemo(() => options.find((item) => String(item.customer) === String(form.customer)), [form.customer, options]);

  function chooseContractor(value) {
    const option = options.find((item) => String(item.customer) === value);
    setForm({ ...empty, customer: value, address: option?.default_address || "" });
  }

  async function createRequest(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/quotations/service-requests/", form);
      setRequests((current) => [data, ...current]);
      setShowForm(false);
      setForm(empty);
      setError("");
    } catch (requestError) {
      setError(Object.values(requestError.response?.data || {}).flat().join(" ") || "Service request could not be submitted.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(item, value) {
    try {
      const { data } = await api.patch(`/quotations/service-requests/${item.id}/`, { status: value });
      setRequests((current) => current.map((request) => request.id === data.id ? data : request));
    } catch {
      setError("Request status could not be updated.");
    }
  }

  async function addAsLead(item) {
    if (item.lead_id) window.location.assign("/leads");
    else setError("This request is still being synchronized with the Leads module.");
  }

  function openSchedule(item) {
    setSchedule(item);
    setScheduleForm({ follow_up_type: "CALL", next_follow_up: "", comment: `Follow up for: ${item.title}` });
  }

  async function saveSchedule(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const requestStatus = scheduleForm.follow_up_type === "SITE_VISIT" ? "SITE_VISIT" : "REVIEWING";
      await Promise.all([
        api.post(`/quotations/customers/${schedule.customer}/follow-ups/`, { ...scheduleForm, next_follow_up: scheduleForm.next_follow_up || null }),
        api.patch(`/quotations/service-requests/${schedule.id}/`, { status: requestStatus }),
      ]);
      setRequests((current) => current.map((request) => request.id === schedule.id ? { ...request, status: requestStatus } : request));
      setSchedule(null);
      setError("");
    } catch (requestError) {
      setError(Object.values(requestError.response?.data || {}).flat().join(" ") || "The follow-up could not be scheduled.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-6"><header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-amber-600">Painting services</p><h1 className="mt-1 text-3xl font-bold">Service requests</h1><p className="mt-2 text-slate-500">{isCustomer ? "Request a new painting service and track its progress." : "Review and manage requests raised by your customers."}</p></div>{isCustomer && <button onClick={() => setShowForm(true)} className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"><Plus className="h-4 w-4" />New request</button>}</header>{error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}<section className="overflow-hidden rounded-2xl border bg-white"><div className="flex flex-col gap-3 border-b p-4 sm:flex-row"><label className="flex flex-1 items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, mobile or service" className="w-full bg-transparent text-sm outline-none" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border px-4 py-2.5 text-sm"><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></div>{requests.length ? <div className="divide-y">{requests.map((item) => <article key={item.id} className="p-5"><div className="flex flex-col gap-4 md:flex-row md:items-start"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100"><ClipboardList className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{item.service_name || item.title}</h2><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{item.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-sm text-slate-500">{isCustomer ? item.contractor_name : `${item.customer_name} · ${item.customer_mobile}`}</p>{item.description && <p className="mt-3 text-sm text-slate-600">{item.description}</p>}<div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">{item.preferred_date && <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Preferred: {item.preferred_date}</span>}{item.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.address}</span>}</div>{!isCustomer && <div className="mt-4 flex flex-wrap gap-2"><a href={`tel:${item.customer_mobile}`} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><Phone className="h-4 w-4" />Call</a><button disabled={saving} onClick={() => addAsLead(item)} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><UserPlus className="h-4 w-4" />Add as lead</button><button onClick={() => openSchedule(item)} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><CalendarPlus className="h-4 w-4" />Schedule</button></div>}</div>{isCustomer ? item.status !== "COMPLETED" && item.status !== "CANCELLED" && <button onClick={() => updateStatus(item, "CANCELLED")} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600">Cancel</button> : <select value={item.status} onChange={(event) => updateStatus(item, event.target.value)} className="rounded-xl border px-3 py-2.5 text-sm font-semibold">{statuses.map((value) => <option key={value}>{value}</option>)}</select>}</div></article>)}</div> : <div className="p-14 text-center text-slate-400"><ClipboardList className="mx-auto h-10 w-10" /><p className="mt-3 text-sm">No service requests found.</p></div>}</section>{showForm && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><form onSubmit={createRequest} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="flex justify-between"><div><h2 className="text-xl font-bold">New service request</h2><p className="mt-1 text-sm text-slate-500">Tell your contractor what work you need.</p></div><button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-2"><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Contractor"><select required value={form.customer} onChange={(event) => chooseContractor(event.target.value)} className={input}><option value="">Select contractor</option>{options.map((item) => <option key={item.customer} value={item.customer}>{item.contractor_name}</option>)}</select></Field><Field label="Service"><select value={form.service_type} onChange={(event) => setForm({ ...form, service_type: event.target.value, title: selectedContractor?.services.find((service) => String(service.id) === event.target.value)?.name || form.title })} className={input}><option value="">Other service</option>{selectedContractor?.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></Field><Field label="Request title"><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={input} /></Field><Field label="Preferred date"><input type="date" value={form.preferred_date} onChange={(event) => setForm({ ...form, preferred_date: event.target.value })} className={input} /></Field><Field label="Work address" wide><textarea rows="2" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className={input} /></Field><Field label="Describe the work" wide><textarea rows="4" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={input} /></Field></div><button disabled={saving} className="mt-6 w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Submitting..." : "Submit request"}</button></form></div>}{schedule && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><form onSubmit={saveSchedule} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"><div className="flex justify-between"><div><h2 className="text-xl font-bold">Schedule customer follow-up</h2><p className="mt-1 text-sm text-slate-500">{schedule.customer_name} · {schedule.title}</p></div><button type="button" onClick={() => setSchedule(null)}><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Activity"><select value={scheduleForm.follow_up_type} onChange={(e) => setScheduleForm({ ...scheduleForm, follow_up_type: e.target.value })} className={input}><option value="CALL">Callback</option><option value="SITE_VISIT">Site visit</option><option value="MEETING">Meeting</option><option value="WHATSAPP">WhatsApp</option></select></Field><Field label="Date and time"><input required type="datetime-local" value={scheduleForm.next_follow_up} onChange={(e) => setScheduleForm({ ...scheduleForm, next_follow_up: e.target.value })} className={input} /></Field><Field label="Task note" wide><textarea rows="3" required value={scheduleForm.comment} onChange={(e) => setScheduleForm({ ...scheduleForm, comment: e.target.value })} className={input} /></Field></div><button disabled={saving} className="mt-6 w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white">{saving ? "Scheduling..." : "Create scheduled task"}</button></form></div>}</div>;
}

const input = "mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-slate-900";
function Field({ label, wide, children }) { return <label className={`text-sm font-semibold text-slate-700 ${wide ? "sm:col-span-2" : ""}`}>{label}{children}</label>; }
