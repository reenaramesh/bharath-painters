import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpDown,
  ContactRound,
  Copy,
  Download,
  FilePlus2,
  KeyRound,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Upload,
  Users,
  X,
} from "lucide-react";
import api from "../api/client";
import CustomerConnectionFlow from "../components/CustomerConnectionFlow";
import { CUSTOMER_STATUSES } from "../constants/customers";
import MobilePageBack from "../components/MobilePageBack";
import useAuth from "../context/useAuth";
import { buildCustomerWelcomeMessage, whatsappNumber } from "../utils/welcomeMessages";

const statusColors = {
  NEW: "bg-blue-50 text-blue-700",
  WON: "bg-emerald-50 text-emerald-700",
  LOST: "bg-red-50 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-600",
  FOLLOW_UP: "bg-amber-50 text-amber-700",
  SITE_VISIT: "bg-purple-50 text-purple-700",
  QUOTATION_SENT: "bg-cyan-50 text-cyan-700",
  NEGOTIATION: "bg-orange-50 text-orange-700",
  CONTACTED: "bg-indigo-50 text-indigo-700",
};
const label = (value) =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());

export default function Customers() {
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
  const [error, setError] = useState("");
  const [showConnectionFlow, setShowConnectionFlow] = useState(false);
  const [onboarding, setOnboarding] = useState(null);
  const [activatingCustomerId, setActivatingCustomerId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  async function loadCustomers() {
    setLoading(true);
    setError("");
    try {
      const [customerResponse, propertyResponse, connectionResponse, serviceResponse] = await Promise.all([
        api.get("/quotations/customers/", { params: { include_saved: 1 } }),
        api.get("/quotations/properties/"),
        api.get("/quotations/contractor/customer-connections/"),
        api.get("/quotations/service-categories/").catch(() => ({ data: [] })),
      ]);
      const customerData = customerResponse.data;
      const propertyData = propertyResponse.data;
      const customerRows = Array.isArray(customerData) ? customerData : customerData.results || [];
      setCustomers(customerRows.filter(item => !item.is_saved_contact));
      setSavedContacts(customerRows.filter(item => item.is_saved_contact));
      setProperties(
        Array.isArray(propertyData) ? propertyData : propertyData.results || [],
      );
      setConnections(connectionResponse.data.results || []);
      setContractorServices(serviceResponse.data.results || serviceResponse.data || []);
    } catch {
      setError("Customers could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function activateCustomer(customer, event) {
    event?.stopPropagation();
    setActivatingCustomerId(customer.id);
    setError("");
    try {
      const { data } = await api.post(`/quotations/customers/${customer.id}/activate-account/`);
      setCustomers((current) => current.map((item) => item.id === customer.id ? { ...item, ...data } : item));
      if (data.temporary_password) setOnboarding(data);
    } catch (requestError) {
      setError(formatError(requestError.response?.data) || "Customer ID and login could not be created.");
    } finally {
      setActivatingCustomerId(null);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (params.get("action") === "add") setShowConnectionFlow(true);
  }, [params]);

  const propertiesByCustomer = useMemo(() => {
    const grouped = {};
    properties.forEach((property) => {
      const key = String(property.customer);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(property);
    });
    return grouped;
  }, [properties]);

  const filtered = useMemo(() => {
    const result = customers.filter((customer) => {
      const term = search.toLowerCase();
      const customerProperties =
        propertiesByCustomer[String(customer.id)] || [];
      const matchesSearch = [
        customer.name,
        customer.bharath_id,
        customer.mobile,
        customer.city,
        customer.email,
        ...customerProperties.flatMap((property) => [
          property.name,
          property.property_type,
          property.address,
        ]),
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(term),
      );
      return matchesSearch && (status === "ALL" || customer.status === status);
    });
    return result.sort((a, b) => {
      const aProperties = propertiesByCustomer[String(a.id)] || [];
      const bProperties = propertiesByCustomer[String(b.id)] || [];
      const values = {
        name: [a.name, b.name],
        property: [
          propertyLabel(aProperties[0]),
          propertyLabel(bProperties[0]),
        ],
        propertyCount: [aProperties.length, bProperties.length],
      };
      const [first, second] = values[sort.key] || values.name;
      const comparison =
        typeof first === "number"
          ? first - second
          : String(first || "").localeCompare(String(second || ""), undefined, {
              sensitivity: "base",
            });
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [customers, propertiesByCustomer, search, sort, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleCustomers = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  function changeSort(key) {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
    setPage(1);
  }

  const cellPadding = "px-5 py-4";

  async function createCustomer(values) {
    const { data } = await api.post("/quotations/customers/", values);
    if (data.is_saved_contact || data.already_saved) {
      navigate(`/customers/${data.id}`);
    } else {
      setCustomers((current) => [data, ...current.filter(item => item.id !== data.id)]);
      setOnboarding(data);
    }
    return data;
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError("");
    setImportResult(null);
    try {
      const payload = new FormData();
      payload.append("file", file);
      const { data } = await api.post(
        "/quotations/customers/bulk-import/",
        payload,
      );
      setImportResult(data);
      await loadCustomers();
    } catch (requestError) {
      setError(
        formatError(requestError.response?.data) ||
          "Customer file could not be imported.",
      );
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  }

  async function connectContacts() {
    if (!navigator.contacts?.select) {
      setError(
        "Contact connection is not supported in this browser. Use Chrome on Android, or upload Excel/CSV.",
      );
      return;
    }
    setImporting(true);
    setError("");
    setImportResult(null);
    try {
      const selected = await navigator.contacts.select(
        ["name", "tel", "email"],
        { multiple: true },
      );
      const contacts = selected.map((contact) => ({
        name: contact.name?.[0] || "",
        mobile: contact.tel?.[0] || "",
        email: contact.email?.[0] || "",
        source: "PHONE",
      }));
      const { data } = await api.post("/quotations/customers/bulk-import/", {
        contacts,
      });
      setImportResult(data);
      setShowImport(true);
      await loadCustomers();
    } catch (requestError) {
      if (requestError.name !== "AbortError")
        setError(
          formatError(requestError.response?.data) ||
            "Contacts could not be connected.",
        );
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const csv =
      "Name,Mobile,Email,WhatsApp,Address,City,Pincode,Status,Source,Requirement,Notes\nSample Customer,9876543210,sample@example.com,9876543210,Street address,Bengaluru,560001,NEW,REFERRAL,Interior painting,\n";
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "customer-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <MobilePageBack />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Customers</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={connectContacts}
            disabled={importing}
            aria-label="Add from phone contacts"
            title="Add from phone contacts"
            className="grid h-11 w-11 place-items-center rounded-xl border bg-white text-slate-700 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-60"
          >
            <ContactRound className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowImport(true);
              setImportResult(null);
            }}
            aria-label="Bulk upload customers"
            title="Bulk upload customers"
            className="grid h-11 w-11 place-items-center rounded-xl border bg-white text-slate-700 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700"
          >
            <Upload className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setShowConnectionFlow(true)}
            aria-label="Add customer"
            title="Add customer"
            className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white shadow-sm transition hover:bg-slate-800"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span>{error}</span>
          <button onClick={loadCustomers} className="font-semibold">
            Retry
          </button>
        </div>
      )}

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border bg-white p-2">
        {["CONNECTED", "PENDING", "REJECTED"].map((value) => <button key={value} type="button" onClick={() => setConnectionView(value)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold ${connectionView === value ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{value === "CONNECTED" ? "All customers" : value === "PENDING" ? "Pending requests" : "Rejected"} ({value === "CONNECTED" ? customers.length + savedContacts.length : connections.filter((item) => item.status === value).length})</button>)}
      </nav>

      {connectionView !== "CONNECTED" && <section className="grid gap-3 md:grid-cols-2">
        {connections.filter((item) => item.status === connectionView).map((item) => <article key={item.id} className="rounded-2xl border bg-white p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Customer</p><h2 className="mt-1 font-extrabold">{item.customer?.name || item.customer?.masked_customer_id}</h2><p className="mt-1 text-sm text-slate-500">{item.customer?.mobile || item.customer?.masked_mobile}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.status === "PENDING" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{item.status}</span></div><p className="mt-4 text-sm text-slate-500">Requested {new Date(item.requested_at).toLocaleDateString("en-IN")}</p>{item.customer?.id && <Link to={`/customers/${item.customer.id}`} className="mt-3 inline-block text-sm font-bold text-indigo-700">Open saved profile</Link>}</article>)}
        {!connections.some((item) => item.status === connectionView) && <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-400">No {connectionView.toLowerCase()} requests.</div>}
      </section>}

      {connectionView === "CONNECTED" && savedContacts.length > 0 && <section className="space-y-3"><h2 className="font-bold">Saved contacts</h2><p className="text-sm text-slate-500">These details are saved. Open a profile to request a connection.</p><div className="grid gap-3 md:grid-cols-2">{savedContacts.filter(item => [item.name, item.mobile].some(value => String(value || "").toLowerCase().includes(search.toLowerCase()))).map(item => <Link key={item.id} to={`/customers/${item.id}`} className="rounded-2xl border bg-white p-5 hover:border-indigo-400"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{item.name}</h3><p className="mt-1 text-sm text-slate-500">{item.mobile}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{item.connection_status === "NOT_CONNECTED" ? "Saved contact" : item.connection_status.replaceAll("_", " ")}</span></div><p className="mt-4 text-sm font-semibold text-indigo-700">Open customer profile</p></Link>)}</div></section>}
      <div className={`${connectionView === "CONNECTED" ? "" : "hidden"} rounded-2xl border border-slate-200 bg-white`}>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row">
          <label className="flex flex-1 items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search customer ID, name, mobile, city or email"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none"
          >
            <option value="ALL">All statuses</option>
            {CUSTOMER_STATUSES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>

        <ContactDirectory
          loading={loading}
          customers={filtered}
          propertiesByCustomer={propertiesByCustomer}
          navigate={navigate}
          activateCustomer={activateCustomer}
          activatingCustomerId={activatingCustomerId}
        />
        <div className="hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            Loading customers...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-14 text-center">
            <Users className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-4 font-semibold text-slate-900">
              No customers found
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Add your first customer or change the current filters.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 p-3 md:hidden">
              {visibleCustomers.map((customer) => {
                const customerProperties =
                  propertiesByCustomer[String(customer.id)] || [];
                const primaryProperty = customerProperties[0];
                const whatsappNumber = formatWhatsAppNumber(
                  customer.whatsapp || customer.mobile,
                );
                return (
                  <article
                    key={customer.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/customers/${customer.id}`)}
                      className="block w-full p-4 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-base font-bold text-slate-950">
                              {customer.name}
                            </h2>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColors[customer.status] || "bg-slate-100 text-slate-600"}`}>
                              {label(customer.status)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-medium text-slate-500">
                            {customer.bharath_id || "No customer ID"} · {customer.mobile}
                          </p>
                        </div>
                        <span className="rounded-xl bg-slate-950 px-2.5 py-1.5 text-center text-xs font-bold text-white">
                          {customerProperties.length} {customerProperties.length === 1 ? "property" : "properties"}
                        </span>
                      </div>
                      <div className="mt-4 rounded-xl bg-slate-50 p-3">
                        <p className="truncate text-sm font-bold text-slate-800">
                          {propertyLabel(primaryProperty) || "No property added"}
                        </p>
                        {primaryProperty && (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                            {[primaryProperty.address, primaryProperty.city]
                              .filter(Boolean)
                              .join(", ") || primaryProperty.property_type}
                          </p>
                        )}
                      </div>
                    </button>
                    <div className="grid grid-cols-[48px_48px_1fr] gap-2 border-t border-slate-100 p-3">
                      <a
                        href={customer.mobile ? `tel:${customer.mobile}` : undefined}
                        aria-label={`Call ${customer.name}`}
                        className={`grid h-11 place-items-center rounded-xl border ${customer.mobile ? "border-slate-200 text-slate-700" : "pointer-events-none border-slate-100 text-slate-300"}`}
                      >
                        <Phone className="h-4 w-4" />
                      </a>
                      <a
                        href={whatsappNumber ? `https://wa.me/${whatsappNumber}` : undefined}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`WhatsApp ${customer.name}`}
                        className={`grid h-11 place-items-center rounded-xl border ${whatsappNumber ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "pointer-events-none border-slate-100 text-slate-300"}`}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                      <Link
                        to={`/quotations/new?customer=${customer.id}`}
                        className="flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-bold text-white"
                      >
                        <FilePlus2 className="h-4 w-4" />
                        New quotation
                      </Link>
                      {!customer.bharath_id && (
                        <button
                          type="button"
                          disabled={activatingCustomerId === customer.id}
                          onClick={(event) => activateCustomer(customer, event)}
                          className="col-span-3 flex h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-sm font-bold text-indigo-800 disabled:opacity-50"
                        >
                          <KeyRound className="h-4 w-4" />
                          {activatingCustomerId === customer.id ? "Creating login..." : "Create Customer ID & Login"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block" data-mobile-table="keep">
              <table className="w-full min-w-[960px] table-fixed border-separate border-spacing-0">
                <colgroup>
                  <col className="w-[23%]" />
                  <col className="w-[28%]" />
                  <col className="w-[15%]" />
                  <col className="w-[9%]" />
                  <col className="w-[12%]" />
                  <col className="w-[13%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100/80">
                    <SortableHeader
                      label="Name"
                      sortKey="name"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label="Property"
                      sortKey="property"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label="No. of properties"
                      sortKey="propertyCount"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <th className="border-b border-slate-200 px-5 py-3.5 text-center">
                      Call
                    </th>
                    <th className="border-b border-slate-200 px-5 py-3.5 text-center">
                      WhatsApp
                    </th>
                    <th className="border-b border-slate-200 px-5 py-3.5 text-center">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCustomers.map((customer) => {
                    const customerProperties =
                      propertiesByCustomer[String(customer.id)] || [];
                    const primaryProperty = customerProperties[0];
                    const whatsappNumber = formatWhatsAppNumber(
                      customer.whatsapp || customer.mobile,
                    );
                    return (
                      <tr
                        key={customer.id}
                        tabIndex="0"
                        onClick={() => navigate(`/customers/${customer.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") navigate(`/customers/${customer.id}`);
                        }}
                        className="cursor-pointer bg-white transition-colors even:bg-slate-50/70 hover:!bg-blue-50/60 focus:bg-blue-50/60 focus:outline-none"
                      >
                        <td
                          className={`${cellPadding} border-b border-slate-200/80`}
                        >
                          <div className="min-w-0 pr-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-semibold text-slate-900">
                                {customer.name}
                              </p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColors[customer.status] || "bg-slate-100 text-slate-600"}`}
                              >
                                {label(customer.status)}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {customer.bharath_id || "No customer ID"} ·{" "}
                              {customer.mobile}
                            </p>
                          </div>
                        </td>
                        <td
                          className={`${cellPadding} border-b border-slate-200/80`}
                        >
                          <p className="truncate pr-3 font-semibold text-slate-800">
                            {propertyLabel(primaryProperty) || "No property"}
                          </p>
                          {primaryProperty && (
                            <p className="mt-1 truncate pr-3 text-xs text-slate-500">
                              {[primaryProperty.address, primaryProperty.city]
                                .filter(Boolean)
                                .join(", ") || primaryProperty.property_type}
                            </p>
                          )}
                        </td>
                        <td
                          className={`${cellPadding} border-b border-slate-200/80 text-center font-semibold text-slate-700`}
                        >
                          {customerProperties.length}
                        </td>
                        <td
                          className={`${cellPadding} border-b border-slate-200/80 text-center`}
                        >
                          {customer.mobile ? (
                            <a
                              href={`tel:${customer.mobile}`}
                              onClick={(event) => event.stopPropagation()}
                              title={`Call ${customer.name}`}
                              aria-label={`Call ${customer.name}`}
                              className="inline-grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"
                            >
                              <Phone className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td
                          className={`${cellPadding} border-b border-slate-200/80 text-center`}
                        >
                          {whatsappNumber ? (
                            <a
                              href={`https://wa.me/${whatsappNumber}`}
                              onClick={(event) => event.stopPropagation()}
                              target="_blank"
                              rel="noreferrer"
                              title={`WhatsApp ${customer.name}`}
                              aria-label={`WhatsApp ${customer.name}`}
                              className="inline-grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td
                          className={`${cellPadding} border-b border-slate-200/80 text-center`}
                        >
                          <div className="flex flex-col items-center gap-1.5">
                            {!customer.bharath_id && <button type="button" disabled={activatingCustomerId === customer.id} onClick={(event) => activateCustomer(customer, event)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 disabled:opacity-50"><KeyRound className="h-3.5 w-3.5" />{activatingCustomerId === customer.id ? "Creating..." : "Create ID"}</button>}
                            <Link
                              to={`/quotations/new?customer=${customer.id}`}
                              onClick={(event) => event.stopPropagation()}
                              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
                            >
                              <FilePlus2 className="h-4 w-4" />
                              Quotation
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-slate-500">
                <span>Rows per page</span>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border px-2 py-1.5"
                >
                  {[25, 50, 75, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <span>
                  {(currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, filtered.length)} of{" "}
                  {filtered.length}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setPage((value) => Math.min(totalPages, value + 1))
                  }
                  className="rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
        </div>
      </div>
      {showImport && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">Bulk import customers</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Upload Excel (.xlsx) or CSV. Duplicate mobile numbers are
                  skipped.
                </p>
              </div>
              <button
                onClick={() => setShowImport(false)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
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
                  className="hidden"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="mt-4 flex items-center gap-2 text-sm font-semibold text-blue-700"
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
                className="flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-60"
              >
                <ContactRound className="h-4 w-4" />
                Add from phone contacts
              </button>
              <p className="mt-2 text-center text-xs text-slate-400">
                Contact picker support depends on the device and browser.
              </p>
            </div>
          </div>
        </div>
      )}
      {showConnectionFlow && <CustomerConnectionFlow
        onClose={() => setShowConnectionFlow(false)}
        onNewCustomer={createCustomer}
      />}
      {onboarding && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
        <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
          <h2 className="text-xl font-extrabold">Customer created</h2>
          <p className="mt-2 text-sm text-slate-500">Send the welcome message so the customer can register free and continue securely.</p>
          <div className="mt-5 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{buildCustomerWelcomeMessage(onboarding, { ...user, services: contractorServices })}</div>
          {onboarding.temporary_password && <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800"><KeyRound className="h-4 w-4 shrink-0" />The temporary password is included. Ask the customer to change it after signing in.</div>}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => navigator.clipboard.writeText(buildCustomerWelcomeMessage(onboarding, { ...user, services: contractorServices }))} className="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold"><Copy className="h-4 w-4" />Copy</button>
            <a href={`https://wa.me/${whatsappNumber(onboarding.whatsapp || onboarding.mobile)}?text=${encodeURIComponent(buildCustomerWelcomeMessage(onboarding, { ...user, services: contractorServices }))}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white"><MessageCircle className="h-4 w-4" />WhatsApp</a>
          </div>
          <button onClick={() => setOnboarding(null)} className="mt-3 w-full rounded-xl border px-4 py-3 font-bold">Done</button>
        </section>
      </div>}
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
function propertyLabel(property) {
  if (!property) return "";
  return property.name || property.property_type || "Unnamed property";
}
function formatWhatsAppNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 ? `91${digits}` : digits;
}
function SortableHeader({ label: headerLabel, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  const centered = sortKey === "propertyCount";
  return (
    <th
      className={`border-b border-slate-200 px-5 py-3.5 ${centered ? "text-center" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-2 ${centered ? "justify-center" : "text-left"}`}
        aria-label={`Sort by ${headerLabel}`}
      >
        {headerLabel}
        <ArrowUpDown
          className={`h-3.5 w-3.5 ${active ? "text-slate-900" : "text-slate-400"}`}
        />
        {active && (
          <span className="sr-only">
            {sort.direction === "asc" ? "ascending" : "descending"}
          </span>
        )}
      </button>
    </th>
  );
}

function ContactDirectory({ loading, customers, propertiesByCustomer, navigate, activateCustomer, activatingCustomerId }) {
  if (loading) return <div className="p-12 text-center text-slate-500">Loading customers...</div>;
  if (!customers.length) return <div className="p-14 text-center"><Users className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 font-semibold text-slate-900">No customers found</h2><p className="mt-1 text-sm text-slate-500">Add your first customer or change the current filters.</p></div>;

  const sorted = [...customers].sort((first, second) =>
    String(first.name || "").localeCompare(String(second.name || ""), undefined, { sensitivity: "base" }),
  );
  const groups = sorted.reduce((result, customer) => {
    const initial = /^[A-Z]$/i.test(String(customer.name || "").charAt(0))
      ? String(customer.name).charAt(0).toUpperCase()
      : "#";
    if (!result[initial]) result[initial] = [];
    result[initial].push(customer);
    return result;
  }, {});
  const letters = Object.keys(groups).sort((a, b) => a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b));

  return <div className="relative">
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:absolute md:right-2 md:top-2 md:z-20 md:h-[calc(100%-1rem)] md:flex-col md:border-0 md:bg-transparent md:px-0 md:py-0">
      {letters.map((letter) => <button key={letter} type="button" onClick={() => document.getElementById(`customer-letter-${letter}`)?.scrollIntoView({ behavior: "smooth", block: "start" })} className="grid h-7 min-w-7 place-items-center rounded-full text-xs font-bold text-slate-500 hover:bg-indigo-50 hover:text-indigo-700">{letter}</button>)}
    </div>
    <div className="max-h-[68vh] overflow-y-auto scroll-smooth md:pr-12">
      {letters.map((letter) => <section key={letter} id={`customer-letter-${letter}`} className="scroll-mt-0">
        <div className="sticky top-0 z-10 border-y border-slate-200 bg-slate-100/95 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-indigo-700 backdrop-blur">{letter}</div>
        <div className="divide-y divide-slate-100">
          {groups[letter].map((customer) => {
            const customerProperties = propertiesByCustomer[String(customer.id)] || [];
            const primaryProperty = customerProperties[0];
            const whatsappNumber = formatWhatsAppNumber(customer.whatsapp || customer.mobile);
            return <div key={customer.id} role="button" tabIndex="0" onClick={() => navigate(`/customers/${customer.id}`)} onKeyDown={(event) => { if (event.key === "Enter") navigate(`/customers/${customer.id}`); }} className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition hover:bg-indigo-50/60 focus:bg-indigo-50/60 focus:outline-none md:grid-cols-[minmax(220px,1.1fr)_minmax(180px,1fr)_110px_100px] md:px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><p className="truncate font-bold text-slate-950">{customer.name || "Unnamed customer"}</p><span className={`hidden rounded-full px-2 py-0.5 text-[10px] font-bold sm:inline ${statusColors[customer.status] || "bg-slate-100 text-slate-600"}`}>{label(customer.status)}</span></div>
                <p className="mt-0.5 truncate text-xs text-slate-500">{customer.bharath_id || "No customer ID"} · {customer.mobile || "No mobile"}</p>
              </div>
              <div className="hidden min-w-0 md:block"><p className="truncate text-sm font-semibold text-slate-800">{propertyLabel(primaryProperty) || "No property"}</p><p className="mt-0.5 truncate text-xs text-slate-500">{customerProperties.length} {customerProperties.length === 1 ? "property" : "properties"}</p></div>
              <p className="hidden text-sm font-semibold text-slate-700 md:block">{customer.mobile || "—"}</p>
              <div className="flex items-center justify-end gap-2">
                {!customer.bharath_id && <button type="button" disabled={activatingCustomerId === customer.id} onClick={(event) => activateCustomer(customer, event)} title={activatingCustomerId === customer.id ? "Creating Customer ID & Login..." : "Create Customer ID & Login"} aria-label={`Create ID for ${customer.name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-indigo-200 bg-indigo-50 text-indigo-800 shadow-sm hover:bg-indigo-100 disabled:opacity-50"><KeyRound className="h-4 w-4" /></button>}
                <a href={customer.mobile ? `tel:${customer.mobile}` : undefined} onClick={(event) => event.stopPropagation()} aria-label={`Call ${customer.name}`} className={`grid h-9 w-9 place-items-center rounded-full border bg-white shadow-sm ${customer.mobile ? "border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-700" : "pointer-events-none text-slate-300"}`}><Phone className="h-4 w-4" /></a>
                <a href={whatsappNumber ? `https://wa.me/${whatsappNumber}` : undefined} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} aria-label={`WhatsApp ${customer.name}`} className={`grid h-9 w-9 place-items-center rounded-full border bg-white shadow-sm ${whatsappNumber ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "pointer-events-none text-slate-300"}`}><MessageCircle className="h-4 w-4" /></a>
              </div>
              <div className="col-span-2 min-w-0 md:hidden"><p className="truncate text-xs font-semibold text-slate-700">{propertyLabel(primaryProperty) || "No property"}</p><p className="mt-0.5 text-[11px] text-slate-400">{customerProperties.length} {customerProperties.length === 1 ? "property" : "properties"} · Tap contact to view</p></div>
            </div>;
          })}
        </div>
      </section>)}
    </div>
  </div>;
}
