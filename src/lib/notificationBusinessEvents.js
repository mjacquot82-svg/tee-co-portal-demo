import { mapBusinessEventToRow } from "./notificationEngineFoundation";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function firstText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return "";
}

function resolveSubject(context = {}) {
  const explicit = context.businessEvent || {};
  if (explicit.subjectType && explicit.subjectId) {
    return {
      subjectType: normalizeText(explicit.subjectType),
      subjectId: normalizeText(explicit.subjectId),
    };
  }

  const payment = context.payment || {};
  if (payment.id || payment.provider_payment_id) {
    return {
      subjectType: "payment",
      subjectId: firstText(payment.id, payment.provider_payment_id),
    };
  }

  const paymentRequest = context.paymentRequest || {};
  if (paymentRequest.id) {
    return {
      subjectType: "payment_request",
      subjectId: normalizeText(paymentRequest.id),
    };
  }

  const order = context.order || {};
  return {
    subjectType: "order",
    subjectId: firstText(
      explicit.subjectId,
      order.id,
      order.order_number,
      context.orderNumber
    ),
  };
}

function resolveOccurredAt(context = {}) {
  const explicit = context.businessEvent || {};
  return firstText(
    explicit.occurredAt,
    context.businessEventOccurredAt,
    context.timestamp,
    context.payment?.updated_at,
    context.payment?.created_at,
    context.paymentRequest?.updated_at,
    context.paymentRequest?.created_at,
    context.order?.updated_at,
    context.order?.created_at
  );
}

function resolveOccurrenceId(eventType, subject, context = {}) {
  const explicit = context.businessEvent || {};
  const occurredAt = resolveOccurredAt(context);
  return firstText(
    explicit.occurrenceId,
    context.businessEventOccurrenceId,
    context.idempotencyKey,
    context.payment?.idempotency_key,
    context.payment?.provider_payment_id,
    context.payment?.id,
    context.paymentRequest?.id,
    occurredAt ? `${eventType}:${occurredAt}` : "",
    `${eventType}:${subject.subjectType}:${subject.subjectId}`
  );
}

export function buildNotificationBusinessEvent(eventType, context = {}) {
  const normalizedEventType = normalizeText(eventType);
  const subject = resolveSubject(context);
  const occurredAt = resolveOccurredAt(context);
  const explicit = context.businessEvent || {};

  return {
    id: normalizeText(explicit.id),
    eventType: normalizedEventType,
    subjectType: subject.subjectType,
    subjectId: subject.subjectId,
    occurrenceId: resolveOccurrenceId(normalizedEventType, subject, context),
    correlationId: firstText(
      explicit.correlationId,
      context.correlationId,
      context.orderNumber && `order:${context.orderNumber}`,
      context.order?.order_number && `order:${context.order.order_number}`
    ),
    source: firstText(explicit.source, context.source, "legacy_notification_service"),
    actorType: firstText(explicit.actorType, context.actorType, "system"),
    actorId: firstText(explicit.actorId, context.actorId, context.staffId),
    occurredAt,
    payload: {
      ...(explicit.payload && typeof explicit.payload === "object" ? explicit.payload : {}),
      legacyNotificationContext: {
        orderNumber: firstText(context.orderNumber, context.order?.order_number),
        customerReference: firstText(
          context.customer?.id,
          context.order?.customer_id,
          context.paymentRequest?.customer_id
        ),
        source: firstText(context.source, "legacy_notification_service"),
      },
    },
  };
}

export function buildNotificationBusinessEventRow(eventType, context = {}) {
  return mapBusinessEventToRow(buildNotificationBusinessEvent(eventType, context));
}

