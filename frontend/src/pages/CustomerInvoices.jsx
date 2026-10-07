import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  ReceiptText,
} from "lucide-react";
import api from "../api/client";
import { useSearchParams } from "react-router-dom";
import BackButton from "../components/BackButton";
import { previewPdf } from "../components/PdfPreview";
import { EmptyState, ErrorState, LoadingState, PageHeader, SectionCard, StatCard, StatusBadge } from "../components/ui";
import "./finance-pages.css";
const money = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });

export default function CustomerInvoices() {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get("property_id") || "";
  const [invoices, setInvoices] = useState([]);
  const [finance, setFinance] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [receiptBusy, setReceiptBusy] = useState(null);
  async function downloadFinanceReceipt(receipt) {
    setReceiptBusy(receipt.id);
    try {
      const response = await api.get(receipt.download_url, {
        responseType: "blob",
      });
      previewPdf(
        response.data,
        `${receipt.receipt_number || receipt.document}-receipt.pdf`,
      );
    } catch {
      setError("Payment receipt could not be previewed.");
    } finally {
      setReceiptBusy(null);
    }
  }
  async function downloadReceipt(invoice) {
    setReceiptBusy(invoice.id);
    try {
      const response = await api.get(
        `/quotations/customer-portal/invoices/${invoice.id}/receipt/`,
        { responseType: "blob" },
      );
      previewPdf(
        response.data,
        `${invoice.receipt_number || invoice.invoice_number}-receipt.pdf`,
      );
    } catch {
      setError("Payment receipt could not be previewed.");
    } finally {
      setReceiptBusy(null);
    }
  }
  const load = useCallback(async () => {
    setLoading(true);
    const [invoiceResult, financeResult] = await Promise.allSettled([
      api.get("/quotations/customer-portal/invoices/", { params: propertyId ? { property_id: propertyId } : {} }),
      api.get("/billing/customer-finance/", { params: propertyId ? { property_id: propertyId } : {} }),
    ]);
    if (invoiceResult.status === "rejected") {
      setError("Invoices could not be loaded.");
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    setLoadFailed(false);
    const loadedInvoices = invoiceResult.value.data;
    setInvoices(loadedInvoices);
    if (financeResult.status === "fulfilled") {
      setFinance(financeResult.value.data);
      setError("");
      setLoading(false);
      return;
    }
    const fallback = loadedInvoices.reduce(
      (total, invoice) => {
        if (invoice.status === "CANCELLED") return total;
        total.total_billed += Number(invoice.grand_total || 0);
        total.total_paid += Number(invoice.amount_paid || 0);
        total.balance_due += Number(invoice.balance_due || 0);
        return total;
      },
      {
        total_billed: 0,
        total_paid: 0,
        balance_due: 0,
        advance_credit: 0,
        receipts_count: 0,
        receipts: [],
      },
    );
    setFinance(fallback);
    setError(
      "Payment history is temporarily unavailable. Invoice balances are shown below.",
    );
    setLoading(false);
  }, [propertyId]);
  useEffect(() => {
    load();
  }, [load]);
  async function download(invoice) {
    setDownloading(invoice.id);
    try {
      const response = await api.get(
        `/quotations/customer-portal/invoices/${invoice.id}/pdf/`,
        { responseType: "blob" },
      );
      previewPdf(response.data, `${invoice.invoice_number}.pdf`);
    } catch {
      setError("Invoice PDF could not be previewed.");
    } finally {
      setDownloading(null);
    }
  }
  const totals = {
    billed: Number(finance?.total_billed || 0),
    paid: Number(finance?.total_paid || 0),
    due: Number(finance?.balance_due || 0),
    credit: Number(finance?.advance_credit || 0),
  };
  return (
    <div className="space-y-6 finance-page customer-finance-page">
      <BackButton fallback="/customer-dashboard" label="Back to dashboard" />
      <PageHeader eyebrow="Customer billing" title="Payments & invoices" description="View every receipt, advance credit, final invoice and outstanding balance." />
      {loading ? <LoadingState label="Loading invoices and payment history..." className="finance-loading" /> : loadFailed ? <ErrorState message={error} onRetry={load} className="finance-inline-error" /> : <>
      <section className="finance-summary-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Invoice and payment summary">
        <StatCard
          label="Total billed"
          value={`₹${money(totals.billed)}`}
          hint={`${invoices.filter((invoice) => invoice.status !== "CANCELLED").length} active invoice(s)`}
          tone="brand"
        />
        <StatCard
          label="Total paid"
          value={`₹${money(totals.paid)}`}
          hint="Receipts and invoice payments"
          tone="success"
        />
        <StatCard
          label="Balance due"
          value={`₹${money(totals.due)}`}
          hint={totals.due > 0 ? "Please arrange payment" : "All settled"}
          tone="warning"
        />
        <StatCard
          label="Advance credit"
          value={`₹${money(totals.credit)}`}
          hint={`${finance?.receipts_count || 0} payment receipt(s)`}
          tone="info"
        />
      </section>
      {totals.due > 0 && (
        <section className="customer-finance-due-banner" aria-label="Outstanding balance">
          <div>
            <p className="customer-finance-due-kicker">Action needed</p>
            <h2>There is a balance waiting for payment</h2>
            <p>Review the invoice below for the project, due date and payment history.</p>
          </div>
          <strong>₹{money(totals.due)}</strong>
        </section>
      )}
      {error && (
        <p className="finance-alert finance-alert-warning" role="status">{error}</p>
      )}
      <CustomerReceipts
        rows={finance?.receipts || []}
        busy={receiptBusy}
        download={downloadFinanceReceipt}
        loading={loading}
      />
      <SectionCard title="Final invoices" description={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"} · balances for completed projects`} className="customer-invoice-list" bodyClassName="p-0">
        <div className="finance-customer-invoices divide-y">
          {invoices.map((invoice, index) => (
            <div key={invoice.id} className="flex flex-col gap-4 p-3 sm:p-5">
              <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:rounded-none lg:border-0 lg:p-0 lg:shadow-none">
                <span className="hidden w-12 shrink-0 text-center text-xs font-bold uppercase tabular-nums text-slate-400 lg:block">
                  SL {index + 1}
                </span>
                <span className="hidden h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-white lg:grid">
                  <FileText className="h-5 w-5" />
                </span>
                <button
                  type="button"
                  aria-expanded={selected?.id === invoice.id}
                  aria-controls={`customer-invoice-detail-${invoice.id}`}
                  onClick={() =>
                    setSelected(selected?.id === invoice.id ? null : invoice)
                  }
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-bold">
                      {invoice.invoice_number}
                    </span>
                    <StatusBadge status={invoice.status} label={String(invoice.status || "Unknown").replaceAll("_", " ")} tone={invoiceTone(invoice.status)} />
                  </p>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {[invoice.quotation_number ? `Quotation ${invoice.quotation_number}` : "Direct invoice", invoice.property_name].filter(Boolean).join(" · ")}
                  </p>
                  {(invoice.contractor_name || invoice.contractor) && <p className="mt-1 text-sm font-medium text-slate-700">From {invoice.contractor_name || invoice.contractor}</p>}
                  <div className="finance-invoice-dates mt-3 grid grid-cols-2 gap-2 text-sm">
                    <span className="rounded-lg bg-slate-50 p-2">
                      <small className="block font-bold uppercase text-slate-400">
                        Invoice date
                      </small>
                      <b className="mt-0.5 block">
                        {formatFinanceDate(invoice.invoice_date)}
                      </b>
                    </span>
                    <span className="rounded-lg bg-slate-50 p-2">
                      <small className="block font-bold uppercase text-slate-400">
                        Due date
                      </small>
                      <b className="mt-0.5 block">
                        {invoice.due_date ? formatFinanceDate(invoice.due_date) : "Not specified"}
                      </b>
                    </span>
                  </div>
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800">
                    {selected?.id === invoice.id ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    {selected?.id === invoice.id
                      ? "Hide details"
                      : "View expenditure breakdown"}
                  </p>
                </button>
                <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-slate-200 text-center lg:w-72 lg:shrink-0 lg:text-right">
                  <div className="bg-slate-50 px-2 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Total
                    </p>
                    <p className="mt-0.5 text-sm font-bold">
                      ₹{money(invoice.grand_total)}
                    </p>
                  </div>
                  <div className="bg-emerald-50 px-2 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Paid
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-emerald-700">
                      ₹{money(invoice.amount_paid)}
                    </p>
                  </div>
                  <div className="bg-amber-50 px-2 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Due
                    </p>
                    <p
                      className={`mt-0.5 text-sm font-bold ${Number(invoice.balance_due) > 0 && invoice.status !== "CANCELLED" ? "text-amber-700" : "text-slate-400"}`}
                    >
                      ₹{money(invoice.balance_due)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 lg:flex lg:shrink-0 lg:flex-col lg:items-end">
                  <button
                    type="button"
                    onClick={() => download(invoice)}
                    disabled={downloading === invoice.id}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:px-4"
                  >
                    <Download className="h-4 w-4" />
                    {downloading === invoice.id
                      ? "Downloading..."
                      : "Download PDF"}
                  </button>
                  {Number(invoice.amount_paid) > 0 && (
                    <button
                      type="button"
                      onClick={() => downloadReceipt(invoice)}
                      disabled={receiptBusy === invoice.id}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800 disabled:opacity-50 sm:px-4"
                    >
                      <ReceiptText className="h-4 w-4" />
                      {receiptBusy === invoice.id ? "Loading..." : "Receipt"}
                    </button>
                  )}
                </div>
              </div>
              {selected?.id === invoice.id && (
                <div id={`customer-invoice-detail-${invoice.id}`}><InvoiceDetail invoice={invoice} /></div>
              )}
            </div>
          ))}
              {!invoices.length && <EmptyState title="No invoices available yet" description="Final invoices will appear here when your contractor issues them." />}
        </div>
      </SectionCard>
      </>}
    </div>
  );
}
function CustomerReceipts({ rows, busy, download, loading }) {
  const [open, setOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const filteredRows = useMemo(() => rows.filter((row) => {
    const value = String(row.date || "").slice(0, 10);
    return (!dateFrom || value >= dateFrom) && (!dateTo || value <= dateTo);
  }), [rows, dateFrom, dateTo]);
  const filteredTotal = filteredRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return (
    <section className="customer-receipts-card overflow-hidden rounded-2xl border bg-white">
      <button type="button" aria-expanded={open} aria-controls="customer-receipts-panel" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-4 p-5 text-left">
        <span>
          <span className="block font-bold">My payment receipts</span>
          <span className="mt-1 block text-sm text-slate-500">{rows.length} receipt{rows.length === 1 ? "" : "s"} · ₹{money(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0))} received</span>
        </span>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100">{open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</span>
      </button>
      {open && <div id="customer-receipts-panel">
      {loading ? <LoadingState label="Loading payment receipts..." className="finance-loading" /> : <>
      <div className="grid gap-3 border-y bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">From date<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal text-slate-900" /></label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">To date<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal text-slate-900" /></label>
        <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }} className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold">Clear dates</button>
        <p className="text-sm text-slate-500 sm:col-span-3">Showing <b className="text-slate-900">{filteredRows.length}</b> receipt{filteredRows.length === 1 ? "" : "s"} · Total <b className="text-emerald-700">₹{money(filteredTotal)}</b></p>
      </div>
      <div className="grid gap-3 p-3 md:hidden">
        {filteredRows.map((row) => <article key={row.id} className="finance-receipt-card overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex items-start justify-between gap-3 bg-slate-950 p-4 text-white"><div><p className="text-sm font-bold text-slate-300">{row.receipt_number || "Receipt"}</p><h3 className="mt-1 font-bold">{row.contractor || "Contractor"}</h3><p className="mt-1 text-sm text-slate-300">{row.project || row.document}</p></div><b className="finance-amount shrink-0 text-base text-emerald-300">₹{money(row.amount)}</b></div><div className="grid grid-cols-2 gap-px bg-slate-200 text-sm"><div className="bg-white p-3"><span className="text-slate-500">Date</span><b className="mt-1 block">{formatFinanceDate(row.date)}</b></div><div className="bg-white p-3"><span className="text-slate-500">Payment method</span><div className="mt-1"><StatusBadge status={row.mode || "OTHER"} label={String(row.mode || "OTHER").replaceAll("_", " ")} tone="neutral" /></div></div></div><div className="flex items-center justify-between gap-3 p-3"><p className="min-w-0 truncate text-sm text-slate-600">{row.document} · {row.reference || "No reference"}</p><button type="button" disabled={busy === row.id} onClick={() => download(row)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"><Download className="h-4 w-4" />{busy === row.id ? "Loading..." : "PDF"}</button></div></article>)}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-4">Date</th>
              <th className="p-4">Receipt</th>
              <th className="p-4">Contractor / project</th>
              <th className="p-4">Against</th>
              <th className="p-4">Mode / reference</th>
              <th className="p-4 text-right">Amount</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredRows.map((row) => (
              <tr key={row.id}>
                <td className="p-4">
                  {formatFinanceDate(row.date)}
                </td>
                <td className="p-4">
                  <b>{row.receipt_number || "Receipt"}</b>
                  <small className="block text-slate-500">
                    {String(row.kind).replaceAll("_", " ")}
                  </small>
                </td>
                <td className="p-4">
                  <b>{row.contractor}</b>
                  <small className="block text-slate-500">{row.project}</small>
                </td>
                <td className="p-4">{row.document}</td>
                <td className="p-4">
                  <StatusBadge status={row.mode || "OTHER"} label={String(row.mode || "OTHER").replaceAll("_", " ")} tone="neutral" />
                  <small className="block text-slate-500">
                    {row.reference || "—"}
                  </small>
                </td>
                <td className="finance-amount p-4 text-right font-bold text-emerald-700">
                  ₹{money(row.amount)}
                </td>
                <td className="p-4 text-right">
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => download(row)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    <Download className="h-4 w-4" />
                    {busy === row.id ? "Loading..." : "PDF"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filteredRows.length && (
        <EmptyState title={rows.length ? "No receipts match these dates" : "No payment receipts yet"} description={rows.length ? "Adjust or clear the date filters to view other receipts." : "Receipts will appear here when payments are recorded."} />
      )}
       </>}
       </div>}
    </section>
  );
}
function InvoiceDetail({ invoice }) {
  const itemsSubtotal = (invoice.items || []).reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );
  return (
    <div className="min-w-0 w-full rounded-xl bg-slate-50 p-3 text-sm sm:p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <p>
          <span className="text-slate-500">Invoice date</span>
          <br />
          <b>{invoice.invoice_date}</b>
        </p>
        <p>
          <span className="text-slate-500">Paid</span>
          <br />
          <b>₹{money(invoice.amount_paid)}</b>
        </p>
        <p>
          <span className="text-slate-500">Balance due</span>
          <br />
          <b>₹{money(invoice.balance_due)}</b>
        </p>
      </div>
      {(invoice.payments || []).length > 0 && (
        <div className="mt-4 min-w-0 rounded-xl border border-emerald-200 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
            Your payments
          </p>
          {invoice.receipt_number && (
            <p className="mt-1 text-xs text-slate-500">
              Receipt no. <b>{invoice.receipt_number}</b>
            </p>
          )}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">Date</th>
                  <th>Mode</th>
                  <th>Reference</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map((payment) => (
                  <tr key={payment.id} className="border-b">
                    <td className="py-2">{payment.received_date}</td>
                    <td>{String(payment.payment_mode).replaceAll("_", " ")}</td>
                    <td>{payment.payment_reference || "—"}</td>
                    <td className="text-right font-bold">
                      ₹{money(payment.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] table-fixed text-left text-xs">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="py-2">Service</th>
              <th>Room</th>
              <th>Description</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={item.serial || index} className="border-b">
                <td className="py-2">{item.service || "-"}</td>
                <td>{item.room || "-"}</td>
                <td>{item.description || "-"}</td>
                <td className="text-right">
                  {item.quantity} {item.unit}
                </td>
                <td className="text-right">₹{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 rounded-xl border bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Expenditure summary
        </p>
        <table className="mt-2 w-full max-w-sm text-left text-xs">
          <tbody>
            <tr className="border-b">
              <td className="py-2 text-slate-500">Items subtotal</td>
              <td className="py-2 text-right font-semibold">
                ₹{money(itemsSubtotal)}
              </td>
            </tr>
            {Number(invoice.tax_total || 0) > 0 && (
              <tr className="border-b">
                <td className="py-2 text-slate-500">GST / tax</td>
                <td className="py-2 text-right font-semibold">
                  ₹{money(invoice.tax_total)}
                </td>
              </tr>
            )}
            {Number(invoice.discount_total || 0) > 0 && (
              <tr className="border-b">
                <td className="py-2 text-slate-500">Discount</td>
                <td className="py-2 text-right font-semibold text-emerald-700">
                  −₹{money(invoice.discount_total)}
                </td>
              </tr>
            )}
            <tr className="border-b">
              <td className="py-2 text-slate-500">Grand total</td>
              <td className="py-2 text-right font-bold">
                ₹{money(invoice.grand_total)}
              </td>
            </tr>
            <tr className="border-b">
              <td className="py-2 text-slate-500">Amount paid</td>
              <td className="py-2 text-right font-semibold text-emerald-700">
                ₹{money(invoice.amount_paid)}
              </td>
            </tr>
            <tr>
              <td className="py-2 text-slate-500">Balance due</td>
              <td className="py-2 text-right font-bold">
                ₹{money(invoice.balance_due)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function invoiceTone(status) {
  if (["PAID", "COMPLETED"].includes(status)) return "success";
  if (["OVERDUE", "CANCELLED"].includes(status)) return "danger";
  if (["PART_PAID", "ISSUED", "PENDING"].includes(status)) return "warning";
  if (status === "REFUNDED") return "info";
  return "neutral";
}

function formatFinanceDate(value) {
  if (!value) return "Date not set";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
