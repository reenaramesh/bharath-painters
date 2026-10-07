import test from "node:test";
import assert from "node:assert/strict";
import { menuEnabled, menuRouteEnabled } from "./menuVisibility.js";
test("role menu visibility handles worker shortcuts, detail routes and protected menus", () => {
  const visibility = { CONTRACTOR: ["jobs", "messages", "dashboard", "new-quotation", "calculator"], PAINTER: ["available-work"] };
  assert.equal(menuEnabled("CONTRACTOR", visibility, "new-quotation"), false);
  assert.equal(menuRouteEnabled("CONTRACTOR", visibility, "/jobs?post=1"), false);
  assert.equal(menuRouteEnabled("CONTRACTOR", visibility, "/properties?calculator=1"), false);
  assert.equal(menuRouteEnabled("CONTRACTOR", visibility, "/messages/42"), false);
  assert.equal(menuRouteEnabled("PAINTER", visibility, "/jobs"), false);
  assert.equal(menuRouteEnabled("PAINTER", visibility, "/messages"), true);
  assert.equal(menuRouteEnabled("CONTRACTOR", visibility, "/dashboard"), true);
  assert.equal(menuRouteEnabled("ADMIN", visibility, "/messages"), true);
});
