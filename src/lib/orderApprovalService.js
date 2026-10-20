// Public artwork/quote approval page (/approval/:orderNumber?token=...).
// Visitors are not signed in, so the page never reads the orders table. It calls three narrow
// endpoints that all require the one-time approval token from the email:
//   get_order_approval     (database function) -> minimum fields for the page
//   submit_order_approval  (database function) -> approve / request changes, once
//   order-approval-previews (Netlify function) -> 10-minute preview links for the artwork
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const PREVIEWS_ENDPOINT = "/.netlify/functions/order-approval-previews";
const INVALID_LINK = "This approval link is not valid or has expired.";

let testClient = null;
let testConfigured = null;
let testFetch = null;

export function configureOrderApprovalServiceForTests({ client = null, configured = null, fetchImpl = null } = {}) {
  testClient = client;
  testConfigured = configured;
  testFetch = fetchImpl;
}

function getClient() {
  return testClient || supabase;
}

export function isApprovalServerBacked() {
  const configured = testConfigured !== null ? testConfigured : isSupabaseConfigured;
  return Boolean(configured && getClient());
}

export function isWellFormedApprovalToken(token) {
  return /^[0-9a-f]{64}$/i.test(String(token || "").trim());
}

function friendlyError(error, fallback) {
  const code = error?.code;
  if (code === "28000") return INVALID_LINK;
  if (code === "P0001" && error?.message) return error.message;
  if (code === "PGRST202") return "Online approval is not available yet. Please contact Tee & Co.";
  return fallback;
}

function toError(error, fallback) {
  const failure = new Error(friendlyError(error, fallback));
  failure.code = error?.code || "APPROVAL_FAILED";
  return failure;
}

export async function loadOrderApproval(orderNumber, token) {
  if (!isWellFormedApprovalToken(token)) throw toError({ code: "28000" }, INVALID_LINK);
  const { data, error } = await getClient().rpc("get_order_approval", {
    p_order_number: String(orderNumber || "").trim(),
    p_token: String(token).trim(),
  });
  if (error) throw toError(error, "Unable to load this approval right now.");
  return data || null;
}

export async function decideOrderApproval(orderNumber, token, decision, note = "") {
  if (!["approve", "request_changes"].includes(decision)) throw new Error("Unknown decision.");
  if (!isWellFormedApprovalToken(token)) throw toError({ code: "28000" }, INVALID_LINK);
  const { data, error } = await getClient().rpc("submit_order_approval", {
    p_order_number: String(orderNumber || "").trim(),
    p_token: String(token).trim(),
    p_decision: decision,
    p_note: String(note || "").slice(0, 2000),
  });
  if (error) throw toError(error, "Unable to record your decision right now.");
  return data || null;
}

// Returns { [fileId]: signedUrl }. Previews are optional: failures return {}.
export async function loadOrderApprovalPreviews(orderNumber, token) {
  if (!isWellFormedApprovalToken(token)) return {};
  const fetcher = testFetch || (typeof fetch === "function" ? fetch : null);
  if (!fetcher) return {};
  try {
    const response = await fetcher(PREVIEWS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber: String(orderNumber || "").trim(), token: String(token).trim() }),
    });
    if (!response?.ok) return {};
    const body = await response.json();
    const map = {};
    for (const file of Array.isArray(body?.files) ? body.files : []) {
      if (file?.id && typeof file.url === "string" && file.url.startsWith("https://")) map[file.id] = file.url;
    }
    return map;
  } catch {
    return {};
  }
}
