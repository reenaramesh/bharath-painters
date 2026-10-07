import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  Building2,
  Boxes,
  FileText,
  GripVertical,
  Layers3,
  Lock,
  Pencil,
  Plus,
  Ruler,
  Search,
  Save,
  Tags,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import api from "../api/client";
import "./admin-portal.css";
import useAuth from "../context/useAuth";
import { Button, EmptyState, ErrorState, LoadingState, PageHeader, SectionCard, StatusBadge } from "../components/ui";
import "./master-services.css";

// `key` is the UI/nav id. `section` is the canonical backend section name that
// MASTER_MODELS is keyed by, and is what the reorder endpoint resolves against
// — they differ for most sections, so posting `key` returned "Unknown section".
const groups = [
  { key: "rooms", label: "Rooms / Areas", singular: "Room / Area", endpoint: "areas", section: "areas", icon: BedDouble },
  { key: "surfaces", label: "Surface Types", singular: "Surface Type", endpoint: "measurement-surface-types", section: "measurement-surface-types", icon: Ruler },
  { key: "categories", label: "Types of Service", singular: "Type of Service", endpoint: "service-categories", section: "service-categories", icon: Layers3 },
  { key: "products", label: "Product Types", singular: "Product Type", endpoint: "paint-types", section: "paint-types", icon: Boxes },
  { key: "descriptions", label: "Product Descriptions", singular: "Product Description", endpoint: "work-descriptions", section: "work-descriptions", icon: FileText },
  { key: "brands", label: "Brands", singular: "Brand", endpoint: "brands", section: "brands", icon: Tags },
  { key: "units", label: "Measurement Units", singular: "MOU", endpoint: "units", section: "units", icon: Ruler },
  { key: "apartments", label: "Apartments", singular: "Apartment", endpoint: "master-data/apartments", section: "apartments", icon: Building2 },
];
const empty = { name: "", service_category: "", key_features: "", default_price: "", locality: "", zone: "", pincode: "", is_active: true };

export default function MasterServices() {
  const { user } = useAuth();
  const [active, setActive] = useState(groups[0]);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [counts, setCounts] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const dragIdRef = useRef(null);

  // Chromium refuses to start an HTML5 drag unless dragstart sets some data,
  // so the id goes on the dataTransfer as well as into the ref.
  const startDrag = (event, id) => {
    dragIdRef.current = id;
    setDragId(id);
    event.dataTransfer.effectAllowed = "move";
    try { event.dataTransfer.setData("text/plain", String(id)); } catch { /* older Safari */ }
  };
  const endDrag = () => { dragIdRef.current = null; setDragId(null); setDropTarget(null); };

  // Where the pointer sits relative to the hovered row. Kept in state rather
  // than written onto the DOM node: dragleave also fires when the pointer moves
  // onto a child element, so mutating the node by hand made the indicator
  // flicker away while the pointer was still over the row.
  const [dropTarget, setDropTarget] = useState(null);
  const dropRef = useRef(null);
  dropRef.current = dropTarget;

  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [visiblePage, setVisiblePage] = useState(1);
const [orderBusy, setOrderBusy] = useState(false);

  const loadCounts = useCallback(async () => {
    const results = await Promise.all(
      groups.map(async (group) => {
        try {
          const { data } = await api.get(`/quotations/${group.endpoint}/`);
          return [group.key, (data.results || data).length];
        } catch {
          return [group.key, null];
        }
      }),
    );
    setCounts(Object.fromEntries(results));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    setError("");
    try {
      const [current, cats] = await Promise.all([
        api.get(`/quotations/${active.endpoint}/`),
        api.get("/quotations/service-categories/"),
      ]);
      setItems(current.data.results || current.data);
      setCategories(cats.data.results || cats.data);
      setError("");
      setLoadFailed(false);
    } catch {
      setError(`${active.label} could not be loaded.`);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    load();
    loadCounts();
    setEditing(null);
    setForm(empty);
    setSearch("");
    setCategoryFilter("ALL");
    setStatusFilter("ALL");
    setShowAdd(false);
    setShowImport(false);
    setUploadFile(null);
    setImportSummary(null);
    setVisiblePage(1);
  }, [load, loadCounts]);

  useEffect(() => { setVisiblePage(1); }, [search, categoryFilter, statusFilter]);

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((item) => [String(item.id), item.name])),
    [categories],
  );
  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) =>
      (!term || [item.name, item.locality, item.zone, item.pincode].some((value) => String(value || "").toLowerCase().includes(term))) &&
      (categoryFilter === "ALL" || String(item.service_category) === categoryFilter) &&
      (statusFilter === "ALL" || (statusFilter === "ACTIVE" ? item.is_active !== false : item.is_active === false)),
    );
  }, [items, search, categoryFilter, statusFilter]);
  const visibleItems = filteredItems.slice(0, visiblePage * 50);
  const usesServiceCategory = ["products", "descriptions"].includes(active.key);
  const showsDefaultPrice = active.key === "products";
  const inactiveCount = items.filter((item) => item.is_active === false).length;
  const activeCount = items.length - inactiveCount;
  const categoryCounts = useMemo(() => {
    const map = {};
    items.forEach((item) => { const id = String(item.service_category); map[id] = (map[id] || 0) + 1; });
    return map;
  }, [items]);
  // Arrow bounds come from the filtered list, not the paginated slice: the
  // slice stops at 50 rows, so using it would disable arrows on a full page.
  const orderIndexOf = (itemId) => filteredItems.findIndex((item) => item.id === itemId);
  const canManageItem = (item) => active.key === "apartments" ? user?.role === "ADMIN" : user?.role === "ADMIN" || Number(item.created_by) === Number(user?.id);
  // Curated order is stored per user, so every role that can see a section can
  // reorder it without touching shared master data.
  const canReorder = user?.role === "ADMIN" || user?.role === "CONTRACTOR";

  // Sends the full unfiltered order. A filtered view must never post only the
  // rows it is showing, or the hidden rows lose their rank.
  function commitOrder(nextItems) {
    setItems(nextItems);
    setOrderBusy(true);
    api
      .post(`/quotations/master-data/${active.section}/reorder/`, { entry_ids: nextItems.map((item) => item.id) })
      .catch(() => {
        setError("The new order could not be saved. Reload to see the stored order.");
        load();
      })
      .finally(() => setOrderBusy(false));
  }

  function moveItem(itemId, direction) {
    const from = items.findIndex((item) => item.id === itemId);
    if (from < 0) return;
    const full = items.map((item) => item.id);
    // When a filter is active, swap against the neighbouring row the user can
    // actually see rather than the adjacent hidden one.
    const visibleIds = filteredItems.map((item) => item.id);
    const visibleFrom = visibleIds.indexOf(itemId);
    if (visibleFrom < 0) return;
    const neighbourId = visibleFrom + direction === -1 || visibleFrom + direction >= visibleIds.length
      ? null
      : visibleIds[visibleFrom + direction];
    const to = neighbourId ? full.indexOf(neighbourId) : -1;
    const next = [...items];
    if (to >= 0) [next[from], next[to]] = [next[to], next[from]];
    commitOrder(next);
  }

  // placeAfter tells us which side of the target row the pointer was on, so a
  // drop in the lower half puts the row below rather than always above.
  function reorderTo(sourceId, targetId, placeAfter = false) {
    if (sourceId === targetId) return;
    const next = [...items];
    const from = next.findIndex((item) => item.id === sourceId);
    if (from < 0 || next.findIndex((item) => item.id === targetId) < 0) return;
    const [moved] = next.splice(from, 1);
    const targetIndex = next.findIndex((item) => item.id === targetId);
    next.splice(placeAfter ? targetIndex + 1 : targetIndex, 0, moved);
    commitOrder(next);
  }

  function resetOrder() {
    setOrderBusy(true);
    api
      .post(`/quotations/master-data/${active.section}/reorder/`, { entry_ids: [] })
      .catch(() => setError("The default order could not be restored. Reload to try again."))
      .finally(() => { setOrderBusy(false); load(); });
  }

  const itemScope = (item) => {
    if (active.key === "apartments") return "admin";
    if (!item.created_by) return "default";
    return Number(item.created_by) === Number(user?.id) ? "mine" : "shared";
  };

  async function setAvailability(item, nextActive) {
    setBusyId(item.id);
    setError("");
    try {
      // Backend gap: visible_master_data() filters is_active=True, so a deactivated entry
      // disappears from this list and cannot be switched back on. The list endpoint needs
      // an ?include_inactive=1 (or ?status=) filter before "Inactive" is a real state here.
      const { data } = await api.patch(`/quotations/${active.endpoint}/${item.id}/`, { is_active: nextActive });
      setItems((current) => current.map((row) => (row.id === item.id ? { ...row, ...data } : row)));
    } catch {
      setError(`${item.name} could not be switched ${nextActive ? "on" : "off"}.`);
    } finally {
      setBusyId(null);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { name: form.name.trim(), is_active: form.is_active !== false };
      if (active.key === "apartments") {
        payload.locality = form.locality.trim();
        payload.zone = form.zone.trim();
        payload.pincode = form.pincode.trim();
      }
      if (usesServiceCategory) payload.service_category = Number(form.service_category);
      if (active.key === "products") {
        payload.key_features = form.key_features.trim();
        payload.default_price = form.default_price === "" ? null : form.default_price;
      }
      if (editing) await api.patch(`/quotations/${active.endpoint}/${editing}/`, payload);
      else await api.post(`/quotations/${active.endpoint}/`, payload);
      setEditing(null);
      setShowAdd(false);
      setForm({ ...empty, service_category: usesServiceCategory ? form.service_category : "" });
      await Promise.all([load(), loadCounts()]);
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
      await Promise.all([load(), loadCounts()]);
    } catch {
      setError("This entry could not be removed.");
    }
  }

  function edit(item) {
    setEditing(item.id);
    setShowAdd(true);
    setShowImport(false);
    setForm({ name: item.name, service_category: item.service_category || "", key_features: item.key_features || "", default_price: item.default_price ?? "", locality: item.locality || "", zone: item.zone || "", pincode: item.pincode || "", is_active: item.is_active !== false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function downloadTemplate() {
    const headings = active.key === "apartments" ? "name,locality,zone,pincode"
      : usesServiceCategory ? active.key === "products" ? "name,service_category,key_features,default_price" : "name,service_category"
        : "name";
    downloadCsv(`${headings}\n`, `${active.key}-template.csv`);
  }

  function downloadCurrent() {
    const headings = active.key === "apartments" ? ["name", "locality", "zone", "pincode"]
      : usesServiceCategory ? active.key === "products" ? ["name", "service_category", "key_features", "default_price"] : ["name", "service_category"]
        : ["name"];
    const rows = items.map((item) => headings.map((heading) => heading === "service_category" ? categoryMap[String(item.service_category)] || "" : item[heading] ?? ""));
    downloadCsv([headings, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n", `${active.key}-current.csv`);
  }

  function downloadCsv(content, filename) {
    const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function uploadMaster(event) {
    event.preventDefault();
    if (!uploadFile) return;
    const uploadForm = event.currentTarget;
    setUploading(true);
    setError("");
    setImportSummary(null);
    try {
      const payload = new FormData();
      payload.append("file", uploadFile);
      const { data } = await api.post(`/quotations/master-data/import/${active.key === "apartments" ? "apartments" : active.endpoint}/`, payload, { headers: { "Content-Type": "multipart/form-data" } });
      setImportSummary(data);
      setUploadFile(null);
      setShowImport(false);
      uploadForm.reset();
      await Promise.all([load(), loadCounts()]);
    } catch (requestError) {
      setError(Object.values(requestError.response?.data || {}).flat().join(" ") || "Master Data upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const ActiveIcon = active.icon;
  return (
    <div className="space-y-6 master-services-page">
      <PageHeader eyebrow="Quotation configuration" title="Master Data" description="Organize services, product types, units, and other options used throughout quotations." />

      {error && !loadFailed && <p className="master-data-alert" role="alert">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[248px_1fr]">
        <label className="block lg:hidden">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Master Data section</span>
          <select
            data-testid="section-select"
            value={active.key}
            onChange={(event) => setActive(groups.find((group) => group.key === event.target.value) || groups[0])}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-bold text-slate-950 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          >
            {groups.map((group) => (
              <option key={group.key} value={group.key}>
                {group.label}{counts[group.key] === null || counts[group.key] === undefined ? "" : ` (${counts[group.key]})`}
              </option>
            ))}
          </select>
        </label>

        <nav aria-label="Master data sections" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">Sections</p>
          <ul className="flex flex-col gap-1">

            {groups.map((group) => {
              const Icon = group.icon;
              const selected = active.key === group.key;
              const count = counts[group.key];
              return (
                <li key={group.key} className="shrink-0 lg:shrink">
                  <button type="button" onClick={() => setActive(group)} aria-current={selected ? "true" : undefined} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${selected ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "border-transparent text-slate-600 hover:bg-white hover:shadow-sm"}`}>
                    <Icon className={`h-4 w-4 shrink-0 ${selected ? "text-amber-300" : "text-slate-400"}`} />
                    <span className="min-w-0 flex-1 text-sm font-semibold whitespace-nowrap">{group.label}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${selected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>{count === null || count === undefined ? "—" : count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {user?.role === "CONTRACTOR" && <div className="mt-4 hidden lg:block"><QuotationDefaults /></div>}
        </nav>

        <div className="min-w-0 space-y-4">
      {active.key === "apartments" && user?.role !== "ADMIN" && null}

      <SectionCard
        title={<span className="master-section-title"><span className="master-section-icon"><ActiveIcon aria-hidden="true" /></span>{active.label}</span>}
        description={`${items.length} saved ${items.length === 1 ? "entry" : "entries"} · ${activeCount} active · ${inactiveCount} inactive`}
        className="master-data-card"
        bodyClassName="p-0"
        action={<div className="master-data-actions">
          <Button variant={showAdd ? "primary" : "secondary"} onClick={() => { setShowAdd((open) => !open); setShowImport(false); }} aria-pressed={showAdd}><Plus aria-hidden="true" />Add {active.singular}</Button>
          <Button variant={showImport ? "primary" : "secondary"} onClick={() => { setShowImport((open) => !open); setShowAdd(false); }} aria-pressed={showImport}><Upload aria-hidden="true" />Import CSV</Button>
        </div>}
      >

        {(active.key !== "apartments" || user?.role === "ADMIN") && showAdd && <form onSubmit={submit} className="grid gap-4 border-b bg-slate-50/60 p-4 sm:p-5 md:grid-cols-[1fr_1fr_auto]">
          <Field label={`${active.singular} name`}><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={placeholder(active.key)} /></Field>
          {usesServiceCategory && <Field label="Type of Service"><select required value={form.service_category} onChange={(event) => setForm({ ...form, service_category: event.target.value })}><option value="">Select type of service</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>}
          {active.key === "apartments" && <><Field label="Locality"><input value={form.locality} onChange={(event) => setForm({ ...form, locality: event.target.value })} placeholder="Area or neighbourhood" /></Field><Field label="Zone / State"><input value={form.zone} onChange={(event) => setForm({ ...form, zone: event.target.value })} placeholder="Karnataka" /></Field><Field label="PIN code"><input value={form.pincode} onChange={(event) => setForm({ ...form, pincode: event.target.value })} placeholder="560001" /></Field></>}
          <div className="flex items-end gap-2"><button disabled={saving} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 font-semibold text-white disabled:opacity-50 md:flex-none"><Plus className="h-4 w-4" />{saving ? "Saving..." : editing ? "Update" : `Add ${active.singular}`}</button>{editing && <button type="button" onClick={() => { setEditing(null); setShowAdd(false); setForm(empty); }} className="grid h-12 w-12 place-items-center rounded-xl border" aria-label="Cancel editing"><X className="h-4 w-4" /></button>}</div>
          {active.key === "products" && <div className="grid gap-4 md:col-span-full md:grid-cols-[220px_1fr]"><Field label="Default price (optional)"><input type="number" min="0" step="0.01" value={form.default_price} onChange={(event) => setForm({ ...form, default_price: event.target.value })} placeholder="Example: 28.00" /></Field><Field label="Key features (optional)"><textarea rows="3" value={form.key_features} onChange={(event) => setForm({ ...form, key_features: event.target.value })} placeholder="Example: Stain resistance, smooth finish, 8-year warranty" /></Field></div>}
          <div className="md:col-span-full"><AvailabilityToggle ariaLabel={`${active.singular} availability`} value={form.is_active !== false} onChange={(next) => setForm({ ...form, is_active: next })} hint="Inactive entries are hidden from quotation dropdowns." /></div>
        </form>}

        {(active.key !== "apartments" || user?.role === "ADMIN") && showImport && <div className="border-b bg-slate-50/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">Import {active.label}</h3></div><div className="flex flex-wrap gap-2"><button type="button" onClick={downloadTemplate} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">CSV template</button><button type="button" onClick={downloadCurrent} disabled={!items.length} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Download current data</button></div></div>
          <form onSubmit={uploadMaster} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"><input required type="file" accept=".csv,.xlsx" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white p-2 text-sm" /><button disabled={uploading || !uploadFile} className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-50"><Upload className="h-4 w-4" />{uploading ? "Uploading..." : "Upload data"}</button></form>
          {usesServiceCategory && null}
          {active.key === "apartments" && null}
          <p className="mt-2 text-xs text-amber-700">Re-uploading a file switches existing entries back to Active.</p>
        </div>}
        {importSummary && <div className="border-b p-4 text-sm"><p className="font-semibold">{importSummary.created} added · {importSummary.updated} updated · {importSummary.skipped} skipped · {importSummary.error_count} errors</p>{importSummary.errors?.length > 0 && <ul className="mt-2 list-disc pl-5 text-red-700">{importSummary.errors.map((item) => <li key={item.row}>Row {item.row}: {item.message}</li>)}</ul>}</div>}

      <div className="flex flex-wrap items-center gap-2 border-b p-3 sm:p-4">
        <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${active.label.toLowerCase()}`} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        <div className="flex flex-wrap gap-2">
          {[["ALL", "All", items.length], ["ACTIVE", "Active", activeCount], ["INACTIVE", "Inactive", inactiveCount]].map(([value, label, count]) => (
            <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${statusFilter === value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label} · {count}</button>
          ))}
        </div>
      </div>

        {usesServiceCategory && <div className="master-category-filters flex flex-wrap items-center gap-2 border-b px-3 py-3 sm:px-4" role="group" aria-label="Filter by service category">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Service type</span>
          <button type="button" aria-pressed={categoryFilter === "ALL"} onClick={() => setCategoryFilter("ALL")} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${categoryFilter === "ALL" ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>All types</button>
        {categories.map((category) => {
          const id = String(category.id);
          return <button key={category.id} type="button" aria-pressed={categoryFilter === id} onClick={() => setCategoryFilter(id)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${categoryFilter === id ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{category.name} · {categoryCounts[id] || 0}</button>;
        })}
      </div>}

      {loadFailed ? <ErrorState message={error} onRetry={load} className="master-data-state" /> : loading ? <LoadingState label={`Loading ${active.label.toLowerCase()}…`} className="master-data-state" /> : <>
          <div className="md:hidden">
            {canReorder && <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              <p className="flex-1">Drag or use the arrows to set the order in <strong className="font-semibold text-slate-800">your</strong> quotation dropdowns.</p>
              <button type="button" onClick={resetOrder} disabled={orderBusy} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 font-semibold text-amber-800 disabled:opacity-50">Reset to default order</button>
            </div>}
          </div>

          <div className="grid gap-3 p-3 md:hidden">
            {visibleItems.map((item) => <MasterCard key={item.id} item={item} index={orderIndexOf(item.id)} total={filteredItems.length} category={categoryMap[String(item.service_category)]} price={showsDefaultPrice ? item.default_price : null} features={showsDefaultPrice ? item.key_features : ""} subtitle={active.key === "apartments" ? [item.locality, item.zone, item.pincode].filter(Boolean).join(", ") : ""} owned={canManageItem(item)} scope={itemScope(item)} busy={busyId === item.id} lockScope={active.key === "apartments"} canReorder={canReorder} orderBusy={orderBusy} onToggle={(next) => setAvailability(item, next)} onMove={(direction) => moveItem(item.id, direction)} onResetOrder={resetOrder} edit={() => edit(item)} remove={() => remove(item)} />)}
          </div>

          <div className="master-data-table-scroll hidden md:block">
            {canReorder && <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2 text-xs text-slate-500">
              <p className="flex items-center gap-2"><GripVertical className="h-3.5 w-3.5" />Drag a row, or use the arrows, to set the order in <strong className="font-semibold text-slate-700">your</strong> quotation dropdowns. Nobody else&apos;s list changes.</p>
              <button type="button" onClick={resetOrder} disabled={orderBusy} className="ml-auto rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50">Reset to default order</button>
            </div>}
            <table className="master-data-table w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="w-10 px-3 py-3"><span className="sr-only">Order</span></th><th className="w-12 px-2 py-3">#</th><th className="px-4 py-3">{active.singular}</th>{usesServiceCategory && <th className="w-[22%] px-4 py-3">Type of Service</th>}{showsDefaultPrice && <th className="w-36 px-4 py-3 text-right">Default price</th>}<th className="w-16 px-4 py-3 text-center">Scope</th><th className="w-[184px] px-4 py-3">Availability</th><th className="w-24 px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y">{visibleItems.map((item, index) => {
                const owned = canManageItem(item);
                const isOff = item.is_active === false;
                return <tr
                  key={item.id}
                  draggable={canReorder}
                  onDragStart={(event) => startDrag(event, item.id)}
                  onDragEnd={endDrag}
                  onDragOver={(event) => {
                    if (!canReorder || !dragIdRef.current) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    const row = event.currentTarget;
                    const below = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
                    const next = { id: item.id, below };
                    const current = dropRef.current;
                    if (current?.id !== next.id || current?.below !== next.below) setDropTarget(next);
                  }}
                  onDragLeave={(event) => {
                    // Fires for every child the pointer crosses, so only clear
                    // when the pointer leaves the row entirely.
                    if (event.currentTarget.contains(event.relatedTarget)) return;
                    setDropTarget(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const placeAfter = dropRef.current?.id === item.id ? dropRef.current.below : false;
                    const sourceId = Number(event.dataTransfer.getData("text/plain")) || dragIdRef.current;
                    if (sourceId) reorderTo(sourceId, item.id, placeAfter);
                    endDrag();
                  }}
                  className={`${dragId === item.id ? "opacity-40" : ""} ${dropTarget?.id === item.id ? `outline-2 outline-dashed -outline-offset-2 ${dropTarget.below ? "outline-violet-400" : "outline-violet-600"}` : ""} ${isOff ? "bg-slate-50/70" : "hover:bg-slate-50"}`}>
                  <td className="px-3 py-3.5">{canReorder && <span className="flex cursor-grab flex-col gap-0.5 text-slate-300 hover:text-slate-500" aria-hidden="true"><ArrowUp className="h-3 w-3" /><GripVertical className="h-3.5 w-3.5" /><ArrowDown className="h-3 w-3" /></span>}</td>
                  <td className="px-2 py-3.5 font-bold text-slate-400">{index + 1}</td>
                    <td className="px-4 py-3.5"><div className="flex flex-wrap items-center gap-2"><span className={`font-semibold ${isOff ? "text-slate-500" : "text-slate-950"}`}>{item.name}</span><StatusBadge status={isOff ? "INACTIVE" : "ACTIVE"} label={isOff ? "Inactive" : "Active"} tone={isOff ? "neutral" : "success"} /></div>{active.key === "apartments" && <span className="mt-1 block text-xs text-slate-500">{[item.locality, item.zone, item.pincode].filter(Boolean).join(", ")}</span>}{showsDefaultPrice && item.key_features && <span className="master-product-features mt-1 block text-sm text-slate-600">{item.key_features}</span>}</td>
                   {usesServiceCategory && <td className="px-4 py-3.5">{categoryMap[String(item.service_category)] ? <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">{categoryMap[String(item.service_category)]}</span> : <span className="text-xs text-slate-400">Not assigned</span>}</td>}
                    {showsDefaultPrice && <td className="master-price-cell px-4 py-3.5 text-right">{item.default_price === null || item.default_price === undefined || item.default_price === "" ? <span className="text-sm text-slate-500">Not set</span> : <span className="text-sm font-bold tabular-nums text-slate-900">{formatDefaultPrice(item.default_price)}</span>}</td>}
                  <td className="px-4 py-3.5 text-center"><ScopeDot scope={itemScope(item)} /></td>
                   <td className="px-4 py-3.5"><AvailabilityToggle ariaLabel={`${item.name} availability`} value={!isOff} disabled={active.key === "apartments"} locked={active.key === "apartments"} busy={busyId === item.id} onChange={(next) => setAvailability(item, next)} /></td>
                   <td className="px-4 py-3.5"><div className="master-item-actions">{canReorder && <><button type="button" onClick={() => moveItem(item.id, -1)} disabled={orderBusy || orderIndexOf(item.id) === 0} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-white disabled:opacity-30" aria-label={`Move ${item.name} up`}><ArrowUp className="h-4 w-4" /></button><button type="button" onClick={() => moveItem(item.id, 1)} disabled={orderBusy || orderIndexOf(item.id) === filteredItems.length - 1} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-white disabled:opacity-30" aria-label={`Move ${item.name} down`}><ArrowDown className="h-4 w-4" /></button></>}{owned && !isOff && <><button type="button" onClick={() => edit(item)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-white" aria-label={`Edit ${item.name}`}><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => remove(item)} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" aria-label={`Remove ${item.name} from future selections`}><Trash2 className="h-4 w-4" /></button></>}</div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>

          {!filteredItems.length && <EmptyState title={items.length ? `No ${active.label.toLowerCase()} match these filters` : `No ${active.label.toLowerCase()} yet`} description={items.length ? "Adjust your search or filters to see more entries." : `Add or import ${active.label.toLowerCase()} to use them in quotations.`} className="master-data-state" />}
          {visibleItems.length < filteredItems.length && <div className="border-t p-4 text-center"><button type="button" onClick={() => setVisiblePage((page) => page + 1)} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold">Show more ({filteredItems.length - visibleItems.length} remaining)</button></div>}
      </>}
      </SectionCard>
        </div>
      </div>

      {user?.role === "CONTRACTOR" && <div className="lg:hidden"><QuotationDefaults /></div>}
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
      <button type="button" onClick={() => { setOpen(true); setMessage(""); setError(""); }} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-violet-300 hover:shadow-sm">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-700"><FileText className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1 text-sm font-bold text-slate-950">Terms and Conditions</span>
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

function MasterCard({ item, index, total, category, price, features, subtitle, owned, scope, busy, lockScope, canReorder, orderBusy, onToggle, onMove, edit, remove }) {
  const isOff = item.is_active === false;
  return <article className={`rounded-xl border bg-white p-4 shadow-sm ${isOff ? "border-slate-200 bg-slate-50" : "border-slate-200"}`}>
    <div className="flex items-start gap-3">
       {canReorder && <span className="master-reorder-controls mt-0.5 flex shrink-0 flex-col items-center gap-0.5"><button type="button" onClick={() => onMove(-1)} disabled={orderBusy || index === 0} className="rounded p-1 text-slate-400 active:bg-slate-100 disabled:opacity-25" aria-label={`Move ${item.name} up`}><ArrowUp className="h-3.5 w-3.5" /></button><span className="text-[10px] font-bold text-slate-400 tabular-nums">{index + 1}</span><button type="button" onClick={() => onMove(1)} disabled={orderBusy || index === total - 1} className="rounded p-1 text-slate-400 active:bg-slate-100 disabled:opacity-25" aria-label={`Move ${item.name} down`}><ArrowDown className="h-3.5 w-3.5" /></button></span>}
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={`font-bold ${isOff ? "text-slate-500" : "text-slate-950"}`}>{item.name}</h3><StatusBadge status={isOff ? "INACTIVE" : "ACTIVE"} label={isOff ? "Inactive" : "Active"} tone={isOff ? "neutral" : "success"} /></div>{subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}{category && <p className="mt-1 text-sm font-semibold text-violet-700">{category}</p>}{features && <p className="master-product-features mt-1 text-sm text-slate-600">{features}</p>}{price !== null && price !== undefined && price !== "" && <p className="master-card-price mt-2"><span>Default price</span><strong>{formatDefaultPrice(price)}</strong></p>}<div className="mt-2"><ScopeDot scope={scope} /></div>{isOff && <p className="mt-2 text-sm font-semibold text-slate-600">Hidden from quotation selections.</p>}</div>
       {owned && !isOff && <div className="master-item-actions flex shrink-0 gap-2"><button type="button" onClick={edit} className="rounded-lg border p-2" aria-label={`Edit ${item.name}`}><Pencil className="h-4 w-4" /></button><button type="button" onClick={remove} className="rounded-lg border border-red-200 p-2 text-red-600" aria-label={`Remove ${item.name} from future selections`}><Trash2 className="h-4 w-4" /></button></div>}
    </div>
     <div className={`flex flex-wrap items-center gap-2 ${canReorder ? "pl-9" : ""}`}><AvailabilityToggle ariaLabel={`${item.name} availability`} value={!isOff} disabled={lockScope} locked={lockScope} busy={busy} onChange={onToggle} /></div>
  </article>;
}


const scopeMeta = {
  mine: { label: "Your entry", dot: "bg-violet-500", ring: "ring-violet-200" },
  shared: { label: "Shared master", dot: "bg-amber-500", ring: "ring-amber-200" },
  default: { label: "Default for all contractors", dot: "bg-slate-400", ring: "ring-slate-200" },
  admin: { label: "Shared directory", dot: "bg-sky-500", ring: "ring-sky-200" },
};

function ScopeDot({ scope }) {
  const meta = scopeMeta[scope] || scopeMeta.shared;
  return <span title={meta.label} className="inline-flex items-center gap-1.5 text-xs text-slate-500"><span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dot} ring-4 ${meta.ring}`} />{meta.label}</span>;
}

function AvailabilityToggle({ value, onChange, disabled, locked, busy, ariaLabel = "Availability" }) {
  return (
    <div>
      <div role="radiogroup" aria-label={ariaLabel} className={`master-availability-toggle inline-flex overflow-hidden rounded-full border border-slate-200 bg-white ${disabled ? "opacity-50" : ""}`}>
        {[[true, "Active"], [false, "Inactive"]].map(([option, label]) => {
          const selected = value === option;
          return <button key={label} type="button" role="radio" aria-checked={selected} disabled={disabled || busy} onClick={() => !disabled && !selected && onChange(option)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition ${selected ? option ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600" : "text-slate-400 hover:bg-slate-50"}`}><span className={`h-1.5 w-1.5 rounded-full ${selected ? option ? "bg-emerald-500" : "bg-slate-400" : "border border-slate-300"}`} />{busy && selected ? "..." : label}</button>;
        })}
        {locked && <span className="border-l border-slate-200 px-2 py-1.5 text-slate-400" title="Only an admin can change this"><Lock className="h-3.5 w-3.5" /></span>}
      </div>
      
    </div>
  );
}
function formatDefaultPrice(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function Field({ label, children }) {
  return <label className="text-sm font-semibold">{label}<span className="mt-2 block [&>*]:w-full [&>*]:rounded-xl [&>*]:border [&>*]:bg-white [&>*]:px-3 [&>*]:py-3 [&>*]:outline-none [&>*]:focus:border-violet-500 [&>*]:focus:ring-4 [&>*]:focus:ring-violet-100">{children}</span></label>;
}
function placeholder(key) {
  return { rooms: "Master Bedroom", surfaces: "Texture wall", categories: "Plumbing", products: "Premium emulsion", descriptions: "Apply one primer and two finish coats", brands: "Asian Paints", units: "Sq ft", apartments: "Skyline Bagmane Champagne Hills" }[key] || "Enter name";
}
function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
