import { Link } from "react-router-dom";

const money = value => Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const labels = { coats: "Coats", quantity: "Quantity", specification_details: "Saved work specifications", included_areas: "Included areas", gst_mode: "GST mode", gst_percentage: "GST percentage", discount_mode: "Discount mode", discount_type: "Discount type", discount_value: "Overall discount value", paint_type_id: "Product selection", paint_brand_id: "Brand selection", service_type_id: "Service selection", service_category_id: "Category selection", unit_id: "Unit selection", service_name_snapshot: "Service", service_category_name_snapshot: "Category", product_type_name_snapshot: "Product", brand_name_snapshot: "Brand", unit_name_snapshot: "Unit", name: "Work group", surface: "Surface", primer_coats: "Primer coats", contributions: "Measured scope", exclude_from_standard: "Excluded from standard painting" };
const label = field => labels[field] || field.replaceAll("_", " ").replace(/^\w/, letter => letter.toUpperCase());
const internalFields = new Set(["schema_version", "assignment_id", "measurement_record", "measurement_version", "room_ids", "surface_ids", "room_id", "surface_id", "kind"]);
const value = entry => {
  if (Array.isArray(entry)) return entry.map(row => typeof row === "object" && row !== null ? `${row.room_name || row.name || "Area"}: ${row.quantity ?? ""}` : String(row)).join(", ");
  if (typeof entry === "object" && entry !== null) return Object.entries(entry).filter(([field]) => !internalFields.has(field)).map(([field, saved]) => `${label(field)}: ${value(saved)}`).join("\n") || "Saved work specification updated";
  if (typeof entry === "boolean") return entry ? "Yes" : "No";
  return String(entry ?? "Not set");
};
const discount = (type, amount) => type === "PERCENTAGE" ? `${amount}%` : `₹${money(amount)}`;

export function QuotationRevisionHistory({ versions = [], currentId, customer = false }) {
  if (versions.length < 2) return null;
  return <section aria-label="Quotation version history" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <h2 className="font-bold text-slate-950">Version history</h2>
    <p className="mt-1 text-sm text-slate-500">Open a version to review its saved scope and prices.</p>
    <ol className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
      {versions.map(version => <li key={version.id} className="min-w-0 rounded-xl border border-slate-200 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><p className="break-words font-semibold">{version.quotation_number}</p><p className="mt-1 text-xs text-slate-600">Version {version.version_number} / {String(version.status).replaceAll("_", " ")}</p></div>
          <span className="text-sm font-bold">₹{money(version.grand_total)}</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">Quotation date: {String(version.quotation_date || "Not recorded").slice(0, 10)}</p>
        {String(version.id) === String(currentId)
          ? <p aria-current="page" className="mt-2 text-sm font-semibold text-slate-600">Current version</p>
          : <Link to={`${customer ? "/customer-quotations" : "/quotations"}/${version.id}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline">Open version {version.version_number}</Link>}
      </li>)}
    </ol>
  </section>;
}

export function QuotationRevisionDetails({ changes }) {
  if (!changes) return null;
  const discounts = changes.discount_changes || [];
  const specs = changes.specification_changes || [];
  const settings = changes.quotation_changes || {};
  if (!discounts.length && !specs.length && !Object.keys(settings).length) return null;
  const fields = entries => <dl className="space-y-3">{Object.entries(entries).map(([field, change]) => <div key={field} className="min-w-0">
    <dt className="text-sm font-semibold">{label(field)}</dt>
    {field.endsWith("_id") ? <dd className="mt-1 text-xs text-slate-600">Selection changed. Saved names and scope are shown in this version.</dd> : <dd className="mt-1 grid min-w-0 gap-2 text-xs text-slate-600 sm:grid-cols-2">
      <span className="min-w-0 whitespace-pre-wrap break-all"><b>Previous: </b>{value(change.previous)}</span>
      <span className="min-w-0 whitespace-pre-wrap break-all"><b>Current: </b>{value(change.current)}</span>
    </dd>}
  </div>)}</dl>;
  return <div className="min-w-0 space-y-3" aria-label="Additional revision changes">
    {discounts.length > 0 && <details className="rounded-xl border border-slate-200 p-3"><summary className="min-h-11 cursor-pointer content-center text-sm font-bold">Discount changes ({discounts.length})</summary><ul className="mt-3 space-y-3">{discounts.map((line, index) => <li key={index} className="min-w-0 text-sm"><p className="break-words font-semibold">{line.room} / {line.description}</p><p className="mt-1">{discount(line.previous_type, line.previous_value)} → {discount(line.current_type, line.current_value)}</p></li>)}</ul></details>}
    {specs.length > 0 && <details className="rounded-xl border border-slate-200 p-3"><summary className="min-h-11 cursor-pointer content-center text-sm font-bold">Scope and specification changes ({specs.length})</summary><ul className="mt-3 space-y-4">{specs.map((line, index) => <li key={index} className="min-w-0"><p className="mb-2 break-words text-sm font-bold">{line.room} / {line.description}</p>{fields(line.fields)}</li>)}</ul></details>}
    {Object.keys(settings).length > 0 && <details className="rounded-xl border border-slate-200 p-3"><summary className="min-h-11 cursor-pointer content-center text-sm font-bold">Quotation settings</summary><div className="mt-3">{fields(settings)}</div></details>}
  </div>;
}

export function QuotationRevisionPriceChanges({ lines = [] }) {
  return <div className="min-w-0 space-y-3 p-3 md:hidden" aria-label="Net price changes">
    {lines.map((line, index) => {
      const difference = line.net_difference ?? line.difference;
      return <article key={index} className="min-w-0 rounded-xl border border-slate-200 p-3">
        <p className="break-words text-sm font-semibold">{line.room} / {line.description}</p>
        <dl className="mt-3 grid min-w-0 grid-cols-2 gap-3 text-xs">
          <div><dt className="text-slate-500">Previous net</dt><dd className="mt-1 break-all font-bold">₹{money(line.previous_net ?? line.previous_price)}</dd></div>
          <div><dt className="text-slate-500">Current net</dt><dd className="mt-1 break-all font-bold">₹{money(line.current_net ?? line.current_price)}</dd></div>
          <div className="col-span-2"><dt className="text-slate-500">Difference</dt><dd className={`mt-1 font-bold ${Number(difference) >= 0 ? "text-emerald-700" : "text-red-700"}`}>₹{money(difference)}</dd></div>
        </dl>
      </article>;
    })}
  </div>;
}
