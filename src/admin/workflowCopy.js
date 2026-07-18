function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function orderContext(order = {}) {
  const orderNumber = order.order_number || "This order";
  const customer = order.customer_name || "Customer";
  return `${orderNumber} · ${customer}`;
}

export function buildWorkflowActionConfirmation(order = {}, action = {}) {
  const context = orderContext(order);
  const labels = {
    move_to_production: "Order Moved to Production",
    mark_ready_for_pickup: "Ready for Pickup",
    complete_order: "Order Completed",
    resume_from_hold: "Order Resumed",
    place_on_hold: "Order Placed on Hold",
    cancel_order: "Order Canceled",
  };

  return {
    summary: labels[action.key] || `${action.label || "Workflow Action"} Complete`,
    detail: context,
  };
}

export function buildDepositRequestConfirmation(order = {}, result = {}) {
  const amount =
    result.amount ??
    order.deposit_amount ??
    order.amount_due_now ??
    order.deposit?.amount ??
    0;
  return `Deposit Request Sent for ${orderContext(order)} · ${money(amount)}`;
}

export function buildIntakeActionConfirmation(actionKey) {
  const confirmations = {
    approve_request: [
      "✓ Request approved.",
      "Workflow state: Approved — pending remaining requirements.",
      "The customer can now complete any remaining requirements before production.",
      "Next step: Review the artwork and deposit requirements.",
    ],
    request_artwork: [
      "✓ Artwork requested.",
      "Workflow state: Awaiting artwork.",
      "The customer has been notified through the Customer Portal and can now upload artwork.",
      "Next step: Review the artwork after the customer uploads it.",
    ],
    approve_artwork: [
      "✓ Artwork approved.",
      "Workflow state: Artwork approved.",
      "The artwork requirement is complete.",
      "Next step: Complete any remaining requirements before production.",
    ],
    request_changes: [
      "✓ Changes requested.",
      "Workflow state: Awaiting customer response.",
      "The customer can now review the request and respond through the Customer Portal.",
      "Next step: Continue review after the customer responds.",
    ],
    require_deposit: [
      "✓ Deposit request created.",
      "Workflow state: Awaiting deposit.",
      "The customer can now pay the deposit from the Customer Portal.",
      "Next step: Monitor for payment and complete any remaining requirements.",
    ],
    deposit_not_required: [
      "✓ Deposit marked not required.",
      "Workflow state: No deposit is required for this request.",
      "The customer does not need to make a deposit payment.",
      "Next step: Complete any remaining approval or artwork requirements.",
    ],
    reject_request: [
      "✓ Request rejected.",
      "Workflow state: Request canceled.",
      "The request is closed and will not advance to production.",
      "Next step: No further workflow action is required.",
    ],
  };

  return (confirmations[actionKey] || ["✓ Workflow action completed."]).join("\n");
}

export function buildProductionEmptyState(statusFilter = "active") {
  const messages = {
    "ready-for-production": "No orders are waiting for production.",
    "ready-for-pickup": "No orders are ready for pickup.",
    "awaiting-deposit": "No production orders are waiting on a deposit.",
    blocked: "No production orders are blocked.",
    unassigned: "No production orders need assignment.",
    urgent: "No urgent production orders need attention.",
    completed: "No completed production orders match these filters.",
    canceled: "No canceled production orders match these filters.",
    "on-hold": "No production orders are on hold.",
  };

  return messages[statusFilter] || "No production orders match these filters.";
}

export function buildQuoteEmptyState(queueFilter = "all") {
  const messages = {
    "awaiting-approval": "No requests are awaiting customer approval.",
    "awaiting-artwork": "No requests are awaiting artwork.",
    "awaiting-deposit": "No requests are awaiting deposit.",
    ready: "No requests are ready for production.",
    blocked: "No blocked requests need review.",
  };

  return messages[queueFilter] || "No active requests yet. New order requests will appear here for review.";
}
