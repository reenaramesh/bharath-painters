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
  X,
} from "lucide-react";
import api from "../api/client";
import { quotationRoomAreaLabel } from "../utils/groupedQuotation";
import BackButton from "../components/BackButton";
import { previewPdf } from "../components/PdfPreview";
import ProjectScopesPanel from "../components/ProjectScopesPanel";
import { profileImageStyle } from "../utils/profileImagePosition";
import { ErrorState, LoadingState, PageHeader, StatusBadge } from "../components/ui";
import "./quotation-measurement.css";

const money = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    Number(value || 0),
  );
const quotationColumnDefaults = [4, 14, 11, 15, 19, 9, 6, 10, 12];
const quotationColumnMinimums = [3, 8, 7, 8, 10, 6, 5, 7, 8];
const quotationColumnLabels = ["Number", "Type of service", "Room or area", "Product or brand", "Product description", "Quantity", "Coats", "Rate", "Amount"];
const quotationColumnStorageKey = "bp-quotation-item-column-widths";

function savedQuotationColumnWidths() {
  try {
    const widths = JSON.parse(window.localStorage.getItem(quotationColumnStorageKey));
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
  const [converting, setConverting] = useState(false);
  const convertingRef = useRef(false);
  const [showShare, setShowShare] = useState(false);
  const [customerLogin, setCustomerLogin] = useState(null);
  const [mobileItem, setMobileItem] = useState(null);
  const [invoiceSetup, setInvoiceSetup] = useState(null);
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
        const [c, p] = await Promise.all([
          api.get(`/quotations/customers/${data.customer}/`),
          api.get(`/quotations/properties/${data.property}/`),
        ]);
        setCustomer(c.data);
        setProperty(p.data);
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
    setSubmitting(true);
    setError("");
    try {
      const { data } = await api.post(`/quotations/${id}/submit/`);
      setQuotation((current) => ({ ...current, status: data.status }));
      setCustomerLogin(data.temporary_password ? { customer_id: data.customer_id, mobile: data.customer_mobile, temporary_password: data.temporary_password } : null);
      setShowShare(true);
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Quotation could not be submitted.",
      );
    } finally {
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
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-semibold text-white disabled:opacity-60 sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"
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
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-semibold text-white sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Share
            </button>
          )}
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="flex items-center gap-1 rounded-lg bg-slate-950 px-2.5 py-2 text-xs font-semibold text-white disabled:opacity-60 sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"
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
          {quotation.status !== "REVISION_REQUESTED" && (
            <Link
              to={`/quotations/${id}/edit`}
              className="flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-semibold sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Edit
            </Link>
          )}
          {quotation.status === "COMPLETED" && (
            <button
              onClick={() => setInvoiceSetup(quotation.items.map(() => ""))}
              disabled={converting}
              className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-900 disabled:opacity-60 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"
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
          <button
            onClick={remove}
            disabled={deleting}
            className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-2 text-xs font-semibold text-red-600 disabled:opacity-60 sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"
          >
            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {deleting ? "Deleting..." : "Delete"}
          </button>
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
      <section className="quotation-sheet rounded-2xl border bg-white">
        <div className="quotation-company-header flex flex-col gap-5 border-b p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
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
                <h2 className="text-xl font-bold">
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
          <div className="text-sm text-slate-500 md:text-right">
            <p>{contractor?.mobile}</p>
            <p>{contractor?.email}</p>
            {contractor?.gst_number && <p>GSTIN: {contractor.gst_number}</p>}
            {contractor?.pan_number && <p>PAN: {contractor.pan_number}</p>}
            {contractor?.office_address && (
              <p className="mt-1 max-w-sm whitespace-pre-line">
                {contractor.office_address}
              </p>
            )}
            {contractor?.service_areas && (
              <p>Service areas: {contractor.service_areas}</p>
            )}
          </div>
        </div>
        <div className="quotation-number-header flex flex-col gap-3 border-b p-4 sm:flex-row sm:justify-between sm:p-5">
          <PageHeader eyebrow="Quotation" title={quotation.quotation_number} description={`Version ${quotation.version_number || 1} · Created ${quotation.quotation_date}${quotation.valid_until ? ` · Valid until ${quotation.valid_until}` : ""}`} actions={<StatusBadge status={quotation.status} tone={quotationTone(quotation.status)} />} />
        </div>
        <div className="quotation-entity-cards grid gap-5 p-6 md:grid-cols-2">
          <Info
            icon={User}
            label="Customer"
            value={customer?.name}
            sub={customer?.mobile}
          />
          <Info
            icon={Building2}
            label="Property"
            value={property?.name || property?.property_type}
            sub={property?.city}
          />
        </div>
      </section>
      <section className="quotation-items rounded-2xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-6">
          <div><h2 className="font-bold">Quotation items</h2><p className="hidden text-xs text-slate-500 md:block">Drag the column edges to adjust widths.</p></div>
          <button type="button" className="hidden text-xs font-semibold text-indigo-700 hover:underline md:inline" onClick={() => {
            setColumnWidths(quotationColumnDefaults);
          }}>Reset column widths</button>
        </div>
        <div className="grid gap-3 p-3 md:hidden">
          {quotation.items.map((item, index) => {
            const room = quotation.rooms.find(
              (entry) => Number(entry.id) === Number(item.room),
            );
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setMobileItem({ item, room, index })}
                className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3 bg-slate-950 px-4 py-3 text-white">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      Item {index + 1} · {item.service_category_name || "Service"}
                    </p>
                    <h3 className="mt-1 whitespace-normal font-bold">
                      {quotationRoomAreaLabel(item) || room?.name || "General"}
                    </h3>
                    <p className="mt-0.5 truncate text-xs text-slate-300">
                      {item.paint_type_name || "Product not specified"}
                    </p>
                  </div>
                  <p className="shrink-0 text-base font-extrabold text-emerald-300">
                    {money(item.amount)}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-px bg-slate-200">
                  <QuoteItemValue label="Quantity" value={`${item.quantity} ${item.unit_name || ""}`} />
                  <QuoteItemValue label="Rate" value={money(item.rate)} />
                  <QuoteItemValue label="Amount" value={money(item.amount)} strong />
                </div>
              </button>
            );
          })}
        </div>
        <div className="hidden md:block" data-mobile-table="keep">
          <table ref={quotationTableRef} className="w-full table-fixed text-left text-xs">
            <colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {["#", "Type of service", "Room / Area", "Product / Brand", "Product description", "Qty", "Coats", "Rate", "Amount"].map((label, index) => (
                  <th key={label} scope="col" className={`quotation-resizable-heading px-3 py-4 ${index === 5 || index >= 7 ? "text-right" : index === 6 ? "text-center" : ""}`}>
                    {label}
                    {index < quotationColumnDefaults.length - 1 && <span
                      role="separator"
                      tabIndex={0}
                      aria-label={`Resize ${quotationColumnLabels[index]} column`}
                      aria-orientation="vertical"
                      className="quotation-column-resizer"
                      onPointerDown={(event) => startColumnResize(event, index)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                          event.preventDefault();
                          resizeColumns(index, event.key === "ArrowRight" ? 1 : -1);
                        }
                      }}
                    />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {quotation.items.map((item, index) => {
                const room = quotation.rooms.find(
                  (entry) => Number(entry.id) === Number(item.room),
                );
                return <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="px-3 py-4 text-slate-400">{index + 1}</td>
                  <td className="px-3 py-4 font-semibold">{[item.service_category_name, item.service_type_name].filter(Boolean).join(" / ") || "-"}</td>
                  <td className="px-3 py-4 font-semibold text-slate-700">{quotationRoomAreaLabel(item) || room?.name || "General"}</td>
                  <td className="px-3 py-4"><p className="font-medium">{item.paint_type_name || "-"}</p><p className="mt-1 text-[11px] text-slate-500">{item.brand_name || "No brand"}</p></td>
                  <td className="break-words px-3 py-4 font-medium">{item.description}</td>
                  <td className="px-3 py-4 text-right"><p className="font-bold tabular-nums">{item.quantity}</p><p className="text-[11px] text-slate-500">{item.unit_name || "-"}</p></td>
                  <td className="px-3 py-4 text-center">{item.is_additional_service ? "-" : item.coats || 1}</td>
                  <td className="px-3 py-4 text-right tabular-nums">{money(item.rate)}</td>
                  <td className="px-3 py-4 text-right font-bold tabular-nums text-slate-950">{money(item.amount)}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {mobileItem && (
          <QuotationItemMobileDialog
            item={mobileItem.item}
            room={mobileItem.room}
            index={mobileItem.index}
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
      <ProjectScopesPanel quotationId={id} />
      <section className="quotation-pdf-options rounded-2xl border bg-white p-5 sm:p-6" aria-labelledby="quotation-pdf-options-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="quotation-pdf-options-title" className="font-bold">Include in downloaded PDF</h2>
            <p className="mt-1 text-sm text-slate-500">Select exactly which available fields appear in this PDF. Your saved quotation stays the same.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{selectedPdfSections.length} of {pdfSectionOptions.length} selected</span>
            <button type="button" onClick={() => setPdfSectionSelection(Object.fromEntries(pdfSectionOptions.map(({ key }) => [key, true])))} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">Select all</button>
            <button type="button" onClick={() => setPdfSectionSelection(Object.fromEntries(pdfSectionOptions.map(({ key }) => [key, false])))} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">Clear all</button>
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
            <h2 className="font-bold">Notes</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
              {quotation.notes || "No notes"}
            </p>
          </div>
          <div>
            <h2 className="font-bold">Terms and conditions</h2>
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
          <h2 className="font-bold">Work and payment details</h2>
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
  return <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/60 sm:items-center sm:justify-center sm:p-6">
    <div className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl">
      <header className="flex items-start justify-between border-b p-5">
        <div><p className="text-xs font-bold uppercase tracking-wide text-amber-600">Final invoice</p><h2 className="text-xl font-extrabold">Confirm HSN/SAC codes</h2></div>
        <button type="button" onClick={onClose} className="rounded-xl border p-2"><X className="h-5 w-5" /></button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {quotation.items.map((item, index) => {
          const room = quotation.rooms.find((entry) => Number(entry.id) === Number(item.room));
          return <label key={item.id || index} className="block rounded-2xl border p-4">
            <span className="flex items-start justify-between gap-3"><span><small className="block font-bold uppercase tracking-wide text-amber-600">Item {index + 1}</small><b className="mt-1 block">{item.service_category_name || item.service_type_name || "Service"}</b><small className="whitespace-normal text-slate-600">{quotationRoomAreaLabel(item) || room?.name || "General"} / {item.description}</small></span><b className="shrink-0">{money(item.amount)}</b></span>
            <span className="mt-3 block text-sm font-semibold">HSN/SAC code (optional)<input value={hsnCodes[index] || ""} onChange={(event) => update(index, event.target.value)} placeholder="Enter HSN or SAC code" className="mt-1.5 w-full rounded-xl border px-3 py-3 font-normal" /></span>
          </label>;
        })}
      </div>
      <footer className="grid grid-cols-2 gap-3 border-t p-4"><button type="button" onClick={onClose} className="rounded-xl border py-3 font-bold">Cancel</button><button type="button" onClick={onCreate} disabled={converting} className="rounded-xl bg-slate-950 py-3 font-bold text-white disabled:opacity-50">{converting ? "Creating..." : "Create & Preview"}</button></footer>
    </div>
  </div>;
}

function QuotationShare({ quotation, customer, customerLogin, onClose }) {
  const url = `${window.location.origin}/customer-quotations/${quotation.id}`;
  const number = String(customer?.whatsapp || customer?.mobile || "").replace(
    /\D/g,
    "",
  );
  const whatsapp = number.length === 10 ? `91${number}` : number;
  async function share() {
    if (navigator.share)
      await navigator.share({
        title: quotation.quotation_number,
        text: "View your Bharath Apps quotation",
        url,
      });
    else await navigator.clipboard.writeText(url);
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold">Final quotation submitted</h2>
        <p className="mt-2 text-sm text-slate-500">
          This link takes the customer to login and then opens the quotation.
        </p>
        <div className="mt-4 break-all rounded-xl bg-slate-50 p-4 text-xs">
          {url}
        </div>
        {customerLogin && <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950"><p className="font-bold">Customer ID & login created</p><p className="mt-2">Customer ID: <b>{customerLogin.customer_id}</b></p><p>Mobile: <b>{customerLogin.mobile}</b></p><p>Temporary password: <b>{customerLogin.temporary_password}</b></p><button type="button" onClick={() => navigator.clipboard.writeText(`Customer ID: ${customerLogin.customer_id}\nMobile: ${customerLogin.mobile}\nTemporary password: ${customerLogin.temporary_password}`)} className="mt-3 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-bold">Copy login details</button><p className="mt-2 text-xs text-indigo-700">Share the temporary password with the customer through a secure channel.</p></div>}
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
            onClick={() => navigator.clipboard.writeText(url)}
            className="rounded-xl border px-4 py-3 text-sm font-semibold"
          >
            Copy link
          </button>
          <button
            onClick={share}
            className="rounded-xl border px-4 py-3 text-sm font-semibold"
          >
            Other apps
          </button>
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white"
        >
          Done
        </button>
      </div>
    </div>
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
function QuoteItemValue({ label, value, strong = false }) {
  return (
    <div className="min-w-0 bg-white px-3 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 truncate text-sm tabular-nums ${strong ? "font-extrabold text-emerald-700" : "font-bold text-slate-900"}`}>
        {value || "—"}
      </p>
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
function QuotationItemMobileDialog({ item, room, index, close }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end bg-slate-950/60 md:hidden"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <section role="dialog" aria-modal="true" aria-label="Quotation line details" className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-slate-50 shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white px-4 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">Item {index + 1} · Quotation line</p>
            <h2 className="whitespace-normal text-lg font-bold">{quotationRoomAreaLabel(item) || room?.name || "General"}</h2>
          </div>
          <button type="button" onClick={close} aria-label="Close details" className="rounded-xl border p-2.5"><X className="h-5 w-5" /></button>
        </header>
        <div className="space-y-4 p-4 pb-24">
          <div className="grid grid-cols-2 gap-3">
            <PopupValue label="Type of service" value={item.service_category_name} />
            <PopupValue label="Room / Area" value={quotationRoomAreaLabel(item) || room?.name || "General"} />
            <PopupValue label="Product type" value={item.paint_type_name} />
            <PopupValue label="Brand" value={item.brand_name} />
            <PopupValue label="MOU" value={item.unit_name} />
            <PopupValue label="Quantity" value={item.quantity} />
            {!item.is_additional_service && <PopupValue label="Coats" value={item.coats || 1} />}
            <PopupValue label="Rate" value={money(item.rate)} />
          </div>
          <PopupValue label="Product description" value={item.description} wide />
          <div className="flex items-center justify-between rounded-2xl bg-slate-950 p-4 text-white">
            <span className="text-sm text-slate-300">Line amount</span>
            <b className="text-xl text-emerald-300">{money(item.amount)}</b>
          </div>
        </div>
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t bg-white p-4">
          <button type="button" onClick={close} className="w-full rounded-xl bg-slate-950 px-5 py-3 font-bold text-white">Close</button>
        </footer>
      </section>
    </div>
  );
}
function PopupValue({ label, value, wide = false }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-3 ${wide ? "col-span-2" : ""}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-5 text-slate-800">{value || "—"}</p>
    </div>
  );
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
  const hasChanges = added.length || removed.length || priceChanges.length;
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-slate-50 px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Revision comparison</p>
          <h2 className="mt-1 font-bold text-slate-950">
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
          {priceChanges.length > 0 && (
            <details className="group overflow-hidden rounded-xl border">
              <summary className="flex cursor-pointer list-none items-center justify-between bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                <span>Price changes <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs">{priceChanges.length}</span></span>
                <span className="text-xs font-semibold text-amber-700 group-open:hidden">View details ▾</span>
                <span className="hidden text-xs font-semibold text-amber-700 group-open:inline">Hide details ▴</span>
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr><th className="px-4 py-3">Service</th><th className="px-4 py-3">Room / Area</th><th className="px-4 py-3 text-right">Previous</th><th className="px-4 py-3 text-right">Current</th><th className="px-4 py-3 text-right">Difference</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {priceChanges.map((line, index) => (
                      <tr key={`${line.description}-${index}`}>
                        <td className="px-4 py-3"><p className="font-semibold text-slate-900">{line.service}</p><p className="text-xs text-slate-500">{line.description}</p></td>
                        <td className="px-4 py-3 text-slate-600">{line.room}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{money(line.previous_price)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{money(line.current_price)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${Number(line.difference) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{signedMoney(line.difference)}</td>
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
