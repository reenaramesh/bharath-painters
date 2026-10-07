import test from "node:test";
import assert from "node:assert/strict";
import { lockBodyScroll } from "./bodyScrollLock.js";

for (const order of [[0, 1], [1, 0]]) {
  test(`overlapping dialogs restore page scrolling when closed in order ${order}`, () => {
    const body = { style: { overflow: "auto" } };
    const release = [lockBodyScroll(body), lockBodyScroll(body)];
    assert.equal(body.style.overflow, "hidden");
    release[order[0]]();
    assert.equal(body.style.overflow, "hidden");
    release[order[1]]();
    assert.equal(body.style.overflow, "auto");
    release[order[0]]();
    assert.equal(body.style.overflow, "auto");
  });
}
test("reopening a dialog preserves the original page style", () => {
  const body = { style: { overflow: "" } };
  for (let i = 0; i < 3; i++) {
    const release = lockBodyScroll(body);
    assert.equal(body.style.overflow, "hidden");
    release();
    assert.equal(body.style.overflow, "");
  }
});
