import { useSyncExternalStore } from "react";
import { getJsonStorageItem, hasBrowserStorage, setJsonStorageItem } from "./browserStorage";

const STORAGE_KEY = "teeCoStaffNotifications";

const notificationListeners = new Set();

const memoryStore = {
  records: [],
};

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
  if (!hasBrowserStorage()) return memoryStore.records;
  const records = getJsonStorageItem(STORAGE_KEY, []);
  return Array.isArray(records) ? records : [];
}

function saveStoredNotifications(records) {
  const safeRecords = Array.isArray(records) ? records : [];

  if (!hasBrowserStorage()) {
    memoryStore.records = safeRecords;
    emitNotificationsUpdated();
    return true;
  }

  const saved = setJsonStorageItem(STORAGE_KEY, safeRecords);
  if (saved) {
    emitNotificationsUpdated();
  }
  return saved;
}

function emitNotificationsUpdated() {
  notificationListeners.forEach((listener) => listener());
}

export function listStaffNotifications() {
  return [...readStoredNotifications()]
    .map(normalizeStaffNotification)
    .sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
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
  return record;
}

export function markStaffNotificationRead(id) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return false;

  const current = readStoredNotifications();
  const next = current.map((record) =>
    record.id === normalizedId ? { ...record, read: true } : record
  );
  return saveStoredNotifications(next);
}

export function markAllStaffNotificationsRead() {
  const current = readStoredNotifications();
  const next = current.map((record) => ({ ...record, read: true }));
  return saveStoredNotifications(next);
}

export function clearStaffNotificationsForTests() {
  saveStoredNotifications([]);
}
