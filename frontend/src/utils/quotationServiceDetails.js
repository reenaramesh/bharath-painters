const masterName = (entries, id) => entries?.find(entry => String(entry.id) === String(id))?.name;
export const quotationLineKey = (item, index) => item.id ? `saved-${item.id}` : item.field_id ? `field-${item.field_id}` : `new-${index}`;

// Shared display values only; never changes master IDs or saved specifications.
export function quotationServiceDetails(item, masters = {}) {
  const details = item.specification_details || {};
  const rooms = [...new Set((details.contributions || []).filter(entry => Number(entry.quantity) > 0).map(entry => entry.room_name).filter(Boolean))];
  const surfaces = (details.surfaces || [details.surface]).filter(value => typeof value === 'string' && value);
  return {
    roomArea: rooms.join(', ') || quotationRoomAreaLabel(item) || details.room_name || 'General',
    surface: surfaces.map(surfaceLabel).join(' + '),
    category: masterName(masters.categories, item.service_category) || item.service_category_name || item.custom_service_category,
    service: masterName(masters.services, item.service_type) || item.service_type_name || item.custom_service_type,
    description: item.description,
    product: masterName(masters.paintTypes, item.paint_type) || item.paint_type_name || item.custom_product_type,
    brand: masterName(masters.brands, item.paint_brand) || item.paint_brand_name || item.custom_brand,
    coats: item.coats ?? 1,
    unit: masterName(masters.units, item.unit) || item.unit_name || item.custom_unit,
  };
}
import { quotationRoomAreaLabel, surfaceLabel } from './groupedQuotation.js';
