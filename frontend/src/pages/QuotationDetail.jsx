import QuotationDocumentItems, { QuotationDocumentItemDetails } from "../components/QuotationDocumentItems.jsx";
import { quotationItemHeaders } from "../utils/quotationItemPresentation.js";
import { QuotationLineItemPopup } from "../components/QuotationLineItemPopup.jsx";
import QuotationLineDiscountSummary from "../components/QuotationLineDiscountSummary.jsx";
import { QuotationRevisionHistory, QuotationRevisionDetails, QuotationRevisionPriceChanges } from "../components/QuotationRevisionDetails.jsx";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  BadgeCheck,
  Building2,
  BriefcaseBusiness,
  CalendarDays,
  Download,
  Edit3,
  FileText,
  Send,
  Share2,
  Trash2,
  User,
} from "lucide-react";
import api from "../api/client";
import { quotationRoomAreaLabel } from "../utils/groupedQuotation";
import BackButton from "../components/BackButton";
import { previewPdf } from "../components/PdfPreview";
import { profileImageStyle } from "../utils/profileImagePosition";
import { Button, ErrorState, LoadingState, StatusBadge } from "../components/ui";
import "./quotation-measurement.css";
import { consumeQuotationSubmission, quotationSubmissionError } from "../utils/quotationSubmission.js";
import useAuth from '../context/useAuth';

const money = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(value || 0),
  );
const quotationColumnDefaults = [14,15,15,13,6,8,8,12,9];
const quotationColumnMinimums = [8,8,8,8,3,4,4,6,5];
const quotationColumnLabels = quotationItemHeaders;
const quotationColumnStorageKey = "bp-quotation-item-column-widths";

function savedQuotationColumnWidths() {
  try {
    let widths = JSON.parse(window.localStorage.getItem(quotationColumnStorageKey));
    if (Array.isArray(widths) && widths.length === 10 && widths.every(Number.isFinite) && widths[2] > 0 && widths[2] < 100) {
      const remaining = widths.filter((_,index) => index !== 2);
      const total = remaining.reduce((sum,width) => sum+width,0);
      widths = remaining.map(width => width * 100 / total);
    }
    if (Array.isArray(widths) && widths.length === quotationColumnDefaults.length &&
        widths.every((width, index) => Number.isFinite(width) && width >= quotationColumnMinimums[index]) &&
        Math.abs(widths.reduce((sum, width) => sum + width, 0) - 100) < 0.01) return widths;
  } catch { /* Use the default widths when browser storage is unavailable. */ }
  return quotationColumnDefaults;
}

export default function QuotationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const customerPath = location.state?.customerPath;
  const backPath = customerPath || "/quotations";
  const [quotation, setQuotation] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [property, setProperty] = useState(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pdfSectionSelection, setPdfSectionSelection] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [converting, setConverting] = useState(false);
  const convertingRef = useRef(false);
  const [showShare, setShowShare] = useState(false);
  const [customerLogin, setCustomerLogin] = useState(null);
  useEffect(() => {
    const submission = consumeQuotationSubmission(id);
    if (!submission) return;
    setCustomerLogin(submission.temporary_password ? {customer_id:submission.customer_id,mobile:submission.customer_mobile,temporary_password:submission.temporary_password} : null);
    setShowShare(true);
  }, [id]);
  const [mobileItem, setMobileItem] = useState(null);
  const [invoiceSetup, setInvoiceSetup] = useState(null);
  const invoicePromptSeen = useRef('');
  useEffect(() => {
    const action = new URLSearchParams(location.search).get('action');
    const key = `${id}:${location.key}`;
    if (action === 'invoice' && user?.role === 'CONTRACTOR' && quotation?.status === 'COMPLETED'
        && String(quotation.id) === String(id) && invoicePromptSeen.current !== key) {
      invoicePromptSeen.current = key;
      setInvoiceSetup((quotation.items || []).map(() => ''));
    }
  }, [id, location.key, location.search, quotation, user?.role]);
  const [columnWidths, setColumnWidths] = useState(savedQuotationColumnWidths);
  const quotationTableRef = useRef(null);
  const columnWidthsRef = useRef(columnWidths);
  columnWidthsRef.current = columnWidths;
  useEffect(() => {
    try { window.localStorage.setItem(quotationColumnStorageKey, JSON.stringify(columnWidths)); } catch { /* Storage is optional. */ }
  }, [columnWidths]);
  function resizeColumns(index, delta) {
    setColumnWidths((current) => {
      const change = Math.max(
        quotationColumnMinimums[index] - current[index],
        Math.min(delta, current[index + 1] - quotationColumnMinimums[index + 1]),
      );
      const next = [...current];
      next[index] += change;
      next[index + 1] -= change;
      return next;
    });
  }
  function startColumnResize(event, index) {
    event.preventDefault();
    const tableWidth = quotationTableRef.current?.getBoundingClientRect().width;
    if (!tableWidth) return;
    const startX = event.clientX;
    const initial = [...columnWidthsRef.current];
    const onMove = (moveEvent) => {
      const delta = ((moveEvent.clientX - startX) / tableWidth) * 100;
      resizeColumns(index, Math.max(
        quotationColumnMinimums[index] - initial[index],
        Math.min(delta, initial[index + 1] - quotationColumnMinimums[index + 1]),
      ) - (columnWidthsRef.current[index] - initial[index]));
    };
    const onStop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onStop);
      window.removeEventListener("pointercancel", onStop);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onStop);
    window.addEventListener("pointercancel", onStop);
  }
  useEffect(() => {
    api
      .get(`/quotations/${id}/`)
      .then(async ({ data }) => {
        setPdfSectionSelection({});
        setQuotation(data);
        const [c, p] = await Promise.allSettled([
          api.get(`/quotations/customers/${data.customer}/`),
          api.get(`/quotations/properties/${data.property}/`),
        ]);
        setCustomer(c.status === "fulfilled" ? c.value.data : null);
        setProperty(p.status === "fulfilled" ? p.value.data : null);
      })
      .catch(() => setError("Quotation could not be loaded."));
  }, [id]);
  if (!quotation)
    return error ? <ErrorState message={error} /> : <LoadingState label="Loading quotation..." />;
  const contractor = quotation.contractor_details;
  const revisedDraft =
    quotation.status === "DRAFT" && Boolean(quotation.customer_response_note);
  const pendingCustomerConnection = customer?.connection_status === "PENDING";
  const quotationProductDetails = quotation.consolidated_product_details || quotation.product_details || "";
  const pdfSectionOptions = [
    { key: "company_name", label: "Company name", group: "Contractor", available: contractor?.company_name },
    { key: "contractor_address", label: "Office address", group: "Contractor", available: contractor?.office_address },
    { key: "contractor_contact", label: "Mobile and email", group: "Contractor", available: contractor?.mobile || contractor?.email },
    { key: "contractor_registration", label: "GSTIN and contractor ID", group: "Contractor", available: contractor?.gst_number || contractor?.bharath_id },
    { key: "quotation_metadata", label: "Version and dates", group: "Contractor" },
    { key: "footer_logo", label: "Footer logo", group: "Contractor", available: contractor?.company_logo },
    { key: "customer_details", label: "Customer details", group: "Parties" },
    { key: "property_details", label: "Property site details", group: "Parties" },
    { key: "quotation_items", label: "Quotation items table", group: "Estimate" },
    { key: "subtotal", label: "Subtotal", group: "Estimate" },
    { key: "discount", label: "Discount", group: "Estimate", available: Number(quotation.discount) > 0 },
    { key: "gst", label: "GST", group: "Estimate", available: Number(quotation.gst_amount) > 0 },
    { key: "grand_total", label: "Grand total", group: "Estimate" },
    { key: "total_words", label: "Total in words", group: "Estimate" },
    { key: "prepared_by", label: "Prepared by name", group: "Supporting details", available: quotation.prepared_by, defaultSelected: false },
    { key: "inspected_by", label: "Inspected by name", group: "Supporting details", available: quotation.inspected_by, defaultSelected: false },
    { key: "work_duration", label: "Work duration", group: "Supporting details", available: quotation.work_duration },
    { key: "payment_terms", label: "Payment terms", group: "Supporting details", available: quotation.payment_terms },
    { key: "product_details", label: "Product details", group: "Supporting details", available: quotationProductDetails },
    { key: "work_procedures", label: "Work procedures and safety", group: "Supporting details", available: quotation.work_procedures },
    { key: "terms_conditions", label: "Terms and conditions", group: "Supporting details", available: quotation.terms_conditions },
    { key: "notes", label: "Notes", group: "Supporting details", available: quotation.notes },
    { key: "prepared_signature", label: "Prepared by signature", group: "Signatures" },
    { key: "authorized_signature", label: "Authorized signature", group: "Signatures" },
  ].filter((section) => section.available === undefined || Boolean(String(section.available || "").trim()) && section.available !== false);
  const selectedPdfSections = pdfSectionOptions
    .filter((section) => pdfSectionSelection[section.key] ?? section.defaultSelected !== false)
    .map((section) => section.key);
  const paintingSubtotal = quotation.items
    .filter((item) => !item.is_additional_service)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const additionalSubtotal = quotation.items
    .filter((item) => item.is_additional_service)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  async function remove() {
    if (!window.confirm("Delete this quotation permanently?")) return;
    setDeleting(true);
    try {
      await api.delete(`/quotations/${id}/`);
      navigate(backPath);
    } catch {
      setError("Quotation could not be deleted.");
      setDeleting(false);
    }
  }
  async function downloadPdf() {
    setDownloading(true);
    setError("");
    try {
      const response = await api.get(`/quotations/${id}/pdf/`, {
        responseType: "blob",
        params: { sections: selectedPdfSections.join(",") },
      });
      previewPdf(response.data, `${quotation.quotation_number}.pdf`);
    } catch {
      setError("Quotation PDF could not be previewed.");
    } finally {
      setDownloading(false);
    }
  }
  async function submitToCustomer() {
    if (submitLock.current || !window.confirm("Send this saved Draft to the customer? Issued versions are read-only.")) return;
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    try {
      const { data } = await api.post(`/quotations/${id}/submit/`);
      setQuotation((current) => ({ ...current, status: data.status }));
      setCustomerLogin(data.temporary_password ? { customer_id: data.customer_id, mobile: data.customer_mobile, temporary_password: data.temporary_password } : null);
      setShowShare(true);
    } catch (requestError) {
      setError(quotationSubmissionError(requestError));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }
  async function convertToInvoice() {
    if (convertingRef.current) return;
    convertingRef.current = true;
    setConverting(true);
    setError("");
    try {
      const { data } = await api.post("/quotations/invoices/", {
        quotation: Number(id),
        hsn_codes: invoiceSetup || [],
      });
      setInvoiceSetup(null);
      let pdfResponse = null;
      try {
        pdfResponse = await api.get(`/quotations/invoices/${data.id}/pdf/`, {
          responseType: "blob",
        });
      } catch {
        setError("Invoice was created, but its PDF preview could not be opened.");
      }
      navigate(`/invoices?invoice=${data.id}`);
      if (pdfResponse) {
        window.setTimeout(() => previewPdf(pdfResponse.data, `${data.invoice_number}.pdf`), 0);
      }
    } catch (requestError) {
      const details = requestError.response?.data;
      const message =
        details && typeof details === "object"
          ? Object.values(details)
              .flat()
              .filter((value) => typeof value === "string")
              .join(" ")
          : "";
      setError(message || "Invoice could not be created. Please try again.");
    } finally {
      convertingRef.current = false;
      setConverting(false);
    }
  }
  return (
    <div className="bp-quotation-page quotation-measurement-page bp-quotation-detail space-y-6">
      {location.state?.submissionError && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">This version was saved. Sending could not be confirmed. Use Submit to Customer to retry sending this saved version.</p>}
      {location.state?.draftSaved && quotation.status === "DRAFT" && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Quotation draft saved.</p>}
      {pendingCustomerConnection && quotation.status === "DRAFT" && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">This quotation is a private draft. It can be sent after the customer accepts your connection request.</p>}
      <div className="quotation-toolbar flex flex-wrap items-center justify-between gap-3">
        <BackButton
          fallback={backPath}
          label={customerPath ? "Back to customer" : "Back to quotations"}
        />
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {quotation.status === "REVISION_REQUESTED" &&
            quotation.revision_draft && (
              <Link
                to={`/quotations/${quotation.revision_draft.id}`}
                className="flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-2 text-xs font-semibold text-white sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"
              >
                <Edit3 className="h-4 w-4" />
                Open {quotation.revision_draft.quotation_number}
              </Link>
            )}
          {quotation.status === "DRAFT" ? (
            <button
              onClick={submitToCustomer}
              disabled={submitting || pendingCustomerConnection}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-semibold text-white disabled:opacity-60 sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm bp-ui-action"
            >
              <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {submitting ? (
                "Sending..."
              ) : (
                <>
                  <span className="sm:hidden">{pendingCustomerConnection ? "Pending" : "Send"}</span>
                  <span className="hidden sm:inline">
                    {pendingCustomerConnection
                      ? "Waiting for Connection Approval"
                      : revisedDraft
                      ? "Send Revised Quotation"
                      : "Submit to Customer"}
                  </span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-semibold text-white sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm bp-ui-action"
            >
              <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Share
            </button>
          )}
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="flex items-center gap-1 rounded-lg bg-slate-950 px-2.5 py-2 text-xs font-semibold text-white disabled:opacity-60 sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm bp-ui-action"
          >
            <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {downloading ? (
              "Wait..."
            ) : (
              <>
                <span className="sm:hidden">PDF</span>
                <span className="hidden sm:inline">Download PDF</span>
              </>
            )}
          </button>
          {quotation.can_create_version && (
            <Link
              to={`/quotations/${id}/edit`}
              className="flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-semibold sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Edit quotation
            </Link>
          )}
          {quotation.status === "COMPLETED" && (
            <button
              onClick={() => setInvoiceSetup(quotation.items.map(() => ""))}
              disabled={converting}
              className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-900 disabled:opacity-60 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm bp-ui-action"
            >
              <FileText className="h-4 w-4" />
              {converting ? "Creating..." : "Create final invoice"}
            </button>
          )}
          {quotation.status === "ACCEPTED" && (
            <Link
              to={`/work-schedules?quotation=${quotation.id}`}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-semibold text-white sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <CalendarDays className="h-4 w-4" />
              Schedule work
            </Link>
          )}
          {quotation.status === "DRAFT" && quotation.can_delete && <button
            onClick={remove}
            disabled={deleting}
            className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-2 text-xs font-semibold text-red-600 disabled:opacity-60 sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm bp-ui-action"
          >
            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {deleting ? "Deleting..." : "Delete"}
          </button>}
        </div>
      </div>
      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {quotation.status === "ACCEPTED" && (
        <section className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-bold text-emerald-950">{quotation.accepted_via_receipt_at ? "Quotation accepted through payment receipt" : "Customer accepted this quotation"}</p><p className="mt-1 text-sm text-emerald-800">Next: propose work dates for the customer to confirm. {quotation.accepted_via_receipt_at ? "The advance is already recorded." : "Then record any advance, assign Paint Applicators, start work, and complete the project."}</p></div>
          <Link to={`/work-schedules?quotation=${quotation.id}`} className="shrink-0 rounded-xl bg-emerald-700 px-5 py-3 text-center text-sm font-semibold text-white">Propose work dates</Link>
        </section>
      )}
      {quotation.customer_response_note &&
        ["REVISION_REQUESTED", "DRAFT"].includes(quotation.status) && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
              Customer requested revision
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {quotation.customer_response_note}
            </p>
            {quotation.status === "DRAFT" && (
              <p className="mt-3 text-xs font-semibold text-amber-800">
                Your changes are saved as a draft. Send the revised quotation to
                make it available to the customer.
              </p>
            )}
          </section>
        )}
      <RevisionSummary changes={quotation.revision_changes} />
      <QuotationRevisionHistory versions={quotation.revision_history} currentId={quotation.id} />
      <QuotationLineDiscountSummary items={quotation.items} quotation={quotation} />
      <section className="quotation-sheet rounded-2xl border bg-white">
        <div className="quotation-number-header quotation-identity-header border-b p-6">
          <div className="quotation-identity-text">
            <p className="quotation-identity-label">Quotation <span>(Version {quotation.version_number || quotation.version || 1} | {new Date(`${quotation.quotation_date}T12:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})})</span></p>
            <h2 className="bp-ui-section-heading">{quotation.quotation_number}</h2>
            {quotation.valid_until && <p className="text-xs text-slate-500">Valid until {quotation.valid_until}</p>}
          </div>
          <StatusBadge status={quotation.status} tone={quotationTone(quotation.status)} />
        </div>
        <div className="quotation-company-header quotation-party-header border-b p-6">
        <div className="quotation-entity-cards quotation-party-details">
          <Info
            icon={User}
            label="Customer details"
            value={quotation.customer_details?.name ?? customer?.name}
            sub={quotation.customer_details?.mobile ?? customer?.mobile}
          />
          <Info
            icon={Building2}
            label="Property details"
            value={quotation.property_details?.name ?? (property?.name || property?.property_type)}
            sub={quotation.property_details?.city ?? property?.city}
          />
        </div>
          <div className="quotation-contractor-details">
          <div className="quotation-contractor-brand flex items-center gap-4">
            {contractor?.company_logo ? (
              <img
                src={contractor.company_logo}
                alt=""
                className={`h-14 border bg-white ${
                  contractor.company_logo_shape === "ROUND"
                    ? "w-14 rounded-full object-cover"
                    : "w-24 rounded-xl object-contain p-1"
                }`}
                style={profileImageStyle(contractor.company_logo_position)}
              />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-xl bg-slate-950 text-white">
                <BriefcaseBusiness />
              </span>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold bp-ui-section-heading">
                  {contractor?.company_name || "Contractor"}
                </h2>
                {contractor?.is_verified && (
                  <BadgeCheck className="h-5 w-5 text-blue-600" />
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {contractor?.owner_name} · {contractor?.bharath_id}
              </p>
            </div>
          </div>
          <div className="quotation-contractor-contact text-sm text-slate-500">
            <p>{contractor?.mobile}</p>
            <p>{contractor?.email}</p>
            {contractor?.gst_number && <p>GSTIN: {contractor.gst_number}</p>}
            {contractor?.pan_number && <p>PAN: {contractor.pan_number}</p>}
            {contractor?.office_address && (
              <p className="mt-1 max-w-sm whitespace-pre-line">
                {contractor.office_address}
              </p>
            )}
          </div>
          </div>
        </div>
      </section>
      <section className="quotation-items rounded-2xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-6">
          <div><h2 className="font-bold bp-ui-section-heading">Quotation items</h2></div>
          <button type="button" className="hidden text-xs font-semibold text-indigo-700 hover:underline md:inline bp-ui-action" onClick={() => {
            setColumnWidths(quotationColumnDefaults);
          }}>Reset column widths</button>
        </div>
        <QuotationDocumentItems items={quotation.items} rooms={quotation.rooms} form={quotation} tableRef={quotationTableRef} columnWidths={columnWidths} onView={(item,index)=>setMobileItem({item,index,room:quotation.rooms.find(entry=>Number(entry.id)===Number(item.room))})} renderResizer={index=>index < quotationColumnDefaults.length-1 && <span role="separator" tabIndex={0} aria-label={`Resize ${quotationColumnLabels[index]} column`} aria-orientation="vertical" className="quotation-column-resizer" onPointerDown={event=>startColumnResize(event,index)} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();resizeColumns(index,event.key==='ArrowRight'?1:-1);}}} />} />
        {mobileItem && (
          <QuotationItemMobileDialog
            item={mobileItem.item}
            room={mobileItem.room}
            index={mobileItem.index}
            quotation={quotation}
            close={() => setMobileItem(null)}
          />
        )}
        <div className="quotation-totals ml-auto w-full max-w-sm space-y-3 border-t p-6">
          <Total label="Painting subtotal" value={paintingSubtotal} />
          {additionalSubtotal > 0 && (
            <Total
              label="Additional services subtotal"
              value={additionalSubtotal}
            />
          )}
          <Total label="Discount" value={quotation.discount} />
          <Total
            label={`GST (${quotation.gst_percentage}%)`}
            value={quotation.gst_amount}
          />
          <div className="flex justify-between border-t pt-3 text-lg font-bold">
            <span>Grand total</span>
            <span>{money(quotation.grand_total)}</span>
          </div>
        </div>
      </section>
      <section className="quotation-pdf-options rounded-2xl border bg-white p-5 sm:p-6" aria-labelledby="quotation-pdf-options-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="quotation-pdf-options-title" className="font-bold bp-ui-section-heading">Include in downloaded PDF</h2>

          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{selectedPdfSections.length} of {pdfSectionOptions.length} selected</span>
            <button type="button" onClick={() => setPdfSectionSelection(Object.fromEntries(pdfSectionOptions.map(({ key }) => [key, true])))} className="rounded-lg border px-3 py-1.5 text-xs font-semibold bp-ui-action">Select all</button>
            <button type="button" onClick={() => setPdfSectionSelection(Object.fromEntries(pdfSectionOptions.map(({ key }) => [key, false])))} className="rounded-lg border px-3 py-1.5 text-xs font-semibold bp-ui-action">Clear all</button>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          {["Contractor", "Parties", "Estimate", "Supporting details", "Signatures"].map((group) => (
            <div key={group}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{group}</h3>
              <div className="quotation-pdf-checklist grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {pdfSectionOptions.filter((section) => section.group === group).map((section) => (
              <label key={section.key} className="quotation-pdf-check flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50/50">
                <input
                  type="checkbox"
                  checked={pdfSectionSelection[section.key] ?? section.defaultSelected !== false}
                  onChange={(event) => setPdfSectionSelection((current) => ({ ...current, [section.key]: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>{section.label}</span>
              </label>
              ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      {(quotation.notes || quotation.terms_conditions) && (
        <section className="quotation-supporting-info grid gap-6 rounded-2xl border bg-white p-6 md:grid-cols-2">
          <div>
            <h2 className="font-bold bp-ui-section-heading">Notes</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
              {quotation.notes || "No notes"}
            </p>
          </div>
          <div>
            <h2 className="font-bold bp-ui-section-heading">Terms and conditions</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
              {quotation.terms_conditions || "No terms added"}
            </p>
          </div>
        </section>
      )}
      {(quotation.payment_terms ||
        quotation.consolidated_product_details || quotation.product_details ||
        quotation.work_duration ||
        quotation.work_procedures ||
        quotation.prepared_by ||
        quotation.inspected_by) && (
        <section className="quotation-supporting-info rounded-2xl border bg-white p-6">
          <h2 className="font-bold bp-ui-section-heading">Work and payment details</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <DetailField label="Prepared by" value={quotation.prepared_by} />
            <DetailField label="Inspected by" value={quotation.inspected_by} />
            <DetailField
              label="Work duration"
              value={quotation.work_duration}
            />
            <DetailField
              label="Payment terms"
              value={quotation.payment_terms}
            />
            <DetailField
              label="Product details"
              value={quotationProductDetails}
            />
            <DetailField
              label="Work procedures and safety"
              value={quotation.work_procedures}
            />
          </div>
        </section>
      )}
      {showShare && (
        <QuotationShare
          quotation={quotation}
          customer={customer}
          customerLogin={customerLogin}
          onClose={() => setShowShare(false)}
        />
      )}
      {invoiceSetup && (
        <InvoiceSetupDialog
          quotation={quotation}
          hsnCodes={invoiceSetup}
          setHsnCodes={setInvoiceSetup}
          converting={converting}
          onClose={() => setInvoiceSetup(null)}
          onCreate={convertToInvoice}
        />
      )}
    </div>
  );
}

function InvoiceSetupDialog({ quotation, hsnCodes, setHsnCodes, converting, onClose, onCreate }) {
  const update = (index, value) => setHsnCodes((current) => current.map((code, position) => position === index ? value : code));
  return <QuotationLineItemPopup titleText="Confirm HSN/SAC codes" description="Final invoice" onClose={onClose} footer={<div className="grid w-full grid-cols-2 gap-3"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="button" onClick={onCreate} disabled={converting}>{converting ? "Creating..." : "Create & Preview"}</Button></div>}>
      <div className="space-y-3">
        {quotation.items.map((item, index) => {
          const room = quotation.rooms.find((entry) => Number(entry.id) === Number(item.room));
          return <label key={item.id || index} className="block rounded-2xl border p-4">
            <span className="flex items-start justify-between gap-3"><span><small className="block font-bold uppercase tracking-wide text-amber-600">Item {index + 1}</small><b className="mt-1 block">{item.service_category_name || item.service_type_name || "Service"}</b><small className="whitespace-normal text-slate-600">{quotationRoomAreaLabel(item) || room?.name || "General"} / {item.description}</small></span><b className="shrink-0">{money(item.amount)}</b></span>
            <span className="mt-3 block text-sm font-semibold">HSN/SAC code (optional)<input value={hsnCodes[index] || ""} onChange={(event) => update(index, event.target.value)} placeholder="Enter HSN or SAC code" className="mt-1.5 w-full rounded-xl border px-3 py-3 font-normal bp-ui-control" /></span>
          </label>;
        })}
      </div>
  </QuotationLineItemPopup>;
}

function QuotationShare({ quotation, customer, customerLogin, onClose }) {
  const dialogRef = useRef(null);
  const [feedback, setFeedback] = useState("");
  const [shareError, setShareError] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const opener = document.activeElement;
    dialog?.showModal?.();
    return () => {
      if (dialog?.open) dialog.close();
      opener?.focus?.();
    };
  }, []);
  const url = `${window.location.origin}/customer-quotations/${quotation.id}`;
  const number = String(customer?.whatsapp || customer?.mobile || "").replace(
    /\D/g,
    "",
  );
  const whatsapp = number.length === 10 ? `91${number}` : number;
  async function copy(text, message) {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(message);
      setShareError("");
    } catch {
      setShareError("Copy failed. Select and copy the portal link displayed above.");
    }
  }
  async function share() {
    if (!navigator.share) return copy(url, "Portal link copied.");
    try {
      await navigator.share({title: quotation.quotation_number, text: "View your Bharath Apps quotation", url});
      setFeedback("Sharing completed.");
      setShareError("");
    } catch (requestError) {
      if (requestError.name !== "AbortError") setShareError("Sharing could not be opened. Copy the portal link instead.");
    }
  }
  return (
    <dialog ref={dialogRef} aria-labelledby="quotation-share-title" onCancel={event => { event.preventDefault(); onClose(); }} className="bp-quotation-dialog fixed m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border-0 bg-white p-6 shadow-xl backdrop:bg-slate-950/50">
      <div>
        <h2 id="quotation-share-title" className="text-xl font-bold bp-ui-section-heading">Final quotation submitted</h2>


        <div className="mt-4 break-all rounded-xl bg-slate-50 p-4 text-xs">
          {url}
        </div>
        {customerLogin && <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950"><p className="font-bold">Customer ID & login created</p><p className="mt-2">Customer ID: <b>{customerLogin.customer_id}</b></p><p>Mobile: <b>{customerLogin.mobile}</b></p><p>Temporary password: <b>{customerLogin.temporary_password}</b></p><button type="button" onClick={() => copy(`Customer ID: ${customerLogin.customer_id}\nMobile: ${customerLogin.mobile}\nTemporary password: ${customerLogin.temporary_password}`, "Login details copied.")} className="mt-3 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-bold bp-ui-action">Copy login details</button><p className="mt-2 text-xs text-indigo-700">Share the temporary password with the customer through a secure channel.</p></div>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <a
            target="_blank"
            rel="noreferrer"
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`View quotation ${quotation.quotation_number}: ${url}`)}`}
            className="rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white"
          >
            WhatsApp
          </a>
          <a
            href={`mailto:${customer?.email || ""}?subject=${encodeURIComponent(`Quotation ${quotation.quotation_number}`)}&body=${encodeURIComponent(`Sign in to view: ${url}`)}`}
            className="rounded-xl border px-4 py-3 text-center text-sm font-semibold"
          >
            Email
          </a>
          <button
            onClick={() => copy(url, "Portal link copied.")}
            className="rounded-xl border px-4 py-3 text-sm font-semibold bp-ui-action"
          >
            Copy link
          </button>
          <button
            onClick={share}
            className="rounded-xl border px-4 py-3 text-sm font-semibold bp-ui-action"
          >
            Other apps
          </button>
        </div>
        {feedback && <p role="status" className="mt-3 text-sm text-emerald-700">{feedback}</p>}
        {shareError && <p role="alert" className="mt-3 text-sm text-red-700">{shareError}</p>}
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white bp-ui-action"
        >
          Done
        </button>
      </div>
    </dialog>
  );
}
function Info({ icon: Icon, label, value, sub }) {
  return (
    <div className="flex gap-3 rounded-xl bg-slate-50 p-4">
      <Icon className="h-5 w-5 text-slate-500" />
      <div>
        <p className="text-xs uppercase text-slate-400">{label}</p>
        <p className="mt-1 font-semibold">{value || "Loading..."}</p>
        <p className="text-sm text-slate-500">{sub}</p>
      </div>
    </div>
  );
}
function Total({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold">{money(value)}</span>
    </div>
  );
}
function quotationTone(status) {
  if (["ACCEPTED", "COMPLETED"].includes(status)) return "success";
  if (["REJECTED", "CANCELLED"].includes(status)) return "danger";
  if (["EXPIRED", "REVISION_REQUESTED"].includes(status)) return "warning";
  if (["SENT", "VIEWED", "SCHEDULED", "IN_PROGRESS"].includes(status)) return "info";
  return "neutral";
}
function QuotationItemMobileDialog({ item, room, index, quotation, close }) {
  return <QuotationLineItemPopup index={index} titleText={`Quotation item ${index+1}`} description={quotationRoomAreaLabel(item) || room?.name || "General"} onClose={close} footer={<Button type="button" onClick={close}>Close</Button>}>
    <QuotationDocumentItemDetails item={item} rooms={room ? [room] : []} form={quotation} />
  </QuotationLineItemPopup>;
}
function DetailField({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{value}</p>
    </div>
  );
}
function _lineTypeLabel(value) {
  return (
    {
      SERVICE_MATERIAL: "Service + Material",
      SERVICE: "Service",
      MATERIAL: "Material",
      REPAIR: "Repair",
    }[value] || "—"
  );
}

function RevisionSummary({ changes }) {
  if (!changes) return null;
  const added = changes.added_lines || [];
  const removed = changes.removed_lines || [];
  const priceChanges = changes.price_changes || [];
  const hasChanges = added.length || removed.length || priceChanges.length || changes.discount_changes?.length || changes.specification_changes?.length || Object.keys(changes.quotation_changes || {}).length;
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-slate-50 px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Revision comparison</p>
          <h2 className="mt-1 font-bold text-slate-950 bp-ui-section-heading">
            {changes.previous_number} <span className="mx-2 text-slate-300">→</span> Current version
          </h2>
        </div>
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border bg-white text-right text-xs">
          <RevisionTotal label="Previous" value={changes.previous_total} />
          <RevisionTotal label="Current" value={changes.current_total} />
          <RevisionTotal label="Difference" value={changes.amount_difference} emphasis />
        </div>
      </header>
      {!hasChanges ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No service or price changes.</p>
      ) : (
        <div className="space-y-5 p-5">
          <QuotationRevisionDetails changes={changes} />
          {priceChanges.length > 0 && (
            <details className="group overflow-hidden rounded-xl border">
              <summary className="flex cursor-pointer list-none items-center justify-between bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                <span>Price changes <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs">{priceChanges.length}</span></span>
                <span className="text-xs font-semibold text-amber-700 group-open:hidden">View details ▾</span>
                <span className="hidden text-xs font-semibold text-amber-700 group-open:inline">Hide details ▴</span>
              </summary>
              <QuotationRevisionPriceChanges lines={priceChanges} />
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr><th className="px-4 py-3">Service</th><th className="px-4 py-3">Room / Area</th><th className="px-4 py-3 text-right">Previous net</th><th className="px-4 py-3 text-right">Current net</th><th className="px-4 py-3 text-right">Difference</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {priceChanges.map((line, index) => (
                      <tr key={`${line.description}-${index}`}>
                        <td className="px-4 py-3"><p className="font-semibold text-slate-900">{line.service}</p><p className="text-xs text-slate-500">{line.description}</p></td>
                        <td className="px-4 py-3 text-slate-600">{line.room}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{money(line.previous_net ?? line.previous_price)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{money(line.current_net ?? line.current_price)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${Number(line.net_difference ?? line.difference) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{signedMoney(line.net_difference ?? line.difference)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <ServiceChanges title="Added services" items={added} variant="added" />
            <ServiceChanges title="Removed services" items={removed} variant="removed" />
          </div>
        </div>
      )}
    </section>
  );
}

function RevisionTotal({ label, value, emphasis = false }) {
  return <div className={`border-l px-3 py-2 first:border-l-0 ${emphasis ? "bg-indigo-50" : ""}`}><p className="text-slate-400">{label}</p><p className={`mt-0.5 font-bold ${emphasis ? "text-indigo-700" : "text-slate-900"}`}>{emphasis ? signedMoney(value) : money(value)}</p></div>;
}

function ServiceChanges({ title, items, variant }) {
  if (!items.length) return null;
  const added = variant === "added";
  return (
    <div className={`overflow-hidden rounded-xl border ${added ? "border-emerald-200" : "border-red-200"}`}>
      <p className={`px-4 py-3 text-sm font-bold ${added ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{title} <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs">{items.length}</span></p>
      <div className="divide-y">
        {items.map((item, index) => <div key={`${item.description}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><div><p className="font-semibold">{item.service}</p><p className="text-xs text-slate-500">{item.room} · {item.description}</p></div><span className={`font-bold ${added ? "text-emerald-700" : "text-red-700"}`}>{added ? "+" : "−"}{money(item.amount)}</span></div>)}
      </div>
    </div>
  );
}

function signedMoney(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${money(number)}`;
}
