import { getCustomerArtworkActionState, isCustomerArtworkActionRequired } from "../lib/customerArtworkActions";
import { getCustomerPaymentStatusLabel } from "./customerPortalPayments";

const TIMELINE_STEPS = Object.freeze([
  "Request Submitted",
  "Artwork Uploaded",
  "Quote Created",
  "Quote Approved",
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

function hasQuoteApproval(order = {}) {
  const quoteStatus = normalizeText(order.quote_status);
  return (
    ["Approved", "Ready For Production"].includes(quoteStatus) ||
    Boolean(order.approved_at || order.customer_approved_at)
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
    "Quote Created": hasQuote(order),
    "Quote Approved": hasQuoteApproval(order),
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

export function resolvePortalNextAction(order = {}, paymentRequests = []) {
  if (isCustomerArtworkActionRequired(order)) {
    const artworkAction = getCustomerArtworkActionState(order);
    return artworkAction.primaryLabel || "Upload Artwork";
  }

  const quoteStatus = normalizeText(order.quote_status);
  if (["Sent", "Draft"].includes(quoteStatus)) {
    return "Review Quote";
  }
  if (["Awaiting Approval", "Awaiting Artwork Approval"].includes(quoteStatus)) {
    return "Approve Quote";
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

  return "Order In Progress";
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
  const encodedOrderNumber = encodeURIComponent(orderNumber);

  if (isCustomerArtworkActionRequired(order)) {
    const artworkAction = getCustomerArtworkActionState(order);
    return {
      label: artworkAction.primaryLabel || "Upload Artwork",
      to: buildOrderActionRoute(orderNumber, "/artwork"),
    };
  }

  const quoteStatus = normalizeText(order.quote_status);
  if (["Sent", "Draft"].includes(quoteStatus)) {
    return {
      label: "Review Quote",
      to: `/quote/${encodedOrderNumber}`,
    };
  }
  if (["Awaiting Approval", "Awaiting Artwork Approval"].includes(quoteStatus)) {
    return {
      label: "Approve Quote",
      to: `/approval/${encodedOrderNumber}`,
    };
  }

  const openPaymentRequest = resolveOpenPaymentRequest(paymentRequests);
  if (openPaymentRequest) {
    if (normalizeLower(openPaymentRequest.request_type) === "deposit") {
      return {
        label: "Mark Payment Sent",
        to: buildOrderActionRoute(orderNumber, "/deposit"),
      };
    }

    return {
      label: "View Payment Request",
      to: `/portal/payments/${encodeURIComponent(openPaymentRequest.id || "")}`,
    };
  }

  if (hasCompleted(order) || hasReadyForPickup(order) || hasProductionStarted(order)) {
    return {
      label: "View Order Progress",
      to: `${buildOrderActionRoute(orderNumber)}#activity-timeline`,
    };
  }

  return {
    label: "View Order Progress",
    to: `${buildOrderActionRoute(orderNumber)}#activity-timeline`,
  };
}
