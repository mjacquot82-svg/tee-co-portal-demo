// @ts-check
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

test("public preview describes a handoff instead of a completed submission", () => {
  const source = readSource("src/pages/OrderPreview.jsx");

  expect(source).toContain("Save Garment & Continue to Review");
  expect(source).toContain("Save Garment & Add Another Garment");
  expect(source).toContain("Your request is not submitted yet.");
  expect(source).toContain("Selection Summary");
  expect(source).toContain("Estimated Total");
  expect(source).not.toContain("Submit Order Request");
});

test("authenticated request form identifies the final submission action", () => {
  const source = readSource("src/customer-portal/CustomerPortalRequestOrder.jsx");

  expect(source).toContain("Review and Submit Your Request");
  expect(source).toContain("Your garment selection has been carried forward.");
  expect(source).toContain("Ready for final submission");
  expect(source).toContain("It does not authorize production or payment.");
  expect(source).toContain('"Submit Order Request"');
});

test("authenticated request form reviews the prior selection instead of reopening the catalog", () => {
  const source = readSource("src/customer-portal/CustomerPortalRequestOrder.jsx");

  expect(source).toContain('title="Your Request"');
  expect(source).toContain("<ReviewItem label=\"Garment\"");
  expect(source).toContain("<ReviewItem label=\"Quantity\"");
  expect(source).toContain("<ReviewItem label=\"Color\"");
  expect(source).toContain("<ReviewItem label=\"Size\"");
  expect(source).toContain("<ReviewItem label=\"Placement\"");
  expect(source).toContain("Estimated Pricing");
  expect(source).toContain("Edit Garment");
  expect(source).not.toContain('title="Browse the catalog"');
  expect(source).not.toContain("categoryProducts.map");
  expect(source).not.toContain('onChange={(event) => setQuantity(event.target.value)}');
  expect(source).not.toContain('onChange={(event) => setSelectedColor(event.target.value)}');
  expect(source).not.toContain('onChange={(event) => setSelectedSize(event.target.value)}');
  expect(source).not.toContain('onChange={(event) => setSelectedPlacement(event.target.value)}');
});

test("garments are configured while shopping and final review uses explicit edit actions", () => {
  const configurationSource = readSource("src/pages/OrderPreview.jsx");
  const sizeEditorSource = readSource("src/components/SizeBreakdownEditor.jsx");
  const reviewSource = readSource("src/customer-portal/CustomerPortalRequestOrder.jsx");

  expect(configurationSource).toContain("Size Breakdown");
  expect(sizeEditorSource).toContain("+ Add Size");
  expect(sizeEditorSource).toContain("Remove Size");
  expect(configurationSource).toContain("Decoration Method");
  expect(configurationSource).toContain('saveConfiguredGarment("catalogue")');
  expect(reviewSource).toContain("Edit Garment");
  expect(reviewSource).toContain('navigate("/order-preview"');
  expect(reviewSource).not.toContain("Add Another Size");
  expect(reviewSource).not.toContain("Remove Size");
});

test("the full garment size list reaches configuration and review keeps one multi-size line", () => {
  const garmentSource = readSource("src/pages/GarmentView.jsx");
  const configurationSource = readSource("src/pages/OrderPreview.jsx");
  const sizeEditorSource = readSource("src/components/SizeBreakdownEditor.jsx");
  const reviewSource = readSource("src/customer-portal/CustomerPortalRequestOrder.jsx");

  expect(garmentSource).toContain("availableSizes,");
  expect(configurationSource).toContain("passedState.availableSizes");
  expect(configurationSource).toContain("<SizeBreakdownEditor");
  expect(sizeEditorSource).toContain("remainingSizes[0]");
  expect(sizeEditorSource).toContain("onChange({ ...value, [nextSize]: 1 })");
  expect(reviewSource).toContain("Object.entries(lineItem.size_breakdown || {})");
  expect(reviewSource).toContain('data-testid="customer-order-line-item"');
});

test("product detail owns color only while garment configuration owns all sizing and quantities", () => {
  const productSource = readSource("src/pages/GarmentView.jsx");
  const configurationSource = readSource("src/pages/OrderPreview.jsx");
  const sizeEditorSource = readSource("src/components/SizeBreakdownEditor.jsx");

  expect(productSource).toContain("Choose Color");
  expect(productSource).toContain("Continue to Configure Garment");
  expect(productSource).toContain("Starting Price");
  expect(productSource).not.toContain("Choose Size");
  expect(productSource).not.toContain("Choose Quantity");
  expect(productSource).not.toContain("setSelectedSize");
  expect(productSource).not.toContain("setQuantity");
  expect(configurationSource).toContain("Size Breakdown");
  expect(sizeEditorSource).toContain("+ Add Size");
  expect(sizeEditorSource).toContain('type="number"');
  expect(configurationSource).toContain("Decoration Method");
  expect(configurationSource).toContain("Decoration Preference");
  expect(configurationSource).toContain("Choose Existing Artwork");
  expect(configurationSource).toContain("Upload New Artwork");
  expect(configurationSource).toContain("Notes for Tee &amp; Co");
});

test("garment summary reflects the hierarchical size breakdown instead of a single size", () => {
  const configurationSource = readSource("src/pages/OrderPreview.jsx");
  const summarySource = readSource("src/components/GarmentConfigurationSummary.jsx");

  expect(configurationSource).toContain("Garment Summary");
  expect(configurationSource).toContain("<GarmentConfigurationSummary");
  expect(summarySource).toContain("Total Pieces");
  expect(summarySource).toContain("Size Breakdown");
  expect(summarySource).toContain("Object.entries(sizeBreakdown)");
  expect(configurationSource).not.toContain("Selected Options");
});
