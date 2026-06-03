import {
  isCanceledOperationalStatus,
  isCompletedOperationalStatus,
} from "../orders/orderWorkflow";
import { customerIdsEqual, normalizeCustomerId } from "./customerIds";

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

function normalizeName(value) {
  return normalizeText(value).replace(/\s+/g, " ").toLowerCase();
}

const CUSTOMER_REQUEST_SOURCES = new Set([
  "Storefront Request",
  "Customer Portal",
  "Customer Project Request",
  "Storefront",
]);

const CUSTOMER_REQUEST_TYPES = new Set([
  "Product Request",
  "Quote Request",
  "Standard Purchase",
]);

const CUSTOMER_VISIBLE_INVOICE_STATUSES = new Set([
  "Sent",
  "Awaiting Deposit",
  "Awaiting Payment",
  "Awaiting Final Payment",
  "Partial Payment",
  "Deposit Applied",
  "Deposit Paid",
  "Paid",
  "Overdue",
  "Refunded",
  "Void",
]);

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

export function findCustomerProfileForSession(session, customers = []) {
  if (!session) return null;

  const normalizedSessionId = normalizeText(session.id);
  const normalizedSessionEmail = normalizeEmail(session.email);
  const normalizedSessionName = normalizeName(session.displayName);

  return (
    customers.find((customer) => {
      const customerExternalReference = normalizeText(customer.external_reference);
      const customerAuthId = normalizeText(customer.auth_user_id);
      const customerEmail = normalizeEmail(customer.email);
      const customerName = normalizeName(customer.name);

      if (normalizedSessionId) {
        if (
          customerAuthId === normalizedSessionId ||
          customerExternalReference === normalizedSessionId
        ) {
          return true;
        }
      }

      if (normalizedSessionEmail && customerEmail === normalizedSessionEmail) {
        return true;
      }

      return Boolean(normalizedSessionName) && customerName === normalizedSessionName;
    }) || null
  );
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

export function isCustomerRequestRecord(order = {}) {
  const source = normalizeText(order.source);
  const requestType = normalizeText(order.request_type);

  if (order.operational_visible !== false) {
    return false;
  }

  if (!CUSTOMER_REQUEST_SOURCES.has(source)) {
    return false;
  }

  if (CUSTOMER_REQUEST_TYPES.has(requestType)) {
    return true;
  }

  return (
    source === "Storefront" &&
    Array.isArray(order.cart_items) &&
    order.cart_items.length > 0
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
    orders.filter(
      (order) => !isCustomerRequestRecord(order) && !isCustomerPortalArchivedOrder(order)
    )
  );
}

export function getCustomerArchivedOrders(orders = []) {
  return sortByRecentActivity(
    orders.filter(
      (order) => !isCustomerRequestRecord(order) && isCustomerPortalArchivedOrder(order)
    )
  );
}

export function getCustomerRequests(orders = []) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return EMPTY_PORTAL_RECORDS;
  }

  return sortByRecentActivity(orders.filter((order) => isCustomerRequestRecord(order)));
}

export function getCustomerQuotes(orders = []) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return EMPTY_PORTAL_RECORDS;
  }

  return orders.filter((order) => {
    const quoteStatus = normalizeText(order.quote_status);
    return order.operational_visible === false && Boolean(quoteStatus) && quoteStatus !== "Canceled";
  });
}

export function getCustomerInvoices(orders = []) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return EMPTY_PORTAL_RECORDS;
  }

  return orders.filter((order) => {
    const invoiceStatus = normalizeText(order.invoice_status);
    const balanceDue = Number(order.balance_due || 0);

    if (CUSTOMER_VISIBLE_INVOICE_STATUSES.has(invoiceStatus)) {
      return true;
    }

    return Boolean(invoiceStatus) && invoiceStatus !== "Draft" && balanceDue > 0;
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
