/* global process */

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SQUARE_VERSION = "2024-06-04";
const REGISTRATIONS_TABLE = "square_terminal_device_registrations";
const DEFAULT_DEVICE_NAME = "Tee & Co Front Counter";

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function getHeader(headers = {}, name) {
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  return entry?.[1] || "";
}

function getBearerToken(event = {}) {
  const authorization = normalizeText(getHeader(event.headers, "authorization"));
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return normalizeText(match?.[1]);
}

function squareApiBaseUrl() {
  return normalizeText(process.env.SQUARE_ENVIRONMENT, "production").toLowerCase() === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

function getSupabaseAdminClient() {
  const url = normalizeText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const serviceRoleKey = normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeRole(user = {}) {
  return normalizeText(
    user.app_metadata?.operational_role || user.app_metadata?.role
  ).toLowerCase();
}

async function authorizeOwner(event, supabase) {
  const token = getBearerToken(event);
  if (!token) return { ok: false, statusCode: 401, message: "Authentication is required." };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, statusCode: 401, message: "The authentication session is invalid or expired." };
  }
  if (normalizeRole(data.user) !== "owner") {
    return { ok: false, statusCode: 403, message: "Owner access is required to pair a Square Terminal." };
  }
  return { ok: true, user: data.user };
}

function squareConfiguration() {
  return {
    accessToken: normalizeText(process.env.SQUARE_ACCESS_TOKEN),
    locationId: normalizeText(process.env.SQUARE_LOCATION_ID),
  };
}

async function squareRequest(path, options = {}) {
  const { accessToken } = squareConfiguration();
  const response = await fetch(`${squareApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data?.errors?.[0]?.detail || data?.errors?.[0]?.code || "Square rejected the device request."
    );
    error.statusCode = response.status;
    error.squareErrors = data?.errors || [];
    throw error;
  }
  return data;
}

function registrationUpdates(deviceCode = {}, context = {}) {
  const status = normalizeText(deviceCode.status, "UNKNOWN").toUpperCase();
  const pairedAt = normalizeText(deviceCode.paired_at) ||
    (status === "PAIRED" ? normalizeText(deviceCode.status_changed_at) || new Date().toISOString() : null);
  return {
    square_device_code_id: normalizeText(deviceCode.id),
    pairing_code: status === "PAIRED" ? "" : normalizeText(deviceCode.code),
    square_device_id: normalizeText(deviceCode.device_id) || null,
    square_location_id: normalizeText(deviceCode.location_id || context.locationId),
    device_name: normalizeText(deviceCode.name, DEFAULT_DEVICE_NAME),
    product_type: normalizeText(deviceCode.product_type, "TERMINAL_API"),
    status,
    pair_by: normalizeText(deviceCode.pair_by) || null,
    square_created_at: normalizeText(deviceCode.created_at) || null,
    status_changed_at: normalizeText(deviceCode.status_changed_at) || null,
    paired_at: pairedAt,
    updated_at: new Date().toISOString(),
  };
}

function publicRegistration(row = {}) {
  return {
    id: row.id,
    squareDeviceCodeId: row.square_device_code_id,
    pairingCode: row.status === "PAIRED" ? "" : row.pairing_code,
    squareDeviceId: row.square_device_id || "",
    squareLocationId: row.square_location_id,
    deviceName: row.device_name,
    productType: row.product_type,
    status: row.status,
    pairBy: row.pair_by,
    squareCreatedAt: row.square_created_at,
    statusChangedAt: row.status_changed_at,
    pairedAt: row.paired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function persistCreatedCode(supabase, deviceCode, userId, locationId) {
  const row = {
    ...registrationUpdates(deviceCode, { locationId }),
    created_by_user_id: userId,
  };
  const result = await supabase.from(REGISTRATIONS_TABLE).insert(row).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

async function refreshRegistration(supabase, registration) {
  const response = await squareRequest(
    `/v2/devices/codes/${encodeURIComponent(registration.square_device_code_id)}`,
    { method: "GET" }
  );
  const updates = registrationUpdates(response.device_code, {
    locationId: registration.square_location_id,
  });
  const result = await supabase
    .from(REGISTRATIONS_TABLE)
    .update(updates)
    .eq("id", registration.id)
    .select("*")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

async function getLatestRegistration(supabase) {
  const result = await supabase
    .from(REGISTRATIONS_TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

export async function handler(event) {
  if (!["GET", "POST"].includes(event.httpMethod)) {
    return json(405, { error: "Method not allowed." });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return json(501, { error: "Terminal pairing persistence is not configured." });
  }
  const authorization = await authorizeOwner(event, supabase);
  if (!authorization.ok) return json(authorization.statusCode, { error: authorization.message });

  const config = squareConfiguration();
  if (!config.accessToken || !config.locationId) {
    return json(501, { error: "Square Terminal pairing is not configured." });
  }

  try {
    if (event.httpMethod === "POST") {
      let input = {};
      try {
        input = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { error: "Invalid JSON body." });
      }
      const deviceName = normalizeText(input.deviceName, DEFAULT_DEVICE_NAME).slice(0, 64);
      const response = await squareRequest("/v2/devices/codes", {
        method: "POST",
        body: JSON.stringify({
          idempotency_key: randomUUID(),
          device_code: {
            name: deviceName,
            location_id: config.locationId,
            product_type: "TERMINAL_API",
          },
        }),
      });
      const registration = await persistCreatedCode(
        supabase,
        response.device_code,
        authorization.user.id,
        config.locationId
      );
      return json(201, { registration: publicRegistration(registration) });
    }

    const registration = await getLatestRegistration(supabase);
    if (!registration) return json(200, { registration: null });

    let current = registration;
    if (registration.status === "UNPAIRED") {
      const pairBy = new Date(registration.pair_by || 0).getTime();
      if (pairBy && pairBy <= Date.now()) {
        const result = await supabase
          .from(REGISTRATIONS_TABLE)
          .update({ status: "EXPIRED", pairing_code: "", updated_at: new Date().toISOString() })
          .eq("id", registration.id)
          .select("*")
          .single();
        if (result.error) throw result.error;
        current = result.data;
      } else {
        current = await refreshRegistration(supabase, registration);
      }
    }
    return json(200, { registration: publicRegistration(current) });
  } catch (error) {
    console.error("[square-terminal-device] request failed", {
      message: error instanceof Error ? error.message : "Unknown error",
      statusCode: error?.statusCode || 500,
    });
    return json(error?.statusCode >= 400 && error?.statusCode < 500 ? error.statusCode : 500, {
      error: error instanceof Error ? error.message : "Square Terminal pairing request failed.",
    });
  }
}
