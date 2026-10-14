import { quotationServiceDetails } from './quotationServiceDetails.js';
import { surfaceLabel } from './groupedQuotation.js';

export const quotationItemHeaders = ['Service / Product Category','Room / Area & Surface','Description','Brand / Product','Coats','Sqft','Rate','Total','Actions'];
export function quotationItemPresentation(item, masters = {}, rooms = []) {
  const values = quotationServiceDetails(item, masters);
  const details = item.specification_details || {};
  const named = value => typeof value === 'string' && !/^\d+$/.test(value) ? value : '';
  const room = rooms.find(entry => String(entry.id) === String(item.room));
  let roomName = (details.contributions || []).some(entry => Number(entry.quantity) > 0 && entry.room_name) ? values.roomArea : named(item.room) || room?.name || values.roomArea;
  const surface = values.surface || (item.surface_type ? surfaceLabel(item.surface_type) : '');
  if (surface && roomName.startsWith(`${surface} - `)) roomName = roomName.slice(surface.length + 3);
  const brand = values.brand || item.brand_name || named(item.paint_brand);
  const product = values.product || named(item.paint_type);
  return {
    category: values.category || named(item.service_category) || values.service || item.service || '-',
    roomSurface: [roomName,surface].filter(Boolean).join(' / ') || '-',
    description: details.base_description ?? item.description ?? details.name ?? '-',
    brandProduct: [brand,product].filter(Boolean).join(' / ') || '-',
    product: product || '-',
    surfaceRoom: [surface,roomName].filter(Boolean).join(' - ') || '-',
    coats: item.coats ?? '-',
    quantity: item.quantity, rate: item.rate, total: item.amount,
  };
}
