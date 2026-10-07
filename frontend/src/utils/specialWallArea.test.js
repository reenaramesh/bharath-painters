import test from "node:test";
import assert from "node:assert/strict";
import { availableWallArea } from "./specialWallArea.js";

test("add, edit and delete surfaces preserve original measured wall area", () => {
  const parent = { id: "bedroom", quantity: 470 };
  const texture = { field_id: "texture", parent_field_id: parent.id, quantity: 125 };
  const damp = { field_id: "damp", parent_field_id: parent.id, quantity: 35 };
  assert.equal(availableWallArea(parent.quantity, [], parent.id), 470);
  assert.equal(availableWallArea(parent.quantity, [texture], parent.id), 345);
  assert.equal(availableWallArea(parent.quantity, [texture, damp], parent.id), 310);
  assert.equal(availableWallArea(parent.quantity, [{ ...texture, quantity: 100 }], parent.id), 370);
  assert.equal(availableWallArea(parent.quantity, [damp], parent.id), 435);
  assert.equal(parent.quantity, 470);
});

test("editing allows the current surface area and isolates rooms", () => {
  const surfaces = [
    { field_id: "texture", parent_field_id: "bedroom", quantity: 125 },
    { field_id: "damp", parent_field_id: "bedroom", quantity: 35 },
    { field_id: "other", parent_field_id: "kitchen", quantity: 100 },
  ];
  assert.equal(availableWallArea(470, surfaces, "bedroom", "texture"), 435);
  assert.equal(availableWallArea(470, surfaces, "bedroom"), 310);
  assert.equal(availableWallArea(1, [{ parent_field_id: "room", quantity: 0.7 }], "room"), 0.3);
});
