// POST { staffUserId, pin } -> { ok, staff:{id,name,role}, session:{access_token, refresh_token, expires_at} }
// The PIN is checked only here (bcrypt hash in the DB, 5-try lockout per staff, per-IP limit).
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import {
  IP_FAILURE_LIMIT, countIpFailures, ipKey, issueStaffSession, recordAttempt, verifyStaffPin,
} from "./lib/staffPinAuth.js";

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

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { ok: false, message: "Staff login is not configured." }, origin);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { ok: false, message: "Invalid request." }, origin); }
  const admin = clientFactory(url, key);
  const ip = ipKey(event, process.env.STAFF_PIN_RATE_LIMIT_SALT || process.env.PRODUCT_IMAGE_RATE_LIMIT_SALT || "");

  try {
    if ((await countIpFailures(admin, ip)) >= IP_FAILURE_LIMIT) {
      return json(429, { ok: false, code: "RATE_LIMITED", message: "Too many failed PIN attempts. Try again later." }, origin);
    }
    const result = await verifyStaffPin(admin, body.staffUserId, body.pin);
    if (!result.ok) {
      if (result.code === "ERROR") return json(500, { ok: false, message: "Unable to verify PIN." }, origin);
      await recordAttempt(admin, ip, body.staffUserId, false);
      if (result.code === "LOCKED") {
        return json(423, { ok: false, code: "LOCKED", message: "Too many wrong PINs. This staff login is locked for 15 minutes." }, origin);
      }
      return json(401, { ok: false, code: "PIN_MISMATCH", message: "That PIN does not match the selected staff member." }, origin);
    }
    const issued = await issueStaffSession(admin, result.staff, { emailDomain: process.env.STAFF_PIN_AUTH_EMAIL_DOMAIN || undefined });
    if (!issued.ok) {
      console.error("[staff-pin-login] session issue failed", { code: issued.code });
      return json(500, { ok: false, message: "Unable to start the staff session." }, origin);
    }
    await recordAttempt(admin, ip, result.staff.id, true);
    return json(200, {
      ok: true,
      staff: { id: result.staff.id, name: result.staff.name, role: result.staff.role },
      session: issued.session,
    }, origin);
  } catch (error) {
    console.error("[staff-pin-login] failed", { message: error?.message });
    return json(500, { ok: false, message: "Unable to verify PIN." }, origin);
  }
}
