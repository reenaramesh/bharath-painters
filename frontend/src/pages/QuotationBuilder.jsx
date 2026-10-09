import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { goBackFromBuilder } from "../utils/navigation";
import { ArrowLeft, ArrowRight, Check, Eye, IndianRupee, Pencil, Plus, Ruler, Search, Trash2, X } from "lucide-react";
import api from "../api/client";
import SearchableSelect from "../components/SearchableSelect";
import CustomerConnectionFlow from "../components/CustomerConnectionFlow";
import PropertyForm from "../components/PropertyForm";
import { previewPdf } from "../components/PdfPreview";
import { Button, PageHeader, SectionCard, StatusBadge } from "../components/ui";
import "./quotation-measurement.css";
import { availableWallArea } from "../utils/specialWallArea";
import GroupedQuotationWorkspace from "../components/GroupedQuotationWorkspace";
import { assignmentQuotationItems, groupedQuotationRoom, quotationRoomAreaLabel } from "../utils/groupedQuotation";
import SpecialWallSheet from "../components/SpecialWallSheet";

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
  "Customer, property & type",
  "Area fields & coats",
  "Services, rates & totals",
];
const money = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
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
function missingQuotationFields(item) {
  const missing = [];
  if (!item.service_category && !String(item.custom_service_category || "").trim()) missing.push("Type of service");
  if (!item.field_id && !item.property_room_id && !String(item.room_name || "").trim()) missing.push("Room / Area");
  if (!String(item.description || "").trim()) missing.push("Product description");
  if (!item.unit) missing.push("MOU");
  if (Number(item.quantity || 0) <= 0) missing.push("Quantity");
  if (item.rate === "" || item.rate === null || item.rate === undefined) missing.push("Rate");
  return missing;
}
function incompleteLineMessage(items) {
  const index = items.findIndex((item) => missingQuotationFields(item).length);
  if (index < 0) return "";
  return `Line ${index + 1} (${items[index].room_name || "service"}) needs: ${missingQuotationFields(items[index]).join(", ")}.`;
}

export default function QuotationBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [useMeasurements, setUseMeasurements] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [properties, setProperties] = useState([]);
  const [savedRooms, setSavedRooms] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [measurementRecords, setMeasurementRecords] = useState([]);
  const [measurementRecordsLoading, setMeasurementRecordsLoading] = useState(false);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState("");
  const [selectedRoomIds, setSelectedRoomIds] = useState([]);
  const [selectedFieldIds, setSelectedFieldIds] = useState([]);
  const knownFieldIds = useRef(new Set());
  const [specialWalls, setSpecialWalls] = useState([]);
  const [specialWallEditor, setSpecialWallEditor] = useState(null);
  const [groupAssignments, setGroupAssignments] = useState({ groups: [], specials: [], services: [], rates: {} });
  const [openingGroupRequest, setOpeningGroupRequest] = useState(null);
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
  const [form, setForm] = useState({
    customer: "",
    property: "",
    valid_until: "",
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
  });
  const [items, setItems] = useState([]);
  const [mobileItemIndex, setMobileItemIndex] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewingPdf, setPreviewingPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
        setForm((current) => ({
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
      .catch(() => setError("Quotation data could not be loaded."));
  }, []);
  useEffect(() => {
    const requestedCustomer = searchParams.get("customer");
    const requestedProperty = searchParams.get("property");
    if ((!requestedCustomer && !requestedProperty) || !customers.length || !properties.length || form.customer) return;
    const property = properties.find((item) => String(item.id) === requestedProperty);
    const customerId = requestedCustomer || property?.customer;
    const selected = customers.find((item) => String(item.id) === String(customerId));
    if (!selected) return;
    setForm((current) => ({ ...current, customer: selected.id, property: property?.id || "" }));
    setCustomerSearch(selected.name);
  }, [customers, properties, form.customer, searchParams]);
  useEffect(() => {
    setItems([]);
    setSpecialWalls([]);
    setGroupAssignments({ groups: [], specials: [], services: [], rates: {} });
    setOpeningGroupRequest(null);
    setSpecialWallEditor(null);
    setSelectedFieldIds([]);
    knownFieldIds.current = new Set();
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
        setSelectedMeasurementId(String(requested?.id || records[0]?.id || ""));
      })
      .catch(() => {
        setMeasurementRecords([]);
        setSelectedMeasurementId("");
        setError("Saved Area Calculations could not be loaded for this property.");
      }).finally(() => setMeasurementRecordsLoading(false));
  }, [form.property, searchParams]);
  useEffect(() => {
    setItems([]);
    setSpecialWalls([]);
    setGroupAssignments({ groups: [], specials: [], services: [], rates: {} });
    setOpeningGroupRequest(null);
    setSpecialWallEditor(null);
    setSelectedFieldIds([]);
    knownFieldIds.current = new Set();
    if (!form.property || !selectedMeasurementId) {
      setSavedRooms([]);
      setMeasurements([]);
      setSelectedRoomIds([]);
      return;
    }
    const params = { measurement: selectedMeasurementId };
    Promise.all([
      api.get(`/quotations/properties/${form.property}/rooms/`, { params }),
      api.get(`/quotations/properties/${form.property}/measurements/`, { params }),
    ]).then(([roomResponse, measurementResponse]) => {
      const rooms = roomResponse.data.results || roomResponse.data;
      setSavedRooms(rooms);
      setMeasurements(measurementResponse.data.results || measurementResponse.data);
      setSelectedRoomIds(rooms.map((room) => room.id));
    }).catch(() => setError("The selected Area Calculation could not be loaded."));
  }, [form.property, selectedMeasurementId]);
  const availableProperties = properties.filter(
    (item) => String(item.customer) === String(form.customer),
  );
  const selectedProperty = properties.find((item) => String(item.id) === String(form.property));
  const selectedCustomer = customers.find((item) => String(item.id) === String(form.customer));
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
  }, [measurementFields, exteriorMode, specialWalls.length]);
  const groupedMode = useMeasurements && !exteriorMode;
  const assignmentMeasurement = useMemo(() => ({
    id: Number(selectedMeasurementId),
    version: measurementRecords.find((record) => String(record.id) === String(selectedMeasurementId))?.version || 1,
    rooms: savedRooms,
    surfaces: measurements.filter((surface) => !surface.work_area || surface.work_area === "INTERIOR"),
  }), [selectedMeasurementId, measurementRecords, savedRooms, measurements]);
  const assignedItems = useMemo(() => groupedMode ? assignmentQuotationItems(assignmentMeasurement, groupAssignments, masters) : [], [groupedMode, assignmentMeasurement, groupAssignments, masters]);
  const activeItems = useMemo(() => groupedMode
    ? [...assignedItems, ...items.filter((item) => !item.field_id)]
    : items.filter((item) => !item.field_id || selectedFieldIds.includes(item.field_id)),
    [groupedMode, assignedItems, items, selectedFieldIds]);
  const selectedProductDetails = useMemo(
    () => uniqueProductDetails(activeItems, masters.paintTypes, masters.brands),
    [activeItems, masters.paintTypes, masters.brands],
  );
  const preview = useMemo(() => {
    const subtotal = activeItems.reduce((sum, item) => {
      const rate = Number(item.rate) || 0;
      if (item.calculation_method === "LUMPSUM") return sum + rate;
      if (item.calculation_method === "MANUAL")
        return sum + (Number(item.quantity) || 0) * rate;
      const room = selectedRooms[Number(item.room_index)];
      const service = masters.services.find(
        (entry) => String(entry.id) === String(item.service_type),
      );
      if (!room || !service) return sum;
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
      return sum + (quantities[service.calculation_type] || 0) * rate;
    }, 0);
    const discount =
      form.discount_type === "PERCENTAGE"
        ? (subtotal * Math.min(Number(form.discount_value) || 0, 100)) / 100
        : Math.min(Number(form.discount_value) || 0, subtotal);
    const taxable = subtotal - discount;
    const gst =
      form.gst_mode === "GST_EXTRA"
        ? (taxable * (Number(form.gst_percentage) || 0)) / 100
        : form.gst_mode === "GST_INCLUDED" && Number(form.gst_percentage)
          ? (taxable * Number(form.gst_percentage)) /
            (100 + Number(form.gst_percentage))
          : 0;
    return {
      subtotal,
      discount,
      gst,
      total: form.gst_mode === "GST_EXTRA" ? taxable + gst : taxable,
    };
  }, [activeItems, form, selectedRooms, masters.services]);
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
          ...(product?.default_price !== null && product?.default_price !== undefined ? { rate: String(product.default_price) } : {}) }
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
    setMobileItemIndex(items.length);
    setItems((current) => [...current, { ...emptyItem, description: "", calculation_method: "MANUAL", is_additional_service: true, quantity: 1, coats: 1 }]);
  };
  const addOpeningMeasurement = (openingType) => {
    if (groupedMode && assignmentMeasurement.surfaces.some((surface) => surface.surface_type === openingType)) {
      setOpeningGroupRequest({ kind: "group", initialSurface: openingType });
      return;
    }
    if (items.some((item) => item.opening_type === openingType)) return;
    const label = openingType === "DOOR" ? "Door" : "Window";
    const paintingCategory = masters.categories.find((entry) => entry.name.toLowerCase() === "painting") || masters.categories.find((entry) => entry.name.toLowerCase().includes("paint"));
    const squareFeetUnit = masters.units.find((entry) => ["sq ft", "sqft", "square feet", "square foot"].includes(entry.name.toLowerCase()));
    const matchingService = masters.services.find(
      (entry) => entry.calculation_type === openingType,
    );
    const savedOpeningSurfaces = measurements.filter(
      (surface) =>
        surface.surface_type === openingType &&
        selectedRooms.some((room) => room.id === surface.room),
    );
    const openingGroups = [...savedOpeningSurfaces.reduce((groups, surface) => {
      const key = String(surface.room || "general");
      const current = groups.get(key) || { room: surface.room || "", quantity: 0 };
      current.quantity += Number(surface.net_area || 0);
      groups.set(key, current);
      return groups;
    }, new Map()).values()];
    setItems((current) => [
      ...current,
      ...(openingGroups.length ? openingGroups.map((group) => ({
        ...emptyItem,
        opening_type: openingType,
        property_room_id: group.room,
        service_category: paintingCategory?.id || matchingService?.category_master || "",
        service_type: "",
        unit: squareFeetUnit?.id || "",
        description: `Total ${label.toLowerCase()} painting area`,
        calculation_method: "MANUAL",
        quantity: group.quantity.toFixed(2),
        coats: 1,
      })) : [{
        ...emptyItem,
        opening_type: openingType,
        service_category: paintingCategory?.id || matchingService?.category_master || "",
        service_type: "",
        unit: squareFeetUnit?.id || "",
        description: `${label} area`,
        calculation_method: "MANUAL",
        quantity: "",
        coats: 1,
      }]),
    ]);
  };
  function canContinue() {
    if (step === 0 && !form.customer) return "Select a customer.";
    if (step === 0 && !form.property) return "Select a property.";
    if (step === 0 && useMeasurements && !selectedMeasurementId) return "Select a saved Area Calculation or choose Lump Sum Quotation.";
    if (step === 0 && useMeasurements && exteriorMode && !measurements.some(item=>item.work_area==="EXTERIOR")) return "Add an exterior Area Calculation to this property or choose Lump Sum Quotation.";
    if (step === 1 && groupedMode && !activeItems.length) return "Create paint areas or add a general service before continuing.";
    if (step === 1 && activeItems.some((item) => !item.service_category && !item.custom_service_category)) return "Select a type of service for every selected measured area.";
    if (step === 1 && activeItems.some((item) => {
      if (item.is_additional_service) return false;
      const category = masters.categories.find((entry) => String(entry.id) === String(item.service_category));
      return category?.name?.toLowerCase().includes("paint") && !item.paint_type;
    })) return "Select a material or product for every selected painting area.";
    if (step === 2 && !activeItems.length) return "Add at least one quotation line.";
    if (step === 2 && activeItems.some((item) => !item.field_id && !item.property_room_id && !String(item.room_name || "").trim()))
      return "Select a room or area for every Lump Sum line.";
    if (step === 2 && activeItems.some((item) => item.is_additional_service && !item.unit)) return "Select a unit for every general service line.";
    if (
      step === 2 &&
      activeItems.some((item) => !item.description || item.rate === "")
    )
      return "Every quotation line needs a product description and rate.";
    if (
      step === 2 &&
      activeItems.some(
        (item) => !item.field_id && Number(item.quantity || 0) <= 0,
      )
    )
      return "Enter a quantity greater than zero for every Lump Sum or custom line.";
    if (step === 2 && activeItems.some((item) => !item.service_category && !String(item.custom_service_category || "").trim()))
      return "Select the type of service for every quotation line.";
    return "";
  }
  function next() {
    const message = canContinue();
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setStep((value) => value === 0 && !useMeasurements ? 2 : Math.min(2, value + 1));
  }
  function openQuotationPreview() {
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
  async function submit(pdfPreviewOnly = false) {
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
    if (pdfPreviewOnly) setPreviewingPdf(true);
    else setSaving(true);
    setError("");
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
        if (!item.field_id || item.is_additional_service) return false;
        const category = masters.categories.find((entry) => String(entry.id) === String(item.service_category));
        return (!item.service_category && !item.custom_service_category) || (category?.name?.toLowerCase().includes("paint") && !item.paint_type);
      });
      if (incompleteMaterial) {
        setError(`Select a service and material for ${incompleteMaterial.room_name || incompleteMaterial.description}.`);
        setStep(1);
        return;
      }
      const groupedItems = cleanItems.reduce((groups, line) => {
        const key = JSON.stringify([
          line.service_category, line.custom_service_category, line.service_type,
          line.paint_type, line.custom_product_type, line.paint_brand, line.custom_brand,
          line.color, line.description, line.coats, line.unit, line.custom_unit,
          line.rate, line.calculation_method, line.is_additional_service, line.specification_details?.assignment_id,
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
        quotation_type: useMeasurements ? "MEASUREMENT" : "MANUAL_LUMPSUM",
        lead: searchParams.get("lead") ? Number(searchParams.get("lead")) : null,
        customer: Number(form.customer),
        property: Number(form.property),
        measurement_record: useMeasurements && selectedMeasurementId ? Number(selectedMeasurementId) : null,
        discount_value: Number(form.discount_value) || 0,
        gst_percentage: Number(form.gst_percentage) || 0,
        valid_until: form.valid_until || null,
        rooms,
        items: groupedItems,
      };
      if (pdfPreviewOnly) {
        let response;
        try {
          response = await api.post(
            "/quotations/preview-pdf/",
            payload,
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
            payload,
            { responseType: "blob" },
          );
        }
        previewPdf(response.data, "quotation-preview.pdf");
      } else {
        const { data } = await api.post("/quotations/create/", payload);
        navigate(`/quotations/${data.id}`, { state: { draftSaved: true } });
      }
    } catch (requestError) {
      if (pdfPreviewOnly) setShowPreview(false);
      const requestMessage = await formatRequestError(requestError);
      setError(
        requestMessage ||
          (pdfPreviewOnly
            ? "Quotation PDF preview could not be generated."
            : "Quotation could not be created."),
      );
    } finally {
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
  const displaySteps = groupedMode ? [steps[0], "Services & Product", "Final quotation"] : steps;
  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-4 sm:space-y-5 sm:pb-8 quotation-measurement-page bp-quotation-builder">
      <button
        onClick={() =>
          step
            ? setStep(step === 2 && !useMeasurements ? 0 : step - 1)
            : goBackFromBuilder(location, navigate, "/quotations")
        }
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#176b9b]"
      >
        <ArrowLeft className="h-4 w-4" />
        {step ? "Previous step" : "Back to quotations"}
      </button>
      {specialWallEditor?.parent && <SpecialWallSheet parent={specialWallEditor.parent} wall={specialWallEditor.wall} walls={specialWalls} masters={masters} onClose={() => setSpecialWallEditor(null)} onSave={saveSpecialWall} onDelete={deleteSpecialWall} />}
      <PageHeader eyebrow="New quotation" title="Create quotation" description={displaySteps[step]} actions={<StatusBadge status="IN_PROGRESS" label={`Step ${step + 1} of ${steps.length}`} />} />
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
      {error && <div role="alert" className="quotation-validation-message rounded-xl p-4 text-sm">{error}</div>}
      <section className={`quotation-step-card min-w-0 rounded-2xl border border-[#dce7ed] bg-white p-4 shadow-sm sm:p-6 ${step === 1 && groupedMode ? "quotation-grouped-step" : ""}`}>
        {step === 0 && (
          <div className="quotation-customer-fields grid gap-4 sm:gap-5 md:grid-cols-2">
            <div className="md:col-span-2"><h2 className="text-lg font-extrabold text-[#193750]">Customer and property</h2></div>
            <label className="text-sm font-medium">
              <span className="flex items-center justify-between gap-2"><span>Customer *</span><button type="button" onClick={() => setShowCustomerForm(true)} className="inline-flex items-center gap-1 font-bold text-[#176b9b]"><Plus className="h-4 w-4" />New Customer</button></span>
              <span className="quotation-customer-search mt-2 flex items-center gap-2 rounded-xl border border-[#cbdce6] px-3 py-2.5 focus-within:border-[#176b9b]">
                <Search className="h-4 w-4 text-slate-400" />
                <input value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); if (form.customer) { update("customer", ""); update("property", ""); } }} placeholder="Search name, mobile, email or city" className="w-full bg-transparent font-normal outline-none" />
              </span>
              {!customerSearch && recentCustomers.length > 0 && <span className="mt-2 block"><span className="mb-1 block text-xs font-semibold text-slate-400">Recent customers</span><span className="flex flex-wrap gap-1.5">{recentCustomers.map((item) => <button key={item.id} type="button" onClick={() => { update("customer", item.id); update("property", ""); setCustomerSearch(item.name); }} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">{item.name}</button>)}</span></span>}
              {customerSearch && !form.customer && customerSearchResults.length > 0 && <span className="relative z-40 mt-2 block max-h-52 overflow-y-auto rounded-xl border bg-white p-1 shadow-xl">{customerSearchResults.map((item) => <button key={item.id} type="button" onClick={() => { update("customer", item.id); update("property", ""); setCustomerSearch(item.name); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-normal hover:bg-slate-100"><b>{item.name}</b></button>)}</span>}
              {form.customer && <span className="mt-2 block text-xs font-semibold text-emerald-700">Customer selected. Choose the property to continue.</span>}
              {customerSearch && !form.customer && customerSearchResults.length === 0 && <span className="mt-2 block text-xs font-normal text-red-600">No matching customers found.</span>}
            </label>
            <label className="text-sm font-medium">
              <span className="flex items-center justify-between gap-2"><span>Property *</span><button type="button" onClick={() => setShowPropertyForm(true)} disabled={!form.customer} className="inline-flex items-center gap-1 font-bold text-[#176b9b] disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-4 w-4" />Add Property</button></span>
              <select
                value={form.property}
                onChange={(e) => update("property", e.target.value)}
                className={input}
              >
                <option value="">Select property</option>
                {availableProperties.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.property_type} · {item.city}
                  </option>
                ))}
              </select>
            </label>
            {useMeasurements && <div className="text-sm font-medium md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="quotation-area-calculation">Area Calculation *</label>
                <button type="button" disabled={!form.property} onClick={() => navigate(`/properties/${form.property}/measurements?new=1`)} className="inline-flex items-center gap-1 font-bold text-[#176b9b] disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-4 w-4" />Add measurement</button>
              </div>
              <select id="quotation-area-calculation" value={selectedMeasurementId} onChange={(event) => setSelectedMeasurementId(event.target.value)} disabled={!form.property || measurementRecordsLoading} className={input}>
                <option value="">{!form.property ? "Select a property first" : measurementRecordsLoading ? "Loading Area Calculations..." : "Select Area Calculation"}</option>
                {measurementRecords.map((record) => <option key={record.id} value={record.id}>{record.reference_no} · {record.measured_on} · {record.total_sqft} sq ft</option>)}
              </select>
              {form.property && !measurementRecordsLoading && !measurementRecords.length && <p className="mt-2 text-xs text-amber-700">No saved Area Calculations with measurements for this property. Add one to continue.</p>}
            </div>}
            <label className="text-sm font-medium">
              Valid until
              <input
                type="date"
                value={form.valid_until}
                onChange={(e) => update("valid_until", e.target.value)}
                className={input}
              />
            </label>
          </div>
        )}
        {step === 0 && (
          <div className="mt-6 border-t border-[#dce7ed] pt-6">
            <h2 className="text-lg font-extrabold text-[#193750]">Quotation type</h2>
            
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <button type="button" onClick={()=>setUseMeasurements(true)} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${useMeasurements?"border-[#176b9b] bg-[#176b9b] text-white shadow-sm":"border-[#dce7ed] bg-white hover:border-[#176b9b]"}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${useMeasurements?"bg-white/15":"bg-[#e8f3f8] text-[#176b9b]"}`}><Ruler className="h-5 w-5" /></span><p className="font-bold">Square Foot Quotation</p></button>
              <button type="button" onClick={()=>{setUseMeasurements(false);setSelectedRoomIds([]);setSelectedFieldIds([])}} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${!useMeasurements?"border-[#176b9b] bg-[#176b9b] text-white shadow-sm":"border-[#dce7ed] bg-white hover:border-[#176b9b]"}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${!useMeasurements?"bg-white/15":"bg-[#e8f3f8] text-[#176b9b]"}`}><IndianRupee className="h-5 w-5" /></span><p className="font-bold">Lump Sum Quotation</p></button>
            </div>
          </div>
        )}
        {step === 0 && useMeasurements && selectedMeasurementId && <div className="mt-6">
          <GroupedQuotationWorkspace key={`measurements-${selectedMeasurementId}`} measurement={assignmentMeasurement} displayMeasurement={{ ...assignmentMeasurement, surfaces: measurements }} masters={masters} state={groupAssignments} onChange={setGroupAssignments} phase="measurements" />
        </div>}
        {step === 1 && (groupedMode ? <GroupedQuotationWorkspace showMeasurements={false} key={selectedMeasurementId} measurement={assignmentMeasurement} displayMeasurement={{ ...assignmentMeasurement, surfaces: measurements }} masters={masters} state={groupAssignments} onChange={setGroupAssignments} /> :
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">Select Area Calculation fields &amp; coats</h2>
                
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
                  className="rounded-lg border px-3 py-2 text-xs font-semibold"
                >
                  {exteriorMode ? "Select all rooms" : "Select all"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFieldIds([])}
                  className="rounded-lg border px-3 py-2 text-xs font-semibold"
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
                  <p className="mt-0.5 font-extrabold tabular-nums text-slate-950">{Number(value).toFixed(0)} <span className="text-[10px] font-semibold text-slate-500">sq ft</span></p>
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
                {selectedRooms.map((room) => <AreaFieldGroup key={room.id} title={room.name} specialWalls={specialWalls} onAddSpecial={() => setSpecialWallEditor({ parent: originalMeasurementFields.find((field) => field.room_id === room.id && field.surface_type === "WALL") })} onEditSpecial={(wall) => setSpecialWallEditor({ wall, parent: originalMeasurementFields.find((field) => field.field_id === wall.parent_field_id) })} fields={measurementFields.filter((field) => field.room_id === room.id)} selectedFieldIds={selectedFieldIds} toggle={toggleMeasurementField} items={items} masters={masters} updateFieldItem={updateMeasurementFieldItem} updateFieldMaterial={updateFieldMaterial} />)}
              </>}
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="font-bold">{groupedMode ? "Final quotation" : "Services & rates"}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={items.some((item) => item.opening_type === "DOOR")} onClick={() => addOpeningMeasurement("DOOR")} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">
                  <Plus className="h-4 w-4" /> Add door area
                </button>
                <button type="button" disabled={items.some((item) => item.opening_type === "WINDOW")} onClick={() => addOpeningMeasurement("WINDOW")} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">
                  <Plus className="h-4 w-4" /> Add window area
                </button>
              </div>
            </div>
            {groupedMode && <GroupedQuotationWorkspace measurement={assignmentMeasurement} displayMeasurement={{ ...assignmentMeasurement, surfaces: measurements }} masters={masters} state={groupAssignments} onChange={setGroupAssignments} phase="final" requestedEditor={openingGroupRequest} onEditorRequestHandled={() => setOpeningGroupRequest(null)} />}
            <div className="hidden">
              <table className="w-full min-w-[1480px] border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-200 text-left">
                    <th className="border p-2">Type of service</th>
                    <th className="border p-2">Room Name</th>
                    <th className="border p-2">Room type</th>
                    <th className="border p-2">Product type</th>
                    <th className="border p-2">Product description</th>
                    <th className="border p-2">MOU</th>
                    <th className="border p-2">Quantity</th>
                    <th className="border p-2">Brand</th>
                    <th className="border p-2">No. of coats</th>
                    <th className="border p-2">Rate</th>
                    <th className="border p-2">Amount</th>
                    <th className="border p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {pricedItems.map(({ item, index }) => {
                    const amount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
                    const selectedItemRoom = savedRooms.find((room) =>
                      String(room.id) === String(item.room_id || item.property_room_id),
                    ) || (item.field_id && item.room_index !== "" && item.room_index !== null && item.room_index !== undefined
                      ? selectedRooms[Number(item.room_index)]
                      : null);
                    const itemRoomName = item.room_name || selectedItemRoom?.name || (exteriorMode ? "Exterior" : "General");
                    const itemRoomType = selectedItemRoom?.room_type_name || item.room_type_name || (exteriorMode ? "Exterior" : "General");
                    return (
                      <tr key={item.field_id || index}>
                        <td className="border p-2">
                          <SearchableProductType label="" placeholder="Search service" value={item.service_category} options={masters.categories} onChange={(value) => { updateItem(index, "service_category", value); const selectedService = masters.services.find((entry) => String(entry.id) === String(item.service_type)); if (selectedService && String(selectedService.category_master) !== String(value)) updateItem(index, "service_type", ""); }} controlClass="w-40 rounded border p-1.5 pl-8" />
                        </td>
                        <td className="border p-2">
                          {item.field_id ? <span className="font-semibold text-slate-700">{itemRoomName}</span> : <SearchableSelect value={item.property_room_id} options={[{ value: "", label: "General / No room" }, ...savedRooms.map((room) => ({ value: room.id, label: room.name }))]} onChange={(value) => updateItem(index, "property_room_id", value)} placeholder="Search room / area" className="w-full rounded border p-1.5" />}
                        </td>
                        <td className="border p-2 font-semibold text-[#176b9b]">{itemRoomType}</td>
                        <td className="border p-2">
                          <SearchableProductType label="" value={item.paint_type} options={masters.paintTypes.filter((entry) => !item.service_category || String(entry.service_category) === String(item.service_category))} onChange={(value) => updateProductType(index, value)} controlClass="w-44 rounded border p-1.5 pl-8" />
                        </td>
                        <td className="border p-2">
                          <input
                            list={`descriptions-${index}`}
                            value={item.description}
                            onChange={(e) => updateItem(index, "description", e.target.value)}
                            placeholder={item.is_additional_service ? "Describe the additional service" : "Select or enter description"}
                            className="w-56 rounded border p-1.5"
                          />
                          <datalist id={`descriptions-${index}`}>{masters.descriptions.filter((entry) => !item.service_category || String(entry.service_category) === String(item.service_category)).map((entry) => <option key={entry.id} value={entry.name} />)}</datalist>
                        </td>
                        <td className="border p-2">
                          <select value={item.unit} onChange={(e) => updateItem(index, "unit", e.target.value)} className="w-full rounded border p-1.5"><option value="">Select MOU</option>{masters.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>
                        </td>
                        <td className="border p-2">
                          <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => updateItem(index, "quantity", e.target.value)} className="w-24 rounded border p-1.5 text-right" title={item.field_id ? "Saved calculated square feet" : "Quantity for this quotation line"} />
                        </td>
                        <td className="border p-2">
                          <SearchableProductType label="" placeholder="Search brand" emptyText="No matching brands" value={item.paint_brand} options={masters.brands} onChange={(value) => updateItem(index, "paint_brand", value)} controlClass="w-36 rounded border p-1.5 pl-8" />
                        </td>
                        <td className="border p-2">
                          {item.is_additional_service ? <span className="text-slate-400">—</span> : <select
                            value={item.coats || 1}
                            onChange={(e) =>
                              updateItem(index, "coats", e.target.value)
                            }
                            className="w-20 rounded border p-1.5"
                          >
                            {[1, 2, 3, 4, 5, 6].map((coats) => (
                              <option key={coats} value={coats}>
                                {coats}
                              </option>
                            ))}
                          </select>}
                        </td>
                        <td className="border p-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.rate}
                            onChange={(e) =>
                              updateItem(index, "rate", e.target.value)
                            }
                            className="w-24 rounded border p-1.5 text-right"
                          />
                        </td>
                        <td className="border p-2 text-right font-semibold">
                          {money(amount)}
                        </td>
                        <td className="border p-2">
                          <button
                            onClick={() =>
                              item.field_id
                                ? setSelectedFieldIds((ids) =>
                                    ids.filter((id) => id !== item.field_id),
                                  )
                                : setItems((value) =>
                                    value.filter((_, i) => i !== index),
                                  )
                            }
                            className="text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {useMeasurements && !groupedMode && [...measuredRateGroups.entries()].map(([key, group]) => <MeasuredRateGroup key={key} title={group.name} lines={group.lines} masters={masters} updateRate={(index, value) => updateItem(index, "rate", value)} editLine={setMobileItemIndex} />)}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {pricedItems.filter(({ item }) => !useMeasurements || !item.field_id).map(({ item, index }) => {
                const selectedItemRoom = savedRooms.find((room) =>
                  String(room.id) === String(item.room_id || item.property_room_id),
                ) || (item.field_id && item.room_index !== "" && item.room_index !== null && item.room_index !== undefined
                  ? selectedRooms[Number(item.room_index)]
                  : null);
                const itemRoomName = item.room_name || selectedItemRoom?.name || (exteriorMode ? "Exterior" : "General");
                const categoryName = masters.categories.find((entry) => String(entry.id) === String(item.service_category))?.name || item.custom_service_category || "Select service";
                const productName = item.description || "Description not added";
                const amount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
                const showsCoats = categoryName.toLowerCase().includes("paint");
                const missingFields = missingQuotationFields(item);
                return (
                  <article key={`mobile-price-${item.field_id || index}`} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${missingFields.length ? "border-red-400 ring-2 ring-red-100" : "border-slate-200"}`}>
                    <header className={`flex items-start justify-between gap-3 px-4 py-3 text-white ${missingFields.length ? "bg-red-950" : "bg-slate-950"}`}>
                      <div className="min-w-0"><p className={`text-[10px] font-bold uppercase tracking-wider ${missingFields.length ? "text-red-200" : "text-amber-300"}`}>{categoryName}</p><h3 className="mt-1 whitespace-normal font-bold">{itemRoomName}</h3><p className="mt-0.5 whitespace-normal text-xs text-slate-300">{productName}</p></div>
                      <button type="button" onClick={() => setMobileItemIndex(index)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/30 px-3 py-2 text-xs font-bold"><Pencil className="h-3.5 w-3.5" />{missingFields.length ? "Complete" : "Edit"}</button>
                    </header>
                    <div className="grid grid-cols-4 gap-px bg-slate-200">
                      <MobilePriceValue label="Quantity" value={item.quantity || "—"} />
                      <MobilePriceValue label="Coats" value={showsCoats ? item.coats || 1 : "—"} />
                      <MobilePriceValue label="Rate" value={money(item.rate)} />
                      <MobilePriceValue label="Amount" value={money(amount)} strong />
                    </div>
                    {missingFields.length > 0 && <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-800">Required: {missingFields.join(", ")}</p>}
                  </article>
                );
              })}
              {!pricedItems.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No quotation lines selected.</p>}
            </div>
            <div className="flex justify-end border-t border-slate-200 pt-4">
              <button type="button" onClick={addAdditionalService} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#176b9b] px-5 py-3 text-sm font-semibold text-white sm:w-auto"><Plus className="h-4 w-4" />Add services</button>
            </div>
            {mobileItemIndex !== null && items[mobileItemIndex] && (
              <MobileRateDialog
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
                close={() => setMobileItemIndex(null)}
                remove={() => {
                  const item = items[mobileItemIndex];
                  if (item.field_id) setSelectedFieldIds((ids) => ids.filter((id) => id !== item.field_id));
                  else setItems((value) => value.filter((_, index) => index !== mobileItemIndex));
                  setMobileItemIndex(null);
                }}
              />
            )}
          </div>
        )}
        {step === 2 && (
          <div className="quotation-totals-workspace mt-8 border-t border-[#dce7ed] pt-6"><h2 className="mb-5 text-lg font-extrabold text-[#193750]">Totals &amp; notes</h2><div className="grid gap-6 xl:grid-cols-2">
             <div className="order-last grid gap-4 sm:grid-cols-2 xl:order-first">
              <SectionCard title="Discount and taxes" description="Confirm the discount and GST treatment for this quotation." className="quotation-financial-controls sm:col-span-2" bodyClassName="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Discount type
                <select
                  value={form.discount_type}
                  onChange={(e) => update("discount_type", e.target.value)}
                  className={input}
                >
                  <option value="FIXED">Fixed amount</option>
                  <option value="PERCENTAGE">Percentage</option>
                </select>
              </label>
              <label className="text-sm">
                Discount value
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discount_value}
                  onChange={(e) => update("discount_value", e.target.value)}
                  className={input}
                />
              </label>
              <label className="text-sm">
                GST mode
                <select
                  value={form.gst_mode}
                  onChange={(e) => update("gst_mode", e.target.value)}
                  className={input}
                >
                  <option value="GST_EXTRA">GST extra</option>
                  <option value="GST_INCLUDED">GST included</option>
                  <option value="NO_GST">No GST</option>
                </select>
              </label>
              <label className="text-sm">
                GST percentage
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.gst_percentage}
                  onChange={(e) => update("gst_percentage", e.target.value)}
                  className={input}
                />
              </label>
              </SectionCard>
              <label className="text-sm sm:col-span-2">
                Notes
                <textarea
                  rows="3"
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  className={input}
                />
              </label>
              <label className="text-sm">Prepared by<input value={form.prepared_by} onChange={(e) => update("prepared_by", e.target.value)} className={input} placeholder="Name shown on quotation" /></label>
              <label className="text-sm">Inspected by<input value={form.inspected_by} onChange={(e) => update("inspected_by", e.target.value)} className={input} placeholder="Site inspector name" /></label>
              <label className="text-sm">Work duration<input value={form.work_duration} onChange={(e) => update("work_duration", e.target.value)} className={input} placeholder="For example, 15-18 days" /></label>
              
             </div>
            <div className="order-first h-fit rounded-xl bg-[#245b75] p-6 text-white xl:order-last">
              <h2 className="font-bold">Estimated total</h2>
              <div className="mt-5 space-y-3 text-sm">
                <Row label="Subtotal" value={preview.subtotal} />
                <Row label="Discount" value={preview.discount} />
                <Row label="GST" value={preview.gst} />
                <div className="flex justify-between border-t border-white/20 pt-4 text-xl font-bold">
                  <span>Total</span>
                  <span>{money(preview.total)}</span>
                </div>
              </div>
              
            </div>
           </div></div>
         )}
      </section>
       <div className="flex flex-wrap justify-end gap-3 rounded-2xl border border-[#dce7ed] bg-white p-3 shadow-sm sm:p-4">
        {step < 2 ? (
          <Button type="button"
            onClick={next}
            className="quotation-primary-action flex min-h-12 w-full items-center justify-center gap-2 sm:w-auto"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (<>
          <Button variant="secondary" type="button" onClick={() => submit(false)} loading={saving} className="flex min-h-12 flex-1 items-center justify-center gap-2 sm:flex-none">
            <Check className="h-4 w-4" />{saving ? "Saving..." : "Save draft"}
          </Button>
          <Button type="button"
            onClick={openQuotationPreview}
            disabled={saving}
            className="quotation-primary-action flex min-h-12 flex-1 items-center justify-center gap-2 sm:flex-none"
          >
            <Eye className="h-4 w-4" />
            Preview quotation
          </Button>
        </>)}
      </div>
       {showCustomerForm && <CustomerConnectionFlow quotationTheme onClose={() => setShowCustomerForm(false)} onNewCustomer={createCustomer} />}
       {showPropertyForm && <PropertyForm quotationTheme customers={customers} initialCustomer={form.customer} onSubmit={createProperty} onClose={() => setShowPropertyForm(false)} saving={savingProperty} />}
       {showPreview && (
        <QuotationPreviewDialog
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
    const quantity = Number(item.quantity || 0);
    const amount =
      item.calculation_method === "LUMPSUM" ? rate : quantity * rate;
    return {
      key: item.field_id || `preview-${index}`,
      number: index + 1,
      category,
      roomName,
      productBrand: [product, brand].filter(Boolean).join(" / ") || "—",
      description: item.description || "—",
      quantity,
      unit,
      coats: category.toLowerCase().includes("paint")
        ? Number(item.coats || 1)
        : "—",
      rate,
      amount,
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
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/70 p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Quotation preview"
    >
      <section className="mx-auto min-h-full max-w-6xl overflow-hidden rounded-2xl bg-slate-100 shadow-2xl">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-[#245b75] px-4 py-3 text-white sm:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">
              Preview only · Not yet saved
            </p>
            <h2 className="mt-0.5 text-lg font-bold sm:text-xl">
              Quotation Preview
            </h2>
          </div>
          <button type="button" onClick={close} className="rounded-xl border border-white/25 p-2.5">
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
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] border-collapse text-xs">
                <thead className="bg-slate-100 text-left uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Sl.</th><th className="px-3 py-3">Type of service</th><th className="px-3 py-3">Room / Area</th><th className="px-3 py-3">Product / Brand</th><th className="px-3 py-3">Description</th><th className="px-3 py-3 text-right">Qty / MOU</th><th className="px-3 py-3 text-center">Coats</th><th className="px-3 py-3 text-right">Rate</th><th className="px-3 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lineDetails.map((line) => (
                    <tr key={line.key}>
                      <td className="px-3 py-3">{line.number}</td>
                      <td className="px-3 py-3 font-semibold">{line.category}</td>
                      <td className="px-3 py-3 font-semibold text-blue-950">{line.roomName}</td>
                      <td className="px-3 py-3">{line.productBrand}</td>
                      <td className="px-3 py-3">{line.description}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{line.quantity.toFixed(0)} {line.unit}</td>
                      <td className="px-3 py-3 text-center">{line.coats}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{money(line.rate)}</td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums">{money(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 p-3 md:hidden">
              {lineDetails.map((line) => (
                <article key={`mobile-${line.key}`} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="text-[10px] font-bold uppercase text-blue-700">{line.category}</p><h4 className="truncate font-bold">{line.roomName}</h4><p className="truncate text-xs text-slate-500">{line.description}</p></div>
                    <b className="shrink-0 text-emerald-700">{money(line.amount)}</b>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><span><small className="block text-slate-400">Qty</small>{line.quantity.toFixed(0)} {line.unit}</span><span><small className="block text-slate-400">Coats</small>{line.coats}</span><span className="text-right"><small className="block text-slate-400">Rate</small>{money(line.rate)}</span></div>
                  <p className="mt-2 text-xs text-slate-500">{line.productBrand}</p>
                </article>
              ))}
            </div>
          </section>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="space-y-3">
              {form.product_details && <PreviewText title="Product details" value={form.product_details} />}
              {form.show_product_key_features && productDetails && <PreviewText title="Selected product details" value={productDetails} />}
              {form.work_duration && <PreviewText title="Work duration" value={form.work_duration} />}
              {form.payment_terms && <PreviewText title="Payment terms" value={form.payment_terms} />}
              {form.terms_conditions && <PreviewText title="Terms and conditions" value={form.terms_conditions} />}
              {form.work_procedures && <PreviewText title="Work procedures and safety" value={form.work_procedures} />}
              {form.notes && <PreviewText title="Notes" value={form.notes} />}
            </section>
            <section className="h-fit rounded-xl bg-[#245b75] p-5 text-white">
              <h3 className="font-bold">Quotation total</h3>
              <div className="mt-4 space-y-2 text-sm">
                <Row label="Subtotal" value={totals.subtotal} />
                <Row label="Discount" value={totals.discount} />
                <Row label="GST" value={totals.gst} />
                <div className="flex justify-between border-t border-white/20 pt-3 text-xl font-extrabold"><span>Total</span><span>{money(totals.total)}</span></div>
              </div>
            </section>
          </div>
        </div>
        <footer className="sticky bottom-0 z-20 grid grid-cols-2 gap-3 border-t bg-white p-3 sm:flex sm:justify-end sm:px-6 sm:py-4">
          <button type="button" onClick={close} className="rounded-xl border px-5 py-3 font-bold">Back to edit</button>
          <button type="button" onClick={previewPdfAction} disabled={previewingPdf || saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 font-bold text-blue-950 disabled:opacity-60"><Eye className="h-4 w-4" />{previewingPdf ? "Preparing PDF..." : "View PDF"}</button>
          <button type="button" onClick={create} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#176b9b] px-5 py-3 font-bold text-white disabled:opacity-60"><Check className="h-4 w-4" />{saving ? "Creating..." : "Create Quotation"}</button>
        </footer>
      </section>
    </div>
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
function MobilePriceValue({ label, value, strong }) {
  return (
    <div className="min-w-0 bg-white px-3 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={"mt-1 truncate text-sm tabular-nums " + (strong ? "font-extrabold text-emerald-700" : "font-bold text-slate-900")}>{value}</p>
    </div>
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
function SearchableProductType({ value, customValue = "", options, onChange, controlClass, label = "Product type", placeholder = "Search product type", emptyText = "No matching product types", allowCustom = false }) {
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
    <label className="block text-sm font-semibold">{label}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => { const match = exactMatch(); if (match) choose(match); else window.setTimeout(() => setOpen(false), 120); }}
          onChange={(event) => { const next = event.target.value; setQuery(next); setOpen(true); onChange("", allowCustom ? next : ""); }}
          onKeyDown={(event) => { if (event.key === "Enter") { const match = exactMatch(); if (match) { event.preventDefault(); choose(match); } else if (allowCustom) { event.preventDefault(); setOpen(false); } else if (filtered.length) { event.preventDefault(); choose(filtered[0]); } } }}
          placeholder={placeholder}
          autoComplete="off"
          className={`${controlClass} pl-10`}
        />
        {open && <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {filtered.map((entry) => <button key={entry.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(entry)} className={`block w-full rounded-lg px-3 py-2.5 text-left hover:bg-[#e8f3f8] ${String(entry.id) === String(value) ? "bg-[#e8f3f8] text-[#176b9b]" : ""}`}><span className="block text-sm font-bold">{entry.name}</span></button>)}
          {!filtered.length && <p className="px-3 py-4 text-center text-xs text-slate-500">{allowCustom ? "New entry. Choose whether to save it below." : emptyText}</p>}
        </div>}
        {!value && query.trim() && !open && !allowCustom && label === "Type of service" && <p className="mt-1 text-xs text-red-700">Choose a service from the results.</p>}
      </div>
    </label>
  );
}
function SearchableDescription({ value, options, onChange, controlClass, invalid, label = "Product description" }) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const term = String(value || "").trim().toLowerCase();
    return options.filter((entry) => !term || String(entry.name || "").toLowerCase().includes(term)).slice(0, 30);
  }, [options, value]);
  return (
    <label className="block text-sm font-semibold">{label}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={value}
          aria-invalid={invalid}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => { onChange(event.target.value, false); setOpen(true); }}
          placeholder="Type or select product description"
          autoComplete="off"
          className={`${controlClass} pl-10`}
        />
        {open && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {filtered.map((entry) => <button key={entry.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(entry.name, true); setOpen(false); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-[#e8f3f8]">{entry.name}</button>)}
          {!filtered.length && <p className="px-3 py-4 text-center text-xs text-slate-500">No saved description. Continue typing to create a new one.</p>}
        </div>}
      </div>
    </label>
  );
}
function SaveMasterOption({ label, checked, onChange }) {
  return <label className="mt-2 flex items-center gap-3 rounded-xl border border-[#cbdce6] bg-[#e8f3f8] p-3 text-sm font-semibold text-[#193750]"><input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4" />Save this {label} for future quotations</label>;
}
function MobileRateDialog({ item, index, masters, savedRooms, roomOptions, selectedRooms, exteriorMode, updateItem, updateProductType, updateMasterChoice, saveRoom, close, remove }) {
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
  const amount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
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
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-label="Edit quotation service and rate" className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-slate-50 shadow-2xl sm:max-w-2xl sm:rounded-[28px]">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white px-4 py-4">
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-[#176b9b]">Services & rates</p><h2 className="truncate text-lg font-bold">{roomName}</h2></div>
          <button type="button" onClick={close} aria-label="Close editor" className="rounded-xl border p-2.5"><X className="h-5 w-5" /></button>
        </header>
        <div className="space-y-4 p-4 pb-28">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><SearchableProductType label="Type of service" placeholder="Select or type a service" value={item.service_category} customValue={item.custom_service_category} options={masters.categories} allowCustom onChange={(value, customName) => updateMasterChoice(index, "service_category", "custom_service_category", "save_service_category_to_master", value, customName)} controlClass={requiredControl(!item.service_category && !String(item.custom_service_category || "").trim())} />
              {String(item.custom_service_category || "").trim() && <SaveMasterOption label="Type of service" checked={item.save_service_category_to_master} onChange={(value) => updateItem(index, "save_service_category_to_master", value)} />}</div>
            <label className="block text-sm font-semibold">Room / Area
              {item.field_id
                ? <SearchableSelect value={calculatedRoomKey} options={[{ value: "", label: exteriorMode ? "Full Exterior" : "Full House" }, ...calculatedRoomOptions.map((room) => ({ ...room, value: room.key, label: room.name }))]} onChange={(value) => { const room = calculatedRoomOptions.find((option) => option.key === value); updateItem(index, "room_index", room?.roomIndex ?? ""); updateItem(index, "room_id", room?.propertyRoomId || ""); updateItem(index, "property_room_id", room?.propertyRoomId || ""); updateItem(index, "room_name", room?.name || (exteriorMode ? "Full Exterior" : "Full House")); updateItem(index, "scope", room ? "room" : "full"); }} placeholder="Search calculated room" className={control} />
                : <SearchableSelect value={roomOptions.find((room) => item.property_room_id ? String(room.propertyRoomId) === String(item.property_room_id) : !room.propertyRoomId && room.name === item.room_name)?.key || ""} options={roomOptions.map((room) => ({ ...room, value: room.key, label: room.name }))} onChange={(value) => { const room = roomOptions.find((option) => option.key === value); updateItem(index, "property_room_id", room?.propertyRoomId || ""); updateItem(index, "room_name", room?.name || ""); }} placeholder="Search room / area" invalid={!item.property_room_id && !String(item.room_name || "").trim()} className={requiredControl(!item.property_room_id && !String(item.room_name || "").trim())} />}
            </label>
          </div>
          {!item.field_id && <div className="rounded-xl border border-dashed border-[#9cc4d6] bg-[#e8f3f8] p-3">
            {!addingRoom ? <button type="button" onClick={() => setAddingRoom(true)} className="inline-flex items-center gap-2 text-sm font-bold text-[#176b9b]"><Plus className="h-4 w-4" />Add room</button> : <div className="flex flex-col gap-2 sm:flex-row"><input autoFocus value={newRoomName} onChange={(event) => setNewRoomName(event.target.value)} placeholder="Enter room name" className={control + " mt-0 flex-1"} /><button type="button" disabled={roomSaving || !newRoomName.trim()} onClick={async () => { setRoomSaving(true); setRoomError(""); try { const room = await saveRoom(newRoomName); updateItem(index, "property_room_id", room.id); updateItem(index, "room_name", room.name); setAddingRoom(false); setNewRoomName(""); } catch (error) { setRoomError(error.response?.data?.name?.[0] || error.response?.data?.detail || error.message || "Room could not be saved."); } finally { setRoomSaving(false); } }} className="rounded-xl bg-[#176b9b] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{roomSaving ? "Saving..." : "Save room"}</button></div>}
            {roomError && <p className="mt-2 text-xs font-semibold text-red-600">{roomError}</p>}
          </div>}
          <SearchableProductType
            label={item.field_id ? "Product" : "Product type"}
            key={item.service_category || "all-products"}
            value={item.paint_type}
            customValue={item.custom_product_type}
            options={masters.paintTypes.filter((entry) => !item.service_category || String(entry.service_category) === String(item.service_category))}
            allowCustom
            onChange={(value, customName) => updateProductType(index, value, customName)}
            controlClass={control}
          />
          {String(item.custom_product_type || "").trim() && <SaveMasterOption label="Product type" checked={item.save_product_type_to_master} onChange={(value) => updateItem(index, "save_product_type_to_master", value)} />}
          <SearchableDescription label={item.field_id ? "Description / treatment" : "Product description"} value={item.description} options={descriptionOptions} invalid={!String(item.description || "").trim()} onChange={(value, fromMaster) => { updateItem(index, "description", value); if (fromMaster) updateItem(index, "promote_to_master", false); }} controlClass={requiredControl(!String(item.description || "").trim())} />
          {String(item.description || "").trim() && (descriptionSaved
            ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">Saved Product Description selected</p>
            : <label className="flex items-center gap-3 rounded-xl border border-[#cbdce6] bg-[#e8f3f8] p-4 text-sm font-semibold text-[#193750]"><input type="checkbox" checked={Boolean(item.promote_to_master)} onChange={(event) => updateItem(index, "promote_to_master", event.target.checked)} className="h-4 w-4" />Save this Product Description for future quotations</label>)}
          <SearchableProductType label="Brand" placeholder="Select or type a brand (optional)" value={item.paint_brand} customValue={item.custom_brand} options={masters.brands} allowCustom onChange={(value, customName) => updateMasterChoice(index, "paint_brand", "custom_brand", "save_brand_to_master", value, customName)} controlClass={control} />
          {String(item.custom_brand || "").trim() && <SaveMasterOption label="Brand" checked={item.save_brand_to_master} onChange={(value) => updateItem(index, "save_brand_to_master", value)} />}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">Quantity
              <input type="number" min="0.01" step="0.01" value={item.quantity} aria-invalid={Number(item.quantity || 0) <= 0} onChange={(event) => updateItem(index, "quantity", event.target.value)} className={requiredControl(Number(item.quantity || 0) <= 0)} />
            </label>
            <label className="block text-sm font-semibold">MOU
              <select value={item.unit} aria-invalid={!item.unit} onChange={(event) => updateItem(index, "unit", event.target.value)} className={requiredControl(!item.unit)}><option value="">Select MOU</option>{masters.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!item.field_id && paintingApplicable ? <label className="block text-sm font-semibold">No. of coats
              <select value={item.coats || 1} onChange={(event) => updateItem(index, "coats", event.target.value)} className={control}>{[1,2,3,4,5,6].map((coat) => <option key={coat} value={coat}>{coat}</option>)}</select>
            </label> : <label className="block text-sm font-semibold">No. of coats<div className={control + " bg-slate-100 text-slate-700"}>{item.field_id && paintingApplicable ? `${item.coats || 1} coat${Number(item.coats || 1) === 1 ? "" : "s"}` : "—"}</div></label>}
            <label className="block text-sm font-semibold">{item.field_id ? "Rate (₹)" : "Rate"}
              <input type="number" min="0" step="0.01" value={item.rate} aria-invalid={item.rate === "" || item.rate === null || item.rate === undefined} onChange={(event) => updateItem(index, "rate", event.target.value)} className={requiredControl(item.rate === "" || item.rate === null || item.rate === undefined)} />
            </label>
          </div>
          <div className="rounded-2xl bg-[#245b75] p-4 text-center text-white"><b className="text-2xl text-emerald-300">{money(amount)}</b></div>
        </div>
        <footer className="sticky bottom-0 z-20 grid grid-cols-[auto_1fr] gap-3 border-t bg-white p-4">
          <button type="button" onClick={remove} className="inline-flex items-center justify-center rounded-xl border border-red-200 px-4 py-3 text-red-600"><Trash2 className="h-5 w-5" /></button>
          <button type="button" onClick={close} className="rounded-xl bg-[#176b9b] px-5 py-3 font-bold text-white">Update line</button>
        </footer>
      </section>
    </div>
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
              <th className="w-[30%] px-3 py-3">Type of Service</th>
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
                    <td className="px-3 py-3"><select value={item.service_category || ""} onClick={(event) => event.stopPropagation()} onChange={(event) => { updateFieldItem(field.field_id, "service_category", event.target.value); updateFieldItem(field.field_id, "paint_type", ""); ensureSelected(); }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Select type of service</option>{serviceCategories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></td>
                    <td className="px-3 py-3"><select value={item.coats || 1} onClick={(event) => event.stopPropagation()} onChange={(event) => { updateFieldItem(field.field_id, "coats", event.target.value); ensureSelected(); }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{[1,2,3,4,5,6].map((coat) => <option key={coat} value={coat}>{coat} coat{coat === 1 ? "" : "s"}</option>)}</select></td>
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
            <button type="button" key={"mobile-field-" + field.field_id} onClick={() => setMobileFieldId(field.field_id)} className={"grid w-full grid-cols-[auto_minmax(0,1fr)_72px_82px] items-center gap-2 rounded-xl border p-3 text-left " + (checked ? "border-[#9cc4d6] bg-[#e8f3f8]" : "border-slate-200 bg-white")}>
              <span className={"grid h-6 w-6 shrink-0 place-items-center rounded-md border " + (checked ? "border-[#176b9b] bg-[#176b9b] text-white" : "border-slate-300")}>{checked && <Check className="h-4 w-4" />}</span>
                      <span className="min-w-0 flex-1"><b className="block whitespace-normal text-left text-sm">{field.room_name}</b><small className="block whitespace-normal text-left text-slate-600">{field.description} · {serviceName}</small></span>
              <span className="text-right"><b className="block text-sm">{field.quantity}</b><small className="text-slate-500">sq ft</small></span>
              <span className="rounded-lg border bg-white px-2 py-1.5 text-center text-xs font-bold">{item.coats || 1} coat{Number(item.coats || 1) === 1 ? "" : "s"}</span>
            </button>
          );
        })}
      </div>
      {mobileField && mobileItem && (
        <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/60 md:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileFieldId(null); }}>
          <section role="dialog" aria-modal="true" aria-label="Edit selected area field" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-white p-4 pb-6 shadow-2xl">
            <header className="mb-4 flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-[#176b9b]">Selected area field</p><h2 className="text-lg font-bold">{mobileField.room_name}</h2><p className="text-sm text-slate-500">{mobileField.description} · {mobileField.quantity} sq ft</p></div><button type="button" onClick={() => setMobileFieldId(null)} className="rounded-xl border p-2.5"><X className="h-5 w-5" /></button></header>
            <label className="flex items-center gap-3 rounded-xl border p-4 font-semibold"><input type="checkbox" checked={selectedFieldIds.includes(mobileField.field_id)} onChange={() => toggle(mobileField.field_id)} />Include this field in quotation</label>
            <label className="mt-4 block text-sm font-semibold">Type of service
              <select value={mobileItem.service_category || ""} onChange={(event) => { updateFieldItem(mobileField.field_id, "service_category", event.target.value); updateFieldItem(mobileField.field_id, "paint_type", ""); if (!selectedFieldIds.includes(mobileField.field_id)) toggle(mobileField.field_id); }} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3"><option value="">Select type of service</option>{serviceCategories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
            </label>
            <label className="mt-4 block text-sm font-semibold">No. of coats
              <select value={mobileItem.coats || 1} onChange={(event) => { updateFieldItem(mobileField.field_id, "coats", event.target.value); if (!selectedFieldIds.includes(mobileField.field_id)) toggle(mobileField.field_id); }} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3">{[1,2,3,4,5,6].map((coat) => <option key={coat} value={coat}>{coat}</option>)}</select>
            </label>
            <MaterialSelections item={mobileItem} categories={serviceCategories} products={paintTypes} brands={brands} update={(values) => updateFieldMaterial(mobileField.field_id, values)} />
            <button type="button" onClick={() => setMobileFieldId(null)} className="mt-5 w-full rounded-xl bg-[#176b9b] px-5 py-3 font-bold text-white">Update selection</button>
          </section>
        </div>
      )}
    </div>
  );
}

function MeasuredRateGroup({ title, lines, masters, updateRate, editLine }) {
  return <section className="quotation-measured-rates overflow-hidden rounded-xl border border-slate-200 bg-white">
    <header className="bg-[#245b75] text-white">
      <div className="flex items-center justify-between px-4 py-3"><h3 className="text-sm font-bold">{title}</h3><span className="rounded-full bg-white/15 px-2 py-1 text-xs font-bold">{lines.length}</span></div>
      <div className="quotation-rate-columns" aria-hidden="true">{["Sl.", "Type of service", "Room / Area", "Product / Brand", "Description / treatment", "Qty", "Coats", "Rate (₹)", "Amount (₹)", "Edit"].map((label) => <span key={label}>{label}</span>)}</div>
    </header>
    <div className="divide-y divide-slate-100">{lines.map(({ item, index, serial }) => {
      const name = item.custom_area_name || (item.surface_type === "WALL" ? (lines.some(({ item: surface }) => surface.parent_field_id === item.field_id) ? "Normal Walls" : "All Walls") : item.surface_type === "CEILING" ? "Ceiling" : item.description);
      const brand = masters.brands.find((entry) => String(entry.id) === String(item.paint_brand))?.name || item.custom_brand || "Not selected";
      const product = masters.paintTypes.find((entry) => String(entry.id) === String(item.paint_type))?.name || item.custom_product_type || "Not selected";
      const service = masters.categories.find((entry) => String(entry.id) === String(item.service_category))?.name || item.custom_service_category || "Not selected";
      const missing = missingQuotationFields(item).filter((field) => field !== "Rate");
      const area = Number(item.quantity).toLocaleString("en-IN", { maximumFractionDigits: 2 });
      const unit = masters.units.find((entry) => String(entry.id) === String(item.unit))?.name || "sqft";
      return <div key={item.field_id} className="quotation-rate-entry">
        <div className="quotation-rate-row">
          <div className="quotation-rate-serial"><span className="quotation-rate-mobile-label">Sl.</span><span>{serial}</span></div>
          <div className="quotation-rate-service"><span className="quotation-rate-mobile-label">Type of service</span><span className="font-semibold">{service}</span></div>
          <div className="quotation-rate-room"><span className="quotation-rate-mobile-label">Room / Area</span><span className="block font-bold text-[#193750]">{item.room_name || title}</span><span className="mt-1 block text-xs text-slate-500">{name}</span></div>
          <div className="quotation-rate-product"><span className="quotation-rate-mobile-label">Product / Brand</span><span className="block font-semibold">{product}</span><span className="mt-1 block text-xs text-slate-500">{brand}</span></div>
          <div className="quotation-rate-description"><span className="quotation-rate-mobile-label">Description / treatment</span><span>{item.description || "Not added"}</span></div>
          <div className="quotation-rate-area"><span className="quotation-rate-mobile-label">Qty</span><span className="font-bold tabular-nums">{area}</span><small className="block">{unit}</small></div>
          <div className="quotation-rate-coats"><span className="quotation-rate-mobile-label">Coats</span><span>{item.coats || 1}</span></div>
          <label className="quotation-rate-input"><span className="quotation-rate-mobile-label">Rate (₹)</span><input type="number" min="0" step="0.01" inputMode="decimal" value={item.rate ?? ""} placeholder="Rate" aria-label={`${title}, ${name}, rate in rupees`} onChange={(event) => updateRate(index, event.target.value)} /></label>
          <div className="quotation-rate-amount"><span className="quotation-rate-mobile-label">Amount (₹)</span><span className="font-extrabold text-[#176b9b]">{money(Number(item.quantity) * Number(item.rate || 0))}</span></div>
          <button type="button" className="quotation-rate-edit" aria-label={`Edit ${title}, ${name}`} onClick={() => editLine(index)}><Pencil size={16} /><span className="quotation-rate-edit-text">Edit</span></button>
        </div>
        {missing.length > 0 && <p className="px-4 pb-3 text-xs font-semibold text-red-700">Required: {missing.join(", ")}</p>}
      </div>;
    })}</div>
  </section>;
}

function AreaFieldGroup({ title, fields, selectedFieldIds, toggle, items, masters, updateFieldMaterial, specialWalls = [], onAddSpecial, onEditSpecial }) {
  return (
    <section className="quotation-surface-card overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="quotation-surface-header">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="truncate text-sm font-bold">{title}</h3>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold">{fields.length}</span>
        </div>
        {fields.length > 0 && <div className="quotation-surface-columns" aria-hidden="true"><span>Surface</span><span className="text-right">Area</span><div className="quotation-surface-materials"><span>Type of service</span><span>Brand</span><span>Product</span><span>Paint Coats</span></div></div>}
      </header>
      {fields.length ? <div className="divide-y divide-slate-100">
        {fields.map((field) => {
          const checked = selectedFieldIds.includes(field.field_id);
          const item = items.find((entry) => entry.field_id === field.field_id) || field;
          const name = field.custom_area_name || (field.surface_type === "WALL" ? (specialWalls.some((wall) => wall.parent_field_id === field.field_id) ? "Normal Walls" : "All Walls") : field.surface_type === "CEILING" ? "Ceiling" : field.description);
          return <div key={field.field_id} className={`quotation-surface-row ${checked ? "is-selected" : ""}`}>
            <div className="quotation-surface-name">
              <label className="quotation-surface-check"><input type="checkbox" checked={checked} onChange={() => toggle(field.field_id)} aria-label={`Select ${name}`} className="h-4 w-4 accent-[#176b9b]" /></label>
              <button type="button" className="quotation-surface-title" onClick={() => field.parent_field_id ? onEditSpecial?.(specialWalls.find((wall) => wall.field_id === field.field_id)) : toggle(field.field_id)}>{name}</button>
              {field.parent_field_id && <button type="button" className="quotation-surface-edit" aria-label={`Edit ${name}`} onClick={() => onEditSpecial?.(specialWalls.find((wall) => wall.field_id === field.field_id))}><Pencil size={16} /></button>}
            </div>
            <span className="quotation-surface-area">{Number(field.quantity).toLocaleString("en-IN", { maximumFractionDigits: 2 })} <small>sqft</small></span>
            <MaterialSelections inline item={item} categories={masters.categories} products={masters.paintTypes} brands={masters.brands} update={(values) => updateFieldMaterial(field.field_id, values)} />
          </div>;
        })}
      </div> : <p className="p-4 text-sm text-amber-700">No saved Area Calculation for this room.</p>}
      {onAddSpecial && fields.some((field) => field.surface_type === "WALL") && <div className="flex flex-wrap gap-2 border-t p-3"><button type="button" className="min-h-11 rounded-xl border px-4 font-bold text-[#176b9b]" onClick={(event) => event.currentTarget.closest("section").querySelector("select")?.focus()}>Assign Products</button><button type="button" onClick={onAddSpecial} className="min-h-11 rounded-xl bg-[#e8f3f8] px-4 font-bold text-[#176b9b]">+ Add Special Wall</button></div>}
    </section>
  );
}
function groupPreviewLines(items, savedRooms) {
  const grouped = new Map();
  items.forEach((source) => {
    const item = { ...source };
    const room = savedRooms.find((entry) => String(entry.id) === String(item.property_room_id || item.room_id || ""));
    const included = item.included_areas?.length
      ? item.included_areas
      : [`${item.room_name || room?.name || "General"}${item.field_id ? ` — ${item.description || "Work"}` : ""}`];
    const key = JSON.stringify([item.service_category, item.custom_service_category, item.service_type, item.paint_type, item.custom_product_type, item.paint_brand, item.custom_brand, item.color, item.description, item.coats, item.unit, item.custom_unit, item.rate, item.calculation_method, item.is_additional_service, item.specification_details?.assignment_id]);
    const current = grouped.get(key);
    if (!current) grouped.set(key, { ...item, quantity: Number(item.quantity) || 0, included_areas: [...new Set(included)] });
    else {
      current.quantity += Number(item.quantity) || 0;
      current.included_areas = [...new Set([...current.included_areas, ...included])];
    }
  });
  return [...grouped.values()];
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
    <label className={label}><span className="quotation-material-label">Type of service</span><select value={item.service_category || ""} onChange={(event) => update({ service_category: event.target.value, custom_service_category: "", paint_type: "" })} className={control}>{!item.service_category && <option value="">Select service</option>}{categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label className={label}><span className="quotation-material-label">Brand</span><select value={item.paint_brand || ""} onChange={(event) => update({ paint_brand: event.target.value })} className={control}><option value="">Select brand</option>{brands.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label className={label}><span className="quotation-material-label">Product</span><select value={item.paint_type || ""} onChange={(event) => {
      const product = products.find((entry) => String(entry.id) === event.target.value);
      update({ paint_type: event.target.value, ...(product?.service_category ? { service_category: product.service_category, custom_service_category: "" } : {}) });
    }} className={control}><option value="">Select product</option>{products.filter((entry) => !item.service_category || !entry.service_category || String(entry.service_category) === String(item.service_category)).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
    <label className={label}><span className="quotation-material-label">Paint Coats</span><select value={item.coats || 1} onChange={(event) => update({ coats: Number(event.target.value) })} className={control}>{[1,2,3,4,5,6].map((coats) => <option key={coats} value={coats}>{coats}</option>)}</select></label>
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
