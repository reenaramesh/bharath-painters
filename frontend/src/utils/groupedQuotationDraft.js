import { assignmentQuotationItems } from "./groupedQuotation.js";

const assignmentKinds = new Set(["group", "special", "service"]);
export const hasAssignment = (item) => assignmentKinds.has(item.specification_details?.kind);

export function isGroupedDraft(quotation) {
  return quotation?.status === "DRAFT" && quotation.quotation_type === "MEASUREMENT"
    && Boolean(quotation.measurement_record) && quotation.items?.some(hasAssignment);
}

// Restore the UI from the existing saved specification; do not infer room groups
// from descriptions or generate new assignment IDs on each edit.
export function restoreDraftAssignments(items) {
  const state = { groups: [], specials: [], services: [], rates: {}, discounts: {} };
  items.filter(hasAssignment).forEach((item) => {
    const details = item.specification_details;
    const id = details.assignment_id || `saved-${item.id}`;
    const entry = {
      id, name: details.name || item.description, surface: details.surface, unit: item.unit,
      custom_unit:item.custom_unit || "",
      ...(details.surfaces ? { surfaces:[...details.surfaces] } : {}),
      spec: {
        service_category: item.service_category || "", paint_type: item.paint_type || "",
        service_type:item.service_type || "",
        paint_brand: item.paint_brand || "", description: item.description || "",
        coats: Number(item.coats || 1), primer_coats: Number(details.primer_coats || 0),
      },
    };
    if (details.kind === "group") state.groups.push({ ...entry, room_ids: [...(details.room_ids || [])] });
    else if (details.kind === "special") state.specials.push({ ...entry, exclude_from_standard:details.exclude_from_standard !== false, room_id: details.room_ids?.[0], surface_ids: [...(details.surface_ids || [])] });
    else state.services.push({ ...entry, room_id: details.room_ids?.[0] || "", quantity: Number(item.quantity), unit: item.unit, room_name: item.included_areas?.[0] || "General" });
    state.rates[id] = item.rate;
    state.discounts[id] = { type:item.discount_type || "FIXED", value:item.discount_value ?? 0 };
  });
  return state;
}

export function groupedDraftItems(measurement, state, masters, savedItems, quotationRooms) {
  const savedByAssignment = new Map(savedItems.filter(hasAssignment).map((item) => [item.specification_details.assignment_id || `saved-${item.id}`, item]));
  return assignmentQuotationItems(measurement, state, masters).map((line) => {
    const original = savedByAssignment.get(line.specification_details.assignment_id);
    const selected = [...state.groups,...state.specials,...state.services].find(entry=>entry.id === line.specification_details.assignment_id);
    const room = quotationRooms.find((entry) => String(entry.property_room) === String(line.property_room_id));
    return {
      ...original,
      ...(original?.id ? { id: original.id } : {}), room: room?.id || null,
      ...(line.property_room_id && !room?.id ? { property_room: line.property_room_id } : {}),
      service_category: line.service_category || null, service_type: line.service_type || null,
      paint_type: line.paint_type || null, paint_brand: line.paint_brand || null,
      color: original?.color || null, description: line.description, coats: line.coats,
      included_areas: line.included_areas, specification_details: { ...original?.specification_details, ...line.specification_details },
      calculation_method: line.calculation_method, is_additional_service: line.is_additional_service,
      custom_unit: original?.custom_unit || "", quantity: line.quantity,
      unit: original && original.unit == null && original.custom_unit && !selected?.unit ? null : line.unit || null, rate: Number(line.rate),
      discount_type:line.discount_type, discount_value:line.discount_value,
      promote_to_master:Boolean(line.promote_to_master),
    };
  });
}
