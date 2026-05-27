import { getJsonStorageItem, hasBrowserStorage, setJsonStorageItem } from "./browserStorage";
import { getArtworkDisplayName } from "./orderArtwork";

const STORAGE_KEY = "teeCoCustomerArtwork";
const METADATA_STORAGE_KEY = "teeCoCustomerArtworkMeta";

function normalizeStringList(values) {
  if (!Array.isArray(values)) return [];

  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function getFileExtension(fileName) {
  const normalizedName = String(fileName || "").trim().toLowerCase();
  const segments = normalizedName.split(".");
  return segments.length > 1 ? segments.pop() : "";
}

function inferArtworkType(artwork = {}) {
  if (artwork.artworkType) return artwork.artworkType;

  switch (getFileExtension(artwork.file_name || artwork.original_filename || artwork.name)) {
    case "ai":
    case "svg":
      return "Vector";
    case "pdf":
      return "Proof";
    case "png":
    case "jpg":
    case "jpeg":
      return "Raster";
    default:
      return "Artwork";
  }
}

function inferArtworkStatus(artwork = {}) {
  if (artwork.artworkStatus) return artwork.artworkStatus;

  const linkedOrderIds = normalizeStringList(artwork.linkedOrderIds);
  const linkedQuoteIds = normalizeStringList(artwork.linkedQuoteIds);

  if (linkedOrderIds.length || linkedQuoteIds.length) {
    return "Linked";
  }

  return "Library";
}

export function normalizeArtworkRecord(artwork = {}) {
  const linkedOrderIds = normalizeStringList(
    artwork.linkedOrderIds || artwork.linked_order_ids
  );
  const linkedQuoteIds = normalizeStringList(
    artwork.linkedQuoteIds || artwork.linked_quote_ids
  );
  const lastUsedAt =
    typeof artwork.lastUsedAt === "string" && artwork.lastUsedAt.trim()
      ? artwork.lastUsedAt
      : typeof artwork.last_used_at === "string" && artwork.last_used_at.trim()
        ? artwork.last_used_at
        : "";

  return {
    ...artwork,
    linkedOrderIds,
    linkedQuoteIds,
    artworkType:
      typeof artwork.artworkType === "string" && artwork.artworkType.trim()
        ? artwork.artworkType.trim()
        : inferArtworkType(artwork),
    artworkStatus:
      typeof artwork.artworkStatus === "string" && artwork.artworkStatus.trim()
        ? artwork.artworkStatus.trim()
        : inferArtworkStatus({
            ...artwork,
            linkedOrderIds,
            linkedQuoteIds,
          }),
    lastUsedAt,
  };
}

export function getArtworkUsageCount(artwork = {}) {
  const normalizedArtwork = normalizeArtworkRecord(artwork);
  return normalizedArtwork.linkedOrderIds.length + normalizedArtwork.linkedQuoteIds.length;
}

function getArtworkMetadataMap() {
  if (!hasBrowserStorage()) return {};

  const metadata = getJsonStorageItem(METADATA_STORAGE_KEY, {});
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function saveArtworkMetadataMap(metadataMap) {
  if (!hasBrowserStorage()) return false;
  return setJsonStorageItem(METADATA_STORAGE_KEY, metadataMap);
}

function getArtworkMetadataRecord(artworkId) {
  const metadataMap = getArtworkMetadataMap();
  return normalizeArtworkRecord(metadataMap[artworkId] || { id: artworkId });
}

function updateArtworkMetadataRecord(artworkId, updates) {
  const metadataMap = getArtworkMetadataMap();
  const currentRecord = getArtworkMetadataRecord(artworkId);
  const nextRecord = normalizeArtworkRecord({
    ...currentRecord,
    ...updates,
    id: artworkId,
  });

  const nextMetadataMap = {
    ...metadataMap,
    [artworkId]: nextRecord,
  };

  if (!saveArtworkMetadataMap(nextMetadataMap)) {
    throw new Error("Unable to update artwork metadata. Browser storage write failed.");
  }

  return nextRecord;
}

function updateArtworkLinks(artworkId, relationshipKey, nextLinkedIds, options = {}) {
  const currentRecord = getArtworkMetadataRecord(artworkId);
  const normalizedLinkedIds = normalizeStringList(nextLinkedIds);
  const usageCount =
    relationshipKey === "linkedOrderIds"
      ? normalizedLinkedIds.length + currentRecord.linkedQuoteIds.length
      : currentRecord.linkedOrderIds.length + normalizedLinkedIds.length;

  return updateArtworkMetadataRecord(artworkId, {
    [relationshipKey]: normalizedLinkedIds,
    lastUsedAt: options.touchLastUsedAt ? new Date().toISOString() : currentRecord.lastUsedAt,
    artworkStatus:
      currentRecord.artworkStatus && currentRecord.artworkStatus !== "Library"
        ? currentRecord.artworkStatus
        : usageCount
          ? "Linked"
          : "Library",
  });
}

export function mergeArtworkWithOperationalFields(artwork = {}) {
  const normalizedArtwork = normalizeArtworkRecord(artwork);
  const metadataRecord = normalizedArtwork.id
    ? getArtworkMetadataRecord(normalizedArtwork.id)
    : normalizeArtworkRecord({});

  return normalizeArtworkRecord({
    ...normalizedArtwork,
    linkedOrderIds:
      normalizedArtwork.linkedOrderIds.length || artwork.linkedOrderIds
        ? normalizedArtwork.linkedOrderIds
        : metadataRecord.linkedOrderIds,
    linkedQuoteIds:
      normalizedArtwork.linkedQuoteIds.length || artwork.linkedQuoteIds
        ? normalizedArtwork.linkedQuoteIds
        : metadataRecord.linkedQuoteIds,
    artworkType: artwork.artworkType || metadataRecord.artworkType || normalizedArtwork.artworkType,
    artworkStatus:
      artwork.artworkStatus || metadataRecord.artworkStatus || normalizedArtwork.artworkStatus,
    lastUsedAt: artwork.lastUsedAt || metadataRecord.lastUsedAt || normalizedArtwork.lastUsedAt,
  });
}

export function mergeArtworkCollectionWithOperationalFields(artworkCollection = []) {
  if (!Array.isArray(artworkCollection)) return [];
  return artworkCollection.map((artwork) => mergeArtworkWithOperationalFields(artwork));
}

export function getAllCustomerArtwork() {
  if (!hasBrowserStorage()) return [];
  return getJsonStorageItem(STORAGE_KEY, []).map((item) => normalizeArtworkRecord(item));
}

export function saveAllCustomerArtwork(artwork) {
  if (!hasBrowserStorage()) return;
  return setJsonStorageItem(STORAGE_KEY, artwork);
}

export function getCustomerArtwork(customerId) {
  return getAllCustomerArtwork()
    .filter((item) => item.customer_id === customerId)
    .map((item) => mergeArtworkWithOperationalFields(item));
}

export function saveCustomerArtwork(customerId, artworkInput) {
  const currentArtwork = getAllCustomerArtwork();
  const createdAt = new Date().toISOString();
  const displayName = getArtworkDisplayName(artworkInput);
  const fileType = artworkInput.file_type || artworkInput.type || "";
  const fileSize = Number(artworkInput.file_size ?? artworkInput.size ?? 0) || 0;

  const artwork = {
    id: `artwork-${Date.now()}`,
    customer_id: customerId,
    name: displayName,
    display_name: artworkInput.display_name || displayName,
    file_name: artworkInput.file_name || artworkInput.original_filename || displayName,
    original_filename:
      artworkInput.original_filename || artworkInput.file_name || displayName,
    file_type: fileType,
    file_size: fileSize,
    preview: artworkInput.preview || artworkInput.preview_url || "",
    preview_url: artworkInput.preview_url || artworkInput.preview || "",
    asset_url:
      artworkInput.asset_url ||
      artworkInput.url ||
      artworkInput.source_url ||
      artworkInput.preview_url ||
      artworkInput.preview ||
      "",
    source_url:
      artworkInput.source_url ||
      artworkInput.asset_url ||
      artworkInput.url ||
      artworkInput.preview_url ||
      artworkInput.preview ||
      "",
    asset_reference:
      artworkInput.asset_reference ||
      artworkInput.asset_id ||
      artworkInput.asset_url ||
      artworkInput.url ||
      artworkInput.source_url ||
      "",
    placement_hint: artworkInput.placement_hint || "",
    notes: artworkInput.notes || "",
    created_at: createdAt,
    updated_at: createdAt,
    linkedOrderIds: artworkInput.linkedOrderIds || [],
    linkedQuoteIds: artworkInput.linkedQuoteIds || [],
    artworkType: artworkInput.artworkType || "",
    artworkStatus: artworkInput.artworkStatus || "",
    lastUsedAt: artworkInput.lastUsedAt || "",
  };

  const normalizedArtwork = normalizeArtworkRecord(artwork);
  const nextArtwork = [normalizedArtwork, ...currentArtwork];
  if (!saveAllCustomerArtwork(nextArtwork)) {
    throw new Error("Unable to save artwork. Browser storage write failed.");
  }
  return normalizedArtwork;
}

export function removeCustomerArtwork(artworkId) {
  const nextArtwork = getAllCustomerArtwork().filter((item) => item.id !== artworkId);
  return saveAllCustomerArtwork(nextArtwork);
}

export function updateCustomerArtwork(artworkId, updates) {
  const currentArtwork = getAllCustomerArtwork();
  const nextArtwork = currentArtwork.map((item) =>
    item.id === artworkId
      ? normalizeArtworkRecord({
          ...item,
          ...updates,
          updated_at: new Date().toISOString(),
        })
      : item
  );

  if (!saveAllCustomerArtwork(nextArtwork)) {
    throw new Error("Unable to update artwork. Browser storage write failed.");
  }
  return nextArtwork.find((item) => item.id === artworkId);
}

export function linkArtworkToOrder(artworkId, orderId) {
  const normalizedArtworkId = String(artworkId || "").trim();
  const normalizedOrderId = String(orderId || "").trim();

  if (!normalizedArtworkId || !normalizedOrderId) {
    throw new Error("Artwork and order IDs are required to link artwork.");
  }

  const currentRecord = getArtworkMetadataRecord(normalizedArtworkId);
  return updateArtworkLinks(normalizedArtworkId, "linkedOrderIds", [
    ...currentRecord.linkedOrderIds,
    normalizedOrderId,
  ], {
    touchLastUsedAt: true,
  });
}

export function unlinkArtworkFromOrder(artworkId, orderId) {
  const normalizedArtworkId = String(artworkId || "").trim();
  const normalizedOrderId = String(orderId || "").trim();

  if (!normalizedArtworkId || !normalizedOrderId) {
    throw new Error("Artwork and order IDs are required to unlink artwork.");
  }

  const currentRecord = getArtworkMetadataRecord(normalizedArtworkId);
  return updateArtworkLinks(
    normalizedArtworkId,
    "linkedOrderIds",
    currentRecord.linkedOrderIds.filter((linkedId) => linkedId !== normalizedOrderId)
  );
}

export function linkArtworkToQuote(artworkId, quoteId) {
  const normalizedArtworkId = String(artworkId || "").trim();
  const normalizedQuoteId = String(quoteId || "").trim();

  if (!normalizedArtworkId || !normalizedQuoteId) {
    throw new Error("Artwork and quote IDs are required to link artwork.");
  }

  const currentRecord = getArtworkMetadataRecord(normalizedArtworkId);
  return updateArtworkLinks(normalizedArtworkId, "linkedQuoteIds", [
    ...currentRecord.linkedQuoteIds,
    normalizedQuoteId,
  ], {
    touchLastUsedAt: true,
  });
}
