import { useEffect, useState } from "react";
import { X } from "lucide-react";

const emptyCustomer = { name: "", mobile: "", email: "", gst_number: "", whatsapp: "", address: "", city: "", pincode: "", status: "NEW", notes: "" };

export default function CustomerForm({ initialValue, onSubmit, onClose, saving, error = "" }) {
  const [form, setForm] = useState(emptyCustomer);
  const editing = Boolean(initialValue?.id);

  useEffect(() => {
    setForm(initialValue ? { ...emptyCustomer, ...initialValue } : emptyCustomer);
  }, [initialValue]);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function submit(event) {
    event.preventDefault();
    const payload = Object.fromEntries(
      Object.keys(emptyCustomer).map((key) => [key, form[key] ?? ""]),
    );
    ["name", "mobile", "email", "gst_number", "whatsapp", "address", "city", "pincode", "notes"].forEach((key) => {
      payload[key] = String(payload[key] || "").trim();
    });
    onSubmit(payload);
  }

  const inputClass = "mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-100";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" role="dialog" aria-modal="true">
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="min-w-0"><h2 className="text-base font-bold text-slate-900">{editing ? "Edit customer" : "Add customer"}</h2></div>
          <button onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="min-h-0 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Mobile *<input required inputMode="tel" name="mobile" value={form.mobile} onChange={update} placeholder="10-digit Indian mobile number" className={inputClass} /></label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Full name *<input required name="name" value={form.name} onChange={update} className={inputClass} /></label>
            {editing && <>
            <label className="text-sm font-medium text-slate-700">Email<input type="email" name="email" value={form.email} onChange={update} className={inputClass} /></label>
            <label className="text-sm font-medium text-slate-700">GSTIN (optional)<input name="gst_number" value={form.gst_number} onChange={update} maxLength="30" placeholder="Customer GST number" className={inputClass} /></label>
            <label className="text-sm font-medium text-slate-700">WhatsApp<input name="whatsapp" value={form.whatsapp} onChange={update} className={inputClass} /></label>
            <label className="text-sm font-medium text-slate-700">City<input name="city" value={form.city} onChange={update} className={inputClass} /></label>
            <label className="text-sm font-medium text-slate-700">Pincode<input name="pincode" value={form.pincode} onChange={update} className={inputClass} /></label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Address<textarea name="address" value={form.address} onChange={update} rows="2" className={inputClass} /></label>
            </>}
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold text-slate-700">Cancel</button><button disabled={saving} className="rounded-xl bg-slate-950 px-5 py-2.5 font-semibold text-white disabled:opacity-60">{saving ? "Saving..." : editing ? "Save changes" : "Add customer"}</button></div>
        </form>
      </div>
    </div>
  );
}
