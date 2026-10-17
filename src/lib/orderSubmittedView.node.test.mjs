// Run: node --test --test-concurrency=1 src/lib/orderSubmittedView.node.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSubmittedView, MY_ORDERS_PATH } from "./orderSubmittedView.js";

const draftValues = {
  garmentName: "Draft Hoodie",
  brand: "DraftBrand",
  category: "DraftCat",
  selectedColor: "DraftRed",
  selectedSize: "XL",
  quantity: 99,
  artworkName: "draft-art.png",
  notes: "unsaved draft notes",
  quote: { total: 123 },
};

test("receipt mode exposes only order number, warnings and My Orders link", () => {
  const view = buildSubmittedView({
    receiptOnly: true,
    createdOrderNumber: "TC-424242",
    artworkLinkWarning: "link unknown",
    recoveryWarning: "",
    ...draftValues,
  });
  assert.deepEqual(view, {
    mode: "receipt",
    orderNumber: "TC-424242",
    warnings: ["link unknown"],
    myOrdersPath: MY_ORDERS_PATH,
  });
  const serialized = JSON.stringify(view);
  for (const forbidden of ["Black", '"M"', "Selected Garment", "No artwork uploaded", ...Object.values(draftValues).filter((v) => typeof v === "string")]) {
    assert.ok(!serialized.includes(forbidden), `receipt view leaked ${forbidden}`);
  }
});

test("receipt mode with no warnings and no details shows no defaults", () => {
  const view = buildSubmittedView({ receiptOnly: true, createdOrderNumber: "TC-1" });
  assert.deepEqual(Object.keys(view).sort(), ["mode", "myOrdersPath", "orderNumber", "warnings"]);
  assert.deepEqual(view.warnings, []);
});

test("missing order number is never shown as submitted", () => {
  assert.deepEqual(buildSubmittedView({ receiptOnly: true }), { mode: "missing" });
  assert.deepEqual(buildSubmittedView({}), { mode: "missing" });
});

test("full mode (fresh submission) keeps existing behaviour", () => {
  const view = buildSubmittedView({ createdOrderNumber: "TC-2", ...draftValues });
  assert.equal(view.mode, "full");
  assert.equal(view.selectedColor, "DraftRed");
});
