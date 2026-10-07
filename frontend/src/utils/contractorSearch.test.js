import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, filterContractors, postcodeLocations } from "./contractorSearch.js";

const rows = [
  { id: 1, company_name: "Alpha", mobile: "+91 98765 43210", services: ["Waterproofing"], service_areas: "Whitefield", office_address: "560037" },
  { id: 2, company_name: "Beta", mobile: "9123456789", work_skills: "Painting", base_location: "Bengaluru" },
  { id: 3, company_name: "Gamma", services: ["Waterproofing"], service_areas: "Whitefield" },
];
const filters = { search: "", work: "", location: "", radius: "" };
test("combines formatted partial phone, work and area filters", () => {
  assert.deepEqual(filterContractors(rows, new Set(), { ...filters, search: "98765-43", work: "water", location: "white" }).map((r) => r.id), [1]);
  assert.equal(filterContractors(rows, new Set([1]), { ...filters, search: "98765" }).length, 0);
  assert.equal(filterContractors(rows, new Set(), { ...filters, search: "abc" }).length, 0);
  assert.deepEqual(filterContractors(rows, new Set(), { ...filters, search: "alpha" }).map((r) => r.id), [1]);
});
test("radius excludes unknown and distant locations and sorts nearest first", () => {
  assert.deepEqual(filterContractors(rows, new Set(), { ...filters, radius: "10" }, { 1: 8, 2: 2 }).map((r) => r.id), [2, 1]);
  assert.deepEqual(filterContractors(rows, new Set(), { ...filters, radius: "5" }, { 1: 8, 2: 2 }).map((r) => r.id), [2]);
  assert.deepEqual(filterContractors(rows, new Set(), { ...filters, location: "560037", radius: "5" }, { 1: 8, 2: 2 }).map((r) => r.id), [2]);
});
test("distance is symmetric and approximately 111 km per equatorial degree", () => {
  const a = { latitude: 0, longitude: 0 }, b = { latitude: 0, longitude: 1 };
  assert.equal(distanceKm(a, a), 0);
  assert.ok(Math.abs(distanceKm(a, b) - 111.195) < 0.01);
  assert.equal(distanceKm(a, b), distanceKm(b, a));
});
test("PIN lookup ignores missing coordinates and duplicate PIN codes", () => {
  let calls = 0;
  const engine = { getByPincode: () => { calls++; return { success: true, data: { data: [{ latitude: 12, longitude: 77 }, { latitude: null, longitude: null }] } }; } };
  assert.equal(postcodeLocations(engine, "Office 560037, Bengaluru 560037").length, 1);
  assert.equal(calls, 1);
});
