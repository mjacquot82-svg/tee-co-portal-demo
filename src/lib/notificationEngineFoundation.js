export const NOTIFICATION_POLICY_DELIVERY_MODES = Object.freeze({
  automatic: "automatic",
  approvalRequired: "approval_required",
  disabled: "disabled",
});

export const NOTIFICATION_CHANNELS = Object.freeze({
  email: "email",
  sms: "sms",
  staff: "staff",
  portal: "portal",
  push: "push",
  webhook: "webhook",
});

export const NOTIFICATION_STATUSES = Object.freeze({
  evaluated: "evaluated",
  pendingApproval: "pending_approval",
  queued: "queued",
  partiallySuccessful: "partially_successful",
  completed: "completed",
  noDelivery: "no_delivery",
  failed: "failed",
});

export const NOTIFICATION_DELIVERY_STATUSES = Object.freeze({
  queued: "queued",
  processing: "processing",
  sent: "sent",
  delivered: "delivered",
  failed: "failed",
  retryScheduled: "retry_scheduled",
  notDeliverable: "not_deliverable",
  suppressed: "suppressed",
  cancelled: "cancelled",
});

export const NOTIFICATION_ATTEMPT_OUTCOMES = Object.freeze({
  processing: "processing",
  accepted: "accepted",
  sent: "sent",
  delivered: "delivered",
  failed: "failed",
  indeterminate: "indeterminate",
});

export const NOTIFICATION_RETRYABILITY = Object.freeze({
  retryable: "retryable",
  terminal: "terminal",
  indeterminate: "indeterminate",
  unknown: "unknown",
});

function normalizeText(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizePositiveInteger(value, fallback = 1) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function normalizeDate(value, fallback = "") {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function requireText(value, fieldName) {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
}

export function buildBusinessEventIdentity(input = {}) {
  const eventType = requireText(input.eventType, "Business event type");
  const subjectType = requireText(input.subjectType, "Business event subject type");
  const subjectId = requireText(input.subjectId, "Business event subject id");
  const occurrenceId = requireText(input.occurrenceId, "Business event occurrence id");
  return `${eventType}:${subjectType}:${subjectId}:${occurrenceId}`;
}

export function buildPolicyIdentity(eventType, version = 1) {
  return `policy:${requireText(eventType, "Policy event type")}:v${normalizePositiveInteger(version)}`;
}

export function buildTemplateVersionIdentity(templateType, version = 1) {
  return `${requireText(templateType, "Template type")}:v${normalizePositiveInteger(version)}`;
}

export function buildNotificationIdentity(businessEventId, policyId, policyVersion = 1) {
  return [
    "notification",
    requireText(businessEventId, "Business event id"),
    requireText(policyId, "Policy id"),
    `v${normalizePositiveInteger(policyVersion)}`,
  ].join(":");
}

export function buildDeliveryIdentity(input = {}) {
  return [
    "delivery",
    requireText(input.notificationId, "Notification id"),
    requireText(input.channel, "Delivery channel"),
    requireText(input.recipientType, "Delivery recipient type"),
    requireText(input.recipientKey, "Delivery recipient key"),
    requireText(input.destinationKey, "Delivery destination key"),
    normalizeText(input.templateVersionId, "no-template"),
  ].join(":");
}

export function buildDeliveryAttemptIdentity(deliveryId, attemptNumber = 1) {
  return [
    "attempt",
    requireText(deliveryId, "Delivery id"),
    normalizePositiveInteger(attemptNumber),
  ].join(":");
}

export function buildPhase2ATemplateVersionSeed(template = {}) {
  const templateType = requireText(template.type, "Template type");
  const version = normalizePositiveInteger(template.version, 1);
  return {
    id: buildTemplateVersionIdentity(templateType, version),
    template_type: templateType,
    version,
    name: normalizeText(template.name || template.templateName),
    email_subject: normalizeText(template.emailSubject),
    email_body: normalizeText(template.emailBody),
    sms_message: normalizeText(template.smsMessage),
    required_merge_fields: Array.isArray(template.requiredMergeFields)
      ? [...template.requiredMergeFields]
      : [],
    status: "published",
    published_at: normalizeDate(template.updatedAt || template.createdAt, null),
    published_by: normalizeText(template.publishedBy, "phase2a_seed"),
  };
}

export function buildPhase2APolicySeed(template = {}) {
  const eventType = requireText(template.type, "Policy event type");
  const version = normalizePositiveInteger(template.policyVersion, 1);
  const templateVersionId = buildTemplateVersionIdentity(eventType, 1);
  const staffEnabled = Boolean(template.staffNotificationEnabled);
  return {
    id: buildPolicyIdentity(eventType, version),
    event_type: eventType,
    version,
    enabled: true,
    delivery_mode: NOTIFICATION_POLICY_DELIVERY_MODES.automatic,
    email_enabled: Boolean(template.emailEnabled),
    sms_enabled: Boolean(template.smsEnabled),
    staff_notification_enabled: staffEnabled,
    customer_audience_enabled: true,
    staff_audience_enabled: staffEnabled,
    owner_audience_enabled: false,
    channel_template_assignments: {
      ...(template.emailSubject || template.emailBody ? { email: templateVersionId } : {}),
      ...(template.smsMessage ? { sms: templateVersionId } : {}),
      ...(staffEnabled ? { staff: templateVersionId } : {}),
    },
    updated_by: normalizeText(template.updatedBy, "phase2a_seed"),
  };
}

export function mapBusinessEventToRow(event = {}) {
  const id = normalizeText(event.id) || buildBusinessEventIdentity(event);
  return {
    id,
    event_type: requireText(event.eventType, "Business event type"),
    subject_type: requireText(event.subjectType, "Business event subject type"),
    subject_id: requireText(event.subjectId, "Business event subject id"),
    occurrence_id: requireText(event.occurrenceId, "Business event occurrence id"),
    correlation_id: normalizeText(event.correlationId),
    source: normalizeText(event.source),
    actor_type: normalizeText(event.actorType, "system"),
    actor_id: normalizeText(event.actorId),
    payload: normalizeObject(event.payload),
    occurred_at: requireText(normalizeDate(event.occurredAt), "Business event occurred at"),
  };
}

export function mapNotificationToRow(notification = {}) {
  const policyVersion = normalizePositiveInteger(notification.policyVersion, 1);
  const businessEventId = requireText(notification.businessEventId, "Business event id");
  const policyId = requireText(notification.policyId, "Policy id");
  return {
    id:
      normalizeText(notification.id) ||
      buildNotificationIdentity(businessEventId, policyId, policyVersion),
    business_event_id: businessEventId,
    event_type: requireText(notification.eventType, "Notification event type"),
    subject_type: requireText(notification.subjectType, "Notification subject type"),
    subject_id: requireText(notification.subjectId, "Notification subject id"),
    correlation_id: normalizeText(notification.correlationId),
    policy_id: policyId,
    policy_version: policyVersion,
    policy_snapshot: normalizeObject(notification.policySnapshot),
    delivery_mode: normalizeText(
      notification.deliveryMode,
      NOTIFICATION_POLICY_DELIVERY_MODES.automatic
    ),
    status: normalizeText(notification.status, NOTIFICATION_STATUSES.evaluated),
    no_delivery_reason: normalizeText(notification.noDeliveryReason),
    engine_metadata: normalizeObject(notification.engineMetadata),
  };
}

export function mapDeliveryToRow(delivery = {}) {
  const identityInput = {
    notificationId: delivery.notificationId,
    channel: delivery.channel,
    recipientType: delivery.recipientType,
    recipientKey: delivery.recipientKey,
    destinationKey: delivery.destinationKey,
    templateVersionId: delivery.templateVersionId,
  };
  const id = normalizeText(delivery.id) || buildDeliveryIdentity(identityInput);
  return {
    id,
    notification_id: requireText(delivery.notificationId, "Notification id"),
    channel: requireText(delivery.channel, "Delivery channel"),
    recipient_type: requireText(delivery.recipientType, "Delivery recipient type"),
    recipient_key: requireText(delivery.recipientKey, "Delivery recipient key"),
    recipient_snapshot: normalizeObject(delivery.recipientSnapshot),
    destination_key: requireText(delivery.destinationKey, "Delivery destination key"),
    destination_snapshot: normalizeObject(delivery.destinationSnapshot),
    template_type: normalizeText(delivery.templateType),
    template_version_id: normalizeText(delivery.templateVersionId),
    template_version:
      delivery.templateVersion == null
        ? null
        : normalizePositiveInteger(delivery.templateVersion),
    rendered_content: normalizeObject(delivery.renderedContent),
    provider_key: normalizeText(delivery.providerKey),
    idempotency_key: normalizeText(delivery.idempotencyKey, id),
    status: normalizeText(delivery.status, NOTIFICATION_DELIVERY_STATUSES.queued),
    attempt_count: Math.max(0, Number(delivery.attemptCount) || 0),
  };
}

export function mapDeliveryAttemptToRow(attempt = {}) {
  const deliveryId = requireText(attempt.deliveryId, "Delivery id");
  const attemptNumber = normalizePositiveInteger(attempt.attemptNumber, 1);
  const id = normalizeText(attempt.id) || buildDeliveryAttemptIdentity(deliveryId, attemptNumber);
  return {
    id,
    delivery_id: deliveryId,
    attempt_number: attemptNumber,
    provider_key: normalizeText(attempt.providerKey),
    provider_idempotency_key: normalizeText(attempt.providerIdempotencyKey, id),
    outcome: normalizeText(attempt.outcome, NOTIFICATION_ATTEMPT_OUTCOMES.processing),
    retryability: normalizeText(attempt.retryability, NOTIFICATION_RETRYABILITY.unknown),
    provider_message_id: normalizeText(attempt.providerMessageId),
    failure_code: normalizeText(attempt.failureCode),
    failure_reason: normalizeText(attempt.failureReason),
    provider_metadata: normalizeObject(attempt.providerMetadata),
    started_at: normalizeDate(attempt.startedAt, new Date().toISOString()),
    completed_at: normalizeDate(attempt.completedAt, null),
  };
}

