export type MeasurementQuotationRoom = {
  id: number;
  name: string;
  length?: string | number | null;
  width?: string | number | null;
  height?: string | number | null;
  window_count?: string | number | null;
  window_width?: string | number | null;
  window_height?: string | number | null;
  door_count?: string | number | null;
  door_width?: string | number | null;
  door_height?: string | number | null;
};
export type MeasurementQuotationSurface = {
  id: number;
  room: number;
  name: string;
  work_area: 'INTERIOR' | 'EXTERIOR';
  surface_type: 'WALL' | 'CEILING';
  net_area: string | number;
};
export type MeasurementQuotationRecord = { id: number; version: number };
export type MeasurementQuotationScope = {
  workArea: 'INTERIOR' | 'EXTERIOR';
  surfaceType: 'WALL' | 'CEILING';
  serviceCategory: string;
  paintType: string;
  paintBrand: string;
  rate: string;
};
export type MeasurementQuotationDraft = {
  customer: string;
  property: string;
  measurement: string;
  scopes: MeasurementQuotationScope[];
  discountMode: 'OVERALL' | 'LINE' | 'BOTH';
  discountType: 'FIXED' | 'PERCENTAGE';
  discountValue: string;
  gstMode: 'GST_EXTRA' | 'GST_INCLUDED' | 'NO_GST';
  gstPercentage: string;
  notes: string;
};

const finiteNonNegative = (value: string) => Number.isFinite(Number(value)) && Number(value) >= 0;

export function validateMeasurementQuotationDraft(
  draft: MeasurementQuotationDraft,
  categories: { id: number; name: string }[],
  products: { id: number; name: string; service_category?: number | null }[],
): string {
  if (!/^\d+$/.test(draft.customer)) return 'Choose a connected customer.';
  if (!/^\d+$/.test(draft.property)) return 'Choose a property for this quotation.';
  if (!/^\d+$/.test(draft.measurement)) return 'Choose a saved Area Calculation.';
  if (!draft.scopes.length) return 'Select at least one measured work area.';
  const keys = new Set<string>();
  for (const scope of draft.scopes) {
    const key = `${scope.workArea}:${scope.surfaceType}`;
    if (keys.has(key)) return 'Each measured work area can only be selected once.';
    keys.add(key);
    const category = categories.find(row => String(row.id) === scope.serviceCategory);
    if (!category) return 'Choose a service category for each selected work area.';
    const product = products.find(row => String(row.id) === scope.paintType);
    if (scope.paintType && (!product || (product.service_category && String(product.service_category) !== scope.serviceCategory))) return 'Choose a product available for the selected category.';
    if (category.name.toLowerCase().includes('paint') && !product) return 'Choose a paint product for each painting work area.';
    if (!finiteNonNegative(scope.rate)) return 'Enter a valid contractor rate for each selected work area.';
  }
  if (!finiteNonNegative(draft.discountValue) || (draft.discountType === 'PERCENTAGE' && Number(draft.discountValue) > 100)) return 'Enter a valid discount amount.';
  if (draft.gstMode !== 'NO_GST' && !finiteNonNegative(draft.gstPercentage)) return 'Enter a valid GST percentage.';
  return '';
}

const measurementNumber = (value: string | number | null | undefined) => Number(value || 0);

/** Build the existing grouped-measurement API contract from saved net areas only. */
export function buildMeasurementQuotationPayload(
  draft: MeasurementQuotationDraft,
  record: MeasurementQuotationRecord,
  rooms: MeasurementQuotationRoom[],
  surfaces: MeasurementQuotationSurface[],
) {
  const quotationRooms = rooms.map(room => ({
    property_room: room.id,
    name: room.name,
    ...Object.fromEntries(['length', 'width', 'height', 'window_count', 'window_width', 'window_height', 'door_count', 'door_width', 'door_height'].map(key => [key, measurementNumber(room[key as keyof MeasurementQuotationRoom])])),
  }));
  const items = draft.scopes.flatMap((scope, scopeIndex) => {
    const relevant = surfaces.filter(surface => surface.work_area === scope.workArea && surface.surface_type === scope.surfaceType);
    const contributions = rooms.map(room => {
      const sources = relevant.filter(surface => String(surface.room) === String(room.id)).map(surface => {
        const area = Number(surface.net_area);
        return { surface_id: surface.id, name: surface.name, original_area: area, quantity: area };
      });
      return { room_id: room.id, room_name: room.name, measurement_record: record.id, measurement_version: record.version, original_area: Number(sources.reduce((sum, source) => sum + source.original_area, 0).toFixed(2)), quantity: Number(sources.reduce((sum, source) => sum + source.quantity, 0).toFixed(2)), sources };
    }).filter(contribution => contribution.sources.length);
    const quantity = Number(contributions.reduce((sum, contribution) => sum + contribution.quantity, 0).toFixed(2));
    if (!quantity || !contributions.length) return [];
    const label = `${scope.workArea === 'INTERIOR' ? 'Interior' : 'Exterior'} ${scope.surfaceType === 'WALL' ? 'Walls' : 'Ceiling'}`;
    return [{
      service_category: Number(scope.serviceCategory),
      ...(scope.paintType ? { paint_type: Number(scope.paintType) } : {}),
      ...(scope.paintBrand ? { paint_brand: Number(scope.paintBrand) } : {}),
      description: label,
      coats: 1,
      included_areas: contributions.map(entry => `${entry.room_name} - ${label}: ${entry.quantity} sqft`),
      calculation_method: 'MANUAL',
      is_additional_service: false,
      quantity,
      unit: null,
      custom_unit: 'sq ft',
      rate: scope.rate,
      discount_type: 'FIXED',
      discount_value: '0',
      specification_details: {
        schema_version: 1,
        assignment_id: `mobile-${record.id}-${scope.workArea.toLowerCase()}-${scope.surfaceType.toLowerCase()}-${scopeIndex + 1}`,
        kind: 'group',
        name: label,
        work_area: scope.workArea,
        painting_item: true,
        surface: scope.surfaceType,
        measurement_record: record.id,
        measurement_version: record.version,
        room_ids: contributions.map(entry => entry.room_id),
        surface_ids: [],
        contributions,
        primer_coats: 0,
      },
    }];
  });
  return {
    customer: Number(draft.customer),
    property: Number(draft.property),
    quotation_type: 'MEASUREMENT',
    measurement_record: record.id,
    rooms: quotationRooms,
    gst_mode: draft.gstMode,
    gst_percentage: draft.gstMode === 'NO_GST' ? '0' : draft.gstPercentage,
    discount_mode: draft.discountMode,
    discount_type: draft.discountType,
    discount_value: draft.discountValue,
    notes: draft.notes.trim(),
    items,
  };
}
