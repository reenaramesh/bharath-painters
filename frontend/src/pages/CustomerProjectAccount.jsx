import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../api/client";
import BackButton from "../components/BackButton";
import ProjectFinanceLedger from "../components/ProjectFinanceLedger.jsx";
import { ErrorState, LoadingState, PageHeader, StatCard } from "../components/ui";
import { previewPdf } from "../components/PdfPreview";
import "./finance-pages.css";

const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(Number(value || 0));

export default function CustomerProjectAccount() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("details");
  const ledgerView = ["projects", "payments", "balances", "completed"].includes(requestedView) ? requestedView : "projects";
  const ledgerRef = useRef(null);
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/billing/customers/${id}/project-finance/`);
      setAccount(data);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Project payments could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function downloadReceipt(receipt) {
    try {
      const { data } = await api.get(receipt.download_url, { responseType: "blob" });
      previewPdf(data, `${receipt.receipt_number || receipt.document || "payment"}-receipt.pdf`);
    } catch {
      setError("This payment receipt could not be opened.");
    }
  }

  function showLedger(view) {
    const next = new URLSearchParams(searchParams);
    next.set("details", view);
    setSearchParams(next);
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    ledgerRef.current?.scrollIntoView({ behavior, block: "start" });
  }

  if (loading) return <LoadingState label="Loading customer project account..." />;
  if (error && !account) return <ErrorState message={error} onRetry={load} />;
  const projects = account?.projects || [];
  return (
    <div className="space-y-6 finance-page contractor-revenue-page">
      <BackButton fallback={`/customers/${id}`} label="Back to customer" />
      {error && <ErrorState message={error} onRetry={load} />}
      <PageHeader eyebrow="Customer account" title={`${account?.customer?.name || "Customer"} · project payments`} />
      <section className="finance-summary-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Customer project account totals">
        <StatCard label="Project value" value={account?.project_value == null ? "Unavailable" : money(account.project_value)} hint={`${projects.length} accepted project(s)`} tone="brand" onClick={() => showLedger("projects")} active={ledgerView === "projects"} />
        <StatCard label="Payments received" value={account?.project_total_paid == null ? "Unavailable" : money(account.project_total_paid)} hint={`${account?.receipts?.length || 0} receipt(s)`} tone="success" onClick={() => showLedger("payments")} active={ledgerView === "payments"} />
        <StatCard label="Balance remaining" value={account?.project_balance_due == null ? "Unavailable" : money(account.project_balance_due)} tone="warning" onClick={() => showLedger("balances")} active={ledgerView === "balances"} />
        <StatCard label="Completed projects" value={String(projects.filter((project) => project.status === "COMPLETED").length)} hint="Final invoice used when available" tone="info" onClick={() => showLedger("completed")} active={ledgerView === "completed"} />
      </section>
      {account && <div ref={ledgerRef} className="scroll-mt-24"><ProjectFinanceLedger
        projects={projects}
        receipts={account.receipts || []}
        view={ledgerView}
        onOpenInvoice={(project) => navigate(`/invoices?invoice=${project.invoice_id}`)}
        onDownloadReceipt={downloadReceipt}
        quotationPath={(project) => `/quotations/${project.quotation_id}`}
      /></div>}
    </div>
  );
}
