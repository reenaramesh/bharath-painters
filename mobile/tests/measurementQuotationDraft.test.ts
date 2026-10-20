import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMeasurementQuotationPayload, validateMeasurementQuotationDraft, type MeasurementQuotationDraft } from '../src/core/measurementQuotationDraft.ts';

const categories = [{ id: 8, name: 'Painting' }, { id: 9, name: 'Texture' }];
const products = [{ id: 3, name: 'Interior Emulsion', service_category: 8 }];
const draft: MeasurementQuotationDraft = {
  customer: '21', property: '32', measurement: '44',
  scopes: [{ workArea: 'INTERIOR', surfaceType: 'WALL', serviceCategory: '8', paintType: '3', paintBrand: '5', rate: '28' }],
  discountMode: 'OVERALL', discountType: 'FIXED', discountValue: '0', gstMode: 'GST_EXTRA', gstPercentage: '18', notes: '  review  ',
};
const firstScope = draft.scopes[0]!;
const rooms = [{ id: 12, name: 'Hall', length: '10', width: '8', height: '9' }, { id: 13, name: 'Bedroom', height: 9 }];
const surfaces = [
  { id: 100, room: 12, name: 'Wall 1', work_area: 'INTERIOR' as const, surface_type: 'WALL' as const, net_area: '90.50' },
  { id: 101, room: 13, name: 'Wall 1', work_area: 'INTERIOR' as const, surface_type: 'WALL' as const, net_area: '80.25' },
  { id: 102, room: 12, name: 'Exterior Wall 1', work_area: 'EXTERIOR' as const, surface_type: 'WALL' as const, net_area: '70.00' },
  { id: 103, room: 12, name: 'Ceiling', work_area: 'INTERIOR' as const, surface_type: 'CEILING' as const, net_area: '80.00' },
];

test('requires valid customer, property, saved measurement and grouped work selections', () => {
  assert.equal(validateMeasurementQuotationDraft(draft, categories, products), '');
  assert.match(validateMeasurementQuotationDraft({ ...draft, scopes: [] }, categories, products), /at least one/);
  assert.match(validateMeasurementQuotationDraft({ ...draft, scopes: [{ ...firstScope, serviceCategory: '' }] }, categories, products), /category/);
  assert.match(validateMeasurementQuotationDraft({ ...draft, scopes: [{ ...firstScope, rate: '-1' }] }, categories, products), /rate/);
  assert.match(validateMeasurementQuotationDraft({ ...draft, scopes: [{ ...firstScope, paintType: '' }] }, categories, products), /paint product/);
});

test('serializes saved areas into grouped interior/exterior quotation sources without recalculating', () => {
  const payload = buildMeasurementQuotationPayload({
    ...draft,
    scopes: [firstScope, { workArea: 'EXTERIOR', surfaceType: 'WALL', serviceCategory: '9', paintType: '', paintBrand: '', rate: '34' }],
  }, { id: 44, version: 7 }, rooms, surfaces);
  assert.equal(payload.quotation_type, 'MEASUREMENT');
  assert.equal(payload.measurement_record, 44);
  assert.equal(payload.rooms.length, 2);
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0]!.quantity, 170.75);
  assert.equal(payload.items[0]!.specification_details.measurement_version, 7);
  assert.deepEqual(payload.items[0]!.specification_details.contributions.map(entry => entry.sources[0]!.surface_id), [100, 101]);
  assert.equal(payload.items[1]!.quantity, 70);
  assert.equal(payload.items[1]!.specification_details.work_area, 'EXTERIOR');
  assert.equal(payload.notes, 'review');
});

test('omits a selected scope with no saved area and keeps category selections separate', () => {
  const payload = buildMeasurementQuotationPayload({ ...draft, scopes: [firstScope, { ...firstScope, workArea: 'EXTERIOR', surfaceType: 'CEILING', paintType: '', paintBrand: '' }] }, { id: 44, version: 7 }, rooms, surfaces);
  assert.equal(payload.items.length, 1);
});
