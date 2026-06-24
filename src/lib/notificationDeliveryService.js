import { useSyncExternalStore } from "react";
import { getJsonStorageItem, hasBrowserStorage, setJsonStorageItem } from "./browserStorage";
import {
  NOTIFICATION_TYPES,
  listNotificationTemplates,
  renderNotificationTemplatePreview,
} from "./notificationTemplatesStore";

const STORAGE_KEY = "teeCoNotificationActivity";
const COMPANY_NAME = "Tee & Co";

const notificationListeners = new Set();

const memoryStore = {
  records: [],
};

function nowIso() {
  return new Date().toISOString();
}

function generateNotificationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `notification-${crypto.randomUUID()}`;
  }
  return `notification-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeText(value, fallback = "") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function normalizeNumber(value) {
  const numberValue =
    typeof value === "number" ? value : Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatCurrency(value) {
  return `$${Math.max(0, normalizeNumber(value)).toFixed(2)}`;
}

function normalizeMergeFields(mergeFields = {}) {
  const entries =
    mergeFields && typeof mergeFields === "object" ? Object.entries(mergeFields) : [];

  return entries.reduce((result, [key, value]) => {
    const plainKey = String(key || "").replace(/[{}]/g, "").trim();
    if (!plainKey) return result;
    result[plainKey] = value;
    return result;
  }, {});
}

function buildDefaultMergeFields(context = {}) {
  const order = context.order || {};
  const paymentRequest = context.paymentRequest || {};
  const payment = context.payment || {};
  const customer = context.customer || {};
  const mergeOverrides = normalizeMergeFields(context.mergeFields);

  const orderNumber = normalizeText(
    mergeOverrides.order_number ||
      context.orderNumber ||
      order.order_number ||
      paymentRequest.order_number ||
      payment.order_number
  );
  const customerName = normalizeText(
    mergeOverrides.customer_name ||
      context.customerName ||
      customer.name ||
      customer.company ||
      order.customer_name ||
      paymentRequest.metadata?.customer_name
  );
  const quoteTotal = mergeOverrides.quote_total || formatCurrency(order.total_amount || order.total);
  const depositAmount =
    mergeOverrides.deposit_amount ||
    formatCurrency(
      context.depositAmount ||
        order.deposit_amount ||
        paymentRequest.amount_requested ||
        payment.amount
    );
  const balanceDue =
    mergeOverrides.balance_due ||
    formatCurrency(context.balanceDue || order.balance_due || paymentRequest.amount_due || 0);
  const approvalLink =
    mergeOverrides.approval_link ||
    context.approvalLink ||
    (orderNumber ? `https://portal.teeandco.local/approval/${orderNumber}` : "");
  const paymentLink =
    mergeOverrides.payment_link ||
    context.paymentLink ||
    paymentRequest.provider_checkout_url ||
    (orderNumber ? `https://portal.teeandco.local/deposit/${orderNumber}` : "");
  const pickupDate = normalizeText(
    mergeOverrides.pickup_date || context.pickupDate || order.pickup_date || order.due_date
  );

  return {
    customer_name: customerName || "Customer",
    order_number: orderNumber || "N/A",
    quote_total: quoteTotal,
    deposit_amount: depositAmount,
    balance_due: balanceDue,
    approval_link: approvalLink,
    payment_link: paymentLink,
    pickup_date: pickupDate,
    company_name: mergeOverrides.company_name || COMPANY_NAME,
    ...mergeOverrides,
  };
}

function readNotificationActivity() {
  if (!hasBrowserStorage()) return memoryStore.records;
  const records = getJsonStorageItem(STORAGE_KEY, []);
  return Array.isArray(records) ? records : [];
}

function emitNotificationActivityUpdated() {
  notificationListeners.forEach((listener) => listener());
}

function saveNotificationActivity(records) {
  const safeRecords = Array.isArray(records) ? records : [];

  if (!hasBrowserStorage()) {
    memoryStore.records = safeRecords;
    emitNotificationActivityUpdated();
    return true;
  }

  const saved = setJsonStorageItem(STORAGE_KEY, safeRecords);
  if (saved) {
    emitNotificationActivityUpdated();
  }
  return saved;
}

function resolveTemplate(templateType) {
  return listNotificationTemplates().find((template) => template.type === templateType) || null;
}

function resolveCustomerRecipient(context = {}) {
  const customer = context.customer || {};
  const order = context.order || {};
  const paymentRequest = context.paymentRequest || {};

  return {
    name: normalizeText(
      context.customerName || customer.name || customer.company || order.customer_name,
      "Customer"
    ),
    email: normalizeText(context.customerEmail || customer.email || order.customer_email),
    phone: normalizeText(context.customerPhone || customer.phone || order.customer_phone),
    reference: normalizeText(paymentRequest.customer_id || order.customer_id || customer.id),
  };
}

function resolveStaffRecipient(context = {}) {
  const staff = context.staff || {};

  return {
    name: normalizeText(context.staffName || staff.name, "Staff Team"),
    email: normalizeText(context.staffEmail || staff.email, "staff@teeandco.local"),
    phone: normalizeText(context.staffPhone || staff.phone),
    reference: normalizeText(context.staffId || staff.id),
  };
}

function buildNotificationRecord({
  eventType,
  recipientType,
  recipient,
  template,
  renderedContent,
  channels,
  mergeFields,
  context,
}) {
  const timestamp = context.timestamp || nowIso();
  return {
    id: generateNotificationId(),
    eventType,
    recipientType,
    recipient,
    templateType: template.type,
    templateName: template.name,
    generatedContent: renderedContent,
    channels: {
      email: Boolean(channels?.email),
      sms: Boolean(channels?.sms),
    },
    metadata: {
      orderNumber: mergeFields.order_number || "",
      customerName: mergeFields.customer_name || "",
      createdBy: normalizeText(context.source, "system"),
    },
    created_at: timestamp,
  };
}

export const NOTIFICATION_EVENT_TEMPLATE_MAP = Object.freeze({
  [NOTIFICATION_TYPES.newCustomerRequest]: NOTIFICATION_TYPES.newCustomerRequest,
  [NOTIFICATION_TYPES.quoteReadyForApproval]: NOTIFICATION_TYPES.quoteReadyForApproval,
  [NOTIFICATION_TYPES.quoteApproved]: NOTIFICATION_TYPES.quoteApproved,
  [NOTIFICATION_TYPES.artworkRevisionRequested]: NOTIFICATION_TYPES.artworkRevisionRequested,
  [NOTIFICATION_TYPES.artworkApproved]: NOTIFICATION_TYPES.artworkApproved,
  [NOTIFICATION_TYPES.depositRequested]: NOTIFICATION_TYPES.depositRequested,
  [NOTIFICATION_TYPES.paymentRequestCreated]: NOTIFICATION_TYPES.paymentRequestCreated,
  [NOTIFICATION_TYPES.paymentReceived]: NOTIFICATION_TYPES.paymentReceived,
  [NOTIFICATION_TYPES.paymentFailed]: NOTIFICATION_TYPES.paymentFailed,
  [NOTIFICATION_TYPES.orderInProduction]: NOTIFICATION_TYPES.orderInProduction,
  [NOTIFICATION_TYPES.orderReadyForPickup]: NOTIFICATION_TYPES.orderReadyForPickup,
  [NOTIFICATION_TYPES.orderCompleted]: NOTIFICATION_TYPES.orderCompleted,
});

export function listNotificationActivity() {
  return [...readNotificationActivity()].sort(
    (left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
  );
}

export function subscribeToNotificationActivity(listener) {
  if (typeof listener !== "function") return () => {};
  notificationListeners.add(listener);

  if (typeof window === "undefined") {
    return () => notificationListeners.delete(listener);
  }

  const handleStorage = (event) => {
    if (!event.key || event.key === STORAGE_KEY) {
      listener();
    }
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    notificationListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useNotificationActivity() {
  return useSyncExternalStore(subscribeToNotificationActivity, listNotificationActivity, () => []);
}

export function triggerNotificationEvent(eventType, context = {}) {
  const templateType = NOTIFICATION_EVENT_TEMPLATE_MAP[eventType];
  if (!templateType) {
    throw new Error(`Unsupported notification event type: ${eventType}`);
  }

  const template = resolveTemplate(templateType);
  if (!template) {
    return [];
  }

  const mergeFields = buildDefaultMergeFields(context);
  const renderedContent = renderNotificationTemplatePreview(template, mergeFields);
  const customerRecipient = resolveCustomerRecipient(context);
  const records = [
    buildNotificationRecord({
      eventType,
      recipientType: "customer",
      recipient: customerRecipient,
      template,
      renderedContent,
      channels: {
        email: template.emailEnabled,
        sms: template.smsEnabled,
      },
      mergeFields,
      context,
    }),
  ];

  if (template.staffNotificationEnabled) {
    records.push(
      buildNotificationRecord({
        eventType,
        recipientType: "staff",
        recipient: resolveStaffRecipient(context),
        template,
        renderedContent,
        channels: {
          email: true,
          sms: false,
        },
        mergeFields,
        context,
      })
    );
  }

  saveNotificationActivity([...records, ...readNotificationActivity()]);
  return records;
}

export function resetNotificationActivityForTests() {
  saveNotificationActivity([]);
}
