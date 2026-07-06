import { buildOrderPaymentRollup } from "./orderPaymentRollup";

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

function isSuccessfulPayment(payment = {}) {
  const status = normalizeLower(payment.status || payment.provider_status);
  if (["failed", "declined", "voided", "canceled", "cancelled"].includes(status)) return false;
  return ["captured", "paid", "succeeded", "success", "settled", "completed"].includes(status);
}

function isSquarePayment(payment = {}) {
  return normalizeLower(payment.provider) === "square" || normalizeText(payment.provider_payment_id);
}

function isManualPayment(payment = {}) {
  return !isSquarePayment(payment);
}

function eventMatchesRequest(event = {}, request = {}) {
  return (
    event.payment_request_id === request.id ||
    (request.order_number && event.order_number === request.order_number)
  );
}

function paymentMatchesRequest(payment = {}, request = {}) {
  return (
    payment.payment_request_id === request.id ||
    (request.order_number && payment.order_number === request.order_number)
  );
}

function getSquareEventIds(events = []) {
  return events.map((event) => normalizeText(event.payload?.square_event_id)).filter(Boolean);
}

export function buildPaymentReconciliationInsights({
  paymentRequest = {},
  payments = [],
  paymentEvents = [],
  reviews = [],
} = {}) {
  const requestPayments = payments.filter((payment) => paymentMatchesRequest(payment, paymentRequest));
  const requestEvents = paymentEvents.filter((event) => eventMatchesRequest(event, paymentRequest));
  const successfulPayments = requestPayments.filter(isSuccessfulPayment);
  const squarePayments = successfulPayments.filter(isSquarePayment);
  const manualPayments = successfulPayments.filter(isManualPayment);
  const amountRequested = normalizeAmount(paymentRequest.amount_requested);
  const totalPaid = successfulPayments.reduce((sum, payment) => sum + normalizeAmount(payment.amount), 0);
  const insights = [];
  const squareEventIds = getSquareEventIds(requestEvents);
  const duplicateEventIds = squareEventIds.filter((eventId, index) => squareEventIds.indexOf(eventId) !== index);
  const squarePaymentIds = requestPayments.map((payment) => normalizeText(payment.provider_payment_id)).filter(Boolean);
  const duplicateSquarePaymentIds = squarePaymentIds.filter((paymentId, index) => squarePaymentIds.indexOf(paymentId) !== index);
  const hasProcessingEvent = requestEvents.some((event) => normalizeLower(event.event_type).includes("processing"));
  const hasSuccessfulSquarePayment = squarePayments.length > 0;
  const hasFailureEvent = requestEvents.some((event) => {
    const eventType = normalizeLower(event.event_type);
    return eventType.includes("failed") || eventType.includes("canceled");
  });
  const webhookFailures = requestEvents.filter((event) => normalizeLower(event.event_type) === "square_webhook_processing_failed");
  const explicitIssues = requestEvents.flatMap((event) =>
    event.event_source === "square_webhook" && Array.isArray(event.payload?.reconciliation_issues)
      ? event.payload.reconciliation_issues
      : []
  );

  duplicateEventIds.forEach((eventId) => {
    insights.push({
      code: "duplicate_webhook",
      severity: "medium",
      label: "Duplicate Webhook Delivery",
      detail: `Square event ${eventId} appeared more than once.`,
    });
  });

  duplicateSquarePaymentIds.forEach((paymentId) => {
    insights.push({
      code: "duplicate_square_payment_id",
      severity: "high",
      label: "Duplicate Payment Detected",
      detail: `Square payment ${paymentId} appears on more than one payment record.`,
    });
  });

  if (manualPayments.length && squarePayments.length) {
    insights.push({
      code: "manual_square_conflict",
      severity: "high",
      label: "Manual Review Required",
      detail: "Manual and Square payments are both connected to this request or order.",
    });
  }

  if (amountRequested > 0 && totalPaid > amountRequested + 0.009) {
    insights.push({
      code: "overpayment",
      severity: "high",
      label: "Overpayment",
      detail: `Recorded successful payments exceed the requested amount by $${(totalPaid - amountRequested).toFixed(2)}.`,
    });
  }

  if (
    amountRequested > 0 &&
    squarePayments.length === 1 &&
    manualPayments.length === 0 &&
    Math.abs(normalizeAmount(squarePayments[0].amount) - amountRequested) > 0.009
  ) {
    insights.push({
      code: "payment_mismatch",
      severity: "high",
      label: "Payment Mismatch",
      detail: `Square recorded ${normalizeAmount(squarePayments[0].amount).toFixed(2)} against a ${amountRequested.toFixed(2)} request.`,
    });
  }

  webhookFailures.forEach((event) => {
    insights.push({
      code: "webhook_processing_failed",
      severity: "high",
      label: "Webhook Processing Failed",
      detail: event.payload?.error_message || "Square webhook processing failed and should be retried.",
    });
  });

  if (hasFailureEvent && hasSuccessfulSquarePayment) {
    insights.push({
      code: "failed_event_after_success",
      severity: "medium",
      label: "Stale Webhook Ignored",
      detail: "A failed or canceled Square event exists alongside a successful Square payment.",
    });
  }

  if (hasProcessingEvent && !hasSuccessfulSquarePayment && normalizeLower(paymentRequest.status) !== "failed") {
    insights.push({
      code: "awaiting_webhook_confirmation",
      severity: "low",
      label: "Awaiting Webhook Confirmation",
      detail: "Square has reported payment activity, but no successful payment has been recorded yet.",
    });
  }

  explicitIssues.forEach((issue) => {
    insights.push({
      code: normalizeText(issue.code, "square_reconciliation_issue"),
      severity: normalizeText(issue.severity, "medium"),
      label: normalizeText(issue.label, "Manual Review Required"),
      detail: normalizeText(issue.detail, "Square reported a payment reconciliation issue."),
    });
  });

  if (!insights.length && hasSuccessfulSquarePayment) {
    insights.push({
      code: "payment_verified",
      severity: "info",
      label: "Payment Verified",
      detail: "A Square payment has been recorded and no reconciliation issues were detected.",
    });
  }

  return insights.map((insight) => {
    const review = reviews.find(
      (entry) =>
        entry.payment_request_id === paymentRequest.id &&
        entry.issue_code === insight.code
    );
    return {
      ...insight,
      reviewed: Boolean(review),
      reviewAction: review?.action || "",
      reviewedAt: review?.reviewed_at || "",
      reviewNote: review?.note || "",
    };
  });
}

export function getPaymentConfidenceLabel(insights = [], paymentRequest = {}) {
  const activeInsights = insights.filter((insight) => !insight.reviewed || insight.reviewAction === "mark_reviewed");
  if (activeInsights.some((insight) => insight.severity === "high")) return "Manual Review Required";
  if (activeInsights.some((insight) => insight.code === "duplicate_webhook")) return "Duplicate Payment Detected";
  if (activeInsights.some((insight) => insight.code === "awaiting_webhook_confirmation")) return "Awaiting Webhook Confirmation";
  if (insights.some((insight) => insight.code === "payment_verified")) return "Payment Verified";
  if (normalizeLower(paymentRequest.status) === "processing") return "Awaiting Webhook Confirmation";
  if (normalizeLower(paymentRequest.status) === "failed") return "Manual Review Required";
  return "No Provider Activity";
}

export function getInsightTone(insight = {}) {
  if (insight.reviewed && insight.reviewAction !== "mark_reviewed") return "success";
  if (insight.severity === "high") return "danger";
  if (insight.severity === "medium") return "warning";
  if (insight.severity === "low") return "warning";
  return "success";
}

export function isActionableReconciliationInsight(insight = {}) {
  if (insight.code === "payment_verified") return false;
  if (insight.reviewed && ["resolve_duplicate", "ignore_false_positive"].includes(insight.reviewAction)) return false;
  return true;
}

export function buildPaymentExceptionQueue({
  paymentRequests = [],
  payments = [],
  paymentEvents = [],
  reviews = [],
} = {}) {
  return paymentRequests.flatMap((paymentRequest) => {
    const insights = buildPaymentReconciliationInsights({
      paymentRequest,
      payments,
      paymentEvents,
      reviews,
    }).filter(isActionableReconciliationInsight);
    const confidence = getPaymentConfidenceLabel(insights, paymentRequest);

    return insights.map((insight) => ({
      id: `${paymentRequest.id}-${insight.code}-${insight.detail}`,
      paymentRequest,
      insight,
      confidence,
    }));
  });
}

export function buildOrderPaymentReconciliationUpdates({
  order = {},
  paymentRequests = [],
  payments = [],
} = {}) {
  const orderNumber = normalizeText(order.order_number);
  if (!orderNumber) return null;

  const relatedPaymentRequests = paymentRequests.filter((request) => request.order_number === orderNumber);
  const relatedPayments = payments.filter((payment) => payment.order_number === orderNumber);
  if (!relatedPaymentRequests.length && !relatedPayments.some(isSuccessfulPayment)) return null;

  const rollup = buildOrderPaymentRollup({
    order,
    paymentRequests: relatedPaymentRequests,
    payments: relatedPayments,
  });
  const keys = [
    "total_paid",
    "amount_paid",
    "paid_to_date",
    "deposit_applied",
    "deposit_outstanding",
    "deposit_paid_amount",
    "balance_due",
    "payment_status",
    "payment_collection_state",
    "quote_status",
    "deposit_workflow_status",
    "deposit_status",
  ];
  const updates = {};

  keys.forEach((key) => {
    const nextValue = rollup[key];
    const currentValue = order[key];
    const changed =
      typeof nextValue === "number"
        ? normalizeAmount(currentValue) !== nextValue
        : normalizeText(currentValue) !== normalizeText(nextValue);

    if (changed) updates[key] = nextValue;
  });

  return Object.keys(updates).length ? updates : null;
}
