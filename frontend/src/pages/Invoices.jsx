import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Pencil, Plus, ReceiptText, Search, Trash2, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import { previewPdf } from "../components/PdfPreview";

const money = (v) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    Number(v || 0),
  );
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const last7Days = () => { const today = new Date(); const start = new Date(today); start.setDate(today.getDate() - 6); return { from: dateKey(start), to: dateKey(today) }; };
const blankLine = {
  category: "",
  service: "",
  room: "",
  line_type: "SERVICE_MATERIAL",
  coats: 1,
  product_type: "",
  description: "",
  brand: "",
  hsn_sac: "",
  unit: "",
  quantity: 1,
  rate: "",
};
const newLumpSumInvoice = () => ({
  customer: "", property: "", tax_mode: "NON_GST", invoice_date: dateKey(new Date()), due_date: "",
  gst_percentage: 0, discount: 0, notes: "", terms_conditions: "",
  items: [],
});
const blankAdjustment = { surface: "WALL", action: "ADD", name: "", height: "", length: "", width: "", quantity: 1, rate: "" };
const adjustmentArea = (row) => {
  const first = Number(row.surface === "WALL" ? row.height : row.length) || 0;
  const second = Number(row.surface === "WALL" ? row.length : row.width) || 0;
  return first * second * (Number(row.quantity) || 1);
};
const adjustmentAmount = (row) => adjustmentArea(row) * (Number(row.rate) || 0);
export default function Invoices() {
  const initialDates = last7Days();
  const [items, setItems] = useState([]),
    [customers, setCustomers] = useState([]),
    [properties, setProperties] = useState([]),
    [search, setSearch] = useState(""),
    [datePreset, setDatePreset] = useState("LAST_7"),
    [dateFrom, setDateFrom] = useState(initialDates.from),
    [dateTo, setDateTo] = useState(initialDates.to),
    [editing, setEditing] = useState(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [paymentSaving, setPaymentSaving] = useState(false),
    [paymentDraft, setPaymentDraft] = useState({ received_date: dateKey(new Date()), amount: "", payment_mode: "", payment_reference: "", notes: "" });
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState(newLumpSumInvoice);
  const [createSaving, setCreateSaving] = useState(false);
  const [createLineEditor, setCreateLineEditor] = useState(null);
  const [invoiceRooms, setInvoiceRooms] = useState([]);
  const [invoiceMasters, setInvoiceMasters] = useState({ categories: [], services: [], products: [], descriptions: [], brands: [], units: [] });
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("details");
  useEffect(() => { setTab("details"); }, [editing?.id]);
  const load = useCallback(async () => {
    try {
      const [{ data }, customerResponse, propertyResponse] = await Promise.all([
        api.get("/quotations/invoices/"), api.get("/quotations/customers/"), api.get("/quotations/properties/"),
      ]);
      setItems(data);
      setCustomers(Array.isArray(customerResponse.data) ? customerResponse.data : customerResponse.data.results || []);
      setProperties(Array.isArray(propertyResponse.data) ? propertyResponse.data : propertyResponse.data.results || []);
      const wanted = params.get("invoice");
      if (wanted) {
        const found = data.find((x) => String(x.id) === wanted);
        if (found) setEditing({ ...found, base_items: found.base_items || found.items || [], measurement_adjustments: found.measurement_adjustments || [] });
      }
      setError("");
    } catch {
      setError("Invoices could not be loaded.");
    }
  }, [params]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    Promise.all([
      api.get("/quotations/service-categories/"),
      api.get("/quotations/service-types/"),
      api.get("/quotations/paint-types/"),
      api.get("/quotations/work-descriptions/"),
      api.get("/quotations/brands/"),
      api.get("/quotations/units/"),
    ]).then((responses) => {
      const list = (response) => Array.isArray(response.data) ? response.data : response.data.results || [];
      const [categories, services, products, descriptions, brands, units] = responses.map(list);
      setInvoiceMasters({ categories, services, products, descriptions, brands, units });
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!createDraft.property) { setInvoiceRooms([]); return; }
    api.get(`/quotations/properties/${createDraft.property}/rooms/`)
      .then(({ data }) => setInvoiceRooms(Array.isArray(data) ? data : data.results || []))
      .catch(() => setInvoiceRooms([]));
  }, [createDraft.property]);
  const visible = useMemo(
    () => items.filter((x) => {
      const invoiceDate = String(x.invoice_date || "");
      const matchesDate = datePreset === "ALL" || (dateFrom && dateTo && invoiceDate >= dateFrom && invoiceDate <= dateTo);
      return matchesDate && [x.invoice_number, x.quotation_number, x.customer_name, x.property_name, x.status].some((v) => String(v || "").toLowerCase().includes(search.toLowerCase()));
    }),
    [items, search, datePreset, dateFrom, dateTo],
  );
  function chooseDatePreset(value) { const today=new Date(); setDatePreset(value); if(value==="ALL"){setDateFrom("");setDateTo("");} if(value==="TODAY"){const date=dateKey(today);setDateFrom(date);setDateTo(date);} if(value==="LAST_7"){const start=new Date(today);start.setDate(today.getDate()-6);setDateFrom(dateKey(start));setDateTo(dateKey(today));} if(value==="THIS_MONTH"){setDateFrom(dateKey(new Date(today.getFullYear(),today.getMonth(),1)));setDateTo(dateKey(today));} }
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.patch(
        `/quotations/invoices/${editing.id}/`,
        editing,
      );
      setEditing(data);
      setItems((list) => list.map((x) => (x.id === data.id ? data : x)));
      setError("");
    } catch (err) {
      setError(
        Object.values(err.response?.data || {})
          .flat()
          .join(" ") || "Invoice could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function createInvoice(event) {
    event.preventDefault();
    if (!createDraft.items.length) { setError("Add at least one invoice service."); return; }
    setCreateSaving(true); setError("");
    try {
      const payload = { ...createDraft, base_items: createDraft.items, gst_percentage: createDraft.tax_mode === "GST" ? createDraft.gst_percentage || 18 : 0 };
      const { data } = await api.post("/quotations/invoices/", payload);
      setItems((current) => [data, ...current]); setCreating(false); setCreateDraft(newLumpSumInvoice());
      setEditing({ ...data, base_items: data.base_items || data.items || [], measurement_adjustments: [] });
      try {
        const response = await api.get(`/quotations/invoices/${data.id}/pdf/`, { responseType: "blob" });
        previewPdf(response.data, `${data.invoice_number}.pdf`);
      } catch {
        setError("Invoice was created, but its PDF preview could not be opened.");
      }
    } catch (requestError) {
      setError(Object.values(requestError.response?.data || {}).flat().join(" ") || "Lump-sum invoice could not be created.");
    } finally { setCreateSaving(false); }
  }
  function openCreateLine(index = null) {
    setCreateLineEditor({ index, draft: index === null ? { ...blankLine } : { ...createDraft.items[index] } });
  }
  function saveCreateLine(row) {
    setCreateDraft((current) => ({
      ...current,
      items: createLineEditor.index === null
        ? [...current.items, row]
        : current.items.map((item, index) => index === createLineEditor.index ? row : item),
    }));
    setCreateLineEditor(null);
  }
  async function download() {
    try {
      const response = await api.get(
        `/quotations/invoices/${editing.id}/pdf/`,
        { responseType: "blob" },
      );
      previewPdf(response.data, `${editing.invoice_number}.pdf`);
    } catch {
      setError("Invoice PDF could not be previewed.");
    }
  }
  async function downloadReceipt(invoice) {
    try {
      const response = await api.get(`/quotations/invoices/${invoice.id}/receipt/`, { responseType: "blob" });
      previewPdf(
        response.data,
        `${invoice.receipt_number || invoice.invoice_number}-receipt.pdf`,
      );
    } catch {
      setError("Payment receipt could not be previewed.");
    }
  }
  async function cancelInvoice() {
    try {
      const { data } = await api.patch(`/quotations/invoices/${editing.id}/`, { status: "CANCELLED" });
      setEditing(data);
      setItems((list) => list.map((item) => item.id === data.id ? data : item));
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Invoice could not be cancelled.");
    }
  }
  async function savePayment() {
    setPaymentSaving(true);
    try {
      const { data } = await api.post(`/quotations/invoices/${editing.id}/payments/`, paymentDraft);
      setEditing(data);
      setItems((list) => list.map((item) => item.id === data.id ? data : item));
      setPaymentDraft({ received_date: dateKey(new Date()), amount: "", payment_mode: "", payment_reference: "", notes: "" });
      setError("");
    } catch (err) {
      setError(Object.values(err.response?.data || {}).flat().join(" ") || "Payment could not be recorded.");
    } finally {
      setPaymentSaving(false);
    }
  }
  async function deletePayment(paymentId) {
    if (!window.confirm("Delete this payment entry?")) return;
    try {
      const { data } = await api.delete(`/quotations/invoices/${editing.id}/payments/${paymentId}/`);
      setEditing(data);
      setItems((list) => list.map((item) => item.id === data.id ? data : item));
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Payment entry could not be deleted.");
    }
  }
  function line(i, k, v) {
    setEditing((x) => ({
      ...x,
      base_items: x.base_items.map((r, n) => (n === i ? { ...r, [k]: v } : r)),
    }));
  }
  function adjustment(i, key, value) {
    setEditing((current) => ({ ...current, measurement_adjustments: current.measurement_adjustments.map((row, index) => index === i ? { ...row, [key]: value, ...(key === "surface" ? { height: "", length: "", width: "" } : {}) } : row) }));
  }
  function close() {
    setEditing(null);
    setParams({});
  }
  const previewTotals = calculateInvoicePreview(editing);
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold text-amber-600">Customer billing</p><h1 className="mt-1 text-3xl font-bold">Invoices</h1><p className="mt-2 text-slate-500">Create final quotation invoices or direct lump-sum invoices.</p></div>
        <button type="button" onClick={() => { setCreateDraft(newLumpSumInvoice()); setCreating(true); setError(""); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white"><Plus className="h-4 w-4" />New lump-sum invoice</button>
      </header>
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}
      <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="flex flex-col gap-3 border-b p-3">
          <div className="flex flex-col gap-2 md:flex-row">
          <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
            <Search className="h-4 w-4" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice, quotation, customer or property"
              className="w-full bg-transparent outline-none"
            />
          </label>
          <select value={datePreset} onChange={(e)=>chooseDatePreset(e.target.value)} className="rounded-xl border px-4 py-2.5 text-sm"><option value="ALL">All dates</option><option value="TODAY">Today</option><option value="LAST_7">Last 7 days</option><option value="THIS_MONTH">This month</option><option value="CUSTOM">Custom dates</option></select>
          </div>
          {datePreset === "CUSTOM" && <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><label className="text-xs font-semibold text-slate-500">From<input type="date" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)} className="ml-2 rounded-lg border px-3 py-2 text-sm font-normal text-slate-900" /></label><label className="text-xs font-semibold text-slate-500">To<input type="date" value={dateTo} onChange={(e)=>setDateTo(e.target.value)} className="ml-2 rounded-lg border px-3 py-2 text-sm font-normal text-slate-900" /></label></div>}
        </div>
        <div className="grid gap-3 p-3 md:hidden">
          {visible.map((invoice) => (
            <article
              key={invoice.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-bold text-slate-950">
                      {invoice.invoice_number}
                    </h2>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      From {invoice.quotation_number} · {invoice.invoice_date}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${invoice.status === "PAID" ? "bg-emerald-50 text-emerald-700" : invoice.status === "CANCELLED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                    {invoice.status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-4 rounded-xl bg-slate-50 p-3">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {invoice.customer_name}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {invoice.property_name || "Property not specified"}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-3 divide-x rounded-xl border border-slate-200 py-3 text-center">
                  <InvoiceAmount label="Total" value={invoice.grand_total} />
                  <InvoiceAmount label="Paid" value={invoice.amount_paid} paid />
                  <InvoiceAmount label="Due" value={invoice.balance_due} due />
                </div>
              </div>
              <div className="flex gap-2 border-t border-slate-100 p-3">
                <button
                  type="button"
                  onClick={() => setEditing({ ...invoice, base_items: invoice.base_items || invoice.items || [], measurement_adjustments: invoice.measurement_adjustments || [] })}
                  className="h-11 flex-1 rounded-xl bg-slate-950 px-3 text-sm font-bold text-white"
                >
                  {invoice.can_edit ? "View / Edit" : "View invoice"}
                </button>
                {invoice.status !== "CANCELLED" && Number(invoice.amount_paid) > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadReceipt(invoice)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-800"
                  >
                    <ReceiptText className="h-4 w-4" />
                    Receipt
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block" data-mobile-table="keep">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {[
                  "Invoice",
                  "Customer / property",
                  "Date",
                  "Status",
                  "Total",
                  "Paid",
                  "Balance",
                  "Action",
                ].map((x) => (
                  <th key={x} className="p-4">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((x) => (
                <tr key={x.id}>
                  <td className="p-4">
                    <b>{x.invoice_number}</b>
                    <small className="block text-slate-500">
                      From {x.quotation_number}
                    </small>
                  </td>
                  <td className="p-4">
                    <b>{x.customer_name}</b>
                    <small className="block text-slate-500">
                      {x.property_name}
                    </small>
                  </td>
                  <td className="p-4">{x.invoice_date}</td>
                  <td className="p-4">{x.status.replaceAll("_", " ")}</td>
                  <td className="p-4 font-bold">{money(x.grand_total)}</td>
                  <td className="p-4">{money(x.amount_paid)}</td>
                  <td className="p-4 font-bold text-amber-700">
                    {money(x.balance_due)}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <button onClick={() => setEditing({ ...x, base_items: x.base_items || x.items || [], measurement_adjustments: x.measurement_adjustments || [] })} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white">{x.can_edit ? "View / Edit" : "View"}</button>
                      {x.status !== "CANCELLED" && Number(x.amount_paid) > 0 && <button onClick={() => downloadReceipt(x)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><ReceiptText className="h-4 w-4" />Receipt</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <p className="p-12 text-center text-slate-400">
            No invoices found. Convert a completed quotation or create a lump-sum invoice.
          </p>
        )}
      </section>
      {creating && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 p-3 sm:p-6">
          <form onSubmit={createInvoice} className="mx-auto flex max-h-[94vh] max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b p-5"><div><p className="text-sm font-bold text-amber-600">Direct billing</p><h2 className="text-2xl font-extrabold">New lump-sum invoice</h2><p className="mt-1 text-sm text-slate-500">No quotation is required.</p></div><button type="button" onClick={() => setCreating(false)} className="rounded-xl p-2 hover:bg-slate-100"><X /></button></div>
            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <section className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-100 p-2">{[['NON_GST','Without GST'],['GST','With GST']].map(([value, label]) => <button key={value} type="button" onClick={() => setCreateDraft((current) => ({ ...current, tax_mode: value, gst_percentage: value === 'GST' ? (current.gst_percentage || 18) : 0 }))} className={`rounded-xl px-4 py-3 text-sm font-bold ${createDraft.tax_mode === value ? 'bg-slate-950 text-white shadow' : 'text-slate-600'}`}>{label}</button>)}</section>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Customer"><select required value={createDraft.customer} onChange={(e) => setCreateDraft({ ...createDraft, customer: e.target.value, property: '' })}><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} - {customer.bharath_id || 'Create ID first'}</option>)}</select></Field>
                <Field label="Property (optional)"><select value={createDraft.property} onChange={(e) => setCreateDraft({ ...createDraft, property: e.target.value })}><option value="">No property</option>{properties.filter((property) => String(property.customer) === String(createDraft.customer)).map((property) => <option key={property.id} value={property.id}>{property.name || property.property_type}</option>)}</select></Field>
                <Field label="Invoice date"><input required type="date" value={createDraft.invoice_date} onChange={(e) => setCreateDraft({ ...createDraft, invoice_date: e.target.value })} /></Field><Field label="Due date"><input type="date" value={createDraft.due_date} onChange={(e) => setCreateDraft({ ...createDraft, due_date: e.target.value })} /></Field>
              </div>
              <section className="overflow-hidden rounded-2xl border"><div className="flex items-center justify-between gap-3 border-b bg-slate-50 p-4"><h3 className="font-bold">Invoice services</h3><button type="button" onClick={() => openCreateLine()} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white"><Plus className="h-4 w-4" />Add service</button></div>
                <div className="space-y-3 p-4">{createDraft.items.map((row, index) => <div key={index} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-amber-600">Service {index + 1}{row.category ? ` / ${row.category}` : ''}</p><h4 className="mt-1 truncate font-bold text-slate-950">{row.service}</h4><p className="mt-1 text-sm text-slate-500">{[row.room, row.product_type, row.brand].filter(Boolean).join(' / ') || row.description}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => openCreateLine(index)} className="rounded-xl border p-2.5 text-slate-700"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => setCreateDraft((current) => ({ ...current, items: current.items.filter((_, position) => position !== index) }))} className="rounded-xl border border-red-200 p-2.5 text-red-600"><Trash2 className="h-4 w-4" /></button></div></div><div className="mt-3 grid grid-cols-4 gap-2 rounded-xl bg-slate-50 p-3 text-sm"><span><small className="block text-slate-500">HSN/SAC</small><b>{row.hsn_sac || "-"}</b></span><span><small className="block text-slate-500">MOU</small><b>{row.unit}</b></span><span><small className="block text-slate-500">Quantity</small><b>{row.quantity}</b></span><span className="text-right"><small className="block text-slate-500">Amount</small><b>{money(Number(row.quantity || 0) * Number(row.rate || 0))}</b></span></div></div>)}{!createDraft.items.length && <button type="button" onClick={() => openCreateLine()} className="w-full rounded-2xl border-2 border-dashed border-slate-200 px-4 py-8 text-sm font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-800">+ Add the first invoice service</button>}</div>
              </section>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Discount"><input type="number" min="0" step="0.01" value={createDraft.discount} onChange={(e) => setCreateDraft({ ...createDraft, discount: e.target.value })} /></Field>{createDraft.tax_mode === 'GST' && <Field label="GST %"><input required type="number" min="0" step="0.01" value={createDraft.gst_percentage} onChange={(e) => setCreateDraft({ ...createDraft, gst_percentage: e.target.value })} /></Field>}<Field label="Notes"><textarea rows="2" value={createDraft.notes} onChange={(e) => setCreateDraft({ ...createDraft, notes: e.target.value })} /></Field><Field label="Terms"><textarea rows="2" value={createDraft.terms_conditions} onChange={(e) => setCreateDraft({ ...createDraft, terms_conditions: e.target.value })} /></Field></div>
            </div>
            <div className="flex items-center justify-between gap-4 bg-slate-950 p-4 text-white"><div><p className="text-xs text-slate-300">Estimated total</p><b className="text-xl">{money(calculateCreateTotal(createDraft))}</b></div><button disabled={createSaving} className="rounded-xl bg-white px-5 py-3 font-bold text-slate-950 disabled:opacity-50">{createSaving ? 'Creating...' : `Create ${createDraft.tax_mode === 'GST' ? 'GST' : 'non-GST'} invoice`}</button></div>
          </form>
          {createLineEditor && <InvoiceServiceDialog editor={createLineEditor} setEditor={setCreateLineEditor} masters={invoiceMasters} rooms={invoiceRooms} onSave={saveCreateLine} onClose={() => setCreateLineEditor(null)} />}
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 p-3 sm:p-6">
          <form
            onSubmit={save}
            className="mx-auto flex max-h-[94vh] max-w-7xl flex-col rounded-2xl bg-white"
          >
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <p className="text-sm text-amber-600">{editing.invoice_number}</p>
                <h2 className="text-2xl font-bold">{editing.can_edit ? "Edit invoice" : "Invoice details"}</h2>
              </div>
              <button type="button" onClick={close} className="rounded-lg p-2 hover:bg-slate-100"><X /></button>
            </div>
            <div className="flex flex-wrap gap-2 border-b px-5 py-3">
              {[["details", "Details"], ["items", "Line items & adjustments"], ["payments", "Payments"]].map(([key, label]) => (
                <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === key ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {label}{key === "payments" && ` (${(editing.payments || []).length})`}
                </button>
              ))}
            </div>
            {error && <p className="mx-5 mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="flex-1 overflow-y-auto p-5">
            {!editing.can_edit && tab !== "payments" && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Invoice-content editing has closed. Switch to the Payments tab to record payments on any day.</div>}
            <div className={tab === "payments" ? "" : "hidden"}>
            <section className="overflow-hidden rounded-xl border border-emerald-200">
              <div className="bg-emerald-50 p-4">
                <h3 className="font-bold text-emerald-950">Record payment received</h3>
                <p className="mt-1 text-sm text-emerald-800">Add every payment separately with its actual received date and mode.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <Field label="Received date"><input type="date" max={dateKey(new Date())} value={paymentDraft.received_date} onChange={(e) => setPaymentDraft({ ...paymentDraft, received_date: e.target.value })} /></Field>
                  <Field label="Amount"><input type="number" min="0.01" step="0.01" value={paymentDraft.amount} onChange={(e) => setPaymentDraft({ ...paymentDraft, amount: e.target.value })} /></Field>
                  <Field label="Payment mode"><select value={paymentDraft.payment_mode} onChange={(e) => setPaymentDraft({ ...paymentDraft, payment_mode: e.target.value })}><option value="">Select mode</option><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option></select></Field>
                  <Field label="Reference"><input value={paymentDraft.payment_reference} onChange={(e) => setPaymentDraft({ ...paymentDraft, payment_reference: e.target.value })} placeholder="Transaction / cheque no." /></Field>
                  <div className="flex items-end"><button type="button" disabled={paymentSaving || editing.status === "CANCELLED"} onClick={savePayment} className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{paymentSaving ? "Recording..." : "Add payment"}</button></div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Mode</th><th className="p-3">Reference</th><th className="p-3 text-right">Amount</th><th className="p-3"></th></tr></thead>
                  <tbody className="divide-y">{(editing.payments || []).map((payment) => <tr key={payment.id}><td className="p-3">{payment.received_date}</td><td className="p-3">{String(payment.payment_mode).replaceAll("_", " ")}</td><td className="p-3">{payment.payment_reference || "—"}</td><td className="p-3 text-right font-bold">{money(payment.amount)}</td><td className="p-3 text-right"><button type="button" onClick={() => deletePayment(payment.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Delete payment"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody>
                  <tfoot className="border-t-2 bg-slate-50"><tr><td colSpan="3" className="p-3 text-right font-bold">Total received</td><td className="p-3 text-right font-extrabold text-emerald-700">{money(editing.amount_paid)}</td><td className="p-3"></td></tr><tr><td colSpan="3" className="p-3 text-right font-bold">Balance</td><td className="p-3 text-right font-extrabold text-amber-700">{money(editing.balance_due)}</td><td className="p-3"></td></tr></tfoot>
                </table>
                {!(editing.payments || []).length && <p className="p-5 text-center text-sm text-slate-500">No payments recorded yet.</p>}
              </div>
            </section>
            </div>
            <fieldset disabled={!editing.can_edit} className={!editing.can_edit ? "opacity-75" : ""}>
            <div className={tab === "details" ? "" : "hidden"}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Invoice date">
                <input
                  type="date"
                  value={editing.invoice_date}
                  onChange={(e) =>
                    setEditing({ ...editing, invoice_date: e.target.value })
                  }
                />
              </Field>
              <Field label="Due date">
                <input
                  type="date"
                  value={editing.due_date || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, due_date: e.target.value })
                  }
                />
              </Field>
              <Field label="Status">
                <select
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({ ...editing, status: e.target.value })
                  }
                >
                  {["ISSUED", "PART_PAID", "PAID", "CANCELLED"].map(
                    (x) => (
                      <option key={x}>{x}</option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Customer">
                <input
                  value={editing.customer_name}
                  onChange={(e) =>
                    setEditing({ ...editing, customer_name: e.target.value })
                  }
                />
              </Field>
              <Field label="Mobile">
                <input
                  value={editing.customer_mobile}
                  onChange={(e) =>
                    setEditing({ ...editing, customer_mobile: e.target.value })
                  }
                />
              </Field>
              <Field label="Property">
                <input
                  value={editing.property_name}
                  onChange={(e) =>
                    setEditing({ ...editing, property_name: e.target.value })
                  }
                />
              </Field>
              <Field label="Billing address">
                <input
                  value={editing.billing_address}
                  onChange={(e) =>
                    setEditing({ ...editing, billing_address: e.target.value })
                  }
                />
              </Field>
            </div>
            </div>
            <div className={tab === "items" ? "" : "hidden"}>
            <section className="mt-2 overflow-hidden rounded-xl border">
              <div className="flex flex-col gap-3 border-b bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><h3 className="font-bold">Final area adjustments</h3><p className="mt-1 text-sm text-slate-500">Add or remove wall and ceiling areas before the final invoice. Saved property Area Calculations are not changed.</p></div>
                <button type="button" onClick={() => setEditing((current) => ({ ...current, measurement_adjustments: [...current.measurement_adjustments, { ...blankAdjustment, id: `new-${Date.now()}` }] }))} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Add area adjustment</button>
              </div>
              <div className="divide-y">
                {editing.measurement_adjustments.map((row, index) => <div key={row.id || index} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[120px_120px_1fr_110px_110px_80px_110px_120px_130px_44px] lg:items-end">
                  <Field label="Surface"><select value={row.surface} onChange={(e) => adjustment(index, "surface", e.target.value)}><option value="WALL">Wall</option><option value="CEILING">Ceiling</option></select></Field>
                  <Field label="Action"><select value={row.action} onChange={(e) => adjustment(index, "action", e.target.value)}><option value="ADD">Add</option><option value="REMOVE">Remove</option></select></Field>
                  <Field label="Name"><input value={row.name || ""} onChange={(e) => adjustment(index, "name", e.target.value)} placeholder={row.surface === "WALL" ? "Wall 5" : "Ceiling 2"} /></Field>
                  {row.surface === "WALL" ? <><Field label="Height"><input required type="number" min="0.01" step="0.01" value={row.height} onChange={(e) => adjustment(index, "height", e.target.value)} /></Field><Field label="Length"><input required type="number" min="0.01" step="0.01" value={row.length} onChange={(e) => adjustment(index, "length", e.target.value)} /></Field></> : <><Field label="Length"><input required type="number" min="0.01" step="0.01" value={row.length} onChange={(e) => adjustment(index, "length", e.target.value)} /></Field><Field label="Width"><input required type="number" min="0.01" step="0.01" value={row.width} onChange={(e) => adjustment(index, "width", e.target.value)} /></Field></>}
                  <Field label="Qty"><input required type="number" min="1" step="1" value={row.quantity || 1} onChange={(e) => adjustment(index, "quantity", e.target.value)} /></Field>
                  <Field label="Rate / sq ft"><input required type="number" min="0" step="0.01" value={row.rate ?? ""} onChange={(e) => adjustment(index, "rate", e.target.value)} placeholder="Enter rate" /></Field>
                  <div className={`rounded-xl p-2.5 text-sm font-bold ${row.action === "REMOVE" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}><span className="block text-[10px] uppercase">Area</span>{row.action === "REMOVE" ? "−" : "+"}{adjustmentArea(row).toFixed(0)} sq ft</div>
                  <div className={`rounded-xl p-2.5 text-sm font-bold ${row.action === "REMOVE" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}><span className="block text-[10px] uppercase">Amount</span>{row.action === "REMOVE" ? "−" : "+"}{money(adjustmentAmount(row))}</div>
                  <button type="button" aria-label="Delete adjustment" onClick={() => setEditing((current) => ({ ...current, measurement_adjustments: current.measurement_adjustments.filter((_, position) => position !== index) }))} className="rounded-lg p-2.5 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>)}
                {!editing.measurement_adjustments.length && <p className="p-6 text-center text-sm text-slate-500">No final area changes. Add a line only when wall or ceiling area changed at the site.</p>}
              </div>
              {!!editing.measurement_adjustments.length && <div className="flex flex-wrap justify-end gap-4 border-t bg-slate-50 px-4 py-3 text-sm"><AdjustmentTotal label="Net wall change" rows={editing.measurement_adjustments} surface="WALL" /><AdjustmentTotal label="Net ceiling change" rows={editing.measurement_adjustments} surface="CEILING" /></div>}
            </section>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold">Invoice line items</h3>
                <p className="text-sm text-slate-500">Edit existing lines or add any extra service before saving.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing((x) => ({ ...x, base_items: [...x.base_items, { ...blankLine }] }))}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                Add line
              </button>
            </div>
            <div className="mt-3 overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[1250px] text-xs">
                <thead className="bg-slate-100">
                  <tr>
                    {[
                      "Type of service",
                      "Room / Area",
                      "Product type",
                      "Description",
                      "Brand",
                      "HSN/SAC",
                      "MOU",
                      "Qty",
                      "Rate",
                      "Amount",
                      "",
                    ].map((x) => (
                      <th key={x} className="p-2 text-left">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {editing.base_items.map((r, i) => (
                    <tr key={i} className="border-t">
                      {[
                        "service",
                        "room",
                        "product_type",
                        "description",
                        "brand",
                        "hsn_sac",
                        "unit",
                      ].map((k) => (
                        <td key={k} className="p-2">
                          <input
                            value={r[k] || ""}
                            onChange={(e) => line(i, k, e.target.value)}
                            className="w-full rounded border p-2"
                          />
                        </td>
                      ))}
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={r.quantity}
                          onChange={(e) => line(i, "quantity", e.target.value)}
                          className="w-20 rounded border p-2"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={r.rate}
                          onChange={(e) => line(i, "rate", e.target.value)}
                          className="w-24 rounded border p-2"
                        />
                      </td>
                      <td className="p-2 font-bold">
                        {money(Number(r.quantity) * Number(r.rate))}
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() =>
                            setEditing((x) => ({
                              ...x,
                              base_items: x.base_items.filter((_, n) => n !== i),
                            }))
                          }
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {groupMeasurementAdjustments(editing.measurement_adjustments).map((row) => {
                    const signedArea = row.area;
                    const amount = row.amount;
                    return (
                      <tr key={`adjustment-${row.surface}`} className={`border-t ${signedArea < 0 ? "bg-red-50" : "bg-emerald-50"}`}>
                        <td className="p-2 font-semibold">Painting</td>
                        <td className="p-2">Final adjustment</td>
                        <td className="p-2">{row.surface === "WALL" ? "Wall" : "Ceiling"}</td>
                        <td className="p-2"><span className="font-semibold">Net {row.surface === "WALL" ? "Wall" : "Ceiling"} Adjustment</span><small className="block text-slate-500">{row.count} area {row.count === 1 ? "entry" : "entries"} combined</small></td>
                        <td className="p-2">—</td>
                        <td className="p-2">Sq ft</td>
                        <td className={`p-2 font-bold ${signedArea < 0 ? "text-red-700" : "text-emerald-700"}`}>{signedArea > 0 ? "+" : ""}{signedArea.toFixed(0)}</td>
                        <td className="p-2">{money(row.rate)}</td>
                        <td className={`p-2 font-bold ${amount < 0 ? "text-red-700" : "text-emerald-700"}`}>{amount > 0 ? "+" : ""}{money(amount)}</td>
                        <td className="p-2 text-[11px] text-slate-500">Managed above</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 bg-slate-100">
                  <tr>
                    <td colSpan="6" className="p-3 text-right font-bold">Calculated invoice total</td>
                    <td className="p-3 font-bold">{previewTotals.netMeasurementArea >= 0 ? "+" : ""}{previewTotals.netMeasurementArea.toFixed(0)} sq ft change</td>
                    <td className="p-3"></td>
                    <td className="p-3 font-extrabold">{money(previewTotals.subtotal)}</td>
                    <td className="p-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            </div>
            <div className={tab === "details" ? "mt-5 grid gap-4 sm:grid-cols-2" : "hidden"}>
              <Field label="Discount">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editing.discount}
                  onChange={(e) =>
                    setEditing({ ...editing, discount: e.target.value })
                  }
                />
              </Field>
              <Field label="GST %">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editing.gst_percentage}
                  onChange={(e) =>
                    setEditing({ ...editing, gst_percentage: e.target.value })
                  }
                />
              </Field>
              <Field label="Notes">
                <textarea
                  rows="3"
                  value={editing.notes}
                  onChange={(e) =>
                    setEditing({ ...editing, notes: e.target.value })
                  }
                />
              </Field>
              <Field label="Terms and conditions">
                <textarea
                  rows="3"
                  value={editing.terms_conditions}
                  onChange={(e) =>
                    setEditing({ ...editing, terms_conditions: e.target.value })
                  }
                />
              </Field>
            </div>
            </fieldset>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-b-2xl bg-slate-950 p-4 text-white">
              <span>Subtotal {money(previewTotals.subtotal)}</span>
              <span>GST {money(previewTotals.gst)}</span>
              <span className="text-emerald-400">Paid {money(editing.amount_paid)}</span>
              <span className="text-amber-300">Balance {money(editing.balance_due)}</span>
              <b>Grand total {money(previewTotals.grandTotal)}</b>
              <button type="button" onClick={download} className="flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2.5 font-semibold"><Eye className="h-4 w-4" />View PDF</button>
              {editing.status !== "CANCELLED" && Number(editing.amount_paid) > 0 && <button type="button" onClick={() => downloadReceipt(editing)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold"><ReceiptText className="h-4 w-4" />Receipt</button>}
              {!editing.can_edit && !["PAID", "CANCELLED"].includes(editing.status) && <button type="button" onClick={cancelInvoice} className="rounded-lg border border-red-300 px-4 py-2.5 font-semibold text-red-200">Cancel invoice</button>}
              {editing.can_edit && <button
                disabled={saving}
                className="rounded-lg bg-white px-5 py-2.5 font-bold text-slate-950"
              >
                {saving ? "Saving..." : "Save invoice"}
              </button>}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <span className="mt-1.5 block [&>*]:w-full [&>*]:rounded-xl [&>*]:border [&>*]:p-2.5 [&>*]:font-normal">
        {children}
      </span>
    </label>
  );
}

function InvoiceServiceDialog({ editor, setEditor, masters, rooms, onSave, onClose }) {
  const row = editor.draft;
  const set = (key, value) => setEditor((current) => ({ ...current, draft: { ...current.draft, [key]: value } }));
  const category = masters.categories.find((item) => String(item.name).toLowerCase() === String(row.category).toLowerCase());
  const categoryId = Number(category?.id || 0);
  const services = masters.services.filter((item) => !categoryId || Number(item.category_master) === categoryId || String(item.category || '').toLowerCase() === String(row.category).toLowerCase());
  const products = masters.products.filter((item) => !categoryId || !item.service_category || Number(item.service_category) === categoryId);
  const descriptions = masters.descriptions.filter((item) => !categoryId || !item.service_category || Number(item.service_category) === categoryId);
  const paintingApplicable = String(row.category || '').toLowerCase().includes('paint');
  const valid = row.category.trim() && row.room.trim() && row.service.trim() && row.description.trim() && row.unit.trim() && Number(row.quantity) > 0 && row.rate !== '' && Number(row.rate) >= 0;
  const submit = () => { if (valid) onSave({ ...row, coats: paintingApplicable ? Number(row.coats || 1) : null, amount: Number(row.quantity) * Number(row.rate) }); };
  return <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/60 sm:items-center sm:justify-center sm:p-6">
    <div className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl">
      <div className="flex items-start justify-between border-b p-5"><div><p className="text-xs font-bold uppercase tracking-wide text-amber-600">Lump-sum invoice</p><h3 className="text-xl font-extrabold">{editor.index === null ? 'Add service' : 'Edit service'}</h3></div><button type="button" onClick={onClose} className="rounded-xl border p-2"><X className="h-5 w-5" /></button></div>
      <div className="grid flex-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
        <InvoiceSuggest label="Type of service" value={row.category} set={(value) => set('category', value)} options={masters.categories} placeholder="Search type of service" />
        <InvoiceSuggest label="Room / Area" value={row.room} set={(value) => set('room', value)} options={rooms} placeholder="Search or enter room" />
        <Field label="Service type"><select value={row.line_type} onChange={(event) => set('line_type', event.target.value)}><option value="SERVICE_MATERIAL">Service + Material</option><option value="SERVICE">Service only</option><option value="MATERIAL">Material only</option><option value="REPAIR">Repair</option></select></Field>
        <InvoiceSuggest label="Service" value={row.service} set={(value) => set('service', value)} options={services} placeholder="Search or enter service" />
        <InvoiceSuggest label="Product type" value={row.product_type} set={(value) => set('product_type', value)} options={products} placeholder="Search or enter product type" required={false} />
        <InvoiceSuggest label="Product description" value={row.description} set={(value) => set('description', value)} options={descriptions} placeholder="Search or enter description" />
        <InvoiceSuggest label="Brand" value={row.brand} set={(value) => set('brand', value)} options={masters.brands} placeholder="Search or enter brand" required={false} />
        <Field label="HSN/SAC"><input value={row.hsn_sac || ''} onChange={(event) => set('hsn_sac', event.target.value)} placeholder="Enter HSN or SAC code" /></Field>
        <InvoiceSuggest label="MOU" value={row.unit} set={(value) => set('unit', value)} options={masters.units} placeholder="Sq ft, Job, Nos..." />
        <Field label="No. of coats">{paintingApplicable ? <select value={row.coats || 1} onChange={(event) => set('coats', event.target.value)}>{[1, 2, 3, 4, 5, 6].map((coat) => <option key={coat} value={coat}>{coat}</option>)}</select> : <div className="bg-slate-100 text-slate-500">Not applicable</div>}</Field>
        <Field label="Quantity"><input required type="number" min="0.01" step="0.01" value={row.quantity} onChange={(event) => set('quantity', event.target.value)} /></Field>
        <Field label="Rate"><input required type="number" min="0" step="0.01" value={row.rate} onChange={(event) => set('rate', event.target.value)} /></Field>
        <div className="rounded-2xl bg-slate-950 p-4 text-white sm:col-span-2"><span className="text-sm text-slate-300">Total amount</span><b className="float-right text-lg">{money(Number(row.quantity || 0) * Number(row.rate || 0))}</b></div>
      </div>
      <div className="border-t p-4"><button type="button" onClick={submit} disabled={!valid} className="w-full rounded-xl bg-slate-950 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{editor.index === null ? 'Add service' : 'Save service'}</button></div>
    </div>
  </div>;
}

function InvoiceSuggest({ label, value, set, options, placeholder, required = true }) {
  const id = `invoice-${label.replace(/\W/g, '').toLowerCase()}`;
  return <label className="text-sm font-semibold">{label}<span className="mt-1.5 block"><input required={required} list={id} value={value || ''} onChange={(event) => set(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border p-2.5 font-normal" /><datalist id={id}>{options.map((item) => <option key={item.id ?? item.name} value={item.name} />)}</datalist></span></label>;
}

function InvoiceAmount({ label, value, paid, due }) {
  return (
    <div className="min-w-0 px-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={`mt-1 truncate text-xs font-bold ${paid ? "text-emerald-700" : due ? "text-amber-700" : "text-slate-900"}`}>
        {money(value)}
      </p>
    </div>
  );
}
function groupMeasurementAdjustments(rows = []) {
  return ["WALL", "CEILING"].map((surface) => {
    const matching = rows.filter((row) => row.surface === surface);
    const area = matching.reduce(
      (sum, row) => sum + adjustmentArea(row) * (row.action === "REMOVE" ? -1 : 1),
      0,
    );
    const amount = matching.reduce(
      (sum, row) => sum + adjustmentAmount(row) * (row.action === "REMOVE" ? -1 : 1),
      0,
    );
    return {
      surface,
      area,
      amount,
      rate: area ? Math.abs(amount / area) : 0,
      count: matching.length,
    };
  }).filter((row) => row.count > 0);
}
function calculateInvoicePreview(invoice) {
  if (!invoice) return { subtotal: 0, gst: 0, grandTotal: 0, netMeasurementArea: 0 };
  const baseSubtotal = (invoice.base_items || []).reduce(
    (sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.rate) || 0),
    0,
  );
  const adjustmentSubtotal = (invoice.measurement_adjustments || []).reduce(
    (sum, row) => sum + adjustmentAmount(row) * (row.action === "REMOVE" ? -1 : 1),
    0,
  );
  const netMeasurementArea = (invoice.measurement_adjustments || []).reduce(
    (sum, row) => sum + adjustmentArea(row) * (row.action === "REMOVE" ? -1 : 1),
    0,
  );
  const subtotal = baseSubtotal + adjustmentSubtotal;
  const taxable = Math.max(0, subtotal - (Number(invoice.discount) || 0));
  const gst = taxable * (Number(invoice.gst_percentage) || 0) / 100;
  return { subtotal, gst, grandTotal: taxable + gst, netMeasurementArea };
}
function calculateCreateTotal(invoice) {
  const subtotal = (invoice.items || []).reduce((sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.rate) || 0), 0);
  const taxable = Math.max(0, subtotal - (Number(invoice.discount) || 0));
  return taxable + (invoice.tax_mode === "GST" ? taxable * (Number(invoice.gst_percentage) || 0) / 100 : 0);
}
function AdjustmentTotal({ label, rows, surface }) {
  const value = rows.filter((row) => row.surface === surface).reduce((sum, row) => sum + adjustmentArea(row) * (row.action === "REMOVE" ? -1 : 1), 0);
  return <span><b>{label}:</b> {value >= 0 ? "+" : ""}{value.toFixed(0)} sq ft</span>;
}
