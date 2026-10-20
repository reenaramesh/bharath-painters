import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, ChevronUp, IndianRupee, MapPin, MapPinned, Navigation, Phone, Play, ThumbsDown, ThumbsUp } from "lucide-react";
import api from "../api/client";
import { PageHeader } from "../components/ui";

const filters = ["ALL", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "DECLINED"];

export default function PainterAssignments() {
  const [items, setItems] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [employment, setEmployment] = useState(null);
  const [membershipId, setMembershipId] = useState("");
  const [attendance, setAttendance] = useState([]);
  const [attendanceNotice, setAttendanceNotice] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    const [scheduleResult, subcontractResult] = await Promise.allSettled([
      api.get("/jobs/my-assignments/"),
      api.get("/outsourcing/work-orders/my-assignments/"),
    ]);
    if (scheduleResult.status === "fulfilled") setItems(scheduleResult.value.data);
    if (subcontractResult.status === "fulfilled") setWorkOrders(subcontractResult.value.data);
    if (scheduleResult.status === "rejected" && subcontractResult.status === "rejected") setError("Assignments could not be loaded.");
    else setError("");
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/jobs/my-in-house-employment/").then(({ data }) => {
      setEmployment(data);
      setMembershipId(current => current || String(data.membership_id || ""));
    }).catch(() => setEmployment(null));
  }, []);
  useEffect(() => {
    if (!membershipId) return;
    let active = true;
    api.get(`/jobs/my-in-house-employment/?membership_id=${encodeURIComponent(membershipId)}`)
      .then(({ data }) => { if (active) { setEmployment(data); setAttendance(data.attendance || []); } })
      .catch(() => { if (active) setAttendance([]); });
    return () => { active = false; };
  }, [membershipId]);
  const visible = useMemo(() => items.filter(item => filter === "ALL" || item.status === filter), [items, filter]);

  async function checkIn(item) {
    if (!employment || String(employment.membership_id) !== membershipId || item.contractor_id !== employment.contractor_id) return;
    setSaving(`attendance-${item.id}`); setError(""); setAttendanceNotice("");
    try {
      const today = new Date().toLocaleDateString("en-CA");
      await api.post(`/jobs/in-house-applicators/${employment.membership_id}/attendance/`, { date: today, status: "PRESENT", schedule: item.schedule });
      setAttendanceNotice("Attendance submitted. Your contractor must approve it before it contributes to earnings.");
      const { data } = await api.get(`/jobs/my-in-house-employment/?membership_id=${employment.membership_id}`);
      setEmployment(data); setAttendance(data.attendance || []);
    } catch (err) {
      setError(Object.values(err.response?.data || {}).flat().join(" ") || "Attendance could not be submitted.");
    } finally { setSaving(null); }
  }

  async function progress(item, action) {
    const key = `schedule-${item.id}`;
    setSaving(key);
    try {
      await api.post(`/jobs/my-assignments/${item.id}/progress/`, { action });
      await load();
    } catch (err) {
      setError(Object.values(err.response?.data || {}).flat().join(" ") || "Work status could not be updated.");
    } finally { setSaving(null); }
  }

  async function respondToWorkOrder(item, action) {
    const key = `work-order-${item.id}`;
    setSaving(key);
    try {
      await api.post(`/outsourcing/work-orders/assignments/${item.id}/response/`, { action });
      await load();
    } catch (err) {
      setError(Object.values(err.response?.data || {}).flat().join(" ") || "Work status could not be updated.");
    } finally { setSaving(null); }
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Paint Applicator portal" title="My assignments" description="Respond to painting schedules and contractor work orders, then track your progress." actions={employment?.employments?.length > 1 ? <label className="text-sm font-semibold">Employer<select aria-label="Select employer attendance records" value={membershipId} onChange={event => setMembershipId(event.target.value)} className="ml-2 min-h-11 rounded-xl border px-3 py-2 bp-ui-control">{employment.employments.map(item => <option key={item.membership_id} value={item.membership_id}>{item.contractor_name}</option>)}</select></label> : null} />
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {attendanceNotice && <p role="status" aria-live="polite" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{attendanceNotice}</p>}
    {employment && <section className="rounded-2xl border bg-white p-5"><h2 className="font-bold bp-ui-section-heading">My attendance Â· {employment.contractor_name}</h2><div className="mt-3 divide-y">{attendance.slice(0, 12).map(row => <div key={row.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{row.date} Â· {row.status.replaceAll("_", " ")}</span><span className={row.approval_status === "APPROVED" ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>{row.approval_status === "APPROVED" ? "Approved" : row.approval_status === "REJECTED" ? "Rejected" : "Pending contractor approval"}</span></div>)}{!attendance.length && <p className="py-4 text-sm text-slate-500">No attendance submitted for this employer yet.</p>}</div></section>}
    <section aria-labelledby="schedule-assignments-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="schedule-assignments-heading" className="text-xl font-bold bp-ui-section-heading">Painting schedules</h2><p className="mt-1 text-sm text-slate-500">Respond to your assignment before starting work.</p></div>
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter painting schedule assignments">{filters.map(value => <button key={value} onClick={() => setFilter(value)} aria-pressed={filter === value} className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold bp-ui-action ${filter === value ? "bg-slate-950 text-white" : "border bg-white"}`}>{value.replaceAll("_", " ")} {value === "ALL" ? items.length : items.filter(item => item.status === value).length}</button>)}</div>
      </div>
      <div className="grid gap-4">{visible.length ? visible.map(item => <article key={item.id} className="overflow-hidden rounded-2xl border bg-white"><div className="p-4 sm:p-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold bp-ui-section-heading">{item.quotation_number} | {item.property_name}</h3><Status value={item.status}/></div><p className="mt-1 text-sm text-slate-500">Contractor: {item.contractor_name} | Customer: {item.customer_name}</p><div className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap sm:gap-5"><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0"/>{item.start_date} to {item.end_date}</span><span className="flex items-center gap-2"><IndianRupee className="h-4 w-4 shrink-0"/>{Number(item.agreed_wage||0).toLocaleString("en-IN")} / {item.wage_type.toLowerCase()}</span><span className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0"/><span>{[item.flat_number,item.block_name,item.address,item.city,item.pincode].filter(Boolean).join(", ")||"Location pending"}</span></span></div></div>
          <div className="flex flex-wrap gap-2">{item.contractor_mobile&&<a aria-label="Call contractor" href={`tel:${item.contractor_mobile}`} className="inline-flex min-h-11 items-center justify-center rounded-xl border px-3 bp-ui-icon-action"><Phone className="h-5 w-5"/></a>}{item.address&&<a href={directionsUrl(item)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700"><MapPinned className="h-4 w-4"/>Directions</a>}<button aria-expanded={expanded === `schedule-${item.id}`} onClick={() => setExpanded(expanded === `schedule-${item.id}` ? null : `schedule-${item.id}`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold bp-ui-action">Details {expanded === `schedule-${item.id}` ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}</button>
            {item.status === "ASSIGNED" && <><button disabled={saving === `schedule-${item.id}`} onClick={() => progress(item,"ACCEPT")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50 bp-ui-action"><ThumbsUp className="h-4 w-4"/>Accept</button><button disabled={saving === `schedule-${item.id}`} onClick={() => progress(item,"REJECT")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 disabled:opacity-50 bp-ui-action"><ThumbsDown className="h-4 w-4"/>Decline</button></>}
            {item.status === "ACCEPTED" && <><button disabled={saving === `schedule-${item.id}`||Boolean(item.on_the_way_at)} onClick={() => progress(item,"ON_THE_WAY")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-indigo-200 px-3 text-sm font-semibold text-indigo-700 disabled:opacity-50 bp-ui-action"><Navigation className="h-4 w-4"/>{item.on_the_way_at?"Customer notified":"On the way"}</button><button disabled={saving === `schedule-${item.id}`} onClick={() => progress(item,"START")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50 bp-ui-action"><Play className="h-4 w-4"/>Start</button></>}
            {item.status === "IN_PROGRESS" && <button disabled={saving === `schedule-${item.id}`} onClick={() => progress(item,"COMPLETE")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50 bp-ui-action"><CheckCircle2 className="h-4 w-4"/>Complete</button>}
            {employment && String(employment.membership_id) === membershipId && item.contractor_id === employment.contractor_id && item.status === "IN_PROGRESS" && <button disabled={saving === `attendance-${item.id}`} onClick={() => checkIn(item)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50 bp-ui-action">Submit today&apos;s attendance</button>}
          </div></div></div>{expanded === `schedule-${item.id}` && <WorkScope item={item}/>}</article>) : <p className="rounded-2xl border bg-white p-8 text-center text-slate-500">No painting schedules in this section.</p>}</div>
    </section>

    <section aria-labelledby="subcontract-assignments-heading" className="space-y-4"><div><h2 id="subcontract-assignments-heading" className="text-xl font-bold bp-ui-section-heading">Contractor work orders</h2><p className="mt-1 text-sm text-slate-500">Work assigned to you by your contractor.</p></div>
      <div className="grid gap-4">{workOrders.length ? workOrders.map(item => <article key={item.id} className="overflow-hidden rounded-2xl border bg-white"><div className="p-4 sm:p-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold bp-ui-section-heading">{item.reference} | {item.project_title}</h3><Status value={item.status}/></div><p className="mt-1 text-sm text-slate-500">Assigned by {item.contractor_name}</p><div className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap sm:gap-5">{(item.start_date||item.end_date)&&<span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0"/>{item.start_date||"Start date pending"} to {item.end_date||"End date pending"}</span>}<span className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0"/><span>{item.site_address||"Location pending"}</span></span></div></div><div className="flex flex-wrap gap-2">
            {item.status === "PROPOSED" && <><button disabled={saving === `work-order-${item.id}`} onClick={() => respondToWorkOrder(item,"ACCEPT")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50 bp-ui-action"><ThumbsUp className="h-4 w-4"/>Accept</button><button disabled={saving === `work-order-${item.id}`} onClick={() => respondToWorkOrder(item,"REJECT")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 disabled:opacity-50 bp-ui-action"><ThumbsDown className="h-4 w-4"/>Decline</button></>}
            {item.status === "ACCEPTED" && <button disabled={saving === `work-order-${item.id}`} onClick={() => respondToWorkOrder(item,"START")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50 bp-ui-action"><Play className="h-4 w-4"/>Start</button>}
            {item.status === "IN_PROGRESS" && <button disabled={saving === `work-order-${item.id}`} onClick={() => respondToWorkOrder(item,"COMPLETE")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50 bp-ui-action"><CheckCircle2 className="h-4 w-4"/>Complete</button>}
            <button aria-expanded={expanded === `work-order-${item.id}`} onClick={() => setExpanded(expanded === `work-order-${item.id}` ? null : `work-order-${item.id}`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold bp-ui-action">Details {expanded === `work-order-${item.id}` ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}</button>
          </div></div></div>{expanded === `work-order-${item.id}` && <WorkOrderScope item={item}/>}</article>) : <p className="rounded-2xl border bg-white p-8 text-center text-slate-500">No contractor work orders are assigned to you.</p>}</div>
    </section>
  </div>;
}

function directionsUrl(item){const destination=[item.property_name,item.flat_number,item.block_name,item.address,item.city,item.pincode,"India"].filter(Boolean).join(", ");const params=new URLSearchParams({api:"1",destination,travelmode:"driving",dir_action:"navigate"});return `https://www.google.com/maps/dir/?${params.toString()}`;}
function WorkScope({item}){return <section className="border-t bg-slate-50 p-4 sm:p-5"><h4 className="font-bold">Work to be completed</h4>{item.quotation_notes&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><b>Instruction:</b> {item.quotation_notes}</p>}<div className="mt-4 space-y-2">{item.work_scope?.map(line=><div key={line.id} className="rounded-xl border bg-white p-4"><div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-3"><b>{line.room}: {line.description}</b><span className="whitespace-nowrap text-sm font-semibold">{Number(line.quantity).toLocaleString("en-IN")} {line.unit}</span></div><p className="mt-1 text-sm text-slate-500">{[line.service,line.paint_type,line.paint_brand,line.color].filter(Boolean).join(" Â· ")||"Specification pending"}</p></div>)}</div></section>}
function WorkOrderScope({item}){return <section className="border-t bg-slate-50 p-4 sm:p-5"><h4 className="font-bold">Work details</h4>{item.instructions&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><b>Instructions:</b> {item.instructions}</p>}<div className="mt-4 space-y-2">{item.scope?.map(line=><div key={line.id} className="rounded-xl border bg-white p-4"><div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-3"><b>{line.title||line.description||"Work item"}</b><span className="whitespace-nowrap text-sm font-semibold">{Number(line.quantity).toLocaleString("en-IN")} {line.unit}</span></div>{line.title&&line.description&&<p className="mt-1 text-sm text-slate-500">{line.description}</p>}</div>)}</div></section>}
function Status({value}){const colors={ASSIGNED:"bg-blue-50 text-blue-700",PROPOSED:"bg-blue-50 text-blue-700",ACCEPTED:"bg-emerald-50 text-emerald-700",IN_PROGRESS:"bg-violet-50 text-violet-700",DECLINED:"bg-red-50 text-red-700",COMPLETED:"bg-emerald-50 text-emerald-700"};return <span className={`rounded-full px-3 py-1 text-xs font-bold ${colors[value]||"bg-slate-100 text-slate-700"}`}>{value.replaceAll("_"," ")}</span>}
