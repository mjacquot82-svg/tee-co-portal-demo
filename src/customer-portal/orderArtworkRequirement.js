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

// Decorated garments with no artwork selected and no design request.
// Customers may submit these; Tee & Co follows up about artwork (Marc, Oct 2026).
export function getLineItemsNeedingArtworkFollowUp(lineItems = [], artworkLibrary = []) {
  const decoratedItems = (Array.isArray(lineItems) ? lineItems : []).filter(
    isDecoratedOrderLineItem
  );
  const uploadItems = decoratedItems.filter((item) => !needsArtworkCreation(item));
  // Legacy single-garment drafts may carry the upload only in the library.
  // Multiple garments must each explicitly select artwork or request creation.
  const legacyLibrary = decoratedItems.length === 1 ? artworkLibrary : [];
  return uploadItems.filter((item) => !hasCustomerOrderArtwork([item], legacyLibrary));
}

// Only an incomplete design request still blocks submission: a garment that
// asks Tee & Co to create artwork must describe the design. Missing artwork
// alone no longer blocks (see getLineItemsNeedingArtworkFollowUp).
export function requiresCustomerOrderArtwork(lineItems = []) {
  return (Array.isArray(lineItems) ? lineItems : [])
    .filter(isDecoratedOrderLineItem)
    .some((item) => needsArtworkCreation(item) && !getArtworkDescription(item));
}
