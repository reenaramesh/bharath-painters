export type PropertyDraft = {
  customer: string;
  property_type: string;
  measurement_type: string;
  measurement_unit: string;
  name: string;
  flat_number: string;
  block_name: string;
  address: string;
  city: string;
  pincode: string;
  approximate_area: string;
  google_maps_url: string;
};

export type PropertyPayload = Omit<PropertyDraft, 'customer' | 'approximate_area'> & {
  customer: number;
  approximate_area: string | null;
};

const PROPERTY_TYPES = new Set(['1RK', '1BHK', '2BHK', '3BHK', '4BHK', 'VILLA', 'OFFICE', 'COMMERCIAL', 'INTERIOR', 'EXTERIOR', 'OTHER']);
const MEASUREMENT_TYPES = new Set(['INTERIOR', 'EXTERIOR']);
const MEASUREMENT_UNITS = new Set(['FEET', 'METRES']);

export function validatePropertyDraft(draft: PropertyDraft) {
  if (!Number.isSafeInteger(Number(draft.customer)) || Number(draft.customer) <= 0) return 'Choose a connected customer.';
  if (!draft.name.trim()) return 'Enter a property name.';
  if (!draft.address.trim()) return 'Enter the property address.';
  if (!PROPERTY_TYPES.has(draft.property_type)) return 'Choose a supported property type.';
  if (!MEASUREMENT_TYPES.has(draft.measurement_type)) return 'Choose an area calculation type.';
  if (!MEASUREMENT_UNITS.has(draft.measurement_unit)) return 'Choose an area input unit.';
  if (draft.approximate_area.trim()) {
    const area = Number(draft.approximate_area);
    if (!Number.isFinite(area) || area <= 0) return 'Enter a valid area greater than zero.';
  }
  return '';
}

export function buildPropertyPayload(draft: PropertyDraft): PropertyPayload {
  const error = validatePropertyDraft(draft);
  if (error) throw new Error(error);
  return {
    customer: Number(draft.customer),
    property_type: draft.property_type,
    measurement_type: draft.measurement_type,
    measurement_unit: draft.measurement_unit,
    name: draft.name.trim(),
    flat_number: draft.flat_number.trim(),
    block_name: draft.block_name.trim(),
    address: draft.address.trim(),
    city: draft.city.trim(),
    pincode: draft.pincode.trim(),
    approximate_area: draft.approximate_area.trim() || null,
    google_maps_url: draft.google_maps_url.trim(),
  };
}
