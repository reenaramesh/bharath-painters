import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import React, { useState } from "react";
import { create, act } from "react-test-renderer";
import { transformWithOxc } from "vite";
import { measurement, masters, exampleAssignments } from "../preview/quotationGrouping/fixtures.js";
import { assignmentQuotationItems, groupedQuotationRoom, surfaceOptions, roomContribution, quotationRoomAreaLabel } from "./groupedQuotation.js";

const sourceUrl = new URL("../components/GroupedQuotationWorkspace.jsx", import.meta.url);
const source = (await fs.readFile(sourceUrl, "utf8")).replace(/^import\s+["'][^"']+\.css["'];?\s*$/gm, "");
const transformed = await transformWithOxc(source, sourceUrl.pathname, { jsx: { runtime: "automatic" } });
const code = transformed.code.replace(/from\s+(["'])([^"']+)\1/g, (_match, _quote, specifier) => `from ${JSON.stringify(specifier.startsWith(".") ? new URL(specifier, sourceUrl).href : import.meta.resolve(specifier))}`);
const { default: Workspace } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const text = (node) => typeof node === "string" || typeof node === "number" ? String(node) : (node?.children || []).map(text).join("");

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
  let state;
  let apiCalls = 0;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = () => { apiCalls++; throw Error("Workspace must use supplied data"); };
  globalThis.document = { body: { style: { overflow: "" } }, activeElement: { focus() {} }, addEventListener() {}, removeEventListener() {} };
  const realMasters = { ...masters, categories: masters.categories.map((entry) => ({ ...entry, id: entry.id + 100 })), paintTypes: masters.paintTypes.map((entry) => ({ ...entry, id: entry.id + 200, service_category: entry.service_category + 100 })), brands: masters.brands.map((entry) => ({ ...entry, id: entry.id + 300 })), units: masters.units.map((entry) => ({ ...entry, id: entry.id + 400 })) };
  function Harness({ phase }) {
    const [value, setValue] = useState({ groups: [], specials: [], services: [], rates: {} });
    state = value;
    const measured = { ...measurement, surfaces: measurement.surfaces.map((surface, index) => index ? surface : { ...surface, gross_area: "147.00", net_area: "120.00", deduction_area: "27.00", addition_area: "0.00", openings: [
      { id: 801, opening_type: "DOOR", effect: "DEDUCT", name: "Entry door", effective_deduction: "21.00", area: "42.00" },
      { id: 802, opening_type: "WINDOW", effect: "DEDUCT", name: "Window A", effective_deduction: "6.00", area: "12.00" },
      { id: 803, opening_type: "DOOR", effect: "DEDUCT", name: "Ignored door", effective_deduction: "0.00" },
      { id: 804, opening_type: "WINDOW", effect: "ADD", name: "Added window", effective_deduction: "10.00" },
    ] }) };
    const displayMeasurement = { ...measured, rooms: [...measured.rooms, { id: 8001, name: "Balcony" }, { id: 8002, name: "Utility Area" }], surfaces: [...measured.surfaces, { id: 9001, room: 8001, work_area: "INTERIOR", surface_type: "WALL", name: "Balcony wall", net_area: "50", gross_area: "60", deduction_area: "10" }, { id: 9002, room: 8002, work_area: "INTERIOR", surface_type: "CEILING", name: "Utility ceiling", net_area: "20" }, { id: 9003, room: null, work_area: "EXTERIOR", surface_type: "WALL", area_group_name: "Front elevation", name: "Front wall", gross_area: "110", net_area: "100", deduction_area: "10" }] };
    return React.createElement(Workspace, { phase, measurement: measured, displayMeasurement, masters: realMasters, state: value, onChange: setValue });
  }
  let view;
  try {
    await act(async () => { view = create(React.createElement(Harness, { phase: "assignments" }), { createNodeMock: () => ({ querySelector: () => ({ focus() {} }), querySelectorAll: () => [] }) }); });
    const click = async (label) => act(async () => { const scope = view.root.findAllByProps({ role: "dialog" })[0] || view.root; const button = scope.findAllByType("button").find((node) => text(node) === label); assert.ok(button, label); button.props.onClick(); });
    const label = (name) => view.root.findAllByType("label").find((node) => text(node).startsWith(name));
    assert.equal(view.root.findAllByType("h2").filter((node) => text(node) === "Measurements").length, 1);
    assert.equal(view.root.findAllByType("h2").filter((node) => text(node) === "Services & Product").length, 1);
    assert.equal(view.root.findAllByType("button").filter((node) => /Assign Products|Add Special Wall/.test(text(node))).length, 0);
    assert.equal(view.root.findAllByType("h2").filter((node) => text(node) === "Deducted Surfaces").length, 0);
    // Preserve the room tables and their full detail actions on mobile.
    for (const table of view.root.findAllByType("table")) {
      assert.equal(table.props["data-mobile-table"], "keep");
    }
    const wallsTable = view.root.findAllByType("table")[0];
    const totals = wallsTable.findByType("tfoot");
    assert.deepEqual(totals.findAllByType("td").slice(0, 2).map(text), ["2,270", "670"]);
    const bedroom = wallsTable.findAllByType("tr").find((node) => text(node).startsWith("Bedroom 1"));
    assert.deepEqual(bedroom.findAllByType("td").slice(0, 3).map(text), ["470", "130", "27"]);
    assert.match(text(view.root.findAllByType("table")[1]), /Door.*Window.*Other/);
    await act(async () => view.root.findByProps({ "aria-label": "View original measurement records for Bedroom 1" }).props.onClick());
    assert.match(text(view.root.findByProps({ role: "dialog" })), /Wall 4/);
    assert.match(text(view.root.findByProps({ role: "dialog" })), /Gross area \(before deduction\)147 sqft/);
    assert.match(text(view.root.findByProps({ role: "dialog" })), /After deduction120 sqft/);
    assert.match(text(view.root.findByProps({ role: "dialog" })), /Net area120 sqft/);
    await click("Close");
    for (const title of ["Balconies", "Utility Areas", "Exterior Measurements"]) assert.equal(view.root.findAllByType("section").filter((node) => node.props["aria-label"] === title).length, 1);
    await act(async () => view.root.findAllByType("button").find((node) => text(node) === "Front elevation").props.onClick());
    assert.match(text(view.root.findByProps({ role: "dialog" })), /Front wall/);
    assert.match(text(view.root.findByProps({ role: "dialog" })), /Net area100 sqft/);
    await click("Close");
    await click("Create Paint Areas");
    await click("Select all");
    await click("Continue");
    assert.equal(label("Type of service").findByType("select").props.value, 101);
    assert.equal(label("Notes"), undefined);
    assert.equal(label("Finish"), undefined);
    await act(async () => label("Area Name").findByType("input").props.onChange({ target: { value: "Basic Painting" } }));
    await act(async () => label("Product").findByType("select").props.onChange({ target: { value: "201" } }));
    await act(async () => view.root.findByProps({ "aria-label": "Assignment rate" }).props.onChange({ target: { value: "10" } }));
    await click("Save Paint Areas");
    assert.equal(state.groups[0].spec.service_category, 101);
    assert.equal(state.groups[0].spec.paint_type, 201);
    const items = assignmentQuotationItems(measurement, state, realMasters);
    assert.equal(items[0].quantity, 2570);
    assert.equal(items[0].unit, 401);
    await click("Room contribution details");
    assert.match(text(view.root.findByProps({ role: "dialog" })), /470 sqft/);
    await click("Close");
    await act(async () => view.update(React.createElement(Harness, { phase: "final" })));
    assert.match(text(view.root), /25,700/);
    await act(async () => view.root.findByProps({ "aria-label": "View details for Basic Painting" }).props.onClick());
    assert.match(text(view.root.findByProps({ role: "dialog" })), /Tractor Emulsion/);
    await click("Close");
    await act(async () => view.root.findByProps({ "aria-label": "Edit Basic Painting" }).props.onClick());
    await click("Continue");
    await act(async () => view.root.findByProps({ "aria-label": "Assignment rate" }).props.onChange({ target: { value: "12" } }));
    await click("Save Paint Areas");
    assert.match(text(view.root), /30,840/);
    assert.equal(apiCalls, 0);
  } finally {
    if (view) await act(async () => view.unmount());
    globalThis.document = originalDocument;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalAct;
    globalThis.fetch = originalFetch;
  }
});


test("saved quotation room labels use surface and real names rather than generated group titles", () => {
  const item = { included_areas: ["living area - 2 Rooms - Walls: 480 sqft", "Hall - 2 Rooms - Walls: 328.15 sqft"], specification_details: { kind: "group", name: "2 Rooms - Walls", surface: "WALL", contributions: [{ room_name: "living area", quantity: 480 }, { room_name: "Hall", quantity: 328.15 }] } };
  assert.equal(quotationRoomAreaLabel(item), "Walls - living area, Hall");
  assert.equal(quotationRoomAreaLabel({ included_areas: ["Bedroom 1 - Ceiling: 130 sqft"] }), "Bedroom 1 - Ceiling");
  assert.equal(item.included_areas[0], "living area - 2 Rooms - Walls: 480 sqft");
});
