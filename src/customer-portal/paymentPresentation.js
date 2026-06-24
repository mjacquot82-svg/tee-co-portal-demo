import { customerIdsEqual, normalizeCustomerId } from "../lib/customerIds";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeAmount(value) {
  const amount =
    typeof value === "number" ? value : Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

function normalizeStatus(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, "_");
}

export function formatPaymentRequestType(requestType) {
  const normalized = normalizeStatus(requestType);
  if (normalized === "deposit") return "Deposit";
  if (normalized === "balance") return "Balance";
  if (normalized === "full_payment") return "Full Payment";
  if (normalized === "custom_amount" || normalized === "custom") return "Custom";
  return "Payment";
}

export function getPaymentRequestRemainingAmount(paymentRequest = {}) {
  return Math.max(
    0,
    normalizeAmount(paymentRequest.amount_requested) - normalizeAmount(paymentRequest.amount_paid)
  );
}

export function getCustomerPaymentStatusLabel(paymentRecord = {}) {
  const status = normalizeStatus(paymentRecord.status);

  if (status.includes("refund")) return "Refunded";
  if (["cancelled", "canceled", "void", "voided", "failed"].includes(status)) return "Cancelled";
  if (["processing", "pending", "authorized"].includes(status)) return "Processing";
  if (["captured", "settled", "paid", "completed", "succeeded"].includes(status)) return "Paid";

  return "Processing";
}

export function getCustomerPaymentRequestStatusLabel(paymentRequest = {}) {
  const status = normalizeStatus(paymentRequest.status);
  const amountRequested = normalizeAmount(paymentRequest.amount_requested);
  const amountPaid = normalizeAmount(paymentRequest.amount_paid);

  if (status.includes("refund")) return "Refunded";
  if (["cancelled", "canceled", "void", "voided", "failed"].includes(status)) return "Cancelled";
  if (amountRequested > 0 && amountPaid >= amountRequested) return "Paid";
  if (amountPaid > 0) return "Partially Paid";
  if (["processing", "pending", "draft"].includes(status)) return "Processing";

  return "Awaiting Payment";
}

export function getCustomerPaymentRequestSortGroup(paymentRequest = {}) {
  const label = getCustomerPaymentRequestStatusLabel(paymentRequest);
  if (label === "Awaiting Payment") return 0;
  if (label === "Partially Paid") return 1;
  if (label === "Processing") return 2;
  if (label === "Paid") return 3;
  if (label === "Refunded") return 4;
  return 5;
}

export function buildPortalPaymentSummary(paymentRequests = [], payments = []) {
  const amountOwing = paymentRequests.reduce(
    (total, paymentRequest) =>
      ["Awaiting Payment", "Partially Paid", "Processing"].includes(
        getCustomerPaymentRequestStatusLabel(paymentRequest)
      )
        ? total + getPaymentRequestRemainingAmount(paymentRequest)
        : total,
    0
  );
  const totalPaid = payments.reduce(
    (total, payment) =>
      getCustomerPaymentStatusLabel(payment) === "Paid" ? total + normalizeAmount(payment.amount) : total,
    0
  );
  const openRequestCount = paymentRequests.filter((paymentRequest) =>
    ["Awaiting Payment", "Partially Paid", "Processing"].includes(
      getCustomerPaymentRequestStatusLabel(paymentRequest)
    )
  ).length;

  let overallStatus = "No Outstanding Balance";
  if (amountOwing > 0 && totalPaid > 0) {
    overallStatus = "Partially Paid";
  } else if (amountOwing > 0) {
    overallStatus = "Awaiting Payment";
  } else if (totalPaid > 0) {
    overallStatus = "Paid";
  }

  return {
    openRequestCount,
    amountOwing,
    totalPaid,
    overallStatus,
  };
}

export function filterCustomerPaymentRecords(records = [], { customerIds = [], orderNumbers = [] } = {}) {
  const normalizedCustomerIds = customerIds
    .map((value) => normalizeCustomerId(value))
    .filter(Boolean);
  const normalizedOrderNumbers = new Set(orderNumbers.map((value) => normalizeText(value)).filter(Boolean));

  return records.filter((record) => {
    const recordCustomerId = normalizeCustomerId(record.customer_id);
    const recordOrderNumber = normalizeText(record.order_number);

    if (
      recordCustomerId &&
      normalizedCustomerIds.some((customerId) => customerIdsEqual(customerId, recordCustomerId))
    ) {
      return true;
    }

    return Boolean(recordOrderNumber) && normalizedOrderNumbers.has(recordOrderNumber);
  });
}

export function buildPortalOrderHref(orderNumber) {
  const normalizedOrderNumber = normalizeText(orderNumber);
  return normalizedOrderNumber
    ? `/portal/orders#portal-order-${encodeURIComponent(normalizedOrderNumber)}`
    : "/portal/orders";
}

export function buildPortalPaymentRequestHref(requestId) {
  return `/portal/payments/${encodeURIComponent(normalizeText(requestId))}`;
}
