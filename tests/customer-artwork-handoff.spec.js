// @ts-check
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  clearPendingCustomerArtwork,
  getPendingCustomerArtwork,
  savePendingCustomerArtwork,
} from "../src/lib/pendingCustomerArtworkStore.js";
import {
  normalizePendingCustomerRequest,
  reconcilePendingLineItemArtwork,
  upsertPendingCustomerLineItem,
} from "../src/lib/pendingCustomerRequestStore.js";

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

test("selection review persists the file and authenticated review restores it", () => {
  const previewSource = fs.readFileSync(path.resolve(process.cwd(), "src/pages/OrderPreview.jsx"), "utf8");
  const requestSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/customer-portal/CustomerPortalRequestOrder.jsx"),
    "utf8"
  );

  expect(previewSource).toContain("savePendingCustomerArtwork(artwork.file)");
  expect(requestSource).toContain("getPendingCustomerArtwork()");
  expect(requestSource).toContain('setArtworkOption("upload_now")');
  expect(requestSource).toContain("setArtworkCarriedForward(true)");
  expect(requestSource).toContain('label="Submission File" value={artworkFile?.name || pendingRequest?.artworkName || "None"}');
  expect(requestSource).not.toContain('ReviewItem label="Customer Selected"');
  expect(requestSource).toContain("artworkCarriedForward && artworkFile && !isReplacingArtwork");
  expect(requestSource).toContain("Current uploaded artwork: {artworkFile.name}");
  expect(requestSource).toContain("It will be securely attached when you submit.");
  expect(requestSource).toContain("Replace Artwork");
  expect(requestSource).toContain("setIsReplacingArtwork(true)");
  expect(requestSource).toContain('artworkOption === "upload_now" && (!artworkCarriedForward || isReplacingArtwork)');
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

  expect(requestSource).toContain('artwork_name: item.artworkName === pendingRequest.artworkName ? item.artworkName : ""');
  expect(requestSource).toContain("artworkName: lineItem.artwork_name");
  expect(requestSource).toContain('label="Artwork" value={lineItem.artwork_name || "No artwork selected for this garment"}');
  expect(requestSource).toContain("const hasGarmentArtworkReferences");
  expect(requestSource).toContain('artwork_id: lineArtworkName ? uploadedArtwork?.id || "" : ""');
});

test("one order artwork can be shared while conflicting garment references are removed", () => {
  const lineItems = [
    { id: "hoodie", productId: "hoodie", garmentName: "Hoodie", artworkName: "opa.png" },
    { id: "shirt", productId: "shirt", garmentName: "T-Shirt", artworkName: "qr.png" },
    { id: "hat", productId: "hat", garmentName: "Hat", artworkName: "qr.png" },
  ];

  const reconciled = reconcilePendingLineItemArtwork(lineItems, "qr.png");
  expect(reconciled.map((item) => item.artworkName)).toEqual(["", "qr.png", "qr.png"]);
});
