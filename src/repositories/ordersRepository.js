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
import { linkOrderToCustomer } from "../lib/customersStore";

export function listOrders() {
  return getStoredOrders();
}

export function getOrderByNumber(orderNumber) {
  return findStoredOrder(orderNumber);
}

export function createOrder(order) {
  return createStoredOrder(order);
}

export async function createCustomerRequest({ profile = null, orderInput = {}, linkToCustomer = true } = {}) {
  const createdOrder = createOrder(orderInput);

  if (linkToCustomer && profile?.id) {
    await linkOrderToCustomer(profile.id, createdOrder.order_number);
  }

  return createdOrder;
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
