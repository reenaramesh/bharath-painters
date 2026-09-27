import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BedDouble,
  Boxes,
  FileText,
  Layers3,
  Pencil,
  Plus,
  Ruler,
  Search,
  Save,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";

const groups = [
  { key: "rooms", label: "Rooms / Areas", singular: "Room / Area", endpoint: "areas", icon: BedDouble },
  { key: "surfaces", label: "Measurement Surface Types", singular: "Surface Type", endpoint: "measurement-surface-types", icon: Ruler },
  { key: "categories", label: "Types of Service", singular: "Type of Service", endpoint: "service-categories", icon: Layers3 },
  { key: "products", label: "Product Types", singular: "Product Type", endpoint: "paint-types", icon: Boxes },
  { key: "descriptions", label: "Product Descriptions", singular: "Product Description", endpoint: "work-descriptions", icon: FileText },
  { key: "brands", label: "Brands", singular: "Brand", endpoint: "brands", icon: Tags },
  { key: "units", label: "Measurement Units", singular: "MOU", endpoint: "units", icon: Ruler },
];
const empty = { name: "", service_category: "", key_features: "", default_price: "" };

export default function MasterServices() {
  const { user } = useAuth();
  const [active, setActive] = useState(groups[0]);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [popupEditing, setPopupEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [current, cats] = await Promise.all([
        api.get(`/quotations/${active.endpoint}/`),
        api.get("/quotations/service-categories/"),
      ]);
      setItems(current.data.results || current.data);
      setCategories(cats.data.results || cats.data);
      setError("");
    } catch {
      setError(`${active.label} could not be loaded.`);
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    load();
    setEditing(null);
    setForm(empty);
    setSearch("");
    setCategoryFilter("ALL");
    setSelectedGroupId(null);
    setPopupEditing(null);
  }, [load]);

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((item) => [String(item.id), item.name])),
    [categories],
  );
  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) =>
      (!term || String(item.name || "").toLowerCase().includes(term)) &&
      (categoryFilter === "ALL" || String(item.service_category) === categoryFilter),
    );
  }, [items, search, categoryFilter]);
  const usesServiceCategory = ["products", "descriptions"].includes(active.key);
  const groupedItems = useMemo(() => {
    if (!usesServiceCategory) return [];
    const groupsByCategory = categories
      .map((category) => ({
        id: String(category.id),
        name: category.name,
        items: filteredItems.filter((item) => String(item.service_category) === String(category.id)),
      }))
      .filter((group) => group.items.length);
    const unassigned = filteredItems.filter((item) => !categoryMap[String(item.service_category)]);
    if (unassigned.length) groupsByCategory.push({ id: "unassigned", name: "Not assigned", items: unassigned });
    return groupsByCategory;
  }, [categories, categoryMap, filteredItems, usesServiceCategory]);
  const selectedGroup = groupedItems.find((group) => group.id === selectedGroupId) || null;
  const canManageItem = (item) => user?.role === "ADMIN" || Number(item.created_by) === Number(user?.id);
  const itemScopeLabel = (item) => {
    if (!item.created_by) return user?.role === "ADMIN" ? "Default for all contractors" : "Bharath Painters default";
    return Number(item.created_by) === Number(user?.id) ? "Your entry" : "Shared master";
  };

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { name: form.name.trim() };
      if (usesServiceCategory) payload.service_category = Number(form.service_category);
      if (active.key === "products") {
        payload.key_features = form.key_features.trim();
        payload.default_price = form.default_price === "" ? null : form.default_price;
      }
      if (editing) await api.patch(`/quotations/${active.endpoint}/${editing}/`, payload);
      else await api.post(`/quotations/${active.endpoint}/`, payload);
      setEditing(null);
      setForm({ ...empty, service_category: usesServiceCategory ? form.service_category : "" });
      await load();
    } catch (requestError) {
      setError(Object.values(requestError.response?.data || {}).flat().join(" ") || "Master entry could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item) {
    if (!window.confirm(`Remove ${item.name} from future selections? Existing quotations will not change.`)) return;
    try {
      await api.delete(`/quotations/${active.endpoint}/${item.id}/`);
      await load();
    } catch {
      setError("This entry could not be removed.");
    }
  }

  function edit(item) {
    setEditing(item.id);
    setForm({ name: item.name, service_category: item.service_category || "", key_features: item.key_features || "", default_price: item.default_price ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function savePopupEdit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: popupEditing.name.trim(),
        service_category: Number(popupEditing.service_category),
      };
      if (active.key === "products") {
        payload.key_features = (popupEditing.key_features || "").trim();
        payload.default_price = popupEditing.default_price === "" ? null : popupEditing.default_price;
      }
      await api.patch(`/quotations/${active.endpoint}/${popupEditing.id}/`, payload);
      setPopupEditing(null);
      await load();
    } catch (requestError) {
      setError(Object.values(requestError.response?.data || {}).flat().join(" ") || "Master entry could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  const ActiveIcon = active.icon;
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-amber-600">Quotation configuration</p>
        <h1 className="mt-1 text-3xl font-bold">Master Data</h1>
      </header>

      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      <label className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:hidden">
        <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Master Data section</span>
        <select value={active.key} onChange={(event) => setActive(groups.find((group) => group.key === event.target.value) || groups[0])} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 font-bold text-slate-950 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100">
          {groups.map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}
        </select>
      </label>

      <nav className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Master data sections">
        {groups.map((group) => {
          const Icon = group.icon;
          const selected = active.key === group.key;
          return (
            <button key={group.key} type="button" onClick={() => setActive(group)} className={`hidden min-h-[74px] items-start gap-3 rounded-2xl border p-4 text-left transition sm:flex ${selected ? "border-slate-950 bg-slate-950 text-white shadow-lg" : "border-slate-200 bg-white hover:border-violet-300 hover:shadow-sm"}`}>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${selected ? "bg-white/15 text-amber-300" : "bg-violet-50 text-violet-700"}`}><Icon className="h-5 w-5" /></span>
              <span className="min-w-0"><b className="block">{group.label}</b></span>
            </button>
          );
        })}
        {user?.role === "CONTRACTOR" && <QuotationDefaults />}
      </nav>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <header className="flex items-center gap-3 border-b bg-slate-50 p-4 sm:p-5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white"><ActiveIcon className="h-5 w-5" /></span>
          <div><h2 className="text-lg font-bold">{editing ? `Edit ${active.singular}` : `Add ${active.singular}`}</h2></div>
        </header>
        <form onSubmit={submit} className={`grid gap-4 p-4 sm:p-5 ${usesServiceCategory ? "md:grid-cols-[1fr_1fr_auto]" : "md:grid-cols-[1fr_auto]"}`}>
          <Field label={`${active.singular} name`}><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={placeholder(active.key)} /></Field>
          {usesServiceCategory && <Field label="Type of Service"><select required value={form.service_category} onChange={(event) => setForm({ ...form, service_category: event.target.value })}><option value="">Select type of service</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>}
          <div className="flex items-end gap-2"><button disabled={saving} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 font-semibold text-white disabled:opacity-50 md:flex-none"><Plus className="h-4 w-4" />{saving ? "Saving..." : editing ? "Update" : `Add ${active.singular}`}</button>{editing && <button type="button" onClick={() => { setEditing(null); setForm(empty); }} className="grid h-12 w-12 place-items-center rounded-xl border" aria-label="Cancel editing"><X className="h-4 w-4" /></button>}</div>
          {active.key === "products" && <div className="grid gap-4 md:col-span-full md:grid-cols-[220px_1fr]"><Field label="Default price (optional)"><input type="number" min="0" step="0.01" value={form.default_price} onChange={(event) => setForm({ ...form, default_price: event.target.value })} placeholder="Example: 28.00" /></Field><Field label="Key features (optional)"><textarea rows="3" value={form.key_features} onChange={(event) => setForm({ ...form, key_features: event.target.value })} placeholder="Example: Stain resistance, smooth finish, 8-year warranty" /></Field></div>}
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <header className="flex flex-col gap-4 border-b p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-2"><h2 className="text-lg font-bold">Saved {active.label}</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{filteredItems.length} entries</span></div>
          <div className={`grid gap-2 ${usesServiceCategory ? "sm:grid-cols-[280px_220px]" : "sm:w-80"}`}>
            <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${active.label.toLowerCase()}`} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
            {usesServiceCategory && <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-xl border bg-white px-3 py-2.5 text-sm"><option value="ALL">All service types</option>{categories.map((category) => <option key={category.id} value={String(category.id)}>{category.name}</option>)}</select>}
          </div>
        </header>

        {loading ? <p className="p-12 text-center text-sm text-slate-500">Loading {active.label.toLowerCase()}...</p> : <>
          {usesServiceCategory ? (
            <div className="grid gap-3 bg-slate-50/60 p-3 sm:grid-cols-2 sm:gap-4 sm:p-4 xl:grid-cols-3">
              {groupedItems.map((group) => (
                <button key={group.id} type="button" onClick={() => setSelectedGroupId(group.id)} className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md sm:min-h-36 sm:flex-col sm:items-stretch sm:justify-between sm:p-5 sm:hover:-translate-y-0.5">
                  <span className="flex shrink-0 items-start justify-between gap-3 sm:w-full">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-100"><ActiveIcon className="h-5 w-5" /></span>
                    <span className="hidden rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white sm:inline">{group.items.length}</span>
                  </span>
                  <span className="min-w-0 flex-1 sm:mt-5"><b className="block truncate text-base text-slate-950 sm:text-lg">{group.name}</b><small className="mt-1 block font-semibold text-violet-700">{group.items.length} {active.label.toLowerCase()}</small></span>
                  <span className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white sm:hidden">View</span>
                </button>
              ))}
            </div>
          ) : <>
          <div className="grid gap-3 p-3 md:hidden">
            {filteredItems.map((item) => <MasterCard key={item.id} item={item} category={categoryMap[String(item.service_category)]} owned={canManageItem(item)} scope={itemScopeLabel(item)} edit={() => edit(item)} remove={() => remove(item)} />)}
          </div>
          <div className="hidden md:block">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="w-16 px-5 py-3">#</th><th className="px-5 py-3">{active.singular}</th>{usesServiceCategory && <th className="w-[34%] px-5 py-3">Type of Service</th>}<th className="w-32 px-5 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y">{filteredItems.map((item, index) => { const owned = canManageItem(item); return <tr key={item.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-bold text-slate-400">{index + 1}</td><td className="px-5 py-4"><span className="font-semibold text-slate-950">{item.name}</span><span className="mt-1 block text-xs font-semibold text-violet-600">{itemScopeLabel(item)}</span></td>{usesServiceCategory && <td className="px-5 py-4"><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">{categoryMap[String(item.service_category)] || "Not assigned"}</span></td>}<td className="px-5 py-4"><div className="flex justify-end gap-2">{owned ? <><button type="button" onClick={() => edit(item)} className="rounded-lg border p-2 hover:bg-white" aria-label={`Edit ${item.name}`}><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => remove(item)} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" aria-label={`Remove ${item.name} from future selections`}><Trash2 className="h-4 w-4" /></button></> : <span className="text-xs text-slate-400">{itemScopeLabel(item)}</span>}</div></td></tr>; })}</tbody>
            </table>
          </div></>}
          {!filteredItems.length && <p className="p-12 text-center text-sm text-slate-500">No {active.label.toLowerCase()} found.</p>}
        </>}
      </section>

      {selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="master-group-title" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSelectedGroupId(null); setPopupEditing(null); } }}>
          <section className="flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-3xl">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 p-5 sm:p-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700"><ActiveIcon className="h-5 w-5" /></span>
                <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-violet-700">Type of Service</p><h2 id="master-group-title" className="truncate text-xl font-bold text-slate-950">{selectedGroup.name}</h2><p className="mt-1 text-sm text-slate-500">{selectedGroup.items.length} {active.label.toLowerCase()}</p></div>
              </div>
              <button type="button" onClick={() => { setSelectedGroupId(null); setPopupEditing(null); }} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
            </header>
            <div className="flex-1 overflow-y-auto p-3 pb-6 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedGroup.items.map((item) => {
                  const owned = canManageItem(item);
                  return (
                    <article key={item.id} className="flex min-h-24 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div><h3 className="break-words font-bold text-slate-950">{item.name}</h3>{active.key === "products" && item.default_price !== null && item.default_price !== undefined && <p className="mt-1 text-sm font-bold text-emerald-700">Default rate: ₹{Number(item.default_price).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>}{active.key === "products" && item.key_features && <p className="mt-2 text-sm leading-5 text-slate-500">{item.key_features}</p>}</div>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-slate-400">{itemScopeLabel(item)}</span>
                        {owned && <div className="flex gap-2"><button type="button" onClick={() => setPopupEditing({ id: item.id, name: item.name, service_category: item.service_category || selectedGroup.id, key_features: item.key_features || "", default_price: item.default_price ?? "" })} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" />Edit</button><button type="button" onClick={() => remove(item)} className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50" aria-label={`Delete ${item.name}`}><Trash2 className="h-4 w-4" /></button></div>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      )}
      {popupEditing && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="master-edit-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setPopupEditing(null); }}>
          <form onSubmit={savePopupEdit} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-3xl sm:p-6">
            <header className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div><p className="text-xs font-bold uppercase tracking-wider text-violet-700">Master Data</p><h2 id="master-edit-title" className="mt-1 text-xl font-bold text-slate-950">Edit {active.singular}</h2></div>
              <button type="button" onClick={() => setPopupEditing(null)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200" aria-label="Close edit popup"><X className="h-5 w-5" /></button>
            </header>
            <div className="space-y-4">
              <Field label={`${active.singular} name`}><input autoFocus required value={popupEditing.name} onChange={(event) => setPopupEditing({ ...popupEditing, name: event.target.value })} /></Field>
              <Field label="Type of Service"><select required value={popupEditing.service_category} onChange={(event) => setPopupEditing({ ...popupEditing, service_category: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
              {active.key === "products" && <><Field label="Default price (optional)"><input type="number" min="0" step="0.01" value={popupEditing.default_price ?? ""} onChange={(event) => setPopupEditing({ ...popupEditing, default_price: event.target.value })} placeholder="Example: 28.00" /></Field><Field label="Key features (optional)"><textarea rows="4" value={popupEditing.key_features || ""} onChange={(event) => setPopupEditing({ ...popupEditing, key_features: event.target.value })} placeholder="Example: Stain resistance, smooth finish, 8-year warranty" /></Field></>}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
              <button type="button" onClick={() => setPopupEditing(null)} className="rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700">Cancel</button>
              <button disabled={saving} className="rounded-xl bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-50">{saving ? "Updating..." : "Save changes"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const quotationDefaultsBlank = {
  quotation_prepared_by: "",
  quotation_inspected_by: "",
  quotation_work_duration: "",
  quotation_payment_terms: "",
  quotation_product_details: "",
  quotation_work_procedures: "",
  quotation_terms_conditions: "",
};

function QuotationDefaults() {
  const [values, setValues] = useState(quotationDefaultsBlank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get("/accounts/contractor-profile/")
      .then(({ data }) => setValues(Object.fromEntries(Object.keys(quotationDefaultsBlank).map((key) => [key, data[key] || ""]))))
      .catch(() => setError("Default quotation details could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const update = (event) => setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const { data } = await api.patch("/accounts/contractor-profile/", values);
      setValues(Object.fromEntries(Object.keys(quotationDefaultsBlank).map((key) => [key, data[key] || ""])));
      setMessage("Default quotation details saved.");
    } catch (requestError) {
      setError(Object.values(requestError.response?.data || {}).flat().join(" ") || "Default quotation details could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setMessage(""); setError(""); }} className="flex min-h-[74px] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-violet-300 hover:shadow-sm">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><FileText className="h-5 w-5" /></span>
        <span className="min-w-0 font-bold text-slate-950">Terms and Conditions</span>
      </button>
      {open && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="quotation-terms-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <form onSubmit={save} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-3xl">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5 sm:px-6">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><FileText className="h-5 w-5" /></span><h2 id="quotation-terms-title" className="text-xl font-bold">Terms and Conditions</h2></div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl border" aria-label="Close"><X className="h-5 w-5" /></button>
          </header>
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            {loading ? <p className="sm:col-span-2">Loading...</p> : <>
              <Field label="Prepared by"><input name="quotation_prepared_by" value={values.quotation_prepared_by} onChange={update} /></Field>
              <Field label="Inspected by"><input name="quotation_inspected_by" value={values.quotation_inspected_by} onChange={update} /></Field>
              <Field label="Work duration"><input name="quotation_work_duration" value={values.quotation_work_duration} onChange={update} placeholder="For example, 15-18 days" /></Field>
              <Field label="Payment terms"><textarea rows="3" name="quotation_payment_terms" value={values.quotation_payment_terms} onChange={update} /></Field>
              <Field label="Product details"><textarea rows="3" name="quotation_product_details" value={values.quotation_product_details} onChange={update} /></Field>
              <Field label="Work procedures and safety"><textarea rows="4" name="quotation_work_procedures" value={values.quotation_work_procedures} onChange={update} /></Field>
              <div className="sm:col-span-2"><Field label="Terms and conditions"><textarea rows="5" name="quotation_terms_conditions" value={values.quotation_terms_conditions} onChange={update} /></Field></div>
              {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{error}</p>}
              {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 sm:col-span-2">{message}</p>}
            </>}
          </div>
          {!loading && <footer className="sticky bottom-0 border-t bg-white p-4 sm:px-6"><button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Saving..." : "Save Terms and Conditions"}</button></footer>}
        </form>
      </div>}
    </>
  );
}

function MasterCard({ item, category, owned, scope, edit, remove }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-bold text-slate-950">{item.name}</h3>{category && <p className="mt-1 text-xs font-semibold text-violet-700">{category}</p>}<p className="mt-1 text-xs font-semibold text-slate-400">{scope}</p></div>{owned && <div className="flex shrink-0 gap-2"><button type="button" onClick={edit} className="rounded-lg border p-2"><Pencil className="h-4 w-4" /></button><button type="button" onClick={remove} className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 className="h-4 w-4" /></button></div>}</div></article>;
}
function Field({ label, children }) {
  return <label className="text-sm font-semibold">{label}<span className="mt-2 block [&>*]:w-full [&>*]:rounded-xl [&>*]:border [&>*]:bg-white [&>*]:px-3 [&>*]:py-3 [&>*]:outline-none [&>*]:focus:border-violet-500 [&>*]:focus:ring-4 [&>*]:focus:ring-violet-100">{children}</span></label>;
}
function placeholder(key) {
  return { rooms: "Master Bedroom", surfaces: "Texture wall", categories: "Plumbing", products: "Premium emulsion", descriptions: "Apply one primer and two finish coats", brands: "Asian Paints", units: "Sq ft" }[key] || "Enter name";
}
