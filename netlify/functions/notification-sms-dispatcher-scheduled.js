import { randomUUID } from "node:crypto";
import {
  createTwilioSmsAdapter,
  getConfiguredTwilioFromNumber,
} from "./lib/twilioSmsAdapter.js";
import { runScheduledTwilioSmsDispatcher } from "./lib/twilioSmsDispatcher.js";

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

function enabled(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
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
              data?.message || `Scheduled SMS RPC ${name} failed.`
            ),
          };
    },
  };
}

export async function handler(event = {}) {
  const cutoverEnabled = enabled(
    process.env.NOTIFICATION_ENGINE_SMS_CUTOVER
  );
  if (!cutoverEnabled) {
    return json(200, {
      executed: false,
      gateEnabled: false,
      reason: "sms_cutover_disabled",
    });
  }

  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = getConfiguredTwilioFromNumber();
  const supabaseUrl = String(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ""
  )
    .trim()
    .replace(/\/$/, "");
  const serviceRoleKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  ).trim();

  if (
    !accountSid ||
    !authToken ||
    !from ||
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    return json(503, {
      executed: false,
      error: "Scheduled Twilio SMS delivery is not configured.",
    });
  }

  const runId = `scheduled-sms:${
    event?.time || new Date().toISOString()
  }:${randomUUID()}`;
  const workerId = `netlify-scheduled-sms:${randomUUID()}`;

  try {
    const result = await runScheduledTwilioSmsDispatcher({
      cutoverEnabled,
      runId,
      workerId,
      adapter: createTwilioSmsAdapter({
        accountSid,
        authToken,
        from,
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
