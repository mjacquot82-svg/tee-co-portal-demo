import {
  isCanceledOperationalStatus,
  isCompletedOperationalStatus,
} from "../orders/orderWorkflow";
import { customerIdsEqual, normalizeCustomerId } from "./customerIds";
import { findCustomerProfileForSession } from "./customerProfileMatching";

export { findCustomerProfileForSession } from "./customerProfileMatching";

const EMPTY_PORTAL_RECORDS = Object.freeze([]);
export const EMPTY_PORTAL_SUMMARY = Object.freeze({
  orderCount: 0,
  outstandingBalance: 0,
  totalValue: 0,
  readyForPickupCount: 0,
  overdueInvoiceCount: 0,
});

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function sortByRecentActivity(records = []) {
  if (!Array.isArray(records) || records.length === 0) {
    return EMPTY_PORTAL_RECORDS;
  }

  return [...records].sort((left, right) => {
    const leftTimestamp = new Date(left?.updated_at || left?.created_at || 0).getTime();
    const rightTimestamp = new Date(right?.updated_at || right?.created_at || 0).getTime();

    return rightTimestamp - leftTimestamp;
  });
}

export function getCustomerScopedOrders({
  session,
  orders = [],
  customers = [],
} = {}) {
  if (!session) return EMPTY_PORTAL_RECORDS;

  const profile = findCustomerProfileForSession(session, customers);
  const sessionEmail = normalizeEmail(session.email);
  const customerIds = new Set(
    [profile?.id, profile?.customer_id].map((value) => normalizeCustomerId(value)).filter(Boolean)
  );

  return sortByRecentActivity(
    orders.filter((order) => {
      const orderCustomerId = normalizeCustomerId(order.customer_id);
      const orderCustomerEmail = normalizeEmail(order.customer_email);

      if (sessionEmail && orderCustomerEmail && orderCustomerEmail === sessionEmail) {
        return true;
      }

      if (
        orderCustomerId &&
        Array.from(customerIds).some((customerId) => customerIdsEqual(customerId, orderCustomerId))
      ) {
        return true;
      }

      return false;
    })
  );
}

export function isCustomerPortalArchivedOrder(order = {}) {
  const quoteStatus = normalizeText(order.quote_status);
  const pickupStatus = normalizeText(order.pickup_status);

  return (
    isCanceledOperationalStatus(order.status) ||
    quoteStatus === "Canceled" ||
    isCompletedOperationalStatus(order.status) ||
    pickupStatus === "Picked Up"
  );
}

export function getCustomerActiveOrders(orders = []) {
  return sortByRecentActivity(
    orders.filter((order) => !isCustomerPortalArchivedOrder(order))
  );
}

export function getCustomerArchivedOrders(orders = []) {
  return sortByRecentActivity(
    orders.filter((order) => isCustomerPortalArchivedOrder(order))
  );
}

export function getCustomerQuotes(orders = []) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return EMPTY_PORTAL_RECORDS;
  }

  return orders.filter((order) => {
    const quoteStatus = normalizeText(order.quote_status);
    return Boolean(quoteStatus) && quoteStatus !== "Canceled";
  });
}

export function getCustomerInvoices(orders = []) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return EMPTY_PORTAL_RECORDS;
  }

  return orders.filter((order) => {
    const invoiceStatus = normalizeText(order.invoice_status);
    return (
      Boolean(invoiceStatus) ||
      Number(order.balance_due || 0) > 0 ||
      Number(order.total_amount || 0) > 0
    );
  });
}

export function buildCustomerPortalSummary(orders = []) {
  if (!Array.isArray(orders) || orders.length === 0) {
    console.debug("[portal] buildCustomerPortalSummary", {
      orderCount: 0,
      readyForPickupCount: 0,
      overdueInvoiceCount: 0,
    });
    return EMPTY_PORTAL_SUMMARY;
  }

  const summary = orders.reduce(
    (summary, order) => {
      summary.orderCount += 1;
      summary.outstandingBalance += Number(order.balance_due || 0);
      summary.totalValue += Number(order.total_amount || 0);

      if (String(order.pickup_status || "").trim() === "Ready for Pickup") {
        summary.readyForPickupCount += 1;
      }

      if (String(order.invoice_status || "").trim() === "Overdue") {
        summary.overdueInvoiceCount += 1;
      }

      return summary;
    },
    { ...EMPTY_PORTAL_SUMMARY }
  );

  console.debug("[portal] buildCustomerPortalSummary", {
    orderCount: summary.orderCount,
    readyForPickupCount: summary.readyForPickupCount,
    overdueInvoiceCount: summary.overdueInvoiceCount,
    outstandingBalance: summary.outstandingBalance,
    orderNumbers: orders.map((order) => order.order_number || order.id || "unknown"),
  });

  return summary;
}
