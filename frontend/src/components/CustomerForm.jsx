import { useEffect, useRef, useState } from "react";
import ContractorDialog from './ContractorDialog';
import useDraftUnsavedChanges from '../hooks/useDraftUnsavedChanges';

const emptyCustomer = { name: "", mobile: "", email: "", gst_number: "", whatsapp: "", address: "", city: "", pincode: "", status: "NEW", notes: "" };

export default function CustomerForm({ initialValue, onSubmit, onClose, saving, error = "", open = true, preserveDraft = false, draftPath }) {
  const [form, setForm] = useState(emptyCustomer);
  const [dirty, setDirty] = useState(false);
  const baseline = useRef(emptyCustomer);
  const editing = Boolean(initialValue?.id);
  useDraftUnsavedChanges(dirty, preserveDraft, { preservePathname: draftPath });

  useEffect(() => {
    if (preserveDraft && dirty) return;
    const next = initialValue ? { ...emptyCustomer, ...initialValue } : emptyCustomer;
    baseline.current = next;
    setForm(next);
  }, [initialValue, preserveDraft, dirty]);

  function update(event) {
    if (preserveDraft) setDirty(true);
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const payload = Object.fromEntries(
      Object.keys(emptyCustomer).map((key) => [key, form[key] ?? ""]),
    );
    ["name", "mobile", "email", "gst_number", "whatsapp", "address", "city", "pincode", "notes"].forEach((key) => {
      payload[key] = String(payload[key] || "").trim();
    });
    const changedFields = Object.keys(emptyCustomer).filter(key => String(payload[key] ?? '').trim() !== String(baseline.current[key] ?? '').trim());
    const accepted = await onSubmit(payload, preserveDraft ? { changedFields } : undefined);
    if (accepted === true) setDirty(false);
  }

  const inputClass = "mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-100";

  if (!open) return null;
  return (
    <ContractorDialog title={editing ? 'Edit customer' : 'Add customer'} description="Contact details and customer information." onClose={onClose} popupProtection={preserveDraft ? 'handled' : undefined}>
        <form onSubmit={submit} className="min-h-0 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
          <fieldset disabled={saving} className="grid min-w-0 gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Mobile *<input required inputMode="tel" name="mobile" value={form.mobile} onChange={update} placeholder="10-digit Indian mobile number" className={(inputClass) + " bp-ui-control"} /></label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Full name *<input required name="name" value={form.name} onChange={update} className={(inputClass) + " bp-ui-control"} /></label>
            {editing && <>
            <label className="text-sm font-medium text-slate-700">Email<input type="email" name="email" value={form.email} onChange={update} className={(inputClass) + " bp-ui-control"} /></label>
            <label className="text-sm font-medium text-slate-700">GSTIN (optional)<input name="gst_number" value={form.gst_number} onChange={update} maxLength="30" placeholder="Customer GST number" className={(inputClass) + " bp-ui-control"} /></label>
            <label className="text-sm font-medium text-slate-700">WhatsApp<input name="whatsapp" value={form.whatsapp} onChange={update} className={(inputClass) + " bp-ui-control"} /></label>
            <label className="text-sm font-medium text-slate-700">City<input name="city" value={form.city} onChange={update} className={(inputClass) + " bp-ui-control"} /></label>
            <label className="text-sm font-medium text-slate-700">Pincode<input name="pincode" value={form.pincode} onChange={update} className={(inputClass) + " bp-ui-control"} /></label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Address<textarea name="address" value={form.address} onChange={update} rows="2" className={(inputClass) + " bp-ui-control"} /></label>
            </>}
          </fieldset>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 bp-ui-action">Cancel</button><button disabled={saving} className="rounded-xl bg-slate-950 px-5 py-2.5 font-semibold text-white disabled:opacity-60 bp-ui-action">{saving ? "Saving..." : editing ? "Save changes" : "Add customer"}</button></div>
        </form>
    </ContractorDialog>
  );
}
