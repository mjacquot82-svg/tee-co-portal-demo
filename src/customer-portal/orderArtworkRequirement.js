import { needsArtworkCreation, getArtworkDescription } from "../lib/artworkDesignRequest.js";
const UNDECORATED_TYPES = new Set([
  "blank",
  "blank garment",
  "no decoration",
  "none",
  "undecorated",
]);

function normalizeText(value) {
  return String(value || "").trim();
}

export function isDecoratedOrderLineItem(lineItem = {}) {
  const decorationType = normalizeText(
    lineItem.decoration_type || lineItem.decorationType
  ).toLowerCase();

  return Boolean(decorationType) && !UNDECORATED_TYPES.has(decorationType);
}

export function hasCustomerOrderArtwork(lineItems = [], artworkLibrary = []) {
  const hasAssignedArtwork = (Array.isArray(lineItems) ? lineItems : []).some(
    (lineItem) =>
      Boolean(
        normalizeText(lineItem?.artwork_id || lineItem?.artworkId) ||
          normalizeText(lineItem?.artwork_name || lineItem?.artworkName)
      )
  );
  const hasLibraryArtwork = (Array.isArray(artworkLibrary) ? artworkLibrary : []).some(
    (asset) =>
      Boolean(
        normalizeText(asset?.id) ||
          normalizeText(asset?.displayName || asset?.display_name) ||
          normalizeText(asset?.originalFilename || asset?.original_filename)
      )
  );

  return hasAssignedArtwork || hasLibraryArtwork;
}

export function requiresCustomerOrderArtwork(lineItems = [], artworkLibrary = []) {
  const decoratedItems = (Array.isArray(lineItems) ? lineItems : []).filter(
    isDecoratedOrderLineItem
  );

  if (decoratedItems.some((item) => needsArtworkCreation(item) && !getArtworkDescription(item))) return true;
  const uploadItems = decoratedItems.filter((item) => !needsArtworkCreation(item));
  // Legacy single-garment drafts may carry the upload only in the library.
  // Multiple garments must each explicitly select artwork or request creation.
  const legacyLibrary = decoratedItems.length === 1 ? artworkLibrary : [];
  return uploadItems.some((item) => !hasCustomerOrderArtwork([item], legacyLibrary));
}
