import { buildOperationalMetrics } from "../operations/buildOperationalMetrics";
import {
  isActiveQuoteWorkflowOrder,
  normalizeQuoteStatus,
} from "../quotes/quoteWorkflow";
import { buildProductionReadiness } from "../quotes/productionReadiness";
import { normalizeOrderFinancials } from "../orders/orderFinancials";
import {
  isCanceledOperationalStatus,
  isCompletedOperationalStatus,
  normalizeOperationalStatus,
} from "../orders/orderWorkflow";

export function buildOwnerWorkflowSnapshot(orders = []) {
  const metrics = buildOperationalMetrics(orders);
  const snapshot = {
    newOrderRequests: 0,
    awaitingCustomerApproval: 0,
    awaitingDeposit: 0,
    awaitingArtwork: 0,
    readyForProduction: 0,
    readyForPickup: 0,
    overdueProduction: metrics.overdue,
  };

  orders.forEach((order) => {
    const quoteStatus = normalizeQuoteStatus(order.quote_status);

    if (isActiveQuoteWorkflowOrder(order)) {
      const readiness = buildProductionReadiness(
        order,
        normalizeOrderFinancials(order, {
          additionalSources: order.quote ? [{ label: "storedQuote", value: order.quote }] : [],
        })
      );

      if (quoteStatus === "Draft") {
        snapshot.newOrderRequests += 1;
      }

      if (quoteStatus === "Awaiting Approval") {
        snapshot.awaitingCustomerApproval += 1;
      }

      if (quoteStatus === "Awaiting Deposit") {
        snapshot.awaitingDeposit += 1;
      }

      if (quoteStatus === "Awaiting Artwork Approval") {
        snapshot.awaitingArtwork += 1;
      }

      if (readiness.ready) {
        snapshot.readyForProduction += 1;
      }

      return;
    }

    const operationalStatus = normalizeOperationalStatus(order.status);
    if (isCompletedOperationalStatus(operationalStatus) || isCanceledOperationalStatus(operationalStatus)) {
      return;
    }

    if (operationalStatus === "Ready For Production") {
      snapshot.readyForProduction += 1;
    }

    if (operationalStatus === "Ready For Pickup") {
      snapshot.readyForPickup += 1;
    }
  });

  return snapshot;
}

export function buildOwnerWorkflowQueues(orders = []) {
  const snapshot = buildOwnerWorkflowSnapshot(orders);
  const readyForStaff = orders.filter((order) => {
    if (order.operational_visible === false) return false;
    const status = normalizeOperationalStatus(order.status);
    return (
      !isCompletedOperationalStatus(status) &&
      !isCanceledOperationalStatus(status) &&
      status === "Ready For Production"
    );
  }).length;

  return [
    {
      key: "new-order-requests",
      label: "New Order Requests",
      count: snapshot.newOrderRequests,
      description: "Review customer-submitted requests and prepare the quote.",
      to: "/admin/quotes",
      tone: "default",
    },
    {
      key: "awaiting-customer-approval",
      label: "Awaiting Customer Approval",
      count: snapshot.awaitingCustomerApproval,
      description: "Quotes are waiting on the customer before the next step.",
      to: "/admin/quotes?queue=awaiting-approval",
      tone: "warning",
    },
    {
      key: "awaiting-deposit",
      label: "Awaiting Deposit",
      count: snapshot.awaitingDeposit,
      description: "Deposit collection is the next action before production.",
      to: "/admin/quotes?queue=awaiting-deposit",
      tone: "warning",
    },
    {
      key: "awaiting-artwork",
      label: "Awaiting Artwork",
      count: snapshot.awaitingArtwork,
      description: "Artwork approval or follow-up is needed before release.",
      to: "/admin/quotes?queue=awaiting-artwork",
      tone: "warning",
    },
    {
      key: "ready-for-production",
      label: "Ready for Production",
      count: readyForStaff,
      description: "Approved work can move directly into the production queue.",
      to: "/admin/orders?status=ready-for-production",
      tone: "success",
    },
    {
      key: "ready-for-pickup",
      label: "Ready for Pickup",
      count: snapshot.readyForPickup,
      description: "Finished orders are ready for customer handoff.",
      to: "/admin/orders?status=ready-for-pickup",
      tone: "success",
    },
  ];
}
