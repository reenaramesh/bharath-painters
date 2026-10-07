import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  Download,
  FileText,
  IndianRupee,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  WalletCards,
  X,
} from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { previewPdf } from "../components/PdfPreview";
import { Button, EmptyState, ErrorState, LoadingState, PageHeader, SectionCard, StatCard, StatusBadge } from "../components/ui";
import "./finance-pages.css";

const months = [
  "All months",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const money = (value) =>
  `${String.fromCharCode(8377)}${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const label = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function ContractorRevenue() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [tab, setTab] = useState("RECEIPTS");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [createdReceipt, setCreatedReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [receiptForm, setReceiptForm] = useState({
    document_type: "QUOTATION",
    quotation: "",
    invoice: "",
    received_date: new Date().toISOString().slice(0, 10),
    amount: "",
    payment_mode: "CASH",
    payment_reference: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: response } = await api.get("/billing/contractor-revenue/", {
        params: { year, month: month || undefined },
      });
      setData(response);
      setError("");
    } catch {
      setError("Payment and revenue details could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [year, month]);
  useEffect(() => {
    if (user?.role === "CONTRACTOR") load();
  }, [load, user]);
  const receipts = useMemo(
    () =>
      filterRows(data?.receipts, search, [
        "receipt_number",
        "customer",
        "project",
        "document",
        "mode",
        "reference",
      ]),
    [data, search],
  );
  const invoices = useMemo(
    () =>
      filterRows(data?.invoices, search, [
        "invoice_number",
        "customer",
        "project",
        "status",
      ]),
    [data, search],
  );
  const dues = useMemo(
    () =>
      filterRows(data?.customer_dues, search, [
        "customer",
        "mobile",
        "bharath_id",
        "projects",
        "invoices",
      ]),
    [data, search],
  );
  async function downloadReceipt(row) {
    setBusy(row.id);
    try {
      const response = await api.get(row.download_url, {
        responseType: "blob",
      });
      previewPdf(
        response.data,
        `${row.receipt_number || row.document}-receipt.pdf`,
      );
    } catch {
      setError("Receipt could not be previewed.");
    } finally {
      setBusy("");
    }
  }
  async function createReceipt(event) {
    event.preventDefault();
    setSavingReceipt(true);
    setError("");
    try {
      const { data: created } = await api.post("/billing/contractor-revenue/receipts/", {
        ...receiptForm,
        quotation:
          receiptForm.document_type === "QUOTATION"
            ? Number(receiptForm.quotation)
            : undefined,
        invoice:
          receiptForm.document_type === "INVOICE"
            ? Number(receiptForm.invoice)
            : undefined,
      });
      setCreatedReceipt(created);
      setReceiptForm({
        document_type: "QUOTATION",
        quotation: "",
        invoice: "",
        received_date: new Date().toISOString().slice(0, 10),
        amount: "",
        payment_mode: "CASH",
        payment_reference: "",
        notes: "",
      });
      setShowReceiptForm(false);
      setTab("RECEIPTS");
      await load();
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Receipt could not be created.",
      );
    } finally {
      setSavingReceipt(false);
    }
  }
  if (user?.role !== "CONTRACTOR") return <Navigate to="/dashboard" replace />;
  return (
    <div className="min-w-0 space-y-6 finance-page contractor-revenue-page">
      <PageHeader eyebrow="Project finance" title="Revenue & receipts" description="Track customer payments, advance credits, final invoices and outstanding balances." actions={<div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowReceiptForm(true)}>
            <Plus className="h-4 w-4" />
            Record payment
          </Button>
          <Button variant="secondary" onClick={load} loading={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
      </div>} />
      {error && <ErrorState message={error} onRetry={load} className="finance-inline-error" />}
      {createdReceipt && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <div>
            <p className="font-bold">Receipt {createdReceipt.receipt_number} generated</p>
            {createdReceipt.quotation_accepted && <p>The payment accepted this quotation. Propose work dates for the customer to confirm.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadReceipt(createdReceipt)} disabled={busy === createdReceipt.id} className="rounded-lg border border-emerald-300 px-3 py-2 font-semibold">Preview receipt</button>
            {createdReceipt.schedule_url && <Link to={createdReceipt.schedule_url} className="rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white">Propose work dates</Link>}
          </div>
        </section>
      )}
      {showReceiptForm && (
        <form
          onSubmit={createReceipt}
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                Payment receipt
              </p>
              <h2 className="mt-1 text-xl font-bold">
                Record customer payment
              </h2>
              
            </div>
            <button
              type="button"
              onClick={() => setShowReceiptForm(false)}
              className="rounded-lg p-2 hover:bg-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Receipt against">
              <select
                required
                value={receiptForm.document_type}
                onChange={(event) =>
                  setReceiptForm({
                    ...receiptForm,
                    document_type: event.target.value,
                    quotation: "",
                    invoice: "",
                  })
                }
              >
                <option value="QUOTATION">Quotation</option>
                <option value="INVOICE">Final invoice</option>
              </select>
            </Field>
            {receiptForm.document_type === "QUOTATION" && (
              <Field label="Quotation">
                <select
                  required
                  value={receiptForm.quotation}
                  onChange={(event) =>
                    setReceiptForm({
                      ...receiptForm,
                      quotation: event.target.value,
                    })
                  }
                >
                  <option value="">Select quotation</option>
                  {(data?.quotations || []).map((quotation) => (
                    <option key={quotation.id} value={quotation.id}>
                      {quotation.number} - {quotation.customer} - {label(quotation.status)} - Balance{" "}
                      {money(quotation.balance)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {receiptForm.document_type === "INVOICE" && (
              <Field label="Final invoice">
                <select
                  required
                  value={receiptForm.invoice}
                  onChange={(event) =>
                    setReceiptForm({
                      ...receiptForm,
                      invoice: event.target.value,
                    })
                  }
                >
                  <option value="">Select unpaid invoice</option>
                  {(data?.open_invoices || []).map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.number} - {invoice.customer} - Due{" "}
                      {money(invoice.balance)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Received date">
              <input
                required
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={receiptForm.received_date}
                onChange={(event) =>
                  setReceiptForm({
                    ...receiptForm,
                    received_date: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="Amount received">
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={receiptForm.amount}
                onChange={(event) =>
                  setReceiptForm({ ...receiptForm, amount: event.target.value })
                }
              />
            </Field>
            <Field label="Payment mode">
              <select
                required
                value={receiptForm.payment_mode}
                onChange={(event) =>
                  setReceiptForm({
                    ...receiptForm,
                    payment_mode: event.target.value,
                  })
                }
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CARD">Card</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Payment reference">
              <input
                value={receiptForm.payment_reference}
                onChange={(event) =>
                  setReceiptForm({
                    ...receiptForm,
                    payment_reference: event.target.value,
                  })
                }
                placeholder="Required except for cash"
              />
            </Field>
            <Field label="Notes">
              <input
                value={receiptForm.notes}
                onChange={(event) =>
                  setReceiptForm({ ...receiptForm, notes: event.target.value })
                }
                placeholder="Optional payment note"
              />
            </Field>
            <div className="flex items-end md:col-span-2">
              <button
                disabled={savingReceipt}
                className="w-full rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-40"
              >
                {savingReceipt
                  ? "Generating receipt..."
                  : "Save and generate receipt"}
              </button>
            </div>
          </div>
        </form>
      )}
      {data === null && loading ? <LoadingState label="Loading revenue and payment history..." className="finance-loading" /> : data && <>
      <section className="finance-summary-grid grid grid-cols-2 gap-3 xl:grid-cols-5" aria-label="Revenue summary">
        <StatCard
          icon={IndianRupee}
          label="Total collected"
          value={money(data?.total_collected)}
          tone="success"
          className="finance-summary-primary"
        />
        <StatCard
          icon={ReceiptText}
          label="Advance received"
          value={money(data?.advance_received)}
          hint="Confirmed receipts"
          tone="info"
        />
        <StatCard
          icon={WalletCards}
          label="Customer credits"
          value={money(data?.credits)}
          hint="Awaiting final invoice"
          tone="brand"
        />
        <StatCard
          icon={FileText}
          label="Invoices raised"
          value={money(data?.invoices_raised)}
          hint={`${data?.invoices_count || 0} final invoice(s)`}
          tone="neutral"
        />
        <StatCard
          icon={IndianRupee}
          label="Outstanding"
          value={money(data?.outstanding)}
          tone="warning"
        />
      </section>
      <SectionCard title="Reporting period" description={`Showing ${month ? `${months[month]} ` : "all months "}${year}. Totals follow this selected period.`} className="finance-filter-card" bodyClassName="p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="rounded-xl border px-4 py-3"
          >
            {(data?.available_years || [year]).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            className="rounded-xl border px-4 py-3"
          >
            {months.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
          <label className="relative flex-1">
            <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search receipt, customer, project, quotation or invoice"
              className="w-full rounded-xl border py-3 pl-11 pr-4"
            />
          </label>
        </div>
      </SectionCard>
      <SectionCard title="Payment register" description="Advance receipts remain available before the final invoice is created." className="finance-register-card" bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-600">{tab === "RECEIPTS" ? `${receipts.length} matching receipts` : tab === "INVOICES" ? `${invoices.length} matching invoices` : `${dues.length} matching customer balances`}</p>
          <div className="finance-tabs flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Payment register views">
            <Tab active={tab === "RECEIPTS"} onClick={() => setTab("RECEIPTS")}>
              Receipts {receipts.length}
            </Tab>
            <Tab active={tab === "INVOICES"} onClick={() => setTab("INVOICES")}>
              Invoices {invoices.length}
            </Tab>
            <Tab active={tab === "DUES"} onClick={() => setTab("DUES")}>
              Customer dues {dues.length}
            </Tab>
          </div>
        </div>
        {tab === "RECEIPTS" ? (
          <Receipts rows={receipts} busy={busy} download={downloadReceipt} />
        ) : tab === "INVOICES" ? (
          <Invoices rows={invoices} />
        ) : (
          <CustomerDues rows={dues} />
        )}
      </SectionCard>
      </>}
    </div>
  );
}

function Receipts({ rows, busy, download }) {
  return (
    <div className="finance-table-scroll overflow-x-auto">
      <div className="finance-mobile-records">
        {rows.map((row) => <article key={row.id} className="finance-mobile-record">
          <div className="finance-mobile-record-head"><div><strong>{row.receipt_number || "Pending number"}</strong><span>{row.customer}</span><small>{row.project}</small></div><b className="finance-amount finance-positive">{money(row.amount)}</b></div>
          <div className="finance-mobile-record-meta"><span>{formatDate(row.date)}</span><span>{label(row.mode)}</span><span>{row.reference || "No reference"}</span></div>
          <div className="finance-mobile-record-actions"><span>{row.document}</span><Button variant="secondary" onClick={() => download(row)} disabled={busy === row.id} loading={busy === row.id}><Download className="h-4 w-4" />Preview receipt</Button></div>
        </article>)}
      </div>
      <table className="w-full min-w-[940px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="p-4">Date</th>
            <th className="p-4">Receipt</th>
            <th className="p-4">Customer / project</th>
            <th className="p-4">Against</th>
            <th className="p-4">Mode / reference</th>
            <th className="p-4 text-right">Amount</th>
            <th className="p-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="p-4">
                {formatDate(row.date)}
              </td>
              <td className="p-4">
                <b>{row.receipt_number || "Pending number"}</b>
                <small className="block text-slate-500">
                  {label(row.kind)}
                </small>
              </td>
              <td className="p-4">
                <b>{row.customer}</b>
                <small className="block text-slate-500">{row.project}</small>
              </td>
              <td className="p-4">{row.document}</td>
              <td className="p-4">
                <StatusBadge status={row.mode} label={label(row.mode)} tone="neutral" />
                <small className="block text-slate-500">
                  {row.reference || "—"}
                </small>
              </td>
              <td className="finance-amount p-4 text-right text-base font-bold text-emerald-700">
                {money(row.amount)}
              </td>
              <td className="p-4 text-right">
                <button
                  disabled={busy === row.id}
                  onClick={() => download(row)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  PDF
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <EmptyState title="No payment receipts found" description="Receipts matching this period and search will appear here." />}
    </div>
  );
}
function Invoices({ rows }) {
  return (
    <div className="finance-table-scroll overflow-x-auto">
      <div className="finance-mobile-records">
        {rows.map((row) => <article key={row.id} className="finance-mobile-record">
          <div className="finance-mobile-record-head"><div><strong>{row.invoice_number}</strong><span>{row.customer}</span><small>{row.project}</small></div><div className="finance-mobile-amount-status"><StatusBadge status={row.status} label={label(row.status)} tone={invoiceTone(row.status)} /><b className="finance-amount">{money(row.total)}</b></div></div>
          <div className="finance-mobile-record-meta"><span>{formatDate(row.date)}</span><span>Paid {money(row.paid)}</span><span>Balance {money(row.balance)}</span></div>
        </article>)}
      </div>
      <table className="w-full min-w-[850px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="p-4">Date</th>
            <th className="p-4">Invoice</th>
            <th className="p-4">Customer / project</th>
            <th className="p-4">Status</th>
            <th className="p-4 text-right">Total</th>
            <th className="p-4 text-right">Paid</th>
            <th className="p-4 text-right">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="p-4">{formatDate(row.date)}</td>
              <td className="p-4 font-semibold">{row.invoice_number}</td>
              <td className="p-4">
                <b>{row.customer}</b>
                <small className="block text-slate-500">{row.project}</small>
              </td>
              <td className="p-4"><StatusBadge status={row.status} label={label(row.status)} tone={invoiceTone(row.status)} /></td>
              <td className="finance-amount p-4 text-right font-bold">{money(row.total)}</td>
              <td className="finance-amount p-4 text-right text-emerald-700">
                {money(row.paid)}
              </td>
              <td className="finance-amount p-4 text-right text-amber-700">
                {money(row.balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <EmptyState title="No final invoices found" description="Invoices raised in this period will appear here." />}
    </div>
  );
}
function CustomerDues({ rows }) {
  return (
    <div className="finance-table-scroll overflow-x-auto">
      <div className="finance-mobile-records">
        {rows.map((row) => <article key={row.customer_id} className="finance-mobile-record">
          <div className="finance-mobile-record-head"><div><strong>{row.customer}</strong><span>{[row.bharath_id, row.mobile].filter(Boolean).join(" · ")}</span><small>{row.projects.join(", ") || "No project listed"}</small></div><b className="finance-amount finance-warning">{money(row.due)} due</b></div>
          <div className="finance-mobile-record-meta"><span>{row.invoice_count} due invoice(s)</span><span>Billed {money(row.billed)}</span><span>Received {money(row.received)}</span></div>
          {row.invoices.length > 0 && <p className="finance-mobile-reference">Invoices: {row.invoices.join(", ")}</p>}
        </article>)}
      </div>
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="p-4">Customer</th>
            <th className="p-4">Projects</th>
            <th className="p-4">Due invoices</th>
            <th className="p-4 text-right">Billed</th>
            <th className="p-4 text-right">Received</th>
            <th className="p-4 text-right">Balance due</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.customer_id}>
              <td className="p-4">
                <b>{row.customer}</b>
                <small className="block text-slate-500">
                  {[row.bharath_id, row.mobile].filter(Boolean).join(" - ")}
                </small>
              </td>
              <td className="p-4">{row.projects.join(", ") || "-"}</td>
              <td className="p-4">
                <b>{row.invoice_count}</b>
                <small className="block text-slate-500">
                  {row.invoices.join(", ")}
                </small>
              </td>
              <td className="finance-amount p-4 text-right font-semibold">
                {money(row.billed)}
              </td>
              <td className="finance-amount p-4 text-right text-emerald-700">
                {money(row.received)}
              </td>
              <td className="finance-amount p-4 text-right text-base font-bold text-amber-700">
                {money(row.due)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <EmptyState title="No customer balances are due" description="Outstanding balances will appear here when invoices have an amount due." />}
    </div>
  );
}
function Tab({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3 py-2 text-xs font-bold ${active ? "bg-slate-950 text-white" : "text-slate-600"}`}
    >
      {children}
    </button>
  );
}

function formatDate(value) {
  if (!value) return "Date not set";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function invoiceTone(value) {
  if (["PAID", "COMPLETED"].includes(value)) return "success";
  if (["OVERDUE", "CANCELLED"].includes(value)) return "danger";
  if (["PART_PAID", "ISSUED", "PENDING"].includes(value)) return "warning";
  if (["REFUNDED"].includes(value)) return "info";
  return "neutral";
}
function filterRows(rows = [], query, fields) {
  const value = query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      !value ||
      fields.some((field) =>
        String(row[field] || "")
          .toLowerCase()
          .includes(value),
      ),
  );
}

function Field({ label: name, children }) {
  return (
    <label className="text-sm font-semibold">
      {name}
      <span className="mt-2 block [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:bg-white [&_input]:px-3 [&_input]:py-3 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:bg-white [&_select]:px-3 [&_select]:py-3">
        {children}
      </span>
    </label>
  );
}
