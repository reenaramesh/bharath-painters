import assert from "node:assert/strict";
import { businessSettingsForm, businessSettingsPayload, settingsCatalogue } from "../../utils/businessSettings.js";

const response = { company: { company_name: "Existing", service_areas: "Bengaluru", years_in_business: 8, number_of_painters: 12, work_skills: "Unlisted skill", extra_social_links: [{ label: "Portfolio", url: "https://example.test" }], gst_document: "https://example.test/document.pdf" }, provider: { core_service: 1, additional_services: [2, 2], team_size: 0, is_draft: true, service_claims: [{ category: 1, work_description: 11, note: "Important", is_active: false }, { category: 2, work_description: null, note: "Category note", is_active: true }] } };
const saved = businessSettingsForm(response);
const parts = (form, files = {}) => {
  const payload = businessSettingsPayload({ form, saved, files });
  return { company: JSON.parse(payload.get("company")), provider: JSON.parse(payload.get("provider")), publish: payload.get("publish") };
};
assert.deepEqual(saved.additional_services, ["2"]);
assert.equal(saved.team_size, 0);
assert.equal(saved.work_skills, "Unlisted skill");
assert.deepEqual(parts({ ...saved, company_name: "Updated" }).provider, {});
assert.deepEqual(parts({ ...saved, company_name: "Updated" }).company, { company_name: "Updated" });
assert.deepEqual(parts({ ...saved, team_size: "3" }).provider, { team_size: 3 });
assert.equal(parts({ ...saved, team_size: "3" }).company.number_of_painters, undefined);
assert.deepEqual(parts({ ...saved, years_in_business: "0" }).company, { years_in_business: 0 });
const changed = parts({ ...saved, core_service: "2", additional_services: ["1"], sub_services: ["1:11"] });
assert.deepEqual(changed.provider.service_claims, [{ category: 1, work_description: 11, note: "Important", is_active: false }, { category: 2, work_description: null, note: "Category note", is_active: true }]);
assert.deepEqual(parts({ ...saved, gst_document_url: "" }).company, { gst_document: null });
assert.equal(parts({ ...saved, profile_status: "PUBLISHED" }).publish, "true");
const catalogue = settingsCatalogue([{ id: 1, name: "Painting" }, { id: 2, name: "Plumbing" }], [{ id: 11, name: "Interior", service_category: 1 }, { id: 11, name: "Interior", service_category: 1 }], response.provider);
assert.equal(catalogue[0].subServices.length, 1);
console.log("PASS: PATCH omission, zero workforce/experience, preserved claims/notes/free text, deduplicated services, file removal and publishing payloads.");
