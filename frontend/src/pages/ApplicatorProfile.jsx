import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, MapPin, QrCode, Save, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";
import ProfileImageControl from "../components/ProfileImageControl";
import "./painter-portal.css";

const skills = [
  "Interior Painting",
  "Exterior Painting",
  "Wall Putty",
  "Primer",
  "Texture Painting",
  "Wood Polish",
  "Enamel Painting",
  "Waterproofing",
  "Spray Painting",
  "Scaffolding",
];
const bloodGroups = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const locations = [
  "",
  "Bengaluru",
  "Whitefield",
  "Marathahalli",
  "Indiranagar",
  "HSR Layout",
  "Electronic City",
  "Yelahanka",
  "Hebbal",
  "Kengeri",
  "Mysuru",
];
const input = "mt-2 w-full rounded-xl border px-3 py-3 font-normal";

export default function ApplicatorProfile({ embedded = false }) {
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState(null),
    [photo, setPhoto] = useState(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/jobs/applicator-profile/");
      setForm(data);
      setError("");
    } catch {
      setError("Profile could not be loaded.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const selected = useMemo(
    () =>
      new Set(
        String(form?.skills || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    [form?.skills],
  );
  function toggle(skill) {
    const next = new Set(selected);
    if (next.has(skill)) next.delete(skill);
    else next.add(skill);
    setForm({ ...form, skills: [...next].join(", ") });
  }
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = new FormData();
      [
        "name",
        "experience_years",
        "skills",
        "preferred_locations",
        "emergency_contact_name",
        "emergency_contact_number",
        "blood_group",
        "permanent_address",
        "current_location",
      ].forEach((field) => payload.append(field, form[field] ?? ""));
      payload.append("profile_photo_position", JSON.stringify(form.profile_photo_position || { x: 50, y: 50, zoom: 1 }));
      if (photo) payload.append("profile_photo", photo);
      const { data } = await api.patch("/jobs/applicator-profile/", payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm(data);
      setPhoto(null);
      await refreshUser().catch(() => setError("Profile saved, but account details could not refresh. Reload to refresh your name and photo."));
      setSuccess("Painter profile saved successfully.");
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Profile could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (!form)
    return (
      <p className="p-12 text-center text-slate-500">
        {error || "Loading profile..."}
      </p>
    );
  const field = (name) => ({
    value: form[name] ?? "",
    onChange: (event) => setForm({ ...form, [name]: event.target.value }),
  });
  return (
    <div className="painter-portal-page painter-profile-page mx-auto max-w-4xl space-y-6">
      {success && <div role="status" className="fixed right-4 top-20 z-[100] rounded-xl border border-emerald-200 bg-white px-5 py-4 text-sm font-semibold text-emerald-800 shadow-xl">✓ {success}</div>}
      <header className={embedded ? "" : "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"}>
        <div>
          <p className="text-sm font-semibold text-[#176b9b]">
            {user?.branding?.employee_singular_label || "Employee"} profile
          </p>
          <h2 className={embedded ? "mt-1 text-xl font-bold" : "mt-1 text-3xl font-bold"}>
            Personal details
          </h2>
          
        </div>
        {embedded ? null : (
        <div className="flex flex-wrap gap-2">
          <Link to="/appearance" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#176b9b] px-4 py-3 text-sm font-bold text-[#176b9b]">
            <Settings className="h-5 w-5" />App theme
          </Link>
          <Link to="/profile" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white">
            <QrCode className="h-5 w-5" />View & share QR profile
          </Link>
        </div>
        )}
      </header>
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}
      <section className="rounded-2xl border border-[#d7e4ea] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-center">
          <div className="w-full max-w-sm shrink-0">
            <ProfileImageControl label="Profile photo" file={photo} existingUrl={form.profile_photo} position={form.profile_photo_position} shape="circle" capture="user" onFileChange={setPhoto} onPositionChange={(profile_photo_position) => setForm((current) => ({ ...current, profile_photo_position }))} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{form.name}</h2>
              <BadgeCheck className="h-5 w-5 text-blue-600" />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {form.bharath_id} · {form.mobile}
            </p>
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              <MapPin className="h-3.5 w-3.5" />
              {form.current_location || "Select current location"}
            </p>
          </div>
        </div>
        <form onSubmit={save} className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Name">
            <input required {...field("name")} className={input} />
          </Field>
          <Field label="Years of experience">
            <select {...field("experience_years")} className={input}>
              {Array.from({ length: 41 }, (_, value) => (
                <option key={value} value={value}>
                  {value} {value === 1 ? "year" : "years"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Other skills (free text)" wide>
            <textarea {...field("skills")} className={input} rows={2} placeholder="Keep any existing skills, including skills outside the trade catalogue" />
            {!embedded && (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {skills.map((skill) => (
                <button
                  type="button"
                  key={skill}
                  onClick={() => toggle(skill)}
                  className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold ${selected.has(skill) ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "bg-white"}`}
                >
                  {selected.has(skill) ? "✓ " : ""}
                  {skill}
                </button>
              ))}
            </div>
            )}
          </Field>
          <Field label="Preferred work locations" wide>
            <input {...field("preferred_locations")} placeholder="For example: Whitefield, Marathahalli" className={input} />
          </Field>
          <Field label="Emergency contact name">
            <input {...field("emergency_contact_name")} className={input} />
          </Field>
          <Field label="Emergency contact number">
            <input
              inputMode="tel"
              {...field("emergency_contact_number")}
              className={input}
            />
          </Field>
          <Field label="Blood group">
            <select {...field("blood_group")} className={input}>
              {bloodGroups.map((group) => (
                <option key={group} value={group}>
                  {group || "Select blood group"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Current work-seeking location">
            <select {...field("current_location")} className={input}>
              {form.current_location && !locations.includes(form.current_location) && <option value={form.current_location}>{form.current_location}</option>}
              {locations.map((location) => (
                <option key={location} value={location}>
                  {location || "Select current location"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Permanent address" wide>
            <textarea
              rows="3"
              {...field("permanent_address")}
              className={input}
            />
          </Field>
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 sm:col-span-2">
            Enter your expected wage only when you post that you are seeking
            work.
          </p>
          <button
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#176b9b] px-5 py-3 font-semibold text-white sm:col-span-2 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save profile"}
          </button>
        </form>
      </section>
    </div>
  );
}

function Field({ label, wide, children }) {
  return (
    <label className={`text-sm font-semibold ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}
