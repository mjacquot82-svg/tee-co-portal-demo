import { useSyncExternalStore } from "react";
import { getJsonStorageItem, hasBrowserStorage, setJsonStorageItem } from "./browserStorage";
import { supabase } from "./supabaseClient";

const STORAGE_KEY = "teeCoStaffNotifications";
const SUPABASE_TABLE = "staff_notifications";
const MIGRATION_SENTINEL_KEY = "teeCoStaffNotificationsMigratedToSupabase";

const notificationListeners = new Set();

const memoryStore = {
  records: [],
};

let staffNotificationsHydrationPromise = null;

export const STAFF_NOTIFICATION_TYPES = Object.freeze({
  newWorkAssigned: "new_work_assigned",
  assignmentChanged: "assignment_changed",
  orderBlocked: "order_blocked",
  artworkRequired: "artwork_required",
  paymentHold: "payment_hold",
  readyForProduction: "ready_for_production",
  readyForPickup: "ready_for_pickup",
  productionStatusChanged: "production_status_changed",
  orderCompleted: "order_completed",
});

export const STAFF_NOTIFICATION_TYPE_LABELS = Object.freeze({
  [STAFF_NOTIFICATION_TYPES.newWorkAssigned]: "New Work Assigned",
  [STAFF_NOTIFICATION_TYPES.assignmentChanged]: "Assignment Changed",
  [STAFF_NOTIFICATION_TYPES.orderBlocked]: "Order Blocked",
  [STAFF_NOTIFICATION_TYPES.artworkRequired]: "Artwork Required",
  [STAFF_NOTIFICATION_TYPES.paymentHold]: "Payment Hold",
  [STAFF_NOTIFICATION_TYPES.readyForProduction]: "Ready For Production",
  [STAFF_NOTIFICATION_TYPES.readyForPickup]: "Ready For Pickup",
  [STAFF_NOTIFICATION_TYPES.productionStatusChanged]: "Production Status Changed",
  [STAFF_NOTIFICATION_TYPES.orderCompleted]: "Order Completed",
});

// Priority: high = red indicator, medium = orange, normal = default
export const STAFF_NOTIFICATION_PRIORITY = Object.freeze({
  [STAFF_NOTIFICATION_TYPES.newWorkAssigned]: "high",
  [STAFF_NOTIFICATION_TYPES.assignmentChanged]: "medium",
  [STAFF_NOTIFICATION_TYPES.orderBlocked]: "high",
  [STAFF_NOTIFICATION_TYPES.artworkRequired]: "medium",
  [STAFF_NOTIFICATION_TYPES.paymentHold]: "medium",
  [STAFF_NOTIFICATION_TYPES.readyForProduction]: "normal",
  [STAFF_NOTIFICATION_TYPES.readyForPickup]: "high",
  [STAFF_NOTIFICATION_TYPES.productionStatusChanged]: "normal",
  [STAFF_NOTIFICATION_TYPES.orderCompleted]: "normal",
});

function generateNotificationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `staff-notif-${crypto.randomUUID()}`;
  }
  return `staff-notif-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shouldUseSupabase() {
  return Boolean(supabase?.from);
}

function normalizeStaffNotification(record = {}) {
  return {
    id: String(record.id || ""),
    type: String(record.type || ""),
    orderNumber: String(record.orderNumber || ""),
    assignedToStaffId: String(record.assignedToStaffId || ""),
    assignedToStaffName: String(record.assignedToStaffName || ""),
    description: String(record.description || ""),
    linkTo: String(record.linkTo || ""),
    read: Boolean(record.read),
    createdAt: String(record.createdAt || new Date().toISOString()),
  };
}

function readStoredNotifications() {
  // After hydration the memoryStore is the authoritative source
  if (memoryStore.records.length > 0) return memoryStore.records;
  // Before hydration: seed from localStorage so first render isn't empty
  if (hasBrowserStorage()) {
    const records = getJsonStorageItem(STORAGE_KEY, []);
    if (Array.isArray(records) && records.length > 0) {
      memoryStore.records = records;
      return memoryStore.records;
    }
  }
  return memoryStore.records;
}

// --- Supabase persistence helpers ---

function buildStaffNotificationRow(record) {
  return {
    id: record.id,
    type: record.type,
    order_number: record.orderNumber,
    assigned_to_staff_id: record.assignedToStaffId,
    assigned_to_staff_name: record.assignedToStaffName,
    description: record.description,
    link_to: record.linkTo,
    read: record.read,
    created_at: record.createdAt,
  };
}

function mapStaffNotificationRow(row) {
  return normalizeStaffNotification({
    id: row.id,
    type: row.type,
    orderNumber: row.order_number,
    assignedToStaffId: row.assigned_to_staff_id,
    assignedToStaffName: row.assigned_to_staff_name,
    description: row.description,
    linkTo: row.link_to,
    read: row.read,
    createdAt: row.created_at,
  });
}

async function insertStaffNotificationToSupabase(record) {
  if (!shouldUseSupabase()) return;
  try {
    const { error } = await supabase
      .from(SUPABASE_TABLE)
      .insert(buildStaffNotificationRow(record));
    if (error) {
      console.error("[staffNotificationsStore] Supabase insert failed", error);
    }
  } catch (err) {
    console.error("[staffNotificationsStore] Supabase insert threw", err);
  }
}

async function markReadInSupabase(id) {
  if (!shouldUseSupabase()) return;
  try {
    const { error } = await supabase
      .from(SUPABASE_TABLE)
      .update({ read: true })
      .eq("id", id);
    if (error) {
      console.error("[staffNotificationsStore] Supabase mark-read failed", error);
    }
  } catch (err) {
    console.error("[staffNotificationsStore] Supabase mark-read threw", err);
  }
}

async function markAllReadInSupabase() {
  if (!shouldUseSupabase()) return;
  try {
    const { error } = await supabase
      .from(SUPABASE_TABLE)
      .update({ read: true })
      .eq("read", false);
    if (error) {
      console.error("[staffNotificationsStore] Supabase mark-all-read failed", error);
    }
  } catch (err) {
    console.error("[staffNotificationsStore] Supabase mark-all-read threw", err);
  }
}

function saveStoredNotifications(records) {
  const safeRecords = Array.isArray(records) ? records : [];

  // Always update in-memory store immediately
  memoryStore.records = safeRecords;
  emitNotificationsUpdated();

  // Persist to localStorage as local cache
  if (hasBrowserStorage()) {
    setJsonStorageItem(STORAGE_KEY, safeRecords);
  }

  return true;
}

function emitNotificationsUpdated() {
  notificationListeners.forEach((listener) => listener());
}

export function listStaffNotifications() {
  return [...readStoredNotifications()]
    .map(normalizeStaffNotification)
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      const aValid = Number.isFinite(aTime) ? aTime : 0;
      const bValid = Number.isFinite(bTime) ? bTime : 0;
      return bValid - aValid;
    });
}

export function getUnreadStaffNotificationCount() {
  return readStoredNotifications().filter((r) => !r.read).length;
}

export function subscribeToStaffNotifications(listener) {
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

export function useStaffNotifications() {
  return useSyncExternalStore(subscribeToStaffNotifications, listStaffNotifications, () => []);
}

export function useUnreadStaffNotificationCount() {
  return useSyncExternalStore(
    subscribeToStaffNotifications,
    getUnreadStaffNotificationCount,
    () => 0
  );
}

/**
 * Create a new staff notification.
 * @param {object} input
 * @param {string} input.type - One of STAFF_NOTIFICATION_TYPES
 * @param {string} input.orderNumber
 * @param {string} [input.assignedToStaffId]
 * @param {string} [input.assignedToStaffName]
 * @param {string} input.description - Short human-readable description
 * @param {string} [input.linkTo] - Relative URL to relevant record
 */
export function createStaffNotification(input = {}) {
  const typeStr = String(input.type || "").trim();
  if (!typeStr || !Object.values(STAFF_NOTIFICATION_TYPES).includes(typeStr)) {
    return null;
  }

  const orderNumber = String(input.orderNumber || "").trim();
  if (!orderNumber) return null;

  const record = normalizeStaffNotification({
    id: generateNotificationId(),
    type: typeStr,
    orderNumber,
    assignedToStaffId: input.assignedToStaffId || "",
    assignedToStaffName: input.assignedToStaffName || "",
    description: String(input.description || "").trim() || STAFF_NOTIFICATION_TYPE_LABELS[typeStr] || typeStr,
    linkTo: String(input.linkTo || `/admin/orders/${orderNumber}`).trim(),
    read: false,
    createdAt: new Date().toISOString(),
  });

  const current = readStoredNotifications();
  saveStoredNotifications([record, ...current]);
  insertStaffNotificationToSupabase(record);
  return record;
}

export function markStaffNotificationRead(id) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return false;

  const current = readStoredNotifications();
  const next = current.map((record) =>
    record.id === normalizedId ? { ...record, read: true } : record
  );
  const result = saveStoredNotifications(next);
  markReadInSupabase(normalizedId);
  return result;
}

export function markAllStaffNotificationsRead() {
  const current = readStoredNotifications();
  const next = current.map((record) => ({ ...record, read: true }));
  const result = saveStoredNotifications(next);
  markAllReadInSupabase();
  return result;
}

export function clearStaffNotificationsForTests() {
  saveStoredNotifications([]);
}

// --- Supabase hydration + localStorage migration ---

async function hydrateStaffNotificationsFromSupabase() {
  if (!shouldUseSupabase()) return;

  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .select("id, type, order_number, assigned_to_staff_id, assigned_to_staff_name, description, link_to, read, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.warn("[staffNotificationsStore] Supabase hydration failed", error);
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
        console.info("[staffNotificationsStore] Migrating localStorage staff notifications to Supabase");
        const migrateRows = localRecords
          .map((r) => normalizeStaffNotification(r))
          .map(buildStaffNotificationRow);
        const { error: insertError } = await supabase
          .from(SUPABASE_TABLE)
          .upsert(migrateRows, { onConflict: "id" });
        if (insertError) {
          console.error("[staffNotificationsStore] Migration insert failed", insertError);
        } else {
          if (hasBrowserStorage()) setJsonStorageItem(MIGRATION_SENTINEL_KEY, true);
          saveStoredNotifications(localRecords.map((r) => normalizeStaffNotification(r)));
        }
        return;
      }
    }

    if (!alreadyMigrated && hasBrowserStorage()) {
      setJsonStorageItem(MIGRATION_SENTINEL_KEY, true);
    }

    const hydrated = rows.map(mapStaffNotificationRow);
    // Update localStorage cache
    if (hasBrowserStorage()) {
      setJsonStorageItem(STORAGE_KEY, hydrated);
    }
    saveStoredNotifications(hydrated);
  } catch (err) {
    console.error("[staffNotificationsStore] Supabase hydration threw", err);
  }
}

export function ensureStaffNotificationsHydrated() {
  if (staffNotificationsHydrationPromise) return staffNotificationsHydrationPromise;
  staffNotificationsHydrationPromise = hydrateStaffNotificationsFromSupabase().catch((err) => {
    console.error("[staffNotificationsStore] Hydration promise rejected", err);
  });
  return staffNotificationsHydrationPromise;
}
