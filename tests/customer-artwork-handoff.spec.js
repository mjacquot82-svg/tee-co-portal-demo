// @ts-check
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  clearPendingCustomerArtwork,
  getPendingCustomerArtwork,
  getPendingCustomerArtworkAssets,
  savePendingCustomerArtwork,
  savePendingCustomerArtworkAsset,
} from "../src/lib/pendingCustomerArtworkStore.js";
import {
  normalizePendingCustomerRequest,
  upsertPendingCustomerLineItem,
} from "../src/lib/pendingCustomerRequestStore.js";

test("garment configuration offers existing artwork or a new upload", () => {
  const previewSource = fs.readFileSync(path.resolve(process.cwd(), "src/pages/OrderPreview.jsx"), "utf8");

  expect(previewSource).toContain("Choose Existing Artwork");
  expect(previewSource).toContain("Upload New Artwork");
  expect(previewSource).toContain("artworkId: selectedArtwork?.id");
  expect(previewSource).toContain("artworkLibrary: nextArtworkLibrary");
});

test("pending artwork survives the route handoff without JSON serialization", async () => {
  const artwork = {
    name: "opa.png",
    type: "image/png",
    lastModified: Date.now(),
    marker: "file-object",
  };

  await clearPendingCustomerArtwork();
  expect(await savePendingCustomerArtwork(artwork)).toBe(true);
  expect(await getPendingCustomerArtwork()).toBe(artwork);
  expect(await clearPendingCustomerArtwork()).toBe(true);
  expect(await getPendingCustomerArtwork()).toBeNull();
});

test("multiple pending artwork files survive the route handoff", async () => {
  const logo = { name: "logo.png", type: "image/png", lastModified: Date.now() };
  const back = { name: "back.pdf", type: "application/pdf", lastModified: Date.now() };
  await clearPendingCustomerArtwork();
  expect(await savePendingCustomerArtworkAsset("artwork-a", logo)).toBe(true);
  expect(await savePendingCustomerArtworkAsset("artwork-b", back)).toBe(true);
  expect(await getPendingCustomerArtworkAssets()).toEqual([
    expect.objectContaining({ id: "artwork-a", file: logo }),
    expect.objectContaining({ id: "artwork-b", file: back }),
  ]);
  await clearPendingCustomerArtwork();
});

test("selection review persists the file and authenticated review restores it", () => {
  const previewSource = fs.readFileSync(path.resolve(process.cwd(), "src/pages/OrderPreview.jsx"), "utf8");
  const requestSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/customer-portal/CustomerPortalRequestOrder.jsx"),
    "utf8"
  );

  expect(previewSource).toContain("savePendingCustomerArtworkAsset(artwork.id, artwork.file)");
  expect(requestSource).toContain("getPendingCustomerArtworkAssets()");
  expect(requestSource).toContain('data-testid="final-review-artwork-library"');
  expect(requestSource).not.toContain('ReviewItem label="Customer Selected"');
  expect(requestSource).toContain("uploadedByDraftId");
  expect(requestSource).toContain("artwork_library: artworkLibrary");
  expect(requestSource).toContain("await clearPendingCustomerArtwork()");
});

test("garment artwork references survive adding and editing line items", () => {
  const hoodie = {
    id: "hoodie",
    productId: "gildan-hoodie",
    garmentName: "Gildan Hoodie",
    size_breakdown: { S: 2, M: 3 },
    artworkName: "hoodie-logo.png",
  };
  const shirt = {
    id: "shirt",
    productId: "bella-shirt",
    garmentName: "Bella Canvas T-Shirt",
    size_breakdown: { L: 4 },
  };

  const withTwoGarments = upsertPendingCustomerLineItem([hoodie], shirt);
  expect(withTwoGarments).toHaveLength(2);
  expect(withTwoGarments[0].artworkName).toBe("hoodie-logo.png");
  expect(withTwoGarments[1].artworkName).toBe("");

  const edited = upsertPendingCustomerLineItem(withTwoGarments, {
    ...withTwoGarments[0],
    size_breakdown: { S: 2, M: 4 },
  });
  const restored = normalizePendingCustomerRequest({
    artworkName: "hoodie-logo.png",
    lineItems: edited,
  });
  expect(restored.lineItems[0].artworkName).toBe("hoodie-logo.png");
  expect(restored.lineItems[0].size_breakdown).toEqual({ S: 2, M: 4 });
});

test("review and submission associate existing artwork with its garment", () => {
  const requestSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/customer-portal/CustomerPortalRequestOrder.jsx"),
    "utf8"
  );

  expect(requestSource).toContain('artwork_id: item.artworkId || ""');
  expect(requestSource).toContain('artwork_name: item.artworkName || ""');
  expect(requestSource).toContain('label="Artwork" value={lineItem.artwork_name || "No artwork selected for this garment"}');
  expect(requestSource).toContain("persistedIdByDraftId");
  expect(requestSource).toContain("artwork_id: artworkId");
  expect(requestSource).toContain("artwork_library: artworkLibrary");
});

test("one order artwork can be shared by multiple garment references", () => {
  const lineItems = [
    { id: "hoodie", productId: "hoodie", garmentName: "Hoodie", artworkId: "artwork-a", artworkName: "Company Logo" },
    { id: "jacket", productId: "jacket", garmentName: "Jacket", artworkId: "artwork-b", artworkName: "Back Logo" },
    { id: "hat", productId: "hat", garmentName: "Hat", artworkId: "artwork-a", artworkName: "Company Logo" },
  ];
  const restored = normalizePendingCustomerRequest({
    artworkLibrary: [
      { id: "artwork-a", displayName: "Company Logo", originalFilename: "logo.png" },
      { id: "artwork-b", displayName: "Back Logo", originalFilename: "back.pdf" },
    ],
    lineItems,
  });
  expect(restored.lineItems.map((item) => item.artworkId)).toEqual(["artwork-a", "artwork-b", "artwork-a"]);
});
