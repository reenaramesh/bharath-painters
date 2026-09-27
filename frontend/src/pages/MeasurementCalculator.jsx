import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Check, ChevronRight, Download, FilePlus2, Layers3,
  Pencil, Plus, Ruler, Search, Trash2, X,
} from "lucide-react";
import api from "../api/client";
import { previewPdf } from "../components/PdfPreview";

const SURFACE_TYPES = [
  ["WALL", "Wall"], ["CEILING", "Ceiling"], ["FLOOR", "Floor"],
  ["WOOD_WORK", "Wood Work"], ["TILE", "Tile / Tiling"],
  ["WALLPAPER", "Wallpaper"], ["METAL", "Metal"], ["GLASS", "Glass"],
  ["DOOR", "Door"], ["WINDOW", "Window"], ["GATE", "Gate"], ["GRILL", "Grill / Railing"],
  ["COLUMN", "Column"], ["BEAM", "Beam"], ["OTHER", "Other"],
];
const DEDUCTION_TYPES = ["Window", "Door", "Wardrobe", "Vent", "Opening", "Skylight", "Stair Opening", "Other"];
const TYPE_LABELS = Object.fromEntries(SURFACE_TYPES);
const number = (value) => Number(value || 0);
const areaText = (value) => `${number(value).toFixed(0)} sq.ft`;
const requestMessage = (error, fallback) => {
  const data = error?.response?.data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const value = Object.values(data)[0];
    return Array.isArray(value) ? value[0] : typeof value === "string" ? value : fallback;
  }
  return fallback;
};
const groupKey = (surface) =>
  surface.surface_type === "OTHER"
    ? `OTHER:${surface.area_group_name || "Other"}`
    : surface.surface_type;
const groupLabel = (surface) =>
  surface.surface_type === "OTHER"
    ? surface.area_group_name || "Other"
    : TYPE_LABELS[surface.surface_type] || surface.surface_type.replaceAll("_", " ");
const openingKey = (opening, surface) => {
  const type = opening.deduct_from_surface_type || surface.surface_type;
  const group = opening.deduct_from_group_name || surface.area_group_name;
  return type === "OTHER" ? `OTHER:${group || "Other"}` : type;
};
const visibleSurface = (surface) =>
  surface.name !== "__ROOM_ADJUSTMENTS__" && number(surface.gross_area) > 0;

function summarize(surfaces) {
  const groups = new Map();
  surfaces.forEach((surface) => {
    const key = groupKey(surface);
    if (!groups.has(key)) groups.set(key, { key, label: groupLabel(surface), surfaces: [], deductions: [], additions: [] });
    const group = groups.get(key);
    if (visibleSurface(surface)) group.surfaces.push(surface);
    (surface.openings || []).forEach((opening) => {
      const target = openingKey(opening, surface);
      if (!groups.has(target)) groups.set(target, {
        key: target,
        label: target.startsWith("OTHER:") ? target.slice(6) : TYPE_LABELS[target] || target.replaceAll("_", " "),
        surfaces: [], deductions: [], additions: [],
      });
      groups.get(target)[opening.effect === "ADD" ? "additions" : "deductions"].push({ ...opening, parentSurface: surface });
    });
  });
  return [...groups.values()].map((group) => {
    const gross = group.surfaces.reduce((sum, item) => sum + number(item.gross_area), 0);
    const deduction = group.deductions.reduce((sum, item) => sum + number(item.effective_deduction), 0);
    const addition = group.additions.reduce((sum, item) => sum + number(item.area), 0);
    return { ...group, gross, deduction, addition, net: Math.max(0, gross - deduction + addition) };
  }).filter((group) => group.surfaces.length || group.deductions.length || group.additions.length);
}

const blankSurface = { surfaceLabel: "Wall", name: "", length: "", breadth: "", quantity: 1 };
const blankDeduction = { type: "Window", name: "", width: "", height: "", quantity: 1, target: "", deduct: true };
const blankArea = { name: "", section: "", description: "", isCustom: false, saveForFuture: false };

export default function MeasurementCalculator() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const measurementId = searchParams.get("measurement") || "";
  const isNew = searchParams.get("new") === "1";
  const [property, setProperty] = useState(null);
  const [record, setRecord] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [surfaces, setSurfaces] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [surfaceTypes, setSurfaceTypes] = useState([]);
  const [activeAreaId, setActiveAreaId] = useState("");
  const [tab, setTab] = useState("surfaces");
  const [dialog, setDialog] = useState("");
  const [viewingArea, setViewingArea] = useState(null);
  const [areaDraft, setAreaDraft] = useState(blankArea);
  const [surfaceDraft, setSurfaceDraft] = useState(blankSurface);
  const [deductionDraft, setDeductionDraft] = useState(blankDeduction);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const query = useMemo(() => measurementId ? { measurement: measurementId } : isNew ? { new: 1 } : {}, [measurementId, isNew]);
  const load = useCallback(async () => {
    try {
      const calls = [
        api.get(`/quotations/properties/${id}/`),
        api.get(`/quotations/properties/${id}/rooms/`, { params: query }),
        api.get(`/quotations/properties/${id}/measurements/`, { params: query }),
        api.get("/quotations/areas/"),
        api.get("/quotations/measurement-surface-types/"),
      ];
      if (measurementId) calls.push(api.get(`/quotations/measurement-records/${measurementId}/`));
      const [propertyResult, roomResult, surfaceResult, areaTypeResult, surfaceTypeResult, recordResult] = await Promise.all(calls);
      setProperty(propertyResult.data);
      setRooms(roomResult.data.results || roomResult.data);
      setSurfaces(surfaceResult.data.results || surfaceResult.data);
      setRoomTypes(areaTypeResult.data.results || areaTypeResult.data);
      setSurfaceTypes(surfaceTypeResult.data.results || surfaceTypeResult.data);
      setRecord(recordResult?.data || null);
      const loadedSurfaces = surfaceResult.data.results || surfaceResult.data;
      const loadedRooms = roomResult.data.results || roomResult.data;
      const loadedRecordId = loadedSurfaces[0]?.measurement_record || loadedRooms[0]?.measurement_record;
      if (!measurementId && loadedRecordId) setSearchParams({ measurement: String(loadedRecordId) }, { replace: true });
      setError("");
    } catch {
      setError("Area Calculation could not be loaded.");
    }
  }, [id, measurementId, query, setSearchParams]);

  useEffect(() => { load(); }, [load]);
  const workArea = property?.measurement_type === "EXTERIOR" ? "EXTERIOR" : "INTERIOR";
  const hasLegacyExterior = surfaces.some((surface) => surface.work_area === "EXTERIOR" && !surface.room);
  const areas = useMemo(() => [
    ...rooms,
    ...(hasLegacyExterior ? [{ id: "exterior", name: "Exterior", section: "", description: "", legacy: true }] : []),
  ], [rooms, hasLegacyExterior]);
  const activeArea = areas.find((area) => String(area.id) === String(activeAreaId));
  const areaSurfaces = useMemo(() => surfaces.filter((surface) =>
    activeAreaId === "exterior" ? !surface.room && surface.work_area === "EXTERIOR" : String(surface.room) === String(activeAreaId)
  ), [surfaces, activeAreaId]);
  const activeGroups = useMemo(() => summarize(areaSurfaces), [areaSurfaces]);
  const areaSummaries = useMemo(() => new Map(areas.map((area) => {
    const own = surfaces.filter((surface) => area.id === "exterior"
      ? !surface.room && surface.work_area === "EXTERIOR"
      : String(surface.room) === String(area.id));
    const groups = summarize(own);
    return [String(area.id), {
      groups,
      gross: groups.reduce((sum, group) => sum + group.gross, 0),
      deductions: groups.reduce((sum, group) => sum + group.deductions.length, 0),
      deductionArea: groups.reduce((sum, group) => sum + group.deduction, 0),
      additionArea: groups.reduce((sum, group) => sum + group.addition, 0),
      net: groups.reduce((sum, group) => sum + group.net, 0),
      surfaceCount: own.filter(visibleSurface).length,
    }];
  })), [areas, surfaces]);
  const totals = useMemo(() => [...areaSummaries.values()].reduce((sum, item) => ({
    gross: sum.gross + item.gross,
    net: sum.net + item.net,
    surfaces: sum.surfaces + item.surfaceCount,
    deductions: sum.deductions + item.deductions,
  }), { gross: 0, net: 0, surfaces: 0, deductions: 0 }), [areaSummaries]);
  const activeSummary = areaSummaries.get(String(activeAreaId)) || { gross: 0, net: 0, deductionArea: 0, additionArea: 0 };
  const uniqueRoomTypes = roomTypes.filter((type, index, values) =>
    values.findIndex((item) => item.name.trim().toLowerCase() === type.name.trim().toLowerCase()) === index
  );
  const selectableRoomTypes = uniqueRoomTypes.filter((type) =>
    editing || !rooms.some((room) => room.name.trim().toLowerCase() === type.name.trim().toLowerCase())
  );

  async function submitMeasurement() {
    const recordId = record?.id || measurementId || surfaces[0]?.measurement_record || rooms[0]?.measurement_record;
    if (!recordId) return;
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post(`/quotations/measurement-records/${recordId}/submit/`);
      setRecord(data);
      if (!measurementId) setSearchParams({ measurement: String(recordId) }, { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Area Calculation could not be submitted.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    if (isNew && !measurementId) {
      setError("Add and save the first room before viewing the Area Calculation PDF.");
      return;
    }
    try {
      const response = await api.get(`/quotations/properties/${id}/measurements/pdf/`, {
        params: measurementId ? { measurement: measurementId } : {},
        responseType: "blob",
      });
      previewPdf(response.data, `${record?.reference_no || property?.name || "area-calculation"}.pdf`);
    } catch { setError("Area Calculation PDF could not be previewed."); }
  }

  function openAreaDialog(area = null) {
    setEditing(area);
    const known = area && roomTypes.some((item) => item.name.toLowerCase() === area.name.toLowerCase());
    setAreaDraft(area ? {
      name: area.name, section: area.section || "", description: area.description || "",
      isCustom: !known, saveForFuture: false,
    } : blankArea);
    setDialog("area");
  }
  async function saveArea(event) {
    event.preventDefault();
    if (!areaDraft.name.trim()) return;
    setSaving(true);
    try {
      let roomType = editing?.room_type || roomTypes.find((item) => item.name.toLowerCase() === areaDraft.name.trim().toLowerCase())?.id || null;
      if (areaDraft.isCustom && areaDraft.saveForFuture) {
        const savedType = (await api.post("/quotations/areas/", { name: areaDraft.name.trim() })).data;
        roomType = savedType.id;
      }
      const payload = {
        name: areaDraft.name.trim(), section: areaDraft.section,
        description: areaDraft.description, room_type: roomType,
      };
      const saved = editing
        ? (await api.patch(`/quotations/rooms/${editing.id}/`, payload)).data
        : (await api.post(`/quotations/properties/${id}/rooms/`, payload, { params: query })).data;
      if (!measurementId && saved.measurement_record) setSearchParams({ measurement: String(saved.measurement_record) });
      else await load();
      setActiveAreaId(String(saved.id));
      setDialog("");
      setEditing(null);
      setError("");
    } catch (requestError) { setError(requestMessage(requestError, "Area could not be saved.")); }
    finally { setSaving(false); }
  }
  async function deleteArea(area) {
    if (area.legacy || !window.confirm(`Delete "${area.name}" and every surface and deduction inside it?`)) return;
    try {
      await api.delete(`/quotations/rooms/${area.id}/`);
      if (String(activeAreaId) === String(area.id)) setActiveAreaId("");
      await load();
    } catch (requestError) { setError(requestMessage(requestError, "Area could not be deleted.")); }
  }

  function openSurfaceDialog(surface = null, preferredGroup = null) {
    const label = surface ? groupLabel(surface) : preferredGroup?.label || "Wall";
    setEditing(surface);
    setSurfaceDraft(surface ? {
      surfaceLabel: label, name: surface.name, length: String(surface.length || ""),
      breadth: String(surface.breadth || ""), quantity: surface.quantity || 1,
    } : {
      ...blankSurface,
      surfaceLabel: label,
      name: `${label} ${(preferredGroup?.surfaces.length || activeGroups.find((group) => group.label === label)?.surfaces.length || 0) + 1}`,
    });
    setDialog("surface");
  }
  function resolveSurfaceType(label) {
    const found = SURFACE_TYPES.find(([, name]) => name.toLowerCase() === label.trim().toLowerCase());
    if (!found && ["grill", "grills", "railing"].includes(label.trim().toLowerCase())) {
      return ["GRILL", label.trim()];
    }
    return found || ["OTHER", label.trim()];
  }
  async function saveSurface(event) {
    event.preventDefault();
    const [surfaceType, selectedLabel] = resolveSurfaceType(surfaceDraft.surfaceLabel);
    if (!selectedLabel) {
      setError("Select or enter a surface type.");
      return;
    }
    if (number(surfaceDraft.length) <= 0 || number(surfaceDraft.breadth) <= 0) {
      setError("Enter a valid length and width / height greater than zero.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        work_area: workArea, surface_type: surfaceType,
        area_group_name: surfaceType === "OTHER" ? selectedLabel : "",
        name: surfaceDraft.name.trim() || `${selectedLabel} 1`,
        length: number(surfaceDraft.length), breadth: number(surfaceDraft.breadth),
        manual_area: 0, quantity: Math.max(1, parseInt(surfaceDraft.quantity, 10) || 1),
        paintable_sides: 1, room: activeAreaId === "exterior" ? null : Number(activeAreaId),
      };
      const saved = editing
        ? (await api.patch(`/quotations/measurements/${editing.id}/`, payload)).data
        : (await api.post(`/quotations/properties/${id}/measurements/`, payload, { params: query })).data;
      if (!measurementId && saved.measurement_record) setSearchParams({ measurement: String(saved.measurement_record) });
      else await load();
      setDialog("");
      setEditing(null);
      setError("");
    } catch (requestError) { setError(requestMessage(requestError, "Surface could not be saved.")); }
    finally { setSaving(false); }
  }
  async function saveSurfaceBatch(surfaceLabel, rows, saveForFuture = false) {
    const [surfaceType, selectedLabel] = resolveSurfaceType(surfaceLabel);
    const completed = rows.filter((row) =>
      row.name.trim() && number(row.length) > 0 && number(row.breadth) > 0
    );
    if (!selectedLabel || !completed.length || completed.length !== rows.length) {
      setError("Complete every surface line with a name, length and width / height.");
      return false;
    }
    setSaving(true);
    try {
      if (surfaceType === "OTHER" && saveForFuture) {
        const savedType = (await api.post("/quotations/measurement-surface-types/", { name: selectedLabel })).data;
        setSurfaceTypes((current) => current.some((item) => item.id === savedType.id) ? current : [...current, savedType]);
      }
      let activeRecordId = measurementId;
      for (const row of completed) {
        const response = await api.post(`/quotations/properties/${id}/measurements/`, {
          work_area: workArea,
          surface_type: surfaceType,
          area_group_name: surfaceType === "OTHER" ? selectedLabel : "",
          name: row.name.trim(),
          length: number(row.length),
          breadth: number(row.breadth),
          manual_area: 0,
          quantity: Math.max(1, parseInt(row.quantity, 10) || 1),
          paintable_sides: 1,
          room: activeAreaId === "exterior" ? null : Number(activeAreaId),
        }, { params: activeRecordId ? { measurement: activeRecordId } : { new: 1 } });
        activeRecordId = activeRecordId || response.data.measurement_record;
      }
      if (!measurementId && activeRecordId) setSearchParams({ measurement: String(activeRecordId) });
      else await load();
      setError("");
      return true;
    } catch (requestError) {
      setError(requestMessage(requestError, "Surface measurements could not be saved."));
      await load();
      return false;
    } finally { setSaving(false); }
  }
  async function deleteSurface(surface) {
    if ((surface.openings || []).length) {
      setError("Delete the deductions linked to this surface group before deleting this surface.");
      return;
    }
    if (!window.confirm(`Delete "${surface.name}"?`)) return;
    try { await api.delete(`/quotations/measurements/${surface.id}/`); await load(); }
    catch (requestError) { setError(requestMessage(requestError, "Surface could not be deleted.")); }
  }

  function openDeductionDialog(opening = null, group = null) {
    const target = opening ? openingKey(opening, opening.parentSurface) : group?.key || activeGroups[0]?.key || "";
    setEditing(opening);
    setDeductionDraft(opening ? {
      type: opening.opening_type === "STAIR_OPENING" ? "Stair Opening" : opening.opening_type.charAt(0) + opening.opening_type.slice(1).toLowerCase(),
      name: opening.name || "", width: String(opening.width || ""), height: String(opening.height || ""),
      quantity: opening.quantity || 1, target, deduct: opening.effect !== "ADD",
    } : { ...blankDeduction, target });
    setDialog("deduction");
  }
  async function saveDeduction(event) {
    event.preventDefault();
    const group = activeGroups.find((item) => item.key === deductionDraft.target);
    const anchor = group?.surfaces[0];
    if (!anchor) { setError("Add a surface before adding a deduction to it."); return; }
    setSaving(true);
    try {
      const custom = group.key.startsWith("OTHER:");
      const payload = {
        opening_type: deductionDraft.type.toUpperCase().replaceAll(" ", "_"),
        name: deductionDraft.name.trim() || deductionDraft.type,
        width: number(deductionDraft.width), height: number(deductionDraft.height),
        quantity: Math.max(1, parseInt(deductionDraft.quantity, 10) || 1),
        deduction_mode: deductionDraft.deduct ? "FULL" : "IGNORE",
        deduction_percentage: deductionDraft.deduct ? 100 : 0,
        effect: deductionDraft.deduct ? "DEDUCT" : "ADD",
        deduct_from_surface_type: custom ? "OTHER" : group.key,
        deduct_from_group_name: custom ? group.label : "",
      };
      if (editing && openingKey(editing, editing.parentSurface) === group.key) {
        await api.patch(`/quotations/measurement-openings/${editing.id}/`, payload);
      } else {
        if (editing) await api.delete(`/quotations/measurement-openings/${editing.id}/`);
        await api.post(`/quotations/measurements/${anchor.id}/openings/`, payload);
      }
      await load();
      setDialog("");
      setEditing(null);
      setError("");
    } catch (requestError) { setError(requestMessage(requestError, "Deduction could not be saved.")); }
    finally { setSaving(false); }
  }
  async function deleteDeduction(opening) {
    if (!window.confirm(`Delete "${opening.name || opening.opening_type}" deduction?`)) return;
    try { await api.delete(`/quotations/measurement-openings/${opening.id}/`); await load(); }
    catch (requestError) { setError(requestMessage(requestError, "Deduction could not be deleted.")); }
  }

  if (!property) return <div className="grid min-h-[50vh] place-items-center text-slate-500">{error || "Loading Area Calculator..."}</div>;
  const linearUnit = property.linear_unit_label || (property.measurement_unit === "METRES" ? "m" : "ft");
  const liveMultiplier = property.measurement_unit === "METRES" ? 10.7639104167 : 1;
  const liveSurfaceArea = number(surfaceDraft.length) * number(surfaceDraft.breadth) * Math.max(1, number(surfaceDraft.quantity)) * liveMultiplier;
  const liveDeductionArea = number(deductionDraft.width) * number(deductionDraft.height) * Math.max(1, number(deductionDraft.quantity)) * liveMultiplier;

  return (
    <main className="bp-calculator -m-4 min-h-screen bg-[#f4f6f9] pb-24 text-[#12345b] sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      <div className="mx-auto max-w-7xl p-4 sm:p-0">
        {!activeArea ? (
          <AreaList property={property} record={record} areas={areas} summaries={areaSummaries}
            totals={totals} openArea={openAreaDialog} deleteArea={deleteArea}
            viewArea={setViewingArea}
            downloadPdf={downloadPdf} submitMeasurement={submitMeasurement} submitting={saving} measurementId={measurementId} isNew={isNew} />
        ) : (
          <AreaDetail area={activeArea} groups={activeGroups} summary={activeSummary} tab={tab}
            setTab={setTab} back={() => setActiveAreaId("")}
            editRoom={() => openAreaDialog(activeArea)}
            editSurface={openSurfaceDialog}
            deleteSurface={deleteSurface} addDeduction={(group) => openDeductionDialog(null, group)}
            editDeduction={openDeductionDialog} deleteDeduction={deleteDeduction}
            surfaceTypes={surfaceTypes} saveSurfaceBatch={saveSurfaceBatch}
            saving={saving} unit={linearUnit} multiplier={liveMultiplier} />
        )}
        {error && <div className="fixed inset-x-4 top-4 z-[80] mx-auto flex max-w-xl items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-xl"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}
      </div>
      {activeArea && <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-[#dbe4ef] bg-white px-4 py-3 shadow-[0_-8px_25px_rgba(15,23,42,.10)] md:hidden">
        <div><p className="text-[11px] text-slate-500">Net area</p><b>{areaText(activeSummary.net)}</b></div>
        <button onClick={() => setActiveAreaId("")} className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-[#0056d2] px-6 font-bold text-white"><Check className="h-5 w-5" />Save Area</button>
      </div>}
      {dialog === "area" && <AreaDialog draft={areaDraft} setDraft={setAreaDraft} editing={editing} save={saveArea} close={() => setDialog("")} saving={saving} roomTypes={selectableRoomTypes} />}
      {dialog === "surface" && <SurfaceDialog draft={surfaceDraft} setDraft={setSurfaceDraft} save={saveSurface} close={() => setDialog("")} saving={saving} unit={linearUnit} liveArea={liveSurfaceArea} editing={editing} />}
      {dialog === "deduction" && <DeductionDialog draft={deductionDraft} setDraft={setDeductionDraft} groups={activeGroups} save={saveDeduction} close={() => setDialog("")} saving={saving} unit={linearUnit} liveArea={liveDeductionArea} editing={editing} />}
      {viewingArea && <AreaViewDialog area={viewingArea} summary={areaSummaries.get(String(viewingArea.id))} close={() => setViewingArea(null)} edit={() => { setViewingArea(null); setActiveAreaId(String(viewingArea.id)); setTab("surfaces"); }} />}
    </main>
  );
}

function AreaList({ property, record, areas, summaries, totals, openArea, deleteArea, viewArea, downloadPdf, submitMeasurement, submitting, measurementId, isNew }) {
  const location = useLocation();
  const navigate = useNavigate();
  const waitingForFirstSave = isNew && !measurementId;
  const goBack = () => {
    if (location.key && location.key !== "default") navigate(-1);
    else navigate(`/properties/${property.id}`);
  };
  return <div className="space-y-4">
    <header className="rounded-2xl border border-[#e1e7ef] bg-white p-4 shadow-sm sm:p-6">
      <button type="button" onClick={goBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0056d2]"><ArrowLeft className="h-4 w-4" />Back</button>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold sm:text-3xl">Measurements</h1>
            <button disabled={waitingForFirstSave} onClick={downloadPdf} title={waitingForFirstSave ? "Save the first room to create the Area Calculation" : "View PDF"} className="inline-flex min-h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"><Download className="h-4 w-4" />View</button>
            {waitingForFirstSave
              ? <button type="button" disabled title="Save the first room to create the Area Calculation" className="inline-flex min-h-10 cursor-not-allowed items-center gap-2 rounded-lg bg-[#f58220] px-3 text-sm font-bold text-white opacity-40"><FilePlus2 className="h-4 w-4" />New Quotation</button>
              : <Link to={`/quotations/new?customer=${property.customer}&property=${property.id}${measurementId ? `&measurement=${measurementId}` : ""}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#f58220] px-3 text-sm font-bold text-white"><FilePlus2 className="h-4 w-4" />New Quotation</Link>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-600">{record?.submitted_at ? "Submitted to customer. Editing will make this calculation private until resubmitted." : "Private draft. Customers cannot see this calculation until you submit it."}</p>
            <button type="button" onClick={submitMeasurement} disabled={submitting || !totals.surfaces || !!record?.submitted_at} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{submitting ? "Submitting..." : record?.submitted_at ? "Submitted to Customer" : "Submit to Customer"}</button>
          </div>
          <p className="mt-1 font-semibold">{property.name || property.property_type}</p>
          <p className="text-sm text-slate-500">{property.property_type}{property.city ? ` " ${property.city}` : ""}</p>
        </div>
      </div>
    </header>
    <section className="grid grid-cols-3 gap-2 sm:gap-4">
      <StatCard label="Total measured area" value={areaText(totals.net)} />
      <StatCard label="Total surfaces" value={totals.surfaces} />
      <StatCard label="Total deductions" value={totals.deductions} />
    </section>
    <section className="rounded-2xl border border-[#e1e7ef] bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-lg font-extrabold">Areas</h2><p className="hidden text-sm text-slate-500 sm:block">Rooms and custom work areas.</p></div>
        <button onClick={() => openArea()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0056d2] px-4 font-bold text-white"><Plus className="h-4 w-4" />Add Room</button>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {areas.map((area) => {
          const summary = summaries.get(String(area.id)) || { surfaceCount: 0, deductions: 0, net: 0 };
          return <article key={area.id} className="group rounded-xl border border-[#e1e7ef] bg-white p-3 transition hover:border-blue-300 hover:shadow-md">
            <button onClick={() => viewArea(area)} className="flex w-full min-w-0 items-center gap-3 text-left">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0056d2]"><Layers3 className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-extrabold"><span className="truncate">{area.name}</span>{summary.surfaceCount > 0 && <Check className="h-4 w-4 shrink-0 rounded-full bg-emerald-600 p-0.5 text-white" />}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{summary.surfaceCount ? `${summary.surfaceCount} Surfaces " ${summary.deductions} Deductions` : "Not measured yet"}</span>
                {summary.surfaceCount > 0 && <b className="mt-1 block text-sm">{areaText(summary.net)}</b>}
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
            </button>
            {!area.legacy && <div className="mt-3 flex items-center justify-end border-t pt-3"><button title="Delete room" onClick={() => deleteArea(area)} className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div>}
          </article>;
        })}
        {!areas.length && <div className="rounded-xl border border-dashed p-10 text-center text-slate-500 lg:col-span-2"><Ruler className="mx-auto mb-3 h-8 w-8" />Add the first room or area to begin.</div>}
      </div>
    </section>
  </div>;
}

function StatCard({ label, value }) {
  return <div className="rounded-xl border border-blue-100 bg-gradient-to-b from-blue-50 to-white p-3 text-center shadow-sm sm:p-5">
    <p className="text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-500 sm:text-xs">{label}</p>
    <p className="mt-2 text-lg font-extrabold text-[#064a9b] sm:text-2xl">{value}</p>
  </div>;
}

function AreaDetail({ area, groups, summary, tab, setTab, back, editRoom, editSurface, deleteSurface, addDeduction, editDeduction, deleteDeduction, surfaceTypes, saveSurfaceBatch, saving, unit, multiplier }) {
  const adjustments = groups.flatMap((group) => [
    ...group.deductions.map((item) => ({ ...item, targetLabel: group.label })),
    ...group.additions.map((item) => ({ ...item, targetLabel: group.label })),
  ]);
  return <div className="space-y-4">
    <header className="rounded-2xl border border-[#e1e7ef] bg-white p-4 shadow-sm sm:p-6">
      <button onClick={back} className="inline-flex items-center gap-2 text-sm font-bold text-[#0056d2]"><ArrowLeft className="h-4 w-4" />Back to Areas</button>
      <div className="mt-3 flex items-start justify-between gap-3"><div><h1 className="text-2xl font-extrabold">{area.name}</h1><p className="text-sm text-slate-500">{area.section || "Area Measurement"}</p></div>{!area.legacy && <button onClick={editRoom} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-bold"><Pencil className="h-4 w-4" />Change Room</button>}</div>
      <nav className="mt-5 grid grid-cols-3 rounded-xl bg-[#f1f5f9] p-1">
        {[["surfaces", "Surfaces"], ["deductions", "Deduct / Add"], ["summary", "Summary"]].map(([key, label]) =>
          <button key={key} onClick={() => setTab(key)} className={`min-h-11 rounded-lg text-sm font-bold transition ${tab === key ? "bg-[#0056d2] text-white shadow" : "text-slate-600"}`}>{label}</button>)}
      </nav>
    </header>
    {tab === "surfaces" && <SurfaceTab groups={groups} editSurface={editSurface} deleteSurface={deleteSurface} surfaceTypes={surfaceTypes} saveBatch={saveSurfaceBatch} saving={saving} unit={unit} multiplier={multiplier} />}
    {tab === "deductions" && <DeductionTab groups={groups} deductions={adjustments} addDeduction={addDeduction} editDeduction={editDeduction} deleteDeduction={deleteDeduction} />}
    {tab === "summary" && <SummaryTab groups={groups} summary={summary} deductions={adjustments} />}
  </div>;
}

function SurfaceTab({ groups, editSurface, deleteSurface, surfaceTypes, saveBatch, saving, unit, multiplier }) {
  const catalog = [...new Set([...SURFACE_TYPES.filter(([key]) => key !== "OTHER").map(([, label]) => label), ...surfaceTypes.map((item) => item.name)])];
  const [selected, setSelected] = useState("");
  const [surfaceSearch, setSurfaceSearch] = useState("");
  const [surfaceMenuOpen, setSurfaceMenuOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [saveForFuture, setSaveForFuture] = useState(false);
  const known = catalog.some((name) => name.toLowerCase() === selected.trim().toLowerCase());
  const filteredSurfaces = catalog.filter((name) => name.toLowerCase().includes(surfaceSearch.trim().toLowerCase()));
  const choose = (value) => {
    setSelected(value);
    setSurfaceSearch(value);
    setSurfaceMenuOpen(false);
    const count = groups.find((group) => group.label.toLowerCase() === value.toLowerCase())?.surfaces.length || 0;
    setRows(value ? [{ name: `${value} ${count + 1}`, length: "", breadth: "", quantity: 1 }] : []);
    setSaveForFuture(false);
  };
  const updateRow = (index, key, value) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const addRow = () => setRows((current) => [...current, { name: `${selected} ${current.length + (groups.find((group) => group.label.toLowerCase() === selected.toLowerCase())?.surfaces.length || 0) + 1}`, length: "", breadth: "", quantity: 1 }]);
  const total = rows.reduce((sum, row) => sum + number(row.length) * number(row.breadth) * Math.max(1, number(row.quantity)) * multiplier, 0);
  const submit = async () => { if (await saveBatch(selected, rows, saveForFuture)) { setSelected(""); setSurfaceSearch(""); setRows([]); } };
  return <section className="rounded-2xl border border-[#e1e7ef] bg-white p-4 shadow-sm sm:p-6">
    <div><h2 className="text-lg font-extrabold">Select surface</h2><p className="text-sm text-slate-500">Choose Wall, Ceiling, Floor or another saved surface.</p></div>
    <div className="relative mt-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={surfaceSearch}
          onFocus={() => setSurfaceMenuOpen(true)}
          onChange={(event) => { setSurfaceSearch(event.target.value); setSelected(""); setRows([]); setSurfaceMenuOpen(true); }}
          placeholder="Search surface: Wall, Ceiling, Floor..."
          className={`${inputClass} pl-10 pr-10`}
          role="combobox"
          aria-expanded={surfaceMenuOpen}
        />
        <button type="button" onClick={() => setSurfaceMenuOpen((open) => !open)} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Show surface choices"><ChevronRight className={`h-4 w-4 transition-transform ${surfaceMenuOpen ? "rotate-90" : ""}`} /></button>
      </div>
      {surfaceMenuOpen && <div className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
        {filteredSurfaces.map((name) => <button key={name} type="button" onClick={() => choose(name)} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-blue-50 hover:text-[#0056d2]"><span>{name}</span>{selected.toLowerCase() === name.toLowerCase() && <Check className="h-4 w-4" />}</button>)}
        {surfaceSearch.trim() && !catalog.some((name) => name.toLowerCase() === surfaceSearch.trim().toLowerCase()) && <button type="button" onClick={() => choose(surfaceSearch.trim())} className="flex w-full items-center gap-2 rounded-lg border-t px-3 py-3 text-left text-sm font-bold text-[#0056d2]"><Plus className="h-4 w-4" />Use new surface "{surfaceSearch.trim()}"</button>}
        {!filteredSurfaces.length && !surfaceSearch.trim() && <p className="px-3 py-4 text-sm text-slate-500">No saved surfaces.</p>}
      </div>}
    </div>
    {selected && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/40 p-3 sm:p-4">
      <div className="flex items-center justify-between"><div><h3 className="font-extrabold">{selected} measurements</h3><p className="text-xs text-slate-500">Enter as many lines as required, then save once.</p></div><button type="button" onClick={addRow} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold text-[#0056d2]"><Plus className="mr-1 inline h-4 w-4" />Add line</button></div>
      <div className="mt-3 space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="rounded-xl border bg-white p-3">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input value={row.name} onChange={(event) => updateRow(index, "name", event.target.value)} placeholder="Name" aria-label="Surface name" className={inputClass} />
              <button type="button" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="mt-1.5 h-12 rounded-lg border border-red-200 px-3 text-red-600" aria-label={`Delete ${row.name || "surface"}`}><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <input type="number" inputMode="decimal" min="0.01" step="0.01" value={row.length} onChange={(event) => updateRow(index, "length", event.target.value)} placeholder={`Length (${unit})`} aria-label={`Length in ${unit}`} className={`${inputClass} !mt-0 min-w-0`} />
              <input type="number" inputMode="decimal" min="0.01" step="0.01" value={row.breadth} onChange={(event) => updateRow(index, "breadth", event.target.value)} placeholder={`Width / Height (${unit})`} aria-label={`Width or height in ${unit}`} className={`${inputClass} !mt-0 min-w-0`} />
              <input type="number" inputMode="numeric" min="1" value={row.quantity} onChange={(event) => updateRow(index, "quantity", event.target.value)} placeholder="Qty" aria-label="Quantity" className={`${inputClass} !mt-0 min-w-0`} />
            </div>
          </div>
        ))}
      </div>
      {!known && <label className="mt-3 flex items-center gap-2 rounded-lg bg-white p-3 text-sm font-semibold"><input type="checkbox" checked={saveForFuture} onChange={(event) => setSaveForFuture(event.target.checked)} />Save "{selected}" for future calculations</label>}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white p-3"><div><small className="block text-slate-500">{selected} total</small><b className="text-xl text-[#064a9b]">{areaText(total)}</b></div><button type="button" disabled={saving || !rows.length} onClick={submit} className="min-h-12 rounded-lg bg-[#0056d2] px-5 font-bold text-white disabled:opacity-40">{saving ? "Saving..." : `Save ${selected}`}</button></div>
    </div>}
    <h3 className="mt-6 font-extrabold">Saved surfaces</h3>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {groups.map((group) => <article key={group.key} className="overflow-hidden rounded-xl border border-[#e1e7ef]">
        <header className="flex items-center justify-between bg-[#f5f8fc] px-4 py-3"><div><h3 className="font-extrabold uppercase tracking-wide">{group.label}</h3><p className="text-xs text-slate-500">{group.surfaces.length} measurement{group.surfaces.length === 1 ? "" : "s"}</p></div><button onClick={() => { choose(group.label); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold text-[#0056d2]"><Plus className="mr-1 inline h-3.5 w-3.5" />Add</button></header>
        <div className="divide-y divide-[#e1e7ef]">
          {group.surfaces.map((surface) => <div key={surface.id} className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#0056d2]"><Layers3 className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><b className="block truncate">{surface.name}</b><p className="text-xs text-slate-500">{surface.length} x {surface.breadth} x {surface.quantity}</p></div>
            <b className="shrink-0 text-sm">{areaText(surface.gross_area)}</b>
            <button onClick={() => editSurface(surface)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
            <button onClick={() => deleteSurface(surface)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
          </div>)}
        </div>
        <footer className="flex justify-between bg-blue-50 px-4 py-3 text-sm"><span>Gross {group.label}</span><b>{areaText(group.gross)}</b></footer>
      </article>)}
      {!groups.length && <div className="rounded-xl border border-dashed p-10 text-center text-slate-500 lg:col-span-2">No surfaces added. Select Add Surface to begin.</div>}
    </div>
  </section>;
}

function DeductionTab({ groups, deductions, addDeduction, editDeduction, deleteDeduction }) {
  return <section className="rounded-2xl border border-[#e1e7ef] bg-white p-4 shadow-sm sm:p-6">
    <div className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold">Deductions / Additions</h2><p className="text-sm text-slate-500">Select the target surface total, then choose whether the area is deducted or added.</p></div><button disabled={!groups.length} onClick={() => addDeduction(groups[0])} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0056d2] px-4 font-bold text-white disabled:opacity-40"><Plus className="h-4 w-4" />Add item</button></div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {deductions.map((item) => <article key={item.id} className="rounded-xl border border-[#e1e7ef] p-4">
        <div className="flex items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg font-extrabold ${item.effect === "ADD" ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-[#f58220]"}`}>{item.effect === "ADD" ? "+" : "-"}</span><div className="min-w-0 flex-1"><b>{item.name || item.opening_type.replaceAll("_", " ")}</b><p className="mt-1 text-xs text-slate-500">{item.width} x {item.height} x {item.quantity}</p><p className="mt-1 text-xs font-semibold text-[#0056d2]">{item.effect === "ADD" ? "Add to" : "Deduct from"}: {item.targetLabel}</p></div><b className={`text-sm ${item.effect === "ADD" ? "text-emerald-700" : "text-orange-700"}`}>{item.effect === "ADD" ? "+" : "-"}{areaText(item.effect === "ADD" ? item.area : item.effective_deduction)}</b></div>
        <div className="mt-3 flex justify-end gap-2 border-t pt-3"><button onClick={() => editDeduction(item)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold"><Pencil className="h-3.5 w-3.5" />Edit</button><button onClick={() => deleteDeduction(item)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600"><Trash2 className="h-3.5 w-3.5" />Delete</button></div>
      </article>)}
      {!deductions.length && <div className="rounded-xl border border-dashed p-10 text-center text-slate-500 lg:col-span-2">No deductions added.</div>}
    </div>
  </section>;
}

function SummaryTab({ groups, summary, deductions }) {
  return <div className="space-y-4">
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4"><SummaryStat tone="blue" label="Total gross area" value={summary.gross} /><SummaryStat tone="orange" label="Total deductions" value={summary.deductionArea} /><SummaryStat tone="blue" label="Total additions" value={summary.additionArea} /><SummaryStat tone="green" label="Net area" value={summary.net} /></section>
    <section className="rounded-2xl border border-[#e1e7ef] bg-white p-4 shadow-sm sm:p-6"><h2 className="font-extrabold">Surface-wise details</h2>
      <div className="mt-3 space-y-2">{groups.map((group) => <div key={group.key} className="grid grid-cols-[1.4fr_repeat(3,1fr)] gap-2 rounded-lg border p-3 text-right text-xs sm:text-sm"><b className="text-left">{group.label}</b><span><small className="block text-slate-400">Gross</small>{group.gross.toFixed(0)}</span><span><small className="block text-slate-400">Deduction</small>{group.deduction.toFixed(0)}</span><b><small className="block font-normal text-slate-400">Net</small>{group.net.toFixed(0)}</b></div>)}</div>
    </section>
    {deductions.length > 0 && <section className="rounded-2xl border border-[#e1e7ef] bg-white p-4 shadow-sm sm:p-6"><h2 className="font-extrabold">Deduction / addition details</h2><div className="mt-3 space-y-2">{deductions.map((item) => <div key={item.id} className="grid grid-cols-[1.2fr_1fr_.5fr_1fr] gap-2 rounded-lg bg-[#f5f8fc] p-3 text-xs sm:text-sm"><b>{item.name || item.opening_type}</b><span>{item.width} x {item.height}</span><span>Qty {item.quantity}</span><span className={`text-right font-bold ${item.effect === "ADD" ? "text-emerald-700" : "text-orange-700"}`}>{item.effect === "ADD" ? "+" : "-"}{areaText(item.effect === "ADD" ? item.area : item.effective_deduction)}</span></div>)}</div></section>}
  </div>;
}

function SummaryStat({ tone, label, value }) {
  const colors = { blue: "border-blue-100 bg-blue-50 text-blue-800", orange: "border-orange-100 bg-orange-50 text-orange-700", green: "border-emerald-100 bg-emerald-50 text-emerald-700" };
  return <div className={`rounded-xl border p-3 text-center sm:p-5 ${colors[tone]}`}><p className="text-[10px] font-bold uppercase leading-tight sm:text-xs">{label}</p><b className="mt-2 block text-lg sm:text-2xl">{number(value).toFixed(0)}</b><small>sq.ft</small></div>;
}

function AreaViewDialog({ area, summary, close, edit }) {
  const groups = summary?.groups || [];
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const toggleGroup = (key) => setOpenGroups((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  return <DialogShell title={area.name} close={close}>
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid grid-cols-3 gap-2">
        <SummaryStat tone="blue" label="Gross area" value={summary?.gross || 0} />
        <SummaryStat tone="orange" label="Deductions" value={summary?.deductionArea || 0} />
        <SummaryStat tone="green" label="Net area" value={summary?.net || 0} />
      </div>
      <div className="space-y-3">
        {groups.map((group) => {
          const open = openGroups.has(group.key);
          return <section key={group.key} className="overflow-hidden rounded-xl border border-[#e1e7ef]">
            <button type="button" onClick={() => toggleGroup(group.key)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 bg-[#f5f8fc] px-4 py-3 text-left">
              <span className="min-w-0 flex-1"><b>{group.label}</b><span className="block text-xs text-slate-500">{group.surfaces.length} measurement{group.surfaces.length === 1 ? "" : "s"}</span></span>
              <b className="shrink-0">{areaText(group.net)}</b>
              <ChevronRight className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`} />
            </button>
            {open && <>
              <div className="divide-y">{group.surfaces.map((surface) => <div key={surface.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-sm"><span><b className="block">{surface.name}</b><small className="text-slate-500">{surface.length} x {surface.breadth} x {surface.quantity}</small></span><b>{areaText(surface.gross_area)}</b></div>)}</div>
              {(group.deduction > 0 || group.addition > 0) && <footer className="grid grid-cols-3 gap-2 border-t bg-white px-4 py-3 text-center text-xs"><span>Gross<b className="block">{group.gross.toFixed(0)}</b></span><span>Deduct / Add<b className="block">-{group.deduction.toFixed(0)} / +{group.addition.toFixed(0)}</b></span><span>Net<b className="block">{group.net.toFixed(0)}</b></span></footer>}
            </>}
          </section>;
        })}
        {!groups.length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No measurements saved for this room.</p>}
      </div>
      <button onClick={edit} className="min-h-12 w-full rounded-lg bg-[#0056d2] font-bold text-white"><Pencil className="mr-2 inline h-4 w-4" />Edit Measurements</button>
    </div>
  </DialogShell>;
}

const inputClass = "mt-1.5 h-12 w-full rounded-lg border border-[#d6e0eb] bg-white px-3 text-base outline-none focus:border-[#0056d2] focus:ring-2 focus:ring-blue-100";
function DialogShell({ title, close, children }) {
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-5" onMouseDown={close}>
    <section onMouseDown={(event) => event.stopPropagation()} className="max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-4 sm:px-6"><h2 className="text-xl font-extrabold">{title}</h2><button type="button" onClick={close} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></header>
      {children}
    </section>
  </div>;
}
function AreaDialog({ draft, setDraft, editing, save, close, saving, roomTypes }) {
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  return <DialogShell title={editing ? "Change Room" : "Add Room"} close={close}><form onSubmit={save} className="space-y-4 p-4 sm:p-6">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
      <label className="block min-w-0 text-sm font-bold">Select Room / Area *<select required={!draft.isCustom} value={draft.isCustom ? "" : draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value, isCustom: false, saveForFuture: false }))} className={inputClass}><option value="">Choose room</option>{roomTypes.map((type) => <option key={type.id} value={type.name}>{type.name}</option>)}</select></label>
      <button type="button" onClick={() => setDraft((current) => ({ ...current, name: "", isCustom: true }))} className={`mb-0.5 min-h-12 rounded-lg border px-4 text-sm font-bold transition ${draft.isCustom ? "border-[#0056d2] bg-blue-50 text-[#0056d2]" : "border-slate-300 bg-white text-slate-800 hover:border-[#0056d2]"}`}><Plus className="mr-1 inline h-4 w-4" />New Room</button>
    </div>
    {draft.isCustom && <><label className="block text-sm font-bold">Room / Area Name *<input required value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="Example: Terrace, Reception" className={inputClass} /></label><label className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm font-semibold"><input type="checkbox" checked={draft.saveForFuture} onChange={(event) => update("saveForFuture", event.target.checked)} />Save this room type for future use</label></>}
    <button disabled={saving} className="min-h-12 w-full rounded-lg bg-[#0056d2] font-bold text-white disabled:opacity-50">{saving ? "Saving..." : editing ? "Save and Continue" : "Next"}</button>
  </form></DialogShell>;
}
function SurfaceDialog({ draft, setDraft, save, close, saving, unit, liveArea, editing }) {
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  return <DialogShell title={editing ? "Edit Surface" : "Add Surface"} close={close}><form onSubmit={save} className="space-y-4 p-4 sm:p-6">
    <label className="block text-sm font-bold">Surface Type *<div className="relative"><Search className="absolute left-3 top-5 h-4 w-4 text-slate-400" /><input required list="surface-types" value={draft.surfaceLabel} onChange={(event) => update("surfaceLabel", event.target.value)} placeholder="Search or enter a custom surface" className={`${inputClass} pl-10`} /></div><datalist id="surface-types">{SURFACE_TYPES.filter(([key]) => key !== "OTHER").map(([, label]) => <option key={label} value={label} />)}</datalist><small className="mt-1 block font-normal text-slate-500">Type a new name to create a custom surface type.</small></label>
    <label className="block text-sm font-bold">Label / Name *<input required value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="Floor 1" className={inputClass} /></label>
    <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-bold">Length ({unit}) *<input required type="number" inputMode="decimal" min="0.01" step="0.01" value={draft.length} onChange={(event) => update("length", event.target.value)} className={inputClass} /></label><label className="block text-sm font-bold">Width / Height ({unit}) *<input required type="number" inputMode="decimal" min="0.01" step="0.01" value={draft.breadth} onChange={(event) => update("breadth", event.target.value)} className={inputClass} /></label></div>
    <label className="block text-sm font-bold">Quantity<input type="number" inputMode="numeric" min="1" step="1" value={draft.quantity} onChange={(event) => update("quantity", event.target.value)} className={inputClass} /></label>
    <div className="flex items-end justify-between rounded-xl bg-blue-50 p-4"><div><p className="text-xs font-bold uppercase text-blue-700">Calculated area</p><small>{draft.length || 0} x {draft.breadth || 0} x {draft.quantity || 1}</small></div><b className="text-xl text-[#064a9b]">{areaText(liveArea)}</b></div>
    <button disabled={saving} className="min-h-12 w-full rounded-lg bg-[#0056d2] font-bold text-white disabled:opacity-50">{saving ? "Saving..." : "Save Surface"}</button>
  </form></DialogShell>;
}
function DeductionDialog({ draft, setDraft, groups, save, close, saving, unit, liveArea, editing }) {
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  return <DialogShell title={editing ? "Edit Deduction / Addition" : "Add Deduction / Addition"} close={close}><form onSubmit={save} className="space-y-4 p-4 sm:p-6">
    <label className="block text-sm font-bold">Apply To *<select required value={draft.target} onChange={(event) => update("target", event.target.value)} className={inputClass}><option value="">Select Walls, Ceiling, Floor...</option>{groups.filter((group) => group.surfaces.length).map((group) => <option key={group.key} value={group.key}>{group.label} ({areaText(group.gross)})</option>)}</select></label>
    <label className="block text-sm font-bold">Item Type *<select required value={draft.type} onChange={(event) => update("type", event.target.value)} className={inputClass}>{DEDUCTION_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
    <label className="block text-sm font-bold">Label / Name<input value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder={draft.type} className={inputClass} /></label>
    <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-bold">Width / Length ({unit}) *<input required type="number" inputMode="decimal" min="0.01" step="0.01" value={draft.width} onChange={(event) => update("width", event.target.value)} className={inputClass} /></label><label className="block text-sm font-bold">Height / Width ({unit}) *<input required type="number" inputMode="decimal" min="0.01" step="0.01" value={draft.height} onChange={(event) => update("height", event.target.value)} className={inputClass} /></label></div>
    <label className="block text-sm font-bold">Quantity<input type="number" inputMode="numeric" min="1" step="1" value={draft.quantity} onChange={(event) => update("quantity", event.target.value)} className={inputClass} /></label>
    <label className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4"><input type="checkbox" checked={draft.deduct} onChange={(event) => update("deduct", event.target.checked)} className="mt-1 h-5 w-5" /><span><b className="block">Deduct from selected surface total</b><small className="text-slate-600">Uncheck to add this area to the selected surface total.</small></span></label>
    <div className={`flex items-end justify-between rounded-xl p-4 ${draft.deduct ? "bg-orange-50" : "bg-emerald-50"}`}><div><p className={`text-xs font-bold uppercase ${draft.deduct ? "text-orange-700" : "text-emerald-700"}`}>{draft.deduct ? "Deduction area" : "Addition area"}</p><small>{draft.width || 0} x {draft.height || 0} x {draft.quantity || 1}</small></div><b className={`text-xl ${draft.deduct ? "text-orange-700" : "text-emerald-700"}`}>{areaText(liveArea)}</b></div>
    <button disabled={saving} className="min-h-12 w-full rounded-lg bg-[#0056d2] font-bold text-white disabled:opacity-50">{saving ? "Saving..." : draft.deduct ? "Save Deduction" : "Save Addition"}</button>
  </form></DialogShell>;
}
