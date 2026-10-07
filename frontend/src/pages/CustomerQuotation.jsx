import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  RefreshCw,
  XCircle,
  X,
} from "lucide-react";
import api from "../api/client";
import BackButton from "../components/BackButton";
import { previewPdf } from "../components/PdfPreview";
import { Button, ErrorState, LoadingState, PageHeader, SectionCard, StatCard, StatusBadge } from "../components/ui";
import "./customer-portal.css";

export default function CustomerQuotation() {
  const { id } = useParams(),
    [quotation, setQuotation] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [selectedItem, setSelectedItem] = useState(null),
    [showRevision, setShowRevision] = useState(false),
    [revisionNote, setRevisionNote] = useState(""),
    [revisionLines, setRevisionLines] = useState({});
  const itemDialogRef = useRef(null);
  const revisionDialogRef = useRef(null);
  const load = useCallback(async () => {
    try {
      setQuotation(
        (await api.get(`/quotations/customer-portal/quotations/${id}/`)).data,
      );
      setError("");
    } catch {
      setError("Quotation could not be loaded.");
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const dialog = showRevision ? revisionDialogRef.current : selectedItem ? itemDialogRef.current : null;
    if (!dialog) return undefined;
    const previousFocus = document.activeElement;
    const focusable = () => [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    focusable()[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (showRevision) setShowRevision(false);
        else setSelectedItem(null);
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault();
        controls[controls.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) {
        event.preventDefault();
        controls[0].focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
  }, [showRevision, selectedItem]);
  async function downloadPdf() {
    try {
      const response = await api.get(
          `/quotations/customer-portal/quotations/${id}/pdf/`,
          { responseType: "blob" },
        );
      previewPdf(response.data, `${quotation.quotation_number}.pdf`);
    } catch {
      setError("Quotation PDF could not be previewed.");
    }
  }
  async function respond(action, suppliedNote = "") {
    let note = "";
    if (action === "REVISION") {
      note = suppliedNote.trim();
      if (!note) return;
    } else if (
      !window.confirm(
        `Are you sure you want to ${action.toLowerCase()} this quotation?`,
      )
    )
      return;
    try {
      const { data } = await api.post(
        `/quotations/customer-portal/quotations/${id}/action/`,
        { action, note },
      );
      setQuotation((current) => ({ ...current, ...data }));
      if (action === "REVISION") {
        setShowRevision(false);
        setRevisionNote("");
        setRevisionLines({});
        setNotice(
          `${data.revision_number} was created for the contractor to revise. It will appear here after it is sent.`,
        );
      } else if (action === "APPROVE") {
        setNotice(
          data.next_step === "WORK_IN_PROGRESS"
            ? "Revised quotation accepted. Your current work schedule continues."
            : data.next_step === "EXISTING_SCHEDULE"
              ? "Revised quotation accepted. Your confirmed schedule remains active."
              : "Revised quotation accepted. Select your preferred work dates to continue.",
        );
      }
      setError("");
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Your response could not be saved.",
      );
    }
  }
  function submitRevisionRequest(event) {
    event.preventDefault();
    const selected = quotation.items
      .filter((item) => revisionLines[item.id])
      .map((item) => `${item.room || "General"}: ${item.description || item.service || "Quotation line"}`);
    const note = [
      selected.length ? `Review/change/remove these lines:\n- ${selected.join("\n- ")}` : "",
      revisionNote.trim() ? `Required additions or changes:\n${revisionNote.trim()}` : "",
    ].filter(Boolean).join("\n\n");
    if (!note) {
      setError("Select a quotation line or describe the required change.");
      return;
    }
    respond("REVISION", note);
  }
  if (!quotation) return error
    ? <ErrorState message={error} onRetry={load} />
    : <LoadingState label="Loading quotation…" />;
  return (
    <div className="bp-quotation-page customer-quotation-detail-page space-y-6">
      <BackButton fallback="/customer-quotations" label="Back to My Quotations" />
      {error && (
        <p role="alert" className="customer-portal-alert customer-portal-alert-error">{error}</p>
      )}
      {notice && (
        <p role="status" className="customer-portal-alert customer-portal-alert-success">
          {notice}
        </p>
      )}
      <PageHeader
        eyebrow={quotation.contractor_name || "Your contractor"}
        title={quotation.quotation_number}
        description={`${quotation.property_name || "Property"} · Quotation date ${formatDate(quotation.quotation_date)} · Version ${quotation.version_number || 1}`}
        actions={<StatusBadge status={quotation.status} label={readableStatus(quotation.status)} tone={quotationTone(quotation.status)} />}
      />
      <div className="customer-quotation-overview">
        <StatCard label="Grand total" value={`₹${money(quotation.grand_total)}`} hint="Total for the quoted work" tone="brand" className="customer-quotation-total" />
        <div className="customer-quotation-overview-details">
          <span><strong>Property</strong>{quotation.property_name || "Property"}</span>
          <span><strong>Contractor</strong>{quotation.contractor_name || "Contractor"}</span>
          {quotation.valid_until && <span><strong>Valid until</strong>{formatDate(quotation.valid_until)}</span>}
        </div>
      </div>
      <CustomerRevisionSummary changes={quotation.revision_changes} />
      <SectionCard title="Work included" description="Review the services, rooms, products and measurements in this estimate." className="customer-quotation-scope" bodyClassName="p-0">
        <div className="grid gap-3 p-3 md:hidden">
          {quotation.items.map((item, index) => (
            <button type="button" key={item.id} onClick={() => setSelectedItem({ item, index })} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm active:scale-[0.99]">
              <div className="flex items-start justify-between gap-3 bg-slate-950 p-4 text-white">
                <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-amber-300">{item.service || "Service"} · Item {index + 1}</p><h3 className="mt-1 break-words font-bold">{item.room || "General"}</h3><p className="mt-1 whitespace-normal text-sm text-slate-300">{item.description || "Description not available"}</p></div>
                <b className="shrink-0 text-base text-emerald-300">₹{money(item.amount)}</b>
              </div>
              <div className="grid grid-cols-3 gap-px bg-slate-200 text-xs"><CustomerItemValue label="Quantity" value={`${item.quantity} ${item.unit || ""}`} /><CustomerItemValue label="Rate" value={`₹${money(item.rate)}`} /><CustomerItemValue label="Coats" value={item.coats || "—"} /></div>
              <div className="flex items-center justify-end gap-1 border-t px-4 py-2 text-xs font-bold text-blue-700"><Eye className="h-4 w-4" /> View details</div>
            </button>
          ))}
        </div>
        <div className="customer-quotation-items-table hidden overflow-x-auto p-5 md:block">
          <table className="w-full min-w-[900px] table-fixed text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                {[
                  "#",
                  "Type of service",
                  "Room / Area",
                  "Description",
                  "Product / Brand",
                  "Coats",
                  "Qty / MOU",
                  "Rate / Amount",
                ].map((item) => (
                  <th key={item} className="px-3 py-4 first:w-[5%] last:text-right">
                    {item}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotation.items.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="p-3">{item.serial}</td>
                  <td className="p-3 font-semibold">{item.service || "—"}</td>
                  <td className="p-3">{item.room}</td>
                  <td className="break-words p-3 font-medium">{item.description}</td>
                  <td className="p-3"><p>{item.paint_type || "—"}</p><p className="mt-1 text-[11px] text-slate-500">{item.paint_brand || "No brand"}</p></td>
                  <td className="p-3 text-center">{item.coats || "—"}</td>
                  <td className="p-3"><p className="font-bold">{item.quantity}</p><p className="text-[11px] text-slate-500">{item.unit || "—"}</p></td>
                  <td className="p-3 text-right"><p className="text-slate-500">₹{money(item.rate)}</p><p className="mt-1 font-bold">₹{money(item.amount)}</p></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedItem && <CustomerQuotationItemDialog item={selectedItem.item} index={selectedItem.index} close={() => setSelectedItem(null)} />}
      </SectionCard>

      <div className="customer-quotation-financial-grid">
        <SectionCard title="Price breakdown" description="Saved totals from the quotation." className="customer-quotation-price-card">
          <div className="customer-quotation-price-lines">
            <Total label="Work subtotal" value={quotation.subtotal} />
            <Total label="Discount" value={quotation.discount} />
            <Total label="GST / taxes" value={quotation.gst_amount} />
            <div className="customer-quotation-grand-total"><strong>Grand total</strong><strong>₹{money(quotation.grand_total)}</strong></div>
          </div>
        </SectionCard>
        <div className="customer-quotation-supporting-details">
          {quotation.product_details && <SectionCard title="Product details"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{quotation.product_details}</p></SectionCard>}
          {quotation.terms && <SectionCard title="Notes and terms"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{quotation.terms}</p></SectionCard>}
        </div>
      </div>

      <SectionCard title="Your next step" description="Choose an action for this quotation." className="quotation-customer-actions">
        {quotation.accepted_via_receipt_at && (
          <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Your advance payment receipt has been recorded, so this quotation is accepted. The contractor will propose work dates for you to confirm.
          </p>
        )}
        <div className="customer-quotation-actions-grid">
          <Button variant="secondary" onClick={downloadPdf}>
            <Download aria-hidden="true" />
            Download quotation PDF
          </Button>
          {quotation.property_access?.permissions?.view_schedules && ["ACCEPTED", "CONVERTED"].includes(quotation.status) && (
            <Link
              to={quotation.accepted_via_receipt_at ? "/work-schedules" : `/work-schedules?quotation=${quotation.id}`}
              className="bp-button bp-button-primary inline-flex items-center justify-center gap-2"
            >
              <CalendarDays className="h-5 w-5" aria-hidden="true" />
              {quotation.accepted_via_receipt_at ? "View work dates" : "Continue to schedule"}
            </Link>
          )}
        </div>
        {quotation.customer_response_note && (
          <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            <b>Your response</b>
            <p className="mt-1">{quotation.customer_response_note}</p>
          </div>
        )}
        {quotation.property_access?.permissions?.approve_quotations && ["SENT", "VIEWED"].includes(quotation.status) && (
          <div className="customer-quotation-response-actions">
            <Button onClick={() => respond("APPROVE")}>
              <CheckCircle2 aria-hidden="true" />Accept quotation
            </Button>
            <Button variant="danger" onClick={() => respond("REJECT")}>
              <XCircle aria-hidden="true" />Decline quotation
            </Button>
          </div>
        )}
        {quotation.property_access?.permissions?.request_quotation_changes && ["SENT", "VIEWED", "ACCEPTED", "SCHEDULED", "IN_PROGRESS"].includes(quotation.status) && (
          <button
            onClick={() => { setShowRevision(true); setError(""); }}
            className="customer-quotation-revision-button mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 font-semibold text-indigo-800"
          >
            <RefreshCw className="h-5 w-5" />
            Request quotation changes
          </button>
        )}
      </SectionCard>
      {showRevision && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-5">
          <form ref={revisionDialogRef} role="dialog" aria-modal="true" aria-labelledby="customer-revision-title" onSubmit={submitRevisionRequest} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-[28px] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Create a new quotation version</p><h2 id="customer-revision-title" className="mt-1 text-xl font-bold">What should be changed?</h2><p className="mt-1 text-sm text-slate-500">The contractor will edit a copy. This accepted version will remain unchanged.</p></div>
              <button type="button" aria-label="Close change request" onClick={() => setShowRevision(false)} className="rounded-xl border p-2"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 space-y-2">
              <p className="text-sm font-bold">Select lines to change or remove</p>
              {quotation.items.map((item) => (
                <label key={item.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${revisionLines[item.id] ? "border-indigo-400 bg-indigo-50" : ""}`}>
                  <input type="checkbox" checked={Boolean(revisionLines[item.id])} onChange={(event) => setRevisionLines((current) => ({ ...current, [item.id]: event.target.checked }))} className="mt-1 h-4 w-4" />
                  <span className="min-w-0"><b className="block truncate">{item.room || "General"} · {item.service || "Service"}</b><span className="block truncate text-xs text-slate-500">{item.description || "Quotation line"} · ₹{money(item.amount)}</span></span>
                </label>
              ))}
            </div>
            <label className="mt-5 block text-sm font-bold">Add work or explain changes<textarea rows="4" value={revisionNote} onChange={(event) => setRevisionNote(event.target.value)} placeholder="Example: Remove balcony painting, add kitchen ceiling, change bedroom product to Royale..." className="mt-2 w-full rounded-xl border px-4 py-3 font-normal outline-none focus:border-indigo-500" /></label>
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setShowRevision(false)} className="rounded-xl border px-4 py-3 font-bold">Cancel</button><button className="rounded-xl bg-slate-950 px-4 py-3 font-bold text-white">Send change request</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
function CustomerItemValue({ label, value }) {
  return <div className="min-w-0 bg-white p-3"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 truncate font-bold text-slate-900">{value}</p></div>;
}
function CustomerQuotationItemDialog({ item, index, close }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section ref={itemDialogRef} role="dialog" aria-modal="true" aria-label={`Quotation item ${index + 1}`} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:max-w-xl sm:rounded-[28px]">
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b bg-slate-950 p-5 text-white"><div><p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">Quotation item {index + 1}</p><h2 className="mt-1 text-xl font-bold">{item.room || "General"}</h2><p className="mt-1 text-sm text-slate-300">{item.service || "Service"}</p></div><button type="button" aria-label="Close quotation item details" onClick={close} className="rounded-xl border border-white/30 p-2.5"><X className="h-5 w-5" /></button></header>
        <div className="grid grid-cols-2 gap-px bg-slate-200"><CustomerDialogValue label="Product description" value={item.description} wide /><CustomerDialogValue label="Product" value={item.paint_type || "—"} /><CustomerDialogValue label="Brand" value={item.paint_brand || "—"} /><CustomerDialogValue label="Quantity" value={`${item.quantity} ${item.unit || ""}`} /><CustomerDialogValue label="Coats" value={item.coats || "—"} /><CustomerDialogValue label="Rate" value={`₹${money(item.rate)}`} /><CustomerDialogValue label="Amount" value={`₹${money(item.amount)}`} strong /></div>
        <div className="p-4"><button type="button" onClick={close} className="w-full rounded-xl bg-slate-950 px-5 py-3 font-bold text-white">Close</button></div>
      </section>
    </div>
  );
}
function CustomerDialogValue({ label, value, wide, strong }) {
  return <div className={`bg-white p-4 ${wide ? "col-span-2" : ""}`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-1 break-words ${strong ? "text-lg font-extrabold text-emerald-700" : "font-semibold text-slate-900"}`}>{value || "—"}</p></div>;
}
function Total({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span>₹{money(value)}</span>
    </div>
  );
}
function money(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
}

function readableStatus(value) {
  return String(value || "Status unavailable")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function quotationTone(status) {
  if (["ACCEPTED", "CONVERTED", "SCHEDULED", "IN_PROGRESS", "COMPLETED"].includes(status)) return "success";
  if (["SENT", "VIEWED", "REVISION_REQUESTED"].includes(status)) return "warning";
  if (["REJECTED", "CANCELLED", "EXPIRED"].includes(status)) return "danger";
  return "neutral";
}

function formatDate(value) {
  if (!value) return "Date not set";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function CustomerRevisionSummary({ changes }) {
  if (!changes) return null;
  const added = changes.added_lines || [];
  const removed = changes.removed_lines || [];
  const priceChanges = changes.price_changes || [];
  const hasChanges = added.length || removed.length || priceChanges.length;
  return (
    <div className="border-b bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 px-6 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Revision comparison</p>
          <p className="mt-1 text-sm font-bold text-slate-950">{changes.previous_number} <span className="mx-2 text-slate-300">→</span> Current version</p>
        </div>
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border bg-white text-right text-xs">
          <CustomerRevisionTotal label="Previous" value={changes.previous_total} />
          <CustomerRevisionTotal label="Current" value={changes.current_total} />
          <CustomerRevisionTotal label="Difference" value={changes.amount_difference} difference />
        </div>
      </div>
      {!hasChanges ? (
        <p className="px-6 py-8 text-center text-sm text-slate-500">No service or price changes.</p>
      ) : (
        <div className="space-y-5 p-6">
          {priceChanges.length > 0 && (
            <details className="group overflow-hidden rounded-xl border">
              <summary className="flex cursor-pointer list-none items-center justify-between bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                <span>Price changes <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs">{priceChanges.length}</span></span>
                <span className="text-xs font-semibold text-amber-700 group-open:hidden">View details ▾</span>
                <span className="hidden text-xs font-semibold text-amber-700 group-open:inline">Hide details ▴</span>
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Service</th><th className="px-4 py-3">Room / Area</th><th className="px-4 py-3 text-right">Previous</th><th className="px-4 py-3 text-right">Current</th><th className="px-4 py-3 text-right">Difference</th></tr></thead>
                  <tbody className="divide-y">
                    {priceChanges.map((line, index) => <tr key={`${line.description}-${index}`}><td className="px-4 py-3"><p className="font-semibold">{line.service}</p><p className="text-xs text-slate-500">{line.description}</p></td><td className="px-4 py-3 text-slate-600">{line.room}</td><td className="px-4 py-3 text-right text-slate-500">₹{money(line.previous_price)}</td><td className="px-4 py-3 text-right font-semibold">₹{money(line.current_price)}</td><td className={`px-4 py-3 text-right font-bold ${Number(line.difference) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{signedCustomerMoney(line.difference)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <CustomerServiceChanges title="Added services" items={added} added />
            <CustomerServiceChanges title="Removed services" items={removed} />
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerRevisionTotal({ label, value, difference = false }) {
  return <div className={`border-l px-3 py-2 first:border-l-0 ${difference ? "bg-indigo-50" : ""}`}><p className="text-slate-400">{label}</p><p className={`mt-0.5 font-bold ${difference ? "text-indigo-700" : "text-slate-900"}`}>{difference ? signedCustomerMoney(value) : `₹${money(value)}`}</p></div>;
}

function CustomerServiceChanges({ title, items, added = false }) {
  if (!items.length) return null;
  return (
    <div className={`overflow-hidden rounded-xl border ${added ? "border-emerald-200" : "border-red-200"}`}>
      <p className={`px-4 py-3 text-sm font-bold ${added ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{title} <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs">{items.length}</span></p>
      <div className="divide-y">
        {items.map((item, index) => <div key={`${item.description}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><div><p className="font-semibold">{item.service}</p><p className="text-xs text-slate-500">{item.room} · {item.description}</p></div><span className={`font-bold ${added ? "text-emerald-700" : "text-red-700"}`}>{added ? "+" : "−"}₹{money(item.amount)}</span></div>)}
      </div>
    </div>
  );
}

function signedCustomerMoney(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}₹${money(number)}`;
}
