import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { addCustomerTimelineEvent } from "../lib/customerTimelineStore";
import { mergeArtworkCollectionWithOperationalFields } from "../lib/customerArtworkStore";
import { getOperationalAuthUser } from "../lib/operationalAuthStore";

export const CUSTOMER_ARTWORK_BUCKET = "customer-artwork";
export const CUSTOMER_ARTWORK_TABLE = "customer_artwork";

const SUPPORTED_ARTWORK_EXTENSIONS = new Set(["png", "jpg", "jpeg", "pdf", "svg", "ai"]);
const SIGNED_URL_TTL_SECONDS = 60 * 60;

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

function normalizeArtworkRow(row, signedUrl = "") {
  return {
    ...row,
    preview_url: isPreviewableImage(row?.file_name) ? signedUrl : "",
    open_url: signedUrl,
    download_url: signedUrl,
    is_previewable_image: isPreviewableImage(row?.file_name),
    file_extension: getFileExtension(row?.file_name),
  };
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

export function isSupportedArtworkFile(file) {
  return SUPPORTED_ARTWORK_EXTENSIONS.has(getFileExtension(file?.name));
}

export function getArtworkUploadAcceptValue() {
  return ".png,.jpg,.jpeg,.pdf,.svg,.ai,image/png,image/jpeg,application/pdf,image/svg+xml";
}

export async function listCustomerArtwork(customerId) {
  ensureSupabaseArtworkReady();

  if (!customerId) return [];

  const { data, error } = await supabase
    .from(CUSTOMER_ARTWORK_TABLE)
    .select("id, customer_id, file_name, storage_path, uploaded_at, uploaded_by")
    .eq("customer_id", customerId)
    .order("uploaded_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Unable to load customer artwork.");
  }

  const rows = Array.isArray(data) ? data : [];
  const signedUrls = await Promise.all(
    rows.map((row) => createSignedUrl(row.storage_path))
  );

  return mergeArtworkCollectionWithOperationalFields(
    rows.map((row, index) => normalizeArtworkRow(row, signedUrls[index] || ""))
  );
}

export async function uploadCustomerArtwork(customerId, file) {
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

  const storagePath = buildStoragePath(customerId, file.name);
  const operationalUser = getOperationalAuthUser();
  const uploadedBy =
    operationalUser?.name || operationalUser?.email || operationalUser?.id || null;

  const { error: uploadError } = await supabase.storage
    .from(CUSTOMER_ARTWORK_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Unable to upload artwork file.");
  }

  const { data, error } = await supabase
    .from(CUSTOMER_ARTWORK_TABLE)
    .insert({
      customer_id: customerId,
      file_name: file.name,
      storage_path: storagePath,
      uploaded_at: new Date().toISOString(),
      uploaded_by: uploadedBy,
    })
    .select("id, customer_id, file_name, storage_path, uploaded_at, uploaded_by")
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
  const uploadedArtwork = mergeArtworkCollectionWithOperationalFields([
    normalizeArtworkRow(data, signedUrl),
  ])[0];

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
      fileType: file.type || "",
      fileSize: file.size || 0,
      storagePath,
      uploadedBy,
      source: "supabase",
    },
  });

  return uploadedArtwork;
}
