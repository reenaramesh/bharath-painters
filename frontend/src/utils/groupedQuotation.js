// Shared quotation assignment calculations. Consume saved net_area; never recalculate measurements.
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const same = (left, right) => String(left) === String(right);
export const surfaceLabel = (type) => type.startsWith("OTHER:") ? type.slice(6) : ({ WALL: "Walls", CEILING: "Ceiling", DOOR: "Door", WINDOW: "Window", OTHER: "Other surface" }[type] || type.replaceAll("_", " "));
export const surfaceKey = (surface) => surface.surface_type === "OTHER" ? `OTHER:${String(surface.area_group_name || surface.name || "Other surface").trim()}` : surface.surface_type;
export function surfaceOptions(measurement) {
  return [...new Set(measurement.surfaces.map(surfaceKey))];
}
export function measuredSurfaces(measurement, roomId, surfaceType) {
  return measurement.surfaces.filter((surface) => same(surface.room, roomId) && (surfaceType === "OTHER" ? surface.surface_type === "OTHER" : surfaceKey(surface) === surfaceType));
}
export function roomContribution(measurement, specials, roomId, surfaceType) {
  const measured = measuredSurfaces(measurement, roomId, surfaceType);
  const specialIds = new Set(specials.filter((special) => same(special.room_id, roomId)).flatMap((special) => special.surface_ids.map(String)));
  const sources = measured.map((surface) => {
    const original = Number(surface.net_area);
    if (!Number.isFinite(original) || original < 0) throw new Error("Invalid saved net area.");
    return { surface_id: surface.id, name: surface.name, original_area: original, quantity: surfaceType === "WALL" && specialIds.has(String(surface.id)) ? 0 : original };
  });
  return {
    room_id: roomId,
    room_name: measurement.rooms.find((room) => same(room.id, roomId))?.name || "Unknown room",
    measurement_record: measurement.id, measurement_version: measurement.version,
    original_area: round(sources.reduce((sum, source) => sum + source.original_area, 0)),
    quantity: round(sources.reduce((sum, source) => sum + source.quantity, 0)),
    sources,
  };
}
export function assignedGroup(groups, roomId, surfaceType, editingId) {
  return groups.find((group) => group.id !== editingId && group.surface === surfaceType && group.room_ids.some((id) => same(id, roomId)));
}
export function validateSpec(spec, masters) {
  if (!masters.categories.some((entry) => same(entry.id, spec.service_category))) throw new Error("Select a work type.");
  if (spec.paint_brand && !masters.brands.some((entry) => same(entry.id, spec.paint_brand))) throw new Error("Select a brand.");
  const product = masters.paintTypes.find((entry) => same(entry.id, spec.paint_type));
  if ((spec.paint_type && !product) || (product?.service_category && !same(product.service_category, spec.service_category)) || (!product && masters.categories.find((entry) => same(entry.id, spec.service_category))?.name.toLowerCase().includes("paint"))) throw new Error("Select a product for this work type.");
  if (!Number.isInteger(Number(spec.coats)) || Number(spec.coats) < 1 || Number(spec.coats) > 6) throw new Error("Paint coats must be between 1 and 6.");
  if (!Number.isInteger(Number(spec.primer_coats)) || Number(spec.primer_coats) < 0 || Number(spec.primer_coats) > 6) throw new Error("Primer coats must be between 0 and 6.");
}
export function saveGroup(state, draft, measurement, masters) {
  if (!String(draft.name || "").trim()) throw new Error("Enter a group name.");
  if (!surfaceOptions(measurement).includes(draft.surface)) throw new Error("Select an existing surface.");
  if (!draft.room_ids.length) throw new Error("Select at least one room.");
  if (new Set(draft.room_ids.map(String)).size !== draft.room_ids.length) throw new Error("A room can only be selected once.");
  validateSpec(draft.spec, masters);
  for (const roomId of draft.room_ids) {
    if (!measurement.rooms.some((room) => same(room.id, roomId))) throw new Error("Select an existing room.");
    if (assignedGroup(state.groups, roomId, draft.surface, draft.id)) throw new Error("This room surface is already assigned to another paint group.");
    if (roomContribution(measurement, state.specials, roomId, draft.surface).quantity <= 0) throw new Error("This room has no remaining area for this surface.");
  }
  const group = { id: draft.id, name: draft.name.trim(), surface: draft.surface, room_ids: [...draft.room_ids], spec: { ...draft.spec } };
  return { ...state, groups: state.groups.some((entry) => entry.id === group.id) ? state.groups.map((entry) => entry.id === group.id ? group : entry) : [...state.groups, group] };
}
export function saveSpecial(state, draft, measurement, masters) {
  if (!String(draft.name || "").trim()) throw new Error("Enter a special wall name.");
  if (!draft.surface_ids.length) throw new Error("Select at least one measured wall.");
  if (new Set(draft.surface_ids.map(String)).size !== draft.surface_ids.length) throw new Error("A wall can only be selected once.");
  validateSpec(draft.spec, masters);
  const walls = measuredSurfaces(measurement, draft.room_id, "WALL");
  const used = new Set(state.specials.filter((special) => special.id !== draft.id).flatMap((special) => special.surface_ids.map(String)));
  for (const id of draft.surface_ids) {
    const wall = walls.find((entry) => same(entry.id, id));
    if (!wall) throw new Error("Select a measured wall from this room.");
    if (used.has(String(id))) throw new Error("This measured wall is already assigned to a special surface.");
    if (!(Number(wall.net_area) > 0)) throw new Error("Select a wall with a positive measured area.");
  }
  const special = { id: draft.id, name: draft.name.trim(), room_id: draft.room_id, surface_ids: [...draft.surface_ids], spec: { ...draft.spec } };
  return { ...state, specials: state.specials.some((entry) => entry.id === special.id) ? state.specials.map((entry) => entry.id === special.id ? special : entry) : [...state.specials, special] };
}
export function deleteAssignment(state, id, kind) {
  const key = kind === "special" ? "specials" : kind === "service" ? "services" : "groups";
  const rates = { ...state.rates }; delete rates[id];
  return { ...state, [key]: (state[key] || []).filter((entry) => entry.id !== id), rates };
}
export function specificationLines(measurement, state) {
  const groups = state.groups.map((group) => {
    const contributions = group.room_ids.map((roomId) => roomContribution(measurement, state.specials, roomId, group.surface));
    return { ...group, kind: "group", surface_label: surfaceLabel(group.surface), scope: `${surfaceLabel(group.surface)} - ${contributions.filter((entry) => entry.quantity > 0).map((entry) => entry.room_name).join(", ")}`, quantity: round(contributions.reduce((sum, entry) => sum + entry.quantity, 0)), contributions };
  });
  const specials = state.specials.map((special) => {
    const room = measurement.rooms.find((entry) => same(entry.id, special.room_id));
    const sources = measuredSurfaces(measurement, special.room_id, "WALL").filter((surface) => special.surface_ids.some((id) => same(id, surface.id))).map((surface) => ({ surface_id: surface.id, name: surface.name, original_area: Number(surface.net_area), quantity: Number(surface.net_area) }));
    const quantity = round(sources.reduce((sum, source) => sum + source.quantity, 0));
    return { ...special, kind: "special", surface: "WALL", surface_label: sources.map((source) => source.name).join(", "), scope: `${room.name} - ${special.name}`, quantity, contributions: [{ room_id: room.id, room_name: room.name, measurement_record: measurement.id, measurement_version: measurement.version, quantity, sources }] };
  });
  return [...groups, ...specials, ...(state.services || []).map((service) => ({ ...service, kind: "service", surface_label: service.surface ? surfaceLabel(service.surface) : "Surface", scope: service.room_name || "General", contributions: [], unit: service.unit }))];
}
export function pricedLines(measurement, state) {
  return specificationLines(measurement, state).filter((line) => line.quantity > 0).map((line) => {
    const entered = state.rates[line.id];
    const valid = entered !== "" && entered !== undefined && entered !== null && Number.isFinite(Number(entered)) && Number(entered) >= 0;
    return { ...line, rate: entered ?? "", rate_valid: valid, amount: valid ? round(line.quantity * Number(entered)) : 0 };
  });
}
export function toQuotationItems(measurement, state, masters) {
  const lines = pricedLines(measurement, state);
  if (!lines.length || lines.some((line) => !line.rate_valid)) throw new Error("Enter a valid rate for every priced line.");
  return lines.map((line) => ({
    service_category: Number(line.spec.service_category), ...(line.spec.paint_brand ? { paint_brand: Number(line.spec.paint_brand) } : {}), ...(line.spec.paint_type ? { paint_type: Number(line.spec.paint_type) } : {}),
    description: [line.name, line.spec.description, masters.paintTypes.find((entry) => same(entry.id, line.spec.paint_type))?.name, line.spec.finish && `Finish: ${line.spec.finish}`, line.kind !== "service" && `Primer ${line.spec.primer_coats} + Paint ${line.spec.coats}`, line.spec.notes].filter(Boolean).join(" | "),
    quantity: line.quantity, coats: Number(line.spec.coats || 1), unit: line.unit || masters.units[0].id, rate: Number(line.rate), calculation_method: "MANUAL", is_additional_service: line.kind === "service",
    included_areas: line.kind === "service" ? [line.room_name || "General"] : line.contributions.map((entry) => `${entry.room_name} - ${line.kind === "special" ? line.name : surfaceLabel(line.surface)}: ${entry.quantity} sqft`),
  }));
}

export function saveGeneralService(state, draft, measurement, masters) {
  const category = masters.categories.find((entry) => same(entry.id, draft.spec.service_category));
  if (!category) throw new Error("Select a general service.");
  if (draft.surface && ![...surfaceOptions(measurement), "OTHER"].includes(draft.surface)) throw new Error("Select an existing surface.");
  if (draft.spec.paint_type) {
    const product = masters.paintTypes.find((entry) => same(entry.id, draft.spec.paint_type));
    if (!product || !same(product.service_category, draft.spec.service_category)) throw new Error("Select a product for this service.");
  }
  if (!String(draft.spec.description || "").trim()) throw new Error("Enter a description of the work.");
  if (!Number.isFinite(Number(draft.quantity)) || Number(draft.quantity) <= 0) throw new Error("Enter a quantity greater than zero.");
  if (!masters.units.some((entry) => same(entry.id, draft.unit))) throw new Error("Select a unit.");
  const room = draft.room_id ? measurement.rooms.find((entry) => same(entry.id, draft.room_id)) : null;
  if (draft.room_id && !room) throw new Error("Select an existing room.");
  const line = { ...draft, name: category.name, quantity: Number(draft.quantity), unit: Number(draft.unit), room_name: room?.name || "General", spec: { ...draft.spec } };
  const services = state.services || [];
  return { ...state, services: services.some((entry) => entry.id === draft.id) ? services.map((entry) => entry.id === draft.id ? line : entry) : [...services, line] };
}

export function assignmentQuotationItems(measurement, state, masters) {
  const unit = masters.units.find((entry) => /^(sq\.?\s*(?:ft|feet)|sqft|square feet|square foot|sft|sq ft)$/i.test(entry.name.trim())) || masters.units[0];
  return specificationLines(measurement, state).filter((line) => line.quantity > 0).map((line) => {
    const room = line.kind === "service" ? measurement.rooms.find((entry) => same(entry.id, line.room_id)) : null;
    const description = String(line.spec.description || masters.paintTypes.find((entry) => same(entry.id, line.spec.paint_type))?.name || line.name).trim();
    return {
      field_id: `assignment-${line.id}`, room_name: line.name, room_id: room?.id || null,
      property_room_id: room?.id || "", room_index: "", scope: line.kind === "service" ? "room" : "group",
      service_category: line.spec.service_category || "", paint_type: line.spec.paint_type || "", paint_brand: line.spec.paint_brand || "",
      description, promote_to_master: Boolean(line.spec.promote_to_master), coats: Number(line.spec.coats || 1), quantity: line.quantity, unit: line.unit || unit?.id || "",
      rate: state.rates[line.id] ?? "", calculation_method: "MANUAL", is_additional_service: line.kind === "service",
      surface_type: line.surface || "OTHER", custom_area_name: line.name,
      included_areas: line.kind === "service" ? [room?.name || "General"] : line.contributions.filter((entry) => entry.quantity > 0).map((entry) => `${entry.room_name} - ${line.name}: ${entry.quantity} sqft`),
      specification_details: {
        schema_version: 1, assignment_id: line.id, kind: line.kind, name: line.name,
        surface: line.surface || null, measurement_record: measurement.id, measurement_version: measurement.version,
        room_ids: line.room_ids || (line.room_id ? [line.room_id] : []), surface_ids: line.surface_ids || [],
        primer_coats: Number(line.spec.primer_coats || 0), contributions: line.contributions,
      },
    };
  });
}

export function groupedQuotationRoom(room) {
  // Quotation snapshot only: measured-room dimensions may be null when walls
  // were measured individually. Group pricing always uses saved surface areas.
  const fields = ["length", "width", "height", "window_count", "window_width", "window_height", "door_count", "door_width", "door_height"];
  return { property_room: room.id || null, name: room.name, ...Object.fromEntries(fields.map((field) => [field, Number(room[field] || 0)])) };
}

export function quotationRoomAreaLabel(item) {
  const details = item.specification_details;
  if (["group", "special"].includes(details?.kind)) {
    const rooms = [...new Set((details.contributions || []).filter((entry) => Number(entry.quantity) > 0).map((entry) => entry.room_name).filter(Boolean))];
    const surface = details.kind === "special" ? details.name : surfaceLabel(details.surface || "OTHER");
    if (rooms.length) return `${surface} - ${rooms.join(", ")}`;
  }
  return (item.included_areas || []).map((name) => name.replace(/\s*(?:[:\u00b7\u2013\u2014-]\s*|\(\s*)?\d[\d,]*(?:\.\d+)?\s*(?:sq\.?\s*ft\.?|sqft|sft|square\s+(?:feet|foot))\s*\)?\s*$/i, "").trim()).filter(Boolean).join(", ") || item.room_name || "";
}
