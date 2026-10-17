// GET /.netlify/functions/security-preflight -> go-live readiness, booleans only (no secrets).
// Confirms the Netlify site has a WORKING Supabase service role key (needed by the Square
// webhook, staff PIN login and notification workers once anonymous access is removed), the PIN
// rate-limit salt, the allowed origins, and which database phases are installed.
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

let clientFactory = (url, key) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
export function __setClientFactory(f) { clientFactory = f; }

export async function handler(event) {
  if (event.httpMethod && event.httpMethod !== "GET") return json(405, { ok: false });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  const out = {
    supabaseUrlConfigured: Boolean(url),
    serviceRoleKeyConfigured: Boolean(key),
    serviceRoleKeyDiffersFromAnonKey: Boolean(key) && key !== anon,
    serviceRoleKeyWorks: false,
    pinRateLimitSaltConfigured: Boolean(process.env.STAFF_PIN_RATE_LIMIT_SALT),
    allowedOriginsConfigured: Boolean(String(process.env.TEE_CO_ALLOWED_UPLOAD_ORIGINS || "").trim()),
    nodeVersion: process.versions.node,
    nodeVersionOk: Number(process.versions.node.split(".")[0]) >= 22,
    phaseA: false,
  };
  if (url && key) {
    try {
      const admin = clientFactory(url, key);
      // Only the service role can list auth users.
      const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
      out.serviceRoleKeyWorks = !error;
      if (out.serviceRoleKeyWorks) {
        const r = await admin.rpc("verify_staff_pin", { p_staff_user_id: "00000000-0000-0000-0000-000000000000", p_pin: "" });
        out.phaseA = !r.error && r.data?.ok === false;
      }
    } catch {
      out.serviceRoleKeyWorks = false;
    }
  }
  out.ok = out.supabaseUrlConfigured && out.serviceRoleKeyWorks && out.serviceRoleKeyDiffersFromAnonKey
    && out.pinRateLimitSaltConfigured && out.allowedOriginsConfigured && out.nodeVersionOk;
  return json(out.ok ? 200 : 503, out);
}
