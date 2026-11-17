import { useEffect, useId, useRef, useState } from "react";
import { Building2, ContactRound, MapPin, X } from "lucide-react";
import api from "../api/client";
import { lockBodyScroll } from "../utils/bodyScrollLock";
import CustomerContactPicker from "./CustomerContactPicker";

const empty = { customer: "", property_type: "OTHER", measurement_type: "INTERIOR", measurement_unit: "FEET", name: "", flat_number: "", block_name: "", address: "", google_maps_url: "", city: "", pincode: "", approximate_area: "" };
const types = ["1RK", "1BHK", "2BHK", "3BHK", "4BHK", "VILLA", "OFFICE", "COMMERCIAL", "INTERIOR", "EXTERIOR", "OTHER"];
const optionalFields = ["google_maps_url", "property_type", "measurement_unit"];

function combinedUnitDetails(property) {
  return [property?.flat_number, property?.block_name].filter(Boolean).join(", ");
}

function unitDetailsPayload(value) {
  const separator = value.indexOf(",");
  let flat = separator < 0 ? value.trim() : value.slice(0, separator).trim();
  let block = separator < 0 ? "" : value.slice(separator + 1).trim();
  // A single longer block/tower name fits the existing block field.
  if (separator < 0 && flat.length > 50 && flat.length <= 100) { block = flat; flat = ""; }
  return { flat_number: flat, block_name: block,
    error: flat.length > 50 || block.length > 100 ? "Shorten the flat or block/tower details. Separate the flat and block/tower with a comma." : "" };
}

function propertyErrorMessage(error) {
  if (!error) return "";
  if (typeof error === "string") return error.trim().startsWith("<") ? "Property could not be saved. Please retry." : error;
  return Object.entries(error).flatMap(([field, messages]) => [messages].flat().filter(message => typeof message === "string")
    .map(message => ["detail", "non_field_errors"].includes(field) ? message : `${["flat_number", "block_name"].includes(field) ? "Flat / Block / Tower" : field.replaceAll("_", " ")}: ${message}`)).join(" ")
    || "Property could not be saved. Please check the details.";
}

export default function PropertyForm({ customers, initialValue, initialCustomer, onSubmit, onClose, saving, error, quotationTheme = false }) {
  const dialogRef = useRef(null);
  const findCustomerButton = useRef(null);
  const propertyNameInput = useRef(null);
  const unitDetailsInput = useRef(null);
  const unitDetailsEdited = useRef(false);
  const optionalDetails = useRef(null);
  const titleId = useId();
  const ownerId = useId();
  const apartmentListId = useId();
  const apartmentSearchVersion = useRef(0);
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const releaseScrollLock = lockBodyScroll();
    dialog.showModal();
    (findCustomerButton.current || propertyNameInput.current)?.focus();
    return () => {
      dialog.close();
      releaseScrollLock();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  const [form, setForm] = useState(() => initialValue ? { ...empty, ...initialValue } : { ...empty, customer: initialCustomer || "" });
  const [chosenOwner, setChosenOwner] = useState(null);
  const [showContacts, setShowContacts] = useState(false);
  const [ownerError, setOwnerError] = useState("");
  const [nameSearchOpen, setNameSearchOpen] = useState(false);
  const [activeApartment, setActiveApartment] = useState(-1);
  const [unitDetails, setUnitDetails] = useState(() => combinedUnitDetails(initialValue));
  const [selectedApartmentName, setSelectedApartmentName] = useState("");
  const [apartmentMatches, setApartmentMatches] = useState([]);
  const [searchingApartments, setSearchingApartments] = useState(false);
  const [apartmentSearchError, setApartmentSearchError] = useState("");
  const [apartmentSearchComplete, setApartmentSearchComplete] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState("");
  const [mapSuccess, setMapSuccess] = useState("");
  const lastLookupUrl = useRef("");
  const unitEdited = useRef(false);
  const errorMessage = propertyErrorMessage(error);
  useEffect(() => {
    const fields = error && typeof error === "object" ? Object.keys(error) : [];
    if (optionalFields.some(field => fields.includes(field) || (typeof error === "string" && error.toLowerCase().includes(field.replaceAll("_", " "))))) {
      if (optionalDetails.current) optionalDetails.current.open = true;
    }
  }, [error]);
  useEffect(() => {
    setForm(initialValue ? { ...empty, ...initialValue } : { ...empty, customer: initialCustomer || "" });
    setChosenOwner(null); setOwnerError("");
  }, [initialValue, initialCustomer]);
  useEffect(() => {
    setUnitDetails(combinedUnitDetails(initialValue));
    unitDetailsEdited.current = false;
    unitDetailsInput.current?.setCustomValidity("");
  }, [initialValue, initialCustomer]);
  useEffect(() => {
    let active = true;
    if (!initialValue) api.get("/accounts/contractor-profile/").then(({ data }) => {
      if (active && !unitEdited.current) setForm(value => ({ ...value, measurement_unit: data.default_measurement_unit || "FEET" }));
    }).catch(() => {});
    return () => { active = false; };
  }, [initialValue]);
  useEffect(() => {
    const requestId = ++apartmentSearchVersion.current;
    const query = form.name.trim();
    if (!nameSearchOpen || query.length < 2 || query === selectedApartmentName) {
      setApartmentMatches([]);
      setSearchingApartments(false);
      setApartmentSearchError("");
      setApartmentSearchComplete(false);
      return undefined;
    }
    let active = true;
    setSearchingApartments(true);
    setApartmentSearchError("");
    setApartmentSearchComplete(false);
    const timer = window.setTimeout(() => {
      api.get("/quotations/apartment-communities/", { params: { q: query } })
        .then(({ data }) => {
          if (active && requestId === apartmentSearchVersion.current) {
            setApartmentMatches(Array.isArray(data) ? data : []);
            setApartmentSearchComplete(true);
          }
        })
        .catch(() => {
          if (active && requestId === apartmentSearchVersion.current) {
            setApartmentMatches([]);
            setApartmentSearchError("Apartment suggestions could not be loaded. You can still use the name you entered.");
          }
        })
        .finally(() => {
          if (active && requestId === apartmentSearchVersion.current) setSearchingApartments(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [form.name, nameSearchOpen, selectedApartmentName]);
  function selectApartment(apartment) {
    apartmentSearchVersion.current += 1;
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
    setSelectedApartmentName(apartment.name);
    setNameSearchOpen(false);
    setActiveApartment(-1);
    setApartmentMatches([]);
    setApartmentSearchComplete(false);
  }
  function changePropertyName(event) {
    apartmentSearchVersion.current += 1;
    setForm(value => ({ ...value, name: event.target.value }));
    setSelectedApartmentName(""); setActiveApartment(-1);
    setApartmentMatches([]); setApartmentSearchComplete(false);
    setNameSearchOpen(true);
  }
  function propertyNameKeyDown(event) {
    if (event.key === "Escape" && nameSearchOpen) {
      event.preventDefault(); event.stopPropagation();
      setNameSearchOpen(false); setActiveApartment(-1);
    } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      if (!nameSearchOpen) { setNameSearchOpen(true); return; }
      if (!apartmentMatches.length) return;
      event.preventDefault();
      const next = event.key === "ArrowDown" ? (activeApartment + 1) % apartmentMatches.length
        : (activeApartment < 0 ? apartmentMatches.length - 1 : (activeApartment - 1 + apartmentMatches.length) % apartmentMatches.length);
      setActiveApartment(next);
      window.requestAnimationFrame(() => document.getElementById(`${apartmentListId}-${next}`)?.scrollIntoView({ block: "nearest" }));
    } else if (event.key === "Enter" && nameSearchOpen && apartmentMatches[activeApartment]) {
      event.preventDefault(); selectApartment(apartmentMatches[activeApartment]);
    }
  }
  function submit(event) {
    event.preventDefault();
    if (saving) return;
    if (!form.customer) { setOwnerError("Choose a recent customer or use Find customer."); findCustomerButton.current?.focus(); return; }
    const unit = unitDetailsEdited.current ? unitDetailsPayload(unitDetails) : { flat_number: form.flat_number, block_name: form.block_name };
    if (unit.error) {
      unitDetailsInput.current?.setCustomValidity(unit.error);
      unitDetailsInput.current?.reportValidity();
      return;
    }
    onSubmit({ ...form, flat_number: unit.flat_number, block_name: unit.block_name,
      customer: Number(form.customer), approximate_area: form.approximate_area || null });
  }
  async function fetchMapAddress(url = form.google_maps_url.trim(), force = false) {
    if (!url || (!force && lastLookupUrl.current === url)) return;
    lastLookupUrl.current = url;
    setMapLoading(true);
    setMapError("");
    setMapSuccess("");
    try {
      const { data } = await api.post("/accounts/profile-card/projects/map-lookup/", { url });
      setForm((value) => value.google_maps_url.trim() === url ? ({
        ...value,
        name: value.name || data.apartment_community || "",
        address: data.address || value.address,
        city: data.city || value.city,
        pincode: data.pincode || value.pincode,
      }) : value);
      setMapSuccess("Location found. Check the details, then save the property.");
    } catch (error) {
      setMapError(Object.values(error.response?.data || {}).flat().join(" ") || "Could not find this place. You can enter the address manually.");
    } finally {
      setMapLoading(false);
    }
  }
  const update = (event) => {
    if (event.target.name === "measurement_unit") unitEdited.current = true;
    setForm((value) => ({
    ...value,
    [event.target.name]: event.target.value,
    ...(
      event.target.name === "property_type" && ["INTERIOR", "EXTERIOR"].includes(event.target.value)
        ? { measurement_type: event.target.value }
        : {}
    ),
    }));
  };
  const recentCustomers = [...customers]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 2);
  function selectOwner(customer) {
    if (customer.connection_status !== "CONNECTED" || customer.account_status === "DISABLED") {
      throw new Error("This customer is unavailable for this property. Choose another saved contact.");
    }
    setForm((value) => ({ ...value, customer: customer.id }));
    setChosenOwner(customer); setOwnerError("");
    window.requestAnimationFrame(() => propertyNameInput.current?.focus());
  }
  const selectedOwner = String(chosenOwner?.id) === String(form.customer) ? chosenOwner
    : customers.find(customer => String(customer.id) === String(form.customer));
  function changeOwner() {
    setForm(value => ({ ...value, customer: "" }));
    setChosenOwner(null); setOwnerError("");
    window.requestAnimationFrame(() => findCustomerButton.current?.focus());
  }
  function containFocus(event) {
    if (event.key !== "Tab") return;
    const controls = [...dialogRef.current.querySelectorAll('a[href], button:enabled, input:enabled:not([type="hidden"]), select:enabled, textarea:enabled, summary, [tabindex="0"]')]
      .filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  const input = `mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 outline-none ${quotationTheme ? "focus:border-[#176b9b]" : "focus:border-slate-900"}`;
  return <><dialog ref={dialogRef} aria-labelledby={titleId} onKeyDown={containFocus} onCancel={(event) => { event.preventDefault(); onClose(); }} className={`${quotationTheme ? "bp-quotation-property-dialog bp-quotation-dialog " : ""}fixed inset-0 m-0 ml-auto h-[100dvh] max-h-none w-full max-w-xl overflow-hidden border-0 bg-white p-0 text-slate-950 backdrop:bg-slate-950/40`}>
    <div className="flex h-full min-h-0 flex-col">
    <div className="flex shrink-0 items-center justify-between gap-3 border-b p-5 sm:p-6"><div><h2 id={titleId} className="text-xl font-bold bp-ui-section-heading">{initialValue ? "Edit property" : "Add property"}</h2><p className="text-sm text-slate-500">Start with the property name and address.</p></div><button type="button" aria-label="Close property form" onClick={onClose} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bp-ui-icon-action"><X aria-hidden="true" /></button></div>
    <form onSubmit={submit} onInvalidCapture={event => { const details = event.target.closest("details"); if (details) details.open = true; }} className="flex min-h-0 flex-1 flex-col" aria-busy={Boolean(saving)}>
    <fieldset disabled={saving} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain border-0 p-5 sm:p-6"><div className="grid gap-5 sm:grid-cols-2">
      {errorMessage && <p role="alert" className="break-words rounded-xl bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{errorMessage}</p>}
      {form.customer ? <div className="flex items-start justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50 p-4 sm:col-span-2">
        <div className="min-w-0"><p className="text-xs font-semibold text-slate-500">Customer</p><p className="mt-1 break-words font-semibold">{selectedOwner?.name || initialValue?.customer_name || "Selected customer"}</p>{selectedOwner?.mobile && <p className="mt-1 break-words text-sm text-slate-600">{selectedOwner.mobile}</p>}</div>
        {!initialValue && !initialCustomer && <button type="button" onClick={changeOwner} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-violet-700 bp-ui-action">Change</button>}
      </div> : <section className="space-y-3 sm:col-span-2" aria-labelledby={ownerId}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 id={ownerId} className="text-sm font-semibold">Customer *</h3>
          <button ref={findCustomerButton} type="button" onClick={() => setShowContacts(true)} className="bp-button bp-button-secondary bp-button-md"><ContactRound size={17} aria-hidden="true" />Find customer</button>
        </div>
        {ownerError && <p role="alert" className="text-sm text-red-700">{ownerError}</p>}
        {recentCustomers.length > 0 ? <><p className="text-xs font-medium text-slate-500">Recent customers</p><ul className="grid list-none gap-2 p-0 sm:grid-cols-2" aria-label="Recent customers">
          {recentCustomers.map(customer => {
            const unavailable = customer.connection_status !== "CONNECTED" || customer.account_status === "DISABLED";
            return <li key={customer.id}><button type="button" disabled={unavailable} onClick={() => selectOwner(customer)}
              aria-label={`Use ${customer.name}${customer.mobile ? `, ${customer.mobile}` : ""}`}
              className="h-full min-h-11 w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-violet-300 hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:bg-slate-50">
              <span className="block break-words text-sm font-semibold">{customer.name}</span><span className="mt-1 block break-words text-xs text-slate-500">{customer.mobile}</span>
              {unavailable && <span className="mt-1 block text-xs text-slate-500">Unavailable</span>}
            </button></li>;
          })}
        </ul></> : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No recent customers. Use Find customer to choose a saved contact.</p>}
      </section>}
      <div className="relative sm:col-span-2">
        <label className="text-sm font-medium">Property/project name *<input ref={propertyNameInput} required maxLength={150} name="name" value={form.name}
          onChange={changePropertyName} onFocus={() => setNameSearchOpen(true)} onBlur={() => { apartmentSearchVersion.current += 1; setNameSearchOpen(false); setActiveApartment(-1); }}
          onKeyDown={propertyNameKeyDown} autoComplete="off" role="combobox" aria-autocomplete="list"
          aria-expanded={nameSearchOpen && apartmentMatches.length > 0} aria-controls={apartmentListId}
          aria-activedescendant={nameSearchOpen && apartmentMatches[activeApartment] ? `${apartmentListId}-${activeApartment}` : undefined}
          placeholder="Type a property name or search apartments" className={(input) + " bp-ui-control"} /></label>
        {nameSearchOpen && apartmentMatches.length > 0 && <div id={apartmentListId} role="listbox" aria-label="Apartment suggestions" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {apartmentMatches.map((apartment, index) => <button key={apartment.id} id={`${apartmentListId}-${index}`} role="option" aria-selected={index === activeApartment}
            tabIndex={-1} type="button" onMouseDown={event => event.preventDefault()} onClick={() => selectApartment(apartment)}
            className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left hover:bg-violet-50 ${index === activeApartment ? "bg-violet-50" : ""}`}>
            <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-violet-500" aria-hidden="true" />
            <span className="min-w-0"><b className="block break-words text-sm">{apartment.name}</b><small className="mt-1 block break-words text-slate-500">{[apartment.locality, apartment.zone, apartment.pincode].filter(Boolean).join(", ")}</small></span>
          </button>)}
        </div>}
        {nameSearchOpen && searchingApartments && <p role="status" className="mt-1 text-xs text-slate-500">Finding apartment suggestions...</p>}
        {nameSearchOpen && !searchingApartments && apartmentSearchError && <p role="status" className="mt-1 text-xs text-slate-500">{apartmentSearchError}</p>}
        {nameSearchOpen && !searchingApartments && !apartmentSearchError && apartmentSearchComplete && !apartmentMatches.length && <p className="mt-1 text-xs text-slate-500">No apartment suggestions. You can use this property name.</p>}
      </div>
      <label className="text-sm font-medium sm:col-span-2">Flat / Block / Tower <span className="font-normal text-slate-400">(optional)</span><input ref={unitDetailsInput} name="unit_details" value={unitDetails} maxLength={152}
        onChange={event => { unitDetailsEdited.current = true; setUnitDetails(event.target.value); event.target.setCustomValidity(unitDetailsPayload(event.target.value).error); }}
        placeholder="e.g. Flat 1204, Block B" className={(input) + " bp-ui-control"} /></label>
      <label className="text-sm font-medium sm:col-span-2">Address *<textarea required name="address" value={form.address} onChange={update} rows="3" className={(input) + " bp-ui-control"} /></label>
      <label className="text-sm font-medium">City<input name="city" value={form.city} onChange={update} className={(input) + " bp-ui-control"} /></label>
      <label className="text-sm font-medium">Pincode<input name="pincode" value={form.pincode} onChange={update} className={(input) + " bp-ui-control"} /></label>
      <details ref={optionalDetails} className="min-w-0 rounded-xl border border-slate-200 sm:col-span-2">
      <summary className="min-h-11 cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">More details <span className="font-normal text-slate-500">{"\u2014 optional"}</span></summary>
      <div className="grid gap-5 border-t p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="text-sm font-medium">Google Maps place or pin link <span className="font-normal text-slate-400">(optional)</span>
          <span className="relative mt-1.5 flex items-center">
            <MapPin className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#4285f4]" />
            <input type="url" name="google_maps_url" value={form.google_maps_url || ""} onChange={update} onPaste={(event) => { const pasted = event.clipboardData.getData("text").trim(); if (pasted) fetchMapAddress(pasted); }} onBlur={() => fetchMapAddress()} placeholder="Paste a Google Maps place or dropped pin link" className={(`${input} mt-0 pl-10 bp-control-leading-icon`) + " bp-ui-control"} />
          </span>
        </label>
        <div className="mt-2 flex items-center gap-2">
          <a href="https://www.google.com/maps/" target="_blank" rel="noreferrer" aria-label="Drop a pin in Google Maps" title="Drop a pin in Google Maps" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border text-[#4285f4] hover:bg-blue-50 bp-ui-icon-action"><MapPin className="h-5 w-5" /></a>
          <button type="button" disabled={!form.google_maps_url.trim() || mapLoading} onClick={() => fetchMapAddress(form.google_maps_url.trim(), true)} className="h-10 rounded-lg border bg-white px-4 text-sm font-semibold disabled:opacity-50 bp-ui-action">{mapLoading ? "Searching..." : "Search"}</button>
        </div>
        {mapError && <p role="alert" className="mt-2 text-xs text-red-700">{mapError}</p>}
        {mapSuccess && <p role="status" className="mt-2 text-xs text-emerald-700">{mapSuccess}</p>}
      </div>
      <label className="text-sm font-medium">Type<select name="property_type" value={form.property_type} onChange={update} className={(input) + " bp-ui-control"}>{types.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label className="text-sm font-medium">Area calculation input unit<select disabled={Boolean(initialValue?.has_measurements)} name="measurement_unit" value={form.measurement_unit} onChange={update} className={(input) + " bp-ui-control"}><option value="FEET">Feet (ft)</option><option value="METRES">Metres (m)</option></select>{initialValue?.has_measurements && <span className="mt-1 block text-xs font-normal text-amber-700">Locked because Area Calculations are saved.</span>}</label>
      </div></details>
    </div></fieldset>
      <div className="flex shrink-0 justify-end gap-3 border-t bg-white p-5 sm:px-6"><button type="button" onClick={onClose} className="min-h-11 rounded-xl border px-5 py-2.5 font-semibold bp-ui-action">Cancel</button><button disabled={saving || !form.customer} className={(`min-h-11 rounded-xl px-5 py-2.5 font-semibold text-white disabled:opacity-60 ${quotationTheme ? "bg-[#176b9b]" : "bg-slate-950"}`) + " bp-ui-action"}>{saving ? "Saving..." : "Save property"}</button></div>
    </form></div></dialog>
    {showContacts && <CustomerContactPicker selectionContext="property" onClose={() => setShowContacts(false)} onSelect={selectOwner} />}
    </>;
}
