import test from "node:test";
import assert from "node:assert/strict";
import { contractorProfilePath, contractorProfileLink } from "./contractorProfileLink.js";

test("profile links use one encoded public route on the current app origin", () => {
  assert.equal(contractorProfileLink("BP-C-000001", "http://localhost:5173"), "http://localhost:5173/contractor-profile/BP-C-000001");
  assert.equal(contractorProfilePath("id/with?query"), "/contractor-profile/id%2Fwith%3Fquery");
  assert.equal(contractorProfileLink("", "https://example.test"), "");
});
