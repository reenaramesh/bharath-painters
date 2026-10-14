import { SERVICE_MASTER_LABELS } from './serviceMasterLabels.js';

// Keep the existing saved-line exceptions and field requirements in one place.
export function missingQuotationFields(item) {
  const missing = [];
  const saved = Number.isInteger(item.id) && item.id > 0;
  if (!saved && !item.service_category && !String(item.custom_service_category || '').trim()) missing.push(SERVICE_MASTER_LABELS.category);
  if (!saved && !item.field_id && !item.property_room_id && !String(item.room_name || '').trim()) missing.push('Room / Area');
  if (!String(item.description || '').trim()) missing.push(SERVICE_MASTER_LABELS.description);
  if (!saved && !item.unit && !String(item.custom_unit || '').trim()) missing.push('MOU');
  if (Number(item.quantity || 0) <= 0) missing.push('Quantity');
  if (item.rate === '' || item.rate === null || item.rate === undefined || !Number.isFinite(Number(item.rate)) || Number(item.rate) < 0) missing.push('Rate');
  return missing;
}

export function missingLumpSumItemFields(item, masters = {}) {
  const missing = missingQuotationFields(item);
  const category = masters.categories?.find(entry => String(entry.id) === String(item.service_category))?.name || item.custom_service_category || '';
  if (category.toLowerCase().includes('paint') && !item.paint_type && !String(item.custom_product_type || '').trim()) missing.push(SERVICE_MASTER_LABELS.productType);
  return missing;
}

// A recovered flag alone must never hide valid input or exclude it from saving.
export const isUnfinishedLumpSumItem = (item, masters) => Boolean(item.lumpsum_item_pending && missingLumpSumItemFields(item, masters).length);

export function retainedItemValidationMessage(items, masters) {
  const index = items.findIndex(item => isUnfinishedLumpSumItem(item, masters));
  return index < 0 ? '' : `Line ${index + 1} (${items[index].room_name || 'service'}) needs: ${missingLumpSumItemFields(items[index], masters).join(', ')}.`;
}

export const clearItemValidationMessage = message => message.startsWith('Finish the retained item') || (message.startsWith('Line ') && message.includes(' needs:')) ? '' : message;
