import { useEffect, useRef, useState } from "react";
import { Search, UserRoundCheck, X } from "lucide-react";
import api from "../api/client";

const ACCESS_OPTIONS = [
  ["VIEW_ONLY", "View only"],
  ["SITE_COORDINATION", "Site coordination"],
  ["QUOTATION_APPROVAL", "Quotation & approval"],
  ["FINANCE", "Finance"],
  ["PROPERTY_MANAGEMENT", "Property management"],
  ["FULL_ACCESS", "Full access"],
  ["CUSTOM", "Custom"],
];
const RELATIONSHIPS = [
  ["", "Not specified"],
  ["OWNER", "Owner"],
  ["TENANT", "Tenant"],
  ["PROPERTY_MANAGER", "Property manager"],
  ["FACILITY_MANAGER", "Facility manager"],
  ["OTHER", "Other"],
];
const CUSTOM_OPTIONS = [
  ["view_property", "View property"],
  ["view_measurements", "View measurements"],
  ["view_quotations", "View quotations"],
  ["approve_quotations", "Approve quotations"],
  ["view_jobs", "View jobs"],
  ["view_schedules", "View schedules"],
  ["view_progress", "View progress"],
  ["view_invoices", "View invoices"],
  ["view_payments", "View payments"],
  ["manage_contacts", "Manage contacts"],
  ["invite_contacts", "Invite contacts"],
];

export default function SharePropertyDialog({ open, onClose, propertyId, propertyName, onShared }) {
  const dialogRef = useRef(null);
  const [mobile, setMobile] = useState("");
  const [lookup, setLookup] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [accessLevel, setAccessLevel] = useState("VIEW_ONLY");
  const [customPermissions, setCustomPermissions] = useState([]);
  const [editingAccess, setEditingAccess] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function reset() {
    setMobile(""); setLookup(null); setName(""); setEmail(""); setRelationship("");
    setAccessLevel("VIEW_ONLY"); setCustomPermissions([]); setEditingAccess(false);
    setInviteUrl(""); setError(""); setNotice(""); setBusy(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function searchMobile(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice(""); setLookup(null); setInviteUrl("");
    try {
      const { data } = await api.post(`/quotations/properties/${propertyId}/share-search/`, { mobile });
      setLookup(data);
      setAccessLevel(data.contact?.access_level || data.pending_invitation?.access_level || "VIEW_ONLY");
      setRelationship(data.contact?.relationship || data.pending_invitation?.relationship || "");
      setCustomPermissions(data.contact?.custom_permissions || data.pending_invitation?.custom_permissions || []);
      if (data.found && data.contact?.status === "ACTIVE") setNotice("This customer already has access. Review or edit the current permissions.");
      else if (data.found && data.contact?.status === "PENDING") setNotice("A property access request is already pending.");
      else if (!data.found && data.pending_invitation) setNotice("An invitation is already pending for this number.");
      else if (!data.found) setNotice("No Bharath Painters customer found for this mobile number.");
    } catch (requestError) {
      setError(apiError(requestError, "Customer search could not be completed."));
    } finally { setBusy(false); }
  }

  async function sendInvitation(event) {
    event?.preventDefault();
    if (!lookup || !isUnknown || busy) return;
    if (!name.trim()) {
      setError("Enter the invited person’s name.");
      return;
    }
    setBusy(true); setError(""); setNotice(""); setInviteUrl("");
    try {
      // Search already established that this mobile has no Customer row. The
      // invitation endpoint stores only an invitation; it never creates a Customer.
      const { data } = await api.post(`/quotations/properties/${propertyId}/invitations/`, {
        mobile: lookup.normalized_mobile || mobile,
        name: name.trim(),
        email: email.trim(),
        relationship,
        access_level: accessLevel,
        custom_permissions: accessLevel === "CUSTOM" ? customPermissions : [],
      });
      const rawUrl = data.invite_url || (data.token ? `/join/property/${data.token}` : "");
      if (!rawUrl) throw new Error("Invitation was created, but the API did not return an invitation link.");
      setInviteUrl(new URL(rawUrl, window.location.origin).href);
      setLookup((current) => ({
        ...current,
        pending_invitation: data.invitation || data,
      }));
      setNotice("Invitation created. No Customer record has been created yet.");
      onShared?.();
    } catch (requestError) {
      setError(apiError(requestError, "Invitation could not be created."));
    } finally { setBusy(false); }
  }

  async function shareProperty(event) {
    event?.preventDefault();
    if (!lookup || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { data } = await api.post(`/quotations/properties/${propertyId}/share/`, {
        mobile: lookup.normalized_mobile || mobile,
        customer_id: lookup.customer?.id,
        name,
        email: email.trim(),
        relationship,
        access_level: accessLevel,
        custom_permissions: accessLevel === "CUSTOM" ? customPermissions : [],
      });
      if (data.invite_url) setInviteUrl(new URL(data.invite_url, window.location.origin).href);
      if (data.state === "ACTIVE") {
        setLookup((current) => ({ ...current, contact: data.customer, pending_invitation: null }));
        setNotice(data.already_linked ? "Access permissions updated." : "Property shared.");
        setEditingAccess(false);
      } else if (data.state === "PENDING") {
        setLookup((current) => ({ ...current, contact: data.customer }));
        setNotice("Access request sent. The customer must accept before access is active.");
        setEditingAccess(false);
      } else if (data.state === "INVITATION_PENDING" || data.state === "INVITATION_CREATED") {
        setLookup((current) => ({ ...current, pending_invitation: data.invitation }));
        setNotice(data.reused ? "Existing invitation resent." : "Invitation created. No Customer record has been created yet.");
      }
      onShared?.();
    } catch (requestError) {
      setError(apiError(requestError, "Property could not be shared."));
    } finally { setBusy(false); }
  }

  async function cancelPending() {
    if (!lookup || busy) return;
    setBusy(true); setError("");
    try {
      if (lookup.contact?.status === "PENDING") {
        await api.post(`/quotations/properties/${propertyId}/contacts/remove/`, { contact_id: lookup.contact.id });
      }
      if (lookup.pending_invitation?.id) {
        await api.post(`/quotations/property-invitations/${lookup.pending_invitation.id}/revoke/`);
      }
      setLookup((current) => ({ ...current, contact: null, pending_invitation: null }));
      setNotice("Pending property access was cancelled.");
      onShared?.();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Pending access could not be cancelled.");
    } finally { setBusy(false); }
  }

  function togglePermission(permission) {
    setCustomPermissions((current) => current.includes(permission)
      ? current.filter((value) => value !== permission)
      : [...current, permission]);
  }

  const existingActive = lookup?.found && lookup.contact?.status === "ACTIVE";
  const existingPending = lookup?.found && lookup.contact?.status === "PENDING";
  const invitationPending = Boolean(lookup?.pending_invitation) && !lookup?.customer?.has_account;
  const isUnknown = lookup && !lookup.found && !lookup.account_conflict;
  const needsAccessForm = !invitationPending && (isUnknown || (lookup?.found && (!existingActive || editingAccess)));

  return <dialog ref={dialogRef} onClose={() => { if (open) close(); }} onCancel={close} aria-labelledby="share-property-title" className="property-share-dialog m-auto w-[min(94vw,38rem)] max-h-[92dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/50">
    <div className="property-share-header sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5 sm:p-6">
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-[#176b9b]">Project overview</p><h2 id="share-property-title" className="mt-1 text-xl font-extrabold">Share access</h2><p className="mt-1 text-sm text-slate-600">{propertyName || "Property"}</p></div>
      <button type="button" onClick={close} aria-label="Close share access" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176b9b]"><X aria-hidden="true" className="h-5 w-5" /></button>
    </div>
    <div className="property-share-body space-y-5 p-5 sm:p-6">
      <form onSubmit={searchMobile} className="space-y-3">
        <label htmlFor="share-property-mobile" className="block text-sm font-bold text-slate-800">Mobile number</label>
        <div className="flex gap-2">
          <input id="share-property-mobile" autoFocus type="tel" inputMode="tel" autoComplete="tel" value={mobile} onChange={(event) => { setMobile(event.target.value); setLookup(null); setInviteUrl(""); }} placeholder="Enter mobile number" className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176b9b]" />
          <button type="submit" disabled={busy || !mobile.trim()} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-[#102331] px-4 text-sm font-bold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b9b]"><Search aria-hidden="true" className="h-4 w-4" />Search</button>
        </div>
      </form>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" aria-live="polite" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">{notice}</p>}

      {lookup?.found && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4" aria-label="Existing Bharath customer">
        <div className="flex items-start gap-3"><UserRoundCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div className="min-w-0"><p className="text-sm font-bold text-emerald-900">Existing Bharath customer found</p><p className="mt-1 font-semibold text-slate-950">{lookup.customer.name}</p><p className="mt-1 text-sm text-slate-700">{lookup.customer.mobile} · Customer ID: {lookup.customer.bharath_id}</p></div></div>
        {existingActive && <div className="mt-4 rounded-lg bg-white/80 p-3 text-sm"><p className="font-semibold">Already has access</p><p className="mt-1">{accessName(lookup.contact.access_level)}{lookup.contact.relationship ? ` · ${relationshipName(lookup.contact.relationship)}` : ""}</p></div>}
        {existingPending && <p className="mt-3 text-sm font-semibold text-amber-900">Property access request pending customer acceptance.</p>}
      </section>}

      {lookup?.account_conflict && <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{lookup.message || "This mobile number belongs to a different Bharath account type."}</section>}
      {isUnknown && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="font-bold text-amber-950">No Bharath Painters account found for this mobile number.</p>{lookup.account_exists_without_customer && <p className="mt-1 text-sm text-amber-900">An account exists without a Customer record. The invitation flow will reuse the same mobile identity.</p>}</section>}

      {lookup?.found && existingActive && !editingAccess && <div className="flex flex-wrap gap-2">{lookup.can_edit_access && <button type="button" onClick={() => setEditingAccess(true)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176b9b]">Edit Access</button>}<button type="button" onClick={close} className="min-h-11 rounded-xl bg-[#102331] px-4 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b9b]">Done</button></div>}

      {(existingPending || invitationPending) && <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={shareProperty} className="min-h-11 rounded-xl bg-[#176b9b] px-4 text-sm font-bold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b9b]">{invitationPending ? "Resend invitation" : "Resend share request"}</button><button type="button" disabled={busy} onClick={cancelPending} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176b9b]">Cancel pending access</button></div>}

      {needsAccessForm && <form onSubmit={isUnknown ? sendInvitation : shareProperty} className="space-y-4 border-t border-slate-200 pt-4">
        {isUnknown && <>
          <Field label="Name" value={name} onChange={setName} required />
          <Field label="Mobile number" value={mobile} onChange={setMobile} readOnly />
          <Field label="Email (optional)" type="email" value={email} onChange={setEmail} />
        </>}
        <label className="block text-sm font-semibold">Relationship <span className="font-normal text-slate-500">(optional)</span><select value={relationship} onChange={(event) => setRelationship(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176b9b]">{RELATIONSHIPS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="block text-sm font-semibold">Access<select value={accessLevel} onChange={(event) => setAccessLevel(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176b9b]">{ACCESS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {accessLevel === "CUSTOM" && <fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-semibold">Choose permissions</legend><div className="grid gap-2 sm:grid-cols-2">{CUSTOM_OPTIONS.map(([value, label]) => <label key={value} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={customPermissions.includes(value)} onChange={() => togglePermission(value)} className="h-4 w-4 accent-[#176b9b]" />{label}</label>)}</div></fieldset>}
        <button type="submit" disabled={busy} aria-busy={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#176b9b] px-5 text-sm font-bold text-white hover:bg-[#12577f] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#102331]">{busy ? (isUnknown ? "Sending invitation…" : "Sharing…") : isUnknown ? "Send Invitation" : existingActive ? "Save Access" : "Share Property"}</button>
      </form>}

      {inviteUrl && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4" aria-labelledby="share-invitation-created-title">
        <h3 id="share-invitation-created-title" className="font-bold text-emerald-950">Invitation created</h3>
        <p className="mt-1 text-sm text-emerald-900">{name.trim()}</p>
        <p className="text-sm text-emerald-900">{lookup?.normalized_mobile || mobile}</p>
        <label htmlFor="share-property-invite-url" className="mt-4 block text-sm font-semibold text-slate-800">Signup link</label>
        <textarea rows={3} id="share-property-invite-url" readOnly value={inviteUrl} onFocus={(event) => event.target.select()} className="property-share-invite-link mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(inviteUrl); setNotice("Invitation link copied."); } catch { setError("Select and copy the invitation link above."); } }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176b9b]">Copy Invitation Link</button>
          <a href={`https://wa.me/?text=${encodeURIComponent(`Join ${propertyName || "this property"} on Bharath Apps: ${inviteUrl}`)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-emerald-300 bg-white px-4 text-sm font-bold text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176b9b]">Share via WhatsApp</a>
          <button type="button" onClick={close} className="min-h-11 rounded-lg bg-[#102331] px-4 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b9b]">Done</button>
        </div>
      </section>}
    </div>
  </dialog>;
}

function Field({ label, value, onChange, required = false, readOnly = false, type = "text" }) {
  return <label className="block text-sm font-semibold">{label}<input type={type} required={required} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176b9b] read-only:bg-slate-50" /></label>;
}

function apiError(error, fallback) {
  const data = error.response?.data;
  const detail = data?.detail || data?.mobile || data?.email;
  if (detail) return detail;
  if (data && typeof data === "object") {
    const messages = Object.values(data).flat().filter(Boolean);
    if (messages.length) return messages.join(" ");
  }
  if (error.response?.status) {
    return `The server returned HTTP ${error.response.status}. ${fallback}`;
  }
  return error.message || `Could not reach the server. ${fallback}`;
}

function relationshipName(value) { return RELATIONSHIPS.find(([key]) => key === value)?.[1] || ""; }
function accessName(value) { return ACCESS_OPTIONS.find(([key]) => key === value)?.[1] || "Access"; }
