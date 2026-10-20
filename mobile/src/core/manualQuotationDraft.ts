export type ManualQuotationLine = { description: string; quantity: string; rate: string; discountType?: 'FIXED' | 'PERCENTAGE'; discountValue?: string };
export type ManualQuotationDraft = {
  customer: string;
  property: string;
  items: ManualQuotationLine[];
  discountMode: 'OVERALL' | 'LINE' | 'BOTH';
  discountType: 'FIXED' | 'PERCENTAGE';
  discountValue: string;
  gstMode: 'GST_EXTRA' | 'GST_INCLUDED' | 'NO_GST';
  gstPercentage: string;
  notes: string;
};

const positive = (raw: string) => Number.isFinite(Number(raw)) && Number(raw) > 0;
const nonNegative = (raw: string) => Number.isFinite(Number(raw)) && Number(raw) >= 0;

export function validateManualQuotationDraft(draft: ManualQuotationDraft): string {
  if (!/^\d+$/.test(draft.customer)) return 'Choose a connected customer.';
  if (!/^\d+$/.test(draft.property)) return 'Choose a property for this quotation.';
  if (!draft.items.length) return 'Add at least one quotation line.';
  for (const [index, item] of draft.items.entries()) {
    if (!item.description.trim()) return `Enter a description for line ${index + 1}.`;
    if (!positive(item.quantity)) return `Enter a quantity greater than zero for line ${index + 1}.`;
    if (!nonNegative(item.rate)) return `Enter a valid rate for line ${index + 1}.`;
    if (!nonNegative(item.discountValue || '0') || (item.discountType === 'PERCENTAGE' && Number(item.discountValue) > 100)) return `Enter a valid discount for line ${index + 1}.`;
  }
  if (!nonNegative(draft.discountValue)) return 'Enter a valid discount amount.';
  if (draft.gstMode !== 'NO_GST' && !nonNegative(draft.gstPercentage)) return 'Enter a valid GST percentage.';
  return '';
}

/** Serialize user inputs only. The existing Django quotation serializer calculates all amounts. */
export function buildManualQuotationPayload(draft: ManualQuotationDraft) {
  return {
    customer: Number(draft.customer),
    property: Number(draft.property),
    quotation_type: 'MANUAL_LUMPSUM',
    rooms: [],
    gst_mode: draft.gstMode,
    gst_percentage: draft.gstMode === 'NO_GST' ? '0' : draft.gstPercentage,
    discount_mode: draft.discountMode,
    discount_type: draft.discountType,
    discount_value: draft.discountValue,
    notes: draft.notes.trim(),
    items: draft.items.map(item => ({
      description: item.description.trim(),
      calculation_method: 'MANUAL',
      quantity: item.quantity,
      rate: item.rate,
      unit: null,
      custom_unit: 'Job',
      discount_type: item.discountType || 'FIXED',
      discount_value: item.discountValue || '0',
    })),
  };
}
