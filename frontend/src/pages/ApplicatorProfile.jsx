import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Camera, MapPin, QrCode, Save } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/client";

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

export default function ApplicatorProfile() {
  const [form, setForm] = useState(null),
    [photo, setPhoto] = useState(null),
    [error, setError] = useState(""),
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
    try {
      const payload = new FormData();
      [
        "name",
        "experience_years",
        "skills",
        "emergency_contact_name",
        "emergency_contact_number",
        "blood_group",
        "permanent_address",
        "current_location",
      ].forEach((field) => payload.append(field, form[field] ?? ""));
      if (photo) payload.append("profile_photo", photo);
      const { data } = await api.patch("/jobs/applicator-profile/", payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm(data);
      setPhoto(null);
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
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-600">
            Paint Applicator portal
          </p>
          <h1 className="mt-1 text-3xl font-bold">My Profile</h1>
          <p className="mt-2 text-slate-500">
            Keep the basic information contractors need.
          </p>
        </div>
        <Link
          to="/profile"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white"
        >
          <QrCode className="h-5 w-5" />
          View & share QR profile
        </Link>
      </header>
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}
      <section className="rounded-2xl border bg-white p-6">
        <div className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-center">
          <label className="relative grid h-24 w-24 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full bg-slate-950 text-white">
            {photo || form.profile_photo ? (
              <img
                src={photo ? URL.createObjectURL(photo) : form.profile_photo}
                alt="Profile"
                className="h-full w-full object-cover"
              />
            ) : (
              <Camera className="h-7 w-7" />
            )}
            <input
              type="file"
              accept="image/*"
              capture="user"
              onChange={(event) => setPhoto(event.target.files?.[0] || null)}
              className="hidden"
            />
            <span className="absolute inset-x-0 bottom-0 bg-slate-950/75 py-1 text-center text-[10px]">
              Photo
            </span>
          </label>
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
          <Field label="Skills" wide>
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
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white sm:col-span-2 disabled:opacity-50"
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
