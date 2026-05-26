import {
  isCanceledOperationalStatus,
  isCompletedOperationalStatus,
} from "../orders/orderWorkflow";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeName(value) {
  return normalizeText(value).replace(/\s+/g, " ").toLowerCase();
}

function sortByRecentActivity(records = []) {
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
  if (!session) return [];

  const profile = findCustomerProfileForSession(session, customers);
  const sessionEmail = normalizeEmail(session.email);
  const customerIds = new Set(
    [profile?.id, profile?.customer_id].map((value) => normalizeText(value)).filter(Boolean)
  );

  return sortByRecentActivity(
    orders.filter((order) => {
      const orderCustomerId = normalizeText(order.customer_id);
      const orderCustomerEmail = normalizeEmail(order.customer_email);

      if (sessionEmail && orderCustomerEmail && orderCustomerEmail === sessionEmail) {
        return true;
      }

      if (orderCustomerId && customerIds.has(orderCustomerId)) {
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
  return orders.filter((order) => {
    const quoteStatus = normalizeText(order.quote_status);
    return Boolean(quoteStatus) && quoteStatus !== "Canceled";
  });
}

export function getCustomerInvoices(orders = []) {
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
  return orders.reduce(
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
    {
      orderCount: 0,
      outstandingBalance: 0,
      totalValue: 0,
      readyForPickupCount: 0,
      overdueInvoiceCount: 0,
    }
  );
}
