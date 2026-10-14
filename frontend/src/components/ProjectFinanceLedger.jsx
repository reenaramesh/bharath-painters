import { useState } from "react";
import { ChevronDown, ChevronUp, FileText, ReceiptText } from "lucide-react";
import { Link } from "react-router-dom";
import { SectionCard, StatusBadge } from "./ui";

const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(Number(value || 0));
const date = (value) => value ? new Date(value).toLocaleDateString("en-IN", {
  day: "numeric", month: "short", year: "numeric",
}) : "Date unavailable";

export default function ProjectFinanceLedger({
  projects = [], receipts = [], canViewInvoices = true, canViewPayments = true,
  view = "projects",
  quotationPath = (project) => `/customer-quotations/${project.quotation_id}`,
  onOpenInvoice, onDownloadReceipt,
}) {
  const [expanded, setExpanded] = useState(null);
  const orderedReceipts = [...receipts].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const visibleReceipts = view === "credits" ? orderedReceipts.filter((receipt) => receipt.is_customer_credit) : orderedReceipts;
  const visibleProjects = projects.filter((project) => {
    if (view === "balances") return Number(project.balance_due) > 0;
    if (view === "completed") return project.status === "COMPLETED";
    return true;
  });
  const titles = {
    projects: ["Approved projects", "Balances and payments, grouped by quotation"],
    payments: ["Payment register", "Receipts recorded across approved projects"],
    credits: ["Customer credit register", "Payments currently held as customer credit"],
    balances: ["Projects with balances", "Approved projects with an amount remaining"],
    completed: ["Completed projects", "Final invoice used when available"],
  };
  const [title, description] = titles[view] || titles.projects;
  return (
    <SectionCard title={title} description={description} className="finance-project-ledger">
      {view === "payments" || view === "credits" ? (
        !canViewPayments ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Payment details are not available for this account.</p> :
          visibleReceipts.length ? <div className="divide-y divide-slate-100">{visibleReceipts.map((receipt) => (
            <div key={receipt.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1.2fr_1.1fr_1fr_auto] sm:items-center">
              <span className="text-sm font-semibold text-slate-800">{receipt.receipt_number || "Payment receipt"}<small className="mt-0.5 block font-normal text-slate-500">{receipt.project || "Approved project"}</small>{receipt.document && <small className="block font-normal text-slate-500">{receipt.document}</small>}</span>
              <span className="text-sm text-slate-600">{date(receipt.date)}</span>
              <span className="text-xs text-slate-500">{String(receipt.kind || "PAYMENT").replaceAll("_", " ")}{receipt.mode ? ` - ${String(receipt.mode).replaceAll("_", " ")}` : ""}{receipt.reference ? ` - ${receipt.reference}` : ""}</span>
              <span className="flex items-center justify-between gap-2 sm:justify-end"><strong className="text-sm tabular-nums text-emerald-700">{money(receipt.amount)}</strong>{onDownloadReceipt && receipt.download_url && <button type="button" className="bp-button bp-button-secondary min-h-9 px-3 text-xs" onClick={() => onDownloadReceipt(receipt)}>PDF</button>}</span>
            </div>
          ))}</div> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{view === "credits" ? "There are no customer credits in this account." : "No payment receipts have been recorded yet."}</p>
      ) : !visibleProjects.length ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{view === "balances" ? "There are no approved projects with a remaining balance." : view === "completed" ? "No completed projects are available yet." : "Accepted quotations will appear here when the customer approves them."}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {visibleProjects.map((project) => {
            const projectReceipts = project.receipts || [];
            const isExpanded = expanded === project.quotation_id;
            const statusLabel = String(project.status || "APPROVED").replaceAll("_", " ");
            return (
              <article key={project.quotation_id} className="py-4 first:pt-0 last:pb-0">
                <div className="grid gap-3 lg:grid-cols-[minmax(180px,1.5fr)_repeat(3,minmax(100px,.7fr))_auto] lg:items-center">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900">{project.property_name || "Project"}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{project.quotation_number || "Quotation"}</span>
                      <StatusBadge status={project.status} label={statusLabel} tone={project.status === "COMPLETED" ? "success" : "neutral"} />
                    </p>
                  </div>
                  <ProjectAmount label="Project total" value={canViewInvoices ? project.project_total : null} />
                  <ProjectAmount label="Paid" value={canViewPayments ? project.amount_paid : null} tone="paid" />
                  <ProjectAmount label="Balance" value={canViewPayments ? project.balance_due : null} tone={Number(project.balance_due) > 0 ? "due" : "paid"} />
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {canViewPayments && <button type="button" className="bp-button bp-button-secondary min-h-10 px-3 text-xs" aria-expanded={isExpanded} onClick={() => setExpanded(isExpanded ? null : project.quotation_id)}><ReceiptText className="mr-1.5 h-4 w-4" />Receipts {projectReceipts.length}{isExpanded ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}</button>}
                    {project.invoice_id && onOpenInvoice ? <button type="button" className="bp-button bp-button-primary min-h-10 px-3 text-xs" onClick={() => onOpenInvoice(project)}>Invoice</button> : <Link className="bp-button bp-button-primary min-h-10 px-3 text-xs" to={quotationPath(project)}><FileText className="mr-1.5 h-4 w-4" />Quotation</Link>}
                  </div>
                </div>
                {isExpanded && <div className="mt-3 rounded-xl bg-slate-50 px-3 sm:px-4">
                  {!projectReceipts.length ? <p className="py-3 text-sm text-slate-500">No payments have been recorded for this project yet.</p> : projectReceipts.map((receipt) => (
                    <div key={receipt.id} className="grid gap-2 border-b border-slate-200 py-3 last:border-0 sm:grid-cols-[1.3fr_1fr_1.2fr_auto] sm:items-center">
                      <span className="text-sm font-semibold text-slate-800">{receipt.receipt_number || "Payment receipt"}<small className="mt-0.5 block font-normal text-slate-500">{String(receipt.kind || "PAYMENT").replaceAll("_", " ")}</small></span>
                      <span className="text-sm text-slate-600">{date(receipt.date)}</span>
                      <span className="text-xs text-slate-500">{String(receipt.mode || "Payment").replaceAll("_", " ")}{receipt.reference ? ` · ${receipt.reference}` : ""}</span>
                      <span className="flex items-center justify-between gap-2 sm:justify-end"><strong className="text-sm tabular-nums text-emerald-700">{money(receipt.amount)}</strong>{onDownloadReceipt && receipt.download_url && <button type="button" className="bp-button bp-button-secondary min-h-9 px-3 text-xs" onClick={() => onDownloadReceipt(receipt)}>PDF</button>}</span>
                    </div>
                  ))}
                </div>}
              </article>
            );
          })}
        </div>
      )}
      {projects.some((project) => project.invoice_id) && <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Completed projects use their final invoice amount; the quotation is not counted twice.</p>}
      {view === "projects" && !!orderedReceipts.length && <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">{orderedReceipts.length} payment receipt{orderedReceipts.length === 1 ? "" : "s"} across these projects</div>}
    </SectionCard>
  );
}

function ProjectAmount({ label, value, tone }) {
  const color = tone === "paid" ? "text-emerald-700" : tone === "due" ? "text-amber-700" : "text-slate-900";
  return <div className="flex items-center justify-between border-t border-slate-100 pt-2 lg:block lg:border-0 lg:pt-0"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:block">{label}</span><strong className={`text-sm tabular-nums ${color} lg:mt-1 lg:block`}>{value == null ? "Unavailable" : money(value)}</strong></div>;
}
