import { useSyncExternalStore } from "react";
import { getJsonStorageItem, hasBrowserStorage, setJsonStorageItem } from "./browserStorage";
import {
  NOTIFICATION_TYPES,
  listNotificationTemplates,
  renderNotificationTemplatePreview,
} from "./notificationTemplatesStore";
import { supabase } from "./supabaseClient";

const STORAGE_KEY = "teeCoNotificationActivity";
const SUPABASE_TABLE = "notification_activity";
const MIGRATION_SENTINEL_KEY = "teeCoNotificationActivityMigratedToSupabase";
const COMPANY_NAME = "Tee & Co";

const notificationListeners = new Set();

const memoryStore = {
  records: [],
};

let activityHydrationPromise = null;

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
  // After hydration the memoryStore is the authoritative source
  if (memoryStore.records.length > 0) return memoryStore.records;
  // Before hydration: seed from localStorage
  if (hasBrowserStorage()) {
    const records = getJsonStorageItem(STORAGE_KEY, []);
    if (Array.isArray(records) && records.length > 0) {
      memoryStore.records = records;
      return memoryStore.records;
    }
  }
  return memoryStore.records;
}

function emitNotificationActivityUpdated() {
  notificationListeners.forEach((listener) => listener());
}

// --- Supabase persistence helpers ---

function shouldUseSupabase() {
  return Boolean(supabase?.from);
}

function buildActivityRow(record) {
  return {
    id: record.id,
    event_type: record.eventType,
    recipient_type: record.recipientType,
    recipient: record.recipient || {},
    template_type: record.templateType,
    template_name: record.templateName,
    generated_content: record.generatedContent || {},
    channels: record.channels || {},
    metadata: record.metadata || {},
    created_at: record.created_at,
  };
}

function mapActivityRow(row) {
  return {
    id: row.id,
    eventType: row.event_type,
    recipientType: row.recipient_type,
    recipient: row.recipient || {},
    templateType: row.template_type,
    templateName: row.template_name,
    generatedContent: row.generated_content || {},
    channels: row.channels || {},
    metadata: row.metadata || {},
    created_at: row.created_at,
  };
}

async function insertActivityRecordsToSupabase(records) {
  if (!shouldUseSupabase() || !records.length) return;
  try {
    const rows = records.map(buildActivityRow);
    const { error } = await supabase
      .from(SUPABASE_TABLE)
      .upsert(rows, { onConflict: "id" });
    if (error) {
      console.error("[notificationDeliveryService] Supabase insert failed", error);
    }
  } catch (err) {
    console.error("[notificationDeliveryService] Supabase insert threw", err);
  }
}

function saveNotificationActivity(records) {
  const safeRecords = Array.isArray(records) ? records : [];

  // Always update in-memory store immediately
  memoryStore.records = safeRecords;
  emitNotificationActivityUpdated();

  // Persist to localStorage as local cache
  if (hasBrowserStorage()) {
    setJsonStorageItem(STORAGE_KEY, safeRecords);
  }

  return true;
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
  insertActivityRecordsToSupabase(records);
  return records;
}

export function resetNotificationActivityForTests() {
  saveNotificationActivity([]);
}

// --- Supabase hydration + localStorage migration ---

async function hydrateNotificationActivityFromSupabase() {
  if (!shouldUseSupabase()) return;

  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .select("id, event_type, recipient_type, recipient, template_type, template_name, generated_content, channels, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.warn("[notificationDeliveryService] Supabase hydration failed", error);
      return;
    }

    const rows = Array.isArray(data) ? data : [];

    // One-time migration: if Supabase has no rows and localStorage has data
    const alreadyMigrated = hasBrowserStorage()
      ? getJsonStorageItem(MIGRATION_SENTINEL_KEY, false)
      : false;

    if (!alreadyMigrated && rows.length === 0) {
      const localRecords = hasBrowserStorage() ? getJsonStorageItem(STORAGE_KEY, []) : [];
      if (Array.isArray(localRecords) && localRecords.length > 0) {
        console.info("[notificationDeliveryService] Migrating localStorage activity to Supabase");
        await insertActivityRecordsToSupabase(localRecords);
        if (hasBrowserStorage()) setJsonStorageItem(MIGRATION_SENTINEL_KEY, true);
        saveNotificationActivity(localRecords);
        return;
      }
    }

    if (!alreadyMigrated && hasBrowserStorage()) {
      setJsonStorageItem(MIGRATION_SENTINEL_KEY, true);
    }

    const hydrated = rows.map(mapActivityRow);
    if (hasBrowserStorage()) {
      setJsonStorageItem(STORAGE_KEY, hydrated);
    }
    saveNotificationActivity(hydrated);
  } catch (err) {
    console.error("[notificationDeliveryService] Supabase hydration threw", err);
  }
}

export function ensureNotificationActivityHydrated() {
  if (activityHydrationPromise) return activityHydrationPromise;
  activityHydrationPromise = hydrateNotificationActivityFromSupabase().catch((err) => {
    console.error("[notificationDeliveryService] Hydration promise rejected", err);
  });
  return activityHydrationPromise;
}
