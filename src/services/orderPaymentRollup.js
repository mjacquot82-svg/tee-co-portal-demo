function normalizeText(value, fallback = "") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeAmount(value) {
  const amount = typeof value === "number" ? value : Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

const ACTIVE_QUOTE_STATUSES = new Set(["awaiting deposit", "deposit requested"]);


function resolveOrderTotal(order = {}) {
  return normalizeAmount(
    order.total_amount ||
      order.total ||
      order.order_total ||
      order.grand_total ||
      order.quote?.total_amount ||
      order.quote?.total ||
      order.quote?.summary?.total ||
      order.quote?.totals?.total
  );
}

function resolveDepositAmount(order = {}, paymentRequests = []) {
  const explicitDepositAmount = normalizeAmount(order.deposit_amount || order.deposit?.amount);
  if (explicitDepositAmount > 0) return explicitDepositAmount;

  return paymentRequests
    .filter((request) => normalizeLower(request.request_type || request.payment_type) === "deposit")
    .reduce((total, request) => total + normalizeAmount(request.amount_requested || request.amount), 0);
}

function buildPaymentCollectionState({ totalAmount, totalPaid, depositAmount, balanceDue }) {
  if (totalAmount <= 0) return "Draft";
  if (balanceDue <= 0 && totalPaid > 0) return "Paid";
  if (depositAmount > 0 && totalPaid < depositAmount) return "Awaiting Deposit";
  if (depositAmount > 0 && totalPaid >= depositAmount && balanceDue > 0) return "Awaiting Final Payment";
  return totalPaid > 0 ? "Awaiting Final Payment" : "Awaiting Payment";
}

function resolvePaymentStatus({ totalAmount, totalPaid, depositAmount, depositApplied, balanceDue }) {
  if (totalAmount <= 0) return "Draft";
  if (balanceDue <= 0 && totalPaid > 0) return "Paid";
  if (totalPaid <= 0) return depositAmount > 0 ? "Awaiting Deposit" : "Awaiting Payment";
  if (depositAmount > 0 && totalPaid < depositAmount) return "Awaiting Deposit";
  if (depositAmount > 0 && depositApplied > 0 && totalPaid <= depositAmount) return "Deposit Applied";
  return "Partial Payment";
}

function resolveQuoteStatus(currentStatus, depositOutstanding) {
  const normalizedStatus = normalizeLower(currentStatus);
  if (depositOutstanding <= 0 && ACTIVE_QUOTE_STATUSES.has(normalizedStatus)) {
    return "Approved";
  }
  return normalizeText(currentStatus);
}

export function buildOrderPaymentRollup({ order = {}, paymentRequests = [], payments = [] } = {}) {
  const successfulPayments = payments.filter(isSuccessfulPaymentRecord);
  const hasRefundedPayments = payments.some((payment) => ["refunded", "partially_refunded"].includes(normalizeLower(payment.status || payment.provider_status)));
  const totalPaid = normalizeAmount(
    successfulPayments.reduce((total, payment) => total + normalizeAmount(payment.amount), 0)
  );
  const depositAmount = resolveDepositAmount(order, paymentRequests);
  const depositPaidFromPayments = successfulPayments
    .filter((payment) => normalizeLower(payment.payment_type || payment.request_type) === "deposit")
    .reduce((total, payment) => total + normalizeAmount(payment.amount), 0);
  const depositApplied = depositAmount > 0 ? Math.min(depositAmount, depositPaidFromPayments || totalPaid) : 0;
  const depositOutstanding = normalizeAmount(Math.max(depositAmount - depositApplied, 0));
  const totalAmount = resolveOrderTotal(order);
  const currentBalanceDue = normalizeAmount(order.balance_due);
  const balanceDue = normalizeAmount(
    totalAmount > 0
      ? Math.max(totalAmount - totalPaid, 0)
      : Math.max(currentBalanceDue - totalPaid, 0)
  );
  const paymentCollectionState = buildPaymentCollectionState({
    totalAmount,
    totalPaid,
    depositAmount,
    balanceDue,
  });
  const paymentStatus = resolvePaymentStatus({
    totalAmount,
    totalPaid,
    depositAmount,
    depositApplied,
    balanceDue,
  });
  const depositWorkflowStatus =
    depositAmount <= 0
      ? "Deposit Not Required"
      : depositOutstanding <= 0
        ? "Deposit Received"
        : hasRefundedPayments ? "Awaiting Deposit" : normalizeText(order.deposit_workflow_status, "Awaiting Deposit");

  return {
    total_paid: totalPaid,
    amount_paid: totalPaid,
    paid_to_date: totalPaid,
    deposit_applied: depositApplied,
    deposit_outstanding: depositOutstanding,
    deposit_paid_amount: hasRefundedPayments ? depositApplied : Math.max(normalizeAmount(order.deposit_paid_amount), depositApplied),
    balance_due: balanceDue,
    payment_status: paymentStatus,
    payment_collection_state: paymentCollectionState,
    quote_status: resolveQuoteStatus(order.quote_status, depositOutstanding),
    deposit_workflow_status: depositWorkflowStatus,
    deposit_status: depositWorkflowStatus === "Deposit Received"
      ? "paid"
      : hasRefundedPayments && depositAmount > 0 ? "not_paid" : order.deposit_status || "not_requested",
  };
}
import { isSuccessfulPaymentRecord } from "../lib/paymentStatus";
