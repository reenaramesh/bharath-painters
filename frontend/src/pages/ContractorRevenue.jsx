import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
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
  `${String.fromCharCode(8377)}${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    try {
      const { data: response } = await api.get("/billing/contractor-revenue/", {
        params: { year, month: month || undefined },
      });
      setData(response);
      setError("");
    } catch {
      setError("Payment and revenue details could not be loaded.");
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
      await api.post("/billing/contractor-revenue/receipts/", {
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
    <div className="min-w-0 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-600">
            Project finance
          </p>
          <h1 className="mt-1 text-3xl font-bold">Revenue & receipts</h1>
          <p className="mt-2 text-slate-500">
            Track customer payments, advance credits, final invoices and
            outstanding balances.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowReceiptForm(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Record payment
          </button>
          <button
            onClick={load}
            className="inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-3 font-semibold"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </header>
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
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
              <p className="mt-1 text-sm text-slate-600">
                Raise a receipt against an active quotation or a final invoice.
              </p>
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
                      {quotation.number} · {quotation.customer} · Balance{" "}
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
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Metric
          icon={IndianRupee}
          label="Total collected"
          value={money(data?.total_collected)}
          dark
        />
        <Metric
          icon={ReceiptText}
          label="Advance received"
          value={money(data?.advance_received)}
          sub="Confirmed receipts"
        />
        <Metric
          icon={WalletCards}
          label="Customer credits"
          value={money(data?.credits)}
          sub="Awaiting final invoice"
        />
        <Metric
          icon={FileText}
          label="Invoices raised"
          value={money(data?.invoices_raised)}
          sub={`${data?.invoices_count || 0} final invoice(s)`}
        />
        <Metric
          icon={IndianRupee}
          label="Outstanding"
          value={money(data?.outstanding)}
          amber
        />
      </section>
      <section className="rounded-2xl border bg-white p-4">
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
      </section>
      <section className="overflow-hidden rounded-2xl border bg-white">
        <header className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold">Payment register</h2>
            <p className="mt-1 text-sm text-slate-500">
              Advance receipts remain available before the final invoice is
              created.
            </p>
          </div>
          <div className="flex rounded-xl bg-slate-100 p-1">
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
        </header>
        {tab === "RECEIPTS" ? (
          <Receipts rows={receipts} busy={busy} download={downloadReceipt} />
        ) : tab === "INVOICES" ? (
          <Invoices rows={invoices} />
        ) : (
          <CustomerDues rows={dues} />
        )}
      </section>
    </div>
  );
}

function Receipts({ rows, busy, download }) {
  return (
    <div className="overflow-x-auto">
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
                {new Date(row.date).toLocaleDateString("en-IN")}
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
                {label(row.mode)}
                <small className="block text-slate-500">
                  {row.reference || "—"}
                </small>
              </td>
              <td className="p-4 text-right text-base font-bold text-emerald-700">
                {money(row.amount)}
              </td>
              <td className="p-4 text-right">
                <button
                  disabled={busy === row.id}
                  onClick={() => download(row)}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  PDF
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="p-10 text-center text-sm text-slate-400">
          No payment receipts found.
        </p>
      )}
    </div>
  );
}
function Invoices({ rows }) {
  return (
    <div className="overflow-x-auto">
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
              <td className="p-4">{row.date}</td>
              <td className="p-4 font-semibold">{row.invoice_number}</td>
              <td className="p-4">
                <b>{row.customer}</b>
                <small className="block text-slate-500">{row.project}</small>
              </td>
              <td className="p-4">{label(row.status)}</td>
              <td className="p-4 text-right font-bold">{money(row.total)}</td>
              <td className="p-4 text-right text-emerald-700">
                {money(row.paid)}
              </td>
              <td className="p-4 text-right text-amber-700">
                {money(row.balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="p-10 text-center text-sm text-slate-400">
          No final invoices found.
        </p>
      )}
    </div>
  );
}
function CustomerDues({ rows }) {
  return (
    <div className="overflow-x-auto">
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
              <td className="p-4 text-right font-semibold">
                {money(row.billed)}
              </td>
              <td className="p-4 text-right text-emerald-700">
                {money(row.received)}
              </td>
              <td className="p-4 text-right text-base font-bold text-amber-700">
                {money(row.due)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="p-10 text-center text-sm text-slate-400">
          No customer balances are due.
        </p>
      )}
    </div>
  );
}
function Metric({ icon: Icon, label: name, value, sub, dark, amber }) {
  return (
    <div
      className={`rounded-2xl border p-4 ${dark ? "bg-slate-950 text-white" : amber ? "border-amber-200 bg-amber-50" : "bg-white"}`}
    >
      <Icon className="h-5 w-5" />
      <p className="mt-3 text-xs opacity-70">{name}</p>
      <p className="mt-1 break-words text-xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-[11px] opacity-70">{sub}</p>}
    </div>
  );
}
function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-xs font-bold ${active ? "bg-slate-950 text-white" : "text-slate-600"}`}
    >
      {children}
    </button>
  );
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
