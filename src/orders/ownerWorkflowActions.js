import {
  deriveOrderPaymentState,
  deriveOrderWorkflowState,
  ORDER_WORKFLOW_STATES,
  OWNER_PAYMENT_STATES,
} from "./canonicalState";
import { buildProductionGatingState } from "./workflowGating";

function normalizeText(value, fallback = "") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function getOpenPaymentRequest(paymentState = {}) {
  return (paymentState.paymentRequests || []).find((request) => {
    const status = normalizeLower(request.status);
    return !["paid", "complete", "completed", "failed", "declined", "canceled", "cancelled", "voided"].includes(status);
  });
}

function getOrderHref(order = {}) {
  const orderNumber = normalizeText(order.order_number);
  return orderNumber ? `/admin/orders/${orderNumber}` : "";
}

function getQuoteHref(order = {}) {
  const orderNumber = normalizeText(order.order_number);
  return orderNumber ? `/admin/quotes/${orderNumber}` : "";
}

function getCustomerHref(record = {}) {
  const customerId = normalizeText(record.customer_id);
  return customerId ? `/admin/customers/${customerId}` : "";
}

function getPaymentRequestHref(request = {}) {
  const identifier = normalizeText(request.id || request.request_number);
  return identifier ? `/admin/financial/requests/${identifier}` : "";
}

function buildAction({
  label,
  detail,
  tone = "info",
  href = "",
  actionKey = "",
  actionLabel = "",
  secondary = [],
  blockers = [],
}) {
  return {
    label,
    detail,
    tone,
    href,
    actionKey,
    actionLabel: actionLabel || label,
    secondary: secondary.filter((item) => item?.label && (item.href || item.actionKey)),
    blockers,
  };
}

export function deriveOwnerOrderNextAction(order = {}) {
  const paymentState = deriveOrderPaymentState(order);
  const workflowState = deriveOrderWorkflowState(order);
  const productionGating = buildProductionGatingState(order, { targetStatus: "Ready For Production" });
  const openPaymentRequest = getOpenPaymentRequest(paymentState);
  const customerHref = getCustomerHref(order);
  const orderHref = getOrderHref(order);
  const paymentHref = getPaymentRequestHref(openPaymentRequest);

  if (workflowState.workflowState === ORDER_WORKFLOW_STATES.CANCELLED) {
    return buildAction({
      label: "Review canceled record",
      detail: "This order is canceled. Keep payment and production history available for reference.",
      tone: "neutral",
      href: orderHref,
    });
  }

  if (workflowState.workflowState === ORDER_WORKFLOW_STATES.COMPLETED) {
    return buildAction({
      label: "Review completed order",
      detail: "No immediate owner action is required.",
      tone: "success",
      href: orderHref,
      secondary: [{ label: "View Customer", href: customerHref }],
    });
  }

  if (paymentState.ownerPaymentState === OWNER_PAYMENT_STATES.FAILED) {
    return buildAction({
      label: "Review failed payment",
      detail: "Payment failed or was declined. Open the payment workspace before moving production forward.",
      tone: "danger",
      href: "/admin/financial",
      secondary: [{ label: "Open Order", href: orderHref }],
    });
  }

  if (paymentState.ownerPaymentState === OWNER_PAYMENT_STATES.AWAITING_VERIFICATION) {
    return buildAction({
      label: "Verify payment",
      detail: "A payment has been sent but still needs owner verification before the workflow can advance.",
      tone: "warning",
      href: "/admin/financial",
      secondary: [{ label: "Open Order", href: orderHref }],
    });
  }

  if (paymentState.depositRequired && !paymentState.depositSatisfied) {
    return buildAction({
      label: openPaymentRequest ? "Send or follow up on payment request" : "Create deposit payment request",
      detail: openPaymentRequest
        ? "A payment request exists. Complete customer outreach or follow up from the request record."
        : "Deposit is required before production. Create the request from this order before releasing production.",
      tone: "warning",
      href: paymentHref || orderHref,
      actionKey: openPaymentRequest ? "" : "create_payment_request",
      actionLabel: openPaymentRequest ? "Open Payment Request" : "Create Request Here",
      secondary: [
        { label: "Open Order", href: orderHref },
        { label: "View Customer", href: customerHref },
      ],
    });
  }

  if (productionGating.blocked) {
    return buildAction({
      label: "View blocking reason",
      detail: productionGating.blockingReasons.join(" ") || "Production is blocked by workflow requirements.",
      tone: "danger",
      href: orderHref,
      actionKey: "view_blocking_reason",
      blockers: productionGating.blockingChecks.map((check) => ({
        label: check.label,
        status: check.statusLabel,
        detail: check.blockedSummary,
      })),
      secondary: [{ label: "Open Production Queue", href: "/admin/orders" }],
    });
  }

  if (
    workflowState.workflowState === ORDER_WORKFLOW_STATES.READY_FOR_PRODUCTION ||
    normalizeLower(order.status) === "new"
  ) {
    return buildAction({
      label: "Release to production",
      detail: "Payment and approval gates are satisfied. Move the job into the production queue.",
      tone: "success",
      href: orderHref,
      actionKey: "move_to_production",
      actionLabel: "Move To Production",
      secondary: [{ label: "Open Production Queue", href: "/admin/orders" }],
    });
  }

  if (workflowState.workflowState === ORDER_WORKFLOW_STATES.IN_PRODUCTION) {
    return buildAction({
      label: "Continue production workflow",
      detail: "This order is already in production. Continue movement from the production queue or order actions.",
      tone: "info",
      href: "/admin/orders",
      secondary: [{ label: "Open Order", href: orderHref }],
    });
  }

  if (workflowState.workflowState === ORDER_WORKFLOW_STATES.READY_FOR_PICKUP) {
    return buildAction({
      label: "Coordinate pickup",
      detail: "Production is complete. Review customer contact details and release pickup when ready.",
      tone: "success",
      href: customerHref || orderHref,
      secondary: [{ label: "Open Order", href: orderHref }],
    });
  }

  if (paymentState.balanceDue > 0) {
    return buildAction({
      label: openPaymentRequest ? "Follow up on balance request" : "Create balance payment request",
      detail: openPaymentRequest
        ? "Balance is still due and a request exists. Open it to complete outreach or follow-up."
        : "Balance remains due. Create a payment request so the next collection step is tracked.",
      tone: "warning",
      href: paymentHref || orderHref,
      actionKey: openPaymentRequest ? "" : "create_payment_request",
      secondary: [{ label: "Open Financials", href: "/admin/financial" }],
    });
  }

  return buildAction({
    label: "Review order status",
    detail: "No urgent owner action was detected. Review the order timeline and current workflow state.",
    tone: "neutral",
    href: orderHref,
  });
}

export function deriveOwnerQuoteNextAction(order = {}, productionReadiness = null) {
  const paymentState = deriveOrderPaymentState(order);
  const quoteHref = getQuoteHref(order);
  const orderHref = getOrderHref(order);
  const openPaymentRequest = getOpenPaymentRequest(paymentState);
  const quoteStatus = normalizeLower(order.quote_status);

  if (normalizeLower(order.status) === "canceled" || quoteStatus === "canceled") {
    return buildAction({
      label: "Review canceled request",
      detail: "This request is canceled. Keep it available for context or recovery decisions.",
      tone: "neutral",
      href: quoteHref,
    });
  }

  if (quoteStatus.includes("artwork")) {
    return buildAction({
      label: "Resolve artwork approval",
      detail: "Artwork is still required before the request can move forward.",
      tone: "warning",
      href: quoteHref,
      actionKey: "open_artwork",
    });
  }

  if (quoteStatus.includes("awaiting approval") || quoteStatus === "sent") {
    return buildAction({
      label: "Open approval record",
      detail: "Customer approval is the next requirement before production release.",
      tone: "warning",
      href: quoteHref,
      actionKey: "open_approval",
    });
  }

  if (paymentState.depositRequired && !paymentState.depositSatisfied) {
    return buildAction({
      label: openPaymentRequest ? "Send or follow up on deposit request" : "Create deposit payment request",
      detail: openPaymentRequest
        ? "A deposit request exists. Complete customer outreach or follow up from the request record."
        : "Deposit is required before release. Create the payment request from this workspace.",
      tone: "warning",
      href: getPaymentRequestHref(openPaymentRequest) || quoteHref,
      actionKey: openPaymentRequest ? "" : "create_payment_request",
    });
  }

  if (productionReadiness && !productionReadiness.ready) {
    return buildAction({
      label: "Resolve release blockers",
      detail: `${productionReadiness.remainingRequirements || 0} requirement${
        productionReadiness.remainingRequirements === 1 ? "" : "s"
      } remain before production release.`,
      tone: "danger",
      href: quoteHref,
      blockers: (productionReadiness.checks || [])
        .filter((check) => check.required && !check.satisfied)
        .map((check) => ({
          label: check.label,
          status: check.status,
          detail: check.detail,
        })),
    });
  }

  return buildAction({
    label: "Release to production",
    detail: "Approval, artwork, and payment gates are ready for production release.",
    tone: "success",
    href: quoteHref || orderHref,
    actionKey: "release_to_production",
    actionLabel: "Release to Production",
  });
}

export function deriveOwnerPaymentRequestNextAction(paymentRequest = {}, relatedOrder = null) {
  const status = normalizeLower(paymentRequest.status);
  const checkoutUrl = String(paymentRequest.provider_checkout_url || "").trim();
  const paymentLinkId = String(paymentRequest.provider_payment_link_id || "").trim();
  const providerOrderId = String(paymentRequest.provider_order_id || "").trim();
  const linkMode = normalizeLower(paymentRequest.metadata?.square_payment_link?.metadata?.mode);
  const hasUsableCheckoutLink =
    /^https?:\/\//i.test(checkoutUrl) &&
    !paymentLinkId.startsWith("local-") &&
    !providerOrderId.startsWith("local-order-") &&
    linkMode !== "local_fallback";
  const remaining = Math.max(
    0,
    Number(paymentRequest.amount_requested || 0) - Number(paymentRequest.amount_paid || 0)
  );
  const orderHref = relatedOrder ? getOrderHref(relatedOrder) : "";
  const customerHref = getCustomerHref(paymentRequest);

  if (status === "paid" || remaining <= 0) {
    const orderAction = relatedOrder ? deriveOwnerOrderNextAction(relatedOrder) : null;
    return buildAction({
      label: orderAction?.label || "Review paid request",
      detail: relatedOrder
        ? `Payment is complete. Next order step: ${orderAction.label}.`
        : "Payment is complete. Review related records if follow-up is needed.",
      tone: "success",
      href: orderAction?.href || orderHref,
      secondary: [{ label: "View Customer", href: customerHref }],
    });
  }

  if ((!paymentRequest.sent_at && status !== "sent") || !hasUsableCheckoutLink) {
    return buildAction({
      label: hasUsableCheckoutLink ? "Send now" : "Create checkout link",
      detail: hasUsableCheckoutLink
        ? "The request exists, but customer outreach is not marked complete."
        : "The request does not have a valid provider checkout link.",
      tone: "warning",
      actionKey: "mark_payment_request_sent",
      actionLabel: "Send Now",
      secondary: [
        { label: "View Order", href: orderHref },
        { label: "View Customer", href: customerHref },
        { label: "Notification Activity", href: "/admin/settings/notifications/activity" },
      ],
    });
  }

  return buildAction({
    label: "Follow up on payment",
    detail: `Customer outreach is marked sent. ${remaining.toFixed(2)} remains outstanding.`,
    tone: "info",
    href: orderHref,
    secondary: [
      { label: "View Customer", href: customerHref },
      { label: "Notification Activity", href: "/admin/settings/notifications/activity" },
    ],
  });
}
