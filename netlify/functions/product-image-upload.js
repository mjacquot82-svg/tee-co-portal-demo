import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_IMAGES_BUCKET = "product-images";
const RATE_LIMIT_TABLE = "product_image_upload_attempts";
const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const STAFF_PIN_FAILURE_LIMIT = 5;
const IP_PIN_FAILURE_LIMIT = 20;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://teeandco.jdsstudio.ca",
]);
const CORS_BASE_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const DEPLOY_PREVIEW_ORIGIN_PATTERN = /^https:\/\/deploy-preview-\d+--teeandco\.netlify\.app$/;

function getConfiguredAllowedOrigins() {
  return new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...String(process.env.TEE_CO_ALLOWED_UPLOAD_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]);
}

function isAllowedOrigin(origin) {
  const normalizedOrigin = normalizeText(origin);
  if (!normalizedOrigin) return true;
  return getConfiguredAllowedOrigins().has(normalizedOrigin) ||
    DEPLOY_PREVIEW_ORIGIN_PATTERN.test(normalizedOrigin);
}

function buildCorsHeaders(origin) {
  const normalizedOrigin = normalizeText(origin);
  return {
    ...CORS_BASE_HEADERS,
    ...(normalizedOrigin && isAllowedOrigin(normalizedOrigin)
      ? {
          "Access-Control-Allow-Origin": normalizedOrigin,
          Vary: "Origin",
        }
      : {}),
  };
}

function jsonResponse(statusCode, body, origin = "") {
  return {
    statusCode,
    headers: {
      ...buildCorsHeaders(origin),
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

function getRequestOrigin(event) {
  return event?.headers?.origin || event?.headers?.Origin || "";
}

function getClientIp(event) {
  const headerValue =
    event?.headers?.["x-nf-client-connection-ip"] ||
    event?.headers?.["x-forwarded-for"] ||
    event?.headers?.["client-ip"] ||
    "";

  return normalizeText(String(headerValue).split(",")[0]);
}

function buildRateLimitIpKey(event) {
  const clientIp = getClientIp(event) || "unknown";
  const salt = process.env.PRODUCT_IMAGE_RATE_LIMIT_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "tee-co-product-image-upload";

  return createHash("sha256")
    .update(`${salt}:${clientIp}`)
    .digest("hex");
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

function detectImageContentType(fileBuffer) {
  if (!fileBuffer || fileBuffer.length < 4) return "";

  const isJpeg =
    fileBuffer.length >= 3 &&
    fileBuffer[0] === 0xff &&
    fileBuffer[1] === 0xd8 &&
    fileBuffer[2] === 0xff;
  if (isJpeg) return "image/jpeg";

  const pngSignature = "89504e470d0a1a0a";
  if (fileBuffer.length >= 8 && fileBuffer.subarray(0, 8).toString("hex") === pngSignature) {
    return "image/png";
  }

  const isWebp =
    fileBuffer.length >= 12 &&
    fileBuffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    fileBuffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (isWebp) return "image/webp";

  return "";
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

async function countFailedAttempts(supabaseAdmin, filters = {}) {
  let query = supabaseAdmin
    .from(RATE_LIMIT_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("success", false)
    .gte(
      "attempted_at",
      new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString()
    );

  if (filters.staffUserId) {
    query = query.eq("staff_user_id", filters.staffUserId);
  }

  if (filters.ipKey) {
    query = query.eq("ip_key", filters.ipKey);
  }

  const { count, error } = await query;
  if (error) {
    throw error;
  }

  return count || 0;
}

async function checkRateLimit(supabaseAdmin, { staffUserId, ipKey }) {
  const normalizedStaffUserId = normalizeText(staffUserId);
  if (!normalizedStaffUserId) {
    return {
      ok: true,
    };
  }

  const [staffFailures, ipFailures] = await Promise.all([
    countFailedAttempts(supabaseAdmin, { staffUserId: normalizedStaffUserId }),
    countFailedAttempts(supabaseAdmin, { ipKey }),
  ]);

  if (staffFailures >= STAFF_PIN_FAILURE_LIMIT || ipFailures >= IP_PIN_FAILURE_LIMIT) {
    return {
      ok: false,
      statusCode: 429,
      message: "Too many failed upload verification attempts. Try again later.",
    };
  }

  return {
    ok: true,
  };
}

async function recordUploadAttempt(supabaseAdmin, {
  staffUserId,
  ipKey,
  success,
  failureReason = "",
}) {
  const { error } = await supabaseAdmin
    .from(RATE_LIMIT_TABLE)
    .insert({
      staff_user_id: normalizeText(staffUserId) || null,
      ip_key: normalizeText(ipKey) || null,
      success: Boolean(success),
      failure_reason: normalizeText(failureReason).slice(0, 120),
    });

  if (error) {
    console.error("[product-image-upload] unable to record upload attempt", {
      code: error.code,
      message: error.message,
    });
  }
}

export async function handler(event) {
  const origin = getRequestOrigin(event);

  if (!isAllowedOrigin(origin)) {
    return {
      statusCode: 403,
      headers: buildCorsHeaders(origin),
      body: JSON.stringify({
        ok: false,
        message: "Origin is not allowed.",
      }),
    };
  }

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: buildCorsHeaders(origin),
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      ok: false,
      message: "Method not allowed.",
    }, origin);
  }

  let payload = null;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, {
      ok: false,
      message: "Invalid upload request.",
    }, origin);
  }

  const fileType = normalizeText(payload.fileType).toLowerCase();
  const maxFileBytes = Number(process.env.PRODUCT_IMAGE_MAX_BYTES || DEFAULT_MAX_FILE_BYTES);
  const fileBuffer = parseBase64Image(payload.fileData);
  const detectedFileType = detectImageContentType(fileBuffer);

  if (!ALLOWED_IMAGE_TYPES.has(fileType)) {
    return jsonResponse(415, {
      ok: false,
      message: "Product images must be JPEG, PNG, or WebP files.",
    }, origin);
  }

  if (!fileBuffer?.length) {
    return jsonResponse(400, {
      ok: false,
      message: "A valid image file is required.",
    }, origin);
  }

  if (!detectedFileType || detectedFileType !== fileType) {
    return jsonResponse(415, {
      ok: false,
      message: "Uploaded file content does not match the declared image type.",
    }, origin);
  }

  if (fileBuffer.length > maxFileBytes) {
    return jsonResponse(413, {
      ok: false,
      message: `Product images must be ${Math.floor(maxFileBytes / (1024 * 1024))} MB or smaller.`,
    }, origin);
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
    }, origin);
  }

  const staffUserId = normalizeText(payload.staffUserId);
  const ipKey = buildRateLimitIpKey(event);
  try {
    const rateLimit = await checkRateLimit(supabaseAdmin, { staffUserId, ipKey });
    if (!rateLimit.ok) {
      return jsonResponse(rateLimit.statusCode, {
        ok: false,
        message: rateLimit.message,
      }, origin);
    }
  } catch (error) {
    console.error("[product-image-upload] rate limit check failed", {
      code: error.code,
      message: error.message,
    });
    return jsonResponse(500, {
      ok: false,
      message: "Unable to validate upload attempt limits.",
    }, origin);
  }

  const staffValidation = await validateStaffCredentials(
    supabaseAdmin,
    staffUserId,
    payload.pin
  );

  if (!staffValidation.ok) {
    await recordUploadAttempt(supabaseAdmin, {
      staffUserId,
      ipKey,
      success: false,
      failureReason: staffValidation.message,
    });
    return jsonResponse(staffValidation.statusCode, {
      ok: false,
      message: staffValidation.message,
    }, origin);
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
    }, origin);
  }

  const { data } = supabaseAdmin.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(storagePath);

  const publicUrl = data?.publicUrl || "";
  if (!publicUrl) {
    return jsonResponse(502, {
      ok: false,
      message: "Unable to create product image URL.",
    }, origin);
  }

  await recordUploadAttempt(supabaseAdmin, {
    staffUserId,
    ipKey,
    success: true,
  });

  return jsonResponse(200, {
    ok: true,
    image: publicUrl,
    image_storage_path: storagePath,
    image_content_type: fileType,
    image_file_size: fileBuffer.length,
    image_updated_at: new Date().toISOString(),
  }, origin);
}
