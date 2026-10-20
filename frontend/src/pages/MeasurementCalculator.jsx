import { ROOM_CATEGORIES, roomCategory } from "../utils/roomClassification.js";
import { combinedSurfaceCategoryTotals } from "../utils/paintingMeasurements.js";
import { surfaceLabel } from "../utils/groupedQuotation.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Check, ChevronRight, Download, Eye, FilePlus2, Layers3, MoreHorizontal,
  Pencil, Plus, Ruler, Search, Trash2, X,
} from "lucide-react";
import api from "../api/client";
import { previewPdf } from "../components/PdfPreview";
import { ErrorState, LoadingState, StatusBadge } from "../components/ui";
import "./quotation-measurement.css";
import { measurementRoomTable, roomMeasurementSurfaces } from "../utils/measurementRoomTable";
import useAuth from "../context/useAuth";
import OfflineQueueStatus from "../components/OfflineQueueStatus";
import { enqueueOfflineOperation, listOfflineOperations } from "../utils/offlineOperationQueue";
import { measurementEditState } from "../utils/measurementEditState.js";

const SURFACE_TYPES = [
  ["WALL", "Wall"], ["CEILING", "Ceiling"], ["FLOOR", "Floor"],
  ["WOOD_WORK", "Wood Work"], ["TILE", "Tile / Tiling"],
  ["WALLPAPER", "Wallpaper"], ["METAL", "Metal"], ["GLASS", "Glass"],
  ["DOOR", "Door"], ["WINDOW", "Window"], ["GATE", "Gate"], ["GRILL", "Grill / Railing"],
  ["BALCONY_SOFFIT", "Balcony ceiling"], ["STAIR_SOFFIT", "Staircase ceiling"], ["PORCH_CEILING", "Porch ceiling"], ["WATERPROOFING", "Floor / terrace waterproofing"], ["PARAPET", "Parapet wall"], ["COLUMN", "Column"], ["BEAM", "Beam"], ["OTHER", "Other"],
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
  const type = surface.surface_type === "OTHER" && /texture/i.test(surface.area_group_name || "") ? "OTHER" : opening.deduct_from_surface_type || surface.surface_type;
  const group = surface.surface_type === "OTHER" && /texture/i.test(surface.area_group_name || "") ? surface.area_group_name : opening.deduct_from_group_name || surface.area_group_name;
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
      if (number(opening.area) <= 0 && number(opening.effective_deduction) <= 0) return;
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
const blankArea = { painting_area: "", name: "", section: "", description: "", isCustom: false, saveForFuture: false };

export default function MeasurementCalculator() {
  const { user } = useAuth();
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
  const roomDefaultApplied = useRef("");
  const [paintingArea, setPaintingArea] = useState("");
  const [tab, setTab] = useState("surfaces");
  const [dialog, setDialog] = useState("");
  const [viewingArea, setViewingArea] = useState(null);
  const [areaDraft, setAreaDraft] = useState(blankArea);
  const [surfaceDraft, setSurfaceDraft] = useState(blankSurface);
  const createSurfaceKey = useRef("");
  const [deductionDraft, setDeductionDraft] = useState(blankDeduction);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingRoomName, setPendingRoomName] = useState("");

  const query = useMemo(() => measurementId ? { measurement: measurementId } : isNew ? { new: 1 } : {}, [measurementId, isNew]);
  const createRoomKey = useRef("");
  const refreshPendingRoom = useCallback(async (serverRooms = null) => {
    if (!user?.id) return;
    try {
      const queued = await listOfflineOperations(user.id);
      const roomRows = queued.filter(row => row.kind === "measurement" && row.endpoint.includes(`/properties/${id}/rooms/`)
        && (measurementId ? row.endpoint.includes(`measurement=${measurementId}`) : row.endpoint.includes("new=1")));
      const active = roomRows.find(row => ["PENDING", "AUTH_REQUIRED", "CONFLICT"].includes(row.state));
      if (active) { setPendingRoomName(active.payload?.name || "New room"); return; }
      const synced = roomRows.find(row => row.state === "SYNCED");
      if (synced && serverRooms?.some(room => room.name === synced.payload?.name)) {
        setPendingRoomName("");
        setNotice("Your offline room is synced. You can add its surfaces now.");
      } else if (!synced) setPendingRoomName("");
    } catch { /* The offline queue panel reports storage failures separately. */ }
  }, [id, measurementId, user?.id]);
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
      await refreshPendingRoom(loadedRooms);
      const loadedRecordId = loadedSurfaces[0]?.measurement_record || loadedRooms[0]?.measurement_record;
      if (!measurementId && loadedRecordId) setSearchParams({ measurement: String(loadedRecordId) }, { replace: true });
      setError("");
    } catch {
      setError("Area Calculation could not be loaded.");
    }
  }, [id, measurementId, query, refreshPendingRoom, setSearchParams]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { void refreshPendingRoom(); }, [refreshPendingRoom]);
  useEffect(() => {
    if (!activeAreaId) { roomDefaultApplied.current = ""; return; }
    if (roomDefaultApplied.current === activeAreaId) return;
    const room = rooms.find(entry => String(entry.id) === String(activeAreaId));
    if (!room) return;
    roomDefaultApplied.current = activeAreaId;
    const category = roomCategory(room, surfaces, roomTypes);
    setPaintingArea(category === "EXTERIOR" ? "EXTERIOR" : "INTERIOR");
  }, [activeAreaId, rooms, surfaces, roomTypes]);
  const workArea = activeAreaId === "exterior" ? "EXTERIOR" : paintingArea || (property?.measurement_type === "EXTERIOR" ? "EXTERIOR" : "INTERIOR");
  const categoryTotals = useMemo(() => combinedSurfaceCategoryTotals(surfaces), [surfaces]);
  const hasLegacyExterior = surfaces.some((surface) => surface.work_area === "EXTERIOR" && !surface.room);
  const areas = useMemo(() => [
    ...rooms,
    ...(hasLegacyExterior ? [{ id: "exterior", name: "Exterior", section: "", description: "", legacy: true }] : []),
  ], [rooms, hasLegacyExterior]);
  const activeArea = areas.find((area) => String(area.id) === String(activeAreaId));
  const areaSurfaces = useMemo(() => roomMeasurementSurfaces(surfaces, activeAreaId), [surfaces, activeAreaId]);
  const activeGroups = useMemo(() => summarize(areaSurfaces), [areaSurfaces]);
  const areaSummaries = useMemo(() => new Map(areas.map((area) => {
    const own = roomMeasurementSurfaces(surfaces, area.id);
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

  function allowMeasurementEdit() {
    const state = measurementEditState(property, record);
    if (!state.readOnly) return true;
    setError(state.reason);
    return false;
  }

  async function submitMeasurement() {
    if (!measurementEditState(property, record).canSubmit) {
      if (!record?.submitted_at) setError("Measurement editing is temporarily unavailable. Saved calculations can still be viewed.");
      return;
    }
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

  async function openAreaDialog(area = null) {
    if (!allowMeasurementEdit()) return;
    let availableRoomTypes = roomTypes;
    if (globalThis.navigator?.onLine !== false) {
      try {
        const {data} = await api.get("/quotations/areas/");
        availableRoomTypes = data.results || data;
        setRoomTypes(availableRoomTypes);
      } catch { setError("Room sections could not be refreshed. Please retry Add Room."); return; }
    }
    setEditing(area);
    const known = area && availableRoomTypes.some((item) => item.name.toLowerCase() === area.name.toLowerCase());
    setAreaDraft(area ? {
      name: area.name, section: area.section || "", description: area.description || "",
      painting_area: roomCategory(area, surfaces, availableRoomTypes), isCustom: !known, saveForFuture: false,
    } : blankArea);
    setDialog("area");
  }
  async function saveArea(event) {
    event.preventDefault();
    if (!allowMeasurementEdit()) return;
    if (!areaDraft.name.trim() || !ROOM_CATEGORIES.some(([value]) => value === areaDraft.painting_area)) return;
    const classification = ROOM_CATEGORIES.some(([value]) => value === areaDraft.painting_area) ? areaDraft.painting_area : roomTypes.find(type => type.name.trim().toLowerCase() === areaDraft.name.trim().toLowerCase())?.painting_area || "OTHER";
    setSaving(true);
    let payload = null;
    try {
      let roomType = (editing?.name === areaDraft.name.trim() ? editing.room_type : null) || roomTypes.find((item) => item.name.toLowerCase() === areaDraft.name.trim().toLowerCase())?.id || null;
      if (!editing) createRoomKey.current = createRoomKey.current || globalThis.crypto?.randomUUID?.() || `room-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      if (areaDraft.isCustom && !roomType && globalThis.navigator?.onLine !== false) {
        const savedType = (await api.post("/quotations/areas/", { name: areaDraft.name.trim(), painting_area:classification })).data;
        roomType = savedType.id;
      }
      payload = {
        name: areaDraft.name.trim(), painting_area:classification, section: areaDraft.section,
        description: areaDraft.description, room_type: roomType,
      };
      if (!editing) payload.idempotency_key = createRoomKey.current;
      const saved = editing
        ? (await api.patch(`/quotations/rooms/${editing.id}/`, payload)).data
        : (await api.post(`/quotations/properties/${id}/rooms/`, payload, { params: query })).data;
      if (!measurementId && saved.measurement_record) setSearchParams({ measurement: String(saved.measurement_record) });
      else await load();
      setActiveAreaId(String(saved.id));
      setPaintingArea(saved.painting_area === "EXTERIOR" ? "EXTERIOR" : "INTERIOR");
      setDialog("");
      setEditing(null);
      if (!editing) createRoomKey.current = "";
      setError("");
    } catch (requestError) {
      if (!editing && payload && user?.id && !requestError.response) {
        try {
          const endpoint = `/quotations/properties/${id}/rooms/${measurementId ? `?measurement=${measurementId}` : isNew ? "?new=1" : ""}`;
          await enqueueOfflineOperation({
            actorId: user.id, kind: "measurement", endpoint, method: "POST", payload,
            dedupeKey: `room-create:${createRoomKey.current}`,
            reviewPath: `/properties/${id}/measurements${measurementId ? `?measurement=${measurementId}` : ""}`,
          });
          setPendingRoomName(payload.name);
          setNotice("Room saved on this device as Pending Sync. Sync it and refresh this property before adding surfaces; the server assigns the room ID needed by those measurements.");
          setDialog(""); setEditing(null); setError(""); createRoomKey.current = "";
          await refreshPendingRoom();
          return;
        } catch (queueError) { setError(queueError.message || "Room could not be saved offline."); }
      } else setError(requestMessage(requestError, "Area could not be saved."));
    }
    finally { setSaving(false); }
  }
  async function deleteArea(area) {
    if (!allowMeasurementEdit()) return;
    if (area.legacy || !window.confirm(`Delete "${area.name}" and every surface and deduction inside it?`)) return;
    try {
      await api.delete(`/quotations/rooms/${area.id}/`);
      if (String(activeAreaId) === String(area.id)) setActiveAreaId("");
      await load();
    } catch (requestError) { setError(requestMessage(requestError, "Area could not be deleted.")); }
  }

  function openSurfaceDialog(surface = null, preferredGroup = null) {
    if (!allowMeasurementEdit()) return;
    const label = surface ? groupLabel(surface) : preferredGroup?.label || "Wall";
    setEditing(surface);
    createSurfaceKey.current = surface ? "" : createSurfaceKey.current || globalThis.crypto?.randomUUID?.() || `surface-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setSurfaceDraft(surface ? {
      work_area: surface.work_area || workArea, surfaceLabel: label, name: surface.name, length: String(surface.length || ""),
      breadth: String(surface.breadth || ""), quantity: surface.quantity || 1, manual_area:String(surface.manual_area || ""),
    } : {
      ...blankSurface, work_area:workArea,
      surfaceLabel: label,
      name: `${label} ${(preferredGroup?.surfaces?.length || activeGroups.find((group) => group.label === label)?.surfaces?.length || 0) + 1}`,
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
    if (!allowMeasurementEdit()) return;
    const [surfaceType, selectedLabel] = resolveSurfaceType(surfaceDraft.surfaceLabel);
    if (!selectedLabel) {
      setError("Select or enter a surface type.");
      return;
    }
    if (number(surfaceDraft.manual_area) <= 0 && (number(surfaceDraft.length) <= 0 || number(surfaceDraft.breadth) <= 0)) {
      setError("Enter a valid length and width / height greater than zero.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        work_area: surfaceDraft.work_area || workArea, surface_type: surfaceType,
        area_group_name: surfaceType === "OTHER" ? selectedLabel : "",
        name: surfaceDraft.name.trim() || `${selectedLabel} 1`,
        length: number(surfaceDraft.length), breadth: number(surfaceDraft.breadth),
        manual_area: number(surfaceDraft.manual_area), quantity: Math.max(1, parseInt(surfaceDraft.quantity, 10) || 1),
        paintable_sides: editing?.paintable_sides || 1, room: activeAreaId === "exterior" ? null : Number(activeAreaId),
      };
      if (!editing) payload.idempotency_key = createSurfaceKey.current;
      if (editing?.updated_at) payload.expected_updated_at = editing.updated_at;
      const saved = editing
        ? (await api.patch(`/quotations/measurements/${editing.id}/`, payload)).data
        : (await api.post(`/quotations/properties/${id}/measurements/`, payload, { params: query })).data;
      if (!measurementId && saved.measurement_record) setSearchParams({ measurement: String(saved.measurement_record) });
      else await load();
      setDialog("");
      setEditing(null);
      if (!editing) createSurfaceKey.current = "";
      setError("");
    } catch (requestError) {
      if (!requestError.response && user?.id && (editing || createSurfaceKey.current)) {
        try {
          const endpoint = editing
            ? `/quotations/measurements/${editing.id}/`
            : `/quotations/properties/${id}/measurements/${measurementId ? `?measurement=${measurementId}` : "?new=1"}`;
          await enqueueOfflineOperation({
            actorId: user.id, kind: "measurement", endpoint, method: editing ? "PATCH" : "POST", payload,
            expectedVersion: editing?.updated_at || null,
            dedupeKey: editing ? `surface:${editing.id}` : `surface-create:${createSurfaceKey.current}`,
            reviewPath: `/properties/${id}/measurements${measurementId ? `?measurement=${measurementId}` : ""}`,
          });
          setNotice(editing
            ? "Measurement change saved on this device. It will sync when the app is online; a version conflict will need review."
            : "New surface saved on this device as Pending Sync. A stable request key prevents duplicate surfaces when it retries.");
          setDialog(""); setEditing(null); setError("");
          if (!editing) createSurfaceKey.current = "";
          return;
        } catch (queueError) { setError(queueError.message || "Measurement could not be saved offline."); }
      } else setError(requestMessage(requestError, "Surface could not be saved."));
    }
    finally { setSaving(false); }
  }
  async function saveSurfaceBatch(surfaceLabel, rows, saveForFuture = false) {
    if (!allowMeasurementEdit()) return;
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
    if (!allowMeasurementEdit()) return;
    if ((surface.openings || []).length) {
      setError("Delete the deductions linked to this surface group before deleting this surface.");
      return;
    }
    if (!window.confirm(`Delete "${surface.name}"?`)) return;
    try { await api.delete(`/quotations/measurements/${surface.id}/`); await load(); }
    catch (requestError) { setError(requestMessage(requestError, "Surface could not be deleted.")); }
  }

  function openDeductionDialog(opening = null, group = null) {
    if (!allowMeasurementEdit()) return;
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
    if (!allowMeasurementEdit()) return;
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
    if (!allowMeasurementEdit()) return;
    if (!window.confirm(`Delete "${opening.name || opening.opening_type}" deduction?`)) return;
    try { await api.delete(`/quotations/measurement-openings/${opening.id}/`); await load(); }
    catch (requestError) { setError(requestMessage(requestError, "Deduction could not be deleted.")); }
  }

  if (!property) return error ? <ErrorState message={error} onRetry={load} /> : <LoadingState label="Loading Area Calculation..." />;
  const linearUnit = property.linear_unit_label || (property.measurement_unit === "METRES" ? "m" : "ft");
  const liveMultiplier = property.measurement_unit === "METRES" ? 10.7639104167 : 1;
  const liveSurfaceArea = (number(surfaceDraft.manual_area) || number(surfaceDraft.length) * number(surfaceDraft.breadth)) * Math.max(1, number(surfaceDraft.quantity)) * (editing?.paintable_sides || 1) * liveMultiplier;
  const liveDeductionArea = number(deductionDraft.width) * number(deductionDraft.height) * Math.max(1, number(deductionDraft.quantity)) * liveMultiplier;

  const savedTotals = (
    <section className="measurement-saved-totals" aria-label="Saved measurement totals">
      <div className="measurement-category-totals">
        {categoryTotals.categories.map(entry => <div key={entry.surface} className="measurement-category-total">
          <span>{surfaceLabel(entry.surface)}</span>
          <strong>{entry.quantity.toLocaleString("en-IN")} sqft</strong>
        </div>)}
      </div>
      <p className="mt-3 text-sm font-semibold">Overall saved net area: {categoryTotals.overall.toLocaleString("en-IN")} sqft</p>
    </section>
  );

  return (
    <main className="bp-calculator quotation-measurement-page bp-measurement-calculator -m-4 min-h-screen bg-[#f4f6f9] pb-24 text-[#12345b] sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      <div className="mx-auto max-w-7xl p-4 sm:p-0">
        <OfflineQueueStatus actorId={user?.id} />
        {property?.measurement_editing_available === false && <p role="status" className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Saved calculations are available to view. Editing is temporarily unavailable.</p>}
        {record?.status === "LOCKED" && property?.measurement_editing_available !== false && <p role="status" className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">This Area Calculation is used in a quotation and cannot be changed.</p>}
        {notice && <p role="status" className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}
        {pendingRoomName && <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><span><b>Room pending sync:</b> {pendingRoomName}. Sync and refresh this property before adding surfaces.</span><button type="button" onClick={() => void load()} className="min-h-10 rounded-lg border border-amber-300 bg-white px-3 font-semibold">Refresh property</button></div>}
        {!activeArea ? (
          <AreaList property={property} record={record} areas={areas} summaries={areaSummaries}
            pendingRoomName={pendingRoomName}
            totals={totals} openArea={openAreaDialog} deleteArea={deleteArea}
            viewArea={setViewingArea} editArea={(area) => { setActiveAreaId(String(area.id)); if (area.legacy) setPaintingArea("EXTERIOR"); setTab("surfaces"); }}
            downloadPdf={downloadPdf} submitMeasurement={submitMeasurement} submitting={saving} measurementId={measurementId} isNew={isNew} savedTotals={savedTotals} />
        ) : (
          <AreaDetail area={activeArea} property={property} record={record} groups={activeGroups} summary={activeSummary} tab={tab}
            setTab={setTab} back={() => setActiveAreaId("")}
            editRoom={() => openAreaDialog(activeArea)}
            editSurface={openSurfaceDialog}
            deleteSurface={deleteSurface} addDeduction={(group) => openDeductionDialog(null, group)}
            editDeduction={openDeductionDialog} deleteDeduction={deleteDeduction}
            surfaceTypes={surfaceTypes} saveSurfaceBatch={saveSurfaceBatch}
            saving={saving} unit={linearUnit} multiplier={liveMultiplier} savedTotals={savedTotals} />
        )}
        {error && <div className="fixed inset-x-4 top-4 z-[80] mx-auto flex max-w-xl items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-xl"><span>{error}</span><button className="bp-ui-icon-action" onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}
      </div>
      {activeArea && <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dbe4ef] bg-white px-4 py-3 shadow-[0_-8px_25px_rgba(15,23,42,.10)] md:hidden">
        <button onClick={() => setActiveAreaId("")} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#176b9b] px-6 font-bold text-white bp-ui-action"><Check className="h-5 w-5" />Save Area</button>
      </div>}
      {dialog === "area" && <AreaDialog draft={areaDraft} setDraft={setAreaDraft} editing={editing} save={saveArea} close={() => setDialog("")} saving={saving} roomTypes={selectableRoomTypes} />}
      {dialog === "surface" && <SurfaceDialog draft={surfaceDraft} setDraft={setSurfaceDraft} save={saveSurface} close={() => setDialog("")} saving={saving} unit={linearUnit} liveArea={liveSurfaceArea} editing={editing} />}
      {dialog === "deduction" && <DeductionDialog draft={deductionDraft} setDraft={setDeductionDraft} groups={activeGroups} save={saveDeduction} close={() => setDialog("")} saving={saving} unit={linearUnit} liveArea={liveDeductionArea} editing={editing} />}
      {viewingArea && <AreaViewDialog area={viewingArea} summary={areaSummaries.get(String(viewingArea.id))} readOnly={measurementEditState(property, record).readOnly} close={() => setViewingArea(null)} edit={() => { setViewingArea(null); setActiveAreaId(String(viewingArea.id)); setTab("surfaces"); }} />}
    </main>
  );
}

function AreaActions({ area, viewArea, editArea, deleteArea, readOnly = false }) {
  const menuRef = useRef(null);
  useEffect(() => {
    const dismiss = (event) => {
      const menu = menuRef.current;
      if (!menu?.open) return;
      if (event.type === "keydown") {
        if (event.key !== "Escape") return;
        event.preventDefault();
        menu.open = false;
        menu.querySelector("summary")?.focus();
      } else if (!menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, []);
  const act = (action) => {
    menuRef.current.open = false;
    menuRef.current.querySelector("summary")?.focus();
    action(area);
  };
  return <details ref={menuRef} className="measurement-area-actions" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
  }}>
    <summary title="Room actions" aria-label={`Actions for ${area.name}`} className="bp-ui-icon-action"><MoreHorizontal className="h-5 w-5" /></summary>
    <div className="measurement-area-action-list" role="group" aria-label={`Actions for ${area.name}`}>
      <button type="button" onClick={() => act(viewArea)}><Eye className="h-5 w-5" />View</button>
      <button type="button" disabled={readOnly} onClick={() => act(editArea)}><Pencil className="h-5 w-5" />Edit</button>
      {!area.legacy && <button type="button" className="measurement-area-action-delete" disabled={readOnly} onClick={() => act(deleteArea)}><Trash2 className="h-5 w-5" />Delete</button>}
    </div>
  </details>;
}

function AreaList({ property, record, areas, summaries, totals, openArea, deleteArea, viewArea, editArea, downloadPdf, submitMeasurement, submitting, measurementId, isNew, savedTotals, pendingRoomName }) {
  const editState = measurementEditState(property, record);
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileTab, setMobileTab] = useState("rooms");
  const [expandedAreaId, setExpandedAreaId] = useState("");
  const waitingForFirstSave = isNew && !measurementId;
  const roomTable = measurementRoomTable(areas, summaries);
  const goBack = () => {
    if (location.key && location.key !== "default") navigate(-1);
    else navigate(`/properties/${property.id}`);
  };
  return <div className="space-y-4">
    <header className="measurement-header">
      <button type="button" onClick={goBack} className="measurement-back bp-ui-action"><ArrowLeft aria-hidden="true" />Properties</button>
      <div className="measurement-header-main">
        <div className="measurement-heading">
          <div className="measurement-title-row"><h1 className="bp-ui-page-title">Measurements</h1><StatusBadge status={editState.status} tone={editState.tone} /></div>
          <p className="measurement-property">{property.name || property.property_type}</p>
          <p className="measurement-meta">{[record?.reference_no, property.property_type, property.city].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="measurement-area-meter"><div><p>Total measured area</p><strong className="measurement-area-value">{areaText(totals.net)}</strong><p>{areas.length} rooms · {totals.surfaces} surfaces · {totals.deductions} deductions</p></div><Ruler aria-hidden="true" /></div>
      </div>
      <div className="measurement-actions">
        <button type="button" onClick={submitMeasurement} disabled={!editState.canSubmit || submitting || !totals.surfaces} aria-busy={submitting} className="measurement-action measurement-action-primary measurement-submit bp-ui-action"><Check aria-hidden="true" />{submitting ? "Submitting..." : editState.submitLabel}</button>
        <button type="button" disabled={waitingForFirstSave} onClick={downloadPdf} className="measurement-action bp-ui-action"><Download aria-hidden="true" />View PDF</button>
        {(waitingForFirstSave || property?.measurement_editing_available === false)
          ? <button type="button" disabled className="measurement-action bp-ui-action"><FilePlus2 aria-hidden="true" />New quotation</button>
          : <Link to={`/quotations/new?customer=${property.customer}&property=${property.id}${measurementId ? `&measurement=${measurementId}` : ""}`} className="measurement-action"><FilePlus2 aria-hidden="true" />New quotation</Link>}
      </div>
    </header>
    {savedTotals}
    <section className="md:hidden">
      <nav className="grid grid-cols-2 rounded-xl bg-[#e6edf2] p-1" aria-label="Calculation view">
        {[["rooms", "Rooms"], ["summary", "Summary"]].map(([key, label]) => <button key={key} type="button" onClick={() => setMobileTab(key)} aria-pressed={mobileTab === key} className={(`min-h-10 rounded-lg text-xs font-bold ${mobileTab === key ? "bg-[#176b9b] text-white shadow-sm" : "text-slate-500"}`) + " bp-ui-action"}>{label}</button>)}
      </nav>
      {mobileTab === "rooms" ? <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between"><h2 className="text-base font-extrabold bp-ui-section-heading">Rooms & areas</h2><span className="text-xs text-slate-500">{areas.length} rooms</span></div>
        {areas.map((area) => {
          const summary = summaries.get(String(area.id)) || { groups: [], surfaceCount: 0, deductions: 0, net: 0 };
          const expanded = expandedAreaId === String(area.id);
          return <article key={area.id} className="relative rounded-2xl border border-[#e1e7ef] bg-white shadow-sm">
            <div className="measurement-area-mobile-row">
            <button type="button" onClick={() => setExpandedAreaId(expanded ? "" : String(area.id))} aria-expanded={expanded} className="flex min-h-[70px] w-full items-center gap-3 p-3 text-left bp-ui-action">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf4f8] text-[#31728b]"><Layers3 className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{area.name}</strong><small className="mt-1 block text-xs text-slate-500">{summary.surfaceCount ? `${summary.surfaceCount} surfaces · ${summary.deductions} deductions` : "No measurements yet"}</small></span>
              <span className="shrink-0 text-right text-xs font-extrabold">{summary.surfaceCount > 0 && areaText(summary.net)}<ChevronRight className={`ml-auto mt-1 h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`} /></span>
            </button>
            <AreaActions area={area} viewArea={viewArea} editArea={editArea} deleteArea={deleteArea} readOnly={editState.readOnly} />
            </div>
            {expanded && <div className="border-t border-[#e7edf1] px-4 pb-4 pt-3">
              {summary.groups?.length ? <div className="space-y-1 text-xs text-slate-600">{summary.groups.map((group) => <div key={group.key} className="flex justify-between gap-2"><span>{group.label}</span><b className="text-[#193750]">{areaText(group.net)}</b></div>)}</div> : null}
            </div>}
          </article>;
        })}
        {!areas.length && <div className="rounded-2xl border border-dashed border-[#cbdce6] bg-white p-8 text-center text-sm text-slate-500">No rooms added.</div>}
      </div> : <RoomTotalsTable data={roomTable} />}
    </section>
    <div className="hidden md:block"><RoomTotalsTable data={roomTable} /></div>
    <section className="hidden rounded-2xl border border-[#e1e7ef] bg-white p-4 shadow-sm sm:p-6 md:block">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-lg font-extrabold bp-ui-section-heading">Areas</h2></div>
        <button disabled={!!pendingRoomName || editState.readOnly} onClick={() => openArea()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#176b9b] px-4 font-bold text-white disabled:opacity-50 bp-ui-action"><Plus className="h-4 w-4" />Add Room</button>
      </div>
      <div className="measurement-area-cards mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {areas.map((area) => {
          const summary = summaries.get(String(area.id)) || { surfaceCount: 0, deductions: 0, net: 0 };
          return <article key={area.id} className="measurement-area-card group rounded-xl border border-[#e1e7ef] bg-white p-3 transition hover:border-blue-300 hover:shadow-md">
            <button onClick={() => viewArea(area)} className="flex w-full min-w-0 items-center gap-3 text-left bp-ui-action">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e8f3f8] text-[#176b9b]"><Layers3 className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-extrabold"><span className="min-w-0 break-words">{area.name}</span>{summary.surfaceCount > 0 && <Check className="h-4 w-4 shrink-0 rounded-full bg-emerald-600 p-0.5 text-white" />}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{summary.surfaceCount ? `${summary.surfaceCount} Surfaces · ${summary.deductions} Deductions` : "Not measured yet"}</span>
                {summary.surfaceCount > 0 && <b className="mt-1 block text-sm">{areaText(summary.net)}</b>}
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
            </button>
            <AreaActions area={area} viewArea={viewArea} editArea={editArea} deleteArea={deleteArea} readOnly={editState.readOnly} />
          </article>;
        })}
        {!areas.length && <div className="rounded-xl border border-dashed p-10 text-center text-slate-500 md:col-span-2 lg:col-span-4"><Ruler className="mx-auto mb-3 h-8 w-8" />No rooms added.</div>}
      </div>
    </section>
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dbe4ef] bg-white px-4 py-3 shadow-[0_-8px_25px_rgba(15,23,42,.10)] md:hidden"><button type="button" disabled={!!pendingRoomName || editState.readOnly} onClick={() => openArea()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#176b9b] text-sm font-bold text-white disabled:opacity-50 bp-ui-action"><Plus className="h-4 w-4" />Add Room</button></div>
  </div>;
}

function RoomTotalsTable({ data }) {
  return <section className="mt-5 overflow-hidden rounded-2xl border border-[#e1e7ef] bg-white shadow-sm">
    <h2 className="px-4 py-4 text-base font-extrabold bp-ui-section-heading">All room measurements</h2>
    {data.rows.length ? <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Measurements for all rooms and surfaces">
      <table data-mobile-table="keep" className="w-full text-left text-xs sm:text-sm">
        <caption className="sr-only">Rooms, balconies and other areas with measured surfaces only. Values in square feet. Opening columns show measured opening areas for reference; they are already included in the surface adjustments.</caption>
        <thead className="bg-[#f5f8fc]"><tr><th scope="col" className="p-3">Room / area</th>{data.columns.map((column) => <th key={column.key} scope="col" className="whitespace-nowrap p-3 text-right">{column.label}</th>)}<th scope="col" className="whitespace-nowrap p-3 text-right">Net area</th></tr></thead>
        <tbody className="divide-y">{data.rows.map((row) => <tr key={row.id}><th scope="row" className="p-3 font-semibold">{row.name}</th>{data.columns.map((column) => <td key={column.key} className="whitespace-nowrap p-3 text-right tabular-nums">{column.key in row.values ? areaText(row.values[column.key]) : "—"}</td>)}<td className="whitespace-nowrap p-3 text-right font-bold tabular-nums">{areaText(row.net)}</td></tr>)}</tbody>
        <tfoot className="border-t bg-[#eaf4f8] font-bold"><tr><th scope="row" className="p-3">All rooms total</th>{data.columns.map((column) => <td key={column.key} className="whitespace-nowrap p-3 text-right tabular-nums">{areaText(data.totals[column.key])}</td>)}<td className="whitespace-nowrap p-3 text-right tabular-nums">{areaText(data.net)}</td></tr></tfoot>
      </table>
    </div> : <p className="px-4 pb-4 text-sm text-slate-500">No measurements saved.</p>}
  </section>;
}

function AreaDetail({ area, property, record, groups, summary, tab, setTab, back, editRoom, editSurface, deleteSurface, addDeduction, editDeduction, deleteDeduction, surfaceTypes, saveSurfaceBatch, saving, unit, multiplier, savedTotals }) {
  const editState = measurementEditState(property, record);
  const adjustments = groups.flatMap((group) => [
    ...group.deductions.map((item) => ({ ...item, targetLabel: group.label })),
    ...group.additions.map((item) => ({ ...item, targetLabel: group.label })),
  ]);
  return <div className="space-y-4">
    <header className="measurement-header">
      <button type="button" onClick={back} className="measurement-back bp-ui-action"><ArrowLeft aria-hidden="true" />All rooms</button>
      <div className="measurement-header-main">
        <div className="measurement-heading">
          <div className="measurement-title-row"><h1 className="bp-ui-page-title">{area.name}</h1><StatusBadge status={editState.status} tone={editState.tone} /></div>
          <p className="measurement-property">{property?.name || property?.property_type}</p>
          <p className="measurement-meta">{[area.section || "Area measurement", record?.reference_no].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="measurement-area-meter"><div><p>Net measured area</p><strong className="measurement-area-value">{areaText(summary.net)}</strong></div><Ruler aria-hidden="true" /></div>
      </div>
      {!area.legacy && <div className="measurement-actions">
        {!area.legacy && <button type="button" disabled={editState.readOnly} onClick={editRoom} className="measurement-action bp-ui-action"><Pencil aria-hidden="true" />Change Room</button>}
      </div>}
      <nav className="measurement-tabs" aria-label="Room measurement view">
        {[["surfaces", "Surfaces", Layers3], ["deductions", "Deduct / Add", Plus], ["summary", "Summary", Ruler]].map(([key, label, Icon]) =>
          <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key} className="bp-ui-action"><Icon aria-hidden="true" /><span>{label}</span></button>)}
      </nav>
    </header>
    {savedTotals}
    {tab === "surfaces" && <fieldset disabled={editState.readOnly} className="contents"><SurfaceTab groups={groups} editSurface={editSurface} deleteSurface={deleteSurface} surfaceTypes={surfaceTypes} saveBatch={saveSurfaceBatch} saving={saving} unit={unit} multiplier={multiplier} /></fieldset>}
    {tab === "deductions" && <fieldset disabled={editState.readOnly} className="contents"><DeductionTab groups={groups} deductions={adjustments} addDeduction={addDeduction} editDeduction={editDeduction} deleteDeduction={deleteDeduction} /></fieldset>}
    {tab === "summary" && <SummaryTab groups={groups} summary={summary} deductions={adjustments} />}
  </div>;
}

function SurfaceTab({ groups, editSurface, deleteSurface, surfaceTypes, saveBatch, saving, unit, multiplier }) {
  const catalog = [...new Set([...SURFACE_TYPES.filter(([key]) => key !== "OTHER").map(([, label]) => label), "Texture Walls", ...surfaceTypes.map((item) => item.name)])];
  const [selected, setSelected] = useState("");
  const [surfaceSearch, setSurfaceSearch] = useState("");
  const [surfaceMenuOpen, setSurfaceMenuOpen] = useState(false);
  const [showCustomSurfaceEntry, setShowCustomSurfaceEntry] = useState(false);
  const [rows, setRows] = useState([]);
  const [saveForFuture, setSaveForFuture] = useState(false);
  const [editorRequest, setEditorRequest] = useState(0);
  const editorRef = useRef(null);
  useEffect(() => {
    if (!selected || !editorRequest || !window.matchMedia("(max-width: 767px)").matches) return;
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editorRequest, selected]);
  const known = catalog.some((name) => name.toLowerCase() === selected.trim().toLowerCase());
  const filteredSurfaces = catalog.filter((name) => name.toLowerCase().includes(surfaceSearch.trim().toLowerCase()));
  const choose = (value) => {
    setSelected(value);
    setSurfaceSearch(value);
    setSurfaceMenuOpen(false);
    setShowCustomSurfaceEntry(false);
    const count = groups.find((group) => group.label.toLowerCase() === value.toLowerCase())?.surfaces.length || 0;
    setRows(value ? [{ name: `${value} ${count + 1}`, length: "", breadth: "", quantity: 1 }] : []);
    setSaveForFuture(false);
    if (value) setEditorRequest((current) => current + 1);
  };
  const updateRow = (index, key, value) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const addRow = () => setRows((current) => [...current, { name: `${selected} ${current.length + (groups.find((group) => group.label.toLowerCase() === selected.toLowerCase())?.surfaces.length || 0) + 1}`, length: "", breadth: "", quantity: 1 }]);
  const total = rows.reduce((sum, row) => sum + number(row.length) * number(row.breadth) * Math.max(1, number(row.quantity)) * multiplier, 0);
  const submit = async () => { if (await saveBatch(selected, rows, saveForFuture)) { setSelected(""); setSurfaceSearch(""); setRows([]); } };
  return <section className="flex flex-col rounded-2xl border border-[#e1e7ef] bg-white p-4 shadow-sm sm:p-6">
    <div><h2 className="text-lg font-extrabold bp-ui-section-heading"><span className="md:hidden">Start measuring</span><span className="hidden md:inline">Select surface</span></h2></div>
    <div className="mt-4 md:hidden">
      {!groups.length && <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#dce7ed] bg-[#f7fafb] p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f2f7] text-[#2e7091]"><Layers3 className="h-5 w-5" /></span><div><p className="text-sm font-bold">No surfaces added yet</p></div></div>}
      <button type="button" onClick={() => choose("Wall")} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#176b9b] text-sm font-bold text-white bp-ui-action"><Plus className="h-4 w-4" />Add Wall</button>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {["Ceiling", "Texture Walls", "Floor"].map((name) => <button key={name} type="button" onClick={() => choose(name)} className="min-h-11 rounded-xl border border-[#dce6ed] bg-white px-1 text-xs font-bold text-[#2a506a] bp-ui-action">{name}</button>)}
        <select aria-label="Other surface type" value="" onChange={(event) => { if (event.target.value === "__custom__") { setShowCustomSurfaceEntry(true); setSurfaceSearch(""); } else if (event.target.value) choose(event.target.value); }} className="col-span-3 min-h-11 min-w-0 rounded-xl border border-[#dce6ed] bg-white px-2 text-xs font-bold text-[#2a506a] bp-ui-control"><option value="">Other surfaces</option>{[...new Set(surfaceTypes.map((item) => item.name?.trim()).filter(Boolean))].map((name) => <option key={name} value={name}>{name}</option>)}<option value="__custom__">New surface type</option></select>
      </div>
      {showCustomSurfaceEntry && <div className="mt-3 rounded-xl border border-[#dce6ed] bg-[#f7fafb] p-3">
        <label htmlFor="mobile-custom-surface-type" className="text-xs font-bold text-[#2a506a]">New surface type</label>
        <div className="mt-2 flex gap-2"><input id="mobile-custom-surface-type" value={surfaceSearch} onChange={(event) => setSurfaceSearch(event.target.value)} placeholder="Enter surface type" className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#cbdce6] bg-white px-3 text-sm bp-ui-control" /><button type="button" disabled={!surfaceSearch.trim()} onClick={() => choose(surfaceSearch.trim())} className="rounded-lg bg-[#176b9b] px-3 text-xs font-bold text-white disabled:opacity-40 bp-ui-action">Use type</button></div>
      </div>}
    </div>
    <div className="relative mt-4 hidden md:block">
      <div className="relative measurement-surface-search">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={surfaceSearch}
          onFocus={() => setSurfaceMenuOpen(true)}
          onChange={(event) => { setSurfaceSearch(event.target.value); setSelected(""); setRows([]); setSurfaceMenuOpen(true); }}
          placeholder="Search surface"
          aria-label="Search surface"
          className={(`${inputClass} pl-10 pr-10 bp-control-leading-icon bp-control-trailing-icon`) + " bp-ui-control"}
          role="combobox"
          aria-expanded={surfaceMenuOpen}
        />
        <button type="button" onClick={() => setSurfaceMenuOpen((open) => !open)} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 bp-ui-icon-action" aria-label="Show surface choices"><ChevronRight className={`h-4 w-4 transition-transform ${surfaceMenuOpen ? "rotate-90" : ""}`} /></button>
      </div>
      {surfaceMenuOpen && <div className="measurement-surface-options absolute z-30 mt-3 max-h-64 w-full space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
        {filteredSurfaces.map((name) => <button key={name} type="button" onClick={() => choose(name)} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-blue-50 hover:text-[#176b9b] bp-ui-action"><span>{name}</span>{selected.toLowerCase() === name.toLowerCase() && <Check className="h-4 w-4" />}</button>)}
        {surfaceSearch.trim() && !catalog.some((name) => name.toLowerCase() === surfaceSearch.trim().toLowerCase()) && <button type="button" onClick={() => choose(surfaceSearch.trim())} className="flex w-full items-center gap-2 rounded-lg border-t px-3 py-3 text-left text-sm font-bold text-[#176b9b] bp-ui-action"><Plus className="h-4 w-4" />Use new surface "{surfaceSearch.trim()}"</button>}
        {!filteredSurfaces.length && !surfaceSearch.trim() && <p className="px-3 py-4 text-sm text-slate-500">No saved surfaces.</p>}
      </div>}
    </div>
    {selected && <div ref={editorRef} className="order-1 mt-4 scroll-mt-4 rounded-xl border border-blue-200 bg-blue-50/40 p-3 md:order-none sm:p-4">
      <div><h3 className="font-extrabold">{selected} measurements</h3></div>
      <div className="mt-3 space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="rounded-xl border bg-white p-3">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input value={row.name} onChange={(event) => updateRow(index, "name", event.target.value)} placeholder="Name" aria-label="Surface name" className={(inputClass) + " bp-ui-control"} />
              <button type="button" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="mt-1.5 h-12 rounded-lg border border-red-200 px-3 text-red-600 bp-ui-icon-action" aria-label={`Delete ${row.name || "surface"}`}><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:gap-2">
              <label className="min-w-0 text-xs font-semibold text-slate-600">L ({unit})<input type="number" inputMode="decimal" min="0.01" step="0.01" value={row.length} onChange={(event) => updateRow(index, "length", event.target.value)} placeholder="0.00" aria-label={`Length in ${unit}`} className={(`${inputClass} !mt-1 min-w-0 !px-1.5 !text-sm sm:!px-3 sm:!text-base`) + " bp-ui-control"} /></label>
              <label className="min-w-0 text-xs font-semibold text-slate-600">W / H ({unit})<input type="number" inputMode="decimal" min="0.01" step="0.01" value={row.breadth} onChange={(event) => updateRow(index, "breadth", event.target.value)} placeholder="0.00" aria-label={`Width or height in ${unit}`} className={(`${inputClass} !mt-1 min-w-0 !px-1.5 !text-sm sm:!px-3 sm:!text-base`) + " bp-ui-control"} /></label>
              <label className="min-w-0 text-xs font-semibold text-slate-600">Quantity<input type="number" inputMode="numeric" min="1" value={row.quantity} onChange={(event) => updateRow(index, "quantity", event.target.value)} placeholder="1" aria-label="Quantity" className={(`${inputClass} !mt-1 min-w-0 !px-1.5 !text-sm sm:!px-3 sm:!text-base`) + " bp-ui-control"} /></label>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={addRow} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#176b9b] bg-white px-3 text-sm font-bold text-[#176b9b] sm:w-auto bp-ui-action"><Plus className="h-4 w-4" />Add line</button>
      {!known && <label className="mt-3 flex items-center gap-2 rounded-lg bg-white p-3 text-sm font-semibold"><input type="checkbox" checked={saveForFuture} onChange={(event) => setSaveForFuture(event.target.checked)} />Save "{selected}" for future calculations</label>}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white p-3"><div><small className="block text-slate-500">{selected} total</small><b className="text-xl text-[#064a9b]">{areaText(total)}</b></div><button type="button" disabled={saving || !rows.length} onClick={submit} className="min-h-12 rounded-lg bg-[#176b9b] px-5 font-bold text-white disabled:opacity-40 bp-ui-action">{saving ? "Saving..." : `Save ${selected}`}</button></div>
    </div>}
    <h3 className="mt-6 font-extrabold">Saved surfaces</h3>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {groups.filter((group) => group.surfaces.length > 0).map((group) => <article key={group.key} className="overflow-hidden rounded-xl border border-[#e1e7ef]">
        <header className="flex items-center justify-between bg-[#f5f8fc] px-4 py-3"><div><h3 className="font-extrabold uppercase tracking-wide">{group.label}</h3><p className="text-xs text-slate-500">{group.surfaces.length} measurement{group.surfaces.length === 1 ? "" : "s"}</p></div><button onClick={() => choose(group.label)} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold text-[#176b9b] bp-ui-action"><Plus className="mr-1 inline h-3.5 w-3.5" />Add</button></header>
        <div className="divide-y divide-[#e1e7ef]">
          {group.surfaces.map((surface) => <div key={surface.id} className="measurement-surface-row">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#e8f3f8] text-[#176b9b]"><Layers3 className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><b className="measurement-surface-name">{surface.name}</b><p className="text-xs text-slate-500">{surface.length} x {surface.breadth} x {surface.quantity}</p></div>
            <b className="shrink-0 text-sm">{areaText(surface.gross_area)}</b>
            <div className="measurement-surface-actions"><button type="button" aria-label={`Edit ${surface.name}`} onClick={() => editSurface(surface)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 bp-ui-icon-action"><Pencil className="h-4 w-4" /></button>
            <button type="button" aria-label={`Delete ${surface.name}`} onClick={() => deleteSurface(surface)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 bp-ui-icon-action"><Trash2 className="h-4 w-4" /></button></div>
          </div>)}
        </div>
        <footer className="flex justify-between bg-blue-50 px-4 py-3 text-sm"><span>Gross {group.label}</span><b>{areaText(group.gross)}</b></footer>
      </article>)}
      {!groups.length && <div className="hidden rounded-xl border border-dashed p-10 text-center text-slate-500 md:block lg:col-span-2">No surfaces added.</div>}
    </div>
  </section>;
}

function DeductionTab({ groups, deductions, addDeduction, editDeduction, deleteDeduction }) {
  return <section className="rounded-2xl border border-[#e1e7ef] bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-extrabold bp-ui-section-heading">Deductions / Additions</h2></div><button disabled={!groups.length} onClick={() => addDeduction(groups[0])} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[#176b9b] px-4 font-bold text-white disabled:opacity-40 sm:w-auto bp-ui-action"><Plus className="h-4 w-4" />Add item</button></div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {deductions.map((item) => <article key={item.id} className="rounded-xl border border-[#e1e7ef] p-4">
        <div className="flex items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg font-extrabold ${item.effect === "ADD" ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-[#f58220]"}`}>{item.effect === "ADD" ? "+" : "-"}</span><div className="min-w-0 flex-1"><b>{item.name || item.opening_type.replaceAll("_", " ")}</b><p className="mt-1 text-xs text-slate-500">{item.width} x {item.height} x {item.quantity}</p><p className="mt-1 text-xs font-semibold text-[#176b9b]">{item.effect === "ADD" ? "Add to" : "Deduct from"}: {item.targetLabel}</p></div><b className={`text-sm ${item.effect === "ADD" ? "text-emerald-700" : "text-orange-700"}`}>{item.effect === "ADD" ? "+" : "-"}{areaText(item.effect === "ADD" ? item.area : item.effective_deduction)}</b></div>
        <div className="mt-3 flex justify-end gap-2 border-t pt-3"><button onClick={() => editDeduction(item)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold bp-ui-action"><Pencil className="h-3.5 w-3.5" />Edit</button><button onClick={() => deleteDeduction(item)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 bp-ui-action"><Trash2 className="h-3.5 w-3.5" />Delete</button></div>
      </article>)}
      {!deductions.length && <div className="rounded-xl border border-dashed p-10 text-center text-slate-500 lg:col-span-2">No deductions added.</div>}
    </div>
  </section>;
}

function SummaryTab({ groups, summary, deductions }) {
  return <div className="space-y-4">
    <section className="grid grid-cols-2 gap-2 sm:gap-4"><SummaryStat tone="blue" label="Total gross area" value={summary.gross} />{summary.deductionArea > 0 && <SummaryStat tone="orange" label="Total deductions" value={summary.deductionArea} />}{summary.additionArea > 0 && <SummaryStat tone="blue" label="Total additions" value={summary.additionArea} />}<SummaryStat tone="green" label="Net area" value={summary.net} /></section>
    <section className="rounded-2xl border border-[#e1e7ef] bg-white p-4 shadow-sm sm:p-6"><h2 className="font-extrabold bp-ui-section-heading">Surface-wise details</h2>
      <div className="mt-3 space-y-2">{groups.map((group) => <div key={group.key} className="grid grid-cols-[1.4fr_repeat(3,1fr)] gap-2 rounded-lg border p-3 text-right text-xs sm:text-sm"><b className="text-left">{group.label}</b><span><small className="block text-slate-400">Gross</small>{group.gross.toFixed(0)}</span><span><small className="block text-slate-400">Deduction</small>{group.deduction.toFixed(0)}</span><b><small className="block font-normal text-slate-400">Net</small>{group.net.toFixed(0)}</b></div>)}</div>
    </section>
    {deductions.length > 0 && <section className="rounded-2xl border border-[#e1e7ef] bg-white p-4 shadow-sm sm:p-6"><h2 className="font-extrabold bp-ui-section-heading">Deduction / addition details</h2><div className="mt-3 space-y-2">{deductions.map((item) => <div key={item.id} className="grid grid-cols-[1.2fr_1fr_.5fr_1fr] gap-2 rounded-lg bg-[#f5f8fc] p-3 text-xs sm:text-sm"><b>{item.name || item.opening_type}</b><span>{item.width} x {item.height}</span><span>Qty {item.quantity}</span><span className={`text-right font-bold ${item.effect === "ADD" ? "text-emerald-700" : "text-orange-700"}`}>{item.effect === "ADD" ? "+" : "-"}{areaText(item.effect === "ADD" ? item.area : item.effective_deduction)}</span></div>)}</div></section>}
  </div>;
}

function SummaryStat({ tone, label, value }) {
  const colors = { blue: "border-blue-100 bg-blue-50 text-blue-800", orange: "border-orange-100 bg-orange-50 text-orange-700", green: "border-emerald-100 bg-emerald-50 text-emerald-700" };
  return <div className={`rounded-xl border p-3 text-center sm:p-5 ${colors[tone]}`}><p className="text-[10px] font-bold uppercase leading-tight sm:text-xs">{label}</p><b className="mt-2 block text-lg sm:text-2xl">{number(value).toFixed(0)}</b><small>sq.ft</small></div>;
}

function AreaViewDialog({ area, summary, close, edit, readOnly = false }) {
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
        {summary?.deductionArea > 0 && <SummaryStat tone="orange" label="Deductions" value={summary.deductionArea} />}
        <SummaryStat tone="green" label="Net area" value={summary?.net || 0} />
      </div>
      <div className="space-y-3">
        {groups.map((group) => {
          const open = openGroups.has(group.key);
          return <section key={group.key} className="overflow-hidden rounded-xl border border-[#e1e7ef]">
            <button type="button" onClick={() => toggleGroup(group.key)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 bg-[#f5f8fc] px-4 py-3 text-left bp-ui-action">
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
      <button onClick={edit} className="min-h-12 w-full rounded-lg bg-[#176b9b] font-bold text-white bp-ui-action">{readOnly ? <Eye className="mr-2 inline h-4 w-4" /> : <Pencil className="mr-2 inline h-4 w-4" />}{readOnly ? "View Measurements" : "Edit Measurements"}</button>
    </div>
  </DialogShell>;
}

const inputClass = "mt-1.5 h-12 w-full rounded-lg border border-[#d6e0eb] bg-white px-3 text-base outline-none focus:border-[#176b9b] focus:ring-2 focus:ring-blue-100";
function DialogShell({ title, close, children }) {
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-5" onMouseDown={close}>
    <section role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()} className="max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-4 sm:px-6"><h2 className="text-xl font-extrabold bp-ui-section-heading">{title}</h2><button type="button" onClick={close} aria-label="Close dialog" className="rounded-lg p-2 hover:bg-slate-100 bp-ui-icon-action"><X className="h-5 w-5" /></button></header>
      {children}
    </section>
  </div>;
}
function AreaDialog({ draft, setDraft, editing, save, close, saving, roomTypes }) {
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const sectionRooms = roomTypes.filter(type => (type.painting_area || "OTHER") === draft.painting_area);
  return <DialogShell title={editing ? "Change Room" : "Add Room"} close={close}><form onSubmit={save} className="space-y-4 p-4 sm:p-6">
    <label className="block text-sm font-bold">Select Section *<select required aria-label="Select Section" value={draft.painting_area || ""} onChange={event => setDraft(current => ({...current, painting_area:event.target.value, name:"", isCustom:false, saveForFuture:false}))} className={(inputClass) + " bp-ui-control"}><option value="">Choose section</option>{ROOM_CATEGORIES.map(([value,label]) => <option key={value} value={value}>{value === "OTHER" ? "Other" : label}</option>)}</select></label>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
      <label className="block min-w-0 text-sm font-bold">Select Room / Area *<select aria-label="Select Room / Area" required={!draft.isCustom} disabled={!draft.painting_area || draft.isCustom} value={draft.isCustom ? "" : draft.name} onChange={event => setDraft(current => ({...current, name:event.target.value, isCustom:false}))} className={(inputClass) + " bp-ui-control"}><option value="">{!draft.painting_area ? "Select section first" : "Choose room / area"}</option>{sectionRooms.map(type => <option key={type.id} value={type.name}>{type.name}</option>)}</select></label>
      <button type="button" disabled={!draft.painting_area} onClick={() => setDraft(current => ({...current, name:"", isCustom:true}))} className={(`mb-0.5 min-h-12 rounded-lg border px-4 text-sm font-bold disabled:opacity-50 ${draft.isCustom ? "border-[#176b9b] bg-[#e8f3f8] text-[#176b9b]" : "border-slate-300 bg-white text-slate-800"}`) + " bp-ui-action"}><Plus className="mr-1 inline h-4 w-4" />New Room</button>
    </div>
    {draft.painting_area && !sectionRooms.length && !draft.isCustom && <p className="text-sm text-slate-600">No rooms or areas created under this section yet.</p>}
    {draft.isCustom && <><label className="block text-sm font-bold">Room / Area Name *<input required value={draft.name} onChange={event => update("name",event.target.value)} placeholder="Enter room or area name" className={(inputClass) + " bp-ui-control"} /></label></>}
    <Link to="/master-services" className="inline-flex min-h-11 items-center font-bold text-[#176b9b]">Manage room types in Services &amp; Rates</Link>
    <button disabled={saving || !draft.painting_area} className="min-h-12 w-full rounded-lg bg-[#176b9b] font-bold text-white disabled:opacity-50 bp-ui-action">{saving ? "Saving..." : editing ? "Save and Continue" : "Next"}</button>
  </form></DialogShell>;
}

function SurfaceDialog({ draft, setDraft, save, close, saving, unit, liveArea, editing }) {
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  return <DialogShell title={editing ? "Edit Surface" : "Add Surface"} close={close}><form onSubmit={save} className="space-y-4 p-4 sm:p-6">
    <label className="block text-sm font-bold">Painting Area<select className={(inputClass) + " bp-ui-control"} aria-label="Surface Painting Area" value={draft.work_area || "INTERIOR"} onChange={event => update("work_area", event.target.value)}><option value="INTERIOR">Interior</option><option value="EXTERIOR">Exterior</option></select></label>
    <label className="block text-sm font-bold">Surface Type *<div className="relative"><Search className="absolute left-3 top-5 h-4 w-4 text-slate-400" /><input required list="surface-types" value={draft.surfaceLabel} onChange={(event) => update("surfaceLabel", event.target.value)} placeholder="Search or enter a custom surface" className={(`${inputClass} pl-10 bp-control-leading-icon`) + " bp-ui-control"} /></div><datalist id="surface-types"><option value="Texture Walls" />{SURFACE_TYPES.filter(([key]) => key !== "OTHER").map(([, label]) => <option key={label} value={label} />)}</datalist></label>
    <label className="block text-sm font-bold">Label / Name *<input required value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="Floor 1" className={(inputClass) + " bp-ui-control"} /></label>
    <label className="block text-sm font-bold">Direct Area ({unit === "m" ? "sq. m." : "sq. ft."})<input aria-label="Direct Area" type="number" min="0" step="0.01" inputMode="decimal" value={draft.manual_area || ""} onChange={event => update("manual_area", event.target.value)} placeholder="Optional direct measured area" className={(inputClass) + " bp-ui-control"} /></label>
    <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-bold">L ({unit}) *<input required={!number(draft.manual_area)} type="number" inputMode="decimal" min="0.01" step="0.01" value={draft.length} onChange={(event) => update("length", event.target.value)} className={(inputClass) + " bp-ui-control"} /></label><label className="block text-sm font-bold">W / H ({unit}) *<input required={!number(draft.manual_area)} type="number" inputMode="decimal" min="0.01" step="0.01" value={draft.breadth} onChange={(event) => update("breadth", event.target.value)} className={(inputClass) + " bp-ui-control"} /></label></div>
    <label className="block text-sm font-bold">Quantity<input type="number" inputMode="numeric" min="1" step="1" value={draft.quantity} onChange={(event) => update("quantity", event.target.value)} className={(inputClass) + " bp-ui-control"} /></label>
    <div className="flex items-end justify-between rounded-xl bg-blue-50 p-4"><div><p className="text-xs font-bold uppercase text-blue-700">Calculated area</p><small>{draft.length || 0} x {draft.breadth || 0} x {draft.quantity || 1}</small></div><b className="text-xl text-[#064a9b]">{areaText(liveArea)}</b></div>
    <button disabled={saving} className="min-h-12 w-full rounded-lg bg-[#176b9b] font-bold text-white disabled:opacity-50 bp-ui-action">{saving ? "Saving..." : "Save Surface"}</button>
  </form></DialogShell>;
}
function DeductionDialog({ draft, setDraft, groups, save, close, saving, unit, liveArea, editing }) {
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  return <DialogShell title={editing ? "Edit Deduction / Addition" : "Add Deduction / Addition"} close={close}><form onSubmit={save} className="space-y-4 p-4 sm:p-6">
    <label className="block text-sm font-bold">Apply To *<select required value={draft.target} onChange={(event) => update("target", event.target.value)} className={(inputClass) + " bp-ui-control"}><option value="">Select Walls, Ceiling, Floor...</option>{groups.filter((group) => group.surfaces.length).map((group) => <option key={group.key} value={group.key}>{group.label} ({areaText(group.gross)})</option>)}</select></label>
    <label className="block text-sm font-bold">Item Type *<select required value={draft.type} onChange={(event) => update("type", event.target.value)} className={(inputClass) + " bp-ui-control"}>{DEDUCTION_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
    <label className="block text-sm font-bold">Label / Name<input value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder={draft.type} className={(inputClass) + " bp-ui-control"} /></label>
    <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-bold">W / L ({unit}) *<input required type="number" inputMode="decimal" min="0.01" step="0.01" value={draft.width} onChange={(event) => update("width", event.target.value)} className={(inputClass) + " bp-ui-control"} /></label><label className="block text-sm font-bold">H / W ({unit}) *<input required type="number" inputMode="decimal" min="0.01" step="0.01" value={draft.height} onChange={(event) => update("height", event.target.value)} className={(inputClass) + " bp-ui-control"} /></label></div>
    <label className="block text-sm font-bold">Quantity<input type="number" inputMode="numeric" min="1" step="1" value={draft.quantity} onChange={(event) => update("quantity", event.target.value)} className={(inputClass) + " bp-ui-control"} /></label>
    <label className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4"><input type="checkbox" checked={draft.deduct} onChange={(event) => update("deduct", event.target.checked)} className="mt-1 h-5 w-5" /><span><b className="block">Deduct from selected surface total</b></span></label>
    <div className={`flex items-end justify-between rounded-xl p-4 ${draft.deduct ? "bg-orange-50" : "bg-emerald-50"}`}><div><p className={`text-xs font-bold uppercase ${draft.deduct ? "text-orange-700" : "text-emerald-700"}`}>{draft.deduct ? "Deduction area" : "Addition area"}</p><small>{draft.width || 0} x {draft.height || 0} x {draft.quantity || 1}</small></div><b className={`text-xl ${draft.deduct ? "text-orange-700" : "text-emerald-700"}`}>{areaText(liveArea)}</b></div>
    <button disabled={saving} className="min-h-12 w-full rounded-lg bg-[#176b9b] font-bold text-white disabled:opacity-50 bp-ui-action">{saving ? "Saving..." : draft.deduct ? "Save Deduction" : "Save Addition"}</button>
  </form></DialogShell>;
}
