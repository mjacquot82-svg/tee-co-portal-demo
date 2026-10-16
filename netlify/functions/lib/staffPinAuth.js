// Server-side staff PIN verification + Supabase session issuing. Service role only.
import { createHash } from "node:crypto";

export const IP_FAILURE_LIMIT = 20;
export const IP_WINDOW_MINUTES = 15;
const OPERATIONAL_ROLES = ["owner", "manager", "staff"];

export function cleanPin(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 4);
}

export function normalizeRole(role) {
  const r = String(role ?? "").trim().toLowerCase();
  return OPERATIONAL_ROLES.includes(r) ? r : "";
}

export function ipKey(event, salt = "") {
  const h = event?.headers || {};
  const raw = String(h["x-nf-client-connection-ip"] || h["x-forwarded-for"] || h["client-ip"] || "unknown")
    .split(",")[0].trim();
  return createHash("sha256").update(`${salt}:${raw}`).digest("hex");
}

export function staffAuthEmail(staffUserId, domain = "staff.teeco.invalid") {
  return `staff-${String(staffUserId).toLowerCase()}@${domain}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Returns { ok:true, staff } or { ok:false, code: 'INVALID'|'LOCKED'|'ERROR' }.
export async function verifyStaffPin(admin, staffUserId, pin) {
  const id = String(staffUserId ?? "").trim();
  const clean = cleanPin(pin);
  if (!UUID_RE.test(id) || clean.length !== 4) return { ok: false, code: "INVALID" };
  const { data, error } = await admin.rpc("verify_staff_pin", { p_staff_user_id: id, p_pin: clean });
  if (error || !data) return { ok: false, code: "ERROR" };
  if (!data.ok) return { ok: false, code: data.code === "LOCKED" ? "LOCKED" : "INVALID", lockedUntil: data.locked_until };
  return { ok: true, staff: { id: data.id, name: data.name, role: data.role, authUserId: data.auth_user_id || null } };
}

export async function countIpFailures(admin, key) {
  const since = new Date(Date.now() - IP_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count, error } = await admin.from("staff_pin_login_attempts")
    .select("id", { count: "exact", head: true }).eq("ip_key", key).eq("success", false).gte("attempted_at", since);
  if (error) throw error;
  return count || 0;
}

export async function recordAttempt(admin, key, staffUserId, success) {
  await admin.from("staff_pin_login_attempts").insert({
    ip_key: key, staff_user_id: UUID_RE.test(String(staffUserId)) ? staffUserId : null, success,
  });
}

// Ensures a dedicated auth user for this staff member with current role metadata, then mints
// a session (admin magic-link token exchanged server-side; no email is sent).
export async function issueStaffSession(admin, staff, { emailDomain } = {}) {
  const role = normalizeRole(staff.role);
  if (!role) return { ok: false, code: "ROLE" };
  const app_metadata = { operational_role: role, staff_user_id: staff.id, login_method: "staff_pin" };
  const email = staffAuthEmail(staff.id, emailDomain);
  let authUserId = staff.authUserId;
  if (authUserId) {
    const { error } = await admin.auth.admin.updateUserById(authUserId, { app_metadata });
    if (error) authUserId = null;
  }
  if (!authUserId) {
    const { data, error } = await admin.auth.admin.createUser({
      email, email_confirm: true, app_metadata, user_metadata: { full_name: staff.name || "" },
    });
    if (error || !data?.user?.id) return { ok: false, code: "AUTH_USER" };
    authUserId = data.user.id;
    const { error: linkError } = await admin.from("staff_users").update({ auth_user_id: authUserId }).eq("id", staff.id);
    if (linkError) return { ok: false, code: "LINK" };
  }
  const { data: authUser } = await admin.auth.admin.getUserById(authUserId);
  const loginEmail = authUser?.user?.email || email;
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: loginEmail });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) return { ok: false, code: "SESSION" };
  const { data: verified, error: otpErr } = await admin.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  const session = verified?.session;
  if (otpErr || !session?.access_token) return { ok: false, code: "SESSION" };
  return {
    ok: true,
    session: { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at },
  };
}
