import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BriefcaseBusiness, Palette } from "lucide-react";
import api from "../api/client";
import RegistrationConsent from "../components/RegistrationConsent";

export default function Register() {
  const navigate = useNavigate();
  const [role, setRole] = useState("CONTRACTOR");
  const [form, setForm] = useState({
    mobile: "",
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    company_name: "",
    owner_name: "",
    company_logo: null,
    office_address: "",
    service_areas: "",
    gst_number: "",
    pan_number: "",
    number_of_painters: 0,
    years_in_business: 0,
    experience_years: 0,
    skills: "",
    daily_wage: "",
    weekly_wage: "",
    preferred_locations: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [consent, setConsent] = useState({ accepted: false, policyVersion: "", scrolled: false });
  const update = (event) =>
    setForm((value) => ({ ...value, [event.target.name]: event.target.value }));
  const input =
    "mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 outline-none focus:border-slate-900";
  async function submit(event) {
    event.preventDefault();
    if (!consent.accepted) {
      setError("Read and accept the Terms of Use and Privacy Notice before registering.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const contractor = new FormData();
      [
        "mobile",
        "email",
        "password",
        "company_name",
        "owner_name",
        "office_address",
        "service_areas",
        "gst_number",
        "pan_number",
      ].forEach((field) => contractor.append(field, form[field]));
      contractor.append(
        "years_in_business",
        Number(form.years_in_business) || 0,
      );
      contractor.append(
        "number_of_painters",
        Number(form.number_of_painters) || 0,
      );
      if (form.company_logo)
        contractor.append("company_logo", form.company_logo);
      contractor.append("policy_version", consent.policyVersion);
      contractor.append("document_scrolled", String(consent.scrolled));
      contractor.append("terms_accepted", "true");
      contractor.append("privacy_notice_acknowledged", "true");
      const painter = {
        mobile: form.mobile,
        email: form.email,
        password: form.password,
        first_name: form.first_name,
        last_name: form.last_name,
        experience_years: Number(form.experience_years) || 0,
        skills: form.skills,
        daily_wage: form.daily_wage || null,
        weekly_wage: form.weekly_wage || null,
        preferred_locations: form.preferred_locations,
        policy_version: consent.policyVersion,
        document_scrolled: consent.scrolled,
        terms_accepted: true,
        privacy_notice_acknowledged: true,
      };
      await api.post(
        `/accounts/register/${role.toLowerCase()}/`,
        role === "CONTRACTOR" ? contractor : painter,
        role === "CONTRACTOR"
          ? { headers: { "Content-Type": "multipart/form-data" } }
          : undefined,
      );
      navigate("/login", { state: { registered: true } });
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Registration failed.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-2xl">
        <Link to="/login" className="text-sm font-semibold text-slate-600">
          ← Back to login
        </Link>
        <div className="mt-6 rounded-2xl border bg-white p-6 sm:p-8">
          <h1 className="text-3xl font-bold">Create your account</h1>
          <p className="mt-2 text-slate-500">
            Choose how you will use Bharath Painters.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[
              ["CONTRACTOR", BriefcaseBusiness],
              ["PAINTER", Palette],
            ].map(([value, Icon]) => (
              <button
                key={value}
                onClick={() => setRole(value)}
                className={`rounded-xl border p-4 text-left ${role === value ? "border-slate-950 bg-slate-50" : "border-slate-200"}`}
              >
                <Icon className="h-5 w-5" />
                <p className="mt-2 font-semibold">
                  {value === "CONTRACTOR" ? "Contractor" : "Paint Applicator"}
                </p>
              </button>
            ))}
          </div>
          {error && (
            <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <form onSubmit={submit} className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Mobile *
              <input
                required
                name="mobile"
                value={form.mobile}
                onChange={update}
                className={input}
              />
            </label>
            <label className="text-sm font-medium">
              Email *
              <input
                required
                type="email"
                name="email"
                value={form.email}
                onChange={update}
                className={input}
              />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Password *
              <input
                required
                minLength="8"
                type="password"
                name="password"
                value={form.password}
                onChange={update}
                className={input}
              />
            </label>
            {role === "CONTRACTOR" ? (
              <>
                <label className="text-sm font-medium">
                  Company name *
                  <input
                    required
                    name="company_name"
                    value={form.company_name}
                    onChange={update}
                    className={input}
                  />
                </label>
                <label className="text-sm font-medium">
                  Owner name *
                  <input
                    required
                    name="owner_name"
                    value={form.owner_name}
                    onChange={update}
                    className={input}
                  />
                </label>
                <label className="text-sm font-medium sm:col-span-2">
                  Company logo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        company_logo: event.target.files?.[0] || null,
                      }))
                    }
                    className={input}
                  />
                </label>
                <label className="text-sm font-medium sm:col-span-2">
                  Office address *
                  <textarea
                    required
                    rows="3"
                    name="office_address"
                    value={form.office_address}
                    onChange={update}
                    className={input}
                  />
                </label>
                <label className="text-sm font-medium sm:col-span-2">
                  Service areas
                  <input
                    name="service_areas"
                    value={form.service_areas}
                    onChange={update}
                    placeholder="Bengaluru, Mysuru..."
                    className={input}
                  />
                </label>
                <label className="text-sm font-medium">
                  GSTIN
                  <input
                    name="gst_number"
                    maxLength="15"
                    value={form.gst_number}
                    onChange={update}
                    className={input}
                  />
                </label>
                <label className="text-sm font-medium">
                  PAN number
                  <input
                    name="pan_number"
                    maxLength="10"
                    value={form.pan_number}
                    onChange={update}
                    className={input}
                  />
                </label>
                <label className="text-sm font-medium">
                  Years in business
                  <input
                    type="number"
                    min="0"
                    name="years_in_business"
                    value={form.years_in_business}
                    onChange={update}
                    className={input}
                  />
                </label>
                <label className="text-sm font-medium">
                  Number of Paint Applicators
                  <input
                    type="number"
                    min="0"
                    name="number_of_painters"
                    value={form.number_of_painters}
                    onChange={update}
                    className={input}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="text-sm font-medium">
                  First name *
                  <input
                    required
                    name="first_name"
                    value={form.first_name}
                    onChange={update}
                    className={input}
                  />
                </label>
                <label className="text-sm font-medium">
                  Last name
                  <input
                    name="last_name"
                    value={form.last_name}
                    onChange={update}
                    className={input}
                  />
                </label>
                <label className="text-sm font-medium">
                  Experience (years) *
                  <input
                    required
                    type="number"
                    min="0"
                    name="experience_years"
                    value={form.experience_years}
                    onChange={update}
                    className={input}
                  />
                </label>
                <label className="text-sm font-medium">
                  Daily wage
                  <input
                    type="number"
                    min="0"
                    name="daily_wage"
                    value={form.daily_wage}
                    onChange={update}
                    className={input}
                  />
                </label>
                <label className="text-sm font-medium sm:col-span-2">
                  Skills
                  <input
                    name="skills"
                    value={form.skills}
                    onChange={update}
                    className={input}
                  />
                </label>
                <label className="text-sm font-medium sm:col-span-2">
                  Preferred locations
                  <input
                    name="preferred_locations"
                    value={form.preferred_locations}
                    onChange={update}
                    className={input}
                  />
                </label>
              </>
            )}
            <RegistrationConsent role={role} onConsentChange={setConsent} />
            <button
              disabled={saving || !consent.accepted}
              className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white sm:col-span-2 disabled:opacity-60"
            >
              {saving ? "Creating account..." : "Register"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
