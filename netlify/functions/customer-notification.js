import {
  createResendEmailAdapter,
  getConfiguredResendSender,
} from "./lib/resendEmailAdapter.js";
import { runResendEmailDeliveryCutover } from "./lib/resendEmailDispatcher.js";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function buildServiceRoleDispatcherClient({ supabaseUrl, serviceRoleKey }) {
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
        : { data: null, error: new Error(data?.message || `Dispatcher RPC ${name} failed.`) };
    },
  };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!apiKey || !supabaseUrl || !serviceRoleKey) {
    return json(503, { error: "Customer email delivery is not configured." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON payload." });
  }

  const eventType = String(payload.eventType || "").trim();
  const deliveryId = String(payload.deliveryId || "").trim();
  const idempotencyKey = String(payload.idempotencyKey || "").trim();
  if (deliveryId) {
    const cutoverEnabled =
      String(process.env.NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER || "")
        .trim()
        .toLowerCase() === "true";
    if (!cutoverEnabled || !eventType || !idempotencyKey) {
      return json(409, { error: "Notification Engine cutover is not enabled for this event." });
    }
    const adapter = createResendEmailAdapter({
      apiKey,
      from: getConfiguredResendSender(),
    });
    const result = await runResendEmailDeliveryCutover({
      deliveryId,
      workerId: `customer-email:${deliveryId}`,
      adapter,
      dispatcherClient: buildServiceRoleDispatcherClient({
        supabaseUrl,
        serviceRoleKey,
      }),
    });
    if (!result.claimed) {
      return json(200, {
        delivered: false,
        duplicateOrAlreadyProcessed: true,
        deliveryId,
      });
    }
    if (!result.providerResult.ok) {
      return json(result.providerResult.httpStatus, {
        error: result.providerResult.failureReason,
        deliveryId,
      });
    }
    return json(200, {
      delivered: true,
      deliveryId,
      providerMessageId: result.providerResult.providerMessageId,
    });
  }
  return json(409, {
    error:
      "Customer email delivery requires an authoritative rendered Delivery.",
  });
}
