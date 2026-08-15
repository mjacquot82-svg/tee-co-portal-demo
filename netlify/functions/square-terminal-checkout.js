/* global process */

import {
  authorizeOperationalRequest,
  cancelTerminalAttempt,
  createSupabaseAdminClient,
  createTerminalAttempt,
  getTerminalAttempt,
} from "./lib/squareTerminalCheckout.js";

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

export async function handler(event) {
  if (!["GET", "POST"].includes(event.httpMethod)) return json(405, { error: "Method not allowed." });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return json(501, { error: "Terminal checkout persistence is not configured." });
  const authorization = await authorizeOperationalRequest(event, supabase);
  if (!authorization.ok) return json(authorization.statusCode, { error: authorization.message });
  try {
    const input = event.httpMethod === "POST" ? JSON.parse(event.body || "{}") : (event.queryStringParameters || {});
    let attempt;
    if (event.httpMethod === "GET") attempt = await getTerminalAttempt(supabase, input.attemptId);
    else if (input.action === "cancel") attempt = await cancelTerminalAttempt(supabase, input.attemptId);
    else attempt = await createTerminalAttempt(supabase, input, authorization.user);
    return json(200, { attempt });
  } catch (error) {
    console.error("[square-terminal-checkout] request failed", { message: error instanceof Error ? error.message : "Unknown error", code: error?.code || error?.squareCode || "" });
    return json(error?.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500, { error: error instanceof Error ? error.message : "Terminal checkout request failed.", code: error?.code || error?.squareCode || "" });
  }
}
