import { Buffer } from "node:buffer";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_IMAGES_BUCKET = "product-images";
const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function cleanPin(value) {
  return normalizeText(value).replace(/\D/g, "").slice(0, 4);
}

function normalizeRole(value) {
  return normalizeText(value).toLowerCase();
}

function isAllowedStaffRole(value) {
  return ["owner", "manager"].includes(normalizeRole(value));
}

function isActiveStaffRow(row = {}) {
  if (typeof row.active === "boolean") return row.active;
  return normalizeText(row.status || "Active").toLowerCase() !== "inactive";
}

function normalizeFileName(fileName) {
  const fallbackName = "product-image";
  const normalizedName = normalizeText(fileName || fallbackName)
    .replace(/[/\\]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalizedName || fallbackName;
}

function normalizePathSegment(value, fallback = "draft") {
  const normalizedValue = normalizeText(value || fallback)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalizedValue || fallback;
}

function buildStoragePath({ productId, fileName }) {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return [
    "products",
    normalizePathSegment(productId),
    `${Date.now()}-${randomId}-${normalizeFileName(fileName)}`,
  ].join("/");
}

function parseBase64Image(fileData) {
  const rawFileData = normalizeText(fileData);
  if (!rawFileData) return null;

  const [, dataUriPayload = ""] = rawFileData.match(/^data:[^;]+;base64,(.+)$/) || [];
  const base64Payload = dataUriPayload || rawFileData;

  try {
    return Buffer.from(base64Payload, "base64");
  } catch {
    return null;
  }
}

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Product image upload service is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function validateStaffCredentials(supabaseAdmin, staffUserId, pin) {
  const normalizedStaffUserId = normalizeText(staffUserId);
  const normalizedPin = cleanPin(pin);

  if (!normalizedStaffUserId || normalizedPin.length !== 4) {
    return {
      ok: false,
      statusCode: 401,
      message: "Valid staff credentials are required.",
    };
  }

  const { data, error } = await supabaseAdmin
    .from("staff_users")
    .select("*")
    .eq("id", normalizedStaffUserId)
    .maybeSingle();

  if (error) {
    console.error("[product-image-upload] staff lookup failed", {
      code: error.code,
      message: error.message,
    });
    return {
      ok: false,
      statusCode: 500,
      message: "Unable to validate staff credentials.",
    };
  }

  if (!data || cleanPin(data.pin) !== normalizedPin || !isActiveStaffRow(data)) {
    return {
      ok: false,
      statusCode: 401,
      message: "Valid staff credentials are required.",
    };
  }

  if (!isAllowedStaffRole(data.role)) {
    return {
      ok: false,
      statusCode: 403,
      message: "This staff account cannot upload product images.",
    };
  }

  return {
    ok: true,
    staff: {
      id: data.id,
      name: data.name || "",
      role: data.role || "",
    },
  };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      ok: false,
      message: "Method not allowed.",
    });
  }

  let payload = null;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, {
      ok: false,
      message: "Invalid upload request.",
    });
  }

  const fileType = normalizeText(payload.fileType).toLowerCase();
  const maxFileBytes = Number(process.env.PRODUCT_IMAGE_MAX_BYTES || DEFAULT_MAX_FILE_BYTES);
  const fileBuffer = parseBase64Image(payload.fileData);

  if (!ALLOWED_IMAGE_TYPES.has(fileType)) {
    return jsonResponse(415, {
      ok: false,
      message: "Product images must be JPEG, PNG, or WebP files.",
    });
  }

  if (!fileBuffer?.length) {
    return jsonResponse(400, {
      ok: false,
      message: "A valid image file is required.",
    });
  }

  if (fileBuffer.length > maxFileBytes) {
    return jsonResponse(413, {
      ok: false,
      message: `Product images must be ${Math.floor(maxFileBytes / (1024 * 1024))} MB or smaller.`,
    });
  }

  let supabaseAdmin = null;
  try {
    supabaseAdmin = getSupabaseAdminClient();
  } catch (error) {
    console.error("[product-image-upload] configuration error", {
      message: error?.message,
    });
    return jsonResponse(500, {
      ok: false,
      message: "Product image upload service is not configured.",
    });
  }

  const staffValidation = await validateStaffCredentials(
    supabaseAdmin,
    payload.staffUserId,
    payload.pin
  );

  if (!staffValidation.ok) {
    return jsonResponse(staffValidation.statusCode, {
      ok: false,
      message: staffValidation.message,
    });
  }

  const storagePath = buildStoragePath({
    productId: payload.productId,
    fileName: payload.fileName,
  });

  const { error: uploadError } = await supabaseAdmin.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, fileBuffer, {
      cacheControl: "31536000",
      upsert: false,
      contentType: fileType,
    });

  if (uploadError) {
    console.error("[product-image-upload] storage upload failed", {
      message: uploadError.message,
      status: uploadError.status,
      staffUserId: staffValidation.staff.id,
    });
    return jsonResponse(502, {
      ok: false,
      message: "Unable to upload product image.",
    });
  }

  const { data } = supabaseAdmin.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(storagePath);

  const publicUrl = data?.publicUrl || "";
  if (!publicUrl) {
    return jsonResponse(502, {
      ok: false,
      message: "Unable to create product image URL.",
    });
  }

  return jsonResponse(200, {
    ok: true,
    image: publicUrl,
    image_storage_path: storagePath,
    image_content_type: fileType,
    image_file_size: fileBuffer.length,
    image_updated_at: new Date().toISOString(),
  });
}
