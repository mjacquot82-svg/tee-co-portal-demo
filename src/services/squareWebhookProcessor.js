/* global Buffer */

import {
  listPaymentEvents,
  listPaymentRequests,
  recordPayment,
  recordPaymentEvent,
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

function hasProcessedSquareEvent(events = [], squareEventId) {
  const normalizedEventId = normalizeText(squareEventId);
  if (!normalizedEventId) return false;
  return events.some((event) => event.payload?.square_event_id === normalizedEventId);
}

function buildRequestMetadata(request = {}, payment = {}, webhookEvent = {}) {
  const existingMetadata = request.metadata && typeof request.metadata === "object" ? request.metadata : {};
  return {
    ...existingMetadata,
    last_square_webhook: {
      event_id: normalizeText(webhookEvent.event_id || webhookEvent.id),
      event_type: normalizeText(webhookEvent.type),
      payment_id: normalizeText(payment.id),
      payment_status: normalizeText(payment.status),
      processed_at: new Date().toISOString(),
    },
  };
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
    updatePaymentRequest,
    recordPayment,
    recordPaymentEvent,
    triggerNotificationEvent,
  };
}

export async function processSquareWebhookEvent(webhookEvent = {}, options = {}) {
  const adapter = options.adapter || buildDefaultAdapter();
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
  let recordedPayment = null;
  let updatedPaymentRequest = null;

  if (paymentRequest) {
    updatedPaymentRequest = await adapter.updatePaymentRequest(paymentRequest.id, {
      status: statusMapping.requestStatus,
      paid_at: statusMapping.successful ? eventTimestamp : paymentRequest.paid_at || null,
      metadata: buildRequestMetadata(paymentRequest, payment, webhookEvent),
    });
  }

  if (statusMapping.terminal) {
    recordedPayment = await adapter.recordPayment(
      buildPaymentInput({ payment, paymentRequest, statusMapping, webhookEvent })
    );
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
  };
}
