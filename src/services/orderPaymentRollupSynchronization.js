import { getStoredOrders, updateStoredOrder } from "../lib/ordersStore";
import { listPaymentRequests, listPayments } from "../lib/paymentsStore";
import { buildOrderPaymentReconciliationUpdates } from "./paymentReconciliation";

let synchronizationInFlight = null;

export function synchronizeStoredOrderPaymentRollups({
  orders = getStoredOrders(),
  paymentRequests = listPaymentRequests(),
  payments = listPayments(),
  updateOrder = updateStoredOrder,
} = {}) {
  if (synchronizationInFlight) return synchronizationInFlight;

  const execution = async () => {
    const staleOrderUpdates = orders
      .map((order) => ({
        order,
        updates: buildOrderPaymentReconciliationUpdates({
          order,
          paymentRequests,
          payments,
        }),
      }))
      .filter((entry) => entry.updates);

    if (staleOrderUpdates.length) {
      await Promise.all(
        staleOrderUpdates.map(({ order, updates }) =>
          updateOrder(order.order_number, updates)
        )
      );
    }

    return {
      scannedOrderCount: orders.length,
      updatedOrderCount: staleOrderUpdates.length,
      updatedOrderNumbers: staleOrderUpdates.map(({ order }) => order.order_number),
    };
  };

  const trackedExecution = execution().finally(() => {
    if (synchronizationInFlight === trackedExecution) {
      synchronizationInFlight = null;
    }
  });
  synchronizationInFlight = trackedExecution;

  return trackedExecution;
}
