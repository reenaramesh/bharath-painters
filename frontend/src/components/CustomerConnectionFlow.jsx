import { QuotationLineItemPopup } from "./QuotationLineItemPopup.jsx";
import { Button } from "./ui";
import { useEffect, useId, useRef, useState } from "react";
import { Phone, Sparkles, Star, UserRound } from "lucide-react";
import ContractorDialog from './ContractorDialog';
import api from "../api/client";

export default function CustomerConnectionFlow({ onClose, onNewCustomer, onExistingCustomer, quotationTheme = false, existingActionLabel, requireConnected = quotationTheme }) {
  const formId = useId();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const requestVersion = useRef(0);
  const nameInput = useRef(null);
  useEffect(() => () => { requestVersion.current += 1; }, []);
  useEffect(() => {
    if (result?.state === "NEW") nameInput.current?.focus();
  }, [result]);

  function changeMobile(value) {
    requestVersion.current += 1;
    setMobile(value);
    setResult(null);
    setName("");
    setError("");
    setBusy("");
  }

  function getErrorMessage(data) {
    if (typeof data === "string") {
      return "Customer could not be saved due to a server error. Please try again shortly.";
    }
    if (data?.detail || data?.message) return data.detail || data.message;
    const messages = Object.values(data || {}).flatMap((value) =>
      Array.isArray(value) ? value : [value],
    ).filter((value) => typeof value === "string" && value.trim());
    return messages.join(" ") || "Customer could not be saved. Please try again.";
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || result?.state === "UNAVAILABLE") return;
    const version = ++requestVersion.current;
    setError("");
    setBusy(result?.state === "FOUND" ? "opening" : result?.state === "NEW" ? "saving" : "searching");
    try {
      if (!result) {
        const { data } = await api.post("/quotations/customers/lookup-contact/", { mobile: mobile.trim() });
        if (version === requestVersion.current) setResult(data);
      } else if (result.state === "FOUND") {
        if (requireConnected && !result.can_use) return;
        await onExistingCustomer(result.customer);
        if (version === requestVersion.current) onClose();
      } else if (name.trim()) {
        const data = await onNewCustomer({ name: name.trim(), mobile: result.normalized_mobile, only_if_new_contact: true });
        if (version !== requestVersion.current) return;
        if (data.already_saved || data.connection_status !== "CONNECTED") {
          setResult({ state: "FOUND", normalized_mobile: result.normalized_mobile, customer: data, can_use: data.connection_status === "CONNECTED" });
        } else onClose();
      } else setError("Enter the customer's name.");
    } catch (requestError) {
      if (version !== requestVersion.current) return;
      const data = requestError.response?.data;
      setError(requestError.message && !data ? requestError.message : getErrorMessage(data));
    } finally { if (version === requestVersion.current) setBusy(""); }
  }

  const disabled = Boolean(busy) || result?.state === "UNAVAILABLE" || (requireConnected && result?.state === "FOUND" && !result.can_use);
  const actionLabel = busy ? { searching: "Searching...", saving: "Saving...", opening: "Opening..." }[busy]
    : result?.state === "FOUND" ? (existingActionLabel || (quotationTheme ? "Use this customer" : "Open customer"))
    : result?.state === "NEW" ? "Save customer" : "Search";
  const description = "Search your contacts by mobile number to continue.";
  const lookupResult = result && <div role="status" aria-atomic="true" className={result.state === "NEW" ? "flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950" : "rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800"}>
          {result.state === "NEW" ? <>
            <span aria-hidden="true" className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-white text-violet-600">
              <Sparkles focusable="false" className="h-7 w-7" />
              <Star focusable="false" className="absolute -right-1 top-0 h-3 w-3 fill-amber-300 text-amber-500" />
              <Star focusable="false" className="absolute -left-1 bottom-0 h-2.5 w-2.5 fill-amber-300 text-amber-500" />
            </span>
            <p className="min-w-0 font-semibold">New client!</p>
          </> : <p className="font-semibold">{result.state === "FOUND" ? "Customer already exists in your contacts" : result.message}</p>}
          {result.state === "FOUND" && <div className="mt-2 space-y-1">
            <p className="break-words font-semibold">{result.customer.name}</p>
            <p>{result.customer.mobile}</p>
            {!result.can_use && <p>This contact is {String(result.customer.connection_status).toLowerCase().replaceAll("_", " ")}. Quotation selection is unavailable.</p>}
          </div>}
        </div>;
  const customerForm = (
      <form id={formId} onSubmit={submit} aria-busy={Boolean(busy)} className={quotationTheme ? "space-y-4" : "min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5"}>
        {result?.state === "NEW" && lookupResult}
        <label className={quotationTheme ? 'block' : 'people-form-field'}><span className="mb-2 block text-sm font-semibold">Mobile number *</span><span className="flex items-center gap-2 rounded-xl border px-3 py-3"><Phone aria-hidden="true" className="h-5 w-5 text-slate-400" /><input autoFocus required type="tel" inputMode="tel" autoComplete="tel" disabled={busy === "saving" || busy === "opening"} aria-label="Mobile number" value={mobile} onChange={event => changeMobile(event.target.value)} placeholder="Mobile number" className="w-full outline-none bp-ui-control" /></span></label>
        {result?.state !== "NEW" && lookupResult}
        {result?.state === "NEW" && <label className={quotationTheme ? 'block' : 'people-form-field'}><span className="mb-2 block text-sm font-semibold">Customer name *</span><span className="flex items-center gap-2 rounded-xl border px-3 py-3"><UserRound aria-hidden="true" className="h-5 w-5 text-slate-400" /><input ref={nameInput} required disabled={Boolean(busy)} aria-label="Customer name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Customer name" className="w-full outline-none bp-ui-control" /></span></label>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!quotationTheme && <button disabled={disabled} className="bp-ui-action w-full rounded-xl bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-60">{actionLabel}</button>}
      </form>);
  if (quotationTheme) return <QuotationLineItemPopup popupProtection={null} titleText="Add customer" description={description} onClose={onClose} footer={<div className="grid w-full grid-cols-2 gap-3"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button form={formId} type="submit" disabled={disabled}>{actionLabel}</Button></div>}>{customerForm}</QuotationLineItemPopup>;
  return <ContractorDialog title="Add customer" description={description} onClose={onClose}>{customerForm}</ContractorDialog>;
}
