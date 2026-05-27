import { hasBrowserStorage } from "../lib/browserStorage";
import {
  getAllCustomerArtwork,
  getLegacyArtworkMetadataMap,
  mergeArtworkCollectionWithOperationalFields,
  normalizeArtworkRecord,
} from "../lib/customerArtworkStore";
import { addCustomerTimelineEvent } from "../lib/customerTimelineStore";
import { getOperationalAuthUser } from "../lib/operationalAuthStore";
import { getArtworkDisplayName } from "../lib/orderArtwork";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

export const CUSTOMER_ARTWORK_BUCKET = "customer-artwork";
export const CUSTOMER_ARTWORK_TABLE = "customer_artwork";

const SUPPORTED_ARTWORK_EXTENSIONS = new Set(["png", "jpg", "jpeg", "pdf", "svg", "ai"]);
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function normalizeCustomerId(value) {
  return String(value || "").trim();
}

function buildCustomerIdLookupCandidates(customerId) {
  const normalizedCustomerId = normalizeCustomerId(customerId);
  if (!normalizedCustomerId) return [];

  const candidates = [normalizedCustomerId];
  if (/^\d+$/.test(normalizedCustomerId)) {
    candidates.push(`customer-${normalizedCustomerId}`);
  } else if (/^customer-\d+$/.test(normalizedCustomerId)) {
    candidates.push(normalizedCustomerId.replace(/^customer-/, ""));
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function ensureSupabaseArtworkReady() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured for artwork uploads in this workspace.");
  }
}

function getFileExtension(fileName) {
  const normalizedName = String(fileName || "").trim().toLowerCase();
  const segments = normalizedName.split(".");
  return segments.length > 1 ? segments.pop() : "";
}

function sanitizeFileName(fileName) {
  const normalizedName = String(fileName || "artwork")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalizedName || "artwork";
}

function isPreviewableImage(fileName) {
  const extension = getFileExtension(fileName);
  return extension === "png" || extension === "jpg" || extension === "jpeg" || extension === "svg";
}

function buildStoragePath(customerId, fileName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${customerId}/${timestamp}-${sanitizeFileName(fileName)}`;
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function resolveArtworkSourceUrl(artwork = {}) {
  return (
    artwork.source_url ||
    artwork.asset_url ||
    artwork.preview_url ||
    artwork.preview ||
    artwork.url ||
    ""
  );
}

function normalizeOperationalIds(values) {
  if (!Array.isArray(values)) return [];

  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeArtworkRow(row, signedUrl = "") {
  const displayName = getArtworkDisplayName(row);
  const fileName = row?.file_name || row?.original_filename || displayName;
  const previewUrl = isPreviewableImage(fileName) ? signedUrl : "";

  return normalizeArtworkRecord({
    ...row,
    name: displayName,
    display_name: row?.display_name || displayName,
    file_name: fileName,
    original_filename: row?.original_filename || fileName,
    preview: previewUrl,
    preview_url: previewUrl,
    open_url: signedUrl,
    download_url: signedUrl,
    asset_url: signedUrl,
    source_url: signedUrl,
    asset_reference: row?.storage_path || row?.id || "",
    is_previewable_image: isPreviewableImage(fileName),
    file_extension: getFileExtension(fileName),
    file_type: row?.file_type || "",
    file_size: Number(row?.file_size ?? 0) || 0,
    placement_hint: row?.placement_hint || "",
    notes: row?.notes || "",
  });
}

async function createSignedUrl(storagePath) {
  if (!storagePath) return "";

  const { data, error } = await supabase.storage
    .from(CUSTOMER_ARTWORK_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error("Unable to create signed artwork URL", error);
    return "";
  }

  return data?.signedUrl || "";
}

async function fetchCustomerArtworkRowsById(customerId) {
  const { data, error } = await supabase
    .from(CUSTOMER_ARTWORK_TABLE)
    .select("*")
    .eq("customer_id", customerId)
    .order("uploaded_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Unable to load customer artwork.");
  }

  return Array.isArray(data) ? data : [];
}

async function fetchCustomerArtworkRows(customerId) {
  const lookupCandidates = buildCustomerIdLookupCandidates(customerId);
  let matchedCustomerId = "";

  for (const lookupCustomerId of lookupCandidates) {
    console.info("[customerArtworkService] fetchCustomerArtworkRows lookup", {
      requestedCustomerId: normalizeCustomerId(customerId),
      lookupCustomerId,
      query: `.eq("customer_id", "${lookupCustomerId}")`,
    });

    const rows = await fetchCustomerArtworkRowsById(lookupCustomerId);
    if (rows.length > 0) {
      matchedCustomerId = lookupCustomerId;
      console.info("[customerArtworkService] fetchCustomerArtworkRows matched", {
        requestedCustomerId: normalizeCustomerId(customerId),
        matchedCustomerId,
        rowCount: rows.length,
        rowCustomerIds: Array.from(
          new Set(rows.map((row) => normalizeCustomerId(row?.customer_id)).filter(Boolean))
        ),
      });
      return rows;
    }
  }

  console.warn("[customerArtworkService] fetchCustomerArtworkRows found no rows", {
    requestedCustomerId: normalizeCustomerId(customerId),
    lookupCandidates,
  });

  return [];
}

function buildArtworkInsertPayload(customerId, storagePath, file, options = {}) {
  const uploadedAt = options.uploadedAt || new Date().toISOString();
  const uploadedBy =
    options.uploadedBy ||
    getOperationalAuthUser()?.name ||
    getOperationalAuthUser()?.email ||
    getOperationalAuthUser()?.id ||
    null;
  const displayName = options.displayName || file.name;
  const originalFilename = options.originalFilename || file.name;
  const linkedOrderIds = normalizeOperationalIds(options.linkedOrderIds);
  const linkedQuoteIds = normalizeOperationalIds(options.linkedQuoteIds);
  const lastUsedAt = options.lastUsedAt || "";
  const usageCount = linkedOrderIds.length + linkedQuoteIds.length;
  const artworkStatus =
    options.artworkStatus ||
    (usageCount ? "Linked" : "Library");

  return {
    customer_id: customerId,
    file_name: file.name,
    display_name: displayName,
    original_filename: originalFilename,
    file_type: file.type || options.fileType || "",
    file_size: Number(options.fileSize ?? file.size ?? 0) || 0,
    storage_path: storagePath,
    uploaded_at: uploadedAt,
    uploaded_by: uploadedBy,
    placement_hint: options.placementHint || "",
    notes: options.notes || "",
    linked_order_ids: linkedOrderIds,
    linked_quote_ids: linkedQuoteIds,
    artwork_type: options.artworkType || "",
    artwork_status: artworkStatus,
    last_used_at: lastUsedAt || null,
    legacy_local_artwork_id: options.legacyLocalArtworkId || null,
    updated_at: new Date().toISOString(),
  };
}

async function hydrateArtworkRows(rows) {
  const signedUrls = await Promise.all(rows.map((row) => createSignedUrl(row.storage_path)));
  return mergeArtworkCollectionWithOperationalFields(
    rows.map((row, index) => normalizeArtworkRow(row, signedUrls[index] || ""))
  );
}

async function buildFileFromLegacyArtwork(artwork) {
  const sourceUrl = resolveArtworkSourceUrl(artwork);
  if (!sourceUrl || !hasBrowserStorage()) return null;

  try {
    const response = await fetch(sourceUrl);
    const blob = await response.blob();
    if (!blob.size) return null;

    return new File([blob], artwork.file_name || artwork.original_filename || artwork.name || "artwork", {
      type: artwork.file_type || blob.type || "application/octet-stream",
      lastModified: new Date(artwork.created_at || Date.now()).getTime(),
    });
  } catch (error) {
    console.error("Unable to reconstruct legacy artwork file for migration", error);
    return null;
  }
}

function buildLegacyArtworkRecords(customerId) {
  const legacyMetadataMap = getLegacyArtworkMetadataMap();
  const normalizedCustomerId = normalizeCustomerId(customerId);

  return getAllCustomerArtwork()
    .filter((artwork) => !normalizedCustomerId || artwork.customer_id === normalizedCustomerId)
    .map((artwork) =>
      normalizeArtworkRecord({
        ...artwork,
        ...(legacyMetadataMap[artwork.id] || {}),
      })
    );
}

async function migrateLegacyArtworkRecord(customerId, artwork) {
  const legacyFile = await buildFileFromLegacyArtwork(artwork);
  if (!legacyFile) return null;

  return uploadCustomerArtwork(customerId, legacyFile, {
    displayName: artwork.display_name || artwork.name || artwork.file_name,
    originalFilename: artwork.original_filename || artwork.file_name,
    placementHint: artwork.placement_hint,
    notes: artwork.notes,
    linkedOrderIds: artwork.linkedOrderIds,
    linkedQuoteIds: artwork.linkedQuoteIds,
    artworkType: artwork.artworkType,
    artworkStatus: artwork.artworkStatus,
    lastUsedAt: artwork.lastUsedAt,
    uploadedAt: artwork.created_at || artwork.uploaded_at,
    uploadedBy: artwork.uploaded_by || "Legacy migration",
    legacyLocalArtworkId: artwork.id,
    fileSize: artwork.file_size,
    fileType: artwork.file_type,
    skipTimelineEvent: true,
  });
}

async function migrateLegacyArtworkForCustomer(customerId, existingRows = []) {
  if (!hasBrowserStorage() || !customerId) return 0;

  const migratedLegacyIds = new Set(
    existingRows
      .map((row) => String(row?.legacy_local_artwork_id || "").trim())
      .filter(Boolean)
  );
  const legacyArtwork = buildLegacyArtworkRecords(customerId).filter((artwork) => {
    const legacyId = String(artwork.id || "").trim();
    return legacyId && !migratedLegacyIds.has(legacyId);
  });

  let migratedCount = 0;
  for (const artwork of legacyArtwork) {
    try {
      const migratedArtwork = await migrateLegacyArtworkRecord(customerId, artwork);
      if (migratedArtwork?.id) {
        migratedCount += 1;
      }
    } catch (error) {
      console.error("Unable to migrate legacy artwork record to Supabase", {
        artworkId: artwork.id,
        customerId,
        error,
      });
    }
  }

  return migratedCount;
}

async function findArtworkRow(artworkId) {
  const normalizedArtworkId = String(artworkId || "").trim();
  if (!normalizedArtworkId) return null;

  let query = supabase.from(CUSTOMER_ARTWORK_TABLE).select("*").limit(1);
  query = looksLikeUuid(normalizedArtworkId)
    ? query.eq("id", normalizedArtworkId)
    : query.eq("legacy_local_artwork_id", normalizedArtworkId);

  let { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(error.message || "Unable to load artwork details.");
  }

  if (!data && looksLikeUuid(normalizedArtworkId)) {
    const fallbackResult = await supabase
      .from(CUSTOMER_ARTWORK_TABLE)
      .select("*")
      .eq("legacy_local_artwork_id", normalizedArtworkId)
      .limit(1)
      .maybeSingle();

    if (fallbackResult.error) {
      throw new Error(fallbackResult.error.message || "Unable to load artwork details.");
    }

    data = fallbackResult.data || null;
  }

  if (!data && hasBrowserStorage()) {
    const legacyArtwork = buildLegacyArtworkRecords().find(
      (artwork) => String(artwork.id || "").trim() === normalizedArtworkId
    );
    if (legacyArtwork?.customer_id) {
      await migrateLegacyArtworkRecord(legacyArtwork.customer_id, legacyArtwork);
      return findArtworkRow(artworkId);
    }
  }

  return data || null;
}

function buildRelationshipUpdatePayload(row, relationshipKey, relatedId) {
  const normalizedRelatedId = String(relatedId || "").trim();
  const linkedOrderIds = normalizeOperationalIds(
    relationshipKey === "linked_order_ids"
      ? [...normalizeOperationalIds(row?.linked_order_ids), normalizedRelatedId]
      : row?.linked_order_ids
  );
  const linkedQuoteIds = normalizeOperationalIds(
    relationshipKey === "linked_quote_ids"
      ? [...normalizeOperationalIds(row?.linked_quote_ids), normalizedRelatedId]
      : row?.linked_quote_ids
  );
  const usageCount = linkedOrderIds.length + linkedQuoteIds.length;
  const currentStatus = String(row?.artwork_status || "").trim();

  return {
    linked_order_ids: linkedOrderIds,
    linked_quote_ids: linkedQuoteIds,
    last_used_at: new Date().toISOString(),
    artwork_status:
      currentStatus && currentStatus !== "Library"
        ? currentStatus
        : usageCount
          ? "Linked"
          : "Library",
    updated_at: new Date().toISOString(),
  };
}

async function updateArtworkRelationship(artworkId, relationshipKey, relatedId, eventType) {
  ensureSupabaseArtworkReady();

  const normalizedArtworkId = String(artworkId || "").trim();
  const normalizedRelatedId = String(relatedId || "").trim();

  if (!normalizedArtworkId || !normalizedRelatedId) {
    throw new Error("Artwork and related record IDs are required.");
  }

  const artworkRow = await findArtworkRow(normalizedArtworkId);
  if (!artworkRow) {
    throw new Error("Artwork record could not be found for relationship update.");
  }

  const currentIds = normalizeOperationalIds(artworkRow?.[relationshipKey]);
  if (currentIds.includes(normalizedRelatedId)) {
    const signedUrl = await createSignedUrl(artworkRow.storage_path);
    return normalizeArtworkRow(artworkRow, signedUrl);
  }

  const payload = buildRelationshipUpdatePayload(artworkRow, relationshipKey, normalizedRelatedId);
  const { data, error } = await supabase
    .from(CUSTOMER_ARTWORK_TABLE)
    .update(payload)
    .eq("id", artworkRow.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message || "Unable to update artwork relationship.");
  }

  addCustomerTimelineEvent(data.customer_id, {
    eventType,
    summary:
      eventType === "artwork_linked_to_quote"
        ? `Artwork linked to quote ${normalizedRelatedId}.`
        : `Artwork linked to order ${normalizedRelatedId}.`,
    metadata: {
      artworkId: data.id,
      artworkName: data.file_name || data.display_name || "Customer artwork",
      [eventType === "artwork_linked_to_quote" ? "quoteId" : "orderId"]: normalizedRelatedId,
      source: "supabase",
    },
  });

  const signedUrl = await createSignedUrl(data.storage_path);
  return normalizeArtworkRow(data, signedUrl);
}

export function isSupportedArtworkFile(file) {
  return SUPPORTED_ARTWORK_EXTENSIONS.has(getFileExtension(file?.name));
}

export function getArtworkUploadAcceptValue() {
  return ".png,.jpg,.jpeg,.pdf,.svg,.ai,image/png,image/jpeg,application/pdf,image/svg+xml";
}

export async function listCustomerArtwork(customerId) {
  ensureSupabaseArtworkReady();

  const normalizedCustomerId = normalizeCustomerId(customerId);
  if (!normalizedCustomerId) return [];

  console.info("[customerArtworkService] listCustomerArtwork start", {
    customerId,
    normalizedCustomerId,
    lookupCandidates: buildCustomerIdLookupCandidates(normalizedCustomerId),
  });

  let rows = await fetchCustomerArtworkRows(normalizedCustomerId);
  const migratedCount = await migrateLegacyArtworkForCustomer(normalizedCustomerId, rows);
  if (migratedCount) {
    rows = await fetchCustomerArtworkRows(normalizedCustomerId);
  }

  console.info("[customerArtworkService] listCustomerArtwork complete", {
    customerId,
    normalizedCustomerId,
    rowCount: rows.length,
    rowCustomerIds: Array.from(
      new Set(rows.map((row) => normalizeCustomerId(row?.customer_id)).filter(Boolean))
    ),
  });

  return hydrateArtworkRows(rows);
}

export async function uploadCustomerArtwork(customerId, file, options = {}) {
  ensureSupabaseArtworkReady();

  if (!customerId) {
    throw new Error("A customer must be selected before artwork can be uploaded.");
  }

  if (!file) {
    throw new Error("Select a file to upload.");
  }

  if (!isSupportedArtworkFile(file)) {
    throw new Error("Supported artwork formats are PNG, JPG, PDF, SVG, and AI.");
  }

  const storagePath = buildStoragePath(customerId, options.fileName || file.name);

  const { error: uploadError } = await supabase.storage
    .from(CUSTOMER_ARTWORK_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || options.fileType || undefined,
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Unable to upload artwork file.");
  }

  const insertPayload = buildArtworkInsertPayload(customerId, storagePath, file, options);
  const { data, error } = await supabase
    .from(CUSTOMER_ARTWORK_TABLE)
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    const cleanupResult = await supabase.storage
      .from(CUSTOMER_ARTWORK_BUCKET)
      .remove([storagePath]);

    if (cleanupResult?.error) {
      console.error("Artwork cleanup failed after metadata insert error", cleanupResult.error);
    }

    throw new Error(error.message || "Artwork uploaded, but metadata could not be saved.");
  }

  const signedUrl = await createSignedUrl(storagePath);
  const uploadedArtwork = normalizeArtworkRow(data, signedUrl);

  if (!options.skipTimelineEvent) {
    const operationalUser = getOperationalAuthUser();

    addCustomerTimelineEvent(customerId, {
      eventType: "artwork_uploaded",
      actor: operationalUser
        ? {
            id: operationalUser.id,
            name: operationalUser.name,
            role: operationalUser.role,
            email: operationalUser.email,
            type: "staff",
          }
        : undefined,
      summary: `Artwork uploaded: ${uploadedArtwork.file_name || file.name}.`,
      metadata: {
        artworkId: uploadedArtwork.id,
        fileName: uploadedArtwork.file_name || file.name,
        fileType: uploadedArtwork.file_type || file.type || "",
        fileSize: uploadedArtwork.file_size || file.size || 0,
        storagePath,
        uploadedBy: data.uploaded_by || null,
        source: "supabase",
      },
    });
  }

  return uploadedArtwork;
}

export async function linkCustomerArtworkToOrder(artworkId, orderId) {
  return updateArtworkRelationship(
    artworkId,
    "linked_order_ids",
    orderId,
    "artwork_linked_to_order"
  );
}

export async function linkCustomerArtworkToQuote(artworkId, quoteId) {
  return updateArtworkRelationship(
    artworkId,
    "linked_quote_ids",
    quoteId,
    "artwork_linked_to_quote"
  );
}
