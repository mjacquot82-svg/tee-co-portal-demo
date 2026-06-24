import { getJsonStorageItem, hasBrowserStorage, setJsonStorageItem } from "./browserStorage";
import { normalizeCustomerId } from "./customerIds";
import { triggerNotificationEvent } from "./notificationDeliveryService";
import { NOTIFICATION_TYPES } from "./notificationTemplatesStore";

const PAYMENT_REQUESTS_STORAGE_KEY = "teeCoPaymentRequests";
const PAYMENTS_STORAGE_KEY = "teeCoPayments";
const PAYMENT_EVENTS_STORAGE_KEY = "teeCoPaymentEvents";

const memoryStore = {
  paymentRequests: [],
  payments: [],
  paymentEvents: [],
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value, fallback = "") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function normalizeAmount(value) {
  const amount = typeof value === "number" ? value : Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function numberSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

function getStoredList(storageKey, memoryKey) {
  if (!hasBrowserStorage()) return memoryStore[memoryKey];
  return getJsonStorageItem(storageKey, []);
}

function saveStoredList(storageKey, memoryKey, records) {
  const safeRecords = Array.isArray(records) ? records : [];
  if (!hasBrowserStorage()) {
    memoryStore[memoryKey] = safeRecords;
    return;
  }
  setJsonStorageItem(storageKey, safeRecords);
}

function normalizePaymentMethod(method) {
  const normalized = normalizeText(method, "manual_other").toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (normalized === "e_transfer") return "e_transfer";
  if (normalized === "square_terminal") return "square_terminal";
  if (normalized === "credit") return "credit";
  if (normalized === "debit") return "debit";
  if (normalized === "cash") return "cash";
  if (normalized === "cheque" || normalized === "check") return "cheque";
  return normalized || "manual_other";
}

function normalizePaymentRequest(input = {}) {
  const timestamp = input.created_at || nowIso();
  const amountRequested = normalizeAmount(input.amount_requested ?? input.amount);
  const amountPaid = normalizeAmount(input.amount_paid);

  return {
    id: input.id || generateId("payment-request"),
    request_number: input.request_number || `PR-${numberSuffix()}`,
    customer_id: normalizeCustomerId(input.customer_id),
    order_id: input.order_id || "",
    order_number: normalizeText(input.order_number),
    quote_id: input.quote_id || "",
    sale_id: input.sale_id || "",
    request_type: normalizeText(input.request_type, "deposit"),
    status: normalizeText(input.status, "draft"),
    amount_requested: amountRequested,
    amount_paid: amountPaid,
    currency: normalizeText(input.currency, "CAD").toUpperCase(),
    due_at: input.due_at || null,
    expires_at: input.expires_at || null,
    description: normalizeText(input.description),
    customer_message: normalizeText(input.customer_message),
    payment_provider: normalizeText(input.payment_provider, "manual"),
    provider_checkout_url: normalizeText(input.provider_checkout_url),
    provider_order_id: normalizeText(input.provider_order_id),
    provider_payment_link_id: normalizeText(input.provider_payment_link_id),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    created_by_staff_user_id: input.created_by_staff_user_id || "",
    sent_at: input.sent_at || null,
    paid_at: input.paid_at || null,
    canceled_at: input.canceled_at || null,
    created_at: timestamp,
    updated_at: input.updated_at || timestamp,
  };
}

function normalizePayment(input = {}) {
  const timestamp = input.created_at || input.captured_at || nowIso();
  const amount = normalizeAmount(input.amount);

  return {
    id: input.id || generateId("payment"),
    payment_number: input.payment_number || `PAY-${numberSuffix()}`,
    customer_id: normalizeCustomerId(input.customer_id),
    order_id: input.order_id || "",
    order_number: normalizeText(input.order_number),
    payment_request_id: input.payment_request_id || "",
    sale_id: input.sale_id || "",
    payment_type: normalizeText(input.payment_type, "partial"),
    status: normalizeText(input.status, "captured"),
    amount,
    currency: normalizeText(input.currency, "CAD").toUpperCase(),
    method: normalizePaymentMethod(input.method),
    provider: normalizeText(input.provider, "manual"),
    provider_payment_id: normalizeText(input.provider_payment_id),
    provider_order_id: normalizeText(input.provider_order_id),
    provider_location_id: normalizeText(input.provider_location_id),
    provider_receipt_url: normalizeText(input.provider_receipt_url),
    provider_status: normalizeText(input.provider_status),
    idempotency_key: normalizeText(input.idempotency_key),
    recorded_by_staff_user_id: input.recorded_by_staff_user_id || "",
    customer_confirmed_at: input.customer_confirmed_at || null,
    captured_at: input.captured_at || timestamp,
    settled_at: input.settled_at || null,
    note: normalizeText(input.note),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    created_at: timestamp,
    updated_at: input.updated_at || timestamp,
  };
}

function normalizePaymentEvent(input = {}) {
  return {
    id: input.id || generateId("payment-event"),
    payment_id: input.payment_id || "",
    payment_request_id: input.payment_request_id || "",
    order_id: input.order_id || "",
    order_number: normalizeText(input.order_number),
    event_type: normalizeText(input.event_type, "payment_event"),
    event_source: normalizeText(input.event_source, "system"),
    summary: normalizeText(input.summary),
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    staff_user_id: input.staff_user_id || "",
    created_at: input.created_at || nowIso(),
  };
}

function compareCreatedAtDesc(left, right) {
  return new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime();
}

function normalizeIdentifier(value) {
  return normalizeText(value).toLowerCase();
}

function isSuccessfulPaymentStatus(status) {
  const normalized = normalizeText(status).toLowerCase();
  if (!normalized) return true;
  if (["failed", "declined", "voided", "canceled", "cancelled"].includes(normalized)) return false;
  return ["captured", "paid", "succeeded", "success", "settled", "completed"].includes(normalized);
}

export function resolvePaymentRequestStatus(paymentRequest = {}, requestPayments = []) {
  const amountRequested = normalizeAmount(paymentRequest.amount_requested);
  const amountPaid = requestPayments
    .filter((payment) => payment.status !== "failed" && payment.status !== "voided")
    .reduce((total, payment) => total + normalizeAmount(payment.amount), 0);

  if (amountRequested > 0 && amountPaid >= amountRequested) return "paid";
  if (amountPaid > 0) return "partially_paid";
  return paymentRequest.status || "open";
}

function hydratePaymentRequest(paymentRequest = {}) {
  const requestPayments = getStoredPayments().filter(
    (payment) => payment.payment_request_id === paymentRequest.id
  );
  const amountPaid = requestPayments
    .filter((payment) => payment.status !== "failed" && payment.status !== "voided")
    .reduce((total, payment) => total + normalizeAmount(payment.amount), 0);

  return {
    ...paymentRequest,
    amount_paid: amountPaid,
    status: resolvePaymentRequestStatus(paymentRequest, requestPayments),
  };
}

export function getStoredPaymentRequests() {
  return getStoredList(PAYMENT_REQUESTS_STORAGE_KEY, "paymentRequests");
}

export function getStoredPayments() {
  return getStoredList(PAYMENTS_STORAGE_KEY, "payments");
}

export function getStoredPaymentEvents() {
  return getStoredList(PAYMENT_EVENTS_STORAGE_KEY, "paymentEvents");
}

export function listPaymentRequests() {
  return getStoredPaymentRequests().map(hydratePaymentRequest).sort(compareCreatedAtDesc);
}

export function listPayments() {
  return [...getStoredPayments()].sort(compareCreatedAtDesc);
}

export function listPaymentEvents() {
  return [...getStoredPaymentEvents()].sort(compareCreatedAtDesc);
}

export function saveStoredPaymentRequests(paymentRequests) {
  saveStoredList(PAYMENT_REQUESTS_STORAGE_KEY, "paymentRequests", paymentRequests);
}

export function saveStoredPayments(payments) {
  saveStoredList(PAYMENTS_STORAGE_KEY, "payments", payments);
}

export function saveStoredPaymentEvents(paymentEvents) {
  saveStoredList(PAYMENT_EVENTS_STORAGE_KEY, "paymentEvents", paymentEvents);
}

export function createPaymentRequest(input = {}) {
  const paymentRequest = normalizePaymentRequest(input);
  const current = getStoredPaymentRequests();
  const existing = paymentRequest.metadata?.legacyPaymentId
    ? current.find(
        (request) =>
          request.order_number === paymentRequest.order_number &&
          request.metadata?.legacyPaymentId === paymentRequest.metadata.legacyPaymentId
      )
    : null;

  if (existing) return existing;

  saveStoredPaymentRequests([paymentRequest, ...current]);
  recordPaymentEvent({
    payment_request_id: paymentRequest.id,
    order_number: paymentRequest.order_number,
    event_type: "payment_request_created",
    event_source: "system",
    summary: `Payment request ${paymentRequest.request_number} created.`,
    payload: { paymentRequest },
    created_at: paymentRequest.created_at,
  });

  if (paymentRequest.metadata?.source !== "legacy_order_payment_history") {
    triggerNotificationEvent(NOTIFICATION_TYPES.paymentRequestCreated, {
      paymentRequest,
      source: "payments_store",
      customerName: paymentRequest.metadata?.customer_name || "",
      orderNumber: paymentRequest.order_number,
      depositAmount: paymentRequest.amount_requested,
      paymentLink: paymentRequest.provider_checkout_url,
    });

    if (String(paymentRequest.request_type || "").trim().toLowerCase() === "deposit") {
      triggerNotificationEvent(NOTIFICATION_TYPES.depositRequested, {
        paymentRequest,
        source: "payments_store",
        customerName: paymentRequest.metadata?.customer_name || "",
        orderNumber: paymentRequest.order_number,
        depositAmount: paymentRequest.amount_requested,
        paymentLink: paymentRequest.provider_checkout_url,
      });
    }
  }

  return paymentRequest;
}

export function getPaymentRequestById(identifier) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  if (!normalizedIdentifier) return null;

  const paymentRequest = getStoredPaymentRequests().find(
    (request) =>
      normalizeIdentifier(request.id) === normalizedIdentifier ||
      normalizeIdentifier(request.request_number) === normalizedIdentifier
  );

  return paymentRequest ? hydratePaymentRequest(paymentRequest) : null;
}

export function updatePaymentRequest(identifier, updates = {}) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  if (!normalizedIdentifier) return null;

  let updatedRequest = null;
  const nextRequests = getStoredPaymentRequests().map((request) => {
    const isMatch =
      normalizeIdentifier(request.id) === normalizedIdentifier ||
      normalizeIdentifier(request.request_number) === normalizedIdentifier;
    if (!isMatch) return request;

    updatedRequest = hydratePaymentRequest({
      ...request,
      ...updates,
      amount_requested: updates.amount_requested ?? updates.amount ?? request.amount_requested,
      updated_at: updates.updated_at || nowIso(),
    });
    return updatedRequest;
  });

  if (!updatedRequest) return null;

  saveStoredPaymentRequests(nextRequests);
  recordPaymentEvent({
    payment_request_id: updatedRequest.id,
    order_number: updatedRequest.order_number,
    event_type: "payment_request_updated",
    event_source: "staff",
    summary: `Payment request ${updatedRequest.request_number} updated.`,
    payload: { updates },
    staff_user_id: updates.staff_user_id || "",
  });
  return updatedRequest;
}

export function syncPaymentRequestTotals(identifier) {
  const paymentRequest = getPaymentRequestById(identifier);
  if (!paymentRequest) return null;

  const syncedRequest = hydratePaymentRequest(paymentRequest);
  const nextRequests = getStoredPaymentRequests().map((request) =>
    request.id === syncedRequest.id
      ? {
          ...request,
          amount_paid: syncedRequest.amount_paid,
          status: syncedRequest.status,
          paid_at: syncedRequest.status === "paid" ? request.paid_at || nowIso() : request.paid_at || null,
          updated_at: nowIso(),
        }
      : request
  );

  saveStoredPaymentRequests(nextRequests);
  return getPaymentRequestById(syncedRequest.id);
}

export function recordPayment(input = {}) {
  const payment = normalizePayment(input);
  const current = getStoredPayments();
  const existing = payment.idempotency_key
    ? current.find((entry) => entry.idempotency_key === payment.idempotency_key)
    : payment.metadata?.legacyPaymentId
    ? current.find(
        (entry) =>
          entry.order_number === payment.order_number &&
          entry.metadata?.legacyPaymentId === payment.metadata.legacyPaymentId
      )
    : null;

  if (existing) return existing;

  saveStoredPayments([payment, ...current]);
  if (payment.payment_request_id) {
    syncPaymentRequestTotals(payment.payment_request_id);
  }
  recordPaymentEvent({
    payment_id: payment.id,
    payment_request_id: payment.payment_request_id,
    order_number: payment.order_number,
    event_type: "payment_recorded",
    event_source: payment.metadata?.legacyPaymentId ? "system" : "staff",
    summary: `Payment recorded for $${payment.amount.toFixed(2)}.`,
    payload: { payment },
    staff_user_id: payment.recorded_by_staff_user_id,
    created_at: payment.created_at,
  });

  if (payment.metadata?.source !== "legacy_order_payment_history" && isSuccessfulPaymentStatus(payment.status)) {
    triggerNotificationEvent(NOTIFICATION_TYPES.paymentReceived, {
      payment,
      source: "payments_store",
      orderNumber: payment.order_number,
      depositAmount: payment.amount,
    });
  }

  return payment;
}

export function recordPaymentEvent(input = {}) {
  const event = normalizePaymentEvent(input);
  const current = getStoredPaymentEvents();
  const duplicate = current.find(
    (entry) =>
      entry.payment_id === event.payment_id &&
      entry.payment_request_id === event.payment_request_id &&
      entry.event_type === event.event_type &&
      entry.created_at === event.created_at
  );

  if (duplicate) return duplicate;

  saveStoredPaymentEvents([event, ...current]);
  return event;
}

export function getPaymentsByOrder(orderNumber) {
  const normalizedOrderNumber = normalizeText(orderNumber);
  if (!normalizedOrderNumber) return [];

  return listPayments().filter((payment) => payment.order_number === normalizedOrderNumber);
}

export function getPaymentRequestsByOrder(orderNumber) {
  const normalizedOrderNumber = normalizeText(orderNumber);
  if (!normalizedOrderNumber) return [];

  return listPaymentRequests().filter((request) => request.order_number === normalizedOrderNumber);
}

export function getPaymentEventsByOrder(orderNumber) {
  const normalizedOrderNumber = normalizeText(orderNumber);
  if (!normalizedOrderNumber) return [];

  return listPaymentEvents().filter((event) => event.order_number === normalizedOrderNumber);
}

export function getPaymentsByCustomer(customerId) {
  const normalizedCustomerId = normalizeCustomerId(customerId);
  if (!normalizedCustomerId) return [];

  return listPayments().filter((payment) => payment.customer_id === normalizedCustomerId);
}

export function getPaymentRequestsByCustomer(customerId) {
  const normalizedCustomerId = normalizeCustomerId(customerId);
  if (!normalizedCustomerId) return [];

  return listPaymentRequests().filter((request) => request.customer_id === normalizedCustomerId);
}

function isDepositPayment(order = {}, payment = {}) {
  const legacyId = normalizeText(payment.id).toLowerCase();
  const note = normalizeText(payment.note).toLowerCase();
  const depositAmount = normalizeAmount(order.deposit_amount || order.deposit?.amount);
  const amount = normalizeAmount(payment.amount);

  return legacyId.includes("deposit") || note.includes("deposit") || (depositAmount > 0 && amount <= depositAmount);
}

export function backfillOrderPaymentsToPayments(order = {}) {
  const paymentHistory = Array.isArray(order.payment_history) ? order.payment_history : [];
  if (!order.order_number || !paymentHistory.length) {
    return { paymentRequests: [], payments: [], paymentEvents: [] };
  }

  const createdPaymentRequests = [];
  const createdPayments = [];
  const createdEvents = [];

  paymentHistory.forEach((legacyPayment, index) => {
    const legacyPaymentId = normalizeText(legacyPayment?.id, `legacy-payment-${index}`);
    const legacyTimestamp = legacyPayment?.timestamp || legacyPayment?.created_at || legacyPayment?.recorded_at || order.updated_at || order.created_at || nowIso();
    const paymentType = isDepositPayment(order, legacyPayment) ? "deposit" : "partial";
    let paymentRequest = null;

    if (paymentType === "deposit") {
      paymentRequest = createPaymentRequest({
        customer_id: order.customer_id,
        order_id: order.id || "",
        order_number: order.order_number,
        request_type: "deposit",
        status: "paid",
        amount_requested: normalizeAmount(order.deposit_amount || legacyPayment.amount),
        amount_paid: normalizeAmount(legacyPayment.amount),
        payment_provider: "manual",
        description: "Legacy deposit request backfilled from order payment history.",
        metadata: {
          source: "legacy_order_payment_history",
          legacyPaymentId,
        },
        sent_at: order.deposit?.requested_at || null,
        paid_at: legacyTimestamp,
        created_at: legacyTimestamp,
        updated_at: legacyTimestamp,
      });
      createdPaymentRequests.push(paymentRequest);
    }

    const payment = recordPayment({
      customer_id: order.customer_id,
      order_id: order.id || "",
      order_number: order.order_number,
      payment_request_id: paymentRequest?.id || "",
      payment_type: paymentType,
      status: "captured",
      amount: legacyPayment.amount,
      method: legacyPayment.method,
      provider: "manual",
      captured_at: legacyTimestamp,
      note: legacyPayment.note,
      metadata: {
        source: "legacy_order_payment_history",
        legacyPaymentId,
        legacyStaffMember: legacyPayment.staff_member || legacyPayment.staff_name || "",
      },
      created_at: legacyTimestamp,
      updated_at: legacyTimestamp,
    });

    createdPayments.push(payment);
    createdEvents.push(
      recordPaymentEvent({
        payment_id: payment.id,
        payment_request_id: paymentRequest?.id || "",
        order_id: order.id || "",
        order_number: order.order_number,
        event_type: "legacy_payment_backfilled",
        event_source: "system",
        summary: `Legacy payment ${legacyPaymentId} backfilled into Payments.`,
        payload: { legacyPayment },
        created_at: legacyTimestamp,
      })
    );
  });

  return {
    paymentRequests: createdPaymentRequests,
    payments: createdPayments,
    paymentEvents: createdEvents,
  };
}

export function resetStoredPaymentsForTests() {
  saveStoredPaymentRequests([]);
  saveStoredPayments([]);
  saveStoredPaymentEvents([]);
}
