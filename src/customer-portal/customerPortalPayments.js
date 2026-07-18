function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeAmount(value) {
  const amount = typeof value === "number" ? value : Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

function sortByRecentActivity(records = []) {
  if (!Array.isArray(records) || records.length === 0) {
    return [];
  }

  return [...records].sort((left, right) => {
    const leftTimestamp = new Date(left?.updated_at || left?.created_at || 0).getTime();
    const rightTimestamp = new Date(right?.updated_at || right?.created_at || 0).getTime();
    return rightTimestamp - leftTimestamp;
  });
}

export function formatPaymentRequestType(requestType) {
  const normalizedType = normalizeText(requestType).toLowerCase();

  if (normalizedType === "deposit") return "Deposit";
  if (normalizedType === "balance") return "Balance";
  if (normalizedType === "full_payment" || normalizedType === "full") return "Full Payment";
  if (normalizedType === "custom") return "Custom";

  return normalizeText(requestType)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase()) || "Custom";
}

export function formatPaymentMethod(method) {
  const normalizedMethod = normalizeText(method).replace(/_/g, " ");
  return normalizedMethod.replace(/\b\w/g, (character) => character.toUpperCase()) || "Manual";
}

export function getRemainingPaymentAmount(paymentRequest = {}) {
  return Math.max(
    0,
    normalizeAmount(paymentRequest.amount_requested) - normalizeAmount(paymentRequest.amount_paid)
  );
}

export function getCustomerPaymentDueLabel(paymentRequest = {}) {
  return normalizeText(paymentRequest.request_type).toLowerCase() === "deposit"
    ? "Deposit Due"
    : "Amount Due Today";
}

export function getEstimatedBalanceAfterPayment(orderBalance, paymentRequest = {}) {
  return Math.max(0, normalizeAmount(orderBalance) - getRemainingPaymentAmount(paymentRequest));
}

export function getCustomerPaymentStatusLabel(record = {}) {
  const rawStatus = normalizeText(record.status).toLowerCase();
  const amountRequested = normalizeAmount(record.amount_requested);
  const amountPaid =
    record.amount_requested != null
      ? normalizeAmount(record.amount_paid)
      : normalizeAmount(record.amount);

  if ((amountRequested > 0 && amountPaid >= amountRequested) || ["paid", "captured", "settled", "completed", "succeeded"].includes(rawStatus)) {
    return "Paid";
  }

  if (
    (amountRequested > 0 && amountPaid > 0) ||
    ["partially_paid", "partial", "partial_payment", "deposit_applied", "deposit_paid"].includes(rawStatus)
  ) {
    return "Partially Paid";
  }

  if (["processing", "pending", "authorized", "in_progress"].includes(rawStatus)) {
    return "Processing";
  }

  if (["failed", "declined"].includes(rawStatus)) {
    return "Payment Failed";
  }

  if (["cancelled", "canceled", "voided", "expired"].includes(rawStatus)) {
    return "Cancelled";
  }

  if (["refunded", "refund_pending", "partially_refunded"].includes(rawStatus)) {
    return "Refunded";
  }

  return "Awaiting Payment";
}

export function getCustomerPaymentStatusTone(statusLabel) {
  if (statusLabel === "Paid") return "success";
  if (statusLabel === "Partially Paid" || statusLabel === "Processing") return "warning";
  if (statusLabel === "Payment Failed") return "danger";
  if (statusLabel === "Cancelled" || statusLabel === "Refunded") return "neutral";
  return "info";
}

export function isSuccessfulCustomerPayment(payment = {}) {
  const rawStatus = normalizeText(payment.status).toLowerCase();
  return !["failed", "voided", "declined", "canceled", "cancelled", "refunded"].includes(rawStatus);
}

export function isOpenCustomerPaymentRequest(paymentRequest = {}) {
  const statusLabel = getCustomerPaymentStatusLabel(paymentRequest);
  return !["Paid", "Cancelled", "Refunded"].includes(statusLabel);
}

function matchesCustomerScope(record = {}, orderNumbers, customerIds) {
  const orderNumber = normalizeText(record.order_number);
  const customerId = normalizeText(record.customer_id);

  return orderNumbers.has(orderNumber) || customerIds.has(customerId);
}

function resolveAccountPaymentStatus({ openPaymentRequests, totalPaid, allPaymentRequests }) {
  if (openPaymentRequests.some((request) => getCustomerPaymentStatusLabel(request) === "Processing")) {
    return "Processing";
  }

  if (openPaymentRequests.some((request) => getCustomerPaymentStatusLabel(request) === "Partially Paid")) {
    return "Partially Paid";
  }

  if (openPaymentRequests.length && totalPaid > 0) {
    return "Partially Paid";
  }

  if (openPaymentRequests.length) {
    return "Awaiting Payment";
  }

  if (allPaymentRequests.some((request) => getCustomerPaymentStatusLabel(request) === "Refunded")) {
    return "Refunded";
  }

  if (allPaymentRequests.some((request) => getCustomerPaymentStatusLabel(request) === "Cancelled")) {
    return "Cancelled";
  }

  if (totalPaid > 0 || allPaymentRequests.some((request) => getCustomerPaymentStatusLabel(request) === "Paid")) {
    return "Paid";
  }

  return "No Balance Due";
}

export function getCustomerPortalPaymentData({
  orders = [],
  customerIds = [],
  paymentRequests = [],
  payments = [],
  paymentEvents = [],
} = {}) {
  const orderNumbers = new Set(
    (Array.isArray(orders) ? orders : [])
      .map((order) => normalizeText(order.order_number))
      .filter(Boolean)
  );
  const scopedCustomerIds = new Set(
    (Array.isArray(customerIds) ? customerIds : []).map((customerId) => normalizeText(customerId)).filter(Boolean)
  );

  const scopedPaymentRequests = sortByRecentActivity(
    paymentRequests.filter((paymentRequest) =>
      matchesCustomerScope(paymentRequest, orderNumbers, scopedCustomerIds)
    )
  );
  const scopedPayments = sortByRecentActivity(
    payments.filter((payment) => matchesCustomerScope(payment, orderNumbers, scopedCustomerIds))
  );
  const requestIds = new Set(scopedPaymentRequests.map((paymentRequest) => paymentRequest.id));
  const paymentIds = new Set(scopedPayments.map((payment) => payment.id));
  const scopedPaymentEvents = sortByRecentActivity(
    paymentEvents.filter((event) => {
      const orderNumber = normalizeText(event.order_number);
      return (
        orderNumbers.has(orderNumber) ||
        requestIds.has(event.payment_request_id) ||
        paymentIds.has(event.payment_id)
      );
    })
  );
  const openPaymentRequests = scopedPaymentRequests.filter(isOpenCustomerPaymentRequest);
  const amountOwing = openPaymentRequests.reduce(
    (total, paymentRequest) => total + getRemainingPaymentAmount(paymentRequest),
    0
  );
  const totalPaid = scopedPayments
    .filter(isSuccessfulCustomerPayment)
    .reduce((total, payment) => total + normalizeAmount(payment.amount), 0);
  const paymentStatus = resolveAccountPaymentStatus({
    openPaymentRequests,
    totalPaid,
    allPaymentRequests: scopedPaymentRequests,
  });

  return {
    paymentRequests: scopedPaymentRequests,
    openPaymentRequests,
    payments: scopedPayments,
    paymentEvents: scopedPaymentEvents,
    amountOwing,
    totalPaid,
    paymentStatus,
  };
}

export function findPaymentRequestForOrder(paymentRequests = [], orderNumber, requestType) {
  const normalizedOrderNumber = normalizeText(orderNumber);
  const normalizedRequestType = normalizeText(requestType).toLowerCase();

  if (!normalizedOrderNumber) {
    return null;
  }

  return (
    paymentRequests.find((paymentRequest) => {
      const requestOrderNumber = normalizeText(paymentRequest.order_number);
      const requestRequestType = normalizeText(paymentRequest.request_type).toLowerCase();

      if (requestOrderNumber !== normalizedOrderNumber) {
        return false;
      }

      if (!normalizedRequestType) {
        return true;
      }

      return requestRequestType === normalizedRequestType;
    }) || null
  );
}
