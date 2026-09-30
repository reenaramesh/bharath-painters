import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, MapPin } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";

const endpoint = "/quotations/admin-integrations/google-maps/";

export default function AdminIntegrations() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    api.get(endpoint).then(({ data }) => setStatus(data)).catch(() => setError("API settings could not be loaded."));
  }, [user?.role]);

  async function save(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const { data } = await api.put(endpoint, { api_key: apiKey.trim() });
      setStatus(data); setApiKey(""); setShowKey(false);
      setMessage("Google Maps API key saved. Contractors can now fetch a completed project's address from a supported Maps place link.");
    } catch (requestError) {
      setError(requestError.response?.data?.api_key || requestError.response?.data?.detail || "The API key could not be saved.");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm("Remove the saved Maps API key? Address lookup will use the server environment key if one exists.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { data } = await api.delete(endpoint);
      setStatus(data); setApiKey("");
      setMessage("Saved API key removed.");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "The API key could not be removed.");
    } finally { setBusy(false); }
  }

  if (user?.role !== "ADMIN") return <p className="rounded-xl border bg-white p-6">Administrator access only.</p>;
  return <div className="mx-auto max-w-3xl space-y-5">
    <header><p className="text-sm font-semibold text-[var(--app-primary)]">Administration</p><h1 className="mt-1 text-3xl font-bold">API Settings</h1><p className="mt-2 text-sm text-slate-600">Manage integrations used by the application without editing server code.</p></header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
    <section className="rounded-2xl border bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-sky-50 p-2 text-sky-800"><MapPin className="h-5 w-5" /></span><div><h2 className="text-lg font-bold">Google Maps address lookup</h2><p className="mt-1 text-sm text-slate-600">Used when a contractor pastes a Google Maps place link in Completed Projects.</p></div></div>
      <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm"><p><strong>Status:</strong> {status?.configured ? "Configured" : "Not configured"}</p>{status?.source === "ADMIN" && <p className="mt-1"><strong>Saved key:</strong> ••••{status.hint}</p>}{status?.source === "ENVIRONMENT" && <p className="mt-1">A server environment key is active. Saving a key here will replace it for this lookup.</p>}{status?.updated_at && <p className="mt-1 text-xs text-slate-500">Last updated {new Date(status.updated_at).toLocaleString()}</p>}</div>
      <form onSubmit={save} className="mt-5 space-y-3"><label className="block text-sm font-semibold">Google Maps API key<span className="relative mt-2 block"><input required minLength={20} maxLength={300} type={showKey ? "text" : "password"} autoComplete="off" spellCheck="false" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste the key from Google Cloud" className="w-full rounded-xl border px-3 py-3 pr-12 font-normal" /><button type="button" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? "Hide API key" : "Show API key"} className="absolute inset-y-0 right-2 grid w-9 place-items-center text-slate-500">{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label><div className="flex flex-wrap gap-2"><button disabled={busy || !apiKey.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#176b9b] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><KeyRound className="h-4 w-4" />{status?.source === "ADMIN" ? "Replace saved key" : "Save API key"}</button>{status?.source === "ADMIN" && <button type="button" disabled={busy} onClick={remove} className="rounded-xl border px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-50">Remove saved key</button>}</div></form>
      <ol className="mt-6 list-inside list-decimal space-y-1 text-sm text-slate-600"><li>Create an API key in Google Cloud.</li><li>Enable Places API (New) and billing for the project.</li><li>Restrict the key to Places API (New) and the backend server where possible.</li><li>Paste it above. The saved value will be hidden after saving.</li></ol>
    </section>
  </div>;
}
