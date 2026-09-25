import { useEffect, useState } from "react";
import { QrCode, Save, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/client";

const blank = {
  mobile: "",
  email: "",
  password: "",
  company_name: "",
  owner_name: "",
  company_logo: null,
  company_logo_url: "",
  company_logo_shape: "RECTANGLE",
  office_address: "",
  service_areas: "",
  gst_number: "",
  pan_number: "",
  years_in_business: 0,
  number_of_painters: 0,
  default_measurement_unit: "FEET",
  quotation_terms_conditions: "",
  quotation_prepared_by: "",
  quotation_inspected_by: "",
  quotation_work_duration: "",
  quotation_payment_terms: "",
  quotation_product_details: "",
  quotation_work_procedures: "",
};

export default function ContractorSettings() {
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    api
      .get("/accounts/contractor-profile/")
      .then(({ data }) =>
        setForm({
          ...blank,
          ...data,
          company_logo: null,
          company_logo_url: data.company_logo || "",
        }),
      )
      .catch(() => setError("Contractor details could not be loaded."))
      .finally(() => setLoading(false));
  }, []);
  const update = (event) =>
    setForm((value) => ({ ...value, [event.target.name]: event.target.value }));
  const input =
    "mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 outline-none focus:border-slate-900";
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = new FormData();
      [
        "mobile",
        "email",
        "company_logo_shape",
        "office_address",
        "service_areas",
        "gst_number",
        "pan_number",
        "years_in_business",
        "number_of_painters",
        "default_measurement_unit",
      ].forEach((field) => payload.append(field, form[field] ?? ""));
      if (form.password) payload.append("password", form.password);
      if (form.company_logo) payload.append("company_logo", form.company_logo);
      const { data } = await api.patch(
        "/accounts/contractor-profile/",
        payload,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setForm((value) => ({
        ...value,
        ...data,
        password: "",
        company_logo: null,
        company_logo_url: data.company_logo || value.company_logo_url,
      }));
      setSuccess(
        "Contractor details updated. New quotations and PDFs will use these details.",
      );
    } catch (requestError) {
      setError(
        formatError(requestError.response?.data) ||
          "Contractor details could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <p className="p-12 text-center text-slate-500">
        Loading contractor details...
      </p>
    );
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
        <p className="text-sm font-semibold text-amber-600">Account settings</p>
        <h1 className="mt-1 text-3xl font-bold">
          Contractor and company details
        </h1>
        <p className="mt-2 text-slate-500">
          These details appear on your quotations and downloadable estimates.
        </p>
        </div>
        <Link to="/profile" className="inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-semibold"><QrCode className="h-5 w-5" />View & share QR profile</Link>
      </div>
      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">
          {success}
        </div>
      )}
      <form
        onSubmit={submit}
        className="grid gap-5 rounded-2xl border bg-white p-6 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <h2 className="font-bold">Company identity</h2>
        </div>
        <label className="text-sm font-medium">
          Company name
          <input
            value={form.company_name}
            readOnly
            className={`${input} cursor-not-allowed bg-slate-100 text-slate-500`}
          />
        </label>
        <label className="text-sm font-medium">
          Owner / proprietor
          <input
            value={form.owner_name}
            readOnly
            className={`${input} cursor-not-allowed bg-slate-100 text-slate-500`}
          />
        </label>
        <div className="text-sm font-medium sm:col-span-2">
          Company logo
          <div className="mt-2 flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center">
            {form.company_logo_url && (
              <span className={`grid shrink-0 place-items-center overflow-hidden border bg-white ${
                form.company_logo_shape === "ROUND"
                  ? "h-20 w-20 rounded-full"
                  : "h-20 w-36 rounded-xl"
              }`}>
                <img
                  src={form.company_logo_url}
                  alt="Company logo"
                  className={`h-full w-full ${
                    form.company_logo_shape === "ROUND"
                      ? "object-cover"
                      : "object-contain p-1"
                  }`}
                />
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-3">
              <span className="flex items-center gap-2 rounded-xl border border-dashed p-3">
                <Upload className="h-5 w-5 shrink-0 text-slate-400" />
                <input
                  type="file"
                  accept="image/*"
                  className="min-w-0"
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      company_logo: event.target.files?.[0] || null,
                    }))
                  }
                />
              </span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["RECTANGLE", "Rectangle", "Best for wide company logos"],
                  ["ROUND", "Round", "Best for badges and icons"],
                ].map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        company_logo_shape: value,
                      }))
                    }
                    className={`rounded-xl border p-3 text-left transition ${
                      form.company_logo_shape === value
                        ? "border-blue-600 bg-blue-50 text-blue-900"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <b className="block text-sm">{label}</b>
                    <small className="mt-1 block text-xs opacity-70">{hint}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <label className="text-sm font-medium sm:col-span-2">
          Office address *
          <textarea
            required
            rows="3"
            name="office_address"
            value={form.office_address}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Service areas
          <input
            name="service_areas"
            value={form.service_areas}
            onChange={update}
            className={input}
          />
        </label>
        <div className="border-t pt-5 sm:col-span-2">
          <h2 className="font-bold">Contact and tax details</h2>
        </div>
        <label className="text-sm font-medium">
          Mobile *
          <input
            required
            name="mobile"
            value={form.mobile}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium">
          Email *
          <input
            required
            type="email"
            name="email"
            value={form.email}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium">
          GSTIN
          <input
            name="gst_number"
            maxLength="15"
            value={form.gst_number}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium">
          PAN number
          <input
            name="pan_number"
            maxLength="10"
            value={form.pan_number}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium">
          Years in business
          <input
            type="number"
            min="0"
            name="years_in_business"
            value={form.years_in_business}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium">
          Number of Paint Applicators
          <input
            type="number"
            min="0"
            name="number_of_painters"
            value={form.number_of_painters}
            onChange={update}
            className={input}
          />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Default area calculation unit
          <select name="default_measurement_unit" value={form.default_measurement_unit} onChange={update} className={input}>
            <option value="FEET">Feet (ft)</option>
            <option value="METRES">Metres (m)</option>
          </select>
          <span className="mt-1 block font-normal text-slate-500">New properties use this unit. Quotations remain in square feet.</span>
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          New password{" "}
          <span className="font-normal text-slate-400">
            (leave blank to keep current password)
          </span>
          <input
            type="password"
            minLength="8"
            name="password"
            value={form.password}
            onChange={update}
            className={input}
          />
        </label>
        <div className="flex justify-end border-t pt-5 sm:col-span-2">
          <button
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save contractor details"}
          </button>
        </div>
      </form>
    </div>
  );
}
function formatError(data) {
  if (!data) return "";
  return Object.entries(data)
    .map(
      ([key, value]) =>
        `${key}: ${Array.isArray(value) ? value.join(" ") : typeof value === "object" ? JSON.stringify(value) : value}`,
    )
    .join(" ");
}
