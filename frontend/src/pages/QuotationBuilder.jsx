import QuotationDocumentItems from "../components/QuotationDocumentItems.jsx";
import { SERVICE_MASTER_LABELS } from "../utils/serviceMasterLabels.js";
import useDraftUnsavedChanges from "../hooks/useDraftUnsavedChanges.js";
import { openRecovery, writeRecovery, clearRecovery } from "../utils/quotationRecovery.js";
import QuotationDiscountControls from "../components/QuotationDiscountControls.jsx";
import QuotationPricingRows from "../components/QuotationPricingRows.jsx";
import QuotationWorkItemSummary from "../components/QuotationWorkItemSummary.jsx";
import { QuotationLineItemPopup } from "../components/QuotationLineItemPopup.jsx";
import { quotationUnitOptions } from "../utils/quotationUnits.js";
import { missingQuotationFields, missingLumpSumItemFields, isUnfinishedLumpSumItem, retainedItemValidationMessage, clearItemValidationMessage } from "../utils/quotationItemValidation.js";
import { persistVersionedQuotation } from "../utils/versionedQuotation.js";
import { builderDraftPayload, draftForm, restoredGroupedItems } from "../utils/unifiedQuotation.js";
import { hasAssignment, isGroupedQuotation, restoreDraftAssignments } from "../utils/groupedQuotationDraft.js";
import { quotationTotals } from "../utils/quotationPricing.js";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { goBackFromBuilder } from "../utils/navigation";
import { ArrowLeft, ArrowRight, Building2, Check, Eye, IndianRupee, Pencil, Plus, Ruler, Search, Trash2, UserRoundPlus, X } from "lucide-react";
import api from "../api/client";
import SearchableSelect from "../components/SearchableSelect";
import CustomerConnectionFlow from "../components/CustomerConnectionFlow";
import PropertyForm from "../components/PropertyForm";
import { previewPdf } from "../components/PdfPreview";
import { Button, PageHeader, StatusBadge } from "../components/ui";
import "./quotation-measurement.css";
import { availableWallArea } from "../utils/specialWallArea";
import GroupedQuotationWorkspace from "../components/GroupedQuotationWorkspace";
import { assignmentQuotationItems, deleteAssignment, groupedQuotationRoom, quotationRoomAreaLabel } from "../utils/groupedQuotation";
import SpecialWallSheet from "../components/SpecialWallSheet";
import useAuth from "../context/useAuth";
import { continueMeasurementPath } from "../utils/measurementRecords.js";
import { quotationCustomerDisplay } from "../utils/salesHandoffs.js";

const emptyItem = {
  room_index: "",
  property_room_id: "",
  service_category: "",
  custom_service_category: "",
  save_service_category_to_master: false,
  service_type: "",
  paint_type: "",
  custom_product_type: "",
  save_product_type_to_master: false,
  paint_brand: "",
  custom_brand: "",
  save_brand_to_master: false,
  color: "",
  description: "",
  promote_to_master: false,
  calculation_method: "MANUAL",
  is_additional_service: false,
  custom_unit: "",
  coats: 1,
  quantity: "",
  unit: "",
  rate: "",
  included_areas: [],
};
const steps = [
  "Customer, property and measurements",
  "Surface, materials and specifications",
  "Pricing and final review",
];
const money = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(value || 0),
  );
const SURFACE_LABELS = {
  FLOOR: "Floor", WOOD_WORK: "Wood Work", TILE: "Tile / Tiling",
  WALLPAPER: "Wallpaper", METAL: "Metal", GLASS: "Glass", DOOR: "Door",
  WINDOW: "Window", COLUMN: "Column", BEAM: "Beam", GATE: "Gate",
  GRILL: "Grill / Railing", BALCONY_SOFFIT: "Balcony Ceiling",
  STAIR_SOFFIT: "Staircase Ceiling", PORCH_CEILING: "Porch Ceiling",
  WATERPROOFING: "Floor / Terrace Waterproofing", PARAPET: "Parapet Wall",
};
const quotationSurfaceGroup = (surface) => {
  const label = surface.surface_type === "OTHER"
    ? String(surface.area_group_name || surface.name || "Other surface").trim()
    : SURFACE_LABELS[surface.surface_type] || String(surface.surface_type || "Surface").replaceAll("_", " ");
  const key = surface.surface_type === "OTHER"
    ? `OTHER:${label.toLowerCase()}`
    : surface.surface_type;
  return { label, key };
};
function incompleteLineMessage(items) {
  const index = items.findIndex((item) => missingQuotationFields(item).length);
  if (index < 0) return "";
  return `Line ${index + 1} (${items[index].room_name || "service"}) needs: ${missingQuotationFields(items[index]).join(", ")}.`;
}

export default function QuotationBuilder({ initialQuotation = null }) {
  const { user } = useAuth();
  const location = useLocation();
  const [recovery] = useState(() => {
    try {
      const storage = window.localStorage;
      const user = JSON.parse(storage.getItem("bharath_user") || "null");
      let tabStorage = null;
      try { tabStorage = window.sessionStorage; } catch { /* Persistent recovery still works. */ }
      return { storage, ...openRecovery(storage, tabStorage, user?.id, location.pathname, location.search, initialQuotation?.updated_at) };
    } catch { return { key: null, storage: null, state: null }; }
  });
  const recovered = recovery.state;
  const recoveryCleared = useRef(false);
  const propertyFirstLoad = useRef(recovered?.form.property);
  const measurementFirstLoad = useRef(recovered?.selectedMeasurementId);
  const measurementSource = useRef(null);
  const [savedQuotation, setSavedQuotation] = useState(initialQuotation);
  const savedDraft = useRef(initialQuotation);
  const editing = Boolean(initialQuotation);
  const sourceLocked = Boolean(savedQuotation);
  const lumpEditable = !savedQuotation || savedQuotation.can_create_version === true;
  const [dataReady,setDataReady] = useState(false);
  const [sourceReady,setSourceReady] = useState(!initialQuotation || Boolean(recovered?.savedRooms?.length));
  const [notice,setNotice] = useState(location.state?.submissionError ? "Draft saved. Sending could not be confirmed. Retry Save & Send to submit this same Draft." : "");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sourceLead = searchParams.get("lead") ?? recovered?.sourceLead ?? initialQuotation?.lead ?? null;
  const [step, setStep] = useState(recovered?.step ?? (location.state?.resumeReview ? 2 : 0));
  const [useMeasurements, setUseMeasurements] = useState(recovered?.useMeasurements ?? (initialQuotation ? initialQuotation.quotation_type === "MEASUREMENT" : !location.pathname.endsWith("new-manual")));
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState(recovered?.customerSearch || "");
  const [properties, setProperties] = useState([]);
  const [savedRooms, setSavedRooms] = useState(recovered?.savedRooms || []);
  const [measurements, setMeasurements] = useState(recovered?.measurements || []);
  const [measurementRecords, setMeasurementRecords] = useState(recovered?.measurementRecords || []);
  const [measurementRecordsLoading, setMeasurementRecordsLoading] = useState(false);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState(recovered?.selectedMeasurementId ?? String(initialQuotation?.measurement_record || ""));
  const [selectedRoomIds, setSelectedRoomIds] = useState(recovered?.selectedRoomIds ?? (initialQuotation?.rooms || []).map(room=>room.property_room).filter(Boolean));
  const [selectedFieldIds, setSelectedFieldIds] = useState(recovered?.selectedFieldIds || []);
  const knownFieldIds = useRef(new Set(recovered?.items.filter(item=>item.field_id).map(item=>item.field_id) || []));
  const [specialWalls, setSpecialWalls] = useState(recovered?.specialWalls || []);
  const [specialWallEditor, setSpecialWallEditor] = useState(recovered?.specialWallEditor || null);
  const [specialWallRecovery, setSpecialWallRecovery] = useState(recovered?.specialWallRecovery || null);
  const [groupAssignments, setGroupAssignments] = useState(recovered?.groupAssignments ?? (initialQuotation ? restoreDraftAssignments(initialQuotation.items || []) : { groups: [], specials: [], services: [], rates: {} }));
  const [openingGroupRequest, setOpeningGroupRequest] = useState(null);
  const [workEditorRecovery, setWorkEditorRecovery] = useState(recovered?.workEditorRecovery || null);
  const [masters, setMasters] = useState({
    categories: [],
    services: [],
    paintTypes: [],
    descriptions: [],
    brands: [],
    colors: [],
    units: [],
    roomTypes: [],
  });
  const [form, setForm] = useState(() => recovered?.form ?? draftForm(initialQuotation || {}, {
    customer: searchParams.get("customer") || "",
    property: searchParams.get("property") || "",
    valid_until: "",
    discount_mode: "BOTH",
    discount_type: "FIXED",
    discount_value: 0,
    gst_mode: "GST_EXTRA",
    gst_percentage: 18,
    notes: "",
    terms_conditions: "",
    prepared_by: "",
    inspected_by: "",
    payment_terms: "",
    product_details: "",
    show_product_key_features: true,
    work_duration: "",
    work_procedures: "",
  }));
  const [items, setItems] = useState(recovered?.items ?? (initialQuotation?.items || []).filter(item=>!hasAssignment(item)).map(item=>{
    const room=initialQuotation.rooms.find(entry=>String(entry.id)===String(item.room));
    return {...emptyItem,...item,property_room_id:room?.property_room || '',room_name:room?.name || item.included_areas?.[0] || 'General'};
  }));
  const [mobileItemIndex, setMobileItemIndex] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewingPdf, setPreviewingPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(location.state?.submissionError || "");
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [savingProperty, setSavingProperty] = useState(false);
  async function createCustomer(values) {
    const { data } = await api.post("/quotations/customers/", values);
    if (data.connection_status !== "CONNECTED") {
      setError("Customer saved. You can create a quotation after the customer accepts your connection request.");
      return data;
    }
    setCustomers((current) => [data, ...current.filter((item) => item.id !== data.id)]);
    setCustomerSearch(data.name);
    setForm((current) => ({ ...current, customer: data.id, property: "" }));
    return data;
  }
  async function createProperty(values) {
    setSavingProperty(true);
    try {
      const { data } = await api.post("/quotations/properties/", values);
      setProperties((current) => [data, ...current.filter((item) => item.id !== data.id)]);
      setForm((current) => ({ ...current, customer: data.customer, property: data.id }));
      setShowPropertyForm(false);
      setError("");
    } catch (requestError) {
      setError(formatError(requestError.response?.data) || "Property could not be created.");
    } finally {
      setSavingProperty(false);
    }
  }
  useEffect(() => {
    Promise.all([
      api.get("/quotations/customers/", { params: { include_pending: 1 } }),
      api.get("/quotations/properties/"),
      api.get("/quotations/service-categories/"),
      api.get("/quotations/service-types/"),
      api.get("/quotations/paint-types/"),
      api.get("/quotations/work-descriptions/"),
      api.get("/quotations/brands/"),
      api.get("/quotations/colors/"),
      api.get("/quotations/units/"),
      api.get("/quotations/areas/"),
      api.get("/accounts/contractor-profile/"),
    ])
      .then(([c, p, sc, s, pt, wd, b, col, u, areas, profile]) => {
        const list = (response) => response.data.results || response.data;
        setCustomers(list(c));
        setProperties(list(p));
        setMasters({
          categories: list(sc),
          services: list(s),
          paintTypes: list(pt),
          descriptions: list(wd),
          brands: list(b),
          colors: list(col),
          units: list(u),
          roomTypes: list(areas),
        });
        if (!initialQuotation && !recovered) setForm((current) => ({
          ...current,
          terms_conditions: profile.data.quotation_terms_conditions || "",
          prepared_by: profile.data.quotation_prepared_by || "",
          inspected_by: profile.data.quotation_inspected_by || "",
          work_duration: profile.data.quotation_work_duration || "",
          payment_terms: profile.data.quotation_payment_terms || "",
          product_details: profile.data.quotation_product_details || "",
          work_procedures: profile.data.quotation_work_procedures || "",
        }));
      })
      .catch(() => setError("Quotation data could not be loaded.")).finally(()=>setDataReady(true));
  }, [initialQuotation, recovered]);
  useEffect(() => {
    if (initialQuotation) return;
    const restoring = Boolean(recovered) && propertyFirstLoad.current === form.property;
    if (!restoring) propertyFirstLoad.current = null;
    if (!restoring) {
      setItems([]);
      setSpecialWalls([]);
      setGroupAssignments({ groups: [], specials: [], services: [], rates: {} });
      setWorkEditorRecovery(null);
      setOpeningGroupRequest(null);
      setSpecialWallEditor(null);
      setSelectedFieldIds([]);
      knownFieldIds.current = new Set();
    }
    if (!form.property) {
      setMeasurementRecordsLoading(false);
      setMeasurementRecords([]);
      setSelectedMeasurementId("");
      setSavedRooms([]);
      setMeasurements([]);
      setSelectedRoomIds([]);
      return;
    }
    const requestedMeasurement = searchParams.get("measurement");
    const requestedProperty = searchParams.get("property");
    setMeasurementRecordsLoading(true);
    api.get(`/quotations/properties/${form.property}/measurement-records/`)
      .then((response) => {
        const records = response.data.results || response.data;
        setMeasurementRecords(records);
        const requested = requestedMeasurement && String(form.property) === String(requestedProperty)
          ? records.find((record) => String(record.id) === String(requestedMeasurement))
          : null;
        setSelectedMeasurementId(restoring ? String(recovered.selectedMeasurementId || "") : String(requested?.id || records[0]?.id || ""));
      })
      .catch(() => {
        if (!restoring) {
          setMeasurementRecords([]);
          setSelectedMeasurementId("");
        }
        setError("Saved Area Calculations could not be loaded for this property. Your recovered inputs are retained. Refresh to retry loading.");
      }).finally(() => setMeasurementRecordsLoading(false));
  }, [form.property, searchParams, initialQuotation, recovered]);
  useEffect(() => {
    if (initialQuotation) return;
    const restoring = Boolean(recovered) && measurementFirstLoad.current === selectedMeasurementId;
    const source = `${form.property}:${selectedMeasurementId}`;
    const sourceChanged = measurementSource.current !== source;
    measurementSource.current = source;
    if (!restoring) measurementFirstLoad.current = null;
    if (!restoring && sourceChanged) {
      if (useMeasurements) setItems([]);
      setSpecialWalls([]);
      setGroupAssignments({ groups: [], specials: [], services: [], rates: {} });
      setWorkEditorRecovery(null);
      setOpeningGroupRequest(null);
      setSpecialWallEditor(null);
      setSelectedFieldIds([]);
      knownFieldIds.current = new Set();
    }
    if (!form.property || !selectedMeasurementId) {
      if (!restoring) {
        setSavedRooms([]);
        setMeasurements([]);
        setSelectedRoomIds([]);
      }
      return;
    }
    const params = { measurement: selectedMeasurementId };
    let active = true;
    Promise.all([
      api.get(`/quotations/properties/${form.property}/rooms/`, { params }),
      api.get(`/quotations/properties/${form.property}/measurements/`, { params }),
    ]).then(([roomResponse, measurementResponse]) => {
      if (!active) return;
      const rooms = roomResponse.data.results || roomResponse.data;
      setSavedRooms(rooms);
      setMeasurements(measurementResponse.data.results || measurementResponse.data);
      if (!restoring) setSelectedRoomIds(rooms.map((room) => room.id));
    }).catch(() => { if (active) setError("The selected Area Calculation could not be loaded. Your recovered inputs are retained. Refresh to retry loading."); });
    return () => { active = false; };
  }, [form.property, selectedMeasurementId, initialQuotation, recovered, useMeasurements]);
  useEffect(()=>{
    if(!initialQuotation)return;
    let active=true;const params=initialQuotation.measurement_record?{measurement:initialQuotation.measurement_record}:undefined;
    Promise.all([api.get(`/quotations/properties/${initialQuotation.property}/rooms/`,{params}),api.get(`/quotations/properties/${initialQuotation.property}/measurements/`,{params}),api.get(`/quotations/properties/${initialQuotation.property}/measurement-records/`)]).then(([rooms,surfaces,records])=>{
      if(!active)return;setSavedRooms(rooms.data.results || rooms.data);setMeasurements(surfaces.data.results || surfaces.data);setMeasurementRecords(records.data.results || records.data);setSourceReady(true);
    }).catch(()=>{if(active)setError("Saved Draft measurements could not be loaded. Your saved lines are preserved.");});
    return()=>{active=false;};
  },[initialQuotation]);
  const availableProperties = properties.filter(
    (item) => String(item.customer) === String(form.customer),
  );
  const selectedProperty = properties.find((item) => String(item.id) === String(form.property)) || (savedQuotation ? {id:savedQuotation.property,name:savedQuotation.property_name}:null);
  const selectedCustomer = customers.find((item) => String(item.id) === String(form.customer)) || (savedQuotation ? {id:savedQuotation.customer,name:savedQuotation.customer_name}:null);
  const exteriorMode = selectedProperty?.measurement_type === "EXTERIOR";
  const customerSearchResults = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((item) =>
      [item.name, item.mobile, item.email, item.city].some((value) =>
        String(value || "").toLowerCase().includes(term),
      ),
    );
  }, [customerSearch, customers]);
  const recentCustomers = customerSearch ? [] : customerSearchResults.slice(0, 5);
  const selectedRooms = useMemo(
    () => savedRooms.filter((room) => selectedRoomIds.includes(room.id)),
    [savedRooms, selectedRoomIds],
  );
  const quotationRoomOptions = useMemo(() => {
    const options = [];
    const names = new Set();
    savedRooms.forEach((room) => {
      const name = String(room.name || "").trim();
      if (!name || names.has(name.toLowerCase())) return;
      names.add(name.toLowerCase());
      options.push({ key: `property-${room.id}`, name, propertyRoomId: room.id, roomIndex: selectedRooms.findIndex((selected) => String(selected.id) === String(room.id)) });
    });
    masters.roomTypes.forEach((room) => {
      const name = String(room.name || "").trim();
      if (!name || names.has(name.toLowerCase())) return;
      names.add(name.toLowerCase());
      options.push({ key: `master-${room.id}`, name, propertyRoomId: "" });
    });
    return options;
  }, [savedRooms, masters.roomTypes, selectedRooms]);
  const originalMeasurementFields = useMemo(() => {
    const lines = [];
    const paintingCategory = masters.categories.find((entry) => entry.name.toLowerCase() === "painting") || masters.categories.find((entry) => entry.name.toLowerCase().includes("paint"));
    const exteriorPaintingCategory = masters.categories.find(
      (entry) => entry.name.trim().toLowerCase() === "exterior painting",
    ) || paintingCategory;
    const squareFeetUnit = masters.units.find((entry) => ["sq ft", "sqft", "square feet", "square foot"].includes(entry.name.toLowerCase()));
    if (exteriorMode) {
      const exteriorSurfaces = measurements.filter((surface) => surface.work_area === "EXTERIOR" && ["WALL", "CEILING"].includes(surface.surface_type));
      const roomGroups = new Map();
      exteriorSurfaces.forEach((surface) => {
        const roomIndex = savedRooms.findIndex((room) => String(room.id) === String(surface.room));
        const room = roomIndex >= 0 ? savedRooms[roomIndex] : null;
        const roomKey = surface.room || "general";
        const key = `${roomKey}-${surface.surface_type}`;
        const current = roomGroups.get(key) || {
          room_id: surface.room || null,
          room_name: room?.name || surface.room_name || "Exterior",
          room_type_name: "Exterior",
          room_index: roomIndex >= 0 ? roomIndex : "",
          surface_type: surface.surface_type,
          scope: "room",
          selection_group: surface.surface_type,
          quantity: 0,
        };
        current.quantity += Number(surface.net_area || 0);
        roomGroups.set(key, current);
      });
      const surfaceOrder = ["WALL", "CEILING"];
      const addField = (field) => {
        const surfaceLabel =
          field.description ||
          (field.surface_type === "WALL" ? "Net Wall" : "Net Ceiling");
        lines.push({
          ...emptyItem,
          ...field,
          field_id: `exterior-${field.scope}-${field.room_id || "all"}-${field.surface_type.toLowerCase()}${field.group_key ? `-${field.group_key}` : field.surface_id ? `-${field.surface_id}` : ""}`,
          service_category: exteriorPaintingCategory?.id || "",
          service_type: "",
          unit: squareFeetUnit?.id || "",
          description: surfaceLabel,
          calculation_method: "MANUAL",
          quantity: field.quantity.toFixed(2),
        });
      };
      surfaceOrder.forEach((surfaceType) => {
        const quantity = exteriorSurfaces
          .filter((surface) => surface.surface_type === surfaceType)
          .reduce((sum, surface) => sum + Number(surface.net_area || 0), 0);
        if (quantity > 0) addField({ room_id: null, room_name: "Full Exterior", room_type_name: "Exterior", room_index: "", surface_type: surfaceType, scope: "full", selection_group: surfaceType, quantity });
      });
      [...roomGroups.values()]
        .filter((field) => field.quantity > 0)
        .sort((left, right) => {
          const roomDifference = Number(left.room_index || 0) - Number(right.room_index || 0);
          if (roomDifference) return roomDifference;
          return surfaceOrder.indexOf(left.surface_type) - surfaceOrder.indexOf(right.surface_type);
        })
        .forEach(addField);
      const exteriorCustomGroups = new Map();
      const exteriorCustomTotals = new Map();
      measurements
        .filter(
          (surface) =>
            surface.work_area === "EXTERIOR" &&
            !["WALL", "CEILING"].includes(surface.surface_type) &&
            Number(surface.net_area || 0) > 0,
        )
        .forEach((surface) => {
          const roomIndex = savedRooms.findIndex(
            (room) => String(room.id) === String(surface.room),
          );
          const room = roomIndex >= 0 ? savedRooms[roomIndex] : null;
          const { label: areaName, key: areaKey } = quotationSurfaceGroup(surface);
          const roomKey = String(surface.room || room?.id || "general");
          const key = `${roomKey}::${areaKey}`;
          if (!exteriorCustomTotals.has(areaKey)) {
            exteriorCustomTotals.set(areaKey, { areaName, surfaceType: surface.surface_type, quantity: 0 });
          }
          exteriorCustomTotals.get(areaKey).quantity += Number(
            surface.net_area || 0,
          );
          if (!exteriorCustomGroups.has(key)) {
            exteriorCustomGroups.set(key, {
              room_id: surface.room || null,
              room_name: room?.name || surface.room_name || "Exterior",
              room_type_name: "Exterior",
              room_index: roomIndex >= 0 ? roomIndex : "",
              surface_type: surface.surface_type,
              scope: "room",
              selection_group: areaKey,
              group_key: encodeURIComponent(areaKey),
              quantity: 0,
              description: areaName,
            });
          }
          exteriorCustomGroups.get(key).quantity += Number(
            surface.net_area || 0,
          );
        });
      [...exteriorCustomTotals.entries()].forEach(
        ([areaKey, { areaName, surfaceType, quantity }]) =>
          addField({
            room_id: null,
            room_name: "Full Exterior",
            room_type_name: "Exterior",
            room_index: "",
            surface_type: surfaceType,
            scope: "full",
            selection_group: areaKey,
            group_key: encodeURIComponent(areaKey),
            quantity,
            description: `${areaName} Total`,
          }),
      );
      [...exteriorCustomGroups.values()].forEach(addField);
      return lines;
    }
    const houseTotals = selectedRooms.reduce(
      (totals, room) => {
        const roomSurfaces = measurements.filter((surface) => surface.room === room.id);
        const walls = roomSurfaces.filter((surface) => surface.surface_type === "WALL");
        const grossWall = walls.reduce((sum, surface) => sum + Number(surface.gross_area || 0), 0);
        const deductions = walls.reduce((sum, surface) => sum + Number(surface.deduction_area || 0), 0);
        const additions = walls.reduce((sum, surface) => sum + Number(surface.addition_area || 0), 0);
        return {
          grossWall: totals.grossWall + grossWall,
          deductions: totals.deductions + deductions,
          additions: totals.additions + additions,
          legacyWall: totals.legacyWall + (roomSurfaces.length ? 0 : Number(room.paintable_area || 0)),
          ceiling: totals.ceiling + roomSurfaces
            .filter((surface) => surface.surface_type === "CEILING")
            .reduce((sum, surface) => sum + Number(surface.net_area || 0), 0) + (roomSurfaces.length ? 0 : Number(room.ceiling_area || 0)),
        };
      },
      { grossWall: 0, deductions: 0, additions: 0, legacyWall: 0, ceiling: 0 },
    );
    const netWall = Math.max(
      0,
      houseTotals.grossWall - houseTotals.deductions + houseTotals.additions,
    ) + houseTotals.legacyWall;
    const houseField = (field_id, description, quantity) => ({
      ...emptyItem,
      field_id,
      room_id: null,
      room_name: "Full House",
      room_index: "",
      service_category: paintingCategory?.id || "",
      service_type: "",
      unit: squareFeetUnit?.id || "",
      description,
      calculation_method: "MANUAL",
      quantity: quantity.toFixed(2),
    });
    if (netWall > 0)
      lines.push({
        ...houseField("full-house-wall", "Full House - Net Wall Area", netWall),
        surface_type: "WALL",
        scope: "full",
        selection_group: "WALL",
      });
    if (houseTotals.ceiling > 0)
      lines.push({
        ...houseField("full-house-ceiling", "Full House - Total Ceiling Area", houseTotals.ceiling),
        surface_type: "CEILING",
        scope: "full",
        selection_group: "CEILING",
      });
    const houseCustomGroups = new Map();
    selectedRooms.forEach((room) => {
      measurements
        .filter(
          (surface) =>
            String(surface.room) === String(room.id) &&
            !["WALL", "CEILING"].includes(surface.surface_type) &&
            Number(surface.net_area || 0) > 0,
        )
        .forEach((surface) => {
          const { label: areaName, key } = quotationSurfaceGroup(surface);
          if (!houseCustomGroups.has(key)) {
            houseCustomGroups.set(key, { areaName, surfaceType: surface.surface_type, quantity: 0 });
          }
          houseCustomGroups.get(key).quantity += Number(surface.net_area || 0);
        });
    });
    [...houseCustomGroups.entries()].forEach(
      ([areaKey, { areaName, surfaceType, quantity }]) =>
        lines.push({
          ...houseField(
            `full-house-custom-${encodeURIComponent(areaKey)}`,
            `${areaName} Total`,
            quantity,
          ),
          surface_type: surfaceType,
          scope: "full",
          selection_group: areaKey,
          custom_area_name: areaName,
        }),
    );
    selectedRooms.forEach((room, roomIndex) => {
      const roomSurfaces = measurements.filter((surface) => surface.room === room.id);
      const walls = roomSurfaces.filter((surface) => surface.surface_type === "WALL");
      const roomGross = walls.reduce((sum, surface) => sum + Number(surface.gross_area || 0), 0);
      const roomDeductions = walls.reduce((sum, surface) => sum + Number(surface.deduction_area || 0), 0);
      const roomAdditions = walls.reduce((sum, surface) => sum + Number(surface.addition_area || 0), 0);
       const roomNetWall = roomSurfaces.length
         ? Math.max(0, roomGross - roomDeductions + roomAdditions)
         : Number(room.paintable_area || 0);
      const roomCeiling = roomSurfaces
        .filter((surface) => surface.surface_type === "CEILING")
         .reduce((sum, surface) => sum + Number(surface.net_area || 0), 0) || (roomSurfaces.length ? 0 : Number(room.ceiling_area || 0));
      if (roomNetWall > 0)
        lines.push({
          ...houseField(`room-${room.id}-wall`, `${room.name} - Net Wall Area`, roomNetWall),
          room_id: room.id,
          room_name: room.name,
          room_index: roomIndex,
          surface_type: "WALL",
          scope: "room",
          selection_group: "WALL",
        });
      if (roomCeiling > 0)
        lines.push({
          ...houseField(`room-${room.id}-ceiling`, `${room.name} - Total Ceiling Area`, roomCeiling),
          room_id: room.id,
          room_name: room.name,
          room_index: roomIndex,
          surface_type: "CEILING",
          scope: "room",
          selection_group: "CEILING",
        });
      const customGroups = new Map();
      roomSurfaces
        .filter(
          (surface) =>
            !["WALL", "CEILING"].includes(surface.surface_type) &&
            Number(surface.net_area || 0) > 0,
        )
        .forEach((surface) => {
          const { label: areaName, key } = quotationSurfaceGroup(surface);
          if (!customGroups.has(key)) {
            customGroups.set(key, { areaName, surfaceType: surface.surface_type, selectionGroup: key, quantity: 0 });
          }
          customGroups.get(key).quantity += Number(surface.net_area || 0);
        });
      [...customGroups.values()].forEach(({ areaName, surfaceType, selectionGroup, quantity }) =>
        lines.push({
            ...houseField(
              `room-${room.id}-custom-${encodeURIComponent(areaName.toLowerCase())}`,
              areaName,
              quantity,
            ),
            room_id: room.id,
            room_name: room.name,
            room_index: roomIndex,
            surface_type: surfaceType,
            scope: "room",
            selection_group: selectionGroup,
            custom_area_name: areaName,
          }),
        );
    });
    return lines;
  }, [measurements, selectedRooms, savedRooms, masters.categories, masters.units, exteriorMode]);
  const measurementFields = useMemo(() => originalMeasurementFields.flatMap((field) => {
    const surfaces = specialWalls.filter((wall) => wall.parent_field_id === field.field_id);
    if (!surfaces.length) return [field];
    return [{ ...field, quantity: availableWallArea(field.quantity, surfaces, field.field_id), description: "Normal Walls" }, ...surfaces.map((wall) => ({ ...field, ...wall, description: wall.work_description, custom_area_name: wall.name }))];
  }), [originalMeasurementFields, specialWalls]);
  function saveSpecialWall(values) {
    const parent = specialWallEditor.parent;
    const id = specialWallEditor.wall?.field_id || `special-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const wall = { ...values, custom_service_category: values.custom_service_category || "", field_id: id, parent_field_id: parent.field_id, selection_group: "WALL", scope: "room", work_description: values.name };
    setSpecialWalls((current) => [...current.filter((entry) => entry.field_id !== id), wall]);
    setItems((current) => current.map((item) => item.field_id === id ? { ...item, ...wall, description: wall.work_description } : item));
    setSelectedFieldIds((current) => [...new Set([...current.filter((fieldId) => !originalMeasurementFields.some((field) => field.field_id === fieldId && field.scope === "full" && field.selection_group === "WALL")), ...originalMeasurementFields.filter((field) => field.scope === "room" && field.selection_group === "WALL").map((field) => field.field_id), id])]);
    setSpecialWallEditor(null);
  }
  function deleteSpecialWall() {
    const id = specialWallEditor.wall.field_id;
    setSpecialWalls((current) => current.filter((wall) => wall.field_id !== id));
    setSelectedFieldIds((current) => current.filter((fieldId) => fieldId !== id));
    setSpecialWallEditor(null);
  }
  useEffect(() => {
    if (initialQuotation || !useMeasurements) return;
    if (!measurementFields.length) return;
    const newIds = measurementFields
      .map((field) => field.field_id)
      .filter((fieldId) => !knownFieldIds.current.has(fieldId));
    newIds.forEach((fieldId) => knownFieldIds.current.add(fieldId));
    const defaultIds = measurementFields
      .filter((field) => (exteriorMode ? field.scope === "full" : !field.room_id) && !(specialWalls.length && field.selection_group === "WALL"))
      .map((field) => field.field_id)
      .filter((fieldId) => newIds.includes(fieldId));
    setSelectedFieldIds((current) => [...new Set([...current, ...defaultIds])]);
    setItems((current) => {
      const existing = new Map(
        current
          .filter((item) => item.field_id)
          .map((item) => [item.field_id, item]),
      );
      const custom = current.filter((item) => !item.field_id);
      return [
        ...measurementFields.map((field) => ({
          ...field,
          ...existing.get(field.field_id),
          room_index: field.room_index,
          room_id: field.room_id,
          room_name: field.room_name,
          room_type_name: field.room_type_name,
          surface_type: field.surface_type,
          quantity: field.quantity,
          service_category: existing.get(field.field_id)?.service_category || (existing.get(field.field_id)?.custom_service_category ? "" : field.service_category),

        })),
        ...custom,
      ];
    });
  }, [measurementFields, exteriorMode, specialWalls.length, initialQuotation, useMeasurements]);
  const groupedMode = useMeasurements && Boolean(selectedMeasurementId) && (!editing || isGroupedQuotation(savedQuotation || initialQuotation));
  const assignmentMeasurement = useMemo(() => ({
    id: Number(selectedMeasurementId),
    version: measurementRecords.find((record) => String(record.id) === String(selectedMeasurementId))?.version ?? savedQuotation?.items.find(item=>item.specification_details?.measurement_version)?.specification_details.measurement_version ?? 1,
    rooms: [...savedRooms, ...(measurements.some(surface => !surface.room && surface.work_area === "EXTERIOR") ? [{id:null, name:"Exterior"}] : [])],
    surfaces: measurements,
  }), [selectedMeasurementId, measurementRecords, savedRooms, measurements,savedQuotation]);
  const assignedItems = useMemo(() => groupedMode && dataReady && sourceReady && assignmentMeasurement.rooms.length ? savedQuotation ? restoredGroupedItems(savedQuotation,assignmentMeasurement,groupAssignments,masters) : assignmentQuotationItems(assignmentMeasurement, groupAssignments, masters).map(line=>({...line,rate:groupAssignments.rates[line.specification_details.assignment_id] ?? line.rate})) : [], [groupedMode, dataReady, sourceReady, assignmentMeasurement, groupAssignments, masters,savedQuotation]);
  const submissionLock = useRef(false);
  const builderSnapshot=JSON.stringify({form,items,groupAssignments,selectedRoomIds,selectedFieldIds});
  const initialSnapshot=useRef(recovered?.initialSnapshot || builderSnapshot);
  const recoveryState = useMemo(() => ({form,items,groupAssignments,selectedRoomIds,selectedFieldIds,specialWalls,selectedMeasurementId,useMeasurements,step,customerSearch,workEditorRecovery,specialWallEditor,specialWallRecovery:specialWallEditor ? specialWallRecovery : null,initialSnapshot:initialSnapshot.current,savedRooms,measurements,measurementRecords,sourceLead}), [form,items,groupAssignments,selectedRoomIds,selectedFieldIds,specialWalls,selectedMeasurementId,useMeasurements,step,customerSearch,workEditorRecovery,specialWallEditor,specialWallRecovery,savedRooms,measurements,measurementRecords,sourceLead]);
  const latestRecovery = useRef(recoveryState);
  latestRecovery.current = recoveryState;
  useEffect(() => {
    const flush = () => {
      if (!recoveryCleared.current) writeRecovery(recovery.storage, recovery.key, latestRecovery.current, initialQuotation?.updated_at);
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => { window.removeEventListener("pagehide", flush); window.removeEventListener("beforeunload", flush); };
  }, [recovery.key, recovery.storage, initialQuotation?.updated_at]);
  function clearBrowserRecovery() {
    recoveryCleared.current = true;
    clearRecovery(recovery.storage, recovery.key);
  }
  const markBuilderSaved = useDraftUnsavedChanges(editing ? (builderSnapshot!==initialSnapshot.current || Boolean(workEditorRecovery || specialWallEditor)) : Boolean(form.customer || items.length || groupAssignments.groups.length || groupAssignments.specials.length || groupAssignments.services?.length));
  const activeItems = useMemo(() => {
    const lines=(groupedMode ? [...assignedItems,...items.filter(item=>!item.field_id)] : items.filter(item=>!item.field_id || selectedFieldIds.includes(item.field_id))).filter(item=>useMeasurements || !isUnfinishedLumpSumItem(item, masters));
    if(!savedQuotation)return lines;
    const order=new Map(savedQuotation.items.map((item,index)=>[item.id,index]));
    return lines.sort((a,b)=>(order.get(a.id) ?? Number.MAX_SAFE_INTEGER)-(order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  },[groupedMode,assignedItems,items,selectedFieldIds,savedQuotation,useMeasurements,masters]);
  const selectedProductDetails = useMemo(
    () => uniqueProductDetails(activeItems, masters.paintTypes, masters.brands),
    [activeItems, masters.paintTypes, masters.brands],
  );
  const preview = useMemo(() => {
    const priced = activeItems.map((item) => {
      if (editing || ["LUMPSUM","MANUAL"].includes(item.calculation_method)) return item;
      const room = selectedRooms[Number(item.room_index)];
      const service = masters.services.find(
        (entry) => String(entry.id) === String(item.service_type),
      );
      if (!room || !service) return {...item,quantity:0};
      const measured = room.measurement_totals || {};
      const wall = measured.has_measurements
        ? Number(measured.wall_net)
        : Number(room.paintable_area);
      const ceiling = measured.has_measurements
        ? Number(measured.ceiling)
        : Number(room.ceiling_area);
      const quantities = {
        WALL: wall,
        CEILING: ceiling,
        WALL_CEILING: wall + ceiling,
        DOOR: measured.has_measurements
          ? Number(measured.door)
          : Number(room.door_area),
        WINDOW: measured.has_measurements
          ? Number(measured.window)
          : Number(room.window_area),
        WARDROBE: Number(measured.wardrobe),
        WATERPROOFING: Number(item.quantity),
        CUSTOM: Number(item.quantity),
      };
      return {...item,quantity:quantities[service.calculation_type] || 0};
    });
    return quotationTotals(priced,form);
  }, [activeItems, form, selectedRooms, masters.services, editing]);
  const update = (name, value) =>
    setForm((current) => ({ ...current, [name]: value }));
  const updateItem = (index, name, value) =>
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [name]: value } : item,
      ),
    );
  const updateMasterChoice = (index, field, customField, saveField, value, customName = "") =>
    setItems((current) => current.map((item, itemIndex) => itemIndex === index
      ? { ...item, [field]: value, [customField]: customName, [saveField]: customName ? item[saveField] : false,
          ...(field === "service_category" ? { service_type: "" } : {}) }
      : item));
  const updateProductType = (index, value, customName = "") => {
    const product = masters.paintTypes.find((entry) => String(entry.id) === String(value));
    setItems((current) => current.map((item, itemIndex) => itemIndex === index
      ? { ...item, paint_type: value, custom_product_type: customName,
          save_product_type_to_master: customName ? item.save_product_type_to_master : false,
          ...(product?.default_price !== null && product?.default_price !== undefined && (item.rate === "" || item.rate === null || item.rate === undefined) ? { rate: String(product.default_price) } : {}) }
      : item));
  };
  const updateMeasurementFieldItem = (fieldId, name, value) =>
    setItems((current) => current.map((item) =>
      item.field_id === fieldId ? { ...item, [name]: value } : item,
    ));
  const updateFieldMaterial = (fieldId, values) => {
    setItems((current) => current.map((item) => item.field_id === fieldId ? { ...item, ...values } : item));
    setSpecialWalls((current) => current.map((wall) => wall.field_id === fieldId ? { ...wall, ...values, ...(values.description ? { work_description: values.description } : {}) } : wall));
  };
  const addAdditionalService = () => {
    if (!useMeasurements && !lumpEditable) return;
    setError(clearItemValidationMessage);
    const pending = !useMeasurements ? items.findIndex(item => isUnfinishedLumpSumItem(item, masters)) : -1;
    if (pending >= 0) { setMobileItemIndex(pending); return; }
    setMobileItemIndex(items.length);
    setItems((current) => [...current, { ...emptyItem, description: "", calculation_method: "MANUAL", is_additional_service: true, quantity: 1, coats: 1, ...(!useMeasurements ? {lumpsum_item_pending:true} : {}) }]);
  };
  function removeWorkItem(item) {
    if (!lumpEditable) return false;
    if (!window.confirm(`Delete ${item.description || "this work item"} from the quotation? Save the quotation to persist this change.`)) return false;
    const assignmentId = item.specification_details?.assignment_id;
    if (assignmentId) setGroupAssignments(current => deleteAssignment(current, assignmentId, item.specification_details.kind));
    else if (item.field_id) setSelectedFieldIds(current => current.filter(id => id !== item.field_id));
    else setItems(current => current.filter(line => line !== item));
    return true;
  }
  function canContinue() {
    if (!dataReady || !sourceReady) return "Wait for the saved quotation data to load before continuing.";
    if (step === 0 && !form.customer) return "Select a customer.";
    if (step === 0 && !form.property) return "Select a property.";
    if (step === 0 && useMeasurements && !editing && !selectedMeasurementId) return "Select a saved Area Calculation or choose Lump Sum Quotation.";
    if (step === 0 && useMeasurements && !groupedMode && exteriorMode && !measurements.some(item=>item.work_area==="EXTERIOR")) return "Add an exterior Area Calculation to this property or choose Lump Sum Quotation.";
    if (step > 0 && !useMeasurements && retainedItemValidationMessage(items, masters)) return retainedItemValidationMessage(items, masters);
    if (step === 1 && !useMeasurements && !activeItems.length) return "Add at least one item before continuing.";
    if (step === 1 && !useMeasurements && activeItems.some(item=>missingQuotationFields(item).length)) return incompleteLineMessage(activeItems);
    if (step === 1 && groupedMode && !activeItems.length) return "Add a painting item or general service before continuing.";
    if (step === 1 && activeItems.some((item) => !Number.isInteger(item.id) && !item.service_category && !item.custom_service_category)) return "Select a Service / Product Category for every selected measured area.";
    if (step === 1 && groupedMode && activeItems.some((item) => {
      if (item.is_additional_service || Number.isInteger(item.id)) return false;
      const category = masters.categories.find((entry) => String(entry.id) === String(item.service_category));
      return category?.name?.toLowerCase().includes("paint") && !item.paint_type && !String(item.custom_product_type || "").trim();
    })) return "Select a material or product for every selected painting area.";
    if (step === 2 && !activeItems.length) return "Add at least one quotation line.";
    if (step === 2 && activeItems.some((item) => !item.field_id && !item.property_room_id && !String(item.room_name || "").trim()))
      return "Select a room or area for every Lump Sum line.";
    if (step === 2 && activeItems.some((item) => item.is_additional_service && !Number.isInteger(item.id) && !item.unit && !item.custom_unit)) return "Select a unit for every general service line.";
    if (
      step === 2 &&
      activeItems.some((item) => !item.description || item.rate === "")
    )
      return "Every quotation line needs a Description and rate.";
    if (
      step === 2 &&
      activeItems.some(
        (item) => !item.field_id && Number(item.quantity || 0) <= 0,
      )
    )
      return "Enter a quantity greater than zero for every Lump Sum or custom line.";
    if (step === 2 && activeItems.some((item) => !Number.isInteger(item.id) && !item.service_category && !String(item.custom_service_category || "").trim()))
      return "Select the Service / Product Category for every quotation line.";
    return "";
  }
  function changePricingLine(item,field,value){
    const id=item.specification_details?.assignment_id;
    if(id){
      setGroupAssignments(current=>{
        if(field==='rate')return {...current,rates:{...current.rates,[id]:value}};
        if(field.startsWith('discount_'))return {...current,discounts:{...current.discounts,[id]:{...current.discounts?.[id],[field==='discount_type'?'type':'value']:value}}};
        const key=item.specification_details.kind==='group'?'groups':item.specification_details.kind==='special'?'specials':'services';
        return {...current,[key]:current[key].map(entry=>entry.id===id?{...entry,[field]:value}:entry)};
      });
    }else updateItem(items.indexOf(item),field,value);
  }
  function editPricingLine(item){
    const id=item.specification_details?.assignment_id;
    if(id){const kind=item.specification_details.kind,key=kind==='group'?'groups':kind==='special'?'specials':'services';setOpeningGroupRequest({kind,value:groupAssignments[key].find(entry=>entry.id===id)});}
    else setMobileItemIndex(items.indexOf(item));
  }
  function next() {
    const message = canContinue();
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setStep((value) => Math.min(2, value + 1));
  }
  function openQuotationPreview() {
    if (!useMeasurements && retainedItemValidationMessage(items, masters)) { setError(retainedItemValidationMessage(items, masters)); return; }
    if (!activeItems.length) {
      setError("Add at least one quotation line.");
      setStep(2);
      return;
    }
    if (activeItems.some((item) => missingQuotationFields(item).length)) {
      setError(incompleteLineMessage(activeItems));
      setStep(2);
      return;
    }
    const duplicateWork = duplicateMeasuredWorkMessage(activeItems, savedRooms);
    if (duplicateWork) {
      setError(duplicateWork);
      return;
    }
    setError("");
    setShowPreview(true);
  }
  async function submit(pdfPreviewOnly = false, send = false) {
    if (submissionLock.current) return;
    if (!useMeasurements && retainedItemValidationMessage(items, masters)) { setError(retainedItemValidationMessage(items, masters)); return; }
    if(send && !window.confirm("Save this Draft and send it to the customer? Sent quotations cannot be edited directly."))return;
    if (submissionLock.current) return;
    if (!activeItems.length || activeItems.some((item) => missingQuotationFields(item).length)) {
      setError(activeItems.length ? incompleteLineMessage(activeItems) : "Add at least one quotation line.");
      setStep(2);
      return;
    }
    const message = canContinue();
    if (message) {
      setError(message);
      return;
    }
    const duplicateWork = duplicateMeasuredWorkMessage(activeItems, savedRooms);
    if (duplicateWork) {
      setError(duplicateWork);
      return;
    }
    submissionLock.current = true;
    if (pdfPreviewOnly) setPreviewingPdf(true);
    else setSaving(true);
    setError("");
    setNotice("");
    try {
      const roomsForQuotation = [...selectedRooms];
      activeItems.filter((item) => !item.field_id || item.property_room_id || (item.scope === "room" && item.room_name)).forEach((item) => {
        const savedRoom = savedRooms.find((room) => String(room.id) === String(item.property_room_id));
        const room = savedRoom || {
          id: null,
          name: String(item.room_name || "").trim(),
          length: 0,
          width: 0,
          height: 0,
          window_count: 0,
          window_width: 0,
          window_height: 0,
          door_count: 0,
          door_width: 0,
          door_height: 0,
        };
        if (!room.name) return;
        const exists = roomsForQuotation.some((entry) =>
          room.id ? String(entry.id) === String(room.id) : String(entry.name).trim().toLowerCase() === room.name.toLowerCase(),
        );
        if (!exists) roomsForQuotation.push(room);
      });
      const rooms = roomsForQuotation.map((room) => groupedMode ? groupedQuotationRoom(room) : ({
        property_room: room.id,
        name: room.name,
        length: room.length,
        width: room.width,
        height: room.height,
        window_count: room.window_count,
        window_width: room.window_width,
        window_height: room.window_height,
        door_count: room.door_count,
        door_width: room.door_width,
        door_height: room.door_height,
      }));
      const usesFullScope = activeItems.some((item) => item.scope === "full");
      if (usesFullScope) {
        rooms.push({
          property_room: null,
          name: exteriorMode ? "Full Exterior" : "Full House",
          length: 0,
          width: 0,
          height: 0,
          window_count: 0,
          window_width: 0,
          window_height: 0,
          door_count: 0,
          door_width: 0,
          door_height: 0,
        });
      }
      const cleanItems = activeItems.map((sourceItem) => {
        const item = { ...sourceItem };
        if (item.scope === "full" && usesFullScope) {
          item.room_index = rooms.length - 1;
        } else if (item.property_room_id || !item.field_id || item.scope === "room") {
          const customRoomIndex = roomsForQuotation.findIndex(
            (room) => item.property_room_id
              ? String(room.id) === String(item.property_room_id)
              : String(room.name || "").trim().toLowerCase() === String(item.room_name || "").trim().toLowerCase(),
          );
          item.room_index = customRoomIndex >= 0 ? customRoomIndex : "";
        }
        if (item.field_id && !item.specification_details) {
          const roomAreas = item.scope === "full"
            ? selectedRooms.filter((room) => measurements.some((surface) => String(surface.room) === String(room.id) && (item.surface_type === surface.surface_type || item.selection_group === quotationSurfaceGroup(surface).key)))
              .map((room) => `${room.name} — ${item.description}`)
            : [item.room_name ? `${item.room_name} — ${item.description}` : item.description];
          item.included_areas = [...new Set(roomAreas.filter(Boolean))];
        } else if (!item.included_areas?.length && item.room_name) {
          item.included_areas = [item.room_name];
        }
        delete item.lumpsum_item_pending;
        delete item.field_id;
        delete item.room_id;
        delete item.room_name;
        delete item.room_type_name;
        delete item.surface_type;
        delete item.scope;
        delete item.selection_group;
        delete item.custom_area_name;
        delete item.group_key;
        delete item.surface_id;
        delete item.property_room_id;
        delete item.opening_type;
        for (const key of ["parent_field_id", "name", "finish", "primer_coats", "notes", "work_description", "custom_work_name", "work_type_name", "specification_base_description"]) delete item[key];
        return Object.fromEntries(
          Object.entries(item)
            .filter(([, value]) => value !== "" && value !== null)
            .map(([key, value]) => [
              key,
              [
                "room_index",
                "service_category",
                "service_type",
                "paint_type",
                "paint_brand",
                "color",
                "coats",
                "unit",
              ].includes(key)
                ? Number(value)
                : value,
            ]),
        );
      });
      const incompleteMaterial = activeItems.find((item) => {
        if (!item.field_id || item.is_additional_service || Number.isInteger(item.id)) return false;
        const category = masters.categories.find((entry) => String(entry.id) === String(item.service_category));
        return (!item.service_category && !item.custom_service_category) || (category?.name?.toLowerCase().includes("paint") && !item.paint_type && !String(item.custom_product_type || "").trim());
      });
      if (incompleteMaterial) {
        setError(`Select a service and material for ${incompleteMaterial.room_name || incompleteMaterial.description}.`);
        setStep(1);
        return;
      }
      const groupedItems = cleanItems.reduce((groups, line, lineIndex) => {
        const key = JSON.stringify([
          lineIndex,
          line.service_category, line.custom_service_category, line.service_type,
          line.paint_type, line.custom_product_type, line.paint_brand, line.custom_brand,
          line.color, line.description, line.coats, line.unit, line.custom_unit,
          line.rate, line.discount_type, line.discount_value, line.calculation_method, line.is_additional_service, line.specification_details?.assignment_id,
        ]);
        const existing = groups.find((entry) => entry._groupKey === key);
        if (!existing) {
          groups.push({ ...line, included_areas: [...new Set(line.included_areas || [])], _groupKey: key });
        } else {
          existing.quantity = (Number(existing.quantity) + Number(line.quantity)).toFixed(2);
          existing.included_areas = [...new Set([...existing.included_areas, ...(line.included_areas || [])])];
        }
        return groups;
      }, []).map(({ _groupKey, ...line }) => line);
      const payload = {
        ...form,
        quotation_type: savedQuotation?.quotation_type || (useMeasurements ? "MEASUREMENT" : "MANUAL_LUMPSUM"),
        lead: sourceLead ? Number(sourceLead) : null,
        customer: Number(form.customer),
        property: Number(form.property),
        measurement_record: useMeasurements && selectedMeasurementId ? Number(selectedMeasurementId) : null,
        discount_value: Number(form.discount_value) || 0,
        gst_percentage: Number(form.gst_percentage) || 0,
        valid_until: form.valid_until || null,
        rooms,
        items: groupedItems,
      };
      const currentDraft=savedDraft.current;
      const editPayload=currentDraft ? builderDraftPayload(currentDraft,form,activeItems.map(({lumpsum_item_pending:_pending,...item})=>item),savedRooms) : null;
      if (pdfPreviewOnly) {
        const pdfPayload=editPayload ? {...payload,rooms:editPayload.rooms.map(({id:_id,...room})=>room),items:editPayload.items.map(({id:_id,room:_room,...line})=>line)} : payload;
        let response;
        try {
          response = await api.post(
            "/quotations/preview-pdf/",
            pdfPayload,
            { responseType: "blob" },
          );
        } catch (previewError) {
          const status = previewError.response?.status;
          const transientFailure =
            !previewError.response || [502, 503, 504].includes(status);
          if (!transientFailure) throw previewError;

          // Free hosting can need one request to wake the API. The failed
          // request is safe to repeat because preview creation is rolled back.
          response = await api.post(
            "/quotations/preview-pdf/",
            pdfPayload,
            { responseType: "blob" },
          );
        }
        previewPdf(response.data, "quotation-preview.pdf");
      } else {
        const data = await persistVersionedQuotation(api,savedDraft,payload,editPayload,send);
        initialSnapshot.current=builderSnapshot;
        clearBrowserRecovery();
        markBuilderSaved();
        navigate(`/quotations/${data.id}`, { state: { draftSaved: !send } });
      }
    } catch (requestError) {
      if(requestError.savedDraft){
        clearBrowserRecovery();
        const draft=requestError.savedDraft;setSavedQuotation(draft);setNotice("Draft saved. Sending could not be confirmed. Retry Save & Send to submit this same Draft.");
        setItems(current=>current.map(item=>{const index=activeItems.indexOf(item);return index>=0?{...item,id:draft.items[index]?.id,room:draft.items[index]?.room}:item;}));
        initialSnapshot.current=builderSnapshot;
      }
      if (pdfPreviewOnly) setShowPreview(false);
      const requestMessage = await formatRequestError(requestError);
      if(requestError.savedDraft){
        markBuilderSaved();
        navigate(`/quotations/${requestError.savedDraft.id}`,{replace:true,state:{draftSaved:true,submissionError:requestMessage || "Sending could not be confirmed."}});
      }
      setError(
        requestMessage ||
          (pdfPreviewOnly
            ? "Quotation PDF preview could not be generated."
            : requestError.savedDraft ? "Draft saved, but sending could not be confirmed. Refresh the quotation before retrying." : "Draft could not be saved. Your edits are still available here."),
      );
    } finally {
      submissionLock.current = false;
      if (pdfPreviewOnly) setPreviewingPdf(false);
      else setSaving(false);
    }
  }
  async function createRoomFromService(roomName) {
    const name = String(roomName || "").trim();
    if (!name) throw new Error("Enter a room name.");
    const duplicate = savedRooms.find((room) => String(room.name || "").trim().toLowerCase() === name.toLowerCase());
    if (duplicate) return duplicate;
    const { data } = await api.post(
      `/quotations/properties/${form.property}/rooms/`,
      { name, measurement_record: selectedMeasurementId || undefined },
      { params: selectedMeasurementId ? { measurement: selectedMeasurementId } : undefined },
    );
    setSavedRooms((current) => [...current, data]);
    setSelectedRoomIds((current) => current.includes(data.id) ? current : [...current, data.id]);
    return data;
  }
  const input =
    "mt-1.5 w-full rounded-xl border border-[#cbdce6] bg-white px-3 py-2.5 outline-none focus:border-[#176b9b] focus:ring-2 focus:ring-[#e8f3f8]";
  const toggleMeasurementField = (fieldId) => {
    setSelectedFieldIds((ids) => {
      if (ids.includes(fieldId)) return ids.filter((id) => id !== fieldId);
      const selectedField = measurementFields.find((field) => field.field_id === fieldId);
      if (specialWalls.length && selectedField?.scope === "full" && selectedField.selection_group === "WALL") return ids;
      if (selectedField?.scope && selectedField?.selection_group) {
        return [
          ...ids.filter((id) => {
            const field = measurementFields.find((entry) => entry.field_id === id);
            if (!field || field.selection_group !== selectedField.selection_group) return true;
            return field.scope === selectedField.scope;
          }),
          fieldId,
        ];
      }
      const surface = fieldId.endsWith("-wall") ? "wall" : fieldId.endsWith("-ceiling") ? "ceiling" : "";
      if (!surface) return [...ids, fieldId];
      const fullHouseId = `full-house-${surface}`;
      const isFullHouse = fieldId === fullHouseId;
      return [...ids.filter((id) => {
        if (isFullHouse) return id !== `full-house-${surface}` && !id.startsWith("room-");
        return id !== fullHouseId;
      }), fieldId];
    });
  };
  const pricedItems = items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) => !item.field_id || selectedFieldIds.includes(item.field_id),
    );
  const measuredRateGroups = new Map();
  if (useMeasurements) pricedItems.filter(({ item }) => item.field_id).forEach((line, serialIndex) => {
    const key = line.item.scope === "full" ? "full" : String(line.item.room_id || line.item.room_name);
    if (!measuredRateGroups.has(key)) measuredRateGroups.set(key, { name: line.item.room_name || (exteriorMode ? "Full Exterior" : "Full House"), lines: [] });
    measuredRateGroups.get(key).lines.push({ ...line, serial: serialIndex + 1 });
  });
  const selectedAreaTotals = measurementFields.reduce(
    (totals, field) => {
      if (!selectedFieldIds.includes(field.field_id)) return totals;
      const quantity = Number(field.quantity || 0);
      if (field.surface_type === "WALL") totals.wall += quantity;
      else if (field.surface_type === "CEILING") totals.ceiling += quantity;
      else totals.custom += quantity;
      totals.total += quantity;
      totals.count += 1;
      return totals;
    },
    { wall: 0, ceiling: 0, custom: 0, total: 0, count: 0 },
  );
  const displaySteps = useMeasurements ? steps : ["Customer & Property", "Services & Products", "Review & Finalize"];
  const step2Content = (
    <div className="quotation-totals-workspace mt-8 border-t border-[#dce7ed] pt-6">
      <h2 className="mb-5 text-lg font-extrabold text-[#193750] bp-ui-section-heading">Pricing summary and quotation details</h2>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="order-last grid gap-4 sm:grid-cols-2 xl:order-first">
          <QuotationDiscountControls pricing={preview} form={form} onChange={update} items={activeItems} showHelp={false} showLineControls={useMeasurements} onLineChange={(item,field,value)=>{
            const id=item.specification_details?.assignment_id;
            if (id) setGroupAssignments(current=>({...current,discounts:{...current.discounts,[id]:{...current.discounts?.[id],[field === "discount_type"?"type":"value"]:value}}}));
            else updateItem(items.indexOf(item),field,value);
          }} />
          <label className="text-sm font-medium">
            Valid until
            <input
              type="date"
              value={form.valid_until}
              onChange={(e) => update("valid_until", e.target.value)}
              className={(input) + " bp-ui-control"}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Notes
            <textarea
              aria-label="Notes"
              placeholder="Add notes for this quotation"
              rows="3"
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              className={(input) + " bp-ui-control"}
            />
          </label>
          <label className="text-sm">Prepared by<input value={form.prepared_by} onChange={(e) => update("prepared_by", e.target.value)} className={(input) + " bp-ui-control"} placeholder="Name shown on quotation" /></label>
          <label className="text-sm">Inspected by<input value={form.inspected_by} onChange={(e) => update("inspected_by", e.target.value)} className={(input) + " bp-ui-control"} placeholder="Site inspector name" /></label>
          <label className="text-sm">Work duration<input value={form.work_duration} onChange={(e) => update("work_duration", e.target.value)} className={(input) + " bp-ui-control"} placeholder="e.g. 15–18 days" /></label>
          {[["Product details","product_details"],["Terms and conditions","terms_conditions"]].map(([label,key])=><label key={key} className="text-sm sm:col-span-2">{label}<textarea placeholder={`Enter ${label.toLowerCase()}`} aria-label={label} rows={3} value={form[key]} onChange={event=>update(key,event.target.value)} className={(input) + " bp-ui-control"}/></label>)}
          <label className="text-sm sm:col-span-2"><input type="checkbox" checked={form.show_product_key_features} onChange={event=>update('show_product_key_features',event.target.checked)}/> Show product key features</label>
        </div>
        <div className="order-first h-fit rounded-xl bg-[#245b75] p-6 text-white xl:order-last">
          <h2 className="font-bold bp-ui-section-heading">Estimated total</h2>
          <div className="mt-5 space-y-3 text-sm">
            <Row label="Subtotal" value={preview.subtotal} />
            {form.discount_mode === "BOTH" && <><Row label="Line discounts" value={preview.lineDiscount} /><Row label="Overall discount" value={preview.overallDiscount} /></>}
            <Row label="Discount" value={preview.discount} />
            <Row label="GST" value={preview.gst} />
            <div className="flex justify-between border-t border-white/20 pt-4 text-xl font-bold">
              <span>Total</span>
              <span>{money(preview.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-4 sm:space-y-5 sm:pb-8 quotation-measurement-page bp-quotation-builder">
      <button
        disabled={saving || previewingPdf}
        onClick={() =>
          step
            ? setStep(step - 1)
            : goBackFromBuilder(location, navigate, initialQuotation ? `/quotations/${initialQuotation.id}` : "/quotations")
        }
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#176b9b] bp-ui-action"
      >
        <ArrowLeft className="h-4 w-4" />
        {step ? "Previous step" : "Back to quotations"}
      </button>
      {recovered && !editing && (
        <button type="button" disabled={saving || previewingPdf} className="ml-3 min-h-11 rounded-lg border border-[#dce7ed] bg-white px-4 py-2 text-sm font-semibold text-[#9b1c1c] hover:bg-[#fef2f2] hover:border-[#9b1c1c] bp-ui-action" onClick={() => {
          if (!window.confirm("Discard draft and reload? Your saved Draft will remain unchanged.")) return;
          clearBrowserRecovery(); markBuilderSaved(); window.location.reload();
        }}>Discard Draft</button>
      )}
      {specialWallEditor?.parent && <SpecialWallSheet recovery={specialWallRecovery} onRecovery={setSpecialWallRecovery} parent={specialWallEditor.parent} wall={specialWallEditor.wall} walls={specialWalls} masters={masters} onClose={() => setSpecialWallEditor(null)} onSave={saveSpecialWall} onDelete={deleteSpecialWall} />}
      <PageHeader eyebrow={editing ? "New quotation version" : "New quotation"} title={editing ? "Edit quotation" : "Create quotation"} actions={<StatusBadge status="IN_PROGRESS" label={`Step ${step + 1} of ${steps.length}`} />} />
      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[#dce7ed] bg-white p-3 sm:p-4">
        {displaySteps.map((title, index) => (
          <div key={title}>
            <div
              className={`h-1.5 rounded-full ${index <= step ? "bg-[#176b9b]" : "bg-slate-200"}`}
            />
            <p
              className={`mt-2 hidden text-xs sm:block ${index === step ? "font-bold text-[#176b9b]" : "text-slate-400"}`}
            >
              {title}
            </p>
          </div>
        ))}
      </div>
      {!dataReady && <p role="status">Loading quotation data...</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4">{notice}</p>}
      {error && <div role="alert" className="quotation-validation-message rounded-xl p-4 text-sm">{error}</div>}
      <fieldset disabled={saving || previewingPdf} className="min-w-0">
      <section className={`quotation-step-card min-w-0 rounded-2xl border border-[#dce7ed] bg-white p-4 shadow-sm sm:p-6 ${step === 1 && groupedMode ? "quotation-grouped-step" : ""}`}>
        {step === 0 && (
          <div className="quotation-customer-fields grid gap-4 sm:gap-5 md:grid-cols-2">
            <div className="md:col-span-2"><h2 className="text-lg font-extrabold text-[#193750] bp-ui-section-heading">Customer and property</h2></div>
            <div className="quotation-selection-field text-sm font-medium">
              <span className="flex items-center justify-between gap-2"><label htmlFor="quotation-customer-search">Customer *</label><button disabled={sourceLocked} type="button" onClick={() => setShowCustomerForm(true)} className="inline-flex items-center gap-1 font-bold text-[#176b9b] bp-ui-action"><UserRoundPlus className="h-4 w-4" aria-hidden="true" />New Customer</button></span>
              <span className="quotation-customer-search mt-2 flex items-center gap-2 rounded-xl border border-[#cbdce6] px-3 py-2.5 focus-within:border-[#176b9b]">
                <Search className="h-4 w-4 text-slate-400" />
                <input id="quotation-customer-search" aria-label="Customer" readOnly={sourceLocked} value={quotationCustomerDisplay(customerSearch, selectedCustomer, form.customer)} onChange={(e) => { setCustomerSearch(e.target.value); if (form.customer) { update("customer", ""); update("property", ""); } }} placeholder="Search customers" className="w-full bg-transparent font-normal outline-none bp-ui-control" />
              </span>
              {!sourceLocked && !customerSearch && recentCustomers.length > 0 && <span className="mt-2 block"><span className="mb-1 block text-xs font-semibold text-slate-400">Recent customers</span><span className="flex flex-wrap gap-1.5">{recentCustomers.map((item) => <button key={item.id} type="button" onClick={() => { update("customer", item.id); update("property", ""); setCustomerSearch(item.name); }} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 bp-ui-action">{item.name}</button>)}</span></span>}
              {customerSearch && !form.customer && customerSearchResults.length > 0 && <span className="relative z-40 mt-2 block max-h-52 overflow-y-auto rounded-xl border bg-white p-1 shadow-xl">{customerSearchResults.map((item) => <button key={item.id} type="button" onClick={() => { update("customer", item.id); update("property", ""); setCustomerSearch(item.name); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-normal hover:bg-slate-100 bp-ui-action"><b>{item.name}</b></button>)}</span>}
              {customerSearch && !form.customer && customerSearchResults.length === 0 && <span className="mt-2 block text-xs font-normal text-red-600">No matching customers found.</span>}
            </div>
            <div className="quotation-selection-field text-sm font-medium">
              <span className="flex items-center justify-between gap-2"><label htmlFor="quotation-property">Property *</label><button type="button" onClick={() => setShowPropertyForm(true)} disabled={sourceLocked || !form.customer} className="inline-flex items-center gap-1 font-bold text-[#176b9b] disabled:cursor-not-allowed disabled:opacity-40 bp-ui-action"><Building2 className="h-4 w-4" aria-hidden="true" />Add Property</button></span>
              <select
                id="quotation-property"
                aria-label="Property"
                disabled={sourceLocked}
                value={form.property}
                onChange={(e) => update("property", e.target.value)}
                className={(input) + " bp-ui-control"}
              >
                <option value="">Select property</option>{sourceLocked && !availableProperties.some(entry=>String(entry.id)===String(form.property)) && <option value={form.property}>{selectedProperty?.name || form.property}</option>}
                {availableProperties.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.property_type} · {item.city}
                  </option>
                ))}
              </select>
            </div>
            {useMeasurements && <div className="text-sm font-medium md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="quotation-area-calculation">Area Calculation *</label>
                <button type="button" disabled={sourceLocked || !form.property || measurementRecordsLoading} onClick={() => navigate(continueMeasurementPath(form.property, measurementRecords, user?.id, selectedMeasurementId))} className="inline-flex items-center gap-1 font-bold text-[#176b9b] disabled:cursor-not-allowed disabled:opacity-40 bp-ui-action"><Plus className="h-4 w-4" />{selectedMeasurementId ? "Add / edit measured areas" : "Add measurement"}</button>
              </div>
              <select id="quotation-area-calculation" value={selectedMeasurementId} onChange={(event) => { if (event.target.value === selectedMeasurementId) return; if ((groupAssignments.groups.length || groupAssignments.specials.length || groupAssignments.services?.length || items.length) && !window.confirm("Changing the measurement version invalidates the current measured selections. Clear these draft items and load the selected version? Choose Cancel to keep them.")) return; setSelectedMeasurementId(event.target.value); }} disabled={sourceLocked || !form.property || measurementRecordsLoading} className={(input) + " bp-ui-control"}>
                <option value="">{sourceLocked && !selectedMeasurementId ? "Saved scope - no measurement version recorded" : !form.property ? "Select a property first" : measurementRecordsLoading ? "Loading Area Calculations..." : "Select Area Calculation"}</option>
                {sourceLocked && selectedMeasurementId && !measurementRecords.some(record=>String(record.id)===String(selectedMeasurementId)) && <option value={selectedMeasurementId}>Saved measurement {selectedMeasurementId}</option>}
                {measurementRecords.map((record) => <option key={record.id} value={record.id}>{record.reference_no} · {record.measured_on} · {record.total_sqft} sq ft</option>)}
              </select>
              {sourceReady && selectedMeasurementId && <p className="mt-2 text-xs text-slate-500">Measurement version {assignmentMeasurement.version}. Interior and exterior share this measurement; choose either or add both as painting items in the next stage.</p>}
              {form.property && !measurementRecordsLoading && !measurementRecords.length && <p className="mt-2 text-xs text-amber-700">No saved Area Calculations with measurements for this property. Add one to continue.</p>}
            </div>}
          </div>
        )}
        {step === 0 && (
          <div className="mt-6 border-t border-[#dce7ed] pt-6">
            <h2 className="text-lg font-extrabold text-[#193750] bp-ui-section-heading">Quotation type</h2>
            
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <button disabled={sourceLocked} type="button" onClick={()=>setUseMeasurements(true)} className={(`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${useMeasurements?"border-[#176b9b] bg-[#176b9b] text-white shadow-sm":"border-[#dce7ed] bg-white hover:border-[#176b9b]"}`) + " bp-ui-action"}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${useMeasurements?"bg-white/15":"bg-[#e8f3f8] text-[#176b9b]"}`}><Ruler className="h-5 w-5" /></span><p className="font-bold">Square Foot Quotation</p></button>
              <button disabled={sourceLocked} type="button" onClick={()=>{setUseMeasurements(false);setSelectedRoomIds([]);setSelectedFieldIds([])}} className={(`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${!useMeasurements?"border-[#176b9b] bg-[#176b9b] text-white shadow-sm":"border-[#dce7ed] bg-white hover:border-[#176b9b]"}`) + " bp-ui-action"}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${!useMeasurements?"bg-white/15":"bg-[#e8f3f8] text-[#176b9b]"}`}><IndianRupee className="h-5 w-5" /></span><p className="font-bold">Lump Sum Quotation</p></button>
            </div>
          </div>
        )}
        {step === 0 && useMeasurements && selectedMeasurementId && sourceReady && <div className="mt-6">
          <GroupedQuotationWorkspace key={`measurements-${selectedMeasurementId}`} measurement={assignmentMeasurement} displayMeasurement={{ ...assignmentMeasurement, surfaces: measurements }} masters={masters} state={groupAssignments} onChange={setGroupAssignments} editorRecovery={workEditorRecovery} onEditorRecovery={setWorkEditorRecovery} phase="measurements" />
        </div>}
        {step === 1 && !(!useMeasurements || (editing && !groupedMode)) && (groupedMode ? <GroupedQuotationWorkspace showMeasurements={false} key={selectedMeasurementId} measurement={assignmentMeasurement} displayMeasurement={{ ...assignmentMeasurement, surfaces: measurements }} masters={masters} state={groupAssignments} onChange={setGroupAssignments} editorRecovery={workEditorRecovery} onEditorRecovery={setWorkEditorRecovery} /> :
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold bp-ui-section-heading">Select Area Calculation fields &amp; coats</h2>
                
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedFieldIds(
                      measurementFields
                        .filter((field) => exteriorMode ? field.scope === "room" : !field.room_id)
                        .map((field) => field.field_id),
                    )
                  }
                  className="rounded-lg border px-3 py-2 text-xs font-semibold bp-ui-action"
                >
                  {exteriorMode ? "Select all rooms" : "Select all"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFieldIds([])}
                  className="rounded-lg border px-3 py-2 text-xs font-semibold bp-ui-action"
                >
                  Clear all
                </button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-[#cbdce6] bg-[#e8f3f8] p-3 sm:grid-cols-5">
              {[
                ["Selected walls", selectedAreaTotals.wall],
                ["Selected ceiling", selectedAreaTotals.ceiling],
                ["Selected surfaces", selectedAreaTotals.custom],
                ["Selected total", selectedAreaTotals.total],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-white px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-0.5 font-extrabold tabular-nums text-slate-950">{Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })} <span className="text-[10px] font-semibold text-slate-500">sq ft</span></p>
                </div>
              ))}
              <div className="col-span-2 rounded-lg bg-[#176b9b] px-3 py-2 text-white sm:col-span-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/75">Selected lines</p>
                <p className="mt-0.5 text-lg font-extrabold">{selectedAreaTotals.count}</p>
              </div>
            </div>
            <div className="mt-5 space-y-5">
              {exteriorMode&&<ExteriorMeasurementFields fields={measurementFields} selectedFieldIds={selectedFieldIds} toggle={toggleMeasurementField} items={items} serviceCategories={masters.categories} paintTypes={masters.paintTypes} brands={masters.brands} updateFieldItem={updateMeasurementFieldItem} updateFieldMaterial={updateFieldMaterial} />}
              {!exteriorMode&&<>
                <AreaFieldGroup title="Full house Area Calculation" fields={measurementFields.filter((field) => !field.room_id)} selectedFieldIds={selectedFieldIds} toggle={toggleMeasurementField} items={items} masters={masters} updateFieldItem={updateMeasurementFieldItem} updateFieldMaterial={updateFieldMaterial} />
                {selectedRooms.map((room) => <AreaFieldGroup key={room.id} title={room.name} specialWalls={specialWalls} onAddSpecial={() => { setSpecialWallRecovery(null); setSpecialWallEditor({ parent: originalMeasurementFields.find((field) => field.room_id === room.id && field.surface_type === "WALL") }); }} onEditSpecial={(wall) => { setSpecialWallRecovery(null); setSpecialWallEditor({ wall, parent: originalMeasurementFields.find((field) => field.field_id === wall.parent_field_id) }); }} fields={measurementFields.filter((field) => field.room_id === room.id)} selectedFieldIds={selectedFieldIds} toggle={toggleMeasurementField} items={items} masters={masters} updateFieldItem={updateMeasurementFieldItem} updateFieldMaterial={updateFieldMaterial} />)}
              </>}
            </div>
          </div>
        )}
        {step === 1 && groupedMode && items.some(item=>!item.field_id) && <section className="mt-4 space-y-3"><h2 className="font-bold bp-ui-section-heading">Other work items</h2>{items.filter(item=>!item.field_id).map(item=><div key={item.id || items.indexOf(item)} className="flex items-center justify-between gap-3 rounded-xl border p-4"><span>{item.description || 'New work item'}</span><button type="button" className="min-h-11 text-sm font-bold bp-ui-action" onClick={()=>setMobileItemIndex(items.indexOf(item))}>Edit specifications</button></div>)}</section>}
        {step === 1 && (!useMeasurements || (editing && !groupedMode)) && <div className="space-y-4">{useMeasurements && <h2 className="font-bold bp-ui-section-heading">Work materials and specifications</h2>}{!useMeasurements ? <QuotationWorkItemSummary items={items.filter(item=>!item.field_id || selectedFieldIds.includes(item.field_id))} masters={masters} onAdd={addAdditionalService} canEdit={lumpEditable} onEdit={item=>setMobileItemIndex(items.indexOf(item))} onDelete={removeWorkItem}/> : items.filter(item=>!item.field_id || selectedFieldIds.includes(item.field_id)).map((item)=><div key={item.id || items.indexOf(item)} className="flex items-center justify-between gap-3 rounded-xl border p-4"><span>{item.description || 'New work item'}</span><button type="button" className="min-h-11 text-sm font-bold bp-ui-action" onClick={()=>setMobileItemIndex(items.indexOf(item))}>Edit specifications</button></div>)}{useMeasurements && <button type="button" className="min-h-11 rounded-xl border px-4 bp-ui-action" onClick={addAdditionalService}>Add services</button>}</div>}
{step === 2 && (
          <div className="space-y-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-bold bp-ui-section-heading">{!useMeasurements ? "Review & Finalize" : groupedMode ? "Review & Finalize" : "Services & rates"}</h2>
                {useMeasurements && <span className="text-sm text-slate-500">Measurement version {assignmentMeasurement.version}</span>}
              </div>

            </div>
            {groupedMode && <GroupedQuotationWorkspace measurement={assignmentMeasurement} displayMeasurement={{ ...assignmentMeasurement, surfaces: measurements }} masters={masters} state={groupAssignments} onChange={setGroupAssignments} editorRecovery={workEditorRecovery} onEditorRecovery={setWorkEditorRecovery} phase="final" showPricing={false} requestedEditor={openingGroupRequest} onEditorRequestHandled={() => setOpeningGroupRequest(null)} />}
            <dl className="lsq-details"><div><dt>Customer</dt><dd>{selectedCustomer?.name}</dd></div><div><dt>Property</dt><dd>{selectedProperty?.name}</dd></div></dl>
            <QuotationPricingRows canEdit={lumpEditable} onDelete={removeWorkItem} popupOnly={!useMeasurements} items={activeItems} form={form} units={masters.units} masters={masters} onChange={changePricingLine} onEdit={editPricingLine}/>
{step2Content}
</div>
        )}
       </section>
        <div className="quotation-builder-actions flex flex-wrap justify-end gap-3 rounded-2xl border border-[#dce7ed] bg-white p-3 shadow-sm sm:p-4">
        {step < 2 ? (
          <Button type="button"
            onClick={next}
            disabled={!dataReady || !sourceReady || saving}
            className="quotation-primary-action flex min-h-12 w-full items-center justify-center gap-2 sm:w-auto"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (<>
          <Button variant="secondary" type="button" onClick={() => submit(false)} disabled={!dataReady || !sourceReady} loading={saving} className="quotation-save-draft flex min-h-12 min-w-0 items-center justify-center gap-2">
            <Check className="h-4 w-4" />{saving ? "Saving..." : editing ? "Save new version" : "Save draft"}
          </Button>
          <Button variant="secondary" type="button" disabled={saving || !dataReady} onClick={()=>submit(false,true)} className="quotation-save-send min-h-12 min-w-0">Save &amp; Send</Button>
          <Button type="button"
            onClick={openQuotationPreview}
            disabled={saving}
            className="quotation-primary-action quotation-preview-action flex min-h-12 min-w-0 items-center justify-center gap-2"
          >
            <Eye className="h-4 w-4" />
            Preview quotation
          </Button>
        </>)}
      </div>
      </fieldset>
       {mobileItemIndex !== null && items[mobileItemIndex] && (
              <MobileRateDialog
                lumpsum={!useMeasurements}
                item={items[mobileItemIndex]}
                index={mobileItemIndex}
                masters={masters}
                savedRooms={savedRooms}
                roomOptions={quotationRoomOptions}
                selectedRooms={selectedRooms}
                exteriorMode={exteriorMode}
                updateItem={updateItem}
                updateProductType={updateProductType}
                updateMasterChoice={updateMasterChoice}
                saveRoom={createRoomFromService}
                close={() => { setMobileItemIndex(null); if (!useMeasurements) setError(clearItemValidationMessage); }}
                remove={() => {
                  const item = items[mobileItemIndex];
                  if (!useMeasurements) { if (removeWorkItem(item)) setMobileItemIndex(null); return; }
                  if (item.field_id) setSelectedFieldIds((ids) => ids.filter((id) => id !== item.field_id));
                  else setItems((value) => value.filter((_, index) => index !== mobileItemIndex));
                  setMobileItemIndex(null);
                }}
              />
            )}
       {showCustomerForm && <CustomerConnectionFlow quotationTheme onClose={() => setShowCustomerForm(false)} onNewCustomer={createCustomer} />}
       {showPropertyForm && <PropertyForm quotationTheme customers={customers} initialCustomer={form.customer} onSubmit={createProperty} onClose={() => setShowPropertyForm(false)} saving={savingProperty} />}
       {showPreview && (
        <QuotationPreviewDialog
          editing={editing}
          customer={selectedCustomer}
          property={selectedProperty}
          items={activeItems}
          masters={masters}
          savedRooms={savedRooms}
          form={form}
          totals={preview}
          productDetails={selectedProductDetails}
          saving={saving}
          previewingPdf={previewingPdf}
          close={() => setShowPreview(false)}
          previewPdfAction={() => submit(true)}
          create={() => {
            setShowPreview(false);
            submit(false);
          }}
        />
      )}
    </div>
  );
}
function QuotationPreviewDialog({
  editing = false,
  customer,
  property,
  items,
  masters,
  savedRooms,
  form,
  totals,
  productDetails,
  saving,
  previewingPdf,
  close,
  previewPdfAction,
  create,
}) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => { dialog.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  const lineDetails = groupPreviewLines(items, savedRooms).map((item, index) => {
    const category =
      masters.categories.find(
        (entry) => String(entry.id) === String(item.service_category),
      )?.name || item.custom_service_category || "Service";
    const product =
      masters.paintTypes.find(
        (entry) => String(entry.id) === String(item.paint_type),
      )?.name || item.custom_product_type || "";
    const brand =
      masters.brands.find(
        (entry) => String(entry.id) === String(item.paint_brand),
      )?.name || item.custom_brand || "";
    const unit =
      masters.units.find(
        (entry) => String(entry.id) === String(item.unit),
      )?.name || item.custom_unit || "";
    const savedRoom = savedRooms.find(
      (room) =>
        String(room.id) ===
        String(item.property_room_id || item.room_id || ""),
    );
    const roomName = quotationRoomAreaLabel(item) || savedRoom?.name || "General";
    const rate = Number(item.rate || 0);
    const quantity = totals.lines?.[index]?.quantity ?? Number(item.quantity || 0);
    const amount =
      item.calculation_method === "LUMPSUM" ? rate : quantity * rate;
    return {
      key: item.field_id || `preview-${index}`,
      number: index + 1,
      category,
      roomName,
      productBrand: [product, brand].filter(Boolean).join(" / ") || "—",
      description: (item.description || "—") + (totals.lines?.[index]?.discount > 0 ? ` · Line discount ${money(totals.lines[index].discount)} · Net ${money(totals.lines[index].net)}` : ""),
      quantity,
      unit,
      coats: category.toLowerCase().includes("paint")
        ? Number(item.coats || 1)
        : "—",
      rate,
      amount: totals.lines?.[index]?.amount ?? amount,
    };
  });
  const propertyAddress = [
    property?.flat_number,
    property?.block_name,
    property?.address,
    property?.city,
    property?.pincode,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <dialog ref={dialogRef} onCancel={event => { event.preventDefault(); close(); }}
      className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/70 p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Quotation preview"
      data-quotation-preview="true"
    >
      <section className="bp-quotation-dialog mx-auto min-h-full max-w-6xl overflow-hidden rounded-2xl bg-slate-100 shadow-2xl">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-[#245b75] px-4 py-3 text-white sm:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">
              Preview only · Not yet saved
            </p>
            <h2 className="mt-0.5 text-lg font-bold sm:text-xl bp-ui-section-heading">
              Quotation Preview
            </h2>
          </div>
          <button type="button" aria-label="Close quotation preview" onClick={close} className="rounded-xl border border-white/25 p-2.5 bp-ui-icon-action">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="space-y-4 p-3 sm:p-6">
          <section className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-xl border bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Prepared for</p>
              <h3 className="mt-1 text-lg font-bold text-slate-950">{customer?.name || "Customer"}</h3>
              <p className="mt-1 text-sm text-slate-600">{customer?.customer_id || customer?.mobile || "—"}</p>
              {customer?.mobile && <p className="text-sm text-slate-600">{customer.mobile}</p>}
            </article>
            <article className="rounded-xl border bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Property</p>
              <h3 className="mt-1 text-lg font-bold text-slate-950">{property?.name || property?.property_type || "Property"}</h3>
              <p className="mt-1 text-sm leading-5 text-slate-600">{propertyAddress || "Address not added"}</p>
            </article>
          </section>
          <section className="overflow-hidden rounded-xl border bg-white">
            <div className="border-b bg-blue-950 px-4 py-3 text-white">
              <h3 className="font-bold">Services and rates</h3>
              <p className="text-xs text-blue-200">{lineDetails.length} selected line{lineDetails.length === 1 ? "" : "s"}</p>
            </div>
            <QuotationDocumentItems items={groupPreviewLines(items,savedRooms)} masters={masters} rooms={savedRooms} form={form} />
          </section>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="space-y-3">
              {form.product_details && <PreviewText title="Product details" value={form.product_details} />}
              {form.show_product_key_features && productDetails && <PreviewText title="Selected product details" value={productDetails} />}
              {form.work_duration && <PreviewText title="Work duration" value={form.work_duration} />}
              {form.terms_conditions && <PreviewText title="Terms and conditions" value={form.terms_conditions} />}
              {form.notes && <PreviewText title="Notes" value={form.notes} />}
            </section>
            <section className="h-fit rounded-xl bg-[#245b75] p-5 text-white">
              <h3 className="font-bold">Quotation total</h3>
              <div className="mt-4 space-y-2 text-sm">
                <Row label="Subtotal" value={totals.subtotal} />
                {form.discount_mode === "BOTH" && <><Row label="Line discounts" value={totals.lineDiscount} /><Row label="Overall discount" value={totals.overallDiscount} /></>}
                <Row label="Discount" value={totals.discount} />
                <Row label="GST" value={totals.gst} />
                <div className="flex justify-between border-t border-white/20 pt-3 text-xl font-extrabold"><span>Total</span><span>{money(totals.total)}</span></div>
              </div>
            </section>
          </div>
        </div>
        <footer className="sticky bottom-0 z-20 grid grid-cols-2 gap-3 border-t bg-white p-3 sm:flex sm:justify-end sm:px-6 sm:py-4">
          <button type="button" onClick={close} className="rounded-xl border px-5 py-3 font-bold bp-ui-action">Back to edit</button>
          <button type="button" onClick={previewPdfAction} disabled={previewingPdf || saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 font-bold text-blue-950 disabled:opacity-60 bp-ui-action"><Eye className="h-4 w-4" />{previewingPdf ? "Preparing PDF..." : "View PDF"}</button>
          <button type="button" onClick={create} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#176b9b] px-5 py-3 font-bold text-white disabled:opacity-60 bp-ui-action"><Check className="h-4 w-4" />{saving ? "Saving..." : editing ? "Save new version" : "Save draft"}</button>
        </footer>
      </section>
    </dialog>
  );
}
function PreviewText({ title, value }) {
  return (
    <article className="rounded-xl border bg-white p-4">
      <h3 className="text-sm font-bold text-slate-950">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{value}</p>
    </article>
  );
}
function uniqueProductDetails(items, products, brands) {
  const seen = new Set();
  return items.reduce((lines, item) => {
    const product = products.find((entry) => String(entry.id) === String(item.paint_type));
    if (!product?.name || !String(product.key_features || "").trim()) return lines;
    const brand = brands.find((entry) => String(entry.id) === String(item.paint_brand));
    const key = `${product.name}|${brand?.name || ""}|${product.key_features}`.toLowerCase();
    if (seen.has(key)) return lines;
    seen.add(key);
    lines.push(`${product.name}${brand?.name ? ` (${brand.name})` : ""}: ${product.key_features}`);
    return lines;
  }, []).join("\n");
}
function SearchableProductType({ value, customValue = "", options, onChange, controlClass, label = SERVICE_MASTER_LABELS.productType, placeholder = "Search Service / Product Type", emptyText = "No matching Service / Product Type", allowCustom = false, required = false }) {
  const selected = options.find((entry) => String(entry.id) === String(value));
  const [query, setQuery] = useState(selected?.name || customValue || "");
  const [open, setOpen] = useState(false);
  useEffect(() => { setQuery(selected?.name || customValue || ""); }, [selected?.name, value, customValue]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return options.filter((entry) => !term || String(entry.name || "").toLowerCase().includes(term)).slice(0, 30);
  }, [options, query]);
  const exactMatch = () => options.find((entry) => String(entry.name || "").trim().toLowerCase() === query.trim().toLowerCase());
  const choose = (entry) => { onChange(entry.id, ""); setQuery(entry.name); setOpen(false); };
  return (
    <label className="block text-sm font-semibold">{label}{required && <span aria-hidden="true"> *</span>}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          aria-required={required}
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => { const match = exactMatch(); if (match) choose(match); else window.setTimeout(() => setOpen(false), 120); }}
          onChange={(event) => { const next = event.target.value; setQuery(next); setOpen(true); onChange("", allowCustom ? next : ""); }}
          onKeyDown={(event) => { if (event.key === "Enter") { const match = exactMatch(); if (match) { event.preventDefault(); choose(match); } else if (allowCustom) { event.preventDefault(); setOpen(false); } else if (filtered.length) { event.preventDefault(); choose(filtered[0]); } } }}
          placeholder={placeholder}
          autoComplete="off"
          className={(`${controlClass} pl-10 bp-control-leading-icon`) + " bp-ui-control"}
        />
        {open && <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {filtered.map((entry) => <button key={entry.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(entry)} className={(`block w-full rounded-lg px-3 py-2.5 text-left hover:bg-[#e8f3f8] ${String(entry.id) === String(value) ? "bg-[#e8f3f8] text-[#176b9b]" : ""}`) + " bp-ui-action"}><span className="block text-sm font-bold">{entry.name}</span></button>)}
          {!filtered.length && <p className="px-3 py-4 text-center text-xs text-slate-500">{allowCustom ? "New entry. Choose whether to save it below." : emptyText}</p>}
        </div>}
        {!value && query.trim() && !open && !allowCustom && label === SERVICE_MASTER_LABELS.category && <p className="mt-1 text-xs text-red-700">Choose a service from the results.</p>}
      </div>
    </label>
  );
}
function SearchableDescription({ value, options, onChange, controlClass, invalid, label = SERVICE_MASTER_LABELS.description }) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const term = String(value || "").trim().toLowerCase();
    return options.filter((entry) => !term || String(entry.name || "").toLowerCase().includes(term)).slice(0, 30);
  }, [options, value]);
  return (
    <label className="block text-sm font-semibold">{label}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <textarea rows={3}
          value={value}
          aria-invalid={invalid}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => { onChange(event.target.value, false); setOpen(true); }}
          placeholder="Enter work description or select a saved description"
          autoComplete="off"
          className={(`${controlClass} pl-10 bp-control-leading-icon resize-y`) + " bp-ui-control"}
        />
        {open && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {filtered.map((entry) => <button key={entry.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(entry.name, true); setOpen(false); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-[#e8f3f8] bp-ui-action">{entry.name}</button>)}
          {!filtered.length && <p className="px-3 py-4 text-center text-xs text-slate-500">No saved description. Continue typing to create a new one.</p>}
        </div>}
      </div>
    </label>
  );
}
function SaveMasterOption({ label, checked, onChange }) {
  return <label className="mt-2 flex items-center gap-3 rounded-xl border border-[#cbdce6] bg-[#e8f3f8] p-3 text-sm font-semibold text-[#193750]"><input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4" />Save this {label} for future quotations</label>;
}
function MobileRateDialog({ item, index, masters, savedRooms, roomOptions, selectedRooms, exteriorMode, updateItem, updateProductType, updateMasterChoice, saveRoom, close, remove, lumpsum = false }) {
  const [itemError, setItemError] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [roomSaving, setRoomSaving] = useState(false);
  const [roomError, setRoomError] = useState("");
  const selectedItemRoom = savedRooms.find((room) =>
    String(room.id) === String(item.room_id || item.property_room_id),
  ) || (item.field_id && item.room_index !== "" && item.room_index !== null && item.room_index !== undefined
    ? selectedRooms[Number(item.room_index)]
    : null);
  const roomName = item.room_name || selectedItemRoom?.name || (exteriorMode ? "Exterior" : "General");
  const amount = quotationTotals([item]).lines[0].amount;
  const categoryName = masters.categories.find((entry) => String(entry.id) === String(item.service_category))?.name || item.custom_service_category || "";
  const paintingApplicable = categoryName.toLowerCase().includes("paint");
  const descriptionOptions = masters.descriptions.filter((entry) => !entry.service_category || !item.service_category || String(entry.service_category) === String(item.service_category));
  const descriptionSaved = descriptionOptions.some((entry) => String(entry.name || "").trim().toLowerCase() === String(item.description || "").trim().toLowerCase());
  const calculatedRoomOptions = roomOptions;
  const calculatedRoomKey = calculatedRoomOptions.find((room) => {
    const propertyRoomId = item.property_room_id || item.room_id;
    return propertyRoomId
      ? String(room.propertyRoomId) === String(propertyRoomId)
      : !room.propertyRoomId && room.name === item.room_name;
  })?.key || "";
  const control = "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-[#176b9b] focus:ring-4 focus:ring-[#e8f3f8]";
  const requiredControl = (missing) => `${control} ${missing ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-100" : ""}`;
  const Frame = QuotationLineItemPopup;
  const currentMissing = missingLumpSumItemFields(item, masters);
  const fieldError = (name) => itemError && currentMissing.includes(name) ? <p className="quotation-inline-error" role="alert">{name === 'Rate' ? 'Enter a valid rate of zero or more.' : `Complete ${name.toLowerCase()}.`}</p> : null;
  const saveItem = () => {
    if (!lumpsum) { close(); return; }
    if (currentMissing.length) { setItemError("invalid"); return; }
    updateItem(index, "lumpsum_item_pending", false);
    close();
  };
  const footer = <div className="grid w-full grid-cols-[auto_1fr] gap-3"><button type="button" aria-label="Delete editor item" onClick={remove} className="lsq-editor-delete inline-flex min-h-11 items-center justify-center rounded-xl border border-red-200 px-4 py-3 text-red-600 bp-ui-action"><Trash2 className="h-5 w-5" /><span>Delete</span></button><Button type="button" onClick={saveItem}>{lumpsum ? "Save Item" : "Update line"}</Button></div>;
  return (
    <Frame popupProtection={lumpsum ? "handled" : null} index={index} description={roomName} titleText={item.lumpsum_item_pending ? "Add Item" : "Edit Item"} editable footer={footer} onClose={close}>
        {itemError && currentMissing.length > 0 && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">Complete: {currentMissing.join(", ")}.</p>}
        <div className="lsq-item-form space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><SearchableProductType required label={SERVICE_MASTER_LABELS.category} placeholder="Select or type a service" value={item.service_category} customValue={item.custom_service_category} options={masters.categories} allowCustom onChange={(value, customName) => updateMasterChoice(index, "service_category", "custom_service_category", "save_service_category_to_master", value, customName)} controlClass={requiredControl(!item.service_category && !String(item.custom_service_category || "").trim())} />{fieldError(SERVICE_MASTER_LABELS.category)}
              {String(item.custom_service_category || "").trim() && <SaveMasterOption label={SERVICE_MASTER_LABELS.category} checked={item.save_service_category_to_master} onChange={(value) => updateItem(index, "save_service_category_to_master", value)} />}</div>
            <label className="block text-sm font-semibold">Room / Area *
              {item.field_id
                ? <SearchableSelect value={calculatedRoomKey} options={[{ value: "", label: exteriorMode ? "Full Exterior" : "Full House" }, ...calculatedRoomOptions.map((room) => ({ ...room, value: room.key, label: room.name }))]} onChange={(value) => { const room = calculatedRoomOptions.find((option) => option.key === value); updateItem(index, "room_index", room?.roomIndex ?? ""); updateItem(index, "room_id", room?.propertyRoomId || ""); updateItem(index, "property_room_id", room?.propertyRoomId || ""); updateItem(index, "room_name", room?.name || (exteriorMode ? "Full Exterior" : "Full House")); updateItem(index, "scope", room ? "room" : "full"); }} placeholder="Search calculated room" className={control} />
                : <SearchableSelect value={roomOptions.find((room) => item.property_room_id ? String(room.propertyRoomId) === String(item.property_room_id) : !room.propertyRoomId && room.name === item.room_name)?.key || ""} options={roomOptions.map((room) => ({ ...room, value: room.key, label: room.name }))} onChange={(value) => { const room = roomOptions.find((option) => option.key === value); updateItem(index, "property_room_id", room?.propertyRoomId || ""); updateItem(index, "room_name", room?.name || ""); }} placeholder="Select room or area" invalid={!item.property_room_id && !String(item.room_name || "").trim()} className={requiredControl(!item.property_room_id && !String(item.room_name || "").trim())} />}{fieldError("Room / Area")}
            </label>
          </div>
          {lumpsum && <label className="block text-sm font-semibold">Surface Category<select aria-label="Lumpsum Surface Category" value={item.specification_details?.surface || ""} onChange={event => updateItem(index,"specification_details",{...item.specification_details,surface:event.target.value || null})} className={(control) + " bp-ui-control"}><option value="">General / Not surface-specific</option>{[["WALL","Walls"],["CEILING","Ceilings"],["OTHER:Texture Walls","Texture Walls"],...Object.entries(SURFACE_LABELS),["OTHER","Other"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
          {!item.field_id && <div className="rounded-xl border border-dashed border-[#9cc4d6] bg-[#e8f3f8] p-3">
            {!addingRoom ? <button type="button" onClick={() => setAddingRoom(true)} className="inline-flex items-center gap-2 text-sm font-bold text-[#176b9b] bp-ui-action"><Plus className="h-4 w-4" />Add room</button> : <div className="flex flex-col gap-2 sm:flex-row"><label className="min-w-0 flex-1 text-sm font-semibold">New room name<input autoFocus value={newRoomName} onChange={(event) => setNewRoomName(event.target.value)} aria-label="New room name" placeholder="Enter room name" className={(control) + " bp-ui-control"} /></label><button type="button" disabled={roomSaving || !newRoomName.trim()} onClick={async () => { setRoomSaving(true); setRoomError(""); try { const room = await saveRoom(newRoomName); updateItem(index, "property_room_id", room.id); updateItem(index, "room_name", room.name); setAddingRoom(false); setNewRoomName(""); } catch (error) { setRoomError(error.response?.data?.name?.[0] || error.response?.data?.detail || error.message || "Room could not be saved."); } finally { setRoomSaving(false); } }} className="rounded-xl bg-[#176b9b] px-4 py-3 text-sm font-bold text-white disabled:opacity-50 bp-ui-action">{roomSaving ? "Saving..." : "Save room"}</button></div>}
            {roomError && <p className="mt-2 text-xs font-semibold text-red-600">{roomError}</p>}
          </div>}
          <SearchableProductType
            required={paintingApplicable}
            label={item.field_id ? "Product" : SERVICE_MASTER_LABELS.productType}
            key={item.service_category || "all-products"}
            value={item.paint_type}
            customValue={item.custom_product_type}
            options={masters.paintTypes.filter((entry) => !item.service_category || String(entry.service_category) === String(item.service_category))}
            allowCustom
            onChange={(value, customName) => updateProductType(index, value, customName)}
            controlClass={control}
          />
          {String(item.custom_product_type || "").trim() && <SaveMasterOption label={SERVICE_MASTER_LABELS.productType} checked={item.save_product_type_to_master} onChange={(value) => updateItem(index, "save_product_type_to_master", value)} />}
          <SearchableDescription label={item.field_id ? SERVICE_MASTER_LABELS.description : SERVICE_MASTER_LABELS.description} value={item.description} options={descriptionOptions} invalid={!String(item.description || "").trim()} onChange={(value, fromMaster) => { updateItem(index, "description", value); if (fromMaster) updateItem(index, "promote_to_master", false); }} controlClass={requiredControl(!String(item.description || "").trim())} />{fieldError(SERVICE_MASTER_LABELS.description)}
          {String(item.description || "").trim() && (descriptionSaved
            ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">Saved Description selected</p>
            : <label className="flex items-center gap-3 rounded-xl border border-[#cbdce6] bg-[#e8f3f8] p-4 text-sm font-semibold text-[#193750]"><input type="checkbox" checked={Boolean(item.promote_to_master)} onChange={(event) => updateItem(index, "promote_to_master", event.target.checked)} className="h-4 w-4" />Save this Description for future quotations</label>)}
          <SearchableProductType label="Brand (optional)" placeholder="Select or enter brand" value={item.paint_brand} customValue={item.custom_brand} options={masters.brands} allowCustom onChange={(value, customName) => updateMasterChoice(index, "paint_brand", "custom_brand", "save_brand_to_master", value, customName)} controlClass={control} />
          {String(item.custom_brand || "").trim() && <SaveMasterOption label="Brand" checked={item.save_brand_to_master} onChange={(value) => updateItem(index, "save_brand_to_master", value)} />}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">Quantity *
              <input placeholder="Enter quantity" inputMode="decimal" type="number" min="0.01" step="0.01" value={item.quantity} readOnly={Boolean(item.calculation_method && item.calculation_method!=="MANUAL") || Boolean(item.field_id)} aria-invalid={Number(item.quantity || 0) <= 0} onChange={(event) => updateItem(index, "quantity", event.target.value)} className={(requiredControl(Number(item.quantity || 0) <= 0)) + " bp-ui-control"} />{fieldError("Quantity")}
            </label>
            <label className="block text-sm font-semibold">MOU *
              {lumpsum ? <select aria-label="MOU" value={item.unit || (item.custom_unit ? `custom:${item.custom_unit}` : item.unit_name ? "saved-unit" : "")} aria-invalid={!item.unit && !item.custom_unit && !item.unit_name} onChange={event=>{const value=event.target.value;if(value==='saved-unit')return;updateItem(index,"unit",value.startsWith('custom:')?'':value);updateItem(index,"custom_unit",value.startsWith('custom:')?value.slice(7):'');}} className={(requiredControl(!item.unit && !item.custom_unit && !item.unit_name)) + " bp-ui-control"}><option value="">Select MOU</option>{!item.unit && !item.custom_unit && item.unit_name && <option value="saved-unit">{item.unit_name} (saved)</option>}{quotationUnitOptions(masters.units,item).map(unit=><option key={unit.value} value={unit.value}>{unit.name}</option>)}</select> : <select value={item.unit} aria-invalid={!item.unit} onChange={(event) => updateItem(index, "unit", event.target.value)} className={(requiredControl(!item.unit)) + " bp-ui-control"}><option value="">Select MOU</option>{masters.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>}
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!item.field_id && paintingApplicable ? <label className="block text-sm font-semibold">{lumpsum ? "No. of coats (optional)" : "No. of coats"}
              <select value={item.coats || 1} onChange={(event) => updateItem(index, "coats", event.target.value)} className={(control) + " bp-ui-control"}>{[1,2,3,4,5,6].map((coat) => <option key={coat} value={coat}>{coat}</option>)}</select>
            </label> : <label className="block text-sm font-semibold">No. of coats<div className={control + " bg-slate-100 text-slate-700"}>{item.field_id && paintingApplicable ? `${item.coats || 1} coat${Number(item.coats || 1) === 1 ? "" : "s"}` : "—"}</div></label>}
            <label className="block text-sm font-semibold">{item.field_id || lumpsum ? "Rate (₹)" : "Rate"}
              <input placeholder="Enter rate in ₹" inputMode="decimal" type="number" min="0" step="0.01" value={item.rate} aria-invalid={item.rate === "" || item.rate === null || item.rate === undefined} onChange={(event) => updateItem(index, "rate", event.target.value)} className={(requiredControl(item.rate === "" || item.rate === null || item.rate === undefined)) + " bp-ui-control"} />{fieldError("Rate")}
            </label>
          </div>
          <div className="rounded-2xl bg-[#245b75] p-4 text-center text-white"><b className="text-2xl text-emerald-300">{money(amount)}</b></div>
        </div>
    </Frame>
  );
}
function ExteriorMeasurementFields({ fields, selectedFieldIds, toggle, items, serviceCategories, paintTypes, brands, updateFieldItem, updateFieldMaterial }) {
  const [mobileFieldId, setMobileFieldId] = useState(null);
  const mobileField = fields.find((field) => field.field_id === mobileFieldId);
  const mobileItem = items.find((entry) => entry.field_id === mobileFieldId) || mobileField;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b bg-slate-100 px-4 py-3">
        <div>
          <p className="font-semibold">Exterior wall and ceiling totals</p>
          
        </div>
      </div>
      <div className="hidden md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <th className="w-[5%] px-3 py-3"><span className="sr-only">Select</span></th>
              <th className="w-[20%] px-3 py-3">Room name</th>
              <th className="w-[18%] px-3 py-3">Area</th>
              <th className="w-[30%] px-3 py-3">{SERVICE_MASTER_LABELS.category}</th>
              <th className="w-[15%] px-3 py-3">Number of coats</th>
              <th className="w-[12%] px-3 py-3 text-right">Sq ft</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {["full", "room"].map((scope) => {
              const scopedFields = fields.filter((field) => field.scope === scope);
              if (!scopedFields.length) return null;
              return <Fragment key={scope}>
                <tr><td colSpan="6" className="bg-slate-100 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">{scope === "full" ? "Entire property totals" : "Individual rooms / areas"}</td></tr>
                {scopedFields.map((field) => {
                  const item = items.find((entry) => entry.field_id === field.field_id) || field;
                  const checked = selectedFieldIds.includes(field.field_id);
                  const ensureSelected = () => { if (!checked) toggle(field.field_id); };
                  return <tr key={field.field_id} onClick={() => toggle(field.field_id)} className={`cursor-pointer ${checked ? "bg-[#e8f3f8]/40" : "hover:bg-slate-50"}`}>
                    <td className="px-4 py-3"><input type="checkbox" checked={checked} onChange={() => toggle(field.field_id)} onClick={(event) => event.stopPropagation()} aria-label={`Select ${field.room_name} ${field.description}`} /></td>
                    <td className="px-3 py-3 font-semibold text-slate-900">{field.room_name}</td>
                    <td className="px-3 py-3 font-semibold text-slate-600">{field.description}</td>
                    <td className="px-3 py-3"><select aria-label={`Service category for ${field.room_name} ${field.description}`} value={item.service_category || ""} onClick={(event) => event.stopPropagation()} onChange={(event) => { updateFieldItem(field.field_id, "service_category", event.target.value); updateFieldItem(field.field_id, "paint_type", ""); ensureSelected(); }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 bp-ui-control"><option value="">Select Service / Product Category</option>{serviceCategories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></td>
                    <td className="px-3 py-3"><select aria-label={`Coats for ${field.room_name} ${field.description}`} value={item.coats || 1} onClick={(event) => event.stopPropagation()} onChange={(event) => { updateFieldItem(field.field_id, "coats", event.target.value); ensureSelected(); }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 bp-ui-control">{[1,2,3,4,5,6].map((coat) => <option key={coat} value={coat}>{coat} coat{coat === 1 ? "" : "s"}</option>)}</select></td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{field.quantity} sq ft<details className="mt-2 text-left" onClick={(event) => event.stopPropagation()}><summary className="cursor-pointer text-xs font-semibold text-[#176b9b]">Material details</summary><MaterialSelections item={item} categories={serviceCategories} products={paintTypes} brands={brands} update={(values) => updateFieldMaterial(field.field_id, values)} /></details></td>
                  </tr>;
                })}
              </Fragment>;
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 p-3 md:hidden">
        {fields.map((field) => {
          const checked = selectedFieldIds.includes(field.field_id);
          const item = items.find((entry) => entry.field_id === field.field_id) || field;
          const serviceName = serviceCategories.find((entry) => String(entry.id) === String(item.service_category))?.name || "Service not selected";
          return (
            <button type="button" key={"mobile-field-" + field.field_id} onClick={() => setMobileFieldId(field.field_id)} className={("grid w-full grid-cols-[auto_minmax(0,1fr)_72px_82px] items-center gap-2 rounded-xl border p-3 text-left " + (checked ? "border-[#9cc4d6] bg-[#e8f3f8]" : "border-slate-200 bg-white")) + " bp-ui-action"}>
              <span className={"grid h-6 w-6 shrink-0 place-items-center rounded-md border " + (checked ? "border-[#176b9b] bg-[#176b9b] text-white" : "border-slate-300")}>{checked && <Check className="h-4 w-4" />}</span>
                      <span className="min-w-0 flex-1"><b className="block whitespace-normal text-left text-sm">{field.room_name}</b><small className="block whitespace-normal text-left text-slate-600">{field.description} · {serviceName}</small></span>
              <span className="text-right"><b className="block text-sm">{field.quantity}</b><small className="text-slate-500">sq ft</small></span>
              <span className="rounded-lg border bg-white px-2 py-1.5 text-center text-xs font-bold">{item.coats || 1} coat{Number(item.coats || 1) === 1 ? "" : "s"}</span>
            </button>
          );
        })}
      </div>
      {mobileField && mobileItem && (
        <QuotationLineItemPopup popupProtection={null} titleText="Edit selected area field" description={`${mobileField.room_name} - ${mobileField.description}`} onClose={() => setMobileFieldId(null)} footer={<Button type="button" onClick={() => setMobileFieldId(null)}>Update selection</Button>}>
            <label className="flex items-center gap-3 rounded-xl border p-4 font-semibold"><input type="checkbox" checked={selectedFieldIds.includes(mobileField.field_id)} onChange={() => toggle(mobileField.field_id)} />Include this field in quotation</label>
            <label className="mt-4 block text-sm font-semibold">Service / Product Category
              <select value={mobileItem.service_category || ""} onChange={(event) => { updateFieldItem(mobileField.field_id, "service_category", event.target.value); updateFieldItem(mobileField.field_id, "paint_type", ""); if (!selectedFieldIds.includes(mobileField.field_id)) toggle(mobileField.field_id); }} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 bp-ui-control"><option value="">Select Service / Product Category</option>{serviceCategories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
            </label>
            <label className="mt-4 block text-sm font-semibold">No. of coats
              <select value={mobileItem.coats || 1} onChange={(event) => { updateFieldItem(mobileField.field_id, "coats", event.target.value); if (!selectedFieldIds.includes(mobileField.field_id)) toggle(mobileField.field_id); }} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 bp-ui-control">{[1,2,3,4,5,6].map((coat) => <option key={coat} value={coat}>{coat}</option>)}</select>
            </label>
            <MaterialSelections item={mobileItem} categories={serviceCategories} products={paintTypes} brands={brands} update={(values) => updateFieldMaterial(mobileField.field_id, values)} />
        </QuotationLineItemPopup>
      )}
    </div>
  );
}

function AreaFieldGroup({ title, fields, selectedFieldIds, toggle, items, masters, updateFieldMaterial, specialWalls = [], onAddSpecial, onEditSpecial }) {
  return (
    <section className="quotation-surface-card overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="quotation-surface-header">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="truncate text-sm font-bold">{title}</h3>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold">{fields.length}</span>
        </div>
        {fields.length > 0 && <div className="quotation-surface-columns" aria-hidden="true"><span>Surface</span><span className="text-right">Area</span><div className="quotation-surface-materials"><span>{SERVICE_MASTER_LABELS.category}</span><span>Brand</span><span>Product</span><span>Paint Coats</span></div></div>}
      </header>
      {fields.length ? <div className="divide-y divide-slate-100">
        {fields.map((field) => {
          const checked = selectedFieldIds.includes(field.field_id);
          const item = items.find((entry) => entry.field_id === field.field_id) || field;
          const name = field.custom_area_name || (field.surface_type === "WALL" ? (specialWalls.some((wall) => wall.parent_field_id === field.field_id) ? "Normal Walls" : "All Walls") : field.surface_type === "CEILING" ? "Ceiling" : field.description);
          return <div key={field.field_id} className={`quotation-surface-row ${checked ? "is-selected" : ""}`}>
            <div className="quotation-surface-name">
              <label className="quotation-surface-check"><input type="checkbox" checked={checked} onChange={() => toggle(field.field_id)} aria-label={`Select ${name}`} className="h-4 w-4 accent-[#176b9b]" /></label>
              <button type="button" className="quotation-surface-title bp-ui-action" onClick={() => field.parent_field_id ? onEditSpecial?.(specialWalls.find((wall) => wall.field_id === field.field_id)) : toggle(field.field_id)}>{name}</button>
              {field.parent_field_id && <button type="button" className="quotation-surface-edit bp-ui-icon-action" aria-label={`Edit ${name}`} onClick={() => onEditSpecial?.(specialWalls.find((wall) => wall.field_id === field.field_id))}><Pencil size={16} /></button>}
            </div>
            <span className="quotation-surface-area">{Number(field.quantity).toLocaleString("en-IN", { maximumFractionDigits: 2 })} <small>sqft</small></span>
            <MaterialSelections inline item={item} categories={masters.categories} products={masters.paintTypes} brands={masters.brands} update={(values) => updateFieldMaterial(field.field_id, values)} />
          </div>;
        })}
      </div> : <p className="p-4 text-sm text-amber-700">No saved Area Calculation for this room.</p>}
      {onAddSpecial && fields.some((field) => field.surface_type === "WALL") && <div className="flex flex-wrap gap-2 border-t p-3"><button type="button" className="min-h-11 rounded-xl border px-4 font-bold text-[#176b9b] bp-ui-action" onClick={(event) => event.currentTarget.closest("section").querySelector("select")?.focus()}>Assign Products</button><button type="button" onClick={onAddSpecial} className="min-h-11 rounded-xl bg-[#e8f3f8] px-4 font-bold text-[#176b9b] bp-ui-action">+ Add Special Wall</button></div>}
    </section>
  );
}
function groupPreviewLines(items, savedRooms) {
  return items.map(item=>{
    const room=savedRooms.find(entry=>String(entry.id)===String(item.property_room_id || item.room_id || ''));
    return {...item,included_areas:item.included_areas?.length?item.included_areas:[item.room_name || room?.name || 'General']};
  });
}

function duplicateMeasuredWorkMessage(items, savedRooms) {
  const seen = new Map();
  for (const item of items) {
    const room = savedRooms.find((entry) => String(entry.id) === String(item.property_room_id || item.room_id || ""));
    const area = item.included_areas?.length
      ? item.included_areas.join("|")
      : item.field_id
        ? `${item.room_name || "Full House"} — ${item.surface_type || item.description}`
        : `${item.room_name || room?.name || "General"} — ${item.description}`;
    const key = JSON.stringify([item.service_category, item.custom_service_category, item.service_type, item.paint_type, item.custom_product_type, item.paint_brand, item.custom_brand, item.color, item.description, item.coats, item.unit, item.custom_unit, item.rate, item.calculation_method, item.is_additional_service, item.specification_details?.assignment_id]);
    const previousAreas = seen.get(key) || new Set();
    if (previousAreas.has(area)) return `The same work is listed more than once for ${area}. Remove the duplicate or change its work/material details.`;
    previousAreas.add(area);
    seen.set(key, previousAreas);
  }
  return "";
}

function MaterialSelections({ item, categories = [], products, brands, update, inline = false }) {
  const control = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base";
  const label = "min-w-0 text-xs font-bold text-slate-700";
  return <div className={inline ? "quotation-surface-materials" : "mt-3 grid min-w-0 grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-3 lg:grid-cols-4"}>
    <label className={label}><span className="quotation-material-label">{SERVICE_MASTER_LABELS.category}</span><select value={item.service_category || ""} onChange={(event) => update({ service_category: event.target.value, custom_service_category: "", paint_type: "" })} className={(control) + " bp-ui-control"}>{!item.service_category && <option value="">Select service</option>}{categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label className={label}><span className="quotation-material-label">Brand</span><select value={item.paint_brand || ""} onChange={(event) => update({ paint_brand: event.target.value })} className={(control) + " bp-ui-control"}><option value="">Select brand</option>{brands.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label className={label}><span className="quotation-material-label">Product</span><select value={item.paint_type || ""} onChange={(event) => {
      const product = products.find((entry) => String(entry.id) === event.target.value);
      update({ paint_type: event.target.value, ...(product?.service_category ? { service_category: product.service_category, custom_service_category: "" } : {}) });
    }} className={(control) + " bp-ui-control"}><option value="">Select product</option>{products.filter((entry) => !item.service_category || !entry.service_category || String(entry.service_category) === String(item.service_category)).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label className={label}><span className="quotation-material-label">Paint Coats</span><select value={item.coats || 1} onChange={(event) => update({ coats: Number(event.target.value) })} className={(control) + " bp-ui-control"}>{[1,2,3,4,5,6].map((coats) => <option key={coats} value={coats}>{coats}</option>)}</select></label>
  </div>;
}
function Row({ label, value }) {
  return (
    <div className="flex justify-between text-slate-300">
      <span>{label}</span>
      <span className="font-semibold text-white">{money(value)}</span>
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

async function formatRequestError(error) {
  const data = error?.response?.data;
  if (typeof data === "string") return /^\s*</.test(data) ? "" : data;
  if (data instanceof Blob) {
    const text = await data.text();
    if (!text || /^\s*</.test(text)) return "";
    try {
      return formatError(JSON.parse(text));
    } catch {
      return text;
    }
  }
  return formatError(data);
}
