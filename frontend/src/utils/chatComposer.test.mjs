import assert from "node:assert/strict";
import test from "node:test";
import { shouldSubmitChat } from "./chatComposer.mjs";

test("Enter sends while Shift+Enter preserves a newline", () => {
  assert.equal(shouldSubmitChat({ key: "Enter" }), true);
  assert.equal(shouldSubmitChat({ key: "Enter", shiftKey: true }), false);
  assert.equal(shouldSubmitChat({ key: "a" }), false);
});

test("Enter during input method composition must not send", () => {
  assert.equal(shouldSubmitChat({ key: "Enter", isComposing: true }), false);
  assert.equal(shouldSubmitChat({ key: "Enter", keyCode: 229 }), false);
});
