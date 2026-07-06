import { isActiveOperationalStatus } from "../orders/orderWorkflow";
import { buildPaymentExceptionQueue } from "../services/paymentReconciliation";
import { isActiveQuoteWorkflowOrder } from "../quotes/quoteWorkflow";

function normalizeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function isOpenPaymentRequest(request = {}) {
  return !["paid", "canceled", "cancelled", "expired", "failed"].includes(normalizeLower(request.status));
}

function isFailedPayment(payment = {}) {
  return ["failed", "voided", "declined"].includes(normalizeLower(payment.status));
}

export function buildSidebarAttentionCounts({
  operationalOrders = [],
  assignedOrders = [],
  paymentRequests = [],
  payments = [],
  paymentEvents = [],
  reconciliationReviews = [],
  staffWorkspace = false,
} = {}) {
  const activeOperationalOrders = operationalOrders.filter(
    (order) =>
      order.operational_visible !== false && isActiveOperationalStatus(order.status)
  );
  const activeAssignedOrders = assignedOrders.filter(
    (order) =>
      order.operational_visible !== false && isActiveOperationalStatus(order.status)
  );
  const paymentExceptions = buildPaymentExceptionQueue({
    paymentRequests,
    payments,
    paymentEvents,
    reviews: reconciliationReviews,
  });

  return {
    orderRequests: operationalOrders.filter(isActiveQuoteWorkflowOrder).length,
    productionOrders: activeOperationalOrders.length,
    assignments: staffWorkspace
      ? activeAssignedOrders.length
      : activeOperationalOrders.filter(
          (order) =>
            order.needs_assignment || !order.assigned_to_staff_id
        ).length,
    payments:
      paymentRequests.filter(isOpenPaymentRequest).length +
      payments.filter(isFailedPayment).length +
      paymentExceptions.length,
  };
}
