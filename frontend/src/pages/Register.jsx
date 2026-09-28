import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BriefcaseBusiness, Eye, EyeOff, Palette } from "lucide-react";
import api from "../api/client";
import RegistrationConsent from "../components/RegistrationConsent";

export default function Register() {
  const navigate = useNavigate();
  const [role, setRole] = useState("CONTRACTOR");
  const [form, setForm] = useState({
    mobile: "",
    email: "",
    password: "",
    name: "",
    first_name: "",
    last_name: "",
    experience_years: 0,
    skills: "",
    daily_wage: "",
    weekly_wage: "",
    preferred_locations: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
        "name",
      ].forEach((field) => contractor.append(field, form[field]));
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
            {role === "CONTRACTOR" && <label className="text-sm font-medium sm:col-span-2">
              Name *
              <input required name="name" value={form.name} onChange={update} className={input} />
            </label>}
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
            <div className="text-sm font-medium sm:col-span-2">
              <label htmlFor="registration-password">Password *</label>
              <span className="relative block"><input required minLength="8" type={showPassword ? "text" : "password"} id="registration-password" name="password" autoComplete="new-password" value={form.password} onChange={update} className={`${input} pr-12`} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute inset-y-0 right-1 top-1.5 grid w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></span>
            </div>
            {role === "CONTRACTOR" ? (
              <p className="text-sm text-slate-500 sm:col-span-2">You can complete your company profile after registration.</p>
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
