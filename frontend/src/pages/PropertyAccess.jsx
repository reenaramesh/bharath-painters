import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Share2 } from "lucide-react";
import api from "../api/client";
import { ErrorState, LoadingState, PageHeader, SectionCard, StatusBadge } from "../components/ui";

export default function PropertyAccess() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dialogRef = useRef(null);
  const [property, setProperty] = useState(null);
  const [access, setAccess] = useState(null);
  const [dialogAction, setDialogAction] = useState(null);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [propertyResponse, accessResponse] = await Promise.all([
        api.get(`/quotations/customer-portal/properties/${id}/`),
        api.get(`/quotations/properties/${id}/invitations/`),
      ]);
      setProperty(propertyResponse.data.property);
      setAccess(accessResponse.data);
    } catch (requestError) {
      setError(requestError.response?.status === 403
        ? "Only the primary property contact can manage access."
        : requestError.response?.data?.detail || "Property access could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialogAction && !dialog.open) dialog.showModal();
    if (!dialogAction && dialog.open) dialog.close();
  }, [dialogAction]);

  async function performAction() {
    if (!dialogAction || busy) return;
    setBusy(true);
    setError("");
    try {
      const action = dialogAction.type;
      if (action === "leave") {
        await api.post(`/quotations/properties/${id}/contacts/leave/`);
        navigate("/customer-properties", { replace: true, state: { propertyLeft: true } });
        return;
      }
      if (action === "transfer-primary") {
        await api.post(`/quotations/properties/${id}/contacts/transfer-primary/`, { contact_id: dialogAction.contact.id });
        setStatusMessage(`${dialogAction.contact.name} is now the primary contact.`);
      } else if (action === "remove") {
        await api.post(`/quotations/properties/${id}/contacts/remove/`, { contact_id: dialogAction.contact.id });
        setStatusMessage(`${dialogAction.contact.name} no longer has access.`);
      } else if (action === "revoke") {
        await api.post(`/quotations/property-invitations/${dialogAction.invitation.id}/revoke/`);
        setStatusMessage("Invitation revoked.");
      }
      setDialogAction(null);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "That access change could not be completed.");
      setDialogAction(null);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading property access…" />;
  if (!access || !property) return <ErrorState message={error || "Property access is unavailable."} onRetry={load} />;

  const primary = access.contacts.find((contact) => contact.is_primary);
  const isPrimary = property.is_primary_contact;
  const pendingInvitations = access.invitations.filter((invitation) => invitation.status === "PENDING");

  return <main className="mx-auto max-w-5xl space-y-6 pb-10">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link to={`/customer-properties/${id}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b9b]">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to property
      </Link>
      <Link to={`/customer-properties/${id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#176b9b] px-4 text-sm font-bold text-white hover:bg-[#12577f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#102331]"><Share2 aria-hidden="true" className="h-4 w-4" />Share Access</Link>
    </div>
    <PageHeader
      eyebrow="Property permissions"
      title="People with access"
      description={`${property.name || property.property_type}${property.city ? ` · ${property.city}` : ""}. Review who can see property information and invite another customer.`}
    />
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3 sm:p-5" aria-label="Property access summary">
      <Summary label="Contacts" value={access.contacts.length} detail="Active customer accounts" />
      <Summary label="Pending invitations" value={pendingInvitations.length} detail="Links awaiting acceptance" />
      <Summary label="Primary contact" value={primary?.name || "Not assigned"} detail={primary ? "Can transfer primary access" : "Contact support"} />
    </section>

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {statusMessage && <p role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{statusMessage}</p>}

    <Link to={`/customer-properties/${id}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#176b9b] px-5 text-sm font-bold text-white hover:bg-[#12577f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#102331]"><Share2 aria-hidden="true" className="h-4 w-4" />Open property overview to share access</Link>

    <SectionCard title="Current contacts" description="Primary contact succession is explicit; a primary contact must transfer responsibility before leaving." bodyClassName="p-0">
      {access.contacts.length ? <ul className="divide-y divide-slate-200">
        {access.contacts.map((contact) => <li key={contact.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-950">{contact.name}</p>
            <p className="mt-1 text-sm text-slate-600">{relationshipName(contact.relationship)} · {accessName(contact.access_level)}{contact.is_primary ? " · Primary contact" : ""}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={contact.status} label={contact.is_primary ? "Primary contact" : contact.status === "PENDING" ? "Awaiting acceptance" : accessName(contact.access_level)} tone={contact.is_primary || contact.status === "ACTIVE" ? "success" : "warning"} />
            {isPrimary && !contact.is_primary && <>
              {contact.status === "ACTIVE" && <button type="button" onClick={() => setDialogAction({ type: "transfer-primary", contact })} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-bold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176b9b]">Transfer primary</button>}
              <button type="button" onClick={() => setDialogAction({ type: "remove", contact })} className="min-h-11 rounded-lg border border-red-200 px-3 text-sm font-bold text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600">Remove access</button>
            </>}
          </div>
        </li>)}
      </ul> : <p className="p-5 text-sm text-slate-600">No property contacts are listed yet.</p>}
    </SectionCard>

    <SectionCard title="Pending invitations" description="An invitation only grants access after the intended customer accepts it." bodyClassName="p-0">
      {pendingInvitations.length ? <ul className="divide-y divide-slate-200">
        {pendingInvitations.map((invitation) => <li key={invitation.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div><p className="font-bold">{invitation.invitee_name || invitation.invitee_mobile || invitation.invitee_email}</p><p className="mt-1 text-sm text-slate-600">{relationshipName(invitation.relationship)} · {accessName(invitation.access_level)} · Expires {new Date(invitation.expires_at).toLocaleDateString("en-IN")}</p></div>
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-xs text-slate-500">The invite link is shown once when created.</span>
            {isPrimary && <button type="button" onClick={() => setDialogAction({ type: "revoke", invitation })} className="min-h-11 rounded-lg border border-red-200 px-3 text-sm font-bold text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600">Revoke invitation</button>}
          </div>
        </li>)}
      </ul> : <p className="p-5 text-sm text-slate-600">No invitations are waiting for acceptance.</p>}
    </SectionCard>

    <div className="flex justify-end">
      {!isPrimary && <button type="button" onClick={() => setDialogAction({ type: "leave" })} className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-bold text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600">Leave this property</button>}
      {isPrimary && <button type="button" onClick={() => setDialogAction({ type: "leave" })} className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-bold text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600">Leave this property</button>}
    </div>

    <dialog ref={dialogRef} onCancel={() => setDialogAction(null)} className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-slate-200 p-0 shadow-2xl backdrop:bg-slate-950/50">
      <div className="p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-[#176b9b]">Confirm access change</p>
        <h2 className="mt-2 text-xl font-extrabold text-slate-950">{dialogTitle(dialogAction)}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{dialogDescription(dialogAction, property.name || property.property_type)}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setDialogAction(null)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176b9b]">Keep access unchanged</button>
          <button type="button" disabled={busy} aria-busy={busy} onClick={performAction} className="min-h-11 rounded-xl bg-red-700 px-4 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">{busy ? "Saving…" : dialogAction?.type === "transfer-primary" ? "Transfer primary contact" : dialogAction?.type === "revoke" ? "Revoke invitation" : dialogAction?.type === "remove" ? "Remove access" : "Leave property"}</button>
        </div>
      </div>
    </dialog>
  </main>;
}

function Summary({ label, value, detail }) {
  return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 truncate text-lg font-extrabold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-600">{detail}</p></div>;
}

function relationshipName(value) { return ({ OWNER: "Owner", TENANT: "Tenant", PROPERTY_MANAGER: "Property manager", FACILITY_MANAGER: "Facility manager", OTHER: "Other" })[value] || "Not specified"; }
function accessName(value) { return ({ VIEW_ONLY: "View only", SITE_COORDINATION: "Site coordination", QUOTATION_APPROVAL: "Quotation & approval", FINANCE: "Finance", PROPERTY_MANAGEMENT: "Property management", FULL_ACCESS: "Full access", CUSTOM: "Custom" })[value] || "Access"; }

function dialogTitle(action) {
  if (action?.type === "transfer-primary") return `Make ${action.contact.name} the primary contact?`;
  if (action?.type === "remove") return `Remove ${action.contact.name} from this property?`;
  if (action?.type === "revoke") return "Revoke this invitation?";
  return "Leave this property?";
}

function dialogDescription(action, propertyName) {
  if (action?.type === "transfer-primary") return `${action.contact.name} will become responsible for primary property decisions. You will remain an owner contact.`;
  if (action?.type === "remove") return `${action.contact.name} will lose access to ${propertyName} and its shared project updates.`;
  if (action?.type === "revoke") return "The recipient will no longer be able to accept this invitation link.";
  return `You will lose access to ${propertyName}. If you are the primary contact, transfer that role before leaving.`;
}
