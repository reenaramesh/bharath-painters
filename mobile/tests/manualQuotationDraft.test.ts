import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManualQuotationPayload, validateManualQuotationDraft, type ManualQuotationDraft } from '../src/core/manualQuotationDraft.ts';

const draft: ManualQuotationDraft = {
  customer: '12', property: '19',
    items: [{ description: 'Interior painting', quantity: '900', rate: '20', discountType: 'PERCENTAGE', discountValue: '5' }],
  discountMode: 'BOTH', discountType: 'FIXED', discountValue: '500', gstMode: 'GST_EXTRA', gstPercentage: '18',
  notes: 'Two coats; final color by customer.',
};
const firstLine = draft.items[0]!;

test('manual quotation requires a connected customer and at least one valid line', () => {
  assert.equal(validateManualQuotationDraft(draft), '');
  assert.match(validateManualQuotationDraft({ ...draft, customer: '' }), /customer/i);
  assert.match(validateManualQuotationDraft({ ...draft, property: '' }), /property/i);
  assert.match(validateManualQuotationDraft({ ...draft, items: [] }), /line/i);
  assert.match(validateManualQuotationDraft({ ...draft, items: [{ ...firstLine, quantity: '0' }] }), /quantity/i);
  assert.match(validateManualQuotationDraft({ ...draft, items: [{ ...firstLine, rate: '-1' }] }), /rate/i);
});

test('manual quotation payload sends inputs for the server to calculate and never calculates totals locally', () => {
  assert.deepEqual(buildManualQuotationPayload(draft), {
    customer: 12, property: 19, quotation_type: 'MANUAL_LUMPSUM', rooms: [],
    gst_mode: 'GST_EXTRA', gst_percentage: '18', discount_mode: 'BOTH', discount_type: 'FIXED', discount_value: '500',
    notes: 'Two coats; final color by customer.',
    items: [{ description: 'Interior painting', calculation_method: 'MANUAL', quantity: '900', rate: '20', unit: null, custom_unit: 'Job', discount_type: 'PERCENTAGE', discount_value: '5' }],
  });
});
