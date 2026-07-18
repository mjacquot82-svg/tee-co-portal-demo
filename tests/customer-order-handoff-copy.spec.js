// @ts-check
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

test("public preview describes a handoff instead of a completed submission", () => {
  const source = readSource("src/pages/OrderPreview.jsx");

  expect(source).toContain("Continue to Secure Request Form");
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
  expect(source).toContain("Edit Selection");
  expect(source).not.toContain('title="Browse the catalog"');
  expect(source).not.toContain("categoryProducts.map");
  expect(source).not.toContain('onChange={(event) => setQuantity(event.target.value)}');
  expect(source).not.toContain('onChange={(event) => setSelectedColor(event.target.value)}');
  expect(source).not.toContain('onChange={(event) => setSelectedSize(event.target.value)}');
  expect(source).not.toContain('onChange={(event) => setSelectedPlacement(event.target.value)}');
});
