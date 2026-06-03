import {
  createStoredOrder,
  duplicateStoredOrder,
  findStoredOrder,
  getStoredOrders,
  recordStoredOrderPayment,
  subscribeToStoredOrders,
  updateStoredOrder,
  useStoredOrders,
} from "../lib/ordersStore";
import { linkOrderToCustomer } from "../lib/customersStore";
import { buildWorkflowActionUpdates } from "../orders/buildWorkflowActionUpdates";
import { normalizeOperationalStatus } from "../orders/orderWorkflow";
import { normalizeOrderFinancials } from "../orders/orderFinancials";
import { getNextQuoteStatus } from "../quotes/quoteWorkflow";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function getWorkflowTimestamp(options = {}) {
  return options.now || new Date().toISOString();
}

function withActorAudit(updates = {}, options = {}) {
  const actor = options.staffUser;
  if (!actor) return updates;

  return {
    updated_by_staff_name: actor.name || "Unknown Staff",
    updated_by_staff_role: actor.role || "",
    ...updates,
  };
}

function getWorkflowActionType(workflowInput = {}) {
  return String(workflowInput.type || workflowInput.actionType || "").trim();
}

function getAssignee(workflowInput = {}) {
  return workflowInput.assignee || workflowInput.worker || workflowInput.staff || null;
}

function buildAssignmentWorkflowUpdates(order, workflowInput = {}, options = {}) {
  const selectedWorker = getAssignee(workflowInput);
  const previousAssignment = order.assigned_to_staff_name || "";
  const nextAssignment = selectedWorker?.name || "";
  const fallbackConfirmedNote = workflowInput.confirmationNote || "Assignment unchanged.";
  const activityNote =
    workflowInput.activity_note ||
    workflowInput.activityNote ||
    (!previousAssignment && nextAssignment
      ? `Assigned to ${nextAssignment}.`
      : previousAssignment && !nextAssignment
      ? `Unassigned from ${previousAssignment}.`
      : previousAssignment && nextAssignment && previousAssignment !== nextAssignment
      ? `Reassigned from ${previousAssignment} to ${nextAssignment}.`
      : selectedWorker
      ? `Assignment confirmed for ${nextAssignment}.`
      : fallbackConfirmedNote);

  return {
    assigned_to_staff_id: selectedWorker?.id || "",
    assigned_to_staff_name: selectedWorker?.name || "",
    assigned_to_staff_role: selectedWorker?.role || "",
    assigned_at: selectedWorker ? workflowInput.assignedAt || getWorkflowTimestamp(options) : null,
    needs_assignment: !selectedWorker,
    activity_type: "assignment",
    activity_note: activityNote,
  };
}

function buildArtworkApprovalWorkflowUpdates(order, workflowInput = {}, options = {}) {
  const normalizedStatus = String(workflowInput.status || workflowInput.nextStatus || "").trim();
  const now = getWorkflowTimestamp(options);
  const actor = options.staffUser;

  return {
    artwork_approval_status: normalizedStatus,
    approval_status:
      normalizedStatus === "Approved"
        ? "Customer Approved"
        : normalizedStatus === "Needs Revision"
        ? "Revision Requested"
        : "Pending Review",
    quote_status:
      order.operational_visible === false
        ? normalizedStatus === "Approved"
          ? order.deposit_required
            ? "Awaiting Deposit"
            : "Approved"
          : "Awaiting Artwork Approval"
        : order.quote_status,
    customer_approved_at: normalizedStatus === "Approved" ? order.customer_approved_at || now : null,
    customer_revision_requested_at:
      normalizedStatus === "Needs Revision" ? order.customer_revision_requested_at || now : null,
    activity_type: "artwork_approval",
    activity_note:
      workflowInput.activity_note ||
      workflowInput.activityNote ||
      (normalizedStatus === "Approved"
        ? `Artwork approved by ${actor?.name || "staff"}.`
        : normalizedStatus === "Needs Revision"
        ? `Artwork revision requested by ${actor?.name || "staff"}.`
        : "Artwork moved to pending review."),
  };
}

function buildDepositWorkflowUpdates(order, workflowInput = {}, options = {}) {
  const normalizedStatus = String(workflowInput.status || workflowInput.nextStatus || "").trim();
  const now = getWorkflowTimestamp(options);
  const normalizedOrder = normalizeOrderFinancials(order, options.financialOptions || {});
  const nextDeposit = {
    ...(order.deposit || {}),
    amount: normalizedOrder.deposit_amount,
    updated_at: now,
    status:
      normalizedStatus === "Deposit Not Required"
        ? "not_required"
        : normalizedStatus === "Deposit Requested"
        ? "pending"
        : normalizedStatus === "Deposit Received"
        ? "paid"
        : "awaiting",
    requested_at:
      normalizedStatus === "Deposit Requested"
        ? order.deposit?.requested_at || now
        : order.deposit?.requested_at || null,
    paid_at:
      normalizedStatus === "Deposit Received" ? order.deposit?.paid_at || now : order.deposit?.paid_at || null,
  };

  return {
    deposit_workflow_status: normalizedStatus,
    deposit_required: normalizedStatus !== "Deposit Not Required",
    quote_status:
      order.operational_visible === false
        ? normalizedStatus === "Deposit Requested" || normalizedStatus === "Awaiting Deposit"
          ? "Awaiting Deposit"
          : order.artwork_approval_status === "Approved"
          ? "Approved"
          : order.quote_status
        : order.quote_status,
    deposit: nextDeposit,
    activity_type: "deposit_workflow",
    activity_note:
      workflowInput.activity_note ||
      workflowInput.activityNote ||
      (normalizedStatus === "Deposit Requested"
        ? "Deposit requested."
        : normalizedStatus === "Deposit Received"
        ? "Deposit received."
        : normalizedStatus === "Deposit Not Required"
        ? "Deposit requirement cleared."
        : "Awaiting deposit."),
  };
}

function buildDepositRequestWorkflowUpdates(order, workflowInput = {}, options = {}) {
  const now = getWorkflowTimestamp(options);
  const normalizedOrder = normalizeOrderFinancials(order, options.financialOptions || {});

  return {
    deposit_workflow_status: "Deposit Requested",
    deposit_required: Number(normalizedOrder.deposit_amount || 0) > 0,
    deposit: {
      ...(order.deposit || {}),
      amount: normalizedOrder.deposit_amount,
      status: "pending",
      requested_at: now,
      updated_at: now,
      request_channel: workflowInput.channel || "",
      last_requested_subject: workflowInput.subject || "",
      last_requested_message: workflowInput.body || workflowInput.message || "",
    },
    activity_type: "deposit_request",
    activity_note:
      workflowInput.activity_note ||
      workflowInput.activityNote ||
      `Deposit request prepared via ${workflowInput.channel || "manual workflow"}.`,
  };
}

function buildGatingOverrideWorkflowUpdates(order, workflowInput = {}, options = {}) {
  const overrideKey = workflowInput.overrideKey || workflowInput.key;
  const now = getWorkflowTimestamp(options);
  const actor = options.staffUser;
  const overrideLabels = {
    forceProduction: "Force Move To Production",
    depositRequirement: "Override Deposit Requirement",
    artworkApprovalRequirement: "Override Artwork Approval Requirement",
  };

  return {
    workflow_overrides: {
      ...order.workflow_overrides,
      [overrideKey]: {
        active: true,
        usedAt: now,
        usedByName: actor?.name || "Unknown Staff",
        usedByRole: actor?.role || "",
      },
    },
    activity_type: "gating_override_used",
    activity_note:
      workflowInput.activity_note ||
      workflowInput.activityNote ||
      `${overrideLabels[overrideKey] || "Workflow gating override"} used.`,
  };
}

function buildPickupWorkflowUpdates(order, workflowInput = {}, options = {}) {
  const now = getWorkflowTimestamp(options);
  const balance = Number(
    workflowInput.balance_due ?? workflowInput.balanceDue ?? order.balance_due ?? 0
  );
  const balanceNote = balance > 0 ? ` Outstanding balance: ${money(balance)}.` : "";
  const quickSaleStatusMode = workflowInput.statusMode === "quick_sale_release";

  return {
    pickup_status: "Picked Up",
    picked_up_at: order.picked_up_at || now,
    status: quickSaleStatusMode
      ? order.status === "Ready for Pickup"
        ? "Picked Up"
        : order.status
      : normalizeOperationalStatus(order.status) === "Ready For Pickup"
      ? "Completed"
      : order.status,
    activity_type: "pickup",
    activity_note:
      workflowInput.activity_note ||
      workflowInput.activityNote ||
      `Order marked as picked up.${balanceNote}`,
  };
}

function buildProductionBlockedWorkflowUpdates(workflowInput = {}, options = {}) {
  const action = workflowInput.action || {};
  const label = workflowInput.label || action.label || "Production action";
  const blockingReasons = workflowInput.blockingReasons || workflowInput.reasons || [];

  return {
    activity_type: "production_blocked",
    activity_note:
      workflowInput.activity_note ||
      workflowInput.activityNote ||
      `${label} blocked. ${blockingReasons.join(" ")}`,
    last_production_blocked_at: getWorkflowTimestamp(options),
    last_production_blocked_reasons: blockingReasons,
  };
}

function buildQuoteLifecycleWorkflowUpdates(order, workflowInput = {}, options = {}) {
  const type = getWorkflowActionType(workflowInput);
  const now = getWorkflowTimestamp(options);

  if (type === "advance_quote") {
    const nextQuoteStatus = workflowInput.nextQuoteStatus || getNextQuoteStatus(order.quote_status);
    return {
      quote_status: nextQuoteStatus,
      activity_type: "quote_status",
      activity_note: workflowInput.activity_note || workflowInput.activityNote || `Quote status changed to ${nextQuoteStatus}.`,
    };
  }

  if (type === "release_to_production") {
    return {
      quote_status: "Ready For Production",
      status: "Awaiting Production",
      operational_visible: true,
      production_ready: true,
      activity_type: "release_to_production",
      activity_note: workflowInput.activity_note || workflowInput.activityNote || "Quote released into Production Orders.",
    };
  }

  if (type === "archive_quote") {
    return {
      quote_archived: true,
      quote_archived_at: now,
      operational_visible: false,
      production_ready: false,
      activity_type: "quote_archive",
      activity_note: workflowInput.activity_note || workflowInput.activityNote || "Quote archived from active workflow.",
    };
  }

  if (type === "restore_quote") {
    return {
      quote_archived: false,
      quote_archived_at: null,
      activity_type: "quote_restore",
      activity_note: workflowInput.activity_note || workflowInput.activityNote || "Quote restored to active workflow.",
    };
  }

  return null;
}

function buildCancellationWorkflowUpdates(workflowInput = {}, options = {}) {
  const type = getWorkflowActionType(workflowInput);
  const quoteCancellation = type === "cancel_quote";

  return {
    status: "Canceled",
    quote_status: "Canceled",
    operational_visible: false,
    production_ready: false,
    canceled_at: getWorkflowTimestamp(options),
    activity_type: "canceled",
    activity_note:
      workflowInput.activity_note ||
      workflowInput.activityNote ||
      (quoteCancellation
        ? "Quote canceled while preserving operational and financial history."
        : "Production order canceled while preserving operational and financial history."),
  };
}

function buildOrderWorkflowUpdates(order, workflowInput = {}, options = {}) {
  const type = getWorkflowActionType(workflowInput);

  switch (type) {
    case "run_production_action":
    case "production_action":
      return buildWorkflowActionUpdates(order, workflowInput.action || workflowInput.actionKey || workflowInput.key);
    case "record_production_blocked":
    case "production_blocked":
      return buildProductionBlockedWorkflowUpdates(workflowInput, options);
    case "set_artwork_approval":
    case "artwork_approval":
      return buildArtworkApprovalWorkflowUpdates(order, workflowInput, options);
    case "set_deposit_workflow":
    case "deposit_workflow":
      return buildDepositWorkflowUpdates(order, workflowInput, options);
    case "send_deposit_request":
    case "deposit_request":
      return buildDepositRequestWorkflowUpdates(order, workflowInput, options);
    case "apply_gating_override":
    case "gating_override":
      return buildGatingOverrideWorkflowUpdates(order, workflowInput, options);
    case "force_move_to_production": {
      const updates = buildWorkflowActionUpdates(order, {
        key: "move_to_production",
        label: "Move To Production",
        targetStatus: "Ready For Production",
      });
      return updates
        ? {
            ...updates,
            activity_note: workflowInput.activity_note || workflowInput.activityNote || "Move To Production forced with operational override.",
          }
        : null;
    }
    case "mark_picked_up":
    case "release_pickup":
    case "pickup":
      return buildPickupWorkflowUpdates(order, workflowInput, options);
    case "assign_staff":
    case "clear_assignment":
    case "assignment":
      return buildAssignmentWorkflowUpdates(order, workflowInput, options);
    case "advance_quote":
    case "release_to_production":
    case "archive_quote":
    case "restore_quote":
      return buildQuoteLifecycleWorkflowUpdates(order, workflowInput, options);
    case "cancel_order":
    case "cancel_quote":
    case "cancellation":
      return buildCancellationWorkflowUpdates(workflowInput, options);
    default:
      return null;
  }
}

export function listOrders() {
  return getStoredOrders();
}

export function getOrderByNumber(orderNumber) {
  return findStoredOrder(orderNumber);
}

export function createOrder(order) {
  return createStoredOrder(order);
}

export async function createCustomerRequest({ profile = null, orderInput = {}, linkToCustomer = true } = {}) {
  const createdOrder = createOrder(orderInput);

  if (linkToCustomer && profile?.id) {
    await linkOrderToCustomer(profile.id, createdOrder.order_number);
  }

  return createdOrder;
}

export function updateOrder(orderNumber, updates) {
  return updateStoredOrder(orderNumber, updates);
}

export function recordOrderPayment(orderNumber, paymentInput = {}, options = {}) {
  return recordStoredOrderPayment(orderNumber, paymentInput, options);
}

export function updateOrderWorkflow(orderNumber, workflowInput = {}, options = {}) {
  const order = getOrderByNumber(orderNumber);
  if (!order) return null;

  const updates = buildOrderWorkflowUpdates(order, workflowInput, options);
  if (!updates) return null;

  return updateOrder(orderNumber, withActorAudit(updates, options));
}

export function duplicateOrder(orderNumber) {
  return duplicateStoredOrder(orderNumber);
}

export function subscribeToOrders(listener) {
  return subscribeToStoredOrders(listener);
}

export function useOrders() {
  return useStoredOrders();
}
