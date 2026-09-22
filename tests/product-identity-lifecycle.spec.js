// @ts-check
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

test("storefront product removal archives the record instead of deleting it", () => {
  const source = readSource("src/lib/productsStore.js");

  expect(source).toContain("export async function archiveStoredProduct(productId)");
  expect(source).toContain('status: "Inactive"');
  expect(source).toContain("return updateStoredProduct(productId");
  expect(source).not.toContain('supabase.from("products").delete()');
});

test("new local products receive a permanent identity once", () => {
  const source = readSource("src/lib/productsStore.js");

  expect(source).toContain("function createPermanentProductId()");
  expect(source).toContain("globalThis.crypto?.randomUUID");
  expect(source).toContain("id: product?.id || createPermanentProductId()");
});

test("existing customer drafts resolve against the full catalog including archived products", () => {
  const source = readSource("src/customer-portal/CustomerPortalRequestOrder.jsx");

  expect(source).toContain("resolveDraftProduct(lineItem, products)");
  expect(source).toContain("resolveDraftProduct(");
  expect(source).toContain("product?.id");
  expect(source).toContain("product?.legacy_product_id");
  expect(source).toContain("product?.garment_library_item_id");
});

test("product admin explains archive semantics", () => {
  const source = readSource("src/admin/Products.jsx");

  expect(source).toContain("archiveStoredProduct");
  expect(source).toContain("Archive Product?");
  expect(source).toContain("permanent ID will be kept");
  expect(source).toContain("New shoppers will no longer see it.");
});
