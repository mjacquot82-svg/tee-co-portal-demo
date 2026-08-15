/* global Buffer, process */

import { createClient } from "@supabase/supabase-js";
import { buildOrderPaymentRollup } from "../../src/services/orderPaymentRollup.js";
import { isSuccessfulPaymentRecord, isSuccessfulPaymentStatus } from "../../src/lib/paymentStatus.js";
import {
  processSquareWebhookEvent,
  recordSquareWebhookProcessingFailure,
  verifySquareWebhookSignature,
} from "../../src/services/squareWebhookProcessor.js";
import {
  processTerminalCheckoutWebhook,
  recoverTerminalAttemptForPaymentWebhook,
} from "./lib/squareTerminalCheckout.js";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function normalizeText(value, fallback = "") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function normalizeAmount(value) {
  const amount = typeof value === "number" ? value : Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

function getHeader(headers = {}, name) {
  const normalizedName = name.toLowerCase();
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === normalizedName);
  return match ? match[1] : "";
}

function getRawBody(event = {}) {
  if (event.isBase64Encoded) {
    return Buffer.from(event.body || "", "base64").toString("utf8");
  }
  return event.body || "";
}

function getNotificationUrl(event = {}) {
  const configuredUrl = normalizeText(process.env.SQUARE_WEBHOOK_NOTIFICATION_URL);
  if (configuredUrl) return configuredUrl;

  const host = normalizeText(getHeader(event.headers, "x-forwarded-host") || getHeader(event.headers, "host"));
  const proto = normalizeText(getHeader(event.headers, "x-forwarded-proto"), "https");
  return host && event.path ? `${proto}://${host}${event.path}` : "";
}

function createSupabaseServerClient() {
  const supabaseUrl = normalizeText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const supabaseKey = normalizeText(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  );

  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function syncSupabasePaymentRequestTotals(supabase, paymentRequestId) {
  const normalizedId = normalizeText(paymentRequestId);
  if (!normalizedId) return null;

  const requestResult = await supabase
    .from("payment_requests")
    .select("*")
    .eq("id", normalizedId)
    .maybeSingle();
  if (requestResult.error || !requestResult.data) return null;

  const paymentsResult = await supabase
    .from("payments")
    .select("*")
    .eq("payment_request_id", normalizedId);
  if (paymentsResult.error) return requestResult.data;

  const successfulPayments = (paymentsResult.data || []).filter(isSuccessfulPaymentRecord);
  const amountPaid = successfulPayments.reduce(
    (total, payment) => total + normalizeAmount(payment.amount),
    0
  );
  const amountRequested = normalizeAmount(requestResult.data.amount_requested);
  const status =
    amountRequested > 0 && amountPaid >= amountRequested
      ? "paid"
      : amountPaid > 0
        ? "partially_paid"
        : requestResult.data.status || "open";

  const updateResult = await supabase
    .from("payment_requests")
    .update({
      amount_paid: amountPaid,
      status,
      paid_at: status === "paid" ? requestResult.data.paid_at || new Date().toISOString() : requestResult.data.paid_at || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizedId)
    .select("*")
    .maybeSingle();

  return updateResult.data || requestResult.data;
}

function buildSquareOrderActivityEntry(payment = {}, paymentRequest = {}, createdAt) {
  const amount = normalizeAmount(payment.amount);
  const requestType = normalizeText(paymentRequest.request_type || payment.payment_type, "payment").replace(/_/g, " ");
  return {
    id: `square-payment-${normalizeText(payment.provider_payment_id || payment.id || Date.now())}`,
    type: requestType === "deposit" ? "deposit_received" : "payment",
    note: `Square ${requestType} received for $${amount.toFixed(2)}.`,
    created_at: createdAt,
    source: "square_webhook",
    metadata: {
      payment_id: payment.id,
      provider_payment_id: payment.provider_payment_id,
      payment_request_id: payment.payment_request_id,
      payment_request_number: paymentRequest.request_number,
      provider_receipt_url: payment.provider_receipt_url,
    },
  };
}

export function buildPersistedOrderPaymentRollup(rollup = {}) {
  const persistedColumns = [
    "total_paid",
    "deposit_applied",
    "deposit_outstanding",
    "deposit_paid_amount",
    "balance_due",
    "payment_status",
    "payment_collection_state",
    "quote_status",
    "deposit_workflow_status",
    "deposit_status",
  ];

  return Object.fromEntries(
    persistedColumns
      .filter((column) => Object.hasOwn(rollup, column))
      .map((column) => [column, rollup[column]])
  );
}

export async function syncSupabaseOrderPaymentState(supabase, payment = {}, paymentRequest = null) {
  const orderNumber = normalizeText(payment.order_number || paymentRequest?.order_number);
  if (!orderNumber || !isSuccessfulPaymentStatus(payment.status)) return null;

  const orderResult = await supabase
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (orderResult.error) throw orderResult.error;
  if (!orderResult.data) return null;

  const paymentsResult = await supabase
    .from("payments")
    .select("*")
    .eq("order_number", orderNumber);
  if (paymentsResult.error) throw paymentsResult.error;

  const paymentRequestsResult = await supabase
    .from("payment_requests")
    .select("*")
    .eq("order_number", orderNumber);
  if (paymentRequestsResult.error) throw paymentRequestsResult.error;

  const rollup = buildOrderPaymentRollup({
    order: orderResult.data,
    paymentRequests: paymentRequestsResult.data || [],
    payments: paymentsResult.data || [],
  });
  const persistedRollup = buildPersistedOrderPaymentRollup(rollup);
  const depositReceived =
    normalizeText(payment.payment_type || payment.request_type || paymentRequest?.request_type)
      .toLowerCase() === "deposit" &&
    rollup.deposit_workflow_status === "Deposit Received";
  const operationalPromotion = depositReceived
    ? {
        status: "Ready For Production",
        quote_status: "Ready For Production",
        operational_visible: true,
        production_ready: true,
      }
    : {};
  const capturedAt = normalizeText(payment.captured_at || payment.updated_at || payment.created_at) || new Date().toISOString();
  const existingActivity = Array.isArray(orderResult.data.activity_log) ? orderResult.data.activity_log : [];
  const activityEntry = buildSquareOrderActivityEntry(payment, paymentRequest || {}, capturedAt);
  const hasActivityEntry = existingActivity.some((entry) => entry?.id === activityEntry.id);

  const updateResult = await supabase
    .from("orders")
    .update({
      ...persistedRollup,
      ...operationalPromotion,
      deposit_paid_at:
        rollup.deposit_workflow_status === "Deposit Received"
          ? orderResult.data.deposit_paid_at || capturedAt
          : orderResult.data.deposit_paid_at || null,
      payment_method: "Square Online",
      payment_reference: payment.provider_payment_id || payment.payment_number || payment.id || "",
      activity_log: hasActivityEntry ? existingActivity : [activityEntry, ...existingActivity],
      updated_at: new Date().toISOString(),
    })
    .eq("order_number", orderNumber)
    .select("*")
    .maybeSingle();

  if (updateResult.error) throw updateResult.error;

  await supabase
    .from("activity_logs")
    .insert({
      entity_type: "order",
      entity_id: updateResult.data?.id || orderResult.data.id || null,
      entity_reference: orderNumber,
      activity_type: activityEntry.type,
      operational_status: updateResult.data?.status || orderResult.data.status || "",
      note: activityEntry.note,
      metadata: activityEntry.metadata,
      created_at: capturedAt,
    })
    .catch(() => null);

  return updateResult.data;
}

function buildSupabaseAdapter(supabase) {
  return {
    async listPaymentRequests() {
      const result = await supabase.from("payment_requests").select("*");
      if (result.error) throw result.error;
      return result.data || [];
    },

    async listPaymentEvents() {
      const result = await supabase.from("payment_events").select("*");
      if (result.error) throw result.error;
      return result.data || [];
    },

    async listPayments() {
      const result = await supabase.from("payments").select("*");
      if (result.error) throw result.error;
      return result.data || [];
    },

    async updatePaymentRequest(identifier, updates = {}) {
      const result = await supabase
        .from("payment_requests")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", identifier)
        .select("*")
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },

    async recordPayment(input = {}) {
      if (input.idempotency_key) {
        const existing = await supabase
          .from("payments")
          .select("*")
          .eq("idempotency_key", input.idempotency_key)
          .maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) {
          const paymentRequest = await syncSupabasePaymentRequestTotals(supabase, existing.data.payment_request_id);
          await syncSupabaseOrderPaymentState(supabase, existing.data, paymentRequest);
          return existing.data;
        }
      }

      const result = await supabase.from("payments").insert(input).select("*").single();
      if (result.error) {
        const isUniqueConflict = result.error.code === "23505";
        if (!isUniqueConflict) throw result.error;

        const existing = await supabase
          .from("payments")
          .select("*")
          .eq("idempotency_key", input.idempotency_key)
          .maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) {
          const paymentRequest = await syncSupabasePaymentRequestTotals(supabase, existing.data.payment_request_id);
          await syncSupabaseOrderPaymentState(supabase, existing.data, paymentRequest);
          return existing.data;
        }
        throw result.error;
      }
      const paymentRequest = await syncSupabasePaymentRequestTotals(supabase, input.payment_request_id);
      await syncSupabaseOrderPaymentState(supabase, result.data, paymentRequest);
      return result.data;
    },

    async updatePayment(identifier, updates = {}) {
      const result = await supabase
        .from("payments")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", identifier)
        .select("*")
        .maybeSingle();
      if (result.error) throw result.error;
      if (result.data?.payment_request_id) {
        const paymentRequest = await syncSupabasePaymentRequestTotals(supabase, result.data.payment_request_id);
        await syncSupabaseOrderPaymentState(supabase, result.data, paymentRequest);
      }
      return result.data;
    },

    async recordPaymentEvent(input = {}) {
      const squareEventId = normalizeText(input.payload?.square_event_id);
      if (squareEventId) {
        const existing = await supabase
          .from("payment_events")
          .select("*")
          .eq("payload->>square_event_id", squareEventId)
          .maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) return existing.data;
      }

      const result = await supabase.from("payment_events").insert(input).select("*").single();
      if (result.error) {
        const isUniqueConflict = result.error.code === "23505";
        if (!isUniqueConflict || !squareEventId) throw result.error;

        const existing = await supabase
          .from("payment_events")
          .select("*")
          .eq("payload->>square_event_id", squareEventId)
          .maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) return existing.data;
        throw result.error;
      }
      return result.data;
    },
  };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const signatureKey = normalizeText(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY);
  if (!signatureKey) {
    return json(501, {
      error: "Square webhook signature verification is not configured.",
      message: "Set SQUARE_WEBHOOK_SIGNATURE_KEY before enabling Square webhooks.",
    });
  }

  const rawBody = getRawBody(event);
  const signature = normalizeText(getHeader(event.headers, "x-square-hmacsha256-signature"));
  const notificationUrl = getNotificationUrl(event);
  const isValidSignature = await verifySquareWebhookSignature({
    signatureKey,
    notificationUrl,
    body: rawBody,
    signature,
  });

  if (!isValidSignature) {
    return json(401, { error: "Invalid Square webhook signature." });
  }

  let webhookEvent;
  try {
    webhookEvent = JSON.parse(rawBody || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return json(501, {
      error: "Webhook persistence is not configured.",
      message: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for Square webhook processing.",
    });
  }

  const adapter = buildSupabaseAdapter(supabase);

  try {
    if (String(webhookEvent.type || "").startsWith("terminal.checkout.")) {
      const result = await processTerminalCheckoutWebhook(supabase, webhookEvent);
      return json(200, result);
    }

    if (String(webhookEvent.type || "").startsWith("payment.")) {
      const terminalAttempt = await recoverTerminalAttemptForPaymentWebhook(supabase, webhookEvent);
      if (terminalAttempt) return json(200, { processed: true, terminal: true, attempt: terminalAttempt });
    }
    const result = await processSquareWebhookEvent(webhookEvent, {
      adapter,
      triggerNotifications: false,
    });

    return json(200, result);
  } catch (error) {
    await recordSquareWebhookProcessingFailure(webhookEvent, error, { adapter }).catch(() => null);
    return json(500, {
      error: "Square webhook processing failed.",
      message: error instanceof Error ? error.message : "Unknown webhook processing error.",
      retryable: true,
    });
  }
}
