import { useState } from "react";
import { Phone, UserRound, X } from "lucide-react";

export default function CustomerConnectionFlow({ onClose, onNewCustomer, quotationTheme = false }) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      await onNewCustomer({ name: name.trim(), mobile: mobile.trim() });
      onClose();
    } catch (requestError) {
      const data = requestError.response?.data;
      setError(getErrorMessage(data));
    } finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
    <section className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b p-5 sm:p-6"><div><h2 className="text-xl font-extrabold">Add customer</h2><p className="mt-2 text-sm text-slate-500">Save contact details now. You can request a connection from the customer profile afterwards.</p></div><button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button></header>
      <form onSubmit={save} className="space-y-4 p-5 sm:p-6">
        <label className="flex items-center gap-2 rounded-xl border px-3 py-3"><UserRound className="h-5 w-5 text-slate-400" /><input autoFocus required aria-label="Customer name" value={name} onChange={event => setName(event.target.value)} placeholder="Customer name" className="w-full outline-none" /></label>
        <label className="flex items-center gap-2 rounded-xl border px-3 py-3"><Phone className="h-5 w-5 text-slate-400" /><input required inputMode="tel" aria-label="Mobile number" value={mobile} onChange={event => setMobile(event.target.value)} placeholder="10-digit mobile number" className="w-full outline-none" /></label>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={busy} className={`w-full rounded-xl px-4 py-3 font-bold text-white disabled:opacity-60 ${quotationTheme ? "bg-[#176b9b]" : "bg-slate-950"}`}>{busy ? "Saving..." : "Save customer"}</button>
      </form>
    </section>
  </div>;
}
