import { useEffect, useId, useRef, useState } from "react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { localDateKey } from "../utils/employeeAttendance.js";
import { overtimeSettingsDraft, overtimeSettingsPayload, overtimeSettingsPreview } from "../utils/employeeOvertimeSettings.js";

const money = value => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rateMoney = value => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
const control = "mt-1 block min-h-11 w-full rounded-lg border px-3 text-sm bp-ui-control";
function failureMessage(failure, fallback) {
  const detail = failure.response?.data;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return Object.values(detail).flat().filter(value => typeof value === "string").join(" ") || fallback;
  return failure.message && !failure.response ? failure.message : fallback;
}

export default function EmployeeOvertimeSettings({ data, onSaved }) {
  const { user } = useAuth();
  const id = useId();
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const editable = user?.role === "CONTRACTOR" && data.is_active !== false;
  const path = `/jobs/in-house-applicators/${data.membership_id}/overtime-settings/`;

  useEffect(() => {
    const request = ++generation.current;
    const controller = new AbortController();
    inFlight.current = false;
    setLoading(true); setSettings(null); setDraft(null); setError(""); setSuccess(""); setSaving(false);
    api.get(path, { signal: controller.signal }).then(response => {
      if (generation.current !== request) return;
      setSettings(response.data); setDraft(overtimeSettingsDraft(response.data, localDateKey()));
    }).catch(failure => {
      if (generation.current === request) setError(failureMessage(failure, "Overtime settings could not be loaded. Try again."));
    }).finally(() => { if (generation.current === request) setLoading(false); });
    return () => { generation.current = request + 1; controller.abort(); };
  }, [path, retry]);

  const update = event => {
    const { name, value } = event.target;
    setDraft(current => ({ ...current, [name]: value })); setSuccess("");
  };
  async function save(event) {
    event.preventDefault();
    if (!editable || inFlight.current) return;
    let payload;
    try { payload = overtimeSettingsPayload(draft, localDateKey()); }
    catch (failure) { setError(failure.message); return; }
    const request = generation.current;
    inFlight.current = true;
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await api.patch(path, payload);
      if (generation.current !== request) return;
      setSettings(response.data); setDraft(overtimeSettingsDraft(response.data, localDateKey()));
      setSuccess("Overtime settings saved.");
      try { await onSaved?.(); }
      catch { if (generation.current === request) setSuccess("Overtime settings saved. The wage summary could not refresh; reload it to see updated totals."); }
    } catch (failure) {
      if (generation.current === request) setError(failureMessage(failure, "Overtime settings could not be saved. Your inputs are retained."));
    } finally {
      if (generation.current === request) { inFlight.current = false; setSaving(false); }
    }
  }
  const previewDraft = editable ? draft : settings && overtimeSettingsDraft(settings, localDateKey());
  const preview = previewDraft && settings ? overtimeSettingsPreview(previewDraft, settings) : null;
  return <section aria-labelledby={`${id}-heading`} className="mt-6 border-t pt-5">
    <h3 id={`${id}-heading`} className="text-lg font-semibold bp-ui-section-heading">Overtime wages</h3>
    <p className="mt-1 text-sm text-slate-600">Set this employee’s OT wage separately from base salary. OT pay uses approved attendance hours. Existing approved attendance keeps its saved rate.</p>
    {loading && <p role="status" className="mt-3 text-sm">Loading overtime settings…</p>}
    {error && <p role="alert" id={`${id}-error`} className="mt-3 text-sm text-red-700">{error}</p>}
    {!loading && !settings && <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-3 min-h-11 rounded-lg border px-4 text-sm bp-ui-control">Retry overtime settings</button>}
    {success && <p role="status" className="employee-success mt-3">{success}</p>}
    {settings && draft && <>
      {editable ? <form onSubmit={save} aria-label="Employee overtime settings" aria-busy={saving} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">OT pay per hour (₹)<input name="overtime_rate_per_hour" type="number" min="0" step="any" inputMode="decimal" value={draft.overtime_rate_per_hour} onChange={update} disabled={saving} aria-describedby={`${id}-fallback`} className={control} /></label>
        <label className="text-xs font-semibold">Effective date<input name="effective_from" required type="date" max={localDateKey()} value={draft.effective_from} onChange={update} disabled={saving} className={control} /></label>
        <p id={`${id}-fallback`} className="text-xs text-slate-600 sm:col-span-2">Leave OT wage blank to use the existing hourly rate or salary fallback. Enter 0 for zero OT pay.</p>
        <div className="sm:col-span-2"><button disabled={saving} className="min-h-11 rounded-lg bg-slate-950 px-4 text-sm text-white disabled:opacity-50 bp-ui-action">{saving ? "Saving overtime…" : "Save overtime settings"}</button></div>
      </form> : <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-600">OT pay per hour</dt><dd className="mt-1 font-semibold">{settings.overtime_rate_per_hour == null ? "Existing hourly / salary fallback" : rateMoney(settings.overtime_rate_per_hour)}</dd></div><div><dt className="text-slate-600">Effective date</dt><dd className="mt-1 font-semibold">{settings.overtime_effective_from || "Existing rate"}</dd></div></dl>}
      <div aria-live="polite" className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
        {preview ? <><p className="font-semibold">{preview.fallback ? "Existing hourly / salary fallback" : "OT hourly rate"}: {rateMoney(preview.hourly)} per hour</p><p className="mt-1">4 approved OT hours = {money(preview.fourHours)}</p></> : <p>{draft.overtime_rate_per_hour.trim() === "" ? "The existing hourly rate or salary fallback will apply after save." : "Enter a valid OT hourly rate to preview OT pay."}</p>}
      </div>
      {!editable && <p className="mt-3 text-xs text-slate-600">{data.is_active === false ? "Removed employees’ overtime settings are read-only." : "Only the contractor can change overtime settings."}</p>}
      {!!settings.overtime_rate_history?.length && <details className="mt-3 rounded-lg border p-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Overtime rate history</summary><ul className="mt-2 space-y-2">{settings.overtime_rate_history.map(row => <li key={row.id} className="border-t pt-2 text-sm"><strong>From {row.effective_from}: {row.hourly_rate == null ? "Existing hourly / salary fallback" : `${rateMoney(row.hourly_rate)} per hour`}</strong><p className="mt-1 text-xs text-slate-600">Recorded {row.recorded_at ? new Date(row.recorded_at).toLocaleString("en-IN") : "date unavailable"}</p></li>)}</ul></details>}
    </>}
  </section>;
}
