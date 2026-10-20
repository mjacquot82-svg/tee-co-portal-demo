// POST { orderNumber, token } -> { ok, files: [{ id, url }] }
// Short-lived (10 min) preview links for the artwork on the public approval page. The artwork bucket
// is private, so the browser cannot sign links itself. The token is checked in the database by
// public.get_order_approval_file_paths (service role only); without the exact token nothing is signed.
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "customer-artwork";
const SIGNED_URL_SECONDS = 600;
const MAX_FILES = 25;

function allowedOrigins() {
  return String(process.env.TEE_CO_ALLOWED_UPLOAD_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
}
function cors(origin) {
  const list = allowedOrigins();
  const allow = origin && list.includes(origin) ? origin : "";
  return {
    ...(allow ? { "Access-Control-Allow-Origin": allow, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(statusCode, body, origin) {
  return { statusCode, headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

let clientFactory = (url, key) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
export function __setClientFactory(f) { clientFactory = f; }

export async function handler(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || "";
  if (event.httpMethod === "OPTIONS") return json(204, {}, origin);
  if (event.httpMethod !== "POST") return json(405, { ok: false, message: "Method not allowed." }, origin);
  const list = allowedOrigins();
  if (origin && list.length && !list.includes(origin)) return json(403, { ok: false, message: "Origin not allowed." }, origin);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { ok: false, message: "Invalid request." }, origin); }
  const orderNumber = String(body?.orderNumber || "").trim();
  const token = String(body?.token || "").trim();
  if (!orderNumber || orderNumber.length > 80 || !/^[0-9a-f]{64}$/i.test(token)) {
    return json(404, { ok: false, message: "This approval link is not valid or has expired." }, origin);
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { ok: false, message: "Previews are not configured." }, origin);
  const admin = clientFactory(url, key);

  const { data, error } = await admin.rpc("get_order_approval_file_paths", { p_order_number: orderNumber, p_token: token });
  if (error) return json(404, { ok: false, message: "This approval link is not valid or has expired." }, origin);

  const entries = (Array.isArray(data) ? data : []).slice(0, MAX_FILES);
  const files = [];
  for (const entry of entries) {
    const path = String(entry?.storage_path || "").trim();
    if (!path || path.startsWith("http") || path.includes("..")) continue;
    const signed = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (signed?.error || !signed?.data?.signedUrl) continue;
    files.push({ id: String(entry.id || ""), url: signed.data.signedUrl });
  }
  return json(200, { ok: true, files }, origin);
}
