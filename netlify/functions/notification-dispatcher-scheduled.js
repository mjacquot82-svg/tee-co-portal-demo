import { randomUUID } from "node:crypto";
import {
  createResendEmailAdapter,
  getConfiguredResendSender,
} from "./lib/resendEmailAdapter.js";
import { runScheduledNotificationDispatcher } from "./lib/notificationScheduledDispatcher.js";

export const config = {
  schedule: "* * * * *",
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function buildServiceRoleClient({ supabaseUrl, serviceRoleKey }) {
  return {
    async rpc(name, parameters) {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parameters),
      });
      const data = await response.json().catch(() => null);
      return response.ok
        ? { data, error: null }
        : {
            data: null,
            error: new Error(
              data?.message || `Scheduled dispatcher RPC ${name} failed.`
            ),
          };
    },
  };
}

export async function handler(event = {}) {
  const cutoverEnabled =
    String(process.env.NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER || "")
      .trim()
      .toLowerCase() === "true";
  if (!cutoverEnabled) {
    return json(200, {
      executed: false,
      reason: "Order Approved authoritative cutover is disabled.",
    });
  }

  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const supabaseUrl = String(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ""
  )
    .trim()
    .replace(/\/$/, "");
  const serviceRoleKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  ).trim();
  if (!apiKey || !supabaseUrl || !serviceRoleKey) {
    return json(503, {
      executed: false,
      error: "Scheduled notification delivery is not configured.",
    });
  }

  const runId = `scheduled:${event?.time || new Date().toISOString()}:${randomUUID()}`;
  const workerId = `netlify-scheduled:${randomUUID()}`;

  try {
    const result = await runScheduledNotificationDispatcher({
      runId,
      workerId,
      adapter: createResendEmailAdapter({
        apiKey,
        from: getConfiguredResendSender(),
      }),
      dispatcherClient: buildServiceRoleClient({
        supabaseUrl,
        serviceRoleKey,
      }),
    });
    return json(200, { executed: true, ...result });
  } catch (error) {
    return json(500, {
      executed: true,
      runId,
      error: String(error?.message || error),
    });
  }
}
