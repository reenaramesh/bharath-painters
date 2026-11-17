import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ContactRound, LoaderCircle, Plus, Search } from "lucide-react";
import api from "../api/client";
import ContractorDialog from "./ContractorDialog";
import { Button } from "./ui";
import "./customer-contact-picker.css";

function unavailableReason(customer) {
  if (customer.account_status === "DISABLED") return "Disabled account";
  if (customer.connection_status === "CONNECTED") return "";
  return ({ BLOCKED: "Blocked", DISCONNECTED: "Disconnected", REJECTED: "Disconnected",
    PENDING: "Pending relationship", RECONNECT_PENDING: "Pending relationship" })[customer.connection_status] || "Unavailable";
}

export default function CustomerContactPicker({ onClose, onSelect, onAddCustomer, selectionContext = "lead" }) {
  const [contacts, setContacts] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [opening, setOpening] = useState(null);
  const version = useRef(0);
  const selecting = useRef(false);

  const load = useCallback(async () => {
    const requestId = ++version.current;
    setLoading(true); setError(""); setSelectionError("");
    try {
      const { data } = await api.get("/quotations/customers/", { params: { include_saved: 1, include_pending: 1 } });
      if (requestId === version.current) setContacts(Array.isArray(data) ? data : data.results || []);
    } catch {
      if (requestId === version.current) setError("Contacts could not be loaded.");
    } finally {
      if (requestId === version.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    return () => { version.current += 1; };
  }, [load]);

  const filtered = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    const digits = text.replace(/\D/g, "");
    const phoneQuery = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
    const isPhone = /^[+\d\s()-]+$/.test(text);
    return contacts.filter(customer => !text || customer.name?.toLocaleLowerCase().includes(text)
      || customer.mobile?.toLocaleLowerCase().includes(text)
      || (isPhone && phoneQuery && String(customer.mobile || "").replace(/\D/g, "").includes(phoneQuery)));
  }, [contacts, query]);

  async function choose(customer) {
    if (selecting.current || unavailableReason(customer)) return;
    selecting.current = true;
    const requestId = ++version.current;
    setOpening(customer.id); setSelectionError("");
    try {
      // Refresh the selected record: it may have been restricted since listing.
      const { data } = await api.get(`/quotations/customers/${customer.id}/`);
      if (requestId !== version.current) return;
      if (unavailableReason(data)) throw new Error(`This customer is unavailable for this ${selectionContext}. Choose another saved contact.`);
      await onSelect(data);
      if (requestId === version.current) onClose();
    } catch (failure) {
      if (requestId === version.current) setSelectionError(failure.response
        ? "This customer could not be selected. Retry or choose another saved contact."
        : failure.message || "This customer could not be selected. Please retry.");
    } finally {
      selecting.current = false;
      if (requestId === version.current) setOpening(null);
    }
  }

  return <ContractorDialog title="Find customer" description="Choose from your saved contacts. Search by name or phone." size="md" onClose={onClose}>
    <div className="customer-contact-picker space-y-4" aria-busy={loading || opening !== null}>
      <label className="block">
        <span className="mb-2 flex items-center gap-2 text-sm font-semibold"><Search size={16} aria-hidden="true" />Search saved contacts</span>
        <input type="search" aria-label="Search saved contacts" autoComplete="off" value={query}
          onChange={event => setQuery(event.target.value)} disabled={loading || opening !== null}
          placeholder="Name or phone number" className="w-full min-h-11 rounded-xl border px-3 py-3 text-sm bp-ui-control" />
      </label>
      {selectionError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{selectionError}</p>}
      {loading ? <p role="status" className="flex items-center gap-2 py-6 text-sm text-slate-500"><LoaderCircle size={18} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Loading contacts...</p>
        : error ? <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><Button variant="secondary" onClick={load}>Retry contacts</Button></div>
        : <>
          <p role="status" aria-live="polite" className="text-sm text-slate-500">{filtered.length} saved {filtered.length === 1 ? "contact" : "contacts"}</p>
          {filtered.length ? <ul className="customer-contact-picker-list" aria-label="Saved customer contacts">
            {filtered.map(customer => {
              const restriction = unavailableReason(customer);
              return <li key={customer.id}><button type="button" aria-label={`Use ${customer.name || "customer"}${customer.mobile ? `, ${customer.mobile}` : ""}`}
                disabled={Boolean(restriction) || opening !== null} onClick={() => choose(customer)} className="customer-contact-choice">
                <span className="customer-contact-avatar" aria-hidden="true"><ContactRound size={20} /></span>
                <span className="min-w-0 flex-1 text-left"><span className="block break-words font-semibold">{customer.name || "Customer"}</span>
                  <span className="mt-1 block break-words text-sm text-slate-500">{customer.mobile}</span>
                  {restriction && <span className="mt-2 block text-xs font-semibold text-slate-600">{restriction}{" \u00b7 "}Unavailable for this {selectionContext}</span>}
                </span>
                {opening === customer.id ? <LoaderCircle size={18} className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ChevronRight size={18} className="shrink-0" aria-hidden="true" />}
              </button></li>;
            })}
          </ul> : <div className="rounded-xl border border-dashed p-6 text-center">
            <ContactRound size={28} className="mx-auto mb-3 text-violet-500" aria-hidden="true" />
            <p className="font-semibold">{contacts.length ? "No contacts match your search." : "No saved customers yet."}</p>
            <p className="mt-2 text-sm text-slate-500">{contacts.length ? "Try another name or phone number." : onAddCustomer ? "Add a customer to continue." : "Save a customer in Contacts, then return to choose them."}</p>
            {contacts.length > 0 && <Button className="mt-3" variant="secondary" onClick={() => setQuery("")}>Clear search</Button>}
          </div>}
        </>}
      {opening !== null && <p role="status" className="text-sm text-slate-500">Opening customer...</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        {onAddCustomer && <Button variant="quiet" onClick={onAddCustomer} disabled={opening !== null}><Plus size={16} aria-hidden="true" />Add customer</Button>}
      </div>
    </div>
  </ContractorDialog>;
}
