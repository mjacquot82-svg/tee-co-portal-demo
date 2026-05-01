import { buildStaffAuditFields } from "./staffUsersStore";

const STORAGE_KEY = "teeCoStaffOrders";

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

  const order = {
    ...orderInput,
    ...buildStaffAuditFields("created"),
    order_number: orderNumber,
    status: orderInput.status || "Awaiting Artwork",
    date: new Date(createdAt).toLocaleDateString(),
    created_at: createdAt,
    source: orderInput.source || "Staff Entry",
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
  const nextOrders = currentOrders.map((order) =>
    order.order_number === orderNumber
      ? {
          ...order,
          ...updates,
          ...buildStaffAuditFields("updated"),
          updated_at: new Date().toISOString(),
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

  return createStoredOrder(copiedOrder);
}
