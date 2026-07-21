// @ts-check
import { expect, test } from "@playwright/test";
import {
  getArtworkUsage,
  getLineItemArtwork,
  getOrderArtworkLibrary,
  getOrderArtworkReferenceNames,
  getUploadedOrderArtworkFiles,
} from "../src/lib/orderArtwork.js";

test("order artwork library resolves garment references by asset id", () => {
  const order = {
    artwork_library: [
      { id: "artwork-a", display_name: "Company Logo", original_filename: "logo.png", storage_reference: "customer-artwork/a" },
      { id: "artwork-b", display_name: "Large Back Logo", original_filename: "back.pdf", storage_reference: "customer-artwork/b" },
    ],
    line_items: [
      { id: "hoodie", garment: "Hoodie", artwork_id: "artwork-a", artwork_name: "Company Logo" },
      { id: "jacket", garment: "Jacket", artwork_id: "artwork-b", artwork_name: "Large Back Logo" },
      { id: "hat", garment: "Hat", artwork_id: "artwork-a", artwork_name: "Company Logo" },
    ],
  };

  expect(getOrderArtworkLibrary(order)).toHaveLength(2);
  expect(getLineItemArtwork(order, order.line_items[1])).toMatchObject({ id: "artwork-b", display_name: "Large Back Logo" });
  expect(getArtworkUsage(order).map((entry) => ({
    id: entry.artwork.id,
    garments: entry.lineItems.map((item) => item.garment),
  }))).toEqual([
    { id: "artwork-a", garments: ["Hoodie", "Hat"] },
    { id: "artwork-b", garments: ["Jacket"] },
  ]);
});

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

test("production tickets present the artwork assigned to each garment", async () => {
  const sources = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/order-detail/PrintableProductionTicket.jsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/components/print/ProductionPrintSheet.jsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/admin/WorkOrder.jsx", import.meta.url), "utf8")),
  ]);

  for (const source of sources) {
    expect(source).toContain("getLineItemArtwork");
    expect(source).toContain("Artwork");
  }
});
