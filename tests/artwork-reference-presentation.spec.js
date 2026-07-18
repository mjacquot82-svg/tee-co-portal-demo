// @ts-check
import { expect, test } from "@playwright/test";
import {
  getOrderArtworkReferenceNames,
  getUploadedOrderArtworkFiles,
} from "../src/lib/orderArtwork.js";

test("filename references are not presented as uploaded artwork assets", () => {
  const order = {
    customer_artwork_name: "qr.png",
    artwork_reference_names: ["qr.png"],
    artwork_requirement: "Upload Later",
    artwork_status: "Missing",
    artwork_files: [
      {
        id: "artwork-reference-qr-png",
        name: "qr.png",
        file_name: "qr.png",
        source: "order-metadata",
      },
    ],
  };

  expect(getOrderArtworkReferenceNames(order)).toEqual(["qr.png"]);
  expect(getUploadedOrderArtworkFiles(order)).toEqual([]);
});

test("real uploaded artwork remains distinct from its filename reference", () => {
  const uploaded = {
    id: "artwork-123",
    file_name: "qr.png",
    source: "supabase",
    asset_reference: "customer-artwork/customer-1/qr.png",
  };
  const order = {
    customer_artwork_name: "qr.png",
    artwork_reference_names: ["qr.png"],
    artwork_requirement: "Uploaded",
    artwork_status: "Pending Review",
    artwork_files: [uploaded],
  };

  expect(getOrderArtworkReferenceNames(order)).toEqual(["qr.png"]);
  expect(getUploadedOrderArtworkFiles(order)).toHaveLength(1);
  expect(getUploadedOrderArtworkFiles(order)[0]).toMatchObject({
    id: "artwork-123",
    file_name: "qr.png",
  });
});

test("customer and admin intake views label references and uploads separately", async () => {
  const fs = await import("node:fs/promises");
  const sources = await Promise.all([
    fs.readFile(new URL("../src/admin/QuoteDetail.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/customer-portal/CustomerPortalArtwork.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/customer-portal/CustomerPortalOrderDetail.jsx", import.meta.url), "utf8"),
  ]);

  for (const source of sources) {
    expect(source).toContain("Customer Selected");
    expect(source).toContain("Artwork Uploaded");
    expect(source).toContain("reference only");
  }
});
