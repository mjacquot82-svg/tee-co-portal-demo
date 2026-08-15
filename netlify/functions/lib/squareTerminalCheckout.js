/* global process */

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { buildOrderPaymentRollup } from "../../../src/services/orderPaymentRollup.js";

export const TERMINAL_ATTEMPTS_TABLE = "square_terminal_checkout_attempts";
export const TERMINAL_REGISTRATIONS_TABLE = "square_terminal_device_registrations";
export const TERMINAL_DEADLINE_DURATION = "PT5M";
export const TERMINAL_SQUARE_VERSION = "2026-07-15";
export const TERMINAL_ACTIVE_STATUSES = [
  "creating", "create_unknown", "pending", "in_progress", "cancel_requested", "completed_unverified",
];
export const TERMINAL_FINAL_STATUSES = ["completed", "failed", "canceled", "timed_out", "reconciliation_required"];
export const TERMINAL_PILOT_CREATE_CANCEL_ROLES = ["owner"];

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

function cents(value) {
  return Math.round(normalizeAmount(value) * 100);
}

export function isTerminalCheckoutEnabled() {
  return normalizeText(process.env.SQUARE_TERMINAL_CHECKOUT_ENABLED).toLowerCase() === "true";
}

export function squareApiBaseUrl() {
  return normalizeText(process.env.SQUARE_ENVIRONMENT, "production").toLowerCase() === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

export function createSupabaseAdminClient() {
  const url = normalizeText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const key = normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function header(headers = {}, name) {
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match?.[1] || "";
}

export async function authorizeOperationalRequest(event, supabase, { ownerOnly = false } = {}) {
  const match = normalizeText(header(event.headers, "authorization")).match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return { ok: false, statusCode: 401, message: "Authentication is required." };
  const result = await supabase.auth.getUser(match[1]);
  const user = result.data?.user;
  if (result.error || !user) return { ok: false, statusCode: 401, message: "The authentication session is invalid or expired." };
  const role = normalizeText(user.app_metadata?.operational_role || user.app_metadata?.role).toLowerCase();
  const operationalRole = ["owner", "manager", "staff"].includes(role);
  if (!operationalRole || (ownerOnly && role !== "owner")) {
    return { ok: false, statusCode: 403, message: ownerOnly ? "Owner access is required." : "Operational staff access is required." };
  }
  return { ok: true, user, role };
}

export function isTerminalPilotOperationAllowed(role, operation) {
  if (!["create", "cancel"].includes(normalizeText(operation).toLowerCase())) return true;
  return TERMINAL_PILOT_CREATE_CANCEL_ROLES.includes(normalizeText(role).toLowerCase());
}

export async function squareRequest(path, options = {}, dependencies = {}) {
  const accessToken = normalizeText(process.env.SQUARE_ACCESS_TOKEN);
  if (!accessToken) throw Object.assign(new Error("Square Terminal is not configured."), { statusCode: 501 });
  const response = await (dependencies.fetcher || fetch)(`${squareApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": normalizeText(process.env.SQUARE_TERMINAL_API_VERSION, TERMINAL_SQUARE_VERSION),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.errors?.[0]?.detail || data?.errors?.[0]?.code || "Square rejected the Terminal request.");
    error.statusCode = response.status;
    error.squareCode = data?.errors?.[0]?.code || "SQUARE_ERROR";
    throw error;
  }
  return data;
}

function publicAttempt(attempt = {}) {
  return {
    id: attempt.id,
    paymentRequestId: attempt.payment_request_id,
    orderNumber: attempt.order_number,
    amount: normalizeAmount(attempt.amount),
    currency: attempt.currency,
    status: attempt.status,
    providerStatus: attempt.provider_status,
    checkoutId: attempt.square_checkout_id || "",
    paymentId: attempt.verified_payment_id || "",
    cancelReason: attempt.cancel_reason || "",
    failureCode: attempt.failure_code || "",
    failureMessage: attempt.failure_message || "",
    deadlineAt: attempt.deadline_at,
    createdAt: attempt.created_at,
    updatedAt: attempt.updated_at,
  };
}

export function mapTerminalCheckoutStatus(status, cancelReason = "") {
  const value = normalizeText(status).toUpperCase();
  if (["CANCELED", "CANCELLED"].includes(value) && normalizeText(cancelReason).toUpperCase() === "TIMED_OUT") {
    return "timed_out";
  }
  return ({
    PENDING: "pending", IN_PROGRESS: "in_progress", CANCEL_REQUESTED: "cancel_requested",
    CANCELED: "canceled", CANCELLED: "canceled", FAILED: "failed", TIMED_OUT: "timed_out",
    COMPLETED: "completed_unverified",
  })[value] || "reconciliation_required";
}

export function buildTerminalCheckoutPayload({ attemptId, amount, currency, referenceId, orderNumber, deviceId }) {
  return {
    idempotency_key: `terminal:${attemptId}`,
    checkout: {
      amount_money: { amount: cents(amount), currency: normalizeText(currency, "CAD").toUpperCase() },
      reference_id: referenceId,
      note: `Tee & Co ${orderNumber}`.slice(0, 500),
      deadline_duration: TERMINAL_DEADLINE_DURATION,
      payment_options: { autocomplete: true },
      device_options: {
        device_id: deviceId,
        skip_receipt_screen: false,
        tip_settings: { allow_tipping: false },
      },
    },
  };
}

export function getTerminalPaymentVerificationMismatches(payment, attempt, expectedPaymentId) {
  const mismatches = [];
  const collectedMoney = payment?.total_money || payment?.amount_money;
  if (!payment || payment.id !== expectedPaymentId) mismatches.push("payment_id");
  if (normalizeText(payment?.status).toUpperCase() !== "COMPLETED") mismatches.push("status");
  if (normalizeText(payment?.location_id) !== attempt.square_location_id) mismatches.push("location");
  if (Number(collectedMoney?.amount || 0) !== cents(attempt.amount)) mismatches.push("amount");
  if (normalizeText(collectedMoney?.currency).toUpperCase() !== normalizeText(attempt.currency).toUpperCase()) mismatches.push("currency");
  if (Number(payment?.tip_money?.amount || 0) !== 0) mismatches.push("tip");
  if (normalizeText(payment?.reference_id) !== attempt.square_reference_id) mismatches.push("reference");
  return mismatches;
}

async function getActiveDevice(supabase) {
  const locationId = normalizeText(process.env.SQUARE_LOCATION_ID);
  const result = await supabase.from(TERMINAL_REGISTRATIONS_TABLE).select("*")
    .eq("square_location_id", locationId).eq("status", "PAIRED").eq("is_active", true)
    .is("disabled_at", null).limit(2);
  if (result.error) throw result.error;
  if ((result.data || []).length !== 1 || !result.data[0].square_device_id) {
    throw Object.assign(new Error("No single active paired Square Terminal is available."), { statusCode: 409, code: "TERMINAL_UNAVAILABLE" });
  }
  return result.data[0];
}

async function getPaymentTarget(supabase, input = {}) {
  const paymentRequestId = normalizeText(input.paymentRequestId);
  const orderNumber = normalizeText(input.orderNumber);
  let request = null;
  if (paymentRequestId) {
    const result = await supabase.from("payment_requests").select("*").eq("id", paymentRequestId).maybeSingle();
    if (result.error) throw result.error;
    request = result.data;
  }
  let order = null;
  const targetOrderNumber = normalizeText(request?.order_number || orderNumber);
  if (!targetOrderNumber) throw Object.assign(new Error("An existing order payment target is required."), { statusCode: 400 });
  const orderResult = await supabase.from("orders").select("*").eq("order_number", targetOrderNumber).maybeSingle();
  if (orderResult.error) throw orderResult.error;
  order = orderResult.data;
  if (!order) throw Object.assign(new Error("Order not found."), { statusCode: 404 });

  const paymentsResult = await supabase.from("payments").select("amount,status").eq("order_number", targetOrderNumber);
  if (paymentsResult.error) throw paymentsResult.error;
  const successful = new Set(["approved", "captured", "completed", "paid", "settled", "succeeded", "success"]);
  const paid = (paymentsResult.data || []).filter((p) => successful.has(normalizeText(p.status).toLowerCase()))
    .reduce((sum, p) => sum + normalizeAmount(p.amount), 0);
  const total = normalizeAmount(order.total_amount || order.total || order.grand_total || order.balance_due);
  const orderRemaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  if (orderRemaining <= 0) throw Object.assign(new Error("This order has no remaining payable balance."), { statusCode: 409 });

  if (!request) {
    const requestsResult = await supabase.from("payment_requests").select("*").eq("order_number", targetOrderNumber)
      .in("status", ["open", "sent", "processing", "partially_paid"]).order("created_at", { ascending: false }).limit(1);
    if (requestsResult.error) throw requestsResult.error;
    request = requestsResult.data?.[0] || null;
  }
  if (!request) {
    const created = await supabase.from("payment_requests").insert({
      request_number: `PR-T-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
      customer_id: order.customer_id || null,
      order_id: order.id || null,
      order_number: targetOrderNumber,
      request_type: paid > 0 ? "balance" : "full_payment",
      status: "open", amount_requested: orderRemaining, amount_paid: 0, currency: "CAD",
      description: `Front Counter Terminal payment for ${targetOrderNumber}`,
      payment_provider: "square", metadata: { source: "square_terminal_front_counter" },
      created_by_staff_user_id: null,
    }).select("*").single();
    if (created.error) throw created.error;
    request = created.data;
  }
  if (request.order_number !== targetOrderNumber) throw Object.assign(new Error("Payment request does not belong to the selected order."), { statusCode: 409 });
  const requestRemaining = Math.max(0, normalizeAmount(request.amount_requested) - normalizeAmount(request.amount_paid));
  const amount = Math.min(orderRemaining, requestRemaining);
  if (amount <= 0) throw Object.assign(new Error("This payment request has no remaining payable balance."), { statusCode: 409 });
  return { order, request, amount, currency: normalizeText(request.currency, "CAD").toUpperCase() };
}

async function findActiveAttempt(supabase, paymentRequestId, orderNumber = "") {
  let query = supabase.from(TERMINAL_ATTEMPTS_TABLE).select("*");
  query = paymentRequestId ? query.eq("payment_request_id", paymentRequestId) : query.eq("order_number", orderNumber);
  const result = await query
    .in("status", TERMINAL_ACTIVE_STATUSES).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function updateAttemptFromCheckout(supabase, attempt, checkout, event = {}) {
  if (!checkout?.id || (attempt.square_checkout_id && attempt.square_checkout_id !== checkout.id)) {
    throw new Error("Square checkout correlation failed.");
  }
  if (TERMINAL_FINAL_STATUSES.includes(attempt.status)) return attempt;
  if (attempt.status === "completed_unverified" && normalizeText(checkout.status).toUpperCase() !== "COMPLETED") return attempt;
  const nextStatus = mapTerminalCheckoutStatus(checkout.status, checkout.cancel_reason);
  const now = new Date().toISOString();
  const updates = {
    square_checkout_id: checkout.id, provider_status: normalizeText(checkout.status), status: nextStatus,
    square_payment_ids: Array.isArray(checkout.payment_ids) ? checkout.payment_ids : [],
    cancel_reason: normalizeText(checkout.cancel_reason), last_square_event_id: normalizeText(event.event_id || event.id) || attempt.last_square_event_id,
    last_square_event_at: normalizeText(event.created_at) || attempt.last_square_event_at,
    provider_snapshot: { checkout: { id: checkout.id, status: checkout.status, payment_ids: checkout.payment_ids || [], updated_at: checkout.updated_at } },
    version: Number(attempt.version || 1) + 1,
    ...(nextStatus === "canceled" ? { canceled_at: checkout.updated_at || now } : {}),
    ...(nextStatus === "failed" ? { failed_at: checkout.updated_at || now } : {}),
    ...(nextStatus === "timed_out" ? { timed_out_at: checkout.updated_at || now } : {}),
  };
  const result = await supabase.from(TERMINAL_ATTEMPTS_TABLE).update(updates).eq("id", attempt.id).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

async function syncTerminalOrder(supabase, attempt, paymentId, capturedAt) {
  if (!attempt.order_number) return;
  const [orderResult, paymentsResult, requestsResult] = await Promise.all([
    supabase.from("orders").select("*").eq("order_number", attempt.order_number).maybeSingle(),
    supabase.from("payments").select("*").eq("order_number", attempt.order_number),
    supabase.from("payment_requests").select("*").eq("order_number", attempt.order_number),
  ]);
  if (orderResult.error || paymentsResult.error || requestsResult.error || !orderResult.data) return;
  const rollup = buildOrderPaymentRollup({ order: orderResult.data, payments: paymentsResult.data || [], paymentRequests: requestsResult.data || [] });
  const activityId = `square-terminal-payment-${paymentId}`;
  const currentActivity = Array.isArray(orderResult.data.activity_log) ? orderResult.data.activity_log : [];
  const entry = { id: activityId, type: "payment", note: `Square Terminal payment received for $${normalizeAmount(attempt.amount).toFixed(2)}.`, created_at: capturedAt, source: "square_terminal", metadata: { terminal_attempt_id: attempt.id, provider_payment_id: paymentId } };
  const activity = currentActivity.some((item) => item?.id === activityId) ? currentActivity : [entry, ...currentActivity];
  const result = await supabase.from("orders").update({ ...rollup, payment_method: "Square Terminal", payment_reference: paymentId, activity_log: activity, updated_at: new Date().toISOString() }).eq("order_number", attempt.order_number);
  if (result.error) throw result.error;
  await supabase.from("activity_logs").upsert({ entity_type: "order", entity_id: orderResult.data.id || null, entity_reference: attempt.order_number, activity_type: "payment", operational_status: orderResult.data.status || "", note: entry.note, metadata: entry.metadata, created_at: capturedAt, idempotency_key: activityId }, { onConflict: "idempotency_key", ignoreDuplicates: true });
}

export async function verifyAndFinalizeAttempt(supabase, attempt, checkout, dependencies = {}) {
  const paymentIds = Array.isArray(checkout.payment_ids) ? checkout.payment_ids.filter(Boolean) : [];
  if (normalizeText(checkout.status).toUpperCase() !== "COMPLETED" || paymentIds.length !== 1) {
    if (normalizeText(checkout.status).toUpperCase() === "COMPLETED") {
      await supabase.from(TERMINAL_ATTEMPTS_TABLE).update({ status: "reconciliation_required", failure_code: "PAYMENT_COUNT_MISMATCH", failure_message: "Completed checkout did not contain exactly one payment." }).eq("id", attempt.id);
    }
    return attempt;
  }
  const response = await squareRequest(`/v2/payments/${encodeURIComponent(paymentIds[0])}`, { method: "GET" }, dependencies);
  const payment = response.payment;
  const mismatches = getTerminalPaymentVerificationMismatches(payment, attempt, paymentIds[0]);
  if (mismatches.length) {
    const result = await supabase.from(TERMINAL_ATTEMPTS_TABLE).update({ status: "reconciliation_required", failure_code: "PAYMENT_VERIFICATION_FAILED", failure_message: `Square payment verification failed: ${mismatches.join(", ")}.`, verified_payment_id: paymentIds[0] }).eq("id", attempt.id).select("*").single();
    if (result.error) throw result.error;
    return result.data;
  }
  const capturedAt = payment.updated_at || payment.created_at || new Date().toISOString();
  const finalized = await supabase.rpc("finalize_square_terminal_payment", {
    p_attempt_id: attempt.id, p_square_payment_id: payment.id,
    p_amount: Number(payment.amount_money.amount) / 100, p_currency: payment.amount_money.currency,
    p_provider_order_id: payment.order_id || "", p_receipt_url: payment.receipt_url || "",
    p_captured_at: capturedAt, p_provider_snapshot: { payment: { id: payment.id, status: payment.status, amount_money: payment.amount_money, location_id: payment.location_id, order_id: payment.order_id, receipt_url: payment.receipt_url } },
  });
  if (finalized.error) throw finalized.error;
  await syncTerminalOrder(supabase, attempt, payment.id, capturedAt);
  const refreshed = await supabase.from(TERMINAL_ATTEMPTS_TABLE).select("*").eq("id", attempt.id).single();
  if (refreshed.error) throw refreshed.error;
  return refreshed.data;
}

export async function recoverAttempt(supabase, attempt, dependencies = {}) {
  if (!attempt.square_checkout_id) return attempt;
  const response = await squareRequest(`/v2/terminals/checkouts/${encodeURIComponent(attempt.square_checkout_id)}`, { method: "GET" }, dependencies);
  const updated = await updateAttemptFromCheckout(supabase, attempt, response.checkout);
  return updated.status === "completed_unverified" ? verifyAndFinalizeAttempt(supabase, updated, response.checkout, dependencies) : updated;
}

export async function createTerminalAttempt(supabase, input, user, dependencies = {}) {
  if (!isTerminalCheckoutEnabled()) throw Object.assign(new Error("Square Terminal checkout is disabled."), { statusCode: 503, code: "TERMINAL_DISABLED" });
  const target = await getPaymentTarget(supabase, input);
  const existing = await findActiveAttempt(supabase, target.request.id) || await findActiveAttempt(supabase, "", target.order.order_number);
  if (existing) return publicAttempt(await recoverAttempt(supabase, existing, dependencies));
  const device = await getActiveDevice(supabase);
  const id = randomUUID();
  const reference = `tc_${id.replace(/-/g, "").slice(0, 32)}`;
  const idempotencyKey = `terminal:${id}`;
  const now = new Date();
  const inserted = await supabase.from(TERMINAL_ATTEMPTS_TABLE).insert({
    id, payment_request_id: target.request.id, order_id: target.order.id || null,
    order_number: target.order.order_number, customer_id: target.order.customer_id || null,
    device_registration_id: device.id, square_device_id: device.square_device_id,
    square_location_id: device.square_location_id, square_reference_id: reference,
    create_idempotency_key: idempotencyKey, amount: target.amount, currency: target.currency,
    status: "creating", deadline_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString(), created_by_user_id: user.id,
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const winner = await findActiveAttempt(supabase, target.request.id) || await findActiveAttempt(supabase, "", target.order.order_number);
      if (winner) return publicAttempt(winner);
    }
    throw inserted.error;
  }
  try {
    const response = await squareRequest("/v2/terminals/checkouts", { method: "POST", body: JSON.stringify(buildTerminalCheckoutPayload({
      attemptId: id, amount: target.amount, currency: target.currency, referenceId: reference,
      orderNumber: target.order.order_number, deviceId: device.square_device_id,
    })) }, dependencies);
    const updated = await updateAttemptFromCheckout(supabase, inserted.data, response.checkout);
    await supabase.from(TERMINAL_ATTEMPTS_TABLE).update({ sent_at: response.checkout.created_at || new Date().toISOString() }).eq("id", updated.id);
    return publicAttempt(updated);
  } catch (error) {
    await supabase.from(TERMINAL_ATTEMPTS_TABLE).update({ status: error.statusCode ? "failed" : "create_unknown", failure_code: error.squareCode || "CREATE_UNKNOWN", failure_message: error instanceof Error ? error.message : "Terminal checkout creation failed.", failed_at: error.statusCode ? new Date().toISOString() : null }).eq("id", id);
    throw error;
  }
}

export async function getTerminalAttempt(supabase, attemptId, dependencies = {}) {
  const result = await supabase.from(TERMINAL_ATTEMPTS_TABLE).select("*").eq("id", attemptId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw Object.assign(new Error("Terminal checkout attempt not found."), { statusCode: 404 });
  const attempt = TERMINAL_ACTIVE_STATUSES.includes(result.data.status) && result.data.square_checkout_id
    ? await recoverAttempt(supabase, result.data, dependencies) : result.data;
  return publicAttempt(attempt);
}

export async function cancelTerminalAttempt(supabase, attemptId, dependencies = {}) {
  const result = await supabase.from(TERMINAL_ATTEMPTS_TABLE).select("*").eq("id", attemptId).maybeSingle();
  if (result.error) throw result.error;
  const attempt = result.data;
  if (!attempt) throw Object.assign(new Error("Terminal checkout attempt not found."), { statusCode: 404 });
  if (!attempt.square_checkout_id || !["pending", "in_progress", "cancel_requested"].includes(attempt.status)) return publicAttempt(attempt);
  const response = await squareRequest(`/v2/terminals/checkouts/${encodeURIComponent(attempt.square_checkout_id)}/cancel`, { method: "POST", body: "{}" }, dependencies);
  return publicAttempt(await updateAttemptFromCheckout(supabase, attempt, response.checkout));
}

export async function processTerminalCheckoutWebhook(supabase, event, dependencies = {}) {
  const checkout = event.data?.object?.checkout;
  if (!checkout?.id) return { processed: false, ignored: true, reason: "missing_checkout" };
  const result = await supabase.from(TERMINAL_ATTEMPTS_TABLE).select("*").eq("square_checkout_id", checkout.id).maybeSingle();
  if (result.error) throw result.error;
  let attempt = result.data;
  if (!attempt && checkout.reference_id) {
    const correlated = await supabase.from(TERMINAL_ATTEMPTS_TABLE).select("*").eq("square_reference_id", checkout.reference_id).maybeSingle();
    if (correlated.error) throw correlated.error;
    attempt = correlated.data;
  }
  if (!attempt) return { processed: false, ignored: true, reason: "unknown_checkout" };
  if (attempt.last_square_event_id === event.event_id) return { processed: false, duplicate: true };
  const updated = await updateAttemptFromCheckout(supabase, attempt, checkout, event);
  const finalized = updated.status === "completed_unverified" ? await verifyAndFinalizeAttempt(supabase, updated, checkout, dependencies) : updated;
  return { processed: true, duplicate: false, attempt: publicAttempt(finalized) };
}

export async function recoverTerminalAttemptForPaymentWebhook(supabase, event, dependencies = {}) {
  const payment = event.data?.object?.payment;
  if (!payment?.id) return null;
  let result = await supabase.from(TERMINAL_ATTEMPTS_TABLE).select("*").contains("square_payment_ids", [payment.id]).limit(1).maybeSingle();
  if (["42P01", "PGRST205"].includes(result.error?.code)) return null;
  if (result.error) throw result.error;
  if (!result.data && payment.reference_id) {
    result = await supabase.from(TERMINAL_ATTEMPTS_TABLE).select("*").eq("square_reference_id", payment.reference_id).limit(1).maybeSingle();
    if (result.error) throw result.error;
  }
  if (!result.data) return null;
  const attempt = result.data.square_checkout_id ? await recoverAttempt(supabase, result.data, dependencies) : result.data;
  return publicAttempt(attempt);
}
