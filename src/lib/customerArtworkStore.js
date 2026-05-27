import { getJsonStorageItem, hasBrowserStorage, setJsonStorageItem } from "./browserStorage";
import { customerIdsEqual, normalizeCustomerId } from "./customerIds";
import { addCustomerTimelineEvent } from "./customerTimelineStore";
import { getArtworkDisplayName } from "./orderArtwork";

export const LEGACY_CUSTOMER_ARTWORK_STORAGE_KEY = "teeCoCustomerArtwork";
export const LEGACY_CUSTOMER_ARTWORK_METADATA_STORAGE_KEY = "teeCoCustomerArtworkMeta";

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
    customer_id: normalizeCustomerId(artwork.customer_id),
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
    artworkApprovalStatus:
      typeof artwork.artworkApprovalStatus === "string" && artwork.artworkApprovalStatus.trim()
        ? artwork.artworkApprovalStatus.trim()
        : typeof artwork.artwork_approval_status === "string" &&
            artwork.artwork_approval_status.trim()
          ? artwork.artwork_approval_status.trim()
          : "Pending Review",
    lastUsedAt,
  };
}

export function getArtworkUsageCount(artwork = {}) {
  const normalizedArtwork = normalizeArtworkRecord(artwork);
  return normalizedArtwork.linkedOrderIds.length + normalizedArtwork.linkedQuoteIds.length;
}

function getArtworkMetadataMap() {
  if (!hasBrowserStorage()) return {};

  const metadata = getJsonStorageItem(LEGACY_CUSTOMER_ARTWORK_METADATA_STORAGE_KEY, {});
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

export function getLegacyArtworkMetadataMap() {
  return getArtworkMetadataMap();
}

function saveArtworkMetadataMap(metadataMap) {
  if (!hasBrowserStorage()) return false;
  return setJsonStorageItem(LEGACY_CUSTOMER_ARTWORK_METADATA_STORAGE_KEY, metadataMap);
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

export function updateArtworkApprovalStatus(artworkId, artworkApprovalStatus) {
  const normalizedArtworkId = String(artworkId || "").trim();

  if (!normalizedArtworkId) {
    throw new Error("Artwork ID is required to update approval status.");
  }

  return updateArtworkMetadataRecord(normalizedArtworkId, {
    artworkApprovalStatus,
    artwork_approval_status: artworkApprovalStatus,
    updated_at: new Date().toISOString(),
  });
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
  return normalizeArtworkRecord(artwork);
}

export function mergeArtworkCollectionWithOperationalFields(artworkCollection = []) {
  if (!Array.isArray(artworkCollection)) return [];
  return artworkCollection.map((artwork) => normalizeArtworkRecord(artwork));
}

export function getAllCustomerArtwork() {
  if (!hasBrowserStorage()) return [];
  return getJsonStorageItem(LEGACY_CUSTOMER_ARTWORK_STORAGE_KEY, []).map((item) =>
    normalizeArtworkRecord(item)
  );
}

function findArtworkRecord(artworkId) {
  const normalizedArtworkId = String(artworkId || "").trim();
  if (!normalizedArtworkId) return null;

  return getAllCustomerArtwork().find((item) => item.id === normalizedArtworkId) || null;
}

export function saveAllCustomerArtwork(artwork) {
  if (!hasBrowserStorage()) return;
  return setJsonStorageItem(LEGACY_CUSTOMER_ARTWORK_STORAGE_KEY, artwork);
}

export function getCustomerArtwork(customerId) {
  const normalizedCustomerId = normalizeCustomerId(customerId);

  return getAllCustomerArtwork()
    .filter((item) => customerIdsEqual(item.customer_id, normalizedCustomerId))
    .map((item) => mergeArtworkWithOperationalFields(item));
}

export function saveCustomerArtwork(customerId, artworkInput) {
  const normalizedCustomerId = normalizeCustomerId(customerId);
  const currentArtwork = getAllCustomerArtwork();
  const createdAt = new Date().toISOString();
  const displayName = getArtworkDisplayName(artworkInput);
  const fileType = artworkInput.file_type || artworkInput.type || "";
  const fileSize = Number(artworkInput.file_size ?? artworkInput.size ?? 0) || 0;

  const artwork = {
    id: `artwork-${Date.now()}`,
    customer_id: normalizedCustomerId,
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

  addCustomerTimelineEvent(normalizedCustomerId, {
    eventType: "artwork_uploaded",
    summary: `Artwork uploaded: ${normalizedArtwork.file_name || normalizedArtwork.name || "Untitled file"}.`,
    metadata: {
      artworkId: normalizedArtwork.id,
      fileName: normalizedArtwork.file_name || normalizedArtwork.name,
      fileType: normalizedArtwork.file_type,
      fileSize: normalizedArtwork.file_size,
      artworkType: normalizedArtwork.artworkType,
      source: "local",
    },
  });

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
  const alreadyLinked = currentRecord.linkedOrderIds.includes(normalizedOrderId);
  const nextRecord = alreadyLinked
    ? currentRecord
    : updateArtworkLinks(
        normalizedArtworkId,
        "linkedOrderIds",
        [...currentRecord.linkedOrderIds, normalizedOrderId],
        {
          touchLastUsedAt: true,
        }
      );
  const artworkRecord = findArtworkRecord(normalizedArtworkId);

  if (!alreadyLinked && artworkRecord?.customer_id) {
    addCustomerTimelineEvent(artworkRecord.customer_id, {
      eventType: "artwork_linked_to_order",
      summary: `Artwork linked to order ${normalizedOrderId}.`,
      metadata: {
        artworkId: normalizedArtworkId,
        artworkName: artworkRecord.file_name || artworkRecord.name,
        orderId: normalizedOrderId,
      },
    });
  }

  return nextRecord;
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
  const alreadyLinked = currentRecord.linkedQuoteIds.includes(normalizedQuoteId);
  const nextRecord = alreadyLinked
    ? currentRecord
    : updateArtworkLinks(
        normalizedArtworkId,
        "linkedQuoteIds",
        [...currentRecord.linkedQuoteIds, normalizedQuoteId],
        {
          touchLastUsedAt: true,
        }
      );
  const artworkRecord = findArtworkRecord(normalizedArtworkId);

  if (!alreadyLinked && artworkRecord?.customer_id) {
    addCustomerTimelineEvent(artworkRecord.customer_id, {
      eventType: "artwork_linked_to_quote",
      summary: `Artwork linked to quote ${normalizedQuoteId}.`,
      metadata: {
        artworkId: normalizedArtworkId,
        artworkName: artworkRecord.file_name || artworkRecord.name,
        quoteId: normalizedQuoteId,
      },
    });
  }

  return nextRecord;
}
