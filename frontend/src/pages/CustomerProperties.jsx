import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ChevronRight, MapPin } from "lucide-react";
import api from "../api/client";
import { EmptyState, ErrorState, LoadingState, PageHeader, SectionCard } from "../components/ui";

export default function CustomerProperties() {
  const [items, setItems] = useState([]);
  const [shareRequests, setShareRequests] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [propertiesResponse, sharesResponse] = await Promise.all([
        api.get("/quotations/customer-portal/properties/"),
        api.get("/quotations/customer-portal/property-share-requests/"),
      ]);
      setItems(propertiesResponse.data);
      setShareRequests(sharesResponse.data);
      setError("");
    } catch {
      setError("Properties could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const measuredCount = items.filter((item) => Number(item.surfaces || 0) > 0).length;
  const totalRooms = items.reduce((sum, item) => sum + Number(item.rooms || 0), 0);

  async function respondToShare(contactId, action) {
    setNotice("");
    setError("");
    try {
      await api.post(`/quotations/customer-portal/property-share-requests/${contactId}/respond/`, { action });
      setNotice(action === "ACCEPT" ? "Property access accepted." : "Property access declined.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Your response could not be saved.");
    }
  }

  return (
    <div className="customer-properties-page space-y-6">
      <PageHeader
        eyebrow="Your projects"
        title="My properties"
        description="Places connected to your painting work, with saved measurements and contractor details."
      />
      <section className="customer-property-pulse" aria-label="Property summary">
        <div><span>Saved properties</span><strong>{items.length}</strong><small>Connected to your projects</small></div>
        <div><span>With measurements</span><strong>{measuredCount}</strong><small>Ready to review</small></div>
        <div><span>Measured rooms</span><strong>{totalRooms}</strong><small>Across all properties</small></div>
      </section>
      {notice && <p role="status" aria-live="polite" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && shareRequests.length > 0 && <SectionCard title="Property access requests" description="Review requests from people sharing a property with you." bodyClassName="p-0">
        <ul className="divide-y divide-slate-200">{shareRequests.map((item) => <li key={item.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div><h2 className="font-bold text-slate-950">{item.property_name}</h2><p className="mt-1 text-sm text-slate-600">{[item.relationship && relationshipName(item.relationship), accessName(item.access_level), item.city].filter(Boolean).join(" · ")}</p></div>
          <div className="flex gap-2"><button type="button" onClick={() => respondToShare(item.id, "ACCEPT")} className="min-h-11 rounded-xl bg-[#176b9b] px-4 text-sm font-bold text-white hover:bg-[#12577f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#102331]">Accept</button><button type="button" onClick={() => respondToShare(item.id, "DECLINE")} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b9b]">Decline</button></div>
        </li>)}</ul>
      </SectionCard>}
      <SectionCard
        title="Properties"
        description={`${items.length} saved ${items.length === 1 ? "property" : "properties"}`}
        className="customer-properties-list"
        bodyClassName="p-0"
      >
        {loading ? (
          <LoadingState label="Loading your properties…" />
        ) : error ? null : items.length ? (
          <div className="customer-property-grid">
            {items.map((item) => {
              const address = [
                item.flat_number,
                item.block_name,
                item.address,
                item.city,
                item.pincode,
              ].filter(Boolean).join(", ");
              return (
                <article key={item.id} className="customer-property-card">
                  <div className="customer-property-card-heading">
                    <span className="customer-property-icon" aria-hidden="true"><Building2 /></span>
                    <div className="min-w-0">
                      <p className="customer-property-type">{item.property_type || "Property"}</p>
                      <h2>{item.name || "Unnamed property"}</h2>
                    </div>
                    <span className="customer-property-type-badge">{item.measurement_type || "Area type not specified"}</span>
                  </div>
                  <p className="customer-property-contractor">Project contractor · {item.contractor_name || "Not listed"}</p>
                  <p className="customer-property-address"><MapPin aria-hidden="true" />{address || "Address not added"}</p>
                  <div className="customer-property-context">
                    <span><strong>Area calculation</strong>{item.measurement_type || "Not specified"}</span>
                    <span><strong>Rooms measured</strong>{item.rooms ?? 0}</span>
                    <span><strong>Measured surfaces</strong>{item.surfaces ?? 0}</span>
                  </div>
                  <Link to={`/customer-properties/${item.id}`} className="customer-property-action">
                    View property and measurements<ChevronRight aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No properties shared yet"
            description="Properties and measurements shared by your connected contractors will appear here."
            className="customer-properties-empty"
          />
        )}
      </SectionCard>
    </div>
  );
}

function relationshipName(value) {
  return ({ OWNER: "Owner", TENANT: "Tenant", PROPERTY_MANAGER: "Property manager", FACILITY_MANAGER: "Facility manager", OTHER: "Other" })[value] || "";
}

function accessName(value) {
  return ({ VIEW_ONLY: "View only", SITE_COORDINATION: "Site coordination", QUOTATION_APPROVAL: "Quotation & approval", FINANCE: "Finance", PROPERTY_MANAGEMENT: "Property management", FULL_ACCESS: "Full access", CUSTOM: "Custom access" })[value] || "Access requested";
}
