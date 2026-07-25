import { runStaffInternalAdapterAuthoritative } from "../../src/lib/staffInternalNotificationAdapter.js";

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

function buildServiceRoleClient({ supabaseUrl, serviceRoleKey }) {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
  return {
    async rpc(name, parameters) {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers,
        body: JSON.stringify(parameters),
      });
      const data = await response.json().catch(() => null);
      return response.ok
        ? { data, error: null }
        : {
            data: null,
            error: new Error(
              data?.message || `Staff dispatcher RPC ${name} failed.`
            ),
          };
    },
    from(table) {
      return {
        async upsert(row) {
          const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
            method: "POST",
            headers: {
              ...headers,
              Prefer: "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(row),
          });
          return response.ok
            ? { error: null }
            : {
                error: new Error(
                  `Staff Inbox persistence failed with ${response.status}.`
                ),
              };
        },
      };
    },
  };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }
  const cutoverEnabled =
    String(process.env.NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER || "")
      .trim()
      .toLowerCase() === "true";
  if (!cutoverEnabled) {
    return json(409, {
      error: "Notification Engine cutover is not enabled for this event.",
    });
  }
  const supabaseUrl = String(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ""
  )
    .trim()
    .replace(/\/$/, "");
  const serviceRoleKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  ).trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return json(503, { error: "Staff notification delivery is not configured." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON payload." });
  }
  const deliveryId = String(payload.deliveryId || "").trim();
  const eventType = String(payload.eventType || "").trim();
  if (!deliveryId || eventType !== "quote_approved") {
    return json(400, {
      error: "A supported event and Staff Delivery are required.",
    });
  }

  const client = buildServiceRoleClient({ supabaseUrl, serviceRoleKey });
  const result = await runStaffInternalAdapterAuthoritative({
    deliveryId,
    workerId: `order-approved-staff:${deliveryId}`,
    dispatcherClient: client,
    staffInboxClient: client,
  });
  return json(200, {
    delivered: result.claimed,
    duplicateOrAlreadyProcessed: !result.claimed,
    deliveryId,
    staffNotificationId: result.staffNotification?.id || "",
  });
}
