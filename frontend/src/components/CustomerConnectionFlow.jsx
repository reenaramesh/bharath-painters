import { useState } from "react";
import { CheckCircle2, Clock3, Link2, Search, ShieldCheck, X } from "lucide-react";
import api from "../api/client";

export default function CustomerConnectionFlow({ onClose, onNewCustomer, onConnected }) {
  const [mobile, setMobile] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function check(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/quotations/customers/check-mobile/", { mobile });
      setResult(data);
    } catch (requestError) {
      setError(messageFrom(requestError, "Customer could not be checked."));
    } finally {
      setBusy(false);
    }
  }

  async function requestConnection() {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/quotations/contractor/customer-connections/request/", { mobile });
      setResult(data);
      onConnected?.();
    } catch (requestError) {
      const response = requestError.response?.data;
      if (response?.state) setResult(response);
      setError(messageFrom(requestError, "Connection request could not be sent."));
    } finally {
      setBusy(false);
    }
  }

  const pending = result?.state === "PENDING";
  const connected = result?.state === "CONNECTED";
  const accountConflict = result?.state === "ACCOUNT_CONFLICT";
  return <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/50 p-0 sm:place-items-center sm:p-4" role="dialog" aria-modal="true">
    <section className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
      <header className="flex items-start justify-between border-b p-5 sm:p-6">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Global customer check</p><h2 className="mt-1 text-xl font-extrabold">Add or connect customer</h2><p className="mt-1 text-sm text-slate-500">One mobile number keeps one Bharath Painters Customer ID.</p></div>
        <button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
      </header>
      <div className="space-y-4 p-5 sm:p-6">
        {!result && <form onSubmit={check} className="space-y-4">
          <label className="block text-sm font-bold text-slate-700">Customer mobile number
            <span className="mt-2 flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-3 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100"><Search className="h-5 w-5 text-slate-400" /><input autoFocus required inputMode="numeric" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="10-digit mobile number" className="w-full outline-none" /></span>
          </label>
          <button disabled={busy} className="w-full rounded-xl bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-60">{busy ? "Checking..." : "Check customer"}</button>
        </form>}

        {result?.state === "NEW" && <Result icon={CheckCircle2} tone="emerald" title="New customer" text={result.message}>
          <button onClick={() => onNewCustomer(mobile)} className="w-full rounded-xl bg-slate-950 px-4 py-3 font-bold text-white">Continue customer creation</button>
        </Result>}

        {accountConflict && <Result icon={ShieldCheck} tone="red" title={`Registered as ${result.account_role || "another account"}`} text={result.message}>
          <p className="rounded-xl bg-white/80 p-3 text-xs font-semibold">Use a different mobile number for the customer. Existing Contractor or Painter login details cannot be converted from this screen.</p>
        </Result>}

        {result?.customer_exists && !pending && !connected && <Result icon={ShieldCheck} tone="indigo" title="Customer already registered" text={result.message}>
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-white p-3 text-sm"><span><small className="block text-slate-400">Customer ID</small><b>{result.customer_id}</b></span><span><small className="block text-slate-400">Mobile</small><b>{result.mobile}</b></span></div>
          {result.can_request && <button onClick={requestConnection} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white disabled:opacity-60"><Link2 className="h-4 w-4" />{busy ? "Sending..." : "Send connection request"}</button>}
          {result.cooldown_until && !result.can_request && <p className="mt-3 text-xs font-semibold text-amber-700">A new request can be sent after {new Date(result.cooldown_until).toLocaleDateString("en-IN")}.</p>}
        </Result>}

        {pending && <Result icon={Clock3} tone="amber" title="Connection request pending" text={result.message || "Waiting for customer approval."} />}
        {connected && <Result icon={CheckCircle2} tone="emerald" title="Already connected" text={result.message}><button onClick={onClose} className="w-full rounded-xl bg-slate-950 px-4 py-3 font-bold text-white">View customers</button></Result>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {result && !pending && <button onClick={() => { setResult(null); setError(""); }} className="w-full text-sm font-bold text-slate-500">Check another number</button>}
      </div>
    </section>
  </div>;
}

function Result({ icon: Icon, tone, title, text, children }) {
  const colors = tone === "emerald" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "red" ? "bg-red-50 text-red-700" : "bg-indigo-50 text-indigo-700";
  return <div className={`rounded-2xl p-5 ${colors}`}><Icon className="h-7 w-7" /><h3 className="mt-3 text-lg font-extrabold">{title}</h3><p className="mt-1 text-sm leading-6">{text}</p>{children && <div className="mt-4">{children}</div>}</div>;
}

function messageFrom(error, fallback) {
  const data = error.response?.data;
  if (!data) return fallback;
  return data.detail || data.message || Object.values(data).flat().join(" ") || fallback;
}
