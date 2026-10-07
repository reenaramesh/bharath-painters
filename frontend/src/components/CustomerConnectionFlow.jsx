import { useState } from "react";
import { Phone, UserRound, X } from "lucide-react";
import api from "../api/client";

export default function CustomerConnectionFlow({ onClose, onNewCustomer, quotationTheme = false }) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lookup, setLookup] = useState(null);

  function getErrorMessage(data) {
    if (typeof data === "string") {
      return "Customer could not be saved due to a server error. Please try again shortly.";
    }
    if (data?.detail || data?.message) return data.detail || data.message;
    const messages = Object.values(data || {}).flatMap((value) =>
      Array.isArray(value) ? value : [value],
    ).filter((value) => typeof value === "string" && value.trim());
    return messages.join(" ") || "Customer could not be saved. Please try again.";
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data: checked } = await api.post("/quotations/customers/check-mobile/", { mobile: mobile.trim() });
      if (checked.state === "ACCOUNT_CONFLICT") throw new Error(checked.message);
      setLookup(checked);
      await onNewCustomer({ name: name.trim(), mobile: mobile.trim() });
      onClose();
    } catch (requestError) {
      const data = requestError.response?.data;
      setError(requestError.message && !data ? requestError.message : getErrorMessage(data));
    } finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
    <section className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b bg-white p-4 sm:p-5"><div className="min-w-0"><h2 className="text-base font-extrabold">Add customer</h2></div><button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button></header>
      <form onSubmit={save} className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
        <label className="flex items-center gap-2 rounded-xl border px-3 py-3"><Phone className="h-5 w-5 text-slate-400" /><input autoFocus required inputMode="tel" aria-label="Mobile number" value={mobile} onChange={event => { setMobile(event.target.value); setLookup(null); }} placeholder="Mobile number" className="w-full outline-none" /></label>
        <label className="flex items-center gap-2 rounded-xl border px-3 py-3"><UserRound className="h-5 w-5 text-slate-400" /><input required aria-label="Customer name" value={name} onChange={event => setName(event.target.value)} placeholder="Customer name" className="w-full outline-none" /></label>
        {lookup && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{lookup.customer_exists ? "Existing customer found. A connection request will be sent if one is not already pending." : "New customer account will be created."}</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={busy} className={`w-full rounded-xl px-4 py-3 font-bold text-white disabled:opacity-60 ${quotationTheme ? "bg-[#176b9b]" : "bg-slate-950"}`}>{busy ? "Saving..." : "Save customer"}</button>
      </form>
    </section>
  </div>;
}
