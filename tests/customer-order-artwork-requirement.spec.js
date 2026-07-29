// @ts-check
import { expect, test } from "@playwright/test";
import {
  hasCustomerOrderArtwork,
  isDecoratedOrderLineItem,
  requiresCustomerOrderArtwork,
} from "../src/customer-portal/orderArtworkRequirement.js";

const decoratedLineItem = {
  product_id: "product-decorated",
  decoration_type: "Screen Print",
};

test("decorated order submission requires customer artwork", () => {
  expect(isDecoratedOrderLineItem(decoratedLineItem)).toBe(true);
  expect(requiresCustomerOrderArtwork([decoratedLineItem], [])).toBe(true);
});

test("selected existing artwork satisfies the decorated order requirement", () => {
  const lineItems = [
    {
      ...decoratedLineItem,
      artwork_id: "existing-artwork-1",
      artwork_name: "Existing Logo.svg",
    },
  ];

  expect(hasCustomerOrderArtwork(lineItems, [])).toBe(true);
  expect(requiresCustomerOrderArtwork(lineItems, [])).toBe(false);
});

test("newly uploaded artwork satisfies the decorated order requirement", () => {
  const artworkLibrary = [
    {
      id: "pending-upload-1",
      displayName: "New Logo.svg",
      originalFilename: "new-logo.svg",
    },
  ];

  expect(hasCustomerOrderArtwork([decoratedLineItem], artworkLibrary)).toBe(true);
  expect(requiresCustomerOrderArtwork([decoratedLineItem], artworkLibrary)).toBe(false);
});

test("explicitly undecorated products do not require artwork", () => {
  expect(
    requiresCustomerOrderArtwork(
      [{ product_id: "product-blank", decoration_type: "Blank Garment" }],
      []
    )
  ).toBe(false);
});

test("final submission boundary shows the required artwork dialog before order creation", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(
      new URL("../src/customer-portal/CustomerPortalRequestOrder.jsx", import.meta.url),
      "utf8"
    )
  );
  const requirementCheck = source.indexOf("requiresCustomerOrderArtwork(");
  const orderCreation = source.indexOf("await createStoredOrder(");

  expect(requirementCheck).toBeGreaterThan(-1);
  expect(orderCreation).toBeGreaterThan(requirementCheck);
  expect(source).toContain("Artwork Required");
  expect(source).toContain("Before submitting your order, please upload your artwork or select artwork");
  expect(source).toContain("Upload Artwork");
  expect(source).toContain("Choose Existing Artwork");
  expect(source).toContain("Cancel");
});
