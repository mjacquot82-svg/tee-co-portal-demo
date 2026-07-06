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
