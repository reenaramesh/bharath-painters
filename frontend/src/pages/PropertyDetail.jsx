import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Calculator,
  Download,
  Edit3,
  Eye,
  EyeOff,
  MapPin,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import PropertyForm from "../components/PropertyForm";
import SharePropertyDialog from "../components/SharePropertyDialog";
import BackButton from "../components/BackButton";
import { previewPdf } from "../components/PdfPreview";
import { Button, ErrorState, LoadingState, PageHeader, SectionCard, StatusBadge } from "../components/ui";
import "./quotation-measurement.css";

export default function PropertyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [shareOpen, setShareOpen] = useState(false);
  const customerPath = location.state?.customerPath;
  const returnTo = location.state?.returnTo;
  const [property, setProperty] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [measurementRecords, setMeasurementRecords] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const backPath = returnTo || customerPath || "/properties";
  const returnsToCustomer = backPath.startsWith("/customers/");

  const load = useCallback(async () => {
    try {
      const [p, r, m, records, c] = await Promise.all([
        api.get(`/quotations/properties/${id}/`),
        api.get(`/quotations/properties/${id}/rooms/`),
        api.get(`/quotations/properties/${id}/measurements/`),
        api.get(`/quotations/properties/${id}/measurement-records/`),
        api.get("/quotations/customers/"),
      ]);
      setProperty(p.data);
      setRooms(r.data.results || r.data);
      setMeasurements(m.data.results || m.data);
      setMeasurementRecords(records.data.results || records.data);
      setCustomers(c.data.results || c.data);
      setError("");
    } catch {
      setError("Property details could not be loaded.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProperty(values) {
    setSaving(true);
    try {
      const { data } = await api.patch(`/quotations/properties/${id}/`, values);
      setProperty(data);
      setEditing(false);
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" "),
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteProperty() {
    if (!window.confirm("Remove this property from your board? The customer, admin and saved Area Calculations can still access it."))
      return;
    try {
      await api.delete(`/quotations/properties/${id}/`);
      navigate(backPath);
    } catch {
      setError("Property could not be removed from your board.");
    }
  }

  function createMeasurement() {
    navigate(`/properties/${id}/measurements?new=1`);
  }

  async function deleteMeasurement(record) {
    if (!window.confirm(`Delete Area Calculation ${record.reference_no} and all its saved dimensions?`)) return;
    try {
      await api.delete(`/quotations/measurement-records/${record.id}/`);
      await load();
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.measurement || "Area Calculation could not be deleted.");
    }
  }

  async function downloadMeasurements(record) {
    try {
      const response = await api.get(
        `/quotations/properties/${id}/measurements/pdf/`,
        { params: { measurement: record?.id }, responseType: "blob" },
      );
      previewPdf(
        response.data,
        `${record?.reference_no || property.name || "property"}-area-calculation.pdf`,
      );
      setError("");
    } catch {
      setError("Area Calculation PDF could not be previewed.");
    }
  }

  if (!property)
    return error ? <ErrorState message={error} onRetry={load} /> : <LoadingState label="Loading property details..." />;
  const customer = customers.find((item) => item.id === property.customer);
  const roomById = new Map(rooms.map((room) => [room.id, room.name]));
  const totals = measurements.reduce(
    (v, item) => ({
      gross: v.gross + Number(item.gross_area || 0),
      deductions: v.deductions + Number(item.deduction_area || 0),
      additions: v.additions + Number(item.addition_area || 0),
      net: v.net + Number(item.net_area || 0),
    }),
    { gross: 0, deductions: 0, additions: 0, net: 0 },
  );
  const areas = [...new Set(measurements.map((item) => item.work_area))];
  return (
    <div className="space-y-6 quotation-measurement-page bp-property-detail">
      <BackButton fallback={backPath} label={returnsToCustomer ? "Back to customer" : "Back to properties"} />
      <PageHeader eyebrow="Property" title={property.name || property.property_type} description={customer?.name ? `Customer · ${customer.name}` : "Project details and saved area calculations."} />
      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b p-4 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <h2 className="shrink-0 font-bold">Project overview</h2>

          <div className="property-overview-actions flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
            {user?.role === "CONTRACTOR" && <button type="button" onClick={() => setShareOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#176b9b] px-3 text-sm font-semibold text-white hover:bg-[#12577f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#102331]"><Share2 aria-hidden="true" className="h-4 w-4" />Share Access</button>}
            {property.google_maps_url && <a href={property.google_maps_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><MapPin className="h-4 w-4" />Open in Google Maps</a>}
            <Link to={`/quotations/new?customer=${property.customer}&property=${property.id}`} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Create Quotation</Link>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"
            >
              <Edit3 className="h-4 w-4" />
              Edit
            </button>
            <button
              type="button"
              onClick={deleteProperty}
              aria-label="Remove property from my board"
              title="Remove property from my board"
              className="rounded-xl border border-slate-200 p-2.5 text-slate-600"
            >
              <EyeOff className="h-4 w-4" />
            </button>
          </div>
          </div>
            <div className="property-overview-details mt-5 grid min-w-0 grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
              <Detail label="Owner name" value={customer?.name} />
              <Detail label="Project name" value={property.name} />
              <Detail label="Flat number" value={property.flat_number || "—"} />
              <Detail label="Block / Tower" value={property.block_name || "—"} />
              <Detail
                label="Project address"
                value={[property.address, property.city, property.pincode]
                  .filter(Boolean)
                  .join(", ")}
                className="col-span-2 min-w-0 lg:col-span-3"
              />
              <Detail
                label="Area calculation unit"
                value={property.linear_unit_label || property.measurement_unit}
              />
            </div>
        </div>
        <div className="px-4 pt-4 sm:px-6">
        <SectionCard title="Saved Area Calculations" description="Separate records for site visits and revisions." className="bp-measurement-records" bodyClassName="p-0" action={<Button onClick={createMeasurement}><Plus className="h-4 w-4" aria-hidden="true" />Start new</Button>}>
        {measurementRecords.length ? (
          <>
          <div className="grid gap-3 p-3 md:hidden">
            {measurementRecords.map((record) => {
              const editable = record.status === "DRAFT" || record.status === "IN_PROGRESS";
              return (
                <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <Detail label="Area Calculation ID" value={record.reference_no} />
                    <Detail label="Date" value={new Date(`${record.measured_on}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} />
                    <Detail label="Paintable area" value={`${Number(record.total_sqft || 0).toFixed(0)} sq ft`} />
                    <Detail label="Rooms" value={record.room_count || 0} />
                  </div>
                  <div className="mt-3"><StatusBadge status={record.status} tone={record.status === "LOCKED" ? "success" : record.status === "DRAFT" || record.status === "IN_PROGRESS" ? "warning" : "info"} /></div>
                  <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2 border-t border-slate-100 pt-3">
                    <Link to={`/properties/${id}/measurements?measurement=${record.id}`} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-3 text-sm font-bold text-white">
                      {editable ? <Edit3 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {editable ? "Edit" : "View"}
                    </Link>
                    <button type="button" disabled={!record.surface_count} onClick={() => downloadMeasurements(record)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold disabled:opacity-40"><Download className="h-4 w-4" />PDF</button>
                    <button type="button" disabled={record.status === "LOCKED"} onClick={() => deleteMeasurement(record)} aria-label={`Delete Area Calculation ${record.reference_no}`} className="grid h-10 w-10 place-items-center rounded-xl border border-red-200 text-red-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block" data-mobile-table="keep">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  {["Area Calculation ID", "Calculation date", "Total Paintable Area", "Rooms", "Status", "Actions"].map((label) => (
                    <th key={label} className="px-5 py-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {measurementRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-bold text-slate-950">{record.reference_no}</td>
                    <td className="px-5 py-4">{new Date(`${record.measured_on}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="px-5 py-4 font-bold">{Number(record.total_sqft || 0).toFixed(0)} sq ft</td>
                    <td className="px-5 py-4">{record.room_count || 0}</td>
                    <td className="px-5 py-4"><StatusBadge status={record.status} tone={record.status === "LOCKED" ? "success" : record.status === "DRAFT" || record.status === "IN_PROGRESS" ? "warning" : "info"} /></td>
                    <td className="px-5 py-4"><div className="flex items-center gap-2"><Link to={`/properties/${id}/measurements?measurement=${record.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold"><Eye className="h-4 w-4" />{record.status === "DRAFT" || record.status === "IN_PROGRESS" ? "Edit" : "View"}</Link><button type="button" disabled={!record.surface_count} onClick={() => downloadMeasurements(record)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"><Download className="h-4 w-4" />PDF</button><button type="button" disabled={record.status === "LOCKED"} onClick={() => deleteMeasurement(record)} aria-label={`Delete Area Calculation ${record.reference_no}`} className="grid h-11 w-11 place-items-center rounded-lg border border-red-200 text-red-600 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <p className="p-8 text-center text-sm text-slate-500">
            No Area Calculations yet. Select Start New to begin.
          </p>
        )}
        </SectionCard></div>
      </section>
      <SharePropertyDialog open={shareOpen} onClose={() => setShareOpen(false)} propertyId={property.id} propertyName={property.name || property.property_type} />
      <section className="hidden">
        <div className="flex flex-col gap-3 border-b p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold">Saved Area Calculations</h2>
            <div className="mt-2 flex gap-2">
              {areas.length ? (
                areas.map((area) => (
                  <span
                    key={area}
                    className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"
                  >
                    {area}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">
                  No Area Calculations saved
                </span>
              )}
            </div>
          </div>
          <Link
            to={`/properties/${id}/measurements`}
            className="flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800"
          >
            <Calculator className="h-4 w-4" />
            Open Area Calculator
          </Link>
        </div>
        {measurements.length ? (
          <>
            <div className="grid grid-cols-2 gap-3 border-b p-4 sm:grid-cols-4">
              <Total label="Gross area" value={totals.gross} />
              <Total label="Deductions" value={totals.deductions} />
              <Total label="Additions" value={totals.additions} />
              <Total label="Total Paintable Area" value={totals.net} strong />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      "Section",
                      "Room / Area",
                      "Surface",
                      "Dimensions",
                      "Gross",
                      "Deductions",
                      "Additions",
                      "Net area",
                    ].map((h) => (
                      <th key={h} className="p-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {measurements.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">
                          {item.work_area}
                        </span>
                      </td>
                      <td className="p-3 font-semibold">
                        {item.work_area === "EXTERIOR"
                          ? "Exterior"
                          : roomById.get(item.room) || "Interior"}
                      </td>
                      <td className="p-3">
                        <b>{item.name}</b>
                        <small className="block text-slate-500">
                          {item.surface_type.replaceAll("_", " ")}
                        </small>
                      </td>
                      <td className="p-3">
                        {item.length} × {item.breadth} × {item.quantity || 1}
                      </td>
                      <td className="p-3">{Math.round(Number(item.gross_area || 0))}</td>
                      <td className="p-3 text-red-600">
                        {item.deduction_area}
                      </td>
                      <td className="p-3 text-emerald-600">
                        {item.addition_area}
                      </td>
                      <td className="p-3 font-bold">{Math.round(Number(item.net_area || 0))} sq ft</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="p-12 text-center text-slate-500">
            No Area Calculations have been recorded for this property.
          </p>
        )}
      </section>
      {editing && (
        <PropertyForm
          customers={customers}
          initialValue={property}
          onSubmit={saveProperty}
          onClose={() => setEditing(false)}
          saving={saving}
        />
      )}
    </div>
  );
}

function Total({ label, value, strong }) {
  return (
    <div
      className={`rounded-xl p-3 ${strong ? "bg-slate-950 text-white" : "bg-slate-50"}`}
    >
      <p className={`text-xs ${strong ? "text-slate-300" : "text-slate-500"}`}>
        {label}
      </p>
      <p className="mt-1 font-bold">{Number(value).toFixed(0)} sq ft</p>
    </div>
  );
}
function Detail({ label, value, className = "" }) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1.5 text-sm font-medium text-slate-800">
        {value || "Not provided"}
      </p>
    </div>
  );
}
