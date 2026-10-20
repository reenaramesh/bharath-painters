import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnfinishedLumpSumItem, retainedItemValidationMessage, clearItemValidationMessage, missingQuotationFields } from './quotationItemValidation.js';

const complete = { lumpsum_item_pending: true, custom_service_category: 'Painting', room_name: 'Bedroom', description: 'Walls', custom_unit: 'Sqft', quantity: 2, rate: 500, custom_product_type: 'Emulsion' };

test('completed recovered item is included despite retained pending flag', () => {
  assert.equal(isUnfinishedLumpSumItem(complete), false);
  assert.equal(retainedItemValidationMessage([complete]), '');
});

test('incomplete item reports the actual missing fields', () => {
  const item = { ...complete, custom_unit: '', rate: '' };
  assert.equal(isUnfinishedLumpSumItem(item), true);
  assert.equal(retainedItemValidationMessage([item]), 'Line 1 (Bedroom) needs: MOU, Rate.');
});

test('painting product remains required and master selections are supported', () => {
  assert.equal(isUnfinishedLumpSumItem({ ...complete, custom_product_type: '' }), true);
  assert.equal(isUnfinishedLumpSumItem({ ...complete, service_category: 1, paint_type: 2, custom_service_category: '', custom_product_type: '' }, { categories: [{ id: 1, name: 'Painting' }] }), false);
});

test('clear obsolete item alerts without suppressing save errors', () => {
  assert.equal(clearItemValidationMessage('Finish the retained item using Add Item, or delete it, before continuing or saving.'), '');
  assert.equal(clearItemValidationMessage('Line 1 (Bedroom) needs: Rate.'), '');
  assert.equal(clearItemValidationMessage('Draft save failed. Try again.'), 'Draft save failed. Try again.');
});

test('existing saved legacy line exemptions are preserved', () => {
  assert.deepEqual(missingQuotationFields({ id: 5, description: 'Legacy work', quantity: 1, rate: 0 }), []);
});
