import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { NAVIGATION, activeNavigation, visibleNavigation } from "./navigation.js";

const app = readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
const routes = [...app.matchAll(/path="([^"]+)"/g)].map((match) => match[1]);
for (const item of NAVIGATION) {
  assert.ok(routes.includes(item.route.split("?")[0]), `${item.id}: missing route ${item.route}`);
  assert.ok(item.icon && typeof item.icon === "object", `${item.id}: missing Lucide export`);
  assert.ok(item.label && item.group && item.roles.length && Number.isInteger(item.order));
}
for (const role of ["CONTRACTOR", "PAINTER", "CUSTOMER", "ADMIN", "SUPPORT"]) {
  for (const employment of ["freelance", "in-house"]) {
    const entries = visibleNavigation(role, employment);
    assert.equal(new Set(entries.map((item) => item.route)).size, entries.length, `duplicate destination for ${role}`);
    assert.ok(entries.every((item) => item.roles.includes(role)));
  }
}
const contractor = visibleNavigation("CONTRACTOR");
for (const [route, expected] of [["/customers/42/quotations", "customers"], ["/properties/42/measurements", "properties"], ["/quotations/42/edit", "quotations"], ["/in-house-applicators/new", "employees"], ["/subcontract-work-orders/42", "subcontracts"], ["/settings?tab=company", "settings"], ["/provider-profile", "settings"]]) {
  assert.equal(activeNavigation(contractor, route)?.id, expected, route);
}
assert.equal(activeNavigation(contractor, "/customers-extra"), undefined);
assert.equal(activeNavigation(contractor, "/customer-quotations/42"), undefined);
assert.equal(activeNavigation(contractor, "/work-changes")?.id, "work-changes");
assert.equal(activeNavigation(contractor, "/work-reschedules")?.id, "work-reschedules");
for (const [route, id] of [["/properties?calculator=1", "calculator"], ["/properties?action=add", "add-property"], ["/customers?action=add", "add-customer"], ["/quotations/new", "new-quotation"], ["/contractor-theme", "theme"], ["/properties?calculator=0", "properties"]]) {
  assert.equal(activeNavigation(contractor, route)?.id, id, route);
}
for (const role of ["CUSTOMER", "PAINTER", "ADMIN", "SUPPORT"]) {
  assert.ok(visibleNavigation(role).every((entry) => entry.group !== "Quick Actions"));
}
assert.equal(activeNavigation(contractor, "/appearance")?.id, "settings");
assert.equal(activeNavigation(visibleNavigation("PAINTER"), "/appearance")?.id, "appearance");
const pages = readdirSync(new URL("../../pages/", import.meta.url)).filter((file) => file.endsWith(".jsx"));
const report = readFileSync(new URL("../../../../docs/sidebar-navigation-preview.md", import.meta.url), "utf8");
const routedNames = [...app.matchAll(/page\("([^"]+)"\)/g)].map((match) => match[1]);
const unrouted = pages.filter((file) => !routedNames.includes(file.replace(".jsx", "")));
for (const file of unrouted) assert.ok(report.includes(file.replace(".jsx", "")), `unclassified page ${file}`);
console.log(JSON.stringify({ configuredItems: NAVIGATION.length, existingRoutePatterns: routes.length, pageFiles: pages.length, destinationsAndIcons: "PASS", roleIsolationAndDuplicates: "PASS", parentMatchingAndBoundaries: "PASS", nonStandalonePages: unrouted }, null, 2));
