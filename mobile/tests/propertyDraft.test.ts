import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPropertyPayload, validatePropertyDraft, type PropertyDraft } from '../src/core/propertyDraft.ts';

const validDraft: PropertyDraft = {
  customer: '47', property_type: '2BHK', measurement_type: 'INTERIOR', measurement_unit: 'FEET',
  name: 'Reena Home', flat_number: '12A', block_name: 'A Block', address: 'Main Road',
  city: 'Bengaluru', pincode: '560001', approximate_area: '1200', google_maps_url: '',
};

test('property creation requires a connected customer, project name and address', () => {
  assert.equal(validatePropertyDraft({ ...validDraft, customer: '' }), 'Choose a connected customer.');
  assert.equal(validatePropertyDraft({ ...validDraft, name: '  ' }), 'Enter a property name.');
  assert.equal(validatePropertyDraft({ ...validDraft, address: '  ' }), 'Enter the property address.');
  assert.equal(validatePropertyDraft(validDraft), '');
});

test('property payload contains only supported values and normalizes optional area', () => {
  assert.deepEqual(buildPropertyPayload(validDraft), {
    customer: 47, property_type: '2BHK', measurement_type: 'INTERIOR', measurement_unit: 'FEET',
    name: 'Reena Home', flat_number: '12A', block_name: 'A Block', address: 'Main Road',
    city: 'Bengaluru', pincode: '560001', approximate_area: '1200', google_maps_url: '',
  });
  assert.equal(buildPropertyPayload({ ...validDraft, approximate_area: '' }).approximate_area, null);
});

test('rejects invalid customer IDs, unsupported enum values and invalid area', () => {
  assert.throws(() => buildPropertyPayload({ ...validDraft, customer: 'not-an-id' }), /connected customer/);
  assert.throws(() => buildPropertyPayload({ ...validDraft, property_type: 'WAREHOUSE' }), /property type/);
  assert.throws(() => buildPropertyPayload({ ...validDraft, approximate_area: '-1' }), /area/);
});
