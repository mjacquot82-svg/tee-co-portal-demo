// @ts-check
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  clearPendingCustomerArtwork,
  getPendingCustomerArtwork,
  savePendingCustomerArtwork,
} from "../src/lib/pendingCustomerArtworkStore.js";

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
  expect(requestSource).toContain('value={artworkFile?.name || "None"}');
  expect(requestSource).toContain("artworkCarriedForward && artworkFile && !isReplacingArtwork");
  expect(requestSource).toContain("Current uploaded artwork: {artworkFile.name}");
  expect(requestSource).toContain("It will be securely attached when you submit.");
  expect(requestSource).toContain("Replace Artwork");
  expect(requestSource).toContain("setIsReplacingArtwork(true)");
  expect(requestSource).toContain('artworkOption === "upload_now" && (!artworkCarriedForward || isReplacingArtwork)');
  expect(requestSource).toContain("await clearPendingCustomerArtwork()");
});
