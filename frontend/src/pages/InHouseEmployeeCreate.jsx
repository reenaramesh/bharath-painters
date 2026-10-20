import EmployeeQuickActions from "../components/EmployeeQuickActions";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Copy, MessageCircle } from "lucide-react";
import api from "../api/client";
import { PageHeader } from "../components/ui";
import { Dialog } from "../components/ui/Dialog";
import { whatsappNumber } from "../utils/welcomeMessages";
import RegisteredEmployeeSearch from "../components/RegisteredEmployeeSearch";
import { employeeSelectionDraft } from "../utils/employeeAccount";
import "./painter-workspace-ui.css";

const today = new Date().toLocaleDateString("en-CA");
const trades = ["Painter", "Plumber", "Electrician", "Carpenter", "Other"];
const jobTitles = ["Manager", "Supervisor", "HOD", "Sales Head", "Marketing Manager", "Digital Marketing", "Applicator", "Executive", "Field Officer", "Other"];
export default function InHouseEmployeeCreate() {
  const navigate = useNavigate();
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [activation, setActivation] = useState(null),
    [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    trade: "",
    trade_other: "",
    job_title: "",
    job_title_other: "",
    emergency_contact_number: "",
    date_of_birth: "",
    blood_group: "",
    joined_on: today,
    experience_years: 0,
    skills: "",
    salary_basis: "MONTHLY",
    salary_amount: "",
    esi_applicable: false,
    pf_applicable: false,
    employment_type: "IN_HOUSE",
    custom_fields: {},
  });
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState([]);
  const [selectedPainter, setSelectedPainter] = useState(null);
  useEffect(() => { api.get("/jobs/in-house-employee-fields/").then(({data}) => setCustomFieldDefinitions(data.filter(field => field.is_active))).catch(() => setError("Custom employee fields could not be loaded. Please reload before saving.")); }, []);
  const bind = (name) => ({
    value: form[name],
    onChange: (e) => setForm({ ...form, [name]: e.target.value }),
  });
  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        trade: form.trade === "Other" ? form.trade_other.trim() : form.trade,
        job_title: form.job_title === "Other" ? form.job_title_other.trim() : form.job_title,
      };
      delete payload.trade_other;
      delete payload.job_title_other;
      const { data } = await api.post("/jobs/my-team/create-applicator/", payload);
      if (data.activation_url) {
        setActivation({ url: data.activation_url, mobile: form.mobile, membershipId: data.member.membership_id });
      } else {
        navigate(`/in-house-applicators/${data.member.membership_id}`, { state: { notice: data.message || "Existing verified employee account linked." } });
      }
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          Object.values(err.response?.data || {})
            .flat()
            .join(" ") ||
          "Employee could not be created.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="employee-page mx-auto max-w-5xl space-y-6">
      <Link to="/in-house-applicators" className="inline-flex min-h-11 items-center text-sm text-slate-500">Back to employees</Link>
      <PageHeader eyebrow="Permanent workforce" title="Create in-house employee" description="Enter employee details using your existing employment setup." />
      <EmployeeQuickActions />
      <RegisteredEmployeeSearch selected={selectedPainter} onSelect={painter => { setSelectedPainter(painter); setForm(current => employeeSelectionDraft(current, painter)); }} onClear={() => { setSelectedPainter(null); setForm(current => ({ ...current, name: '', mobile: '', skills: '', experience_years: 0 })); }} />
      <p className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">If this mobile belongs to an active, verified Paint Applicator account, the existing login and profile will be linked. No new account or password will be created.</p>
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>
      )}
      <form onSubmit={submit} className="rounded-2xl border bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name">
            <input className="bp-ui-control" required readOnly={!!selectedPainter} {...bind("name")} />
          </Field>
          <Field label="Phone number">
            <input className="bp-ui-control" type="tel" required readOnly={!!selectedPainter} {...bind("mobile")} />
          </Field>
          <Field label="Service category">
            <select className="bp-ui-control" required {...bind("trade")}>
              <option value="">Select service category</option>
              {trades.map((trade) => <option key={trade}>{trade}</option>)}
            </select>
          </Field>
          {form.trade === "Other" && <Field label="Custom service category"><input className="bp-ui-control" required maxLength={80} {...bind("trade_other")} placeholder="Enter service category" /></Field>}
          <Field label="Job title">
            <select className="bp-ui-control" required {...bind("job_title")}>
              <option value="">Select job title</option>
              {jobTitles.map((title) => <option key={title}>{title}</option>)}
            </select>
          </Field>
          {form.job_title === "Other" && <Field label="Custom job title"><input className="bp-ui-control" required maxLength={80} {...bind("job_title_other")} placeholder="Enter job title" /></Field>}
          <Field label="Emergency contact number">
            <input className="bp-ui-control" type="tel" maxLength={32} {...bind("emergency_contact_number")} />
          </Field>
          <Field label="Date of birth">
            <input className="bp-ui-control" type="date" {...bind("date_of_birth")} />
          </Field>
          <Field label="Blood group">
            <select className="bp-ui-control" {...bind("blood_group")}>
              <option value="">Select</option>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Date of joining">
            <input className="bp-ui-control" type="date" required {...bind("joined_on")} />
          </Field>
          <Field label="Years of experience">
            <input className="bp-ui-control" type="number" min="0" readOnly={!!selectedPainter} {...bind("experience_years")} />
          </Field>
          <Field label="Salary type">
            <select className="bp-ui-control" {...bind("salary_basis")}>
              <option value="MONTHLY">Fixed monthly salary</option>
              <option value="WEEKLY">Weekly wage</option>
              <option value="DAILY">Daily wage</option>
            </select>
          </Field>
          <Field label="Salary / wage">
            <input className="bp-ui-control"
              required
              type="number"
              min="0"
              step="0.01"
              {...bind("salary_amount")}
            />
          </Field>
          {customFieldDefinitions.map(field => <Field key={field.id} label={`${field.label}${field.required ? " *" : ""}`}>
            {field.field_type === "CHOICE" ? <select className="bp-ui-control" required={field.required} value={form.custom_fields[field.id] ?? ""} onChange={e=>setForm({...form,custom_fields:{...form.custom_fields,[field.id]:e.target.value}})}><option value="">Select</option>{field.options.map(option=><option key={option}>{option}</option>)}</select> : field.field_type === "BOOLEAN" ? <select className="bp-ui-control" required={field.required} value={form.custom_fields[field.id] == null ? "" : String(form.custom_fields[field.id])} onChange={e=>setForm({...form,custom_fields:{...form.custom_fields,[field.id]:e.target.value==="true"}})}><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select> : <input className="bp-ui-control" required={field.required} type={{TEXT:"text",NUMBER:"number",DATE:"date"}[field.field_type] || "text"} value={form.custom_fields[field.id] ?? ""} onChange={e=>setForm({...form,custom_fields:{...form.custom_fields,[field.id]:e.target.value}})} />}
          </Field>)}
          <Field label="Skills" wide>
            <textarea className="bp-ui-control" required readOnly={!!selectedPainter} rows="3" {...bind("skills")} />
          </Field>
          <Check
            label="ESI applicable"
            checked={form.esi_applicable}
            onChange={(v) => setForm({ ...form, esi_applicable: v })}
          />
          <Check
            label="PF applicable"
            checked={form.pf_applicable}
            onChange={(v) => setForm({ ...form, pf_applicable: v })}
          />
        </div>
        <button
          disabled={saving}
          className="mt-6 rounded-xl bg-slate-950 px-7 py-3 font-semibold text-white disabled:opacity-50 bp-ui-action"
        >
          {saving ? (selectedPainter ? "Adding employee..." : "Creating...") : (selectedPainter ? "Add as employee" : "Create employee")}
        </button>
      </form>
      {activation && <Dialog title="Employee created" icon={CheckCircle2} onClose={() => navigate(`/in-house-applicators/${activation.membershipId}`)}>
        <p className="mt-4 text-sm leading-6 text-slate-600">Share this private, 7-day activation link with the employee. They will set their own password. Anyone with the link can activate this account, so share it directly with {form.name || "the employee"}.</p>
        <label className="mt-4 block text-sm font-semibold">Activation link<input readOnly value={activation.url} onFocus={(event) => event.target.select()} className="bp-ui-control mt-2 w-full rounded-xl border px-3 py-3 text-sm font-normal" /></label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(activation.url); setCopied(true); } catch { setError("Copy failed. Select and copy the activation link above."); } }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-3 font-semibold bp-ui-action"><Copy className="h-4 w-4" aria-hidden="true" />{copied ? "Copied" : "Copy link"}</button>
          <a href={`https://wa.me/${whatsappNumber(activation.mobile)}?text=${encodeURIComponent(`Hi ${form.name}, set your Bharath Apps employee password using this link: ${activation.url}`)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white"><MessageCircle className="h-4 w-4" aria-hidden="true" />Share on WhatsApp</a>
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button type="button" onClick={() => navigate(`/in-house-applicators/${activation.membershipId}`)} className="mt-4 w-full rounded-xl border px-4 py-3 font-semibold bp-ui-action">Continue to employee</button>
      </Dialog>}
    </div>
  );
}
function Field({ label, wide, children }) {
  return (
    <label
      className={`text-sm font-semibold ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}
    >
      {label}
      <span className="mt-2 block [&>*]:w-full [&>*]:rounded-xl [&>*]:border [&>*]:px-3 [&>*]:py-3">
        {children}
      </span>
    </label>
  );
}
function Check({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border p-4 text-sm font-semibold">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}: {checked ? "Yes" : "No"}
    </label>
  );
}
