/* global Buffer */

import {
  listPaymentEvents,
  listPaymentRequests,
  listPayments,
  recordPayment,
  recordPaymentEvent,
  updatePayment,
  updatePaymentRequest,
} from "../lib/paymentsStore";
import { triggerNotificationEvent } from "../lib/notificationDeliveryService";
import { NOTIFICATION_TYPES } from "../lib/notificationTemplatesStore";

function normalizeText(value, fallback = "") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeAmount(value) {
  const amount = typeof value === "number" ? value : Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

const PAYMENT_STATUS_PRECEDENCE = Object.freeze({
  unknown: 0,
  processing: 10,
  canceled: 20,
  failed: 30,
  captured: 40,
});

const FINAL_SUCCESS_STATUSES = new Set(["captured", "paid", "succeeded", "success", "settled", "completed"]);
const FAILED_STATUSES = new Set(["failed", "declined", "voided", "canceled", "cancelled"]);

function squareMoneyToAmount(money = {}) {
  const amount = typeof money.amount === "number" ? money.amount : Number(money.amount || 0);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount) / 100) : 0;
}

function constantTimeEqual(left = "", right = "") {
  const leftText = String(left);
  const rightText = String(right);
  let mismatch = leftText.length === rightText.length ? 0 : 1;
  const length = Math.max(leftText.length, rightText.length);

  for (let index = 0; index < length; index += 1) {
    mismatch |= leftText.charCodeAt(index % leftText.length) ^ rightText.charCodeAt(index % rightText.length);
  }

  return mismatch === 0;
}

function base64FromBytes(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function hmacSha256Base64(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return base64FromBytes(new Uint8Array(signature));
}

export async function buildSquareWebhookSignature({ signatureKey, notificationUrl, body }) {
  return hmacSha256Base64(signatureKey, `${notificationUrl}${body}`);
}

export async function verifySquareWebhookSignature({
  signatureKey,
  notificationUrl,
  body,
  signature,
}) {
  const normalizedSignatureKey = normalizeText(signatureKey);
  const normalizedNotificationUrl = normalizeText(notificationUrl);
  const normalizedSignature = normalizeText(signature);

  if (!normalizedSignatureKey || !normalizedNotificationUrl || !normalizedSignature) {
    return false;
  }

  const expectedSignature = await buildSquareWebhookSignature({
    signatureKey: normalizedSignatureKey,
    notificationUrl: normalizedNotificationUrl,
    body: String(body || ""),
  });
  return constantTimeEqual(expectedSignature, normalizedSignature);
}

function extractSquarePayment(webhookEvent = {}) {
  const object = webhookEvent.data?.object || webhookEvent.object || {};
  return object.payment || object;
}

function getSquarePaymentAmount(payment = {}) {
  return (
    squareMoneyToAmount(payment.amount_money) ||
    squareMoneyToAmount(payment.total_money) ||
    squareMoneyToAmount(payment.approved_money) ||
    normalizeAmount(payment.amount)
  );
}

function getSquarePaymentCurrency(payment = {}) {
  return normalizeText(
    payment.amount_money?.currency ||
      payment.total_money?.currency ||
      payment.approved_money?.currency ||
      payment.currency,
    "CAD"
  ).toUpperCase();
}

export function mapSquarePaymentStatus(payment = {}, eventType = "") {
  const status = normalizeLower(payment.status || payment.state || eventType);

  if (status.includes("fail") || status.includes("declin")) {
    return {
      paymentStatus: "failed",
      requestStatus: "failed",
      eventType: "square_payment_failed",
      terminal: true,
      successful: false,
      failed: true,
      processing: false,
    };
  }

  if (status.includes("cancel") || status.includes("void")) {
    return {
      paymentStatus: "canceled",
      requestStatus: "canceled",
      eventType: "square_payment_canceled",
      terminal: true,
      successful: false,
      failed: true,
      processing: false,
    };
  }

  if (
    status.includes("complete") ||
    status.includes("captur") ||
    status.includes("paid") ||
    eventType.includes("payment.completed")
  ) {
    return {
      paymentStatus: "captured",
      requestStatus: "paid",
      eventType: "square_payment_completed",
      terminal: true,
      successful: true,
      failed: false,
      processing: false,
    };
  }

  return {
    paymentStatus: "processing",
    requestStatus: "processing",
    eventType: "square_payment_processing",
    terminal: false,
    successful: false,
    failed: false,
    processing: true,
  };
}

function getStatusPrecedence(status) {
  return PAYMENT_STATUS_PRECEDENCE[normalizeLower(status)] ?? PAYMENT_STATUS_PRECEDENCE.unknown;
}

function isSuccessfulStatus(status) {
  const normalized = normalizeLower(status);
  return FINAL_SUCCESS_STATUSES.has(normalized);
}

function getRequestMetadataMatch(payment = {}) {
  const metadata = payment.metadata && typeof payment.metadata === "object" ? payment.metadata : {};
  return {
    paymentRequestId: normalizeText(metadata.payment_request_id || metadata.paymentRequestId),
    requestNumber: normalizeText(metadata.request_number || metadata.requestNumber),
    orderNumber: normalizeText(metadata.order_number || metadata.orderNumber),
    customerId: normalizeText(metadata.customer_id || metadata.customerId),
    requestType: normalizeText(metadata.request_type || metadata.requestType),
  };
}

function requestMatchesSquarePayment(request = {}, payment = {}) {
  const metadata = getRequestMetadataMatch(payment);
  const orderId = normalizeText(payment.order_id || payment.orderId);
  const paymentLinkId = normalizeText(payment.payment_link_id || payment.paymentLinkId);

  if (metadata.paymentRequestId && request.id === metadata.paymentRequestId) return true;
  if (metadata.requestNumber && request.request_number === metadata.requestNumber) return true;
  if (orderId && request.provider_order_id === orderId) return true;
  if (orderId && request.metadata?.square_payment_link?.order_id === orderId) return true;
  if (paymentLinkId && request.provider_payment_link_id === paymentLinkId) return true;
  if (metadata.orderNumber && request.order_number === metadata.orderNumber) return true;

  return false;
}

async function resolvePaymentRequest(payment = {}, adapter) {
  const requests = await adapter.listPaymentRequests();
  return requests.find((request) => requestMatchesSquarePayment(request, payment)) || null;
}

function paymentMatchesSquarePayment(paymentRecord = {}, squarePaymentId) {
  const normalizedSquarePaymentId = normalizeText(squarePaymentId);
  if (!normalizedSquarePaymentId) return false;

  return (
    paymentRecord.provider_payment_id === normalizedSquarePaymentId ||
    paymentRecord.idempotency_key === `square-payment:${normalizedSquarePaymentId}` ||
    paymentRecord.metadata?.square_payment_id === normalizedSquarePaymentId
  );
}

async function resolveExistingSquarePayment(paymentId, adapter) {
  if (!adapter.listPayments) return null;
  const payments = await adapter.listPayments();
  return payments.find((paymentRecord) => paymentMatchesSquarePayment(paymentRecord, paymentId)) || null;
}

function hasProcessedSquareEvent(events = [], squareEventId) {
  const normalizedEventId = normalizeText(squareEventId);
  if (!normalizedEventId) return false;
  return events.some((event) => event.payload?.square_event_id === normalizedEventId);
}

function buildRequestMetadata(request = {}, payment = {}, webhookEvent = {}, statusMapping = null) {
  const existingMetadata = request.metadata && typeof request.metadata === "object" ? request.metadata : {};
  const normalizedPaymentStatus = statusMapping?.paymentStatus || normalizeText(payment.status);
  return {
    ...existingMetadata,
    last_square_webhook: {
      event_id: normalizeText(webhookEvent.event_id || webhookEvent.id),
      event_type: normalizeText(webhookEvent.type),
      payment_id: normalizeText(payment.id),
      payment_status: normalizeText(payment.status),
      normalized_payment_status: normalizedPaymentStatus,
      status_precedence: getStatusPrecedence(normalizedPaymentStatus),
      event_created_at: normalizeText(webhookEvent.created_at || payment.updated_at || payment.created_at),
      processed_at: new Date().toISOString(),
    },
  };
}

function getLastWebhookState(request = {}) {
  const webhookState = request?.metadata?.last_square_webhook || {};
  return {
    eventId: normalizeText(webhookState.event_id),
    eventType: normalizeText(webhookState.event_type),
    paymentId: normalizeText(webhookState.payment_id),
    paymentStatus: normalizeText(webhookState.normalized_payment_status || webhookState.payment_status),
    eventCreatedAt: normalizeText(webhookState.event_created_at || webhookState.processed_at),
    statusPrecedence: Number(webhookState.status_precedence || getStatusPrecedence(webhookState.normalized_payment_status || webhookState.payment_status)),
  };
}

function shouldApplyWebhookState({ paymentRequest, statusMapping, eventTimestamp, existingSquarePayment }) {
  if (!paymentRequest) {
    return {
      apply: true,
      reason: "no_payment_request_matched",
    };
  }

  if (existingSquarePayment && isSuccessfulStatus(existingSquarePayment.status) && !statusMapping.successful) {
    return {
      apply: false,
      reason: "existing_successful_payment_protects_state",
    };
  }

  const lastState = getLastWebhookState(paymentRequest);
  const incomingPrecedence = getStatusPrecedence(statusMapping.paymentStatus);
  const lastTimestamp = new Date(lastState.eventCreatedAt || 0).getTime();
  const incomingTimestamp = new Date(eventTimestamp || 0).getTime();

  if (lastState.paymentStatus && lastState.statusPrecedence > incomingPrecedence) {
    return {
      apply: false,
      reason: "higher_precedence_state_already_applied",
    };
  }

  if (
    lastState.paymentStatus &&
    lastState.statusPrecedence === incomingPrecedence &&
    lastTimestamp > incomingTimestamp
  ) {
    return {
      apply: false,
      reason: "newer_equivalent_state_already_applied",
    };
  }

  return {
    apply: true,
    reason: "state_update_allowed",
  };
}

function getPaymentConfidence(statusMapping, stateDecision, reconciliation = []) {
  if (reconciliation.some((item) => item.severity === "high")) return "Manual Review Required";
  if (!stateDecision.apply) return "Stale Webhook Ignored";
  if (statusMapping.successful) return "Payment Verified";
  if (statusMapping.processing) return "Awaiting Webhook Confirmation";
  if (statusMapping.failed) return "Manual Review Required";
  return "Awaiting Webhook Confirmation";
}

function buildReconciliationIssues({
  paymentRequest,
  payments = [],
  payment,
  statusMapping,
}) {
  if (!paymentRequest) return [];

  const amount = getSquarePaymentAmount(payment);
  const successfulPayments = payments.filter((paymentRecord) => {
    const requestMatch = paymentRecord.payment_request_id === paymentRequest.id;
    const orderMatch = paymentRequest.order_number && paymentRecord.order_number === paymentRequest.order_number;
    return (requestMatch || orderMatch) && isSuccessfulStatus(paymentRecord.status);
  });
  const squarePayments = successfulPayments.filter((paymentRecord) => normalizeLower(paymentRecord.provider) === "square");
  const manualPayments = successfulPayments.filter((paymentRecord) => normalizeLower(paymentRecord.provider) !== "square");
  const existingSameSquarePayment = squarePayments.find((paymentRecord) => paymentMatchesSquarePayment(paymentRecord, payment.id));
  const totalPaid = successfulPayments.reduce((sum, paymentRecord) => sum + normalizeAmount(paymentRecord.amount), 0);
  const requested = normalizeAmount(paymentRequest.amount_requested);
  const issues = [];

  if (existingSameSquarePayment && statusMapping.successful) {
    issues.push({
      code: "duplicate_square_payment",
      severity: "medium",
      label: "Duplicate Payment Detected",
      detail: "Square sent another webhook for a payment already recorded on this request.",
    });
  }

  if (statusMapping.successful && manualPayments.length && amount > 0) {
    issues.push({
      code: "manual_square_conflict",
      severity: "high",
      label: "Manual Review Required",
      detail: "A manual payment and a Square payment are both connected to this request or order.",
    });
  }

  if (statusMapping.successful && requested > 0 && totalPaid + amount > requested + 0.009) {
    issues.push({
      code: "overpayment",
      severity: "high",
      label: "Overpayment",
      detail: "Recorded successful payments exceed the amount requested.",
    });
  }

  if (statusMapping.failed && squarePayments.length) {
    issues.push({
      code: "failed_after_success",
      severity: "high",
      label: "Stale Webhook Ignored",
      detail: "A failed Square webhook arrived after a successful Square payment was already recorded.",
    });
  }

  return issues;
}

function buildPaymentInput({ payment, paymentRequest, statusMapping, webhookEvent }) {
  const metadata = getRequestMetadataMatch(payment);
  const amount = getSquarePaymentAmount(payment);

  return {
    customer_id: paymentRequest?.customer_id || metadata.customerId,
    order_id: paymentRequest?.order_id || "",
    order_number: paymentRequest?.order_number || metadata.orderNumber,
    payment_request_id: paymentRequest?.id || metadata.paymentRequestId,
    payment_type: paymentRequest?.request_type || metadata.requestType || "partial",
    status: statusMapping.paymentStatus,
    amount,
    currency: getSquarePaymentCurrency(payment),
    method: "square_online",
    provider: "square",
    provider_payment_id: normalizeText(payment.id),
    provider_order_id: normalizeText(payment.order_id || payment.orderId),
    provider_location_id: normalizeText(payment.location_id || payment.locationId),
    provider_receipt_url: normalizeText(payment.receipt_url || payment.receiptUrl),
    provider_status: normalizeText(payment.status),
    idempotency_key: `square-payment:${normalizeText(payment.id)}`,
    captured_at: statusMapping.successful
      ? normalizeText(payment.updated_at || payment.created_at || webhookEvent.created_at) || new Date().toISOString()
      : null,
    note: `Square ${normalizeText(webhookEvent.type, "payment event")}`,
    metadata: {
      source: "square_webhook",
      square_event_id: normalizeText(webhookEvent.event_id || webhookEvent.id),
      square_event_type: normalizeText(webhookEvent.type),
      square_payment_id: normalizeText(payment.id),
      square_payment_status: normalizeText(payment.status),
    },
    created_at: normalizeText(payment.created_at || webhookEvent.created_at) || new Date().toISOString(),
    updated_at: normalizeText(payment.updated_at || webhookEvent.created_at) || new Date().toISOString(),
  };
}

function buildDefaultAdapter() {
  return {
    listPaymentRequests,
    listPaymentEvents,
    listPayments,
    updatePaymentRequest,
    recordPayment,
    updatePayment,
    recordPaymentEvent,
    triggerNotificationEvent,
  };
}

async function processSquareWebhookEventWithAdapter(webhookEvent = {}, options = {}) {
  const adapter = options.adapter;
  const squareEventId = normalizeText(webhookEvent.event_id || webhookEvent.id);
  const squareEventType = normalizeText(webhookEvent.type);
  const payment = extractSquarePayment(webhookEvent);
  const paymentId = normalizeText(payment.id);

  if (!squareEventType.startsWith("payment.") || !paymentId) {
    return { processed: false, ignored: true, reason: "unsupported_event" };
  }

  const existingEvents = await adapter.listPaymentEvents();
  if (hasProcessedSquareEvent(existingEvents, squareEventId)) {
    return { processed: false, duplicate: true, squareEventId };
  }

  const statusMapping = mapSquarePaymentStatus(payment, squareEventType);
  const paymentRequest = await resolvePaymentRequest(payment, adapter);
  const eventTimestamp = normalizeText(webhookEvent.created_at || payment.updated_at || payment.created_at) || new Date().toISOString();
  const existingSquarePayment = await resolveExistingSquarePayment(paymentId, adapter);
  const allPayments = adapter.listPayments ? await adapter.listPayments() : [];
  const reconciliationIssues = buildReconciliationIssues({
    paymentRequest,
    payments: allPayments,
    payment,
    statusMapping,
  });
  const stateDecision = shouldApplyWebhookState({
    paymentRequest,
    statusMapping,
    eventTimestamp,
    existingSquarePayment,
  });
  const paymentConfidence = getPaymentConfidence(statusMapping, stateDecision, reconciliationIssues);
  let recordedPayment = null;
  let updatedPaymentRequest = null;

  if (paymentRequest && stateDecision.apply) {
    updatedPaymentRequest = await adapter.updatePaymentRequest(paymentRequest.id, {
      status: statusMapping.requestStatus,
      paid_at: statusMapping.successful ? eventTimestamp : paymentRequest.paid_at || null,
      metadata: {
        ...buildRequestMetadata(paymentRequest, payment, webhookEvent, statusMapping),
        payment_confidence: paymentConfidence,
        square_reconciliation_issues: reconciliationIssues,
      },
    });
  }

  if (statusMapping.terminal) {
    const paymentInput = buildPaymentInput({ payment, paymentRequest, statusMapping, webhookEvent });
    if (!existingSquarePayment) {
      recordedPayment = await adapter.recordPayment(paymentInput);
    } else if (
      adapter.updatePayment &&
      getStatusPrecedence(statusMapping.paymentStatus) > getStatusPrecedence(existingSquarePayment.status)
    ) {
      recordedPayment = await adapter.updatePayment(existingSquarePayment.id, paymentInput);
    } else {
      recordedPayment = existingSquarePayment;
    }
  }

  const paymentEvent = await adapter.recordPaymentEvent({
    payment_id: recordedPayment?.id || "",
    payment_request_id: paymentRequest?.id || "",
    order_id: paymentRequest?.order_id || "",
    order_number: paymentRequest?.order_number || getRequestMetadataMatch(payment).orderNumber,
    event_type: statusMapping.eventType,
    event_source: "square_webhook",
    summary: statusMapping.successful
      ? `Square payment received for $${getSquarePaymentAmount(payment).toFixed(2)}.`
      : statusMapping.failed
        ? `Square payment ${statusMapping.paymentStatus}.`
        : "Square payment is processing.",
    payload: {
      square_event_id: squareEventId,
      square_event_type: squareEventType,
      square_payment_id: paymentId,
      square_payment_status: normalizeText(payment.status),
      status_precedence: getStatusPrecedence(statusMapping.paymentStatus),
      applied_to_request: Boolean(paymentRequest && stateDecision.apply),
      skipped_reason: stateDecision.apply ? "" : stateDecision.reason,
      payment_confidence: paymentConfidence,
      reconciliation_issues: reconciliationIssues,
      webhookEvent,
    },
    created_at: eventTimestamp,
  });

  if (statusMapping.failed && adapter.triggerNotificationEvent && options.triggerNotifications !== false) {
    adapter.triggerNotificationEvent(NOTIFICATION_TYPES.paymentFailed, {
      payment: recordedPayment,
      paymentRequest: updatedPaymentRequest || paymentRequest || {},
      source: "square_webhook",
      orderNumber: paymentRequest?.order_number || getRequestMetadataMatch(payment).orderNumber,
      depositAmount: getSquarePaymentAmount(payment),
      paymentLink: paymentRequest?.provider_checkout_url || "",
    });
  }

  return {
    processed: true,
    duplicate: false,
    status: statusMapping.paymentStatus,
    paymentRequest: updatedPaymentRequest || paymentRequest,
    payment: recordedPayment,
    paymentEvent,
    paymentConfidence,
    reconciliationIssues,
    skippedStateUpdateReason: stateDecision.apply ? "" : stateDecision.reason,
  };
}

export async function processSquareWebhookEvent(webhookEvent = {}, options = {}) {
  const adapter = options.adapter || buildDefaultAdapter();
  const operation = () => processSquareWebhookEventWithAdapter(webhookEvent, {
    ...options,
    adapter,
  });

  if (typeof adapter.runAtomic === "function") {
    return adapter.runAtomic(operation);
  }

  return operation();
}

export async function recordSquareWebhookProcessingFailure(webhookEvent = {}, error, options = {}) {
  const adapter = options.adapter || buildDefaultAdapter();
  const payment = extractSquarePayment(webhookEvent);
  const metadata = getRequestMetadataMatch(payment);
  const squareEventId = normalizeText(webhookEvent.event_id || webhookEvent.id);
  const failureEventId = `failure:${squareEventId || Date.now()}`;
  const existingEvents = typeof adapter.listPaymentEvents === "function" ? await adapter.listPaymentEvents() : [];
  const duplicateFailure = existingEvents.some((event) => event.payload?.square_failure_event_id === failureEventId);

  if (duplicateFailure || typeof adapter.recordPaymentEvent !== "function") {
    return null;
  }

  return adapter.recordPaymentEvent({
    payment_request_id: metadata.paymentRequestId,
    order_number: metadata.orderNumber,
    event_type: "square_webhook_processing_failed",
    event_source: "square_webhook",
    summary: "Square webhook processing failed and is safe to retry.",
    payload: {
      square_failure_event_id: failureEventId,
      original_square_event_id: squareEventId,
      square_event_type: normalizeText(webhookEvent.type),
      square_payment_id: normalizeText(payment.id),
      error_message: error instanceof Error ? error.message : normalizeText(error, "Unknown webhook processing error."),
      retryable: true,
    },
    created_at: new Date().toISOString(),
  });
}
