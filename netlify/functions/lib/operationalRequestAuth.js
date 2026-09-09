import { createClient } from "@supabase/supabase-js";

function text(value) {
  return String(value || "").trim();
}

function header(headers = {}, name) {
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match?.[1] || "";
}

export function createSupabaseAdminClient() {
  const url = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const key = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function authorizeOperationalRequest(event, supabase) {
  const match = text(header(event.headers, "authorization")).match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return { ok: false, statusCode: 401, message: "Authentication is required." };

  const result = await supabase.auth.getUser(match[1]);
  const user = result.data?.user;
  if (result.error || !user) {
    return { ok: false, statusCode: 401, message: "The authentication session is invalid or expired." };
  }

  const role = text(user.app_metadata?.operational_role || user.app_metadata?.role).toLowerCase();
  if (!["owner", "manager", "staff"].includes(role)) {
    return { ok: false, statusCode: 403, message: "Operational staff access is required." };
  }
  return { ok: true, user, role };
}
