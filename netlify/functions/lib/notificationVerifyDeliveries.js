const CHANNELS = ["email", "sms", "staff"];
const MATERIALIZATION_MODES = new Set(["verify", "authoritative"]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeMode(value) {
  return normalizeText(value).toLowerCase();
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

async function selectOne({
  supabaseUrl,
  serviceRoleKey,
  table,
  query,
}) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/${table}?${query}`,
    { headers: restHeaders(serviceRoleKey) }
  );
  const result = await readJson(response);
  if (!response.ok) {
    throw new Error(result?.message || `Unable to resolve ${table}.`);
  }
  return Array.isArray(result) ? result[0] || null : result;
}

function render(value, mergeContext) {
  return normalizeText(value).replace(
    /{{\s*([a-z0-9_]+)\s*}}/gi,
    (_, field) => normalizeText(mergeContext[field])
  );
}

function enabledChannels(policy) {
  return CHANNELS.filter((channel) => {
    if (channel === "email") {
      return policy.email_enabled && policy.customer_audience_enabled;
    }
    if (channel === "sms") {
      return policy.sms_enabled && policy.customer_audience_enabled;
    }
    return (
      policy.staff_notification_enabled &&
      (policy.staff_audience_enabled || policy.owner_audience_enabled)
    );
  });
}

async function resolveOrder({
  accepted,
  supabaseUrl,
  serviceRoleKey,
}) {
  const orderNumber = normalizeText(
    accepted.payload?.legacyNotificationContext?.orderNumber
  );
  const subjectId = normalizeText(accepted.subject_id);
  const lookup = orderNumber || subjectId;
  if (!lookup) return null;

  return selectOne({
    supabaseUrl,
    serviceRoleKey,
    table: "orders",
    query: new URLSearchParams({
      select: "*",
      order_number: `eq.${lookup}`,
      limit: "1",
    }),
  });
}

async function resolveCustomer({
  accepted,
  order,
  supabaseUrl,
  serviceRoleKey,
}) {
  const customerId = normalizeText(
    order?.customer_id ||
      accepted.payload?.legacyNotificationContext?.customerReference
  );
  if (!customerId) return null;
  return selectOne({
    supabaseUrl,
    serviceRoleKey,
    table: "customers",
    query: new URLSearchParams({
      select: "*",
      id: `eq.${customerId}`,
      limit: "1",
    }),
  });
}

async function resolveStaff({
  policy,
  order,
  supabaseUrl,
  serviceRoleKey,
}) {
  if (!policy.staff_notification_enabled) return null;
  const assignedId = normalizeText(
    order?.assigned_to_staff_user_id || order?.assigned_to_staff_id
  );
  const query = new URLSearchParams({
    select: "id,name,role,active",
    limit: "1",
  });
  if (assignedId) {
    query.set("id", `eq.${assignedId}`);
  } else if (policy.owner_audience_enabled && !policy.staff_audience_enabled) {
    query.set("role", "eq.Owner");
    query.set("active", "eq.true");
  } else {
    query.set("active", "eq.true");
    query.set("order", "created_at.asc");
  }
  return selectOne({
    supabaseUrl,
    serviceRoleKey,
    table: "staff_users",
    query,
  });
}

async function resolveTemplate({
  channel,
  policy,
  supabaseUrl,
  serviceRoleKey,
}) {
  const templateVersionId = normalizeText(
    policy.channel_template_assignments?.[channel]
  );
  if (!templateVersionId) {
    throw new Error(`No immutable template version is assigned for ${channel}.`);
  }
  const version = await selectOne({
    supabaseUrl,
    serviceRoleKey,
    table: "notification_template_versions",
    query: new URLSearchParams({
      select: "*",
      id: `eq.${templateVersionId}`,
      status: "eq.published",
      limit: "1",
    }),
  });
  if (!version?.id) {
    throw new Error(
      `Published template version ${templateVersionId} was not found.`
    );
  }
  return version;
}

function templateContent(channel, template, mergeContext) {
  if (channel === "email") {
    return {
      subject: render(template.email_subject, mergeContext),
      body: render(template.email_body, mergeContext),
    };
  }
  if (channel === "sms") {
    return { body: render(template.sms_message, mergeContext) };
  }
  return {
    title: render(template.email_subject, mergeContext),
    body: render(
      template.email_body || template.sms_message,
      mergeContext
    ),
  };
}

function deliveryTarget({ channel, accepted, order, customer, staff }) {
  if (channel === "email") {
    const email = normalizeText(customer?.email || order?.customer_email)
      .toLowerCase();
    const recipientKey = normalizeText(
      customer?.id || order?.customer_id || `order:${accepted.subject_id}`
    );
    return {
      recipientType: "customer",
      recipientKey,
      recipientSnapshot: {
        id: recipientKey,
        name: normalizeText(
          customer?.name || customer?.company || order?.customer_name
        ),
        email,
        phone: normalizeText(customer?.phone || order?.customer_phone),
        audience: "customer",
      },
      destinationKey: email || `missing:email:${recipientKey}`,
      destinationSnapshot: { channel, email },
      deliverable: Boolean(email),
      failureCode: email ? "" : "missing_email",
    };
  }
  if (channel === "sms") {
    const phone = normalizeText(customer?.phone || order?.customer_phone);
    const normalizedPhone = phone.replace(/\D/g, "");
    const recipientKey = normalizeText(
      customer?.id || order?.customer_id || `order:${accepted.subject_id}`
    );
    return {
      recipientType: "customer",
      recipientKey,
      recipientSnapshot: {
        id: recipientKey,
        name: normalizeText(
          customer?.name || customer?.company || order?.customer_name
        ),
        email: normalizeText(customer?.email || order?.customer_email),
        phone,
        audience: "customer",
      },
      destinationKey:
        normalizedPhone || `missing:phone:${recipientKey}`,
      destinationSnapshot: { channel, phone, normalizedPhone },
      deliverable: Boolean(normalizedPhone),
      failureCode: normalizedPhone ? "" : "missing_phone",
    };
  }

  const staffId = normalizeText(staff?.id);
  const audience =
    normalizeText(staff?.role).toLowerCase() === "owner" ? "owner" : "staff";
  return {
    recipientType: audience,
    recipientKey: staffId || `${audience}:unresolved`,
    recipientSnapshot: {
      id: staffId,
      name: normalizeText(staff?.name),
      role: normalizeText(staff?.role),
      status:
        typeof staff?.active === "boolean"
          ? staff.active
            ? "Active"
            : "Inactive"
          : normalizeText(staff?.status),
      audience,
    },
    destinationKey:
      staffId
        ? `staff-inbox:${staffId}`
        : `missing:staff-inbox:${audience}`,
    destinationSnapshot: { channel, staffUserId: staffId },
    deliverable: Boolean(staffId),
    failureCode: staffId ? "" : "missing_staff_recipient",
  };
}

function providerKey(channel) {
  if (channel === "email") return "resend";
  if (channel === "sms") return "twilio";
  return "staff_internal";
}

async function persistDelivery({
  notification,
  channel,
  template,
  content,
  target,
  observationOnly,
  dispatcherEligible,
  supabaseUrl,
  serviceRoleKey,
}) {
  const identityParts = [
    notification.id,
    channel,
    target.recipientType,
    target.recipientKey,
    target.destinationKey,
    template.id,
  ];
  const id = `delivery:${identityParts.join(":")}`;
  const row = {
    id,
    notification_id: notification.id,
    channel,
    recipient_type: target.recipientType,
    recipient_key: target.recipientKey,
    recipient_snapshot: target.recipientSnapshot,
    destination_key: target.destinationKey,
    destination_snapshot: {
      ...target.destinationSnapshot,
      observationOnly,
      dispatcherEligible,
    },
    template_type: template.template_type,
    template_version_id: template.id,
    template_version: template.version,
    rendered_content: content,
    provider_key: providerKey(channel),
    idempotency_key: id,
    status: target.deliverable ? "queued" : "not_deliverable",
    attempt_count: 0,
    provider_message_id: "",
    last_failure_code: target.failureCode,
    last_failure_reason: target.failureCode
      ? "No valid destination was resolved for this channel."
      : "",
    queued_at: target.deliverable ? new Date().toISOString() : null,
  };
  const response = await fetch(
    `${supabaseUrl}/rest/v1/notification_deliveries?on_conflict=idempotency_key`,
    {
      method: "POST",
      headers: restHeaders(
        serviceRoleKey,
        "resolution=merge-duplicates,return=representation"
      ),
      body: JSON.stringify(row),
    }
  );
  const result = await readJson(response);
  if (!response.ok) {
    throw new Error(result?.message || `Unable to persist ${channel} Delivery.`);
  }
  const persisted = Array.isArray(result) ? result[0] : result;
  if (!persisted?.id) {
    throw new Error(`${channel} Delivery persistence returned no identity.`);
  }
  return persisted;
}

async function updateNotification({
  notification,
  templateSnapshots,
  deliveries,
  mergeContext,
  cutoverMode,
  observationOnly,
  dispatcherEligible,
  supabaseUrl,
  serviceRoleKey,
}) {
  const statusCounts = deliveries.reduce((counts, delivery) => {
    counts[delivery.status] = (counts[delivery.status] || 0) + 1;
    return counts;
  }, {});
  const response = await fetch(
    `${supabaseUrl}/rest/v1/notifications?id=eq.${encodeURIComponent(notification.id)}`,
    {
      method: "PATCH",
      headers: restHeaders(serviceRoleKey, "return=representation"),
      body: JSON.stringify({
        status: deliveries.some((delivery) => delivery.status === "queued")
          ? "queued"
          : "no_delivery",
        no_delivery_reason: deliveries.some(
          (delivery) => delivery.status === "queued"
        )
          ? ""
          : "no_deliverable_recipients",
        engine_metadata: {
          ...(notification.engine_metadata || {}),
          observationOnly,
          legacyRuntimeAuthoritative: observationOnly,
          cutoverMode,
          deliveriesDeferredUntilPhase2C: false,
          phase2C: {
            status: "prepared",
            mergeContext,
            templateSnapshots,
            deliveriesCreated: deliveries.length,
          },
          phase2D: {
            status: observationOnly
              ? "shadow_deliveries_created"
              : "deliveries_created",
            observationOnly,
            dispatcherEligible,
            deliveryCount: deliveries.length,
            deliveryStatusCounts: statusCounts,
          },
        },
      }),
    }
  );
  const result = await readJson(response);
  if (!response.ok) {
    throw new Error(result?.message || "Unable to finalize Notification.");
  }
  return (Array.isArray(result) ? result[0] : result) || notification;
}

export async function createVerifyDeliveriesForAcceptedNotification({
  accepted,
  notification,
  policy,
  supabaseUrl,
  serviceRoleKey,
  cutoverMode = process.env.VITE_NOTIFICATION_ENGINE_CUTOVER_MODE,
}) {
  const validatedMode = normalizeMode(cutoverMode);
  if (!MATERIALIZATION_MODES.has(validatedMode)) {
    return {
      created: false,
      reason: "unsupported_cutover_mode",
      notification,
      deliveries: [],
    };
  }
  if (accepted.event_type !== "quote_approved") {
    return {
      created: false,
      reason: "unsupported_event",
      notification,
      deliveries: [],
    };
  }
  const observationOnly = validatedMode === "verify";
  const dispatcherEligible = validatedMode === "authoritative";

  const channels = enabledChannels(policy);
  if (!channels.length || notification.status !== "evaluated") {
    return {
      created: false,
      reason: "policy_created_no_deliveries",
      notification,
      deliveries: [],
    };
  }

  const order = await resolveOrder({
    accepted,
    supabaseUrl,
    serviceRoleKey,
  });
  const customer = await resolveCustomer({
    accepted,
    order,
    supabaseUrl,
    serviceRoleKey,
  });
  const staff = await resolveStaff({
    policy,
    order,
    supabaseUrl,
    serviceRoleKey,
  });
  const mergeContext = {
    customer_name: normalizeText(
      customer?.name || customer?.company || order?.customer_name
    ),
    order_number: normalizeText(
      order?.order_number ||
        accepted.payload?.legacyNotificationContext?.orderNumber ||
        accepted.subject_id
    ),
    company_name: "Tee & Co",
  };
  const missingRequired = ["customer_name", "order_number", "company_name"]
    .filter((field) => !mergeContext[field]);
  if (missingRequired.length) {
    throw new Error(
      `Missing required quote_approved merge fields: ${missingRequired.join(", ")}.`
    );
  }

  const deliveries = [];
  const templateSnapshots = {};
  for (const channel of channels) {
    const template = await resolveTemplate({
      channel,
      policy,
      supabaseUrl,
      serviceRoleKey,
    });
    const content = templateContent(channel, template, mergeContext);
    templateSnapshots[channel] = {
      templateType: template.template_type,
      templateVersionId: template.id,
      templateVersion: template.version,
      content,
    };
    const target = deliveryTarget({
      channel,
      accepted,
      order,
      customer,
      staff,
    });
    deliveries.push(
      await persistDelivery({
        notification,
        channel,
        template,
        content,
        target,
        observationOnly,
        dispatcherEligible,
        supabaseUrl,
        serviceRoleKey,
      })
    );
  }

  const finalized = await updateNotification({
    notification,
    templateSnapshots,
    deliveries,
    mergeContext,
    cutoverMode: validatedMode,
    observationOnly,
    dispatcherEligible,
    supabaseUrl,
    serviceRoleKey,
  });
  return {
    created: true,
    notification: finalized,
    deliveries,
  };
}
