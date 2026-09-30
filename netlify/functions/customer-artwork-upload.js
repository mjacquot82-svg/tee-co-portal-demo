import { Buffer } from "node:buffer";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "customer-artwork";
const TABLE = "customer_artwork";
const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "pdf", "svg", "ai"]);
const DEFAULT_MAX_FILE_BYTES = 15 * 1024 * 1024;
const DEFAULT_ALLOWED_ORIGINS = new Set(["https://teeandco.jdsstudio.ca"]);
const DEPLOY_PREVIEW_ORIGIN_PATTERN = /^https:\/\/deploy-preview-\d+--teeandco\.netlify\.app$/;

function text(value) { return String(value || "").trim(); }
function cleanPin(value) { return text(value).replace(/\D/g, "").slice(0, 4); }
function getOrigin(event) { return event?.headers?.origin || event?.headers?.Origin || ""; }
function allowedOrigins() {
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...text(process.env.TEE_CO_ALLOWED_UPLOAD_ORIGINS).split(",").map((v) => v.trim()).filter(Boolean)]);
}
function isAllowedOrigin(origin) {
  const value = text(origin);
  return !value || allowedOrigins().has(value) || DEPLOY_PREVIEW_ORIGIN_PATTERN.test(value);
}
function headers(origin) {
  const value = text(origin);
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...(value && isAllowedOrigin(value) ? { "Access-Control-Allow-Origin": value, Vary: "Origin" } : {}),
  };
}
function response(statusCode, body, origin) { return { statusCode, headers: headers(origin), body: JSON.stringify(body) }; }
function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Customer artwork upload service is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function safeName(value) {
  return text(value || "artwork").replace(/[/\\]+/g, "-").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "artwork";
}
function extension(name) { const parts = safeName(name).toLowerCase().split("."); return parts.length > 1 ? parts.pop() : ""; }
function parseFile(data) {
  const raw = text(data);
  const match = raw.match(/^data:[^;]+;base64,(.+)$/);
  try { return Buffer.from(match?.[1] || raw, "base64"); } catch { return null; }
}
async function validateStaff(client, staffUserId, pin) {
  const id = text(staffUserId);
  const normalizedPin = cleanPin(pin);
  if (!id || normalizedPin.length !== 4) return null;
  const { data, error } = await client.from("staff_users").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const active = typeof data.active === "boolean" ? data.active : text(data.status || "Active").toLowerCase() !== "inactive";
  const role = text(data.role).toLowerCase();
  if (!active || cleanPin(data.pin) !== normalizedPin || !["owner", "manager", "staff"].includes(role)) return null;
  return data;
}
function storagePath(customerId, fileName) {
  return `${text(customerId)}/${new Date().toISOString().replace(/[:.]/g, "-")}-${safeName(fileName)}`;
}

export async function handler(event) {
  const origin = getOrigin(event);
  if (!isAllowedOrigin(origin)) return response(403, { ok: false, message: "Origin is not allowed." }, origin);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: headers(origin), body: "" };
  if (event.httpMethod !== "POST") return response(405, { ok: false, message: "Method not allowed." }, origin);

  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return response(400, { ok: false, message: "Invalid upload request." }, origin); }

  const customerId = text(payload.customerId);
  const fileName = safeName(payload.fileName);
  const fileBuffer = parseFile(payload.fileData);
  if (!customerId) return response(400, { ok: false, message: "A customer is required." }, origin);
  if (!ALLOWED_EXTENSIONS.has(extension(fileName))) return response(415, { ok: false, message: "Supported artwork formats are PNG, JPG, PDF, SVG, and AI." }, origin);
  if (!fileBuffer?.length) return response(400, { ok: false, message: "A valid artwork file is required." }, origin);
  const maxBytes = Number(process.env.CUSTOMER_ARTWORK_MAX_BYTES || DEFAULT_MAX_FILE_BYTES);
  if (fileBuffer.length > maxBytes) return response(413, { ok: false, message: "Artwork file is too large." }, origin);

  let client;
  try { client = adminClient(); } catch (error) { return response(500, { ok: false, message: error.message }, origin); }
  const staff = await validateStaff(client, payload.staffUserId, payload.pin);
  if (!staff) return response(401, { ok: false, message: "Valid staff credentials are required." }, origin);

  const path = storagePath(customerId, fileName);
  const fileType = text(payload.fileType) || "application/octet-stream";
  const { error: uploadError } = await client.storage.from(BUCKET).upload(path, fileBuffer, { cacheControl: "3600", upsert: false, contentType: fileType });
  if (uploadError) return response(502, { ok: false, message: "Unable to upload artwork file." }, origin);

  const now = new Date().toISOString();
  const row = {
    customer_id: customerId,
    file_name: fileName,
    display_name: text(payload.displayName) || fileName,
    original_filename: text(payload.originalFilename) || fileName,
    file_type: fileType,
    file_size: fileBuffer.length,
    storage_path: path,
    uploaded_at: now,
    uploaded_by: text(staff.name) || "Staff",
    placement_hint: text(payload.placementHint),
    notes: text(payload.notes),
    linked_order_ids: Array.isArray(payload.linkedOrderIds) ? payload.linkedOrderIds.map(text).filter(Boolean) : [],
    linked_quote_ids: Array.isArray(payload.linkedQuoteIds) ? payload.linkedQuoteIds.map(text).filter(Boolean) : [],
    last_used_at: payload.lastUsedAt || null,
    updated_at: now,
  };
  const { data, error } = await client.from(TABLE).insert(row).select("*").single();
  if (error) {
    await client.storage.from(BUCKET).remove([path]);
    console.error("[customer-artwork-upload] metadata insert failed", { code: error.code, message: error.message });
    return response(502, { ok: false, message: "Artwork uploaded, but metadata could not be saved." }, origin);
  }

  const { data: signed } = await client.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return response(200, { ok: true, artwork: { ...data, name: data.display_name || data.file_name, preview: signed?.signedUrl || "", preview_url: signed?.signedUrl || "", asset_url: signed?.signedUrl || "", source_url: signed?.signedUrl || "", open_url: signed?.signedUrl || "", download_url: signed?.signedUrl || "", asset_reference: path } }, origin);
}
