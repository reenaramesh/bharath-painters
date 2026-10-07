import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Building2, Search } from "lucide-react";
import api from "../api/client";
import { profileImageStyle } from "../utils/profileImagePosition";
import { EmptyState, ErrorState, LoadingState, PageHeader, SectionCard, StatusBadge } from "../components/ui";

export default function CustomerQuotations() {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get("property_id") || "";
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/quotations/customer-portal/quotations/", {
        params: { refresh: Date.now(), ...(propertyId ? { property_id: propertyId } : {}) },
      });
      setItems(data || []);
      setError("");
    } catch {
      setError("Quotations could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);
  useEffect(() => {
    load();
  }, [load]);
  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) =>
      (status === "ALL" || item.status === status) &&
      (!term || [item.quotation_number, item.contractor_name, item.property_name, item.contractor_bharath_id].some((value) => String(value || "").toLowerCase().includes(term))),
    );
  }, [items, search, status]);
  const responseCount = items.filter((item) => ["SENT", "VIEWED"].includes(item.status)).length;
  const activeWorkCount = items.filter((item) => ["ACCEPTED", "CONVERTED", "SCHEDULED", "IN_PROGRESS"].includes(item.status)).length;
  const totalValue = items.reduce((sum, item) => sum + Number(item.grand_total || 0), 0);
  return (
    <div className="customer-quotations-page space-y-6">
      <PageHeader
        eyebrow="Plans and estimates"
        title="My quotations"
        description="Review who sent each estimate, the property, total and planned work dates."
      />
      <section className="customer-quotation-pulse" aria-label="Quotation summary">
        <div className={`customer-quotation-pulse-card ${responseCount ? "is-action" : ""}`}>
          <span className="customer-quotation-pulse-label">Needs your response</span>
          <strong>{responseCount}</strong>
          <span>{responseCount ? "Open a quotation to review and decide." : "Nothing is waiting for you."}</span>
        </div>
        <div className="customer-quotation-pulse-card">
          <span className="customer-quotation-pulse-label">Active projects</span>
          <strong>{activeWorkCount}</strong>
          <span>Accepted estimates with work ahead.</span>
        </div>
        <div className="customer-quotation-pulse-card customer-quotation-pulse-total">
          <span className="customer-quotation-pulse-label">Quoted value</span>
          <strong>{formatMoney(totalValue)}</strong>
          <span>Across your saved quotations.</span>
        </div>
      </section>
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      <SectionCard
        title="Find a quotation"
        description={`${visibleItems.length} of ${items.length} quotations`}
        className="customer-quotation-filters"
        bodyClassName="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]"
      >
        <label className="customer-quotation-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search quotation, contractor or property</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search quotation, contractor or property"
          />
        </label>
        <label className="customer-quotation-status-filter">
          <span className="sr-only">Filter by quotation status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="ALL">All statuses</option>
            {quotationStatuses.map((value) => (
              <option key={value} value={value}>{readableStatus(value)}</option>
            ))}
          </select>
        </label>
      </SectionCard>

      <SectionCard
        title="Your quotations"
        description="Open a quotation to review the work and respond."
        className="customer-quotation-list"
        bodyClassName="p-0"
      >
        {loading ? (
          <LoadingState label="Loading your quotations…" className="customer-portal-state" />
        ) : error ? null : visibleItems.length ? (
          <>
            <div className="customer-quotation-cards md:hidden">
              {visibleItems.map((item) => (
                <Link key={item.id} to={`/customer-quotations/${item.id}`} className="customer-quotation-card">
                  <div className="customer-quotation-card-top">
                    <div className="customer-quotation-identity">
                      <span className={`customer-quotation-logo ${item.contractor_logo_shape === "ROUND" ? "is-round" : ""}`}>
                        {item.contractor_logo ? (
                          <img src={item.contractor_logo} alt="" style={profileImageStyle(item.contractor_logo_position)} />
                        ) : <Building2 aria-hidden="true" />}
                      </span>
                      <div className="min-w-0">
                        <p className="customer-quotation-number">{item.quotation_number}</p>
                        <h3>{item.contractor_name || "Contractor"}</h3>
                        <p className="customer-quotation-subtitle">{item.property_name || "Property"}</p>
                      </div>
                    </div>
                    <StatusBadge
                      status={item.status}
                      label={item.status_display || readableStatus(item.status)}
                      tone={quotationTone(item.status)}
                    />
                  </div>
                  <div className="customer-quotation-value-row">
                    <div><span>Quotation total</span><strong>{formatMoney(item.grand_total)}</strong></div>
                    <div><span>{item.schedule_start_date ? "Work dates" : "Created"}</span><strong>{item.schedule_start_date ? `${formatDate(item.schedule_start_date)} – ${formatDate(item.schedule_end_date)}` : formatDate(item.quotation_date)}</strong></div>
                  </div>
                  <span className="customer-quotation-next-action">
                    {quotationAction(item)}<ArrowRight aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
            <div className="customer-quotation-table-wrap hidden md:block" data-mobile-table="keep">
              <table className="customer-quotation-table w-full min-w-[900px] text-left text-sm">
                <thead><tr><th>Quotation and property</th><th>Contractor</th><th>Updated</th><th className="text-right">Total</th><th>Status</th><th>Next step</th></tr></thead>
                <tbody>
                  {visibleItems.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.quotation_number}</strong><span>{item.property_name || "Property"}</span><small>{item.schedule_start_date ? `Work dates · ${formatDate(item.schedule_start_date)} to ${formatDate(item.schedule_end_date)}` : `Created · ${formatDate(item.quotation_date)}`}</small></td>
                      <td><strong>{item.contractor_name || "Contractor"}</strong><span>{item.contractor_bharath_id || item.contractor_mobile || "Connected contractor"}</span></td>
                      <td>{formatDate(item.updated_at)}<small>{formatTime(item.updated_at)}</small></td>
                      <td className="text-right font-bold tabular-nums">{formatMoney(item.grand_total)}</td>
                      <td><StatusBadge status={item.status} label={item.status_display || readableStatus(item.status)} tone={quotationTone(item.status)} /></td>
                      <td><Link to={`/customer-quotations/${item.id}`} className="customer-table-action">{quotationAction(item)}<ArrowRight aria-hidden="true" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState
            title={items.length ? "No quotations match these filters" : "No quotations yet"}
            description={items.length ? "Try another search or status." : "Estimates shared by your connected contractors will appear here."}
            className="customer-portal-state"
          />
        )}
      </SectionCard>
    </div>
  );
}

const quotationStatuses = ["SENT", "VIEWED", "ACCEPTED", "REJECTED", "REVISION_REQUESTED", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CONVERTED"];

function quotationAction(item) {
  if (["SENT", "VIEWED"].includes(item.status)) return "Review quotation";
  if (item.schedule_start_date) return "View work dates";
  if (["ACCEPTED", "CONVERTED"].includes(item.status)) return "View next steps";
  return "View details";
}

function quotationTone(status) {
  if (["ACCEPTED", "CONVERTED", "SCHEDULED", "IN_PROGRESS", "COMPLETED"].includes(status)) return "success";
  if (["SENT", "VIEWED", "REVISION_REQUESTED"].includes(status)) return "warning";
  if (["REJECTED", "CANCELLED", "EXPIRED"].includes(status)) return "danger";
  return "neutral";
}

function readableStatus(value) {
  return String(value || "Status unavailable")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}
function asDate(value) {
  if (!value) return null;
  return new Date(String(value).includes("T") ? value : `${value}T00:00:00`);
}
function formatDate(value) {
  const date = asDate(value);
  return date
    ? date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
}
function formatTime(value) {
  const date = asDate(value);
  return date && String(value).includes("T")
    ? date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : "";
}
