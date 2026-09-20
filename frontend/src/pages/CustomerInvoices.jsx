import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  ReceiptText,
} from "lucide-react";
import api from "../api/client";
import BackButton from "../components/BackButton";
import { previewPdf } from "../components/PdfPreview";
const money = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const STATUS_STYLES = {
  PAID: "bg-emerald-100 text-emerald-800",
  PART_PAID: "bg-amber-100 text-amber-800",
  ISSUED: "bg-sky-100 text-sky-800",
  CANCELLED: "bg-red-100 text-red-700",
};

function SummaryCard({ label, value, sub, tone }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone || "bg-white"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function CustomerInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [finance, setFinance] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
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
    const [invoiceResult, financeResult] = await Promise.allSettled([
      api.get("/quotations/customer-portal/invoices/"),
      api.get("/billing/customer-finance/"),
    ]);
    if (invoiceResult.status === "rejected") {
      setError("Invoices could not be loaded.");
      return;
    }
    const loadedInvoices = invoiceResult.value.data;
    setInvoices(loadedInvoices);
    if (financeResult.status === "fulfilled") {
      setFinance(financeResult.value.data);
      setError("");
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
  }, []);
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
    <div className="space-y-6">
      <BackButton fallback="/customer-dashboard" label="Back to dashboard" />
      <header>
        <p className="text-sm font-semibold text-amber-600">Customer billing</p>
        <h1 className="mt-1 text-3xl font-bold">Payments & invoices</h1>
        <p className="mt-2 text-slate-500">
          View every receipt, advance credit, final invoice and outstanding
          balance.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total billed"
          value={`₹${money(totals.billed)}`}
          sub={`${invoices.filter((invoice) => invoice.status !== "CANCELLED").length} active invoice(s)`}
          tone="bg-slate-950 text-white [&_p]:text-slate-300 [&_p:first-child]:text-slate-400"
        />
        <SummaryCard
          label="Total paid"
          value={`₹${money(totals.paid)}`}
          sub="Receipts and invoice payments"
          tone="bg-emerald-50 border-emerald-200 [&_p]:text-emerald-700"
        />
        <SummaryCard
          label="Balance due"
          value={`₹${money(totals.due)}`}
          sub={totals.due > 0 ? "Please arrange payment" : "All settled"}
          tone="bg-amber-50 border-amber-200 [&_p]:text-amber-800"
        />
        <SummaryCard
          label="Advance credit"
          value={`₹${money(totals.credit)}`}
          sub={`${finance?.receipts_count || 0} payment receipt(s)`}
        />
      </section>
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}
      <CustomerReceipts
        rows={finance?.receipts || []}
        busy={receiptBusy}
        download={downloadFinanceReceipt}
      />
      <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b p-5">
          <h2 className="font-bold">Final invoices</h2>
          <p className="mt-1 text-sm text-slate-500">
            Balance details for each completed project.
          </p>
        </div>
        <div className="divide-y">
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
                  onClick={() =>
                    setSelected(selected?.id === invoice.id ? null : invoice)
                  }
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-bold">
                      {invoice.invoice_number}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_STYLES[invoice.status] || "bg-slate-100 text-slate-700"}`}
                    >
                      {invoice.status.replaceAll("_", " ")}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    Quotation {invoice.quotation_number} ·{" "}
                    {invoice.property_name}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <span className="rounded-lg bg-slate-50 p-2">
                      <small className="block font-bold uppercase text-slate-400">
                        Invoice date
                      </small>
                      <b className="mt-0.5 block">
                        {invoice.invoice_date || "—"}
                      </b>
                    </span>
                    <span className="rounded-lg bg-slate-50 p-2">
                      <small className="block font-bold uppercase text-slate-400">
                        Due date
                      </small>
                      <b className="mt-0.5 block">
                        {invoice.due_date || "Not specified"}
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
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50 sm:px-4 sm:text-sm"
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
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800 disabled:opacity-50 sm:px-4 sm:text-sm"
                    >
                      <ReceiptText className="h-4 w-4" />
                      {receiptBusy === invoice.id ? "Loading..." : "Receipt"}
                    </button>
                  )}
                </div>
              </div>
              {selected?.id === invoice.id && (
                <InvoiceDetail invoice={invoice} />
              )}
            </div>
          ))}
          {!invoices.length && (
            <p className="p-12 text-center text-slate-500">
              No invoices available yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
function CustomerReceipts({ rows, busy, download }) {
  const [open, setOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const filteredRows = useMemo(() => rows.filter((row) => {
    const value = String(row.date || "").slice(0, 10);
    return (!dateFrom || value >= dateFrom) && (!dateTo || value <= dateTo);
  }), [rows, dateFrom, dateTo]);
  const filteredTotal = filteredRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return (
    <section className="overflow-hidden rounded-2xl border bg-white">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-4 p-5 text-left">
        <span>
          <span className="block font-bold">My payment receipts</span>
          <span className="mt-1 block text-sm text-slate-500">{rows.length} receipt{rows.length === 1 ? "" : "s"} · ₹{money(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0))} received</span>
        </span>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100">{open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</span>
      </button>
      {open && <>
      <div className="grid gap-3 border-y bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">From date<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal text-slate-900" /></label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">To date<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal text-slate-900" /></label>
        <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }} className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold">Clear dates</button>
        <p className="text-sm text-slate-500 sm:col-span-3">Showing <b className="text-slate-900">{filteredRows.length}</b> receipt{filteredRows.length === 1 ? "" : "s"} · Total <b className="text-emerald-700">₹{money(filteredTotal)}</b></p>
      </div>
      <div className="grid gap-3 p-3 md:hidden">
        {filteredRows.map((row) => <article key={row.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex items-start justify-between gap-3 bg-slate-950 p-4 text-white"><div><p className="text-xs font-bold text-slate-300">{row.receipt_number || "Receipt"}</p><h3 className="mt-1 font-bold">{row.contractor || "Contractor"}</h3><p className="mt-1 text-xs text-slate-300">{row.project || row.document}</p></div><b className="shrink-0 text-emerald-300">₹{money(row.amount)}</b></div><div className="grid grid-cols-2 gap-px bg-slate-200 text-xs"><div className="bg-white p-3"><span className="text-slate-400">Date</span><b className="mt-1 block">{new Date(row.date).toLocaleDateString("en-IN")}</b></div><div className="bg-white p-3"><span className="text-slate-400">Mode</span><b className="mt-1 block">{String(row.mode || "OTHER").replaceAll("_", " ")}</b></div></div><div className="flex items-center justify-between gap-3 p-3"><p className="min-w-0 truncate text-xs text-slate-500">{row.document} · {row.reference || "No reference"}</p><button type="button" disabled={busy === row.id} onClick={() => download(row)} className="inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"><Download className="h-4 w-4" />{busy === row.id ? "Loading..." : "PDF"}</button></div></article>)}
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
                  {new Date(row.date).toLocaleDateString("en-IN")}
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
                  {String(row.mode || "OTHER").replaceAll("_", " ")}
                  <small className="block text-slate-500">
                    {row.reference || "—"}
                  </small>
                </td>
                <td className="p-4 text-right font-bold text-emerald-700">
                  ₹{money(row.amount)}
                </td>
                <td className="p-4 text-right">
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => download(row)}
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
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
        <p className="p-10 text-center text-sm text-slate-400">
          {rows.length ? "No receipts found for the selected dates." : "No payment receipts are available yet."}
        </p>
      )}
      </>}
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
