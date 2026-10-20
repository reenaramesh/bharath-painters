import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import api from "../api/client";
import { Dialog } from "./ui/Dialog";

export default function AssignHiringOutcomeDialog({ sourceType, sourceId, onClose }) {
  const [schedules, setSchedules] = useState([]);
  const [scheduleId, setScheduleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.get("/jobs/work-schedules/")
      .then(({ data }) => {
        if (!active) return;
        setSchedules((Array.isArray(data) ? data : []).filter((item) => item.status === "CONFIRMED"));
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.detail || "Confirmed schedules could not be loaded.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!scheduleId) {
      setError("Choose a confirmed work schedule.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post(`/jobs/hiring-outcomes/${sourceType}/${sourceId}/assign/`, { schedule_id: Number(scheduleId) });
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.response?.data?.schedule_id || "The applicator could not be assigned.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title="Assign to project" description="Choose one of your mutually confirmed schedules." icon={CalendarDays} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {loading ? <p role="status" className="text-sm text-slate-600">Loading confirmed schedules…</p> : (
          <label className="block space-y-2 text-sm font-semibold text-slate-700">
            Work schedule
            <select value={scheduleId} onChange={(event) => setScheduleId(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base" disabled={saving}>
              <option value="">Choose a schedule</option>
              {schedules.map((item) => <option key={item.id} value={item.id}>{item.quotation_number || `Project ${item.quotation}`} · {item.proposed_start_date} to {item.proposed_end_date}</option>)}
            </select>
          </label>
        )}
        <p className="text-sm text-slate-600">This links the accepted hiring outcome to the selected project. It does not create permanent employment.</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!loading && schedules.length === 0 && !error && <p className="text-sm text-amber-800">No mutually confirmed schedules are available.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2.5 font-semibold" disabled={saving}>Cancel</button>
          <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50" disabled={loading || saving || !schedules.length}>{saving ? "Saving…" : "Assign to project"}</button>
        </div>
      </form>
    </Dialog>
  );
}
