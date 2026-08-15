import { supabase } from "../lib/supabaseClient";

const ENDPOINT = "/.netlify/functions/square-terminal-checkout";

async function accessToken(options = {}) {
  if (options.accessToken) return options.accessToken;
  if (!supabase) throw new Error("Supabase authentication is not configured.");
  const result = await supabase.auth.getSession();
  if (result.error || !result.data?.session?.access_token) throw new Error("An authenticated operational session is required.");
  return result.data.session.access_token;
}

async function request(method, payload, options = {}) {
  const token = await accessToken(options);
  const query = method === "GET" ? `?attemptId=${encodeURIComponent(payload.attemptId)}` : "";
  const response = await (options.fetcher || fetch)(`${options.endpoint || ENDPOINT}${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(payload) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Square Terminal request failed.");
    error.code = data.code || "TERMINAL_ERROR";
    throw error;
  }
  return data.attempt;
}

export function createSquareTerminalCheckout({ orderNumber, paymentRequestId = "" }, options = {}) {
  return request("POST", { orderNumber, paymentRequestId }, options);
}

export function getSquareTerminalCheckoutStatus(attemptId, options = {}) {
  return request("GET", { attemptId }, options);
}

export function cancelSquareTerminalCheckout(attemptId, options = {}) {
  return request("POST", { action: "cancel", attemptId }, options);
}

export const TERMINAL_FINAL_STATES = new Set(["completed", "failed", "canceled", "timed_out", "reconciliation_required"]);
