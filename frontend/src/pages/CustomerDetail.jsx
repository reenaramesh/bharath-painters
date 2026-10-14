import useMobileView from "../hooks/useMobileView.js";
import { recentFirst } from "../utils/workspaceLists.js";
import "./mobile-workspace.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Edit3,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  X,
} from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import CustomerAccountStatus from "../components/CustomerAccountStatus";
import CustomerActivationShare from "../components/CustomerActivationShare";
import { customerAccountStatus } from "../utils/customerActivation";
import CustomerForm from "../components/CustomerForm";
import BackButton from "../components/BackButton";
import { ErrorState, LoadingState, PageHeader, StatusBadge } from "../components/ui";
import "./crm-pages.css";

export default function CustomerDetail() {
  const mobile = useMobileView();
  const { id } = useParams();
  const { user } = useAuth();
  const [activationLink, setActivationLink] = useState(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const linkBusy = useRef(false);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [followUp, setFollowUp] = useState({
    follow_up_type: "CALL",
    comment: "",
    next_follow_up: "",
  });
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [completingId, setCompletingId] = useState(null);
  const [callEvents, setCallEvents] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/quotations/customers/${id}/`);
      setCustomer(data);
      setError("");
    } catch {
      setError("Customer details could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    let active = true;
    api.get(`/call-inbox/customers/${id}/events/`).then(({ data }) => {
      if (active) setCallEvents(data.results || []);
    }).catch(() => { if (active) setCallEvents([]); });
    return () => { active = false; };
  }, [id]);
  useEffect(() => {
    const openFollowUp = () => setShowFollowUp(true);
    window.addEventListener("bp-open-customer-followup", openFollowUp);
    return () => window.removeEventListener("bp-open-customer-followup", openFollowUp);
  }, []);

  async function shareActivation() {
    if (linkBusy.current) return;
    linkBusy.current = true;
    setLinkLoading(true);
    setError("");
    try {
      const { data } = await api.post(`/quotations/customers/${id}/${activationLink ? "share-link" : "activate-account"}/`);
      if (data.share_link) setActivationLink({ ...customer, ...data, id: customer.id });
      else {
        setActivationLink(null);
        await load();
      }
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Activation link could not be prepared.");
    } finally {
      linkBusy.current = false;
      setLinkLoading(false);
    }
  }

  async function updateCustomer(values) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const editableFields = [
        "name",
        "mobile",
        "email",
        "whatsapp",
        "address",
        "city",
        "pincode",
        "status",
        "notes",
      ];
      const normalize = (field, value) => {
        if (value == null) return "";
        return String(value).trim();
      };
      const changes = Object.fromEntries(
        editableFields
          .filter(
            (field) =>
              normalize(field, values[field]) !==
              normalize(field, customer[field]),
          )
          .map((field) => [field, values[field]]),
      );

      if (Object.keys(changes).length === 0) {
        setEditing(false);
        setSuccess("No changes were needed.");
        return;
      }

      await api.patch(`/quotations/customers/${id}/`, changes);
      const { data } = await api.get(`/quotations/customers/${id}/`);
      const failedFields = Object.keys(changes).filter(
        (field) =>
          normalize(field, data[field]) !== normalize(field, changes[field]),
      );
      if (failedFields.length > 0) {
        throw new Error(`The server did not save: ${failedFields.join(", ")}.`);
      }
      setCustomer(data);
      setEditing(false);
      setSuccess("Customer details saved successfully.");
    } catch (requestError) {
      setError(
        requestError.response
          ? Object.values(requestError.response.data || {})
              .flat()
              .join(" ") || "Changes could not be saved."
          : requestError.message || "Changes could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function completeFollowUp(item) {
    setCompletingId(item.id);
    try {
      const payload = { is_completed: true };
      if (item.task_type || item.lead) {
        payload.completed_at = new Date().toISOString();
      }
      await api.patch(`/quotations/tasks/${item.id}/`, payload);
      await load();
      setSuccess("Follow-up marked as done.");
    } catch {
      setError("Follow-up could not be completed.");
    } finally {
      setCompletingId(null);
    }
  }

  async function addFollowUp(event) {
    event.preventDefault();
    const isSiteVisit = followUp.follow_up_type === "SITE_VISIT";
    if (isSiteVisit && !followUp.next_follow_up) {
      setError("Select the site visit date and time.");
      return;
    }
    const whatsappWindow =
      isSiteVisit && whatsappUrl ? window.open("", "_blank") : null;
    if (whatsappWindow) whatsappWindow.opener = null;
    setSaving(true);
    setError("");
    try {
      await api.post(`/quotations/customers/${id}/follow-ups/`, {
        ...followUp,
        next_follow_up: followUp.next_follow_up || null,
      });
      setFollowUp({ follow_up_type: "CALL", comment: "", next_follow_up: "" });
      setShowFollowUp(false);
      if (isSiteVisit && whatsappUrl) {
        const visitMessage = `Bharath Apps site visit is scheduled for ${formatSiteVisitDate(followUp.next_follow_up)}. Please contact the contractor if the schedule needs clarification.`;
        const target = `${whatsappUrl}?text=${encodeURIComponent(visitMessage)}`;
        if (whatsappWindow) whatsappWindow.location.href = target;
        else window.open(target, "_blank", "noopener,noreferrer");
        setSuccess(
          "Site visit saved. The customer was notified in the portal and WhatsApp is ready to send.",
        );
      } else {
        if (whatsappWindow) whatsappWindow.close();
        setSuccess(
          isSiteVisit
            ? "Site visit saved and the customer was notified in the portal."
            : "Follow-up added successfully.",
        );
      }
      await load();
    } catch (requestError) {
      if (whatsappWindow) whatsappWindow.close();
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Follow-up could not be added.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function requestConnection() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.post("/quotations/contractor/customer-connections/request/", { mobile: customer.mobile });
      await load();
      setSuccess("Connection request sent. Your saved contact details remain available while approval is pending.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.response?.data?.detail || "Connection request could not be sent.");
    } finally { setSaving(false); }
  }

  if (loading)
    return <div className="crm-page crm-customer-detail"><LoadingState label="Loading customer details..." /></div>;
  if (!customer)
    return (
      <div className="crm-page crm-customer-detail"><ErrorState message={error} onRetry={load} /></div>
    );
  if (customer.is_saved_contact) return <div className="space-y-6 crm-page crm-customer-detail">
    <BackButton fallback="/customers" label="Back to customers" />
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
    <section className="rounded-2xl border bg-white p-6"><PageHeader eyebrow="Customer profile" title={customer.name} description={customer.mobile} actions={<StatusBadge status={customer.connection_status} tone={customer.connection_status === "PENDING" ? "warning" : customer.connection_status === "BLOCKED" ? "danger" : "neutral"} label={customer.connection_status === "PENDING" ? "Connection pending" : customer.connection_status === "BLOCKED" ? "Connection unavailable" : "Not connected"} />} />
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">{[["Email", customer.email], ["WhatsApp", customer.whatsapp], ["Address", customer.address], ["City", customer.city], ["Pincode", customer.pincode]].map(([title, value]) => <div key={title}><dt className="text-xs font-bold uppercase text-slate-400">{title}</dt><dd className="mt-1 text-sm">{value || "Not added"}</dd></div>)}</dl>
      <div className="mt-6 flex flex-wrap items-center gap-3"><button type="button" onClick={() => setEditing(true)} className="rounded-xl border px-4 py-3 text-sm font-bold bp-ui-action">Edit saved details</button><button type="button" disabled={saving || ["PENDING", "BLOCKED"].includes(customer.connection_status)} onClick={requestConnection} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50 bp-ui-action">{saving ? "Sending..." : customer.connection_status === "PENDING" ? "Waiting for customer approval" : customer.connection_status === "BLOCKED" ? "Connection unavailable" : "Send connection request"}</button></div>
    </section>
    <div className="grid gap-6 md:grid-cols-2">
      <Summary
        title="Properties"
        icon={Building2}
        value={customer.properties?.length || 0}
        items={(customer.properties || []).map((item) => ({
          label: item.name || item.property_type || "Property",
          to: "/properties/" + item.id,
          state: { customerPath: "/customers/" + customer.id },
        }))}
        action={<div className="flex flex-wrap items-center gap-4 text-sm font-semibold"><Link to={"/properties?customer=" + customer.id + "&action=add"} className="text-amber-700">Add property</Link><Link to={"/properties?customer=" + customer.id} className="text-slate-600">View all properties</Link></div>}
      />
      <Summary
        title="Quotations"
        icon={FileText}
        value={customer.quotations?.length || 0}
        items={(customer.quotations || []).slice(0, 4).map((item) => ({
          label: (item.quotation_number || "Draft quotation") + (item.status === "DRAFT" ? " · Draft" : ""),
          to: "/quotations/" + item.id,
          state: { customerPath: "/customers/" + customer.id },
        }))}
        action={<div className="flex flex-wrap items-center gap-4 text-sm font-semibold"><Link to={"/quotations/new?customer=" + customer.id} className="text-amber-700">Create quotation draft</Link><Link to={"/quotations?customer=" + customer.id} className="text-slate-600">View quotations</Link></div>}
      />
    </div>
    {editing && <CustomerForm initialValue={customer} onSubmit={updateCustomer} onClose={() => setEditing(false)} saving={saving} error={error} />}
  </div>;

  const inputClass =
    "rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900";
  const followUps = (mobile ? recentFirst(customer.follow_ups || [], ["created_at", "follow_up_date", "next_follow_up"]) : [...(customer.follow_ups || [])])
    .filter((item) => !item.is_completed)
    .sort(
    (first, second) =>
      mobile ? 0 : new Date(second.follow_up_date) - new Date(first.follow_up_date),
  );
  const whatsappUrl = getWhatsAppUrl(customer.whatsapp || customer.mobile);

  return (
    <div className="space-y-6 crm-page crm-customer-detail">
      <BackButton fallback="/customers" label="Back to customers" />
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </div>
      )}
      <section className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 md:flex-row md:items-start">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-950 text-2xl font-bold text-white">
          {customer.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <PageHeader eyebrow="Customer profile" title={customer.name} description={customer.bharath_id || "Customer record"} actions={<StatusBadge status={customer.status} tone={customerStatusTone(customer.status)} />} />
          <CustomerAccountStatus customer={customer} />
          {customerAccountStatus(customer)?.canResend && <button type="button" disabled={linkLoading} onClick={shareActivation} className="mt-3 min-h-11 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 disabled:opacity-50 bp-ui-action">{linkLoading ? "Preparing link..." : "Resend activation link"}</button>}
          {activationLink && <CustomerActivationShare error={error} key={activationLink.share_link} customer={activationLink} contractor={user} busy={linkLoading} onRegenerate={shareActivation} onClose={() => { setActivationLink(null); load(); }} />}
          <p className="mt-2 flex items-center gap-2 text-slate-500">
            <Phone className="h-4 w-4" />
            {customer.mobile}
            {customer.city ? ` · ${customer.city}` : ""}
          </p>
          {customer.email && (
            <p className="mt-1 flex items-center gap-2 text-slate-500">
              <Mail className="h-4 w-4" />
              {customer.email}
            </p>
          )}
          <p className="mt-3 max-w-3xl text-sm text-slate-600">
            {customer.requirement || "No requirement added yet."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`tel:${customer.mobile}`}
            className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold"
          >
            <Phone className="h-4 w-4" />
            Call
          </a>
          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold"
            >
              <Mail className="h-4 w-4" />
              Email
            </a>
          )}
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          )}
          <button
            onClick={() => setShowFollowUp(true)}
            className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white bp-ui-action"
          >
            <Plus className="h-4 w-4" />
            Add follow-up
          </button>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold bp-ui-action"
          >
            <Edit3 className="h-4 w-4" />
            Edit
          </button>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Summary
          title="Properties"
          icon={Building2}
          value={customer.properties?.length || 0}
          items={customer.properties?.map((item) => ({
            label: item.name || item.property_type,
            to: `/properties/${item.id}`,
            calculatorTo: `/properties/${item.id}/measurements`,
            state: { customerPath: `/customers/${customer.id}` },
          }))}
          action={
            <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
              <Link
                to={`/properties?customer=${customer.id}&action=add`}
                className="text-amber-700"
              >
                Add property
              </Link>
              <Link
                to={`/properties?customer=${customer.id}`}
                className="text-slate-600 hover:text-slate-950"
              >
                View all properties
              </Link>
            </div>
          }
        />
        <Summary
          title="Quotations"
          icon={FileText}
          value={customer.quotations?.length || 0}
          items={[...(customer.quotations || [])]
            .sort(
              (first, second) =>
                new Date(second.created_at || second.quotation_date) -
                new Date(first.created_at || first.quotation_date),
            )
            .slice(0, 4)
            .map((item) => ({
              label: item.quotation_number || "Draft quotation",
              to: `/quotations/${item.id}`,
              state: { customerPath: `/customers/${customer.id}/quotations` },
            }))}
          action={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                to={`/customers/${customer.id}/quotations`}
                className="text-sm font-semibold text-slate-900"
              >
                View all quotations
              </Link>
              <Link
                to={`/quotations/new?customer=${customer.id}`}
                className="text-sm font-semibold text-amber-700"
              >
                Create quotation
              </Link>
            </div>
          }
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
          <div><h2 className="font-bold text-slate-900 bp-ui-section-heading">Call history</h2><p className="mt-1 text-sm text-slate-500">Incoming calls matched to this customer.</p></div>
          <div className="flex flex-wrap gap-3 text-sm font-semibold"><Link className="text-slate-700" to={`/properties?customer=${customer.id}`}>Properties</Link><Link className="text-slate-700" to={`/customers/${customer.id}/quotations`}>Quotations</Link><Link className="text-slate-700" to="/leads">Leads</Link><button type="button" className="text-slate-700" onClick={() => setShowFollowUp(true)}>Add follow-up</button></div>
        </div>
        {callEvents.length ? <div className="divide-y divide-slate-100">{callEvents.slice(0, 8).map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"><div><p className="font-semibold text-slate-900">{event.call_status || "Incoming call"}</p><p className="mt-1 text-sm text-slate-500">{new Date(event.occurred_at).toLocaleString("en-IN")}</p></div><a className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold text-slate-700" href={`tel:${event.phone_number}`}><Phone className="h-4 w-4"/>Call back</a></div>)}</div> : <p className="p-6 text-sm text-slate-500">No incoming calls have been linked to this customer.</p>}
      </section>

      <div>
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-6">
              <h2 className="font-bold text-slate-900 bp-ui-section-heading">Follow-up timeline</h2>
              <p className="mt-1 text-sm text-slate-500">
                Most recent activity appears first
              </p>
            </div>
            {followUps.length ? (
              <div className="divide-y divide-slate-100">
                {followUps.map((item) => (
                  <div key={item.id} className="flex gap-4 p-5">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100">
                      <CalendarClock className="h-5 w-5 text-slate-600" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {item.follow_up_type.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {item.comment || "No notes"}
                      </p>
                      <p className="mt-2 text-xs text-slate-400">
                        {new Date(item.follow_up_date).toLocaleString()}
                      </p>
                      <button
                        onClick={() => completeFollowUp(item)}
                        disabled={completingId === item.id}
                        className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50 bp-ui-action"
                      >
                        {completingId === item.id ? "Saving..." : "Mark done"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-8 text-center text-sm text-slate-500">
                No follow-ups recorded yet.
              </p>
            )}
          </div>
        </section>
      </div>
      {showFollowUp && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <section
            className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="follow-up-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="follow-up-title"
                  className="text-xl font-bold text-slate-900 bp-ui-section-heading"
                >
                  Add follow-up
                </h2>
                
              </div>
              <button
                type="button"
                onClick={() => setShowFollowUp(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 bp-ui-icon-action"
                aria-label="Close follow-up form"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={addFollowUp}
              className="mt-6 grid gap-4 sm:grid-cols-2"
            >
              <label className="text-sm font-semibold text-slate-700">
                Follow-up type
                <select
                  value={followUp.follow_up_type}
                  onChange={(e) =>
                    setFollowUp({ ...followUp, follow_up_type: e.target.value })
                  }
                  className={(`mt-2 w-full ${inputClass}`) + " bp-ui-control"}
                >
                  {["CALL", "WHATSAPP", "NOTE", "SITE_VISIT", "MEETING"].map(
                    (item) => (
                      <option key={item} value={item}>
                        {item.replaceAll("_", " ")}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Next follow-up
                <input
                  type="datetime-local"
                  required={followUp.follow_up_type === "SITE_VISIT"}
                  value={followUp.next_follow_up}
                  onChange={(e) =>
                    setFollowUp({ ...followUp, next_follow_up: e.target.value })
                  }
                  className={(`mt-2 w-full ${inputClass}`) + " bp-ui-control"}
                />
              </label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Discussion notes
                <textarea
                  required
                  rows="4"
                  placeholder="What was discussed?"
                  value={followUp.comment}
                  onChange={(e) =>
                    setFollowUp({ ...followUp, comment: e.target.value })
                  }
                  className={(`mt-2 w-full resize-none ${inputClass}`) + " bp-ui-control"}
                />
              </label>
              <div className="flex justify-end gap-2 border-t pt-4 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowFollowUp(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold bp-ui-action"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 bp-ui-action"
                >
                  {saving ? "Saving..." : "Add follow-up"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {editing && (
        <CustomerForm
          initialValue={customer}
          onSubmit={updateCustomer}
          onClose={() => setEditing(false)}
          saving={saving}
        />
      )}
    </div>
  );
}

function Summary({ title, icon: Icon, value, items = [], action }) {
  return (
    <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-5 marker:hidden">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100">
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="min-w-0 flex-1 font-bold text-slate-900 bp-ui-section-heading">{title}</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
          {value}
        </span>
        <ChevronDown className="h-5 w-5 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-200 p-5">
        {items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item, index) =>
              item.to ? (
                <div
                  key={`${item.to}-${index}`}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 p-1.5"
                >
                  <Link
                    to={item.to}
                    state={item.state}
                    className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-white hover:text-slate-950"
                  >
                    {item.label}
                  </Link>
                </div>
              ) : (
                <p
                  key={`${item.label}-${index}`}
                  className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600"
                >
                  {item.label}
                </p>
              ),
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No {title.toLowerCase()} yet.
          </p>
        )}
        {action && (
          <div className="mt-4 border-t border-slate-100 pt-4">{action}</div>
        )}
      </div>
    </details>
  );
}

function getWhatsAppUrl(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

function formatSiteVisitDate(value) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function customerStatusTone(value) {
  if (value === "WON") return "success";
  if (value === "LOST") return "danger";
  if (["PENDING", "FOLLOW_UP", "NEGOTIATION"].includes(value)) return "warning";
  if (["NEW", "CONTACTED", "SITE_VISIT", "QUOTATION_SENT"].includes(value)) return "info";
  return "neutral";
}
