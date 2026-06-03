import {
  createStoredOrder,
  duplicateStoredOrder,
  findStoredOrder,
  getStoredOrders,
  recordStoredOrderPayment,
  subscribeToStoredOrders,
  updateStoredOrder,
  useStoredOrders,
} from "../lib/ordersStore";

export function listOrders() {
  return getStoredOrders();
}

export function getOrderByNumber(orderNumber) {
  return findStoredOrder(orderNumber);
}

export function createOrder(order) {
  return createStoredOrder(order);
}

export function updateOrder(orderNumber, updates) {
  return updateStoredOrder(orderNumber, updates);
}

export function recordOrderPayment(orderNumber, paymentInput = {}, options = {}) {
  return recordStoredOrderPayment(orderNumber, paymentInput, options);
}

export function duplicateOrder(orderNumber) {
  return duplicateStoredOrder(orderNumber);
}

export function subscribeToOrders(listener) {
  return subscribeToStoredOrders(listener);
}

export function useOrders() {
  return useStoredOrders();
}
