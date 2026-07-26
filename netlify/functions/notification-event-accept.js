const SUPPORTED_EVENT_TYPES = new Set([
  "new_customer_request",
  "quote_ready_for_approval",
  "quote_approved",
  "artwork_revision_requested",
  "artwork_approved",
  "deposit_requested",
  "payment_request_created",
  "payment_received",
  "payment_failed",
  "order_in_production",
  "order_ready_for_pickup",
  "order_completed",
]);

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

function normalizeText(value) {
  return String(value ?? "").trim();
}

function restHeaders(serviceRoleKey, prefer = "") {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function readJson(response) {
  return response.json().catch(() => []);
}

function notificationDecision(policy) {
  if (!policy.enabled || policy.delivery_mode === "disabled") {
    return {
      status: "no_delivery",
      noDeliveryReason: "policy_disabled",
    };
  }
  if (policy.delivery_mode === "approval_required") {
    return {
      status: "pending_approval",
      noDeliveryReason: "",
    };
  }
  if (
    !policy.email_enabled &&
    !policy.sms_enabled &&
    !policy.staff_notification_enabled
  ) {
    return {
      status: "no_delivery",
      noDeliveryReason: "no_channels_enabled",
    };
  }
  return {
    status: "evaluated",
    noDeliveryReason: "",
  };
}

async function generateNotificationForAcceptedEvent({
  accepted,
  supabaseUrl,
  serviceRoleKey,
}) {
  const policyQuery = new URLSearchParams({
    select: "*",
    event_type: `eq.${accepted.event_type}`,
    effective_to: "is.null",
    effective_from: `lte.${accepted.occurred_at}`,
    order: "version.desc",
    limit: "1",
  });
  const policyResponse = await fetch(
    `${supabaseUrl}/rest/v1/notification_policies?${policyQuery}`,
    { headers: restHeaders(serviceRoleKey) }
  );
  const policies = await readJson(policyResponse);
  if (!policyResponse.ok) {
    throw new Error(
      policies?.message || "Unable to resolve Notification Policy."
    );
  }
  const policy = Array.isArray(policies) ? policies[0] : policies;
  if (!policy?.id) {
    throw new Error(
      `No Notification Policy exists for ${accepted.event_type}.`
    );
  }

  const decision = notificationDecision(policy);
  const notification = {
    id: `notification:${accepted.id}:${policy.id}:v${policy.version}`,
    business_event_id: accepted.id,
    event_type: accepted.event_type,
    subject_type: accepted.subject_type,
    subject_id: accepted.subject_id,
    correlation_id: accepted.correlation_id,
    policy_id: policy.id,
    policy_version: policy.version,
    policy_snapshot: {
      id: policy.id,
      event_type: policy.event_type,
      version: policy.version,
      enabled: Boolean(policy.enabled),
      delivery_mode: policy.delivery_mode,
      email_enabled: Boolean(policy.email_enabled),
      sms_enabled: Boolean(policy.sms_enabled),
      staff_notification_enabled: Boolean(policy.staff_notification_enabled),
      customer_audience_enabled: Boolean(policy.customer_audience_enabled),
      staff_audience_enabled: Boolean(policy.staff_audience_enabled),
      owner_audience_enabled: Boolean(policy.owner_audience_enabled),
      channel_template_assignments: policy.channel_template_assignments || {},
      effective_from: policy.effective_from,
      effective_to: policy.effective_to,
    },
    delivery_mode: policy.delivery_mode,
    status: decision.status,
    no_delivery_reason: decision.noDeliveryReason,
    engine_metadata: {
      observationOnly: true,
      legacyRuntimeAuthoritative: true,
      cutoverMode: "legacy",
      deliveriesDeferredUntilPhase2C: true,
    },
  };
  const notificationResponse = await fetch(
    `${supabaseUrl}/rest/v1/notifications?on_conflict=business_event_id,policy_id,policy_version`,
    {
      method: "POST",
      headers: restHeaders(
        serviceRoleKey,
        "resolution=merge-duplicates,return=representation"
      ),
      body: JSON.stringify(notification),
    }
  );
  const notifications = await readJson(notificationResponse);
  if (!notificationResponse.ok) {
    throw new Error(
      notifications?.message || "Unable to persist Notification."
    );
  }
  const persisted = Array.isArray(notifications)
    ? notifications[0]
    : notifications;
  if (!persisted?.id) {
    throw new Error("Notification persistence returned no durable identity.");
  }
  return persisted;
}

function validateBusinessEvent(value = {}) {
  const row = {
    id: normalizeText(value.id),
    event_type: normalizeText(value.event_type),
    subject_type: normalizeText(value.subject_type),
    subject_id: normalizeText(value.subject_id),
    occurrence_id: normalizeText(value.occurrence_id),
    correlation_id: normalizeText(value.correlation_id),
    source: normalizeText(value.source),
    actor_type: normalizeText(value.actor_type) || "system",
    actor_id: normalizeText(value.actor_id),
    payload:
      value.payload && typeof value.payload === "object" ? value.payload : {},
    occurred_at: normalizeText(value.occurred_at),
  };
  if (
    !row.id ||
    !SUPPORTED_EVENT_TYPES.has(row.event_type) ||
    !row.subject_type ||
    !row.subject_id ||
    !row.occurrence_id ||
    !row.occurred_at
  ) {
    throw new Error("A complete supported Notification Business Event is required.");
  }
  return row;
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const supabaseUrl = normalizeText(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  ).replace(/\/$/, "");
  const serviceRoleKey = normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    return json(503, {
      error: "Durable Notification Business Event acceptance is not configured.",
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON payload." });
  }

  let businessEvent;
  try {
    businessEvent = validateBusinessEvent(payload.businessEvent);
  } catch (error) {
    return json(400, { error: error.message });
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/notification_business_events?on_conflict=event_type,subject_type,subject_id,occurrence_id`,
    {
      method: "POST",
      headers: restHeaders(
        serviceRoleKey,
        "resolution=ignore-duplicates,return=representation"
      ),
      body: JSON.stringify(businessEvent),
    }
  );
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    return json(502, {
      error: rows?.message || "Unable to durably accept Notification Business Event.",
    });
  }
  let accepted = Array.isArray(rows) ? rows[0] : rows;
  if (!accepted?.id) {
    const query = new URLSearchParams({
      select: "*",
      event_type: `eq.${businessEvent.event_type}`,
      subject_type: `eq.${businessEvent.subject_type}`,
      subject_id: `eq.${businessEvent.subject_id}`,
      occurrence_id: `eq.${businessEvent.occurrence_id}`,
      limit: "1",
    });
    const existingResponse = await fetch(
      `${supabaseUrl}/rest/v1/notification_business_events?${query}`,
      { headers: restHeaders(serviceRoleKey) }
    );
    const existingRows = await existingResponse.json().catch(() => []);
    if (!existingResponse.ok) {
      return json(502, {
        error:
          existingRows?.message ||
          "Unable to resolve the accepted Notification Business Event.",
      });
    }
    accepted = Array.isArray(existingRows) ? existingRows[0] : existingRows;
  }
  if (!accepted?.id) {
    return json(502, { error: "Business Event acceptance returned no durable identity." });
  }
  let notification;
  try {
    notification = await generateNotificationForAcceptedEvent({
      accepted,
      supabaseUrl,
      serviceRoleKey,
    });
  } catch (error) {
    return json(502, {
      error: error?.message || "Unable to generate Notification.",
      businessEvent: accepted,
    });
  }
  return json(200, {
    accepted: true,
    businessEvent: accepted,
    notification,
  });
}
