import test from "node:test";
import assert from "node:assert/strict";
import { measurement, masters, defaultSpec, exampleAssignments } from "./fixtures.js";
import { assignedGroup, deleteAssignment, pricedLines, roomContribution, saveGroup, saveSpecial, specificationLines, surfaceOptions, toQuotationItems, saveGeneralService } from "./model.js";

const empty = () => ({ groups: [], specials: [], rates: {} });
const group = (overrides = {}) => ({ id: "bedrooms", name: "Bedrooms Walls", surface: "WALL", room_ids: [1,2,3], spec: { ...defaultSpec }, ...overrides });
const special = (overrides = {}) => ({ id: "texture", name: "Texture Wall", room_id: 1, surface_ids: [14], spec: { ...defaultSpec, service_category: 2, paint_type: 4 }, ...overrides });
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test("room summaries use existing net_area rather than dimensions or gross area", () => {
  const snapshot = structuredClone(measurement);
  snapshot.surfaces[0] = { ...snapshot.surfaces[0], gross_area: "999", deduction_area: "99", length: "999", breadth: "999", net_area: "120" };
  assert.equal(roomContribution(snapshot, [], 1, "WALL").quantity, 470);
  assert.equal(roomContribution(snapshot, [], 1, "CEILING").quantity, 130);
  assert.equal(roomContribution(snapshot, [], 2, "WALL").quantity, 420);
  assert.deepEqual(surfaceOptions(snapshot), ["WALL", "CEILING", "DOOR"]);
});

test("a group records each room and surface reference and totals 1300 sqft", () => {
  const state = saveGroup(empty(), group(), measurement, masters);
  const line = specificationLines(measurement, state)[0];
  assert.equal(line.quantity, 1300);
  assert.deepEqual(line.contributions.map((entry) => entry.quantity), [470,420,410]);
  assert.deepEqual(line.contributions[0].sources.map((entry) => entry.surface_id), [11,12,13,14]);
  assert.equal(line.contributions[0].measurement_record, 901);
  assert.equal(line.contributions[0].measurement_version, 3);
});

test("a room's walls cannot be assigned to two full-wall groups", () => {
  const state = saveGroup(empty(), group(), measurement, masters);
  assert.equal(assignedGroup(state.groups, 1, "WALL").id, "bedrooms");
  assert.throws(() => saveGroup(state, group({ id: "duplicate", room_ids: [1] }), measurement, masters), /already assigned/);
});

test("walls and ceiling can be assigned separately and edits exclude their own group", () => {
  const initial = saveGroup(empty(), group(), measurement, masters);
  const ceilings = saveGroup(initial, group({ id: "ceilings", surface: "CEILING", room_ids: [1,2] }), measurement, masters);
  assert.equal(specificationLines(measurement, ceilings)[1].quantity, 250);
  const edited = saveGroup(ceilings, group({ room_ids: [1,2], name: "Two Bedrooms" }), measurement, masters);
  assert.equal(edited.groups.length, 2);
  assert.equal(specificationLines(measurement, edited)[0].quantity, 890);
  assert.equal(assignedGroup(edited.groups, 3, "WALL"), undefined);
});

test("special Wall 4 reduces only the normal paint group, preserving measurements", () => {
  const snapshot = freeze(structuredClone(measurement));
  const before = JSON.stringify(snapshot);
  const initial = saveGroup(empty(), group(), snapshot, masters);
  const state = saveSpecial(initial, special(), snapshot, masters);
  const lines = specificationLines(snapshot, state);
  assert.equal(lines[0].quantity, 1175);
  assert.equal(lines[0].contributions[0].original_area, 470);
  assert.equal(lines[0].contributions[0].quantity, 345);
  assert.equal(lines[1].quantity, 125);
  assert.equal(lines[1].surface_label, "Wall 4");
  assert.equal(lines[0].quantity + lines[1].quantity, 1300);
  assert.equal(JSON.stringify(snapshot), before);
});

test("special walls created before groups reduce their initial contribution", () => {
  const specialFirst = saveSpecial(empty(), special(), measurement, masters);
  const state = saveGroup(specialFirst, group(), measurement, masters);
  assert.equal(specificationLines(measurement, state)[0].quantity, 1175);
});

test("editing and deleting special walls restore and reallocate group area", () => {
  const initial = saveSpecial(saveGroup(empty(), group(), measurement, masters), special(), measurement, masters);
  const changed = saveSpecial(initial, special({ surface_ids: [13] }), measurement, masters);
  assert.equal(changed.specials.length, 1);
  assert.equal(specificationLines(measurement, changed)[0].quantity, 1190);
  assert.equal(specificationLines(measurement, changed)[1].quantity, 110);
  const deleted = deleteAssignment(changed, "texture", "special");
  assert.equal(specificationLines(measurement, deleted)[0].quantity, 1300);
  assert.equal(specificationLines(measurement, deleted).length, 1);
});

test("multiple special walls do not double count area", () => {
  const initial = saveSpecial(saveGroup(empty(), group(), measurement, masters), special(), measurement, masters);
  const state = saveSpecial(initial, special({ id: "accent", name: "Accent Wall", surface_ids: [11] }), measurement, masters);
  const lines = specificationLines(measurement, state);
  assert.deepEqual(lines.map((line) => line.quantity), [1055,125,120]);
  assert.equal(lines.reduce((sum, line) => sum + line.quantity, 0), 1300);
  assert.throws(() => saveSpecial(state, special({ id: "duplicate" }), measurement, masters), /already assigned/);
});

test("special wall selection rejects another room, ceiling and duplicate wall IDs", () => {
  assert.throws(() => saveSpecial(empty(), special({ surface_ids: [21] }), measurement, masters), /from this room/);
  assert.throws(() => saveSpecial(empty(), special({ surface_ids: [15] }), measurement, masters), /from this room/);
  assert.throws(() => saveSpecial(empty(), special({ surface_ids: [14,14] }), measurement, masters), /only be selected once/);
});

test("group input validates surface, rooms, product, brand and coats", () => {
  assert.throws(() => saveGroup(empty(), group({ room_ids: [] }), measurement, masters), /at least one room/);
  assert.throws(() => saveGroup(empty(), group({ room_ids: [1,1] }), measurement, masters), /only be selected once/);
  assert.throws(() => saveGroup(empty(), group({ room_ids: [999] }), measurement, masters), /existing room/);
  assert.throws(() => saveGroup(empty(), group({ surface: "UNKNOWN" }), measurement, masters), /existing surface/);
  assert.throws(() => saveGroup(empty(), group({ spec: { ...defaultSpec, paint_type: 4 } }), measurement, masters), /product for this work type/);
  assert.throws(() => saveGroup(empty(), group({ spec: { ...defaultSpec, paint_brand: 999 } }), measurement, masters), /brand/);
  assert.throws(() => saveGroup(empty(), group({ spec: { ...defaultSpec, coats: 0 } }), measurement, masters), /Paint coats/);
});

test("zero remaining normal area is not priced or allowed in a new group", () => {
  const state = saveSpecial(saveGroup(empty(), group({ room_ids: [1] }), measurement, masters), special({ surface_ids: [11,12,13,14] }), measurement, masters);
  assert.equal(specificationLines(measurement, state)[0].quantity, 0);
  assert.equal(pricedLines(measurement, state).length, 1);
  assert.throws(() => saveGroup(deleteAssignment(state, "bedrooms", "group"), group({ room_ids: [1] }), measurement, masters), /no remaining area/);
});

test("sample rates reproduce attachment amounts without changing quantities for coats", () => {
  const state = exampleAssignments();
  const lines = pricedLines(measurement, state);
  assert.deepEqual(lines.map((line) => line.quantity), [1175,970,300,125]);
  assert.deepEqual(lines.map((line) => line.amount), [11750,17460,6000,5625]);
  assert.equal(lines.reduce((sum, line) => sum + line.amount, 0), 40835);
});

test("pricing accepts zero and rejects missing, negative and invalid rates", () => {
  const state = saveGroup(empty(), group(), measurement, masters);
  for (const rate of [undefined, "", -1, "bad", Infinity]) {
    const entered = { ...state, rates: { bedrooms: rate } };
    assert.equal(pricedLines(measurement, entered)[0].rate_valid, false);
    assert.throws(() => toQuotationItems(measurement, entered, masters), /valid rate/);
  }
  assert.equal(pricedLines(measurement, { ...state, rates: { bedrooms: "0" } })[0].rate_valid, true);
});

test("quotation-shaped output retains included room contributions and existing item fields", () => {
  const items = toQuotationItems(measurement, exampleAssignments(), masters);
  assert.deepEqual(items[0].included_areas, ["Bedroom 1 - Walls: 345 sqft", "Bedroom 2 - Walls: 420 sqft", "Bedroom 3 - Walls: 410 sqft"]);
  assert.equal(items[0].quantity, 1175);
  assert.equal(items[0].calculation_method, "MANUAL");
  assert.equal(items[0].coats, 2);
  assert.equal(items[3].paint_type, 4);
  assert.match(items[3].included_areas[0], /Texture Wall: 125 sqft/);
  assert.equal("rate" in specificationLines(measurement, exampleAssignments())[0], false);
});

test("assignment edits and deletion preserve unrelated groups, specials and rates", () => {
  const original = freeze(exampleAssignments());
  const edited = saveGroup(original, { ...original.groups[0], room_ids: [1,2] }, measurement, masters);
  assert.equal(edited.groups[1], original.groups[1]);
  assert.equal(edited.specials, original.specials);
  assert.equal(edited.rates.hall, "18");
  const deleted = deleteAssignment(edited, "bedrooms", "group");
  assert.equal(deleted.rates.bedrooms, undefined);
  assert.equal(deleted.specials.length, 1);
  assert.equal(original.groups[0].room_ids.length, 3);
});

test("decimal net areas are rounded and string API IDs are supported", () => {
  const snapshot = { ...measurement, surfaces: [{ id: "11", room: "1", surface_type: "WALL", net_area: "0.1" }, { id: "12", room: "1", surface_type: "WALL", net_area: "0.2" }] };
  assert.equal(roomContribution(snapshot, [], 1, "WALL").quantity, 0.3);
  assert.equal(roomContribution(snapshot, [{ room_id: "1", surface_ids: ["11"] }], 1, "WALL").quantity, 0.2);
});

test("general services retain quantity and unit without changing measured assignments", () => {
  const draft = { id: "plumbing", quantity: 2, unit: 2, room_id: 1, spec: { service_category: 5, description: "Repair taps", coats: 1 } };
  const state = saveGeneralService(exampleAssignments(), draft, measurement, masters);
  assert.equal(specificationLines(measurement, state)[0].quantity, 1175);
  const priced = { ...state, rates: { ...state.rates, plumbing: "500" } };
  assert.equal(pricedLines(measurement, priced).at(-1).amount, 1000);
  const item = toQuotationItems(measurement, priced, masters).at(-1);
  assert.equal(item.is_additional_service, true);
  assert.equal(item.unit, 2);
  assert.equal(item.paint_type, undefined);
  assert.deepEqual(item.included_areas, ["Bedroom 1"]);
  assert.match(item.description, /Repair taps/);
  const edited = saveGeneralService(priced, { ...draft, quantity: 3 }, measurement, masters);
  assert.equal(edited.services.length, 1);
  assert.equal(pricedLines(measurement, edited).at(-1).amount, 1500);
  assert.equal(deleteAssignment(edited, "plumbing", "service").services.length, 0);
  assert.throws(() => saveGeneralService(state, { ...draft, quantity: 0 }, measurement, masters), /greater than zero/);
  assert.throws(() => saveGeneralService(state, { ...draft, spec: { ...draft.spec, description: "" } }, measurement, masters), /description/);
});
