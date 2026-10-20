import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import React, { useState } from "react";
import { create, act } from "react-test-renderer";
import { transformWithOxc } from "vite";
import { measurement, masters, exampleAssignments } from "../preview/quotationGrouping/fixtures.js";
import { assignmentQuotationItems, groupedQuotationRoom, surfaceOptions, roomContribution, quotationRoomAreaLabel } from "./groupedQuotation.js";

async function componentModule(url) {
  let source = (await fs.readFile(url, 'utf8')).replace(/^import\s+["'][^"']+\.css["'];?\s*$/gm, '');
  const imports = [...source.matchAll(/from\s+(["'])([^"']+)\1/g)];
  for (const match of imports) {
    const name = match[2];
    const target = name.startsWith('.') ? new URL(name, url) : null;
    const resolved = target?.pathname.endsWith('.jsx') ? await componentModule(target) : target?.href || import.meta.resolve(name);
    source = source.replace(match[0], `from ${JSON.stringify(resolved)}`);
  }
  const result = await transformWithOxc(source, url.pathname, {jsx:{runtime:'automatic'}});
  const code = result.code.replace(/from\s+(["'])([^"']+)\1/g, (match, _quote, name) => name.startsWith('data:') || name.startsWith('file:') ? match : `from ${JSON.stringify(import.meta.resolve(name))}`);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const { default: Workspace } = await import(await componentModule(new URL('../components/GroupedQuotationWorkspace.jsx', import.meta.url)));
const text = (node) => typeof node === "string" || typeof node === "number" ? String(node) : (node?.children || []).map(text).join("");

test("grouped assignment workspace exposes and opens measured special wall creation", async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.window = { confirm: () => true };
  globalThis.document = { body: { style: { overflow: "" } }, activeElement: { focus() {} }, addEventListener() {}, removeEventListener() {} };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const state = { groups: [], specials: [], services: [], rates: {} };
  let view;
  try {
    await act(async () => { view = create(React.createElement(Workspace, { measurement, masters, state, onChange: () => {}, phase: "assignments", showMeasurements: false }), { createNodeMock: () => ({ showModal() {}, close() {}, querySelector: () => ({ focus() {} }), querySelectorAll: () => [] }) }); });
    const add = view.root.findAllByType("button").find((node) => text(node) === "Add Special Wall");
    assert.ok(add, "special-wall entry should be visible in grouped assignments");
    await act(async () => add.props.onClick());
    const dialog = view.root.findByType("dialog");
    assert.match(text(dialog), /Create Special Wall/);
    assert.ok(dialog.findAllByType("input").some((node) => node.props.type === "checkbox"), "measured walls should be selectable");
  } finally {
    if (view) await act(async () => view.unmount());
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});

test("production adapter emits original API fields with complete source references", () => {
  const items = assignmentQuotationItems(measurement, exampleAssignments(), masters);
  assert.deepEqual(items.map((item) => item.quantity), [1175,970,300,125]);
  assert.equal(items[0].specification_details.contributions[0].quantity, 345);
  assert.equal(items[0].specification_details.measurement_record, 901);
  assert.equal(items[0].specification_details.measurement_version, 3);
  assert.deepEqual(items[3].specification_details.surface_ids, [14]);
  assert.equal(items[0].unit, 1);
  assert.equal(items[0].rate, "10");
  assert.ok(items[0].included_areas[0].includes("345 sqft"));
    assert.equal(items[0].description, "Tractor Emulsion");
    const room = Object.freeze({ id: 11, name: "Measured room", length: null, width: "12.50", height: null });
    const snapshot = groupedQuotationRoom(room);
    assert.equal(snapshot.length, 0);
    assert.equal(snapshot.width, 12.5);
    assert.equal(room.length, null);
    const custom = { ...measurement, surfaces: [{ id: 81, room: 1, surface_type: "OTHER", area_group_name: "Wood trim", net_area: "25" }, { id: 82, room: 1, surface_type: "OTHER", area_group_name: "Damp patch", net_area: "35" }] };
    assert.deepEqual(surfaceOptions(custom), ["OTHER:Wood trim", "OTHER:Damp patch"]);
    assert.equal(roomContribution(custom, [], 1, "OTHER:Wood trim").quantity, 25);
    assert.equal(roomContribution(custom, [], 1, "OTHER:Damp patch").quantity, 35);
});

test("production workspace uses provided master IDs, edits rates and opens read-only popups", async () => {
  const originalDocument = globalThis.document;
  const originalAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  let discardPrompts = 0;
  globalThis.window = { confirm() { discardPrompts++; return false; } };
  let state;
  let apiCalls = 0;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = () => { apiCalls++; throw Error("Workspace must use supplied data"); };
  globalThis.document = { body: { style: { overflow: "" } }, activeElement: { focus() {} }, addEventListener() {}, removeEventListener() {} };
  const realMasters = { ...masters, categories: masters.categories.map((entry) => ({ ...entry, id: entry.id + 100 })), paintTypes: masters.paintTypes.map((entry) => ({ ...entry, id: entry.id + 200, service_category: entry.service_category + 100 })), brands: masters.brands.map((entry) => ({ ...entry, id: entry.id + 300 })), units: masters.units.map((entry) => ({ ...entry, id: entry.id + 400 })) };
  function Harness({ phase, showMeasurements }) {
    const [value, setValue] = useState({ groups: [], specials: [], services: [], rates: {} });
    state = value;
    const measured = { ...measurement, surfaces: measurement.surfaces.map((surface, index) => index ? surface : { ...surface, length: "12.00", breadth: "10.00", gross_area: "147.00", net_area: "120.00", deduction_area: "27.00", addition_area: "0.00", openings: [
      { id: 801, opening_type: "DOOR", effect: "DEDUCT", name: "Entry door", effective_deduction: "21.00", area: "42.00" },
      { id: 802, opening_type: "WINDOW", effect: "DEDUCT", name: "Window A", effective_deduction: "6.00", area: "12.00" },
      { id: 803, opening_type: "DOOR", effect: "DEDUCT", name: "Ignored door", effective_deduction: "0.00" },
      { id: 804, opening_type: "WINDOW", effect: "ADD", name: "Added window", effective_deduction: "10.00" },
    ] }) };
    const displayMeasurement = { ...measured, rooms: [...measured.rooms, { id: 8001, name: "Balcony" }, { id: 8002, name: "Utility Area" }], surfaces: [...measured.surfaces, { id: 9001, room: 8001, work_area: "INTERIOR", surface_type: "WALL", name: "Balcony wall", net_area: "50", gross_area: "60", deduction_area: "10" }, { id: 9002, room: 8002, work_area: "INTERIOR", surface_type: "CEILING", name: "Utility ceiling", net_area: "20" }, { id: 9003, room: null, work_area: "EXTERIOR", surface_type: "WALL", area_group_name: "Front elevation", name: "Front wall", gross_area: "110", net_area: "100", deduction_area: "10" }] };
    return React.createElement(Workspace, { phase, showMeasurements, measurement: measured, displayMeasurement, masters: realMasters, state: value, onChange: setValue });
  }
  let view;
  try {
    await act(async () => { view = create(React.createElement(Harness, { phase: "assignments" }), { createNodeMock: () => ({ showModal() {}, close() {}, querySelector: () => ({ focus() {} }), querySelectorAll: () => [] }) }); });
    await act(async () => view.update(React.createElement(Harness, { phase: "measurements" })));
    assert.equal(view.root.findAllByType("h2").filter(node => text(node) === "Measurements").length, 1);
    assert.equal(view.root.findAllByType("button").some(node => text(node) === "Create Paint Areas"), false);
    await act(async () => view.update(React.createElement(Harness, { phase: "assignments", showMeasurements: false })));
    assert.equal(view.root.findAllByType("h2").some(node => text(node) === "Measurements"), false);
    assert.equal(view.root.findAllByType("button").some(node => text(node) === "Add Painting Item"), true);
    await act(async () => view.update(React.createElement(Harness, { phase: "assignments" })));
    const click = async (label) => act(async () => { const scope = view.root.findAllByProps({ role: "dialog" })[0] || view.root; const button = scope.findAllByType("button").find((node) => text(node) === label); assert.ok(button, label); button.props.onClick(); });
    const label = (name) => view.root.findAllByType("label").find((node) => text(node).startsWith(name));
    assert.equal(view.root.findAllByType("h2").filter((node) => text(node) === "Measurements").length, 1);
    assert.equal(view.root.findAllByType("h2").filter((node) => text(node) === "Surface, Materials & Specifications").length, 1);
    assert.equal(view.root.findAllByType("button").filter((node) => /Assign Products/.test(text(node))).length, 0);
    assert.equal(view.root.findAllByType("button").filter((node) => text(node) === "Add Special Wall").length, 1);
    assert.equal(view.root.findAllByType("h2").filter((node) => text(node) === "Deducted Surfaces").length, 0);
    // Preserve the room tables and their full detail actions on mobile.
    for (const table of view.root.findAllByType("table")) {
      assert.equal(table.props["data-mobile-table"], "keep");
    }
    const wallsTable = view.root.findAllByType("table")[0];
    const totals = wallsTable.findByType("tfoot");
    // Includes the original balcony/utility plus added balcony/utility and exterior rows.
    assert.deepEqual(totals.findAllByType("td").slice(0, 2).map(text), ["2,720", "800"]);
    const bedroom = wallsTable.findAllByType("tr").find((node) => text(node).startsWith("Bedroom 1"));
    assert.deepEqual(bedroom.findAllByType("td").slice(0, 3).map(text), ["470", "130", "24"]);
    const measurementHeaders = text(wallsTable.findByType("thead"));
    assert.match(measurementHeaders, /Door/);
    assert.doesNotMatch(measurementHeaders, /Window|Other/);
    assert.doesNotMatch(measurementHeaders, /Actions/);
    assert.equal(wallsTable.findAllByType("button").some((node) => text(node) === "View"), false);
    assert.equal(text(wallsTable.findByType("thead")).includes("Deduction"), false);
    await act(async () => bedroom.findByType("button").props.onClick());
    assert.match(text(view.root.findByProps({ role: "dialog" })), /Wall 4/);
    const records = view.root.findByProps({ role: "dialog" }).findByType("table");
    assert.equal(records.props["data-mobile-table"], "keep");
    assert.deepEqual(records.findByType("thead").findAllByType("th").map((node) => node.children[0]), ["Surface", "L", "W / H", "Deduction", "Addition", "Total"]);
    assert.deepEqual(records.findByType("tbody").findAllByType("tr")[0].findAllByType("td").map(text), ["12", "10", "27", "0", "120"]);
    assert.equal(view.root.findByProps({ role: "dialog" }).findAllByType("article").length, 0);
    await click("Close");
    for (const title of ["Balconies", "Utility Areas", "Exterior Measurements"]) assert.equal(view.root.findAllByType("section").filter((node) => node.props["aria-label"] === title).length, 0);
    assert.ok(wallsTable.findAllByType("tr").some((row) => text(row).startsWith("Balcony")));
    await act(async () => view.root.findAllByType("button").find((node) => text(node) === "Front elevation").props.onClick());
    assert.match(text(view.root.findByProps({ role: "dialog" })), /Front wall/);
    assert.equal(text(view.root.findByProps({ role: "dialog" }).findByType("tbody").findAllByType("td").at(-1)), "100");
    await click("Close");
    await click("Add Painting Item");
    const dialog = () => view.root.findByProps({ role: "dialog" });
    const wall = dialog().findByProps({ "aria-label": "Select surface Walls" });
    await act(async () => wall.props.onChange());
    await click("Select all");
    assert.equal(dialog().findByProps({ "aria-label": "Total Area" }).props.value, "2,570");
    assert.equal(dialog().findByProps({ "aria-label": "Service / Product Category" }).props.value, 101);
    await act(async () => dialog().findByProps({ "aria-label": "Product" }).props.onChange({ target: { value: "201" } }));
    await act(async () => dialog().findByProps({ "aria-label": "Rate" }).props.onChange({ target: { value: "10" } }));
    await click("Add to Quotation");
    assert.equal(state.groups.length, 1);
    assert.equal(state.groups[0].work_area, "INTERIOR");
    assert.equal(state.groups[0].surface, "WALL");
    assert.equal(state.groups[0].spec.service_category, 101);
    assert.equal(state.groups[0].spec.paint_type, 201);
    const items = assignmentQuotationItems(measurement, state, realMasters);
    assert.equal(items[0].quantity, 2570);
    assert.equal(items[0].unit, 401);
    assert.equal(state.rates[state.groups[0].id], "10");
    await act(async () => view.update(React.createElement(Harness, { phase: "final" })));
    assert.match(text(view.root), /25,700/);
    assert.equal(apiCalls, 0);
  } finally {
    if (view) await act(async () => view.unmount());
    globalThis.document = originalDocument;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalAct;
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});


test("saved quotation room labels use surface and real names rather than generated group titles", () => {
  const item = { included_areas: ["living area - 2 Rooms - Walls: 480 sqft", "Hall - 2 Rooms - Walls: 328.15 sqft"], specification_details: { kind: "group", name: "2 Rooms - Walls", surface: "WALL", contributions: [{ room_name: "living area", quantity: 480 }, { room_name: "Hall", quantity: 328.15 }] } };
  assert.equal(quotationRoomAreaLabel(item), "Walls - living area, Hall");
  assert.equal(quotationRoomAreaLabel({ included_areas: ["Bedroom 1 - Ceiling: 130 sqft"] }), "Bedroom 1 - Ceiling");
  assert.equal(item.included_areas[0], "living area - 2 Rooms - Walls: 480 sqft");
});
