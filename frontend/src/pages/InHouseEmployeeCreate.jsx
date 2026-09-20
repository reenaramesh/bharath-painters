import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";

const today = new Date().toLocaleDateString("en-CA");
export default function InHouseEmployeeCreate() {
  const navigate = useNavigate();
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    password: "",
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
  });
  const bind = (name) => ({
    value: form[name],
    onChange: (e) => setForm({ ...form, [name]: e.target.value }),
  });
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/jobs/my-team/create-applicator/", form);
      navigate(`/in-house-applicators/${data.member.membership_id}`);
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
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <Link to="/in-house-applicators" className="text-sm text-slate-500">
          ← Employees
        </Link>
        <h1 className="mt-3 text-3xl font-bold">Create in-house employee</h1>
        <p className="mt-2 text-slate-500">
          Create the employment profile once. Later changes happen inside the
          employee profile.
        </p>
      </header>
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>
      )}
      <form onSubmit={submit} className="rounded-2xl border bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name">
            <input required {...bind("name")} />
          </Field>
          <Field label="Employee ID">
            <input
              disabled
              value="Generated automatically (BPE-YEAR-0001)"
            />
          </Field>
          <Field label="Phone number">
            <input required {...bind("mobile")} />
          </Field>
          <Field label="Login password">
            <input required minLength="8" {...bind("password")} />
          </Field>
          <Field label="Date of birth">
            <input type="date" {...bind("date_of_birth")} />
          </Field>
          <Field label="Blood group">
            <select {...bind("blood_group")}>
              <option value="">Select</option>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Date of joining">
            <input type="date" required {...bind("joined_on")} />
          </Field>
          <Field label="Years of experience">
            <input type="number" min="0" {...bind("experience_years")} />
          </Field>
          <Field label="Salary type">
            <select {...bind("salary_basis")}>
              <option value="MONTHLY">Fixed monthly salary</option>
              <option value="WEEKLY">Weekly wage</option>
              <option value="DAILY">Daily wage</option>
            </select>
          </Field>
          <Field label="Salary / wage">
            <input
              required
              type="number"
              min="0"
              step="0.01"
              {...bind("salary_amount")}
            />
          </Field>
          <Field label="Skills" wide>
            <textarea required rows="3" {...bind("skills")} />
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
          className="mt-6 rounded-xl bg-slate-950 px-7 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Creating..." : "Create employee"}
        </button>
      </form>
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
