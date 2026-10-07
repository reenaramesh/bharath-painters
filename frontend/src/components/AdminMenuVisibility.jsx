import { useEffect, useState } from "react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { NAVIGATION } from "../config/navigation";
import { PROTECTED_MENUS } from "../utils/menuVisibility";

export default function AdminMenuVisibility() {
  const { setMenuVisibility } = useAuth();
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.get("/accounts/menu-visibility/").then(({ data }) => { if (active) setDraft(data); }).catch(() => { if (active) setError("Menu settings could not be loaded."); });
    return () => { active = false; };
  }, []);
  async function save(role) {
    setBusy(role); setError(""); setMessage("");
    try {
      const { data } = await api.patch("/accounts/menu-visibility/", { role, disabled: draft[role] || [] });
      setMenuVisibility(data);
      setMessage(`${role === "CONTRACTOR" ? "Contractor" : "Painter"} menus updated.`);
    } catch { setError("Menu settings could not be saved. Try again."); }
    finally { setBusy(""); }
  }
  return <details className="rounded-xl border bg-white p-4">
    <summary className="min-h-11 cursor-pointer font-bold">Contractor &amp; Painter Menus</summary>
    {error && <p role="alert" className="my-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="my-3 text-sm text-emerald-700">{message}</p>}
    {!draft && !error && <p className="py-3 text-sm">Loading menus...</p>}
    {draft && <div className="grid gap-4 md:grid-cols-2">{["CONTRACTOR", "PAINTER"].map((role) => <fieldset key={role} disabled={Boolean(busy)} className="rounded-lg border p-3"><legend className="px-2 text-sm font-bold">{role === "CONTRACTOR" ? "Contractors" : "Painters"}</legend><div className="grid grid-cols-1 gap-1 sm:grid-cols-2">{NAVIGATION.filter((entry) => entry.roles.includes(role) && !PROTECTED_MENUS.has(entry.id)).map((entry) => <label key={entry.id} className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" className="h-4 w-4" checked={!(draft[role] || []).includes(entry.id)} onChange={(event) => { const enabled = event.target.checked; setMessage(""); setDraft((current) => ({ ...current, [role]: enabled ? (current[role] || []).filter((id) => id !== entry.id) : [...(current[role] || []), entry.id] })); }} />{entry.label}</label>)}</div><button type="button" onClick={() => save(role)} className="mt-3 min-h-11 rounded-lg bg-sky-700 px-4 text-sm font-bold text-white">{busy === role ? "Saving..." : "Save menus"}</button></fieldset>)}</div>}
  </details>;
}
