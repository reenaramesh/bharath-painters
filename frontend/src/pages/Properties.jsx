import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowUpDown, Building2, Calculator, ChevronDown, Eye, Plus, Search } from "lucide-react";
import api from "../api/client";
import PropertyForm from "../components/PropertyForm";

export default function Properties() {
  const location = useLocation();
  const [params] = useSearchParams();
  const selectedCustomerId = params.get("customer");
  const calculatorMode = params.get("calculator") === "1";
  const [properties, setProperties] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calculatorSort, setCalculatorSort] = useState({ key: "updated_at", direction: "desc" });
  const [calculatorPage, setCalculatorPage] = useState(1);
  const [calculatorPageSize, setCalculatorPageSize] = useState("25");
  const [calculationTypeFilter, setCalculationTypeFilter] = useState("ALL");
  const [expandedPropertyId, setExpandedPropertyId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [propertyResponse, customerResponse] = await Promise.all([
        api.get("/quotations/properties/"),
        api.get("/quotations/customers/"),
      ]);
      setProperties(propertyResponse.data.results || propertyResponse.data);
      setCustomers(customerResponse.data.results || customerResponse.data);
      setError("");
    } catch {
      setError("Properties could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (params.get("action") === "add") setShowForm(true);
  }, [params, selectedCustomerId]);

  const customerMap = useMemo(
    () => Object.fromEntries(customers.map((item) => [item.id, item])),
    [customers],
  );
  const selectedCustomer = customerMap[selectedCustomerId];
  const propertyListState = { returnTo: `${location.pathname}${location.search}` };
  const filtered = properties.filter((item) => {
    const belongsToCustomer =
      !selectedCustomerId || String(item.customer) === String(selectedCustomerId);
    const matchesSearch = [
      item.name,
      item.flat_number,
      item.block_name,
      item.city,
      item.address,
      item.pincode,
      item.property_type,
      item.approximate_area,
      customerMap[item.customer]?.name,
    ].some((value) =>
      String(value || "").toLowerCase().includes(search.toLowerCase()),
    );
    const matchesCalculationType = !calculatorMode || calculationTypeFilter === "ALL" || item.measurement_type === calculationTypeFilter;
    return belongsToCustomer && matchesSearch && matchesCalculationType;
  });
  const calculatorRows = [...filtered].sort((a, b) => {
    const ownerA = customerMap[a.customer];
    const ownerB = customerMap[b.customer];
    const values = {
      owner: [ownerA?.name, ownerB?.name],
      project: [a.name, b.name],
      location: [a.address, b.address],
      type: [a.property_type, b.property_type],
      status: [a.has_measurements ? 1 : 0, b.has_measurements ? 1 : 0],
      updated_at: [a.updated_at, b.updated_at],
    };
    const [left, right] = values[calculatorSort.key] || values.updated_at;
    const result = String(left || "").localeCompare(String(right || ""), undefined, { numeric: true, sensitivity: "base" });
    return calculatorSort.direction === "asc" ? result : -result;
  });
  function changeCalculatorSort(key) {
    setCalculatorSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  }
  const calculatorPageCount = calculatorPageSize === "ALL" ? 1 : Math.max(1, Math.ceil(calculatorRows.length / Number(calculatorPageSize)));
  const safeCalculatorPage = Math.min(calculatorPage, calculatorPageCount);
  const calculatorStart = calculatorPageSize === "ALL" ? 0 : (safeCalculatorPage - 1) * Number(calculatorPageSize);
  const calculatorPageRows = calculatorPageSize === "ALL" ? calculatorRows : calculatorRows.slice(calculatorStart, calculatorStart + Number(calculatorPageSize));

  useEffect(() => {
    setCalculatorPage(1);
  }, [search, calculatorPageSize, calculatorSort.key, calculatorSort.direction, calculationTypeFilter]);

  async function create(values) {
    setSaving(true);
    try {
      const { data } = await api.post("/quotations/properties/", values);
      setProperties((items) => [data, ...items]);
      setShowForm(false);
      setError("");
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {}).flat().join(" ") ||
          "Property could not be created.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {calculatorMode ? (
        <header className="flex justify-end">
          <button onClick={() => setShowForm(true)} className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" />
            Add property
          </button>
        </header>
      ) : (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {selectedCustomerId && (
              <Link
                to={`/customers/${selectedCustomerId}`}
                className="mb-3 inline-flex text-sm font-semibold text-slate-600 hover:text-slate-950"
              >
                ← Back to customer
              </Link>
            )}
            <p className="text-sm font-semibold text-amber-600">Site management</p>
            <h1 className="mt-1 text-3xl font-bold">
              {selectedCustomer ? `${selectedCustomer.name}'s properties` : "Properties"}
            </h1>
            <p className="mt-2 text-slate-500">
              {selectedCustomer
                ? "View all properties associated with this customer."
                : "View every owner, project, address and property size."}
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Add property
          </button>
        </header>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <section className={calculatorMode ? "space-y-5" : "overflow-hidden rounded-2xl border bg-white"}>
        <div className={calculatorMode ? "flex flex-col gap-3 rounded-2xl border bg-white p-3 shadow-sm sm:flex-row" : "border-b p-4"}>
          <label className="flex flex-1 items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={calculatorMode ? "Search customer, property or location" : "Search owner, project, address or size"}
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          {calculatorMode && <select value={calculationTypeFilter} onChange={(event) => setCalculationTypeFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-violet-500"><option value="ALL">All calculation types</option><option value="INTERIOR">Interior</option><option value="EXTERIOR">Exterior</option></select>}
        </div>
        {loading ? (
          <p className="p-12 text-center text-slate-500">Loading properties...</p>
        ) : calculatorMode && filtered.length ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-bold text-slate-950">Properties ready for calculation</h2>
                <p className="mt-0.5 text-xs text-slate-500">Select a property to create or continue its paintable-area calculation.</p>
              </div>
              <span className="w-fit rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">{calculatorRows.length} properties</span>
            </div>
            <div className="divide-y divide-slate-200 md:hidden">
              {calculatorPageRows.map((property) => {
                const owner = customerMap[property.customer];
                const address = [property.flat_number, property.block_name, property.address, property.city, property.pincode].filter(Boolean).join(", ");
                const expanded = expandedPropertyId === property.id;
                return <article key={property.id} className="bg-white">
                  <button type="button" aria-expanded={expanded} onClick={() => setExpandedPropertyId(expanded ? null : property.id)} className="flex w-full items-center gap-3 px-4 py-4 text-left">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><Building2 className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-950">{property.name || "Unnamed project"}</span><span className="mt-0.5 block truncate text-sm text-slate-500">Owner: {owner?.name || "Not provided"}</span></span>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition ${expanded ? "rotate-180" : ""}`} />
                  </button>
                  {expanded && <div className="space-y-3 border-t bg-slate-50/70 px-4 py-4 text-sm">
                    <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Location</p><p className="mt-1 text-slate-700">{address || "Not provided"}</p></div>
                    <div className="grid grid-cols-2 gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Type</p><p className="mt-1 font-semibold">{property.property_type || "Property"}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Calculation</p><p className="mt-1 font-semibold">{property.has_measurements ? "Available" : "Not started"}</p></div></div>
                    <div className="grid grid-cols-2 gap-2 pt-1"><Link to={`/properties/${property.id}`} state={propertyListState} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-white font-bold"><Eye className="h-4 w-4" />View</Link><Link to={`/properties/${property.id}/measurements`} state={propertyListState} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 font-bold text-white"><Calculator className="h-4 w-4" />Open</Link></div>
                  </div>}
                </article>;
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1100px] table-fixed text-left text-sm">
                <colgroup><col className="w-[5%]" /><col className="w-[18%]" /><col className="w-[16%]" /><col className="w-[24%]" /><col className="w-[11%]" /><col className="w-[12%]" /><col className="w-[14%]" /></colgroup>
                <thead className="bg-slate-950 text-[11px] uppercase tracking-[0.08em] text-slate-300">
                  <tr>
                    <th className="px-4 py-3.5">SL No.</th>
                    <CalculatorHead label="Project" sortKey="project" sort={calculatorSort} onSort={changeCalculatorSort} />
                    <CalculatorHead label="Owner" sortKey="owner" sort={calculatorSort} onSort={changeCalculatorSort} />
                    <CalculatorHead label="Location" sortKey="location" sort={calculatorSort} onSort={changeCalculatorSort} />
                    <CalculatorHead label="Property / Area type" sortKey="type" sort={calculatorSort} onSort={changeCalculatorSort} />
                    <CalculatorHead label="Calculation" sortKey="status" sort={calculatorSort} onSort={changeCalculatorSort} />
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {calculatorPageRows.map((property, index) => {
                    const owner = customerMap[property.customer];
                    const address = [property.flat_number, property.block_name, property.address, property.city, property.pincode].filter(Boolean).join(", ");
                    return (
                      <tr key={property.id} className={`group transition hover:bg-violet-50/60 ${index % 2 ? "bg-slate-50/60" : "bg-white"}`}>
                        <td className="px-4 py-4 font-bold tabular-nums text-slate-400">{calculatorStart + index + 1}</td>
                        <td className="px-4 py-4"><p className="truncate font-bold text-slate-950">{property.name || "Unnamed project"}</p><p className="mt-1 text-xs text-slate-400">Property #{property.id}</p></td>
                        <td className="px-4 py-4"><p className="truncate font-semibold text-slate-800">{owner?.name || "Owner not provided"}</p><p className="mt-1 text-xs text-slate-500">{owner?.mobile || "No mobile"}</p></td>
                        <td className="px-4 py-4"><p className="line-clamp-2 leading-5 text-slate-600">{address || "Address not provided"}</p></td>
                        <td className="px-4 py-4"><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700">{property.property_type || "Property"}</span><p className={`mt-2 text-xs font-bold ${property.measurement_type === "EXTERIOR" ? "text-sky-700" : "text-violet-700"}`}>{property.measurement_type === "EXTERIOR" ? "Exterior" : "Interior"} · {property.linear_unit_label || property.measurement_unit || "FEET"}</p></td>
                        <td className="px-4 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold ${property.has_measurements ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><span className={`h-1.5 w-1.5 rounded-full ${property.has_measurements ? "bg-emerald-500" : "bg-amber-500"}`} />{property.has_measurements ? "Available" : "Not started"}</span></td>
                        <td className="px-4 py-4"><div className="flex justify-end gap-2"><Link to={`/properties/${property.id}`} state={propertyListState} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-slate-950"><Eye className="h-4 w-4" />View</Link><Link to={`/properties/${property.id}/measurements`} state={propertyListState} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-violet-700"><Calculator className="h-4 w-4" />Open</Link></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span>Rows per page</span>
                <select value={calculatorPageSize} onChange={(event) => setCalculatorPageSize(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold outline-none focus:border-violet-500">
                  {["25", "50", "75", "100", "ALL"].map((size) => <option key={size} value={size}>{size === "ALL" ? "All" : size}</option>)}
                </select>
                <span className="text-xs text-slate-400">{calculatorRows.length ? `${calculatorStart + 1}–${calculatorStart + calculatorPageRows.length} of ${calculatorRows.length}` : "0 records"}</span>
              </div>
              {calculatorPageSize !== "ALL" && <div className="flex items-center gap-2"><button type="button" disabled={safeCalculatorPage === 1} onClick={() => setCalculatorPage((page) => Math.max(1, page - 1))} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Previous</button><span className="px-2 text-xs font-semibold text-slate-500">Page {safeCalculatorPage} of {calculatorPageCount}</span><button type="button" disabled={safeCalculatorPage === calculatorPageCount} onClick={() => setCalculatorPage((page) => Math.min(calculatorPageCount, page + 1))} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Next</button></div>}
            </div>
          </div>
        ) : filtered.length ? (
          <div>
            <div className="divide-y md:hidden">
              {filtered.map((property) => {
                const owner = customerMap[property.customer];
                const address = [property.flat_number, property.block_name, property.address, property.city, property.pincode].filter(Boolean).join(", ");
                const expanded = expandedPropertyId === property.id;
                return <article key={property.id}>
                  <button type="button" aria-expanded={expanded} onClick={() => setExpandedPropertyId(expanded ? null : property.id)} className="flex w-full items-center gap-3 px-4 py-4 text-left">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><Building2 className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-bold">{property.name || "Unnamed project"}</span><span className="mt-0.5 block truncate text-sm text-slate-500">Owner: {owner?.name || "Not provided"}</span></span>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition ${expanded ? "rotate-180" : ""}`} />
                  </button>
                  {expanded && <div className="space-y-3 border-t bg-slate-50 px-4 py-4 text-sm">
                    <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Address</p><p className="mt-1 text-slate-700">{address || "Not provided"}</p></div>
                    <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Property type</p><p className="mt-1 font-semibold">{property.property_type || "Not provided"}</p></div>
                    <Link to={`/properties/${property.id}`} state={propertyListState} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 font-bold text-white"><Eye className="h-4 w-4" />View property</Link>
                  </div>}
                </article>;
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">SL No.</th>
                  <th className="px-5 py-3">Owner name</th>
                  <th className="px-5 py-3">Project name</th>
                  <th className="px-5 py-3">Address</th>
                  <th className="px-5 py-3">Property type</th>
                  <th className="px-5 py-3" data-no-sort="true">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((property, index) => {
                  const owner = customerMap[property.customer];
                  const address = [property.flat_number, property.block_name, property.address, property.city, property.pincode]
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <tr key={property.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-bold tabular-nums text-slate-400">{index + 1}</td>
                      <td className="px-5 py-4 font-semibold">
                        {owner?.name || "Not provided"}
                      </td>
                      <td className="px-5 py-4 font-bold">
                        {property.name || "Unnamed project"}
                      </td>
                      <td className="max-w-sm px-5 py-4 text-slate-600">
                        {address || "Not provided"}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {property.property_type || "—"}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/properties/${property.id}`}
                            state={propertyListState}
                            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-semibold hover:bg-white"
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        ) : (
          <div className="p-14 text-center">
            <Building2 className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-semibold">No properties found</h2>
          </div>
        )}
      </section>

      {showForm && (
        <PropertyForm
          customers={customers}
          initialCustomer={selectedCustomerId}
          onSubmit={create}
          onClose={() => setShowForm(false)}
          saving={saving}
        />
      )}
    </div>
  );
}

function CalculatorHead({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  return (
    <th className="px-4 py-3.5">
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1.5 font-bold hover:text-white">
        {label}
        <ArrowUpDown className={`h-3.5 w-3.5 ${active ? "text-violet-300" : "text-slate-500"}`} />
        {active && <span className="sr-only">{sort.direction === "asc" ? "Ascending" : "Descending"}</span>}
      </button>
    </th>
  );
}
