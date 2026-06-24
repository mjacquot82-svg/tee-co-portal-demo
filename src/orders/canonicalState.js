import {
  getPaymentEventsByOrder,
  getPaymentRequestsByOrder,
  getPaymentsByOrder,
} from "../lib/paymentsStore";

export const OWNER_PAYMENT_STATES = {
  DEPOSIT_REQUIRED: "Deposit Required",
  AWAITING_PAYMENT: "Awaiting Payment",
  AWAITING_VERIFICATION: "Payment Sent - Awaiting Verification",
  DEPOSIT_RECEIVED: "Deposit Received",
  BALANCE_DUE: "Balance Due",
  PAID: "Paid",
  FAILED: "Payment Failed",
};

export const ORDER_WORKFLOW_STATES = {
  REQUEST_RECEIVED: "Request Received",
  ARTWORK_NEEDED: "Artwork Needed",
  AWAITING_QUOTE_APPROVAL: "Awaiting Quote Approval",
  AWAITING_PAYMENT: "Awaiting Payment",
  READY_FOR_PRODUCTION: "Ready For Production",
  IN_PRODUCTION: "In Production",
  READY_FOR_PICKUP: "Ready For Pickup",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const FAILED_PAYMENT_STATUSES = new Set([
  "failed",
  "declined",
  "voided",
  "canceled",
  "cancelled",
]);
const SUCCESS_PAYMENT_STATUSES = new Set([
  "captured",
  "paid",
  "succeeded",
  "success",
  "settled",
]);
const OPEN_REQUEST_STATUSES = new Set([
  "draft",
  "open",
  "sent",
  "pending",
  "partially_paid",
  "partially paid",
]);
const PAID_REQUEST_STATUSES = new Set(["paid", "complete", "completed"]);
const FAILED_REQUEST_STATUSES = new Set(["failed", "declined", "canceled", "cancelled", "voided"]);
const PRODUCTION_STATUSES = new Set(["printing", "embroidery", "qc / finishing", "qc", "in production"]);
const READY_FOR_PRODUCTION_STATUSES = new Set(["ready for production", "awaiting production"]);
const READY_FOR_PICKUP_STATUSES = new Set(["ready for pickup"]);
const COMPLETED_STATUSES = new Set(["completed", "picked up", "paid"]);
const CANCELLED_STATUSES = new Set(["canceled", "cancelled", "void"]);

function normalizeText(value, fallback = "") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeAmount(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.round(value * 100) / 100) : 0;
  }

  const amount = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

function normalizeList(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value.filter(Boolean);
  }

  return [];
}

function safeStoreLookup(order, lookup) {
  const orderNumber = normalizeText(order?.order_number);
  if (!orderNumber) return [];

  try {
    return lookup(orderNumber);
  } catch {
    return [];
  }
}

function getModernPaymentSources(order = {}) {
  const attachedRequests = normalizeList(order.payment_requests, order.paymentRequests);
  const attachedPayments = normalizeList(order.payments, order.payment_records, order.paymentRecords);
  const attachedEvents = normalizeList(order.payment_events, order.paymentEvents);

  const paymentRequests = attachedRequests.length
    ? attachedRequests
    : safeStoreLookup(order, getPaymentRequestsByOrder);
  const payments = attachedPayments.length ? attachedPayments : safeStoreLookup(order, getPaymentsByOrder);
  const paymentEvents = attachedEvents.length
    ? attachedEvents
    : safeStoreLookup(order, getPaymentEventsByOrder);

  return {
    paymentRequests,
    payments,
    paymentEvents,
    hasModernRecords: paymentRequests.length > 0 || payments.length > 0 || paymentEvents.length > 0,
  };
}

function getLegacyPaymentHistory(order = {}) {
  if (!Array.isArray(order.payment_history)) return [];

  return order.payment_history
    .filter(Boolean)
    .map((payment) => ({
      ...payment,
      amount: normalizeAmount(payment.amount),
      payment_type: normalizeText(payment.payment_type),
      status: normalizeText(payment.status, "captured"),
    }))
    .filter((payment) => payment.amount > 0);
}

function isSuccessfulPayment(payment = {}) {
  const status = normalizeLower(payment.status || payment.provider_status);
  if (!status) return true;
  if (FAILED_PAYMENT_STATUSES.has(status)) return false;
  return SUCCESS_PAYMENT_STATUSES.has(status) || !status.includes("fail");
}

function isFailedPayment(payment = {}) {
  const status = normalizeLower(payment.status || payment.provider_status);
  return FAILED_PAYMENT_STATUSES.has(status) || status.includes("fail") || status.includes("declin");
}

function isDepositPayment(order = {}, payment = {}) {
  const type = normalizeLower(payment.payment_type || payment.request_type);
  const note = normalizeLower(payment.note || payment.summary);
  const id = normalizeLower(payment.id || payment.payment_number);
  const depositAmount = normalizeAmount(order.deposit_amount ?? order.deposit?.amount);
  const amount = normalizeAmount(payment.amount);

  return (
    type === "deposit" ||
    note.includes("deposit") ||
    id.includes("deposit") ||
    (depositAmount > 0 && amount > 0 && amount <= depositAmount)
  );
}

function resolveLegacyTotalPaid(order = {}) {
  const explicitPaid = normalizeAmount(order.total_paid ?? order.amount_paid ?? order.paid_amount);
  if (explicitPaid > 0) return explicitPaid;

  return getLegacyPaymentHistory(order).reduce((sum, payment) => sum + normalizeAmount(payment.amount), 0);
}

function resolveTotalAmount(order = {}) {
  return normalizeAmount(
    order.total_amount ??
      order.total ??
      order.order_total ??
      order.grand_total ??
      order.pricing?.total_amount ??
      order.pricing?.total ??
      order.quote?.total_amount ??
      order.quote?.total
  );
}

function resolveDepositAmount(order = {}) {
  return normalizeAmount(order.deposit_amount ?? order.deposit?.amount);
}

function hasDepositRequirement(order = {}, depositAmount = resolveDepositAmount(order)) {
  const requirement = normalizeLower(order.deposit_requirement || order.deposit_requirement_status);
  const workflowStatus = normalizeLower(order.deposit_workflow_status || order.deposit?.status);

  if (workflowStatus.includes("not required")) return false;
  if (requirement.includes("not required")) return false;
  if (order.deposit_required === true) return true;
  if (requirement === "required") return true;
  return depositAmount > 0;
}

function resolveRequestAmountPaid(request = {}, payments = []) {
  const explicitPaid = normalizeAmount(request.amount_paid);
  if (explicitPaid > 0) return explicitPaid;

  return payments
    .filter((payment) => payment.payment_request_id && payment.payment_request_id === request.id)
    .filter(isSuccessfulPayment)
    .reduce((sum, payment) => sum + normalizeAmount(payment.amount), 0);
}

function getRequestType(request = {}) {
  return normalizeLower(request.request_type || request.payment_type || request.type);
}

function getRequestStatus(request = {}) {
  return normalizeLower(request.status);
}

function isOpenRequest(request = {}) {
  const status = getRequestStatus(request);
  return !status || OPEN_REQUEST_STATUSES.has(status);
}

function isPaidRequest(request = {}) {
  return PAID_REQUEST_STATUSES.has(getRequestStatus(request));
}

function hasFailedEvent(paymentEvents = []) {
  return paymentEvents.some((event) => {
    const type = normalizeLower(event.event_type || event.type);
    const summary = normalizeLower(event.summary || event.note);
    return type.includes("fail") || type.includes("declin") || summary.includes("failed");
  });
}

function hasHighSeverityReconciliationIssue(paymentEvents = []) {
  return paymentEvents.some((event) => {
    const confidence = normalizeLower(event.payload?.payment_confidence);
    const issues = Array.isArray(event.payload?.reconciliation_issues)
      ? event.payload.reconciliation_issues
      : [];
    return (
      confidence === "manual review required" ||
      issues.some((issue) => normalizeLower(issue?.severity) === "high")
    );
  });
}

function hasVerificationPendingPayment(payments = [], paymentEvents = []) {
  const pendingPayment = payments.some((payment) => {
    const status = normalizeLower(payment.status || payment.provider_status);
    return (
      status.includes("pending") ||
      status.includes("review") ||
      status.includes("verif") ||
      Boolean(payment.customer_confirmed_at && !payment.captured_at && !payment.settled_at)
    );
  });
  const pendingEvent = paymentEvents.some((event) => {
    const type = normalizeLower(event.event_type || event.type);
    const summary = normalizeLower(event.summary || event.note);
    return type.includes("verification") || summary.includes("awaiting verification");
  });

  return pendingPayment || pendingEvent;
}

function deriveLegacyPaymentLabel(order = {}) {
  const paymentStatus = normalizeText(order.payment_status);
  const collectionState = normalizeText(order.payment_collection_state);
  const invoiceStatus = normalizeText(order.invoice_status);
  const depositWorkflowStatus = normalizeText(order.deposit_workflow_status || order.deposit?.status);

  if (normalizeLower(paymentStatus).includes("fail")) return OWNER_PAYMENT_STATES.FAILED;
  if (normalizeLower(invoiceStatus) === "paid" || normalizeLower(paymentStatus) === "paid") {
    return OWNER_PAYMENT_STATES.PAID;
  }
  if (normalizeLower(depositWorkflowStatus) === "deposit received") {
    return OWNER_PAYMENT_STATES.DEPOSIT_RECEIVED;
  }
  if (normalizeLower(collectionState).includes("final")) return OWNER_PAYMENT_STATES.BALANCE_DUE;
  if (normalizeLower(paymentStatus).includes("deposit")) return OWNER_PAYMENT_STATES.DEPOSIT_REQUIRED;
  if (collectionState || paymentStatus) {
    return collectionState || paymentStatus;
  }

  return "";
}

export function deriveOrderPaymentState(order = {}) {
  const { paymentRequests, payments, paymentEvents, hasModernRecords } = getModernPaymentSources(order);
  const totalAmount = resolveTotalAmount(order);
  const depositAmount = resolveDepositAmount(order);
  const depositRequired = hasDepositRequirement(order, depositAmount);
  const successfulPayments = payments.filter(isSuccessfulPayment);
  const legacyPayments = hasModernRecords ? [] : getLegacyPaymentHistory(order);
  const totalPaidFromModern = successfulPayments.reduce(
    (sum, payment) => sum + normalizeAmount(payment.amount),
    0
  );
  const totalPaidFromLegacy = legacyPayments.length
    ? legacyPayments.reduce((sum, payment) => sum + normalizeAmount(payment.amount), 0)
    : resolveLegacyTotalPaid(order);
  const totalPaid = normalizeAmount(hasModernRecords ? totalPaidFromModern : totalPaidFromLegacy);
  const depositPaidFromPayments = successfulPayments
    .filter((payment) => isDepositPayment(order, payment))
    .reduce((sum, payment) => sum + normalizeAmount(payment.amount), 0);
  const legacyDepositPaid = legacyPayments
    .filter((payment) => isDepositPayment(order, payment))
    .reduce((sum, payment) => sum + normalizeAmount(payment.amount), 0);
  const depositRequests = paymentRequests.filter((request) => getRequestType(request) === "deposit");
  const balanceRequests = paymentRequests.filter((request) => getRequestType(request) === "balance");
  const openDepositRequest = depositRequests.find(isOpenRequest);
  const openBalanceRequest = balanceRequests.find(isOpenRequest);
  const failed =
    payments.some(isFailedPayment) ||
    paymentRequests.some((request) => FAILED_REQUEST_STATUSES.has(getRequestStatus(request))) ||
    hasFailedEvent(paymentEvents) ||
    hasHighSeverityReconciliationIssue(paymentEvents);
  const depositPaidByRequest = depositRequests.some((request) => {
    const requested = normalizeAmount(request.amount_requested ?? request.amount);
    return isPaidRequest(request) || (requested > 0 && resolveRequestAmountPaid(request, payments) >= requested);
  });
  const legacyDepositStatus = normalizeLower(order.deposit_workflow_status || order.deposit?.status);
  const shouldUseLegacyDepositFallback = !hasModernRecords || (depositRequests.length === 0 && depositPaidFromPayments <= 0);
  const depositSatisfied =
    !depositRequired ||
    depositPaidByRequest ||
    (depositAmount > 0 && (depositPaidFromPayments >= depositAmount || totalPaid >= depositAmount)) ||
    (depositAmount === 0 && depositPaidFromPayments > 0) ||
    (shouldUseLegacyDepositFallback &&
      (legacyDepositStatus === "deposit received" ||
        legacyDepositStatus === "deposit not required" ||
        (depositAmount > 0 && (legacyDepositPaid >= depositAmount || totalPaid >= depositAmount))));
  const inferredTotalAmount = Math.max(totalAmount, normalizeAmount(order.balance_due) + totalPaid);
  const balanceDue = normalizeAmount(
    inferredTotalAmount > 0 ? Math.max(inferredTotalAmount - totalPaid, 0) : order.balance_due
  );
  const balancePaid =
    inferredTotalAmount > 0
      ? totalPaid >= inferredTotalAmount || balanceDue <= 0
      : normalizeLower(order.invoice_status) === "paid" || normalizeLower(order.payment_status) === "paid";
  const awaitingVerification = hasVerificationPendingPayment(payments, paymentEvents);

  let ownerPaymentState = "";
  if (failed) {
    ownerPaymentState = OWNER_PAYMENT_STATES.FAILED;
  } else if (balancePaid && (totalPaid > 0 || normalizeLower(order.invoice_status) === "paid")) {
    ownerPaymentState = OWNER_PAYMENT_STATES.PAID;
  } else if (awaitingVerification) {
    ownerPaymentState = OWNER_PAYMENT_STATES.AWAITING_VERIFICATION;
  } else if (depositRequired && !depositSatisfied) {
    ownerPaymentState = openDepositRequest
      ? OWNER_PAYMENT_STATES.AWAITING_PAYMENT
      : OWNER_PAYMENT_STATES.DEPOSIT_REQUIRED;
  } else if (depositRequired && depositSatisfied && balanceDue > 0) {
    ownerPaymentState = openBalanceRequest
      ? OWNER_PAYMENT_STATES.AWAITING_PAYMENT
      : OWNER_PAYMENT_STATES.BALANCE_DUE;
  } else if (depositRequired && depositSatisfied) {
    ownerPaymentState = OWNER_PAYMENT_STATES.DEPOSIT_RECEIVED;
  } else if (balanceDue > 0 || paymentRequests.some(isOpenRequest)) {
    ownerPaymentState = OWNER_PAYMENT_STATES.AWAITING_PAYMENT;
  } else {
    ownerPaymentState = deriveLegacyPaymentLabel(order) || OWNER_PAYMENT_STATES.AWAITING_PAYMENT;
  }

  return {
    ownerPaymentState,
    payment_state: ownerPaymentState,
    label: ownerPaymentState,
    depositRequired,
    depositSatisfied,
    balancePaid,
    totalPaid,
    totalAmount: inferredTotalAmount,
    balanceDue,
    depositAmount,
    hasFailedPayment: failed,
    awaitingVerification,
    paymentRequests,
    payments: successfulPayments,
    paymentEvents,
    source: hasModernRecords ? "canonical_payments" : "legacy_order_fields",
  };
}

export function isDepositSatisfied(order = {}) {
  return deriveOrderPaymentState(order).depositSatisfied;
}

export function isBalancePaid(order = {}) {
  return deriveOrderPaymentState(order).balancePaid;
}

export function getCurrentPaymentState(order = {}) {
  return deriveOrderPaymentState(order);
}

function isArtworkNeeded(order = {}) {
  const required =
    typeof order.artwork_approval_required === "boolean"
      ? order.artwork_approval_required
      : Array.isArray(order.artwork_files) && order.artwork_files.length > 0;
  const approvalStatus = normalizeLower(order.artwork_approval_status);

  return required && approvalStatus !== "approved" && approvalStatus !== "not required";
}

function isAwaitingQuoteApproval(order = {}) {
  const quoteStatus = normalizeLower(order.quote_status || order.approval_status);
  return (
    quoteStatus.includes("awaiting") ||
    quoteStatus.includes("sent") ||
    quoteStatus.includes("pending approval") ||
    quoteStatus === "pending"
  );
}

export function deriveOrderWorkflowState(order = {}) {
  const status = normalizeLower(order.status || order.workflow_state || order.production_status);
  const quoteStatus = normalizeLower(order.quote_status);
  const paymentState = deriveOrderPaymentState(order);
  let workflowState = ORDER_WORKFLOW_STATES.REQUEST_RECEIVED;

  if (CANCELLED_STATUSES.has(status) || CANCELLED_STATUSES.has(quoteStatus)) {
    workflowState = ORDER_WORKFLOW_STATES.CANCELLED;
  } else if (COMPLETED_STATUSES.has(status)) {
    workflowState = ORDER_WORKFLOW_STATES.COMPLETED;
  } else if (READY_FOR_PICKUP_STATUSES.has(status)) {
    workflowState = ORDER_WORKFLOW_STATES.READY_FOR_PICKUP;
  } else if (PRODUCTION_STATUSES.has(status)) {
    workflowState = ORDER_WORKFLOW_STATES.IN_PRODUCTION;
  } else if (READY_FOR_PRODUCTION_STATUSES.has(status)) {
    workflowState = ORDER_WORKFLOW_STATES.READY_FOR_PRODUCTION;
  } else if (isArtworkNeeded(order)) {
    workflowState = ORDER_WORKFLOW_STATES.ARTWORK_NEEDED;
  } else if (isAwaitingQuoteApproval(order)) {
    workflowState = ORDER_WORKFLOW_STATES.AWAITING_QUOTE_APPROVAL;
  } else if (
    paymentState.hasFailedPayment ||
    paymentState.ownerPaymentState === OWNER_PAYMENT_STATES.DEPOSIT_REQUIRED ||
    paymentState.ownerPaymentState === OWNER_PAYMENT_STATES.AWAITING_PAYMENT ||
    paymentState.ownerPaymentState === OWNER_PAYMENT_STATES.AWAITING_VERIFICATION ||
    (paymentState.depositRequired && !paymentState.depositSatisfied)
  ) {
    workflowState = ORDER_WORKFLOW_STATES.AWAITING_PAYMENT;
  } else if (paymentState.depositSatisfied || paymentState.balancePaid || status === "approved") {
    workflowState = ORDER_WORKFLOW_STATES.READY_FOR_PRODUCTION;
  }

  return {
    workflowState,
    workflow_state: workflowState,
    label: workflowState,
    paymentState,
    source: paymentState.source,
  };
}
