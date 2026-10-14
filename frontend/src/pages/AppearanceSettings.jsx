import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { resolveAppTheme } from "../utils/appTheme";

const presets = [
  { label: "Studio Painterly", primary: "#2563EB", accent: "#F59E0B" },
  { label: "Deep teal", primary: "#395F6E", accent: "#FCB29B" },
  { label: "Indigo", primary: "#4F46E5", accent: "#7771E8" },
  { label: "Forest", primary: "#276749", accent: "#8BBF9F" },
  { label: "Slate", primary: "#4B6470", accent: "#A7C8D5" },
];
const validColor = (value) => /^#[0-9a-fA-F]{6}$/.test(value || "");

export default function AppearanceSettings() {
  const { user, refreshUser } = useAuth();
  const [colors, setColors] = useState(() => resolveAppTheme());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (user) setColors(resolveAppTheme({ app_primary_color: user.app_primary_color, app_accent_color: user.app_accent_color }));
  }, [user]);
  if (!["PAINTER", "CUSTOMER"].includes(user?.role)) return <Navigate to="/dashboard" replace />;

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.patch("/accounts/me/", colors);
      window.dispatchEvent(new CustomEvent("bp-app-theme-changed", { detail: data }));
      await refreshUser();
      setMessage("App colors saved.");
    } catch (requestError) {
      const details = requestError.response?.data;
      setError(Object.values(details || {}).flat().join(" ") || "App colors could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <div className={`mx-auto max-w-3xl space-y-5 ${user?.role === "CUSTOMER" ? "customer-appearance-page" : ""}`}>
    <header className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm bp-ui-page-header"><p className="text-xs font-bold uppercase tracking-widest text-[#2563eb]">Profile settings</p><h1 className="mt-1 text-2xl font-extrabold bp-ui-page-title">Appearance</h1></header>
    <form onSubmit={save} className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
       <h2 className="text-lg font-bold bp-ui-section-heading">Choose a color theme</h2>
       {user.role === "CUSTOMER" && null}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{presets.map((preset) => <button key={preset.label} type="button" aria-pressed={colors.app_primary_color.toUpperCase() === preset.primary && colors.app_accent_color.toUpperCase() === preset.accent} onClick={() => setColors({ app_primary_color: preset.primary, app_accent_color: preset.accent })} className={(`rounded-xl border p-3 text-left text-xs font-bold ${colors.app_primary_color.toUpperCase() === preset.primary && colors.app_accent_color.toUpperCase() === preset.accent ? "border-[#2563eb] ring-2 ring-[#dbeafe]" : "border-slate-200"}`) + " bp-ui-action"}><span className="mb-2 flex h-5 overflow-hidden rounded-md"><span className="flex-1" style={{ background: preset.primary }} /><span className="flex-1" style={{ background: preset.accent }} /></span>{preset.label}</button>)}</div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{[["app_primary_color", "Primary color"], ["app_accent_color", "Accent color"]].map(([field, label]) => <label key={field} className="text-sm font-semibold">{label}<span className="mt-2 flex items-center gap-2"><input type="color" value={validColor(colors[field]) ? colors[field] : "#2563EB"} onChange={(event) => setColors((current) => ({ ...current, [field]: event.target.value.toUpperCase() }))} className="h-11 w-12 cursor-pointer rounded border border-slate-300 p-1" aria-label={`${label} picker`} /><input required pattern="#[0-9a-fA-F]{6}" value={colors[field]} onChange={(event) => setColors((current) => ({ ...current, [field]: event.target.value.toUpperCase() }))} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 font-mono uppercase bp-ui-control" title="Enter a six-digit hex color" /></span></label>)}</div>
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-slate-200 p-3"><span className="grid h-10 w-10 place-items-center rounded-lg font-bold text-white" style={{ background: validColor(colors.app_primary_color) ? colors.app_primary_color : "#2563EB" }}>BP</span><span className="text-sm font-semibold" style={{ color: validColor(colors.app_primary_color) ? colors.app_primary_color : "#2563EB" }}>Buttons and selected navigation</span><span className="ml-auto h-5 w-10 rounded-full" style={{ background: validColor(colors.app_accent_color) ? colors.app_accent_color : "#F59E0B" }} /></div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      <button disabled={saving} className="mt-5 min-h-11 rounded-xl bg-[#2563eb] px-5 font-bold text-white disabled:opacity-50 bp-ui-action">{saving ? "Saving..." : "Save colors"}</button>
    </form>
  </div>;
}
