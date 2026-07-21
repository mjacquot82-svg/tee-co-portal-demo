import { getCustomerArtworkActionState, isCustomerArtworkActionRequired } from "../lib/customerArtworkActions";
import { getCustomerPaymentStatusLabel } from "./customerPortalPayments";
import { resolveCustomerOrderMilestone } from "./customerOrderMilestones";

const TIMELINE_STEPS = Object.freeze([
  "Request Submitted",
  "Artwork Uploaded",
  "Order Review Started",
  "Order Approved",
  "Payment Requested",
  "Payment Received",
  "Production Started",
  "Ready For Pickup",
  "Completed",
]);

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function hasQuote(order = {}) {
  return Boolean(normalizeText(order.quote_status));
}

function hasOrderApproval(order = {}) {
  const quoteStatus = normalizeText(order.quote_status);
  const staffApproval = normalizeLower(order.staff_review_status || order.approval_status);
  return (
    staffApproval === "approved" ||
    ["Approved", "Ready For Production"].includes(quoteStatus) ||
    Boolean(order.approved_at)
  );
}

function hasSuccessfulPayment(payments = [], paymentEvents = []) {
  const paidFromPayments = payments.some((payment) => {
    const status = normalizeLower(payment.status);
    return ["captured", "settled", "completed", "paid", "succeeded"].includes(status);
  });

  if (paidFromPayments) return true;

  return paymentEvents.some((event) => {
    const type = normalizeLower(event.event_type);
    return ["payment_recorded", "payment_received", "payment_captured", "payment_settled"].includes(type);
  });
}

function hasProductionStarted(order = {}) {
  const status = normalizeText(order.status);
  return (
    ["Printing", "Embroidery", "QC / Finishing", "Ready For Pickup", "Completed"].includes(status) ||
    Boolean(order.production_started_at)
  );
}

function hasReadyForPickup(order = {}) {
  return (
    normalizeText(order.pickup_status) === "Ready for Pickup" ||
    ["Ready For Pickup", "Completed"].includes(normalizeText(order.status))
  );
}

function hasCompleted(order = {}) {
  return (
    normalizeText(order.pickup_status) === "Picked Up" ||
    normalizeText(order.status) === "Completed"
  );
}

export function buildPortalOrderTimeline(order = {}, paymentRequests = [], payments = [], paymentEvents = []) {
  const milestones = {
    "Request Submitted": Boolean(order.created_at || order.date),
    "Artwork Uploaded":
      (Array.isArray(order.artwork_files) && order.artwork_files.length > 0) ||
      Boolean(order.customer_artwork_id),
    "Order Review Started": hasQuote(order),
    "Order Approved": hasOrderApproval(order),
    "Payment Requested": paymentRequests.length > 0,
    "Payment Received": hasSuccessfulPayment(payments, paymentEvents),
    "Production Started": hasProductionStarted(order),
    "Ready For Pickup": hasReadyForPickup(order),
    Completed: hasCompleted(order),
  };

  return TIMELINE_STEPS.map((label) => ({
    label,
    complete: Boolean(milestones[label]),
  }));
}

export function resolveCustomerQuoteStatus(order = {}) {
  return resolveCustomerOrderMilestone(order).label;
}

export function resolveCustomerQuoteApprovalStatus(order = {}) {
  return hasOrderApproval(order) ? "No action required" : "Tee & Co review in progress";
}

export function resolvePortalNextAction(order = {}, paymentRequests = []) {
  if (isCustomerArtworkActionRequired(order)) {
    const artworkAction = getCustomerArtworkActionState(order);
    return artworkAction.primaryLabel || "Upload Artwork";
  }

  const openPaymentRequest = paymentRequests.find((request) => {
    const status = getCustomerPaymentStatusLabel(request);
    return !["Paid", "Cancelled", "Refunded"].includes(status);
  });
  if (openPaymentRequest) {
    return "View Payment Request";
  }

  if (hasCompleted(order)) {
    return "Completed";
  }

  if (hasReadyForPickup(order)) {
    return "Ready For Pickup";
  }

  if (hasProductionStarted(order) || normalizeText(order.status) === "Ready For Production") {
    return "Awaiting Production";
  }

  return resolveCustomerOrderMilestone(order).label;
}

function buildOrderActionRoute(orderNumber, pathSuffix = "") {
  return `/portal/orders/${encodeURIComponent(orderNumber || "")}${pathSuffix}`;
}

function resolveOpenPaymentRequest(paymentRequests = []) {
  return paymentRequests.find((request) => {
    const status = getCustomerPaymentStatusLabel(request);
    return !["Paid", "Cancelled", "Refunded"].includes(status);
  });
}

export function resolvePortalNextActionDetails(order = {}, paymentRequests = []) {
  const orderNumber = order.order_number || order.id || "";

  if (isCustomerArtworkActionRequired(order)) {
    const artworkAction = getCustomerArtworkActionState(order);
    return {
      actionType: "artwork",
      label: artworkAction.primaryLabel || "Upload Artwork",
      to: buildOrderActionRoute(orderNumber, "/artwork"),
    };
  }

  const openPaymentRequest = resolveOpenPaymentRequest(paymentRequests);
  if (openPaymentRequest) {
    if (normalizeLower(openPaymentRequest.request_type) === "deposit") {
      if (openPaymentRequest.provider_checkout_url) {
        return {
          actionType: "payment_request",
          label: "View Payment Request",
          to: `/portal/payments/${encodeURIComponent(openPaymentRequest.id || "")}`,
        };
      }

      return {
        actionType: "payment_sent_confirmation",
        label: "Mark Payment Sent",
        to: buildOrderActionRoute(orderNumber, "/deposit"),
      };
    }

    return {
      actionType: "payment_request",
      label: "View Payment Request",
      to: `/portal/payments/${encodeURIComponent(openPaymentRequest.id || "")}`,
    };
  }

  return {
    actionType: "order_progress",
    label: "View Order Progress",
    to: `${buildOrderActionRoute(orderNumber)}#activity-timeline`,
  };
}

export function resolvePortalOrderAttention(order = {}, paymentRequests = []) {
  const nextAction = resolvePortalNextActionDetails(order, paymentRequests);
  const actionType = nextAction.actionType;

  if (actionType === "artwork") {
    return {
      tone: "warning",
      label: nextAction.label || "Upload Artwork",
      requiresAction: true,
    };
  }

  if (actionType === "payment_sent_confirmation") {
    return {
      tone: "warning",
      label: "Pay Deposit",
      requiresAction: true,
    };
  }

  if (actionType === "payment_request") {
    const openPaymentRequest = resolveOpenPaymentRequest(paymentRequests);
    const requestType = normalizeLower(openPaymentRequest?.request_type);
    return {
      tone: "warning",
      label: requestType === "deposit" ? "Pay Deposit" : "Pay Balance",
      requiresAction: true,
    };
  }

  if (hasCompleted(order)) {
    return {
      tone: "success",
      label: "Completed",
      requiresAction: false,
    };
  }

  if (hasReadyForPickup(order)) {
    return {
      tone: "success",
      label: "Ready For Pickup",
      requiresAction: false,
    };
  }

  if (hasProductionStarted(order) || normalizeText(order.status) === "Ready For Production") {
    return {
      tone: "info",
      label: normalizeText(order.status) === "Ready For Production" ? "Preparing for Production" : "In Production",
      requiresAction: false,
    };
  }

  return {
    tone: "neutral",
    label: "No Action Required",
    requiresAction: false,
  };
}

export function buildPortalOrderCardSummary(order = {}, paymentRequests = []) {
  const attention = resolvePortalOrderAttention(order, paymentRequests);
  const artworkAction = getCustomerArtworkActionState(order);
  const readyForPickup = hasReadyForPickup(order) && !hasCompleted(order);
  const completed = hasCompleted(order);
  const canceled = [order.status, order.quote_status].some(
    (value) => normalizeLower(value) === "canceled"
  );
  const openPaymentRequest = resolveOpenPaymentRequest(paymentRequests);
  const invoiceStatus = normalizeLower(order.invoice_status);
  const paymentOutstanding = Boolean(openPaymentRequest) || [
    "awaiting deposit",
    "awaiting payment",
    "awaiting final payment",
    "sent",
    "overdue",
  ].includes(invoiceStatus) || normalizeLower(order.quote_status) === "awaiting deposit";
  const customerActionRequired = attention.requiresAction || readyForPickup;

  let ownership = {
    tone: attention.tone,
    label: attention.requiresAction ? `Your action: ${attention.label}` : "No action required",
    requiresAction: attention.requiresAction,
  };

  if (readyForPickup) {
    ownership = {
      tone: "success",
      label: "Your action: Pick up your order",
      requiresAction: true,
    };
  } else if (completed) {
    ownership = { tone: "success", label: "Order complete", requiresAction: false };
  } else if (canceled) {
    ownership = { tone: "neutral", label: "No action required", requiresAction: false };
  }

  const indicators = [];
  if (paymentOutstanding) {
    indicators.push({ key: "payment", label: "Payment outstanding", tone: "warning" });
  }
  if (artworkAction.required) {
    indicators.push({ key: "artwork", label: "Artwork required", tone: "warning" });
  }
  if (readyForPickup) {
    indicators.push({ key: "pickup", label: "Ready for pickup", tone: "success" });
  }

  return {
    attention,
    ownership,
    customerActionRequired,
    teeAndCoWorking: !customerActionRequired && !completed && !canceled,
    paymentOutstanding,
    artworkRequired: artworkAction.required,
    readyForPickup,
    indicators,
  };
}
