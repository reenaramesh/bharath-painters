import "./mobile-workspace.css";
import { customerConnectionDirectory } from "../utils/workspaceLists.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ContactRound, Download, Plus, Search, SlidersHorizontal, Upload, Users } from "lucide-react";
import api from "../api/client";
import CustomerConnectionFlow from "../components/CustomerConnectionFlow";
import { CUSTOMER_STATUSES } from "../constants/customers";
import MobilePageBack from "../components/MobilePageBack";
import useAuth from "../context/useAuth";
import CustomerActivationShare from "../components/CustomerActivationShare";
import CustomerDirectoryRecords, { customerDirectoryAccess } from "../components/customers/CustomerDirectoryRecords";
import { Button } from "../components/ui";
import PageHeader from "../components/ContractorModuleHeader";
import ContractorDialog from "../components/ContractorDialog";
import "./crm-pages.css";
import "../components/customers/customer-directory.css";

const label = value => String(value || "").replaceAll("_", " ").toLowerCase().replace(/^./, letter => letter.toUpperCase());
const rowsFrom = data => Array.isArray(data) ? data : data?.results || [];
const connectionLabels = { CONNECTED: "All customers", PENDING: "Pending", REJECTED: "Request declined", RECONNECT_PENDING: "Reconnect request sent", BLOCKED: "Blocked" };

export default function Customers() {
  const { user } = useAuth();
  return <CustomerDirectoryWorkspace key={user?.id || "signed-out"} />;
}

function CustomerDirectoryWorkspace() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [savedContacts, setSavedContacts] = useState([]);
  const [properties, setProperties] = useState([]);
  const [connections, setConnections] = useState([]);
  const [contractorServices, setContractorServices] = useState([]);
  const [connectionView, setConnectionView] = useState("CONNECTED");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState({ key: "name", direction: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [secondaryLoading, setSecondaryLoading] = useState(true);
  const [secondaryError, setSecondaryError] = useState("");
  const [propertiesError, setPropertiesError] = useState(false);
  const [error, setError] = useState("");
  const [showConnectionFlow, setShowConnectionFlow] = useState(false);
  const [onboarding, setOnboarding] = useState(null);
  const [activatingCustomerId, setActivatingCustomerId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const mounted = useRef(true);
  const version = useRef(0);
  const linkVersion = useRef(0);
  const importVersion = useRef(0);
  const createVersion = useRef(0);
  const linkBusy = useRef(false);
  const importBusy = useRef(false);
  const createBusy = useRef(false);
  const directoryRef = useRef([]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      version.current += 1;
      linkVersion.current += 1; importVersion.current += 1; createVersion.current += 1;
    };
  }, []);

  const loadCustomers = useCallback(async () => {
    if (!mounted.current) return;
    const request = ++version.current;
    const current = () => mounted.current && version.current === request;
    setLoading(true); setError(""); setSecondaryLoading(true); setSecondaryError(""); setPropertiesError(false);
    const secondaryRead = Promise.allSettled([
      api.get("/quotations/properties/"),
      api.get("/quotations/contractor/customer-connections/"),
      api.get("/quotations/service-categories/"),
    ]).then(([propertyResult, connectionResult, serviceResult]) => {
      if (!current()) return;
      const missing = [];
      if (propertyResult.status === "fulfilled") setProperties(rowsFrom(propertyResult.value.data));
      else {
        if ([401, 403, 404].includes(propertyResult.reason?.response?.status)) setProperties([]);
        setPropertiesError(true); missing.push("Property details");
      }
      if (connectionResult.status === "fulfilled") setConnections(rowsFrom(connectionResult.value.data));
      else { setConnections([]); missing.push("Connection history"); }
      if (serviceResult.status === "fulfilled") setContractorServices(rowsFrom(serviceResult.value.data));
      else setContractorServices([]);
      setSecondaryError(missing.length ? missing.join(" and ") + " could not be refreshed." : "");
      setSecondaryLoading(false);
    });
    try {
      const { data } = await api.get("/quotations/customers/", { params: { include_saved: 1 } });
      if (!current()) return;
      const rows = rowsFrom(data);
      setCustomers(rows.filter(item => !item.is_saved_contact));
      setSavedContacts(rows.filter(item => item.is_saved_contact));
    } catch (failure) {
      if (!current()) return;
      if ([401, 403, 404].includes(failure.response?.status)) {
        version.current += 1;
        linkVersion.current += 1; importVersion.current += 1; createVersion.current += 1;
        setCustomers([]); setSavedContacts([]); setProperties([]); setConnections([]); setContractorServices([]);
        setOnboarding(null); setLoading(false); setSecondaryLoading(false); setSecondaryError("");
        setActivatingCustomerId(null); setImporting(false); setImportResult(null); setShowImport(false); setShowConnectionFlow(false);
      }
      setError("Customers could not be refreshed or access has changed. Please retry.");
    } finally { if (current()) setLoading(false); }
    await secondaryRead;
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") loadCustomers(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [loadCustomers]);
  useEffect(() => { if (params.get("action") === "add") setShowConnectionFlow(true); }, [params]);

  const propertiesByCustomer = useMemo(() => {
    const grouped = {};
    properties.forEach(property => {
      const key = String(property.customer);
      (grouped[key] ||= []).push(property);
    });
    return grouped;
  }, [properties]);
  const { directoryRows, connectionRows } = useMemo(
    () => customerConnectionDirectory(customers, savedContacts, connections),
    [customers, savedContacts, connections],
  );
  directoryRef.current = directoryRows;

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return directoryRows.filter(customer => {
      const customerProperties = propertiesByCustomer[String(customer.id)] || customer.properties || [];
      const matches = [customer.name, customer.bharath_id, customer.mobile, customer.city, customer.email,
        ...customerProperties.flatMap(property => [property.name, property.property_type, property.address])]
        .some(value => String(value || "").toLowerCase().includes(term));
      return matches && (status === "ALL" || customer.status === status);
    }).sort((first, second) => {
      const a = propertiesByCustomer[String(first.id)] || first.properties || [];
      const b = propertiesByCustomer[String(second.id)] || second.properties || [];
      const activityTime = customer => customerDirectoryAccess(customer).canUse && Number.isFinite(Date.parse(customer.last_activity_at)) ? Date.parse(customer.last_activity_at) : 0;
      const values = { name: [first.name, second.name], property: [propertyLabel(a[0]), propertyLabel(b[0])], propertyCount: [a.length, b.length], last_activity_at: [activityTime(first), activityTime(second)] };
      const [left, right] = values[sort.key] || values.name;
      const comparison = typeof left === "number" ? left - right : String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base" });
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [directoryRows, propertiesByCustomer, search, sort, status]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleCustomers = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const visibleConnections = connectionRows.filter(item => item.status === connectionView).filter(item => !search || [item.customer?.name, item.customer?.mobile, item.customer?.bharath_id]
    .some(value => String(value || "").toLowerCase().includes(search.toLowerCase())));
  function changeSort(key) {
    setSort(current => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
    setPage(1);
  }
  function currentCustomer(id) { return directoryRef.current.find(customer => String(customer.id) === String(id)); }
  function canShareActivation(customer) {
    const access = customer && customerDirectoryAccess(customer);
    return Boolean(access?.canUse && access.account?.canResend);
  }
  async function activateCustomer(customer, event) {
    event?.stopPropagation();
    const latest = currentCustomer(customer.id);
    if (linkBusy.current || !canShareActivation(latest)) return;
    const request = ++linkVersion.current;
    const current = () => mounted.current && linkVersion.current === request;
    linkBusy.current = true; setActivatingCustomerId(customer.id); setError("");
    try {
      const { data } = await api.post("/quotations/customers/" + customer.id + "/activate-account/");
      if (!current()) return;
      if (!customerDirectoryAccess(currentCustomer(customer.id) || {}).canUse) return;
      if (data.share_link) setOnboarding({ ...latest, ...data, id: customer.id });
      else await loadCustomers();
    } catch (failure) {
      if (current()) setError(formatError(failure.response?.data) || "Activation link could not be prepared. Refresh the list and try again.");
    } finally {
      linkBusy.current = false;
      if (current()) setActivatingCustomerId(null);
    }
  }
  async function createCustomer(values) {
    if (createBusy.current) throw new Error("A customer is already being saved.");
    const request = ++createVersion.current;
    const current = () => mounted.current && createVersion.current === request;
    createBusy.current = true;
    try {
      const { data } = await api.post("/quotations/customers/", values);
      if (current()) {
        await loadCustomers();
        if (current()) setConnectionView(data.connection_status || "CONNECTED");
      }
      return data;
    } finally { createBusy.current = false; }
  }
  async function regenerateCustomerLink() {
    if (!onboarding?.id || linkBusy.current) return;
    if (onboarding.link_purpose !== "CONNECTION" && !canShareActivation(currentCustomer(onboarding.id))) return;
    const targetId = onboarding.id;
    const request = ++linkVersion.current;
    const current = () => mounted.current && linkVersion.current === request;
    linkBusy.current = true; setActivatingCustomerId(targetId); setError("");
    try {
      const { data } = await api.post("/quotations/customers/" + targetId + "/share-link/");
      if (!current()) return;
      const latest = currentCustomer(targetId);
      if (!latest || latest.account_status === "DISABLED" || (data.link_purpose !== "CONNECTION" && !canShareActivation(latest))) return;
      if (data.link_purpose === "CONNECTION" && !["PENDING", "RECONNECT_PENDING"].includes(latest.connection_status)) return;
      setOnboarding(previous => previous?.id === targetId ? { ...previous, ...data } : previous);
    } catch (failure) { if (current()) setError(failure.response?.data?.detail || "A new link could not be created."); }
    finally { linkBusy.current = false; if (current()) setActivatingCustomerId(null); }
  }
  async function shareConnection(item, resend = false) {
    if (linkBusy.current || !item.customer?.id || customerDirectoryAccess(item.customer).account?.tone === "danger" || item.customer.account_status === "DISABLED") return;
    const request = ++linkVersion.current;
    const current = () => mounted.current && linkVersion.current === request;
    linkBusy.current = true; setActivatingCustomerId(item.customer.id); setError("");
    try {
      if (resend) {
        await api.post("/quotations/contractor/customer-connections/request/", { mobile: item.customer.mobile });
        if (!current()) return;
      }
      const { data } = await api.post("/quotations/customers/" + item.customer.id + "/share-link/");
      if (!current()) return;
      const latest = currentCustomer(item.customer.id);
      if (!latest || latest.account_status === "DISABLED" || (data.link_purpose !== "CONNECTION" && !canShareActivation(latest))) return;
      if (data.link_purpose === "CONNECTION" && !["PENDING", "RECONNECT_PENDING", ...(resend ? ["REJECTED"] : [])].includes(latest.connection_status)) return;
      setOnboarding({ ...data, id: item.customer.id, name: data.customer_name, mobile: data.customer_mobile });
      if (resend) {
        await loadCustomers();
        if (current()) setConnectionView("RECONNECT_PENDING");
      }
    } catch (failure) {
      if (current()) setError(failure.response?.data?.message || failure.response?.data?.detail || "The connection link could not be created.");
    } finally { linkBusy.current = false; if (current()) setActivatingCustomerId(null); }
  }
  async function importFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file || importBusy.current) return;
    const request = ++importVersion.current;
    const current = () => mounted.current && importVersion.current === request;
    importBusy.current = true; setImporting(true); setError(""); setImportResult(null);
    try {
      const payload = new FormData(); payload.append("file", file);
      const { data } = await api.post("/quotations/customers/bulk-import/", payload);
      if (current()) { setImportResult(data); await loadCustomers(); }
    } catch (failure) { if (current()) setError(formatError(failure.response?.data) || "Customer file could not be imported."); }
    finally { importBusy.current = false; if (current()) { setImporting(false); input.value = ""; } }
  }
  async function connectContacts() {
    if (importBusy.current) return;
    if (!navigator.contacts?.select) {
      setError("Contact connection is not supported in this browser. Use Chrome on Android, or upload Excel/CSV.");
      return;
    }
    const request = ++importVersion.current;
    const current = () => mounted.current && importVersion.current === request;
    importBusy.current = true; setImporting(true); setError(""); setImportResult(null);
    try {
      const selected = await navigator.contacts.select(["name", "tel", "email"], { multiple: true });
      if (!current() || !selected.length) return;
      const contacts = selected.map(contact => ({ name: contact.name?.[0] || "", mobile: contact.tel?.[0] || "", email: contact.email?.[0] || "", source: "PHONE" }));
      const { data } = await api.post("/quotations/customers/bulk-import/", { contacts });
      if (current()) { setImportResult(data); setShowImport(true); await loadCustomers(); }
    } catch (failure) {
      if (current() && failure.name !== "AbortError") setError(formatError(failure.response?.data) || "Contacts could not be connected.");
    } finally { importBusy.current = false; if (current()) setImporting(false); }
  }
  function downloadTemplate() {
    const csv = "Name,Mobile,Email,WhatsApp,Address,City,Pincode,Status,Source,Requirement,Notes\nSample Customer,9876543210,sample@example.com,9876543210,Street address,Bengaluru,560001,NEW,REFERRAL,Interior painting,\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "customer-import-template.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return (<div className="space-y-6 crm-page crm-customers-page contractor-people-page">
    <MobilePageBack />
    <PageHeader icon={Users} eyebrow="Customer relationships" title="Customers" description="Your saved customers and properties." actions={<div className="flex flex-wrap gap-2">
      <button type="button" onClick={connectContacts} disabled={importing} aria-label="Add from phone contacts" className="people-header-action"><ContactRound className="h-5 w-5" aria-hidden="true" /><span>Phone contacts</span></button>
      <button type="button" onClick={() => { setShowImport(true); setImportResult(null); }} aria-label="Bulk upload customers" className="people-header-action"><Upload className="h-5 w-5" aria-hidden="true" /><span>Import file</span></button>
      <Button onClick={() => setShowConnectionFlow(true)} aria-label="Add customer" className="crm-add-customer people-header-action people-primary-action"><Plus className="h-4 w-4" aria-hidden="true" />Add customer</Button>
    </div>} />
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><Button variant="quiet" onClick={loadCustomers}>Retry directory</Button></div>}
    <section className="people-surface rounded-2xl border border-slate-200 bg-white" aria-label="Customer directory">
      <div className="people-toolbar flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5"><Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <input value={search} type="search" onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search customers, phone or property" aria-label="Search by customer ID, name, mobile, city, email or property" className="w-full min-w-0 bg-transparent text-sm outline-none bp-ui-control" />
        </label>
      </div>
      <details className="customer-directory-more-filters">
        <summary><SlidersHorizontal size={16} aria-hidden="true" />More filters{status !== "ALL" || connectionView !== "CONNECTED" ? " · Applied" : ""}</summary>
        <div className="customer-directory-more-body">
          <label><span>Contact status</span><select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="ALL">All statuses</option>{CUSTOMER_STATUSES.map(item => <option key={item} value={item}>{label(item)}</option>)}</select></label>
          <label><span>Connection history</span><select value={connectionView} onChange={event => { setConnectionView(event.target.value); setPage(1); }}>{Object.entries(connectionLabels).map(([value, text]) => <option key={value} value={value}>{text} ({value === "CONNECTED" ? directoryRows.length : connectionRows.filter(item => item.status === value).length})</option>)}</select></label>
          <label><span>Sort by</span><select value={sort.key + ":" + sort.direction} onChange={event => { const [key, direction] = event.target.value.split(":"); setSort({ key, direction }); setPage(1); }}>
            <option value="name:asc">Customer name A–Z</option><option value="name:desc">Customer name Z–A</option><option value="property:asc">Property name A–Z</option><option value="property:desc">Property name Z–A</option><option value="propertyCount:asc">Property count, lowest first</option><option value="propertyCount:desc">Property count, highest first</option>
          </select></label>
          {(search || status !== "ALL" || connectionView !== "CONNECTED") && <Button variant="quiet" onClick={() => { setSearch(""); setStatus("ALL"); setConnectionView("CONNECTED"); setPage(1); }}>Clear filters</Button>}
        </div>
      </details>
      {secondaryError && <div className="customer-directory-partial-error" role="alert"><span>{secondaryError} Customer records are still available.</span><Button size="sm" variant="quiet" onClick={loadCustomers}>Retry details</Button></div>}
      {connectionView === "CONNECTED" ? <>
        <div className="customer-directory-meta"><p role="status">{filtered.length} customers{loading && customers.length ? " · Refreshing…" : ""}</p></div>
        <CustomerDirectoryRecords customers={visibleCustomers} propertiesByCustomer={propertiesByCustomer} loading={loading} propertiesLoading={secondaryLoading} propertiesError={propertiesError} sort={sort} onSort={changeSort}
          onOpen={customer => navigate("/customers/" + customer.id)} onActivate={activateCustomer} activatingCustomerId={activatingCustomerId} actionsDisabled={loading || importing} />
        <div className="customer-directory-pagination">
          <div><label>Rows per page<select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[25, 50, 75, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
            <span>{filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}</span></div>
          <div><Button variant="secondary" size="sm" disabled={currentPage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</Button><Button variant="secondary" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Next</Button></div>
        </div>
      </> : <section className="grid gap-3 p-4 md:grid-cols-2" aria-label={connectionLabels[connectionView]}>
        {visibleConnections.map(item => <article key={item.id || "customer-" + item.customer?.id} className="rounded-xl border bg-white p-4">
          <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold bp-ui-section-heading">{item.customer?.name || item.customer?.masked_customer_id}</h2><p className="mt-1 text-sm text-slate-500">{item.customer?.mobile || item.customer?.masked_mobile}</p></div><span className="text-xs font-bold text-slate-600">{connectionLabels[item.status]}</span></div>
          <p className="mt-3 text-xs text-slate-500">Requested {item.requested_at ? new Date(item.requested_at).toLocaleDateString("en-IN") : "Date unavailable"}</p>
          {["PENDING", "RECONNECT_PENDING"].includes(item.status) && item.id && item.customer?.id && item.customer.account_status !== "DISABLED" && <Button size="sm" variant="secondary" className="mt-3" disabled={activatingCustomerId !== null} onClick={() => shareConnection(item)}>Share request link</Button>}
          {item.status === "REJECTED" && item.id && item.customer.account_status !== "DISABLED" && <Button size="sm" variant="secondary" className="mt-3" disabled={activatingCustomerId !== null || Boolean(item.cooldown_until && new Date(item.cooldown_until) > new Date())} onClick={() => shareConnection(item, true)}>Resend request</Button>}
          {item.status === "REJECTED" && item.cooldown_until && new Date(item.cooldown_until) > new Date() && <p className="mt-2 text-xs text-slate-500">Available {new Date(item.cooldown_until).toLocaleDateString("en-IN")}</p>}
          {item.customer?.id && <Link to={"/customers/" + item.customer.id} className="mt-3 inline-flex min-h-11 items-center px-3 text-sm font-semibold text-indigo-700">Open saved profile</Link>}
        </article>)}
        {!visibleConnections.length && <p className="p-6 text-center text-sm text-slate-500">{search ? "No matching requests." : "No " + connectionLabels[connectionView].toLowerCase() + " requests."}</p>}
      </section>}
    </section>
      {showImport && (
        <ContractorDialog title="Bulk import customers" description="Upload your customer file or choose phone contacts." icon={Upload} onClose={() => setShowImport(false)}>
            <div className="mt-5 rounded-xl border border-dashed p-6 text-center">
              <Upload className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm text-slate-600">
                Required columns: Name and Mobile
              </p>
              <label className="mt-4 inline-flex cursor-pointer rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
                {importing ? "Importing..." : "Choose Excel or CSV"}
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  disabled={importing}
                  onChange={importFile}
                  aria-label="Choose Excel or CSV"
                  className="sr-only"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="mt-4 flex items-center gap-2 text-sm font-semibold text-blue-700 bp-ui-action"
            >
              <Download className="h-4 w-4" />
              Download CSV template
            </button>
            {importResult && (
              <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
                <p className="font-semibold">Import completed</p>
                <p className="mt-1">
                  Created: {importResult.created} · Duplicates skipped:{" "}
                  {importResult.skipped} · Invalid rows:{" "}
                  {importResult.errors?.length || 0}
                </p>
                {importResult.errors?.length > 0 && (
                  <div className="mt-2 max-h-28 overflow-auto text-xs">
                    {importResult.errors.map((item) => (
                      <p key={item.row}>
                        Row {item.row}: {item.error}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="mt-5 border-t pt-4">
              <button
                onClick={connectContacts}
                disabled={importing}
                className="flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-60 bp-ui-action"
              >
                <ContactRound className="h-4 w-4" />
                Add from phone contacts
              </button>
              
            </div>
        </ContractorDialog>
      )}
      {showConnectionFlow && <CustomerConnectionFlow
        onClose={() => setShowConnectionFlow(false)}
        onNewCustomer={createCustomer}
        onExistingCustomer={(customer) => { if (mounted.current) navigate(`/customers/${customer.id}`); }}
      />}
      {onboarding && <CustomerActivationShare error={error} key={onboarding.share_link} customer={onboarding} contractor={{ ...user, services: contractorServices }} busy={activatingCustomerId !== null} onRegenerate={regenerateCustomerLink} onClose={() => { setOnboarding(null); loadCustomers(); }} />}

    </div>
  );
}

function formatError(data) {
  if (!data) return "";
  if (typeof data === "string") {
    const value = data.trim();
    if (value.startsWith("<!DOCTYPE") || value.startsWith("<html")) {
      return "The server could not save this customer. Check the mobile number and try again.";
    }
    return value;
  }
  if (data.detail || data.message) return data.detail || data.message;
  return Object.entries(data)
    .map(
      ([key, value]) =>
        `${key}: ${Array.isArray(value) ? value.join(" ") : typeof value === "object" ? JSON.stringify(value) : value}`,
    )
    .join(" ");
}

function propertyLabel(property) { return property?.name || property?.property_type || ""; }
