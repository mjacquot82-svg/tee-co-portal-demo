import { buildStaffAuditFields, getActiveStaffUser } from "./staffUsersStore";

const STORAGE_KEY = "teeCoStaffOrders";

function buildActivityEvent(type, note, timestamp = new Date().toISOString()) {
  const staff = getActiveStaffUser();

  return {
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    note,
    staff_id: staff?.id || "",
    staff_name: staff?.name || "Unknown Staff",
    staff_role: staff?.role || "",
    created_at: timestamp,
  };
}

function describeOrderUpdate(updates) {
  if (updates.activity_note) return updates.activity_note;
  if (updates.status) return `Status changed to ${updates.status}.`;
  if (updates.deposit?.status === "paid") return "Deposit recorded as paid.";
  if (updates.deposit?.status === "pending") return "Deposit requested.";
  if (updates.artwork_files) return "Artwork file uploaded.";
  if (updates.size_breakdown) return "Size breakdown updated.";
  if (updates.quote) return "Quote snapshot saved.";
  if (updates.approval_note) return "Approval note updated.";
  return "Order updated.";
}

function describeActivityType(updates) {
  if (updates.activity_type) return updates.activity_type;
  if (updates.status) return "status_change";
  if (updates.deposit) return "deposit";
  if (updates.artwork_files) return "artwork";
  if (updates.size_breakdown) return "sizes";
  if (updates.quote) return "quote";
  if (updates.approval_note) return "approval_note";
  return "updated";
}

function stripActivityMeta(updates) {
  const { activity_note, activity_type, ...cleanUpdates } = updates;
  return cleanUpdates;
}

export function getStoredOrders() {
  if (typeof window === "undefined") return [];

  try {
    const rawOrders = window.localStorage.getItem(STORAGE_KEY);
    return rawOrders ? JSON.parse(rawOrders) : [];
  } catch (error) {
    console.error("Unable to read stored Tee & Co orders", error);
    return [];
  }
}

export function saveStoredOrders(orders) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

export function createStoredOrder(orderInput) {
  const currentOrders = getStoredOrders();
  const orderNumber = `TC-${Date.now().toString().slice(-6)}`;
  const createdAt = new Date().toISOString();
  const createdAuditFields = buildStaffAuditFields("created");

  const order = {
    ...orderInput,
    ...createdAuditFields,
    order_number: orderNumber,
    status: orderInput.status || "Awaiting Artwork",
    date: new Date(createdAt).toLocaleDateString(),
    created_at: createdAt,
    source: orderInput.source || "Staff Entry",
    activity_log: [
      buildActivityEvent(
        "created",
        `Order created for ${orderInput.customer_name || "Walk-in Customer"}.`,
        createdAt
      ),
    ],
  };

  const nextOrders = [order, ...currentOrders];
  saveStoredOrders(nextOrders);
  return order;
}

export function findStoredOrder(orderNumber) {
  return getStoredOrders().find((order) => order.order_number === orderNumber);
}

export function updateStoredOrder(orderNumber, updates) {
  const currentOrders = getStoredOrders();
  const now = new Date().toISOString();
  const cleanUpdates = stripActivityMeta(updates);

  const nextOrders = currentOrders.map((order) =>
    order.order_number === orderNumber
      ? {
          ...order,
          ...cleanUpdates,
          ...buildStaffAuditFields("updated"),
          updated_at: now,
          activity_log: [
            buildActivityEvent(describeActivityType(updates), describeOrderUpdate(updates), now),
            ...(order.activity_log || []),
          ],
        }
      : order
  );

  saveStoredOrders(nextOrders);
  return nextOrders.find((order) => order.order_number === orderNumber);
}

export function duplicateStoredOrder(orderNumber) {
  const original = findStoredOrder(orderNumber);
  if (!original) return null;

  const copiedOrder = {
    ...original,
    status: "Awaiting Artwork",
    approval_status: "Not Sent",
    approval_note: "",
    approval_sent_at: null,
    approved_at: null,
    revision_requested_at: null,
    customer_approval_note: "",
    customer_approved_at: null,
    customer_revision_requested_at: null,
    source: "Repeat Order",
    notes: original.notes ? `Repeat order copied from ${original.order_number}. ${original.notes}` : `Repeat order copied from ${original.order_number}.`,
  };

  delete copiedOrder.order_number;
  delete copiedOrder.created_at;
  delete copiedOrder.updated_at;
  delete copiedOrder.date;
  delete copiedOrder.created_by_staff_id;
  delete copiedOrder.created_by_staff_name;
  delete copiedOrder.created_by_staff_role;
  delete copiedOrder.updated_by_staff_id;
  delete copiedOrder.updated_by_staff_name;
  delete copiedOrder.updated_by_staff_role;
  delete copiedOrder.activity_log;

  return createStoredOrder(copiedOrder);
}
