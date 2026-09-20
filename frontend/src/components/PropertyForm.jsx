import { useEffect, useState } from "react";
import { Building2, MapPin, Search, X } from "lucide-react";
import api from "../api/client";

const empty = { customer: "", property_type: "OTHER", measurement_type: "INTERIOR", measurement_unit: "FEET", name: "", flat_number: "", block_name: "", address: "", city: "", pincode: "", approximate_area: "" };
const types = ["1RK", "1BHK", "2BHK", "3BHK", "4BHK", "VILLA", "OFFICE", "COMMERCIAL", "INTERIOR", "EXTERIOR", "OTHER"];

export default function PropertyForm({ customers, initialValue, initialCustomer, onSubmit, onClose, saving }) {
  const [form, setForm] = useState(empty);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [apartmentSearch, setApartmentSearch] = useState("");
  const [apartmentMatches, setApartmentMatches] = useState([]);
  const [searchingApartments, setSearchingApartments] = useState(false);
  useEffect(() => { setForm(initialValue ? { ...empty, ...initialValue } : { ...empty, customer: initialCustomer || "" }); }, [initialValue, initialCustomer]);
  useEffect(() => {
    const ownerId = initialValue?.customer || initialCustomer;
    const owner = customers.find((customer) => String(customer.id) === String(ownerId || ""));
    setOwnerSearch(owner ? `${owner.name} · ${owner.mobile}` : "");
  }, [customers, initialValue, initialCustomer]);
  useEffect(() => { if (!initialValue) api.get("/accounts/contractor-profile/").then(({ data }) => setForm((value) => ({ ...value, measurement_unit: data.default_measurement_unit || "FEET" }))).catch(() => {}); }, [initialValue]);
  useEffect(() => {
    const query = apartmentSearch.trim();
    if (query.length < 2) {
      setApartmentMatches([]);
      return undefined;
    }
    let active = true;
    setSearchingApartments(true);
    const timer = window.setTimeout(() => {
      api.get("/quotations/apartment-communities/", { params: { q: query } })
        .then(({ data }) => {
          if (active) setApartmentMatches(data);
        })
        .catch(() => {
          if (active) setApartmentMatches([]);
        })
        .finally(() => {
          if (active) setSearchingApartments(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [apartmentSearch]);
  function selectApartment(apartment) {
    const location = [apartment.name, apartment.locality, apartment.zone]
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .join(", ");
    setForm((value) => ({
      ...value,
      name: apartment.name,
      address: location,
      city: "Bengaluru",
      pincode: apartment.pincode || "",
    }));
    setApartmentSearch(apartment.name);
    setApartmentMatches([]);
  }
  const update = (event) => setForm((value) => ({
    ...value,
    [event.target.name]: event.target.value,
    ...(
      event.target.name === "property_type" && ["INTERIOR", "EXTERIOR"].includes(event.target.value)
        ? { measurement_type: event.target.value }
        : {}
    ),
  }));
  const recentCustomers = [...customers]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 5);
  const ownerMatches = customers.filter((customer) => {
    const query = ownerSearch.trim().toLowerCase();
    return !query || [customer.name, customer.mobile, customer.bharath_id, customer.city]
      .some((value) => String(value || "").toLowerCase().includes(query));
  }).slice(0, 8);
  function selectOwner(customer) {
    setForm((value) => ({ ...value, customer: customer.id }));
    setOwnerSearch(`${customer.name} · ${customer.mobile}`);
    setOwnerOpen(false);
  }
  const input = "mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 outline-none focus:border-slate-900";
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"><div className="h-full w-full max-w-xl overflow-y-auto bg-white">
    <div className="flex items-center justify-between border-b p-6"><div><h2 className="text-xl font-bold">{initialValue ? "Edit property" : "Add property"}</h2><p className="text-sm text-slate-500">Property and location information</p></div><button onClick={onClose} className="p-2"><X /></button></div>
    <form onSubmit={(event) => { event.preventDefault(); if (!form.customer) { setOwnerOpen(true); return; } onSubmit({ ...form, customer: Number(form.customer), approximate_area: form.approximate_area || null }); }} className="grid gap-5 p-6 sm:grid-cols-2">
      <div className="relative sm:col-span-2">
        <label className="text-sm font-medium">Owner name *</label>
        <span className="relative mt-1.5 flex items-center">
          <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
          <input required disabled={Boolean(initialValue)} value={ownerSearch} onFocus={() => setOwnerOpen(true)} onChange={(event) => { setOwnerSearch(event.target.value); setForm((value) => ({ ...value, customer: "" })); setOwnerOpen(true); }} placeholder="Search name, mobile number or Customer ID" className={`${input} mt-0 pl-10 disabled:bg-slate-100`} />
        </span>
        {!initialValue && recentCustomers.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-400">Recent:</span>{recentCustomers.map((customer) => <button key={customer.id} type="button" onClick={() => selectOwner(customer)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-800">{customer.name} · {customer.mobile}</button>)}</div>}
        {!initialValue && ownerOpen && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">{ownerMatches.length ? ownerMatches.map((customer) => <button key={customer.id} type="button" onClick={() => selectOwner(customer)} className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-amber-50"><b className="block text-sm text-slate-950">{customer.name}</b><small className="text-slate-500">{[customer.bharath_id, customer.mobile, customer.city].filter(Boolean).join(" · ")}</small></button>) : <p className="px-3 py-4 text-sm text-slate-500">No matching customers found.</p>}</div>}
        {!initialValue && ownerSearch && !form.customer && <p className="mt-1 text-xs font-medium text-amber-700">Select a customer from the results or recent customers.</p>}
      </div>
      <div className="relative sm:col-span-2">
        <label className="text-sm font-medium">Apartment / gated community <span className="font-normal text-slate-400">(optional)</span>
          <span className="relative mt-1.5 flex items-center">
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
            <input value={apartmentSearch} onChange={(event) => setApartmentSearch(event.target.value)} placeholder="Search apartment name, locality or PIN code" className={`${input} mt-0 pl-10`} />
          </span>
        </label>
        {apartmentMatches.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
            {apartmentMatches.map((apartment) => (
              <button key={apartment.id} type="button" onClick={() => selectApartment(apartment)} className="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left hover:bg-amber-50">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100"><Building2 className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><b className="block text-sm text-slate-950">{apartment.name}</b><small className="mt-0.5 flex items-center gap-1 text-slate-500"><MapPin className="h-3 w-3" />{[apartment.locality, apartment.zone, apartment.pincode].filter(Boolean).join(" · ")}</small></span>
              </button>
            ))}
          </div>
        )}
        {searchingApartments && <p className="mt-1 text-xs text-slate-400">Searching apartment directory...</p>}
      </div>
      <label className="text-sm font-medium">Project name *<input required name="name" value={form.name} onChange={update} placeholder="e.g. Brigade Cassia" className={input} /></label>
      <label className="text-sm font-medium">Type<select name="property_type" value={form.property_type} onChange={update} className={input}>{types.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label className="text-sm font-medium">Area calculation type<select name="measurement_type" value={form.measurement_type} onChange={update} className={input}><option value="INTERIOR">Interior</option><option value="EXTERIOR">Exterior</option></select></label>
      <label className="text-sm font-medium">Area calculation input unit<select disabled={Boolean(initialValue?.has_measurements)} name="measurement_unit" value={form.measurement_unit} onChange={update} className={input}><option value="FEET">Feet (ft)</option><option value="METRES">Metres (m)</option></select>{initialValue?.has_measurements && <span className="mt-1 block text-xs font-normal text-amber-700">Locked because Area Calculations are saved.</span>}</label>
      <label className="text-sm font-medium">Flat number <span className="font-normal text-slate-400">(optional)</span><input name="flat_number" value={form.flat_number} onChange={update} placeholder="e.g. 1204" className={input} /></label>
      <label className="text-sm font-medium">Block / Tower <span className="font-normal text-slate-400">(optional)</span><input name="block_name" value={form.block_name} onChange={update} placeholder="e.g. Block B" className={input} /></label>
      <label className="text-sm font-medium sm:col-span-2">Project address *<textarea required name="address" value={form.address} onChange={update} rows="3" className={input} /></label>
      <label className="text-sm font-medium">City<input name="city" value={form.city} onChange={update} className={input} /></label><label className="text-sm font-medium">Pincode<input name="pincode" value={form.pincode} onChange={update} className={input} /></label>
      <div className="flex justify-end gap-3 border-t pt-5 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-xl border px-5 py-2.5 font-semibold">Cancel</button><button disabled={saving} className="rounded-xl bg-slate-950 px-5 py-2.5 font-semibold text-white disabled:opacity-60">{saving ? "Saving..." : "Save property"}</button></div>
    </form></div></div>;
}
