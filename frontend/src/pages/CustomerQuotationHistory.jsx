import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  Eye,
  FileText,
  Plus,
  Search,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";
import BackButton from "../components/BackButton";

const statusStyles = {
  DRAFT: "bg-slate-100 text-slate-700",
  SENT: "bg-blue-50 text-blue-700",
  VIEWED: "bg-cyan-50 text-cyan-700",
  ACCEPTED: "bg-emerald-50 text-emerald-700",
  SCHEDULED: "bg-indigo-50 text-indigo-700",
  IN_PROGRESS: "bg-violet-50 text-violet-700",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-50 text-red-700",
  EXPIRED: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-red-50 text-red-700",
  REVISION_REQUESTED: "bg-orange-50 text-orange-700",
  CONVERTED: "bg-purple-50 text-purple-700",
};

const money = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    Number(value || 0),
  );

export default function CustomerQuotationHistory() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState({
    key: "quotation_date",
    direction: "desc",
  });

  useEffect(() => {
    setLoading(true);
    api
      .get(`/quotations/customers/${id}/`)
      .then(({ data }) => {
        setCustomer(data);
        setError("");
      })
      .catch(() => setError("Customer quotations could not be loaded."))
      .finally(() => setLoading(false));
  }, [id]);

  const propertyMap = useMemo(
    () =>
      Object.fromEntries(
        (customer?.properties || []).map((item) => [item.id, item]),
      ),
    [customer],
  );

  const quotations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...(customer?.quotations || [])]
      .filter((item) => {
        const property = propertyMap[item.property];
        const matchesSearch = [
          item.quotation_number,
          property?.name,
          property?.property_type,
          item.quotation_type,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(term),
        );
        return matchesSearch && (status === "ALL" || item.status === status);
      })
      .sort((first, second) => {
        const firstValue = sortValue(first, sort.key, propertyMap);
        const secondValue = sortValue(second, sort.key, propertyMap);
        const comparison =
          typeof firstValue === "number"
            ? firstValue - secondValue
            : String(firstValue || "").localeCompare(String(secondValue || ""));
        return sort.direction === "asc" ? comparison : -comparison;
      });
  }, [customer, propertyMap, search, sort, status]);

  const allQuotations = customer?.quotations || [];
  const totalValue = allQuotations.reduce(
    (sum, item) => sum + Number(item.grand_total || 0),
    0,
  );
  const sentCount = allQuotations.filter(
    (item) => item.status !== "DRAFT",
  ).length;

  function changeSort(key) {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  if (loading)
    return (
      <div className="p-12 text-center text-slate-500">
        Loading customer quotations...
      </div>
    );
  if (!customer)
    return (
      <div className="rounded-xl bg-red-50 p-5 text-red-700">
        {error}
        <Link to={`/customers/${id}`} className="ml-3 font-semibold">
          Back to customer
        </Link>
      </div>
    );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <BackButton fallback={`/customers/${id}`} label="Back to customer" />
          <p className="mt-5 text-sm font-semibold text-amber-600">
            Customer quotation history
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            {customer.name}
          </h1>
          <p className="mt-2 text-slate-500">
            Review every quotation prepared for this customer.
          </p>
        </div>
        <Link
          to={`/quotations/new?customer=${id}`}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          Create quotation
        </Link>
      </header>

      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total quotations" value={allQuotations.length} />
        <Stat label="Sent quotations" value={sentCount} />
        <Stat label="Total quoted value" value={money(totalValue)} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row">
          <label className="flex flex-1 items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search quotation number, property or type"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
          >
            <option value="ALL">All statuses</option>
            {Object.keys(statusStyles).map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>

        {quotations.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr>
                  <Header
                    label="Quotation"
                    sortKey="quotation_number"
                    sort={sort}
                    onSort={changeSort}
                  />
                  <Header
                    label="Property"
                    sortKey="property"
                    sort={sort}
                    onSort={changeSort}
                  />
                  <Header
                    label="Type"
                    sortKey="quotation_type"
                    sort={sort}
                    onSort={changeSort}
                  />
                  <Header
                    label="Status"
                    sortKey="status"
                    sort={sort}
                    onSort={changeSort}
                  />
                  <Header
                    label="Quotation date"
                    sortKey="quotation_date"
                    sort={sort}
                    onSort={changeSort}
                  />
                  <th className="px-4 py-3 text-left">Sent date</th>
                  <th className="px-4 py-3 text-left">Valid until</th>
                  <Header
                    label="Value"
                    sortKey="grand_total"
                    sort={sort}
                    onSort={changeSort}
                  />
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((quotation) => {
                  const property = propertyMap[quotation.property];
                  const sentDate =
                    quotation.sent_at ||
                    (quotation.status !== "DRAFT"
                      ? quotation.updated_at
                      : null);
                  return (
                    <tr key={quotation.id} className="even:bg-slate-50/70">
                      <td className="border-t px-4 py-4 font-semibold text-slate-900">
                        {quotation.quotation_number}
                      </td>
                      <td className="border-t px-4 py-4">
                        <p className="font-medium text-slate-800">
                          {property?.name ||
                            property?.property_type ||
                            "Property"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {property?.city || ""}
                        </p>
                      </td>
                      <td className="border-t px-4 py-4 text-sm text-slate-600">
                        {quotation.quotation_type === "MEASUREMENT"
                          ? "Area Calculation based"
                          : String(quotation.quotation_type || "—").replaceAll(
                              "_",
                              " ",
                            )}
                      </td>
                      <td className="border-t px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[quotation.status] || "bg-slate-100 text-slate-700"}`}
                        >
                          {quotation.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="border-t px-4 py-4 text-sm text-slate-600">
                        {formatDate(quotation.quotation_date)}
                      </td>
                      <td className="border-t px-4 py-4 text-sm text-slate-600">
                        {sentDate ? formatDateTime(sentDate) : "Not sent"}
                        {!quotation.sent_at && sentDate && (
                          <span className="mt-1 block text-[10px] text-slate-400">
                            Legacy record
                          </span>
                        )}
                      </td>
                      <td className="border-t px-4 py-4 text-sm text-slate-600">
                        {formatDate(quotation.valid_until)}
                      </td>
                      <td className="border-t px-4 py-4 font-bold text-slate-900">
                        {money(quotation.grand_total)}
                      </td>
                      <td className="border-t px-4 py-4 text-right">
                        <Link
                          to={`/quotations/${quotation.id}`}
                          state={{
                            customerPath: `/customers/${id}/quotations`,
                          }}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-semibold">No quotations found</h2>
            <p className="mt-1 text-sm text-slate-500">
              Change the filters or create a new quotation.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
function Header({ label, sortKey, sort, onSort }) {
  return (
    <th className="px-4 py-3 text-left">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-2"
      >
        {label}
        <ArrowUpDown
          className={`h-3.5 w-3.5 ${sort.key === sortKey ? "text-slate-900" : "text-slate-400"}`}
        />
      </button>
    </th>
  );
}
function sortValue(item, key, propertyMap) {
  if (key === "property")
    return (
      propertyMap[item.property]?.name ||
      propertyMap[item.property]?.property_type ||
      ""
    );
  if (key === "grand_total") return Number(item.grand_total || 0);
  return item[key] || "";
}
function formatDate(value) {
  return value
    ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
        "en-IN",
        { day: "2-digit", month: "short", year: "numeric" },
      )
    : "—";
}
function formatDateTime(value) {
  return value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
}
