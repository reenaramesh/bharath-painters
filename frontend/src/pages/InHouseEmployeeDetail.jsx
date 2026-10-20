import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../api/client";
import { PageHeader } from "../components/ui";
import "./painter-workspace-ui.css";
import { Attendance, Summary } from "./InHouseApplicators";
import EmployeeWages from "../components/EmployeeWages";
import useAuth from "../context/useAuth";
import EmployeeQuickActions from "../components/EmployeeQuickActions";
import AttendanceDateSelection from "../components/AttendanceDateSelection";
import { attendancePayload } from "../utils/employeeAttendance.js";
import { profileImageStyle } from "../utils/profileImagePosition";
import OfflineQueueStatus from "../components/OfflineQueueStatus";
import { enqueueOfflineOperation } from "../utils/offlineOperationQueue";
import EmployeeActivationAction, { EmployeeRegistrationBadge } from "../components/EmployeeActivationAction";
import { employeeRegistration } from "../utils/employeeAccount";

const currentMonth = new Date().toLocaleDateString("en-CA").slice(0, 7),
  today = new Date().toLocaleDateString("en-CA");
export default function InHouseEmployeeDetail({ employeeId: embeddedId, embedded = false, selectedMonth, onMonthChange } = {}) {
  const { id: routeId } = useParams();
  const id = embeddedId ?? routeId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === "CONTRACTOR";
  const [params] = useSearchParams();
  const section = params.get("section");
  const attendanceRef = useRef(null);
  const requestSequence = useRef(0);
  const [multiple, setMultiple] = useState(false);
  const [selectedDates, setSelectedDates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [data, setData] = useState(null),
    [month, setMonth] = useState(selectedMonth || params.get("month") || currentMonth),
    [editing, setEditing] = useState(false),
    [error, setError] = useState("");
  const [history, setHistory] = useState({ profile_changes: [], salary_changes: [] });
  const [attendance, setAttendance] = useState({
    date: today,
    status: "PRESENT",
    overtime_hours: "0",
    note: "",
    expected_marked_at: "",
  });
  const [bonus, setBonus] = useState({ date: today, amount: "", note: "" });
  useEffect(() => { if (selectedMonth && selectedMonth !== month) setMonth(selectedMonth); }, [selectedMonth, month]);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const [response, historyResponse] = await Promise.all([api.get(`/jobs/in-house-applicators/${id}/?month=${month}`), api.get(`/jobs/in-house-applicators/${id}/history/`)]);
      if (sequence === requestSequence.current) { setData(response.data); setHistory(historyResponse.data); setError(""); }
    } catch (e) {
      if (sequence === requestSequence.current) setError(e.response?.data?.detail || "Employee could not be loaded.");
    }
  }, [id, month]);
  useEffect(() => { setData(null); setEditing(false); }, [id]);
  useEffect(() => { if (params.get("edit") === "1") setEditing(true); }, [id, params]);
  useEffect(() => { setSelectedDates([]); }, [id, month]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);
  const membershipId = data?.membership_id;
  useEffect(() => {
    if (!membershipId) return;
    if (["attendance", "leaves"].includes(section)) {
      if (attendanceRef.current) attendanceRef.current.open = true;
      if (section === "leaves") setAttendance(current => ({ ...current, status: "LEAVE", overtime_hours: "0" }));
    }
    if (section) document.getElementById(`employee-${section === "leaves" ? "attendance" : section}`)?.scrollIntoView({ block: "start" });
  }, [section, membershipId]);
  async function save(form) {
    if (saving) return;
    setSaving(true);
    try {
      await api.patch(`/jobs/in-house-applicators/${id}/`, form);
      setEditing(false);
      await load();
    } catch (e) {
      setError(e.response?.data?.detail || "Profile could not be saved.");
    } finally { setSaving(false); }
  }
  async function mark(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setSuccess("");
    const payload = attendancePayload(attendance, multiple, selectedDates);
    if (multiple) payload.expected_versions = Object.fromEntries(selectedDates.flatMap(day => {
      const row = data?.attendance?.find(item => item.date === day);
      return row?.marked_at ? [[day, row.marked_at]] : [];
    }));
    else if (attendance.expected_marked_at) payload.expected_marked_at = attendance.expected_marked_at;
    const endpoint = `/jobs/in-house-applicators/${id}/attendance/`;
    try {
      if (navigator.onLine === false) throw Object.assign(new Error("offline"), { offlineQueue: true });
      await api.post(endpoint, payload);
      setSuccess(`Attendance saved for ${multiple ? selectedDates.length : 1} day${multiple && selectedDates.length !== 1 ? "s" : ""}.`);
      setSelectedDates([]);
      await load();
    } catch (err) {
      if (err.offlineQueue || !err.response) {
        try {
          const dates = multiple ? selectedDates : [attendance.date];
          await enqueueOfflineOperation({ actorId: user.id, kind: "attendance", endpoint, payload, reviewPath: `/in-house-applicators/${id}`, dedupeKey: `${id}:${dates.slice().sort().join(",")}` });
          setSuccess("Attendance saved on this device. It will sync when the app is online; contractor approval is still required.");
          return;
        } catch (queueError) {
          setError(queueError.message || "Attendance could not be saved offline.");
          return;
        }
      }
      setError(
        err.response?.data?.detail ||
          Object.values(err.response?.data || {})
            .flat()
            .join(" ") ||
          err.message || "Attendance could not be updated.",
      );
    } finally { setSaving(false); }
  }
  async function reviewAttendance(row, decision) {
    if (saving) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await api.post(`/jobs/in-house-applicators/${id}/attendance/${row.id}/review/`, { decision });
      setSuccess(`Attendance ${decision.toLowerCase()}.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Attendance review could not be saved.");
    } finally { setSaving(false); }
  }
  async function removeEmployee() {
    if (saving || !window.confirm(`Remove ${data.name} from the active employee list? Attendance, wages and the employee account will be kept. You can restore the employee from Edit profile.`)) return;
    setSaving(true); setError("");
    try { await api.patch(`/jobs/in-house-applicators/${id}/`, { is_active: false }); navigate("/in-house-applicators"); }
    catch (error) { setError(error.response?.data?.detail || "Employee could not be removed."); }
    finally { setSaving(false); }
  }
  async function addBonus(e) {
    e.preventDefault();
    if (saving) return false;
    setSaving(true);
    try {
      await api.post(`/jobs/in-house-applicators/${id}/ledger/`, {
        ...bonus,
        entry_type: "BONUS",
      });
      setBonus({ date: today, amount: "", note: "" });
      await load();
      return true;
    } catch (err) {
      setError(err.response?.data?.detail || "Bonus could not be added.");
      return false;
    } finally { setSaving(false); }
  }
  if (!data) return <p className="p-12 text-center">{error || "Loading..."}</p>;
  const attendanceView = embedded || (canManage && ["attendance", "leaves"].includes(section));
  const wagesView = canManage && section === "wages";
  const profileView = !embedded && (!section || section === "profile");
  return (
    <div className="employee-page space-y-6">
      {!embedded && <Link to="/in-house-applicators" className="inline-flex min-h-11 items-center text-sm text-slate-500">Back to employees</Link>}
      {!embedded && <PageHeader eyebrow={data.employee_code} title={data.name} description={<span>{data.mobile} / Joined {data.joined_on}</span>} actions={<>{canManage && profileView && <div className="flex flex-wrap gap-2"><button
          disabled={saving}
          onClick={() => setEditing(!editing)}
          className="rounded-xl border px-5 py-3 font-semibold bp-ui-action"
        >
          {editing ? "Cancel edit" : "Edit profile"}
        </button>{data.is_active !== false && <button type="button" disabled={saving} onClick={removeEmployee} className="min-h-11 rounded-xl border border-red-200 px-4 py-2.5 text-sm text-red-700 bp-ui-action">Delete employee</button>}</div>}</>} />}
      {!embedded && <EmployeeQuickActions employeeId={id} />}
      {(!section || attendanceView) && <OfflineQueueStatus actorId={user?.id} />}
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>
      )}
      {success && <p className="employee-success" role="status">{success}</p>}
      {profileView && (editing ? <Edit data={data} onSave={save} saving={saving} /> : <Profile data={data} activationAction={canManage && data.can_resend_activation ? <EmployeeActivationAction employee={data} onUpdated={load} /> : null} />)}
      {profileView && <ChangeHistory history={history} />}
      {(!section || attendanceView) && <details id="employee-attendance" ref={attendanceRef} open={attendanceView} className="group scroll-mt-20 overflow-hidden rounded-2xl border bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between p-5 font-bold hover:bg-slate-50">
          <span>Attendance entry and monthly summary</span>
          <span className="text-xl text-slate-400 transition-transform group-open:rotate-180">
            ⌄
          </span>
        </summary>
        <div className="border-t p-5">
          <h2 className="text-xl font-bold bp-ui-section-heading">Record attendance</h2>
          {canManage && data.is_active !== false && <>
          <label className="mt-4 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={multiple} onChange={event => setMultiple(event.target.checked)} />Record multiple days</label>
          <form onSubmit={mark} className="mt-4 grid gap-3 md:grid-cols-5">
            {!multiple && <label className="text-xs font-semibold text-slate-600">
              Date
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm bp-ui-control"
                type="date"
                max={today}
                value={attendance.date}
                onChange={(e) =>
                  setAttendance({ ...attendance, date: e.target.value })
                }
              />
            </label>}
            {multiple && <AttendanceDateSelection month={month} onMonthChange={setMonth} dates={selectedDates} onChange={setSelectedDates} records={data.attendance} disabled={saving} />}
            <label className="text-xs font-semibold text-slate-600">
              Attendance
              <select
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm bp-ui-control"
                value={attendance.status}
                onChange={(e) =>
                  setAttendance({ ...attendance, status: e.target.value })
                }
              >
                <option value="PRESENT">Full day Present</option>
                <option value="HALF_DAY">Half-day</option>
                <option value="ABSENT">Absent</option>
                <option value="LEAVE">Leave</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Overtime hours
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm bp-ui-control"
                type="number"
                min="0"
                max="24"
                step="0.5"
                value={attendance.overtime_hours}
                onChange={(e) =>
                  setAttendance({
                    ...attendance,
                    overtime_hours: e.target.value,
                  })
                }
                placeholder="0"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Note
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm bp-ui-control"
                maxLength={180}
                value={attendance.note}
                onChange={(e) =>
                  setAttendance({ ...attendance, note: e.target.value })
                }
                placeholder="Optional note"
              />
            </label>
            <button disabled={saving} className="self-end rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50 bp-ui-action">
              {saving ? "Saving..." : multiple ? "Save selected days" : "Update day"}
            </button>
          </form>
          </>}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <h3 className="font-bold">Monthly attendance summary</h3>
            <input
              type="month"
              max={currentMonth}
              value={month}
              onChange={(e) => { setMonth(e.target.value); onMonthChange?.(e.target.value); }}
              className="rounded-xl border px-4 py-3 bp-ui-control"
            />
          </div>
          <Summary data={data.attendance_summary} />
          {canManage && data.attendance.some(row => row.approval_status === "PENDING") && <section className="mt-5 space-y-2" aria-label="Attendance awaiting approval"><h3 className="font-bold">Painter submissions awaiting approval</h3>{data.attendance.filter(row => row.approval_status === "PENDING").map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm">{row.date} · {row.status.replaceAll("_", " ")}{row.note ? ` · ${row.note}` : ""}</p><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => reviewAttendance(row, "REJECTED")} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold">Reject</button><button type="button" disabled={saving} onClick={() => reviewAttendance(row, "APPROVED")} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white">Approve earning</button></div></div>)}</section>}
          {section === "leaves" && <section className="mt-4 rounded-xl border p-3"><h3 className="text-sm font-semibold">Leave records for {month}</h3>{data.attendance.filter(row => row.status === "LEAVE").map(row => <p key={row.id} className="border-b py-3 text-sm">{row.date} · {row.note || "Leave"}</p>)}{!data.attendance.some(row => row.status === "LEAVE") && <p className="mt-2 text-xs text-slate-500">No leave recorded for this month. Select Leave and choose the days above to record leave.</p>}</section>}
        </div>
      </details>}
      {(!section || wagesView) && <EmployeeWages data={data} onSaved={load} month={month} setMonth={setMonth} />}
      {canManage && (!section || section === "bonus") && <BonusForm
        saving={saving}
        value={bonus}
        setValue={setBonus}
        onSubmit={addBonus}
        bonuses={data.ledger.filter((x) => x.entry_type === "BONUS")}
        month={month}
        setMonth={setMonth}
      />}
      {(!section || attendanceView) && <Attendance
        rows={data.attendance}
        month={month}
        onSelect={canManage && data.is_active !== false ? (row) => {
          setMultiple(false);
          if (attendanceRef.current) attendanceRef.current.open = true;
          setAttendance({
            date: row.date,
            status: row.status,
            overtime_hours: String(row.overtime_hours || 0),
            note: row.note || "",
                    expected_marked_at: row.marked_at || "",
          });
          attendanceRef.current?.scrollIntoView({ block: "start" });
        } : undefined}
      />}
    </div>
  );
}
function Profile({ data, activationAction }) {
  const initials = String(data.name || "Employee").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const money = `₹${Number(data.salary_amount || 0).toLocaleString("en-IN")}`;
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="employee-profile-heading">
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-50/80 p-5 sm:p-7">
        {data.profile_photo ? <img src={data.profile_photo} alt={`${data.name} profile`} className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white" style={profileImageStyle(data.profile_photo_position)} /> : <div aria-hidden="true" className="grid h-20 w-20 place-items-center rounded-2xl bg-blue-100 text-2xl font-bold text-blue-800 ring-4 ring-white">{initials}</div>}
        <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Employee profile</p><h2 id="employee-profile-heading" className="mt-1 text-2xl font-bold text-slate-950 bp-ui-section-heading">{data.name}</h2><p className="mt-1 text-sm text-slate-600">{[data.trade, data.job_title].filter(Boolean).join(" · ") || "Work details not added"}</p></div>
        <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${data.is_active === false ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-800"}`}>{data.is_active === false ? "Removed" : "Active employee"}</span><EmployeeRegistrationBadge employee={data} /><span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">ID · {data.employee_code || "Not assigned"}</span></div>
      </div>
      <div className="grid gap-x-10 gap-y-8 p-5 sm:grid-cols-2 sm:p-7">
        <ProfileGroup title="Work details">
          <ProfileValue label="Trade" value={data.trade} />
          <ProfileValue label="Job title" value={data.job_title} />
          <ProfileValue label="Employee ID" value={data.employee_code} />
          <ProfileValue label="Bharath ID" value={data.bharath_id} />
          <ProfileValue label="Date of joining" value={data.joined_on} />
        </ProfileGroup>
        <ProfileGroup title="Contact information">
          <ProfileValue label="Mobile number" value={data.mobile} href={data.mobile ? `tel:${data.mobile}` : undefined} />
          <ProfileValue label="Emergency contact" value={data.emergency_contact_number} href={data.emergency_contact_number ? `tel:${data.emergency_contact_number}` : undefined} />
          <ProfileValue label="Email" value={data.email} href={data.email ? `mailto:${data.email}` : undefined} />
        </ProfileGroup>
        <ProfileGroup title="Personal details">
          <ProfileValue label="Date of birth" value={data.date_of_birth} />
          <ProfileValue label="Blood group" value={data.blood_group} />
        </ProfileGroup>
        <ProfileGroup title="Skills and availability">
          <ProfileValue label="Experience" value={`${data.experience_years || 0} years`} />
          <ProfileValue label="Skills" value={data.skills} />
          <ProfileValue label="Preferred locations" value={data.preferred_locations} />
          <ProfileValue label="Willing to travel" value={data.willing_to_travel ? "Yes" : "No"} />
          <ProfileValue label="Availability" value={String(data.availability || "Not set").replaceAll("_", " ")} />
        </ProfileGroup>
        <ProfileGroup title="Compensation and statutory details">
          <ProfileValue label="Salary / wage" value={money} />
          <ProfileValue label="Salary type" value={String(data.salary_basis || "Not set").replaceAll("_", " ")} />
          <ProfileValue label="ESI" value={data.esi_applicable ? "Applicable" : "Not applicable"} />
          <ProfileValue label="PF" value={data.pf_applicable ? "Applicable" : "Not applicable"} />
        </ProfileGroup>
        <ProfileGroup title="Account status">
          <ProfileValue label="App registration" value={employeeRegistration(data)?.label || 'Unavailable'} />
          <ProfileValue label="Account access" value={data.account_is_active === true ? 'Active' : data.account_is_active === false ? 'Disabled' : 'Unavailable'} />
          <ProfileValue label="Identity verification" value={data.is_verified ? "Verified" : "Not verified"} />
          <ProfileValue label="Employment status" value={data.is_active === false ? "Removed from active workforce" : "Active"} />
          {activationAction && <ProfileValue label="Activation link" value={activationAction} />}
        </ProfileGroup>
        {data.custom_field_definitions?.filter(field => data.custom_fields?.[String(field.id)] !== undefined).length > 0 && <ProfileGroup title="Additional employee details">
          {data.custom_field_definitions.filter(field => data.custom_fields?.[String(field.id)] !== undefined).map(field => <ProfileValue key={field.id} label={field.label} value={String(data.custom_fields[String(field.id)])} />)}
        </ProfileGroup>}
      </div>
    </section>
  );
}
function ProfileGroup({title,children}){return <section className="min-w-0"><h3 className="border-b border-slate-200 pb-2 text-sm font-bold text-slate-900">{title}</h3><dl className="mt-3 grid gap-3">{children}</dl></section>}
function ProfileValue({label,value,href}){return <div className="grid gap-1 sm:grid-cols-[minmax(8rem,0.75fr)_minmax(0,1.25fr)] sm:items-start"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="min-w-0 break-words text-sm font-semibold text-slate-900">{value ? href ? <a className="text-blue-800 underline-offset-2 hover:underline" href={href}>{value}</a> : value : <span className="font-normal text-slate-400">Not provided</span>}</dd></div>}
function Edit({ data, onSave, saving }) {
  const [form, setForm] = useState({
    name: data.name,
    employee_code: data.employee_code,
    trade: data.trade || "",
    job_title: data.job_title || "",
    emergency_contact_number: data.emergency_contact_number || "",
    date_of_birth: data.date_of_birth || "",
    blood_group: data.blood_group || "",
    joined_on: data.joined_on || "",
    experience_years: data.experience_years,
    skills: data.skills,
    salary_basis: data.salary_basis,
    salary_amount: data.salary_amount || "",
    esi_applicable: data.esi_applicable,
    pf_applicable: data.pf_applicable,
    is_active: data.is_active,
    custom_fields: { ...(data.custom_fields || {}) },
    effective_from: today,
  });
  const bind = (n) => ({
    value: form[n],
    onChange: (e) => setForm({ ...form, [n]: e.target.value }),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
      className="rounded-2xl border bg-white p-6"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active !== false} onChange={event => setForm({ ...form, is_active: event.target.checked })} />Active employee</label>
        {[
          "name",
          "trade",
          "job_title",
          "emergency_contact_number",
          "date_of_birth",
          "blood_group",
          "joined_on",
          "experience_years",
          "skills",
          "salary_amount",
        ].map((n) => (
          <label key={n} className="text-sm font-semibold capitalize">
            {n.replaceAll("_", " ")}
            <input
              {...bind(n)}
              className="mt-2 w-full rounded-xl border px-3 py-3 bp-ui-control"
            />
          </label>
        ))}
        <label className="text-sm font-semibold">Salary basis<select {...bind("salary_basis")} className="mt-2 block min-h-11 w-full rounded-xl border px-3 bp-ui-control"><option value="MONTHLY">Monthly</option><option value="WEEKLY">Weekly</option><option value="DAILY">Daily</option></select></label>
        <label className="text-sm font-semibold">Salary effective from<input type="date" max={today} {...bind("effective_from")} className="mt-2 block min-h-11 w-full rounded-xl border px-3 bp-ui-control" /></label>
        {data.custom_field_definitions?.filter(field=>field.is_active).map(field => <label key={field.id} className="text-sm font-semibold">{field.label}{field.required?" *":""}{field.field_type==="CHOICE"?<select required={field.required} value={form.custom_fields[String(field.id)]??""} onChange={event=>setForm({...form,custom_fields:{...form.custom_fields,[String(field.id)]:event.target.value}})} className="mt-2 block min-h-11 w-full rounded-xl border px-3 bp-ui-control"><option value="">Select</option>{field.options.map(option=><option key={option}>{option}</option>)}</select>:field.field_type==="BOOLEAN"?<select required={field.required} value={form.custom_fields[String(field.id)]==null?"":String(form.custom_fields[String(field.id)])} onChange={event=>setForm({...form,custom_fields:{...form.custom_fields,[String(field.id)]:event.target.value==="true"}})} className="mt-2 block min-h-11 w-full rounded-xl border px-3 bp-ui-control"><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select>:<input required={field.required} type={{TEXT:"text",NUMBER:"number",DATE:"date"}[field.field_type]||"text"} value={form.custom_fields[String(field.id)]??""} onChange={event=>setForm({...form,custom_fields:{...form.custom_fields,[String(field.id)]:event.target.value}})} className="mt-2 block min-h-11 w-full rounded-xl border px-3 bp-ui-control"/>}</label>)}
        <label>
          <input
            type="checkbox"
            checked={form.esi_applicable}
            onChange={(e) =>
              setForm({ ...form, esi_applicable: e.target.checked })
            }
          />{" "}
          ESI applicable
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.pf_applicable}
            onChange={(e) =>
              setForm({ ...form, pf_applicable: e.target.checked })
            }
          />{" "}
          PF applicable
        </label>
      </div>
      <button disabled={saving} className="mt-5 rounded-xl bg-slate-950 px-6 py-3 font-semibold text-white disabled:opacity-50 bp-ui-action">
        Save changes
      </button>
    </form>
  );
}

function ChangeHistory({ history }) {
  const profile = history.profile_changes || [], salary = history.salary_changes || [];
  return <section className="rounded-2xl border bg-white p-5 sm:p-6" aria-labelledby="employee-history-heading"><h2 id="employee-history-heading" className="text-xl font-bold bp-ui-section-heading">Profile and salary history</h2>{!profile.length&&!salary.length?<p className="mt-3 text-sm text-slate-500">No changes have been recorded since history tracking began.</p>:<ol className="mt-4 space-y-3">{salary.map(row=><li key={`salary-${row.id}`} className="rounded-xl border p-4"><p className="font-semibold">Salary changed from {row.previous_salary_amount??"—"} ({row.previous_salary_basis}) to {row.salary_amount??"—"} ({row.salary_basis})</p><p className="mt-1 text-sm text-slate-500">Effective {row.effective_from} · recorded {new Date(row.recorded_at).toLocaleString()} by {row.changed_by}</p></li>)}{profile.map(row=><li key={`profile-${row.id}`} className="rounded-xl border p-4"><p className="text-sm font-semibold">{row.changes.map(change=>`${change.label}: ${change.old_value??"—"} → ${change.new_value??"—"}`).join("; ")}</p><p className="mt-1 text-sm text-slate-500">Recorded {new Date(row.recorded_at).toLocaleString()} by {row.changed_by}</p></li>)}</ol>}</section>;
}

function BonusForm({ value, setValue, onSubmit, bonuses, month, setMonth, saving }) {
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState("MONTH"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const rows =
    mode === "CUSTOM"
      ? bonuses.filter(
          (item) => (!from || item.date >= from) && (!to || item.date <= to),
        )
      : bonuses;
  const total = rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return (
    <section id="employee-bonus" className="scroll-mt-20 rounded-2xl border bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold bp-ui-section-heading">Bonus</h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white bp-ui-action"
        >
          + Add bonus
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          onMouseDown={() => setOpen(false)}
        >
          <form
            onSubmit={async (e) => {
              const saved = await onSubmit(e);
              if (saved) setOpen(false);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">Add employee bonus</h3>
                
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border px-3 py-2 text-sm font-semibold bp-ui-action"
              >
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="text-sm font-semibold">
                Bonus date
                <input
                  required
                  type="date"
                  max={today}
                  value={value.date}
                  onChange={(e) => setValue({ ...value, date: e.target.value })}
                  className="mt-2 w-full rounded-xl border px-4 py-3 bp-ui-control"
                />
              </label>
              <label className="text-sm font-semibold">
                Bonus amount
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={value.amount}
                  onChange={(e) =>
                    setValue({ ...value, amount: e.target.value })
                  }
                  placeholder="₹ 0.00"
                  className="mt-2 w-full rounded-xl border px-4 py-3 bp-ui-control"
                />
              </label>
              <label className="text-sm font-semibold">
                Reason / note
                <input
                  value={value.note}
                  onChange={(e) => setValue({ ...value, note: e.target.value })}
                  placeholder="Performance bonus"
                  className="mt-2 w-full rounded-xl border px-4 py-3 bp-ui-control"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border px-5 py-3 font-semibold bp-ui-action"
              >
                Cancel
              </button>
              <button disabled={saving} className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-50 bp-ui-action">
                Save bonus
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <input
          type="month"
          value={month}
          max={currentMonth}
          onChange={(e) => {
            setMonth(e.target.value);
            setMode("MONTH");
          }}
          className="rounded-xl border px-3 py-2 text-sm bp-ui-control"
        />
        <button
          type="button"
          onClick={() => setMode(mode === "CUSTOM" ? "MONTH" : "CUSTOM")}
          className="rounded-xl border px-3 py-2 text-sm font-semibold bp-ui-action"
        >
          {mode === "CUSTOM" ? "Use month" : "Custom dates"}
        </button>
        {mode === "CUSTOM" && (
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm bp-ui-control"
            />
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm bp-ui-control"
            />
          </>
        )}
      </div>
      <details className="mt-3 overflow-hidden rounded-xl border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-amber-50 p-4">
          <span className="font-bold">Bonus transactions</span>
          <strong className="text-emerald-700">
            Total bonus ₹{total.toLocaleString("en-IN")}
          </strong>
        </summary>
        {rows.length ? (
          <div className="divide-y">
            {rows.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 p-3 text-sm"
              >
                <span>
                  <b>{item.date}</b>
                  <span className="ml-2 text-slate-500">
                    {item.note || "Bonus"}
                  </span>
                </span>
                <b className="text-emerald-700">
                  + ₹{Number(item.amount).toLocaleString("en-IN")}
                </b>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm text-slate-400">
            No bonus transactions for this period.
          </p>
        )}
      </details>
    </section>
  );
}
