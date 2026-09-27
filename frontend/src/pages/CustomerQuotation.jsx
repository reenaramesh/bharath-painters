import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  RefreshCw,
  XCircle,
  X,
} from "lucide-react";
import api from "../api/client";
import BackButton from "../components/BackButton";
import { previewPdf } from "../components/PdfPreview";

export default function CustomerQuotation() {
  const { id } = useParams(),
    [quotation, setQuotation] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [selectedItem, setSelectedItem] = useState(null),
    [showRevision, setShowRevision] = useState(false),
    [revisionNote, setRevisionNote] = useState(""),
    [revisionLines, setRevisionLines] = useState({});
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
  if (!quotation)
    return (
      <div className="p-12 text-center text-slate-500">
        {error || "Loading quotation..."}
      </div>
    );
  return (
    <div className="bp-quotation-page space-y-6">
      <BackButton fallback="/customer-quotations" label="Back to My Quotations" />
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}
      {notice && (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {notice}
        </p>
      )}
      <section className="quotation-sheet quotation-customer-sheet rounded-2xl border bg-white">
        <header className="quotation-customer-header flex flex-col gap-4 border-b p-6 sm:flex-row sm:items-start">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-950 text-white">
            <FileText />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-600">
              {quotation.contractor_name}
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              {quotation.quotation_number}
            </h1>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-indigo-600">
              Version {quotation.version_number || 1}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {quotation.property_name} · {quotation.quotation_date}
            </p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            {quotation.status.replaceAll("_", " ")}
          </span>
        </header>
        <CustomerRevisionSummary changes={quotation.revision_changes} />
        <div className="grid gap-3 p-3 md:hidden">
          {quotation.items.map((item, index) => (
            <button type="button" key={item.id} onClick={() => setSelectedItem({ item, index })} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm active:scale-[0.99]">
              <div className="flex items-start justify-between gap-3 bg-slate-950 p-4 text-white">
                <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">Item {index + 1} · {item.service || "Service"}</p><h3 className="mt-1 truncate font-bold">{item.room || "General"}</h3><p className="mt-1 truncate text-xs text-slate-300">{item.description || "Description not available"}</p></div>
                <b className="shrink-0 text-emerald-300">₹{money(item.amount)}</b>
              </div>
              <div className="grid grid-cols-3 gap-px bg-slate-200 text-xs"><CustomerItemValue label="Quantity" value={`${item.quantity} ${item.unit || ""}`} /><CustomerItemValue label="Rate" value={`₹${money(item.rate)}`} /><CustomerItemValue label="Coats" value={item.coats || "—"} /></div>
              <div className="flex items-center justify-end gap-1 border-t px-4 py-2 text-xs font-bold text-blue-700"><Eye className="h-4 w-4" /> View details</div>
            </button>
          ))}
        </div>
        <div className="hidden overflow-x-auto p-6 md:block">
          <table className="w-full min-w-[900px] table-fixed text-left text-xs lg:text-sm">
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
        <div className="quotation-totals ml-auto w-full max-w-md space-y-2 border-t p-6 text-sm">
          <Total label="Subtotal" value={quotation.subtotal} />
          <Total label="Discount" value={quotation.discount} />
          <Total label="GST" value={quotation.gst_amount} />
          <div className="flex justify-between border-t pt-3 text-lg font-bold">
            <span>Grand total</span>
            <span>₹{money(quotation.grand_total)}</span>
          </div>
        </div>
        {quotation.product_details && (
          <div className="border-t p-6">
            <h2 className="font-bold">Product details</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{quotation.product_details}</p>
          </div>
        )}
        {quotation.terms && (
          <div className="border-t p-6">
            <h2 className="font-bold">Notes</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
              {quotation.terms}
            </p>
          </div>
        )}
      </section>
      <section className="quotation-customer-actions rounded-2xl border bg-white p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={downloadPdf}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white"
          >
            <Download className="h-5 w-5" />
            Download quotation PDF
          </button>
          {["ACCEPTED", "CONVERTED"].includes(quotation.status) && (
            <Link
              to={`/work-schedules?quotation=${quotation.id}`}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white"
            >
              <CalendarDays className="h-5 w-5" />
              Continue to schedule
            </Link>
          )}
        </div>
        {quotation.customer_response_note && (
          <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            <b>Your response</b>
            <p className="mt-1">{quotation.customer_response_note}</p>
          </div>
        )}
        {["SENT", "VIEWED"].includes(quotation.status) && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => respond("APPROVE")}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white"
            >
              <CheckCircle2 className="h-5 w-5" />
              Approve
            </button>
            <button
              onClick={() => respond("REJECT")}
              className="flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 font-semibold text-red-600"
            >
              <XCircle className="h-5 w-5" />
              Reject
            </button>
          </div>
        )}
        {["SENT", "VIEWED", "ACCEPTED", "SCHEDULED", "IN_PROGRESS"].includes(quotation.status) && (
          <button
            onClick={() => { setShowRevision(true); setError(""); }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 font-semibold text-indigo-800"
          >
            <RefreshCw className="h-5 w-5" />
            Request quotation changes
          </button>
        )}
      </section>
      {showRevision && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-5">
          <form onSubmit={submitRevisionRequest} className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-[28px] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Create a new quotation version</p><h2 className="mt-1 text-xl font-bold">What should be changed?</h2><p className="mt-1 text-sm text-slate-500">The contractor will edit a copy. This accepted version will remain unchanged.</p></div>
              <button type="button" onClick={() => setShowRevision(false)} className="rounded-xl border p-2"><X className="h-5 w-5" /></button>
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
      <section role="dialog" aria-modal="true" aria-label={`Quotation item ${index + 1}`} className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:max-w-xl sm:rounded-[28px]">
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b bg-slate-950 p-5 text-white"><div><p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">Quotation item {index + 1}</p><h2 className="mt-1 text-xl font-bold">{item.room || "General"}</h2><p className="mt-1 text-sm text-slate-300">{item.service || "Service"}</p></div><button type="button" onClick={close} className="rounded-xl border border-white/30 p-2.5"><X className="h-5 w-5" /></button></header>
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
