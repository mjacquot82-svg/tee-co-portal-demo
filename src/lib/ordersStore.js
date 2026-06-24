import { useSyncExternalStore } from "react";
import { demoOrders } from "../data/demoOrders";
import { normalizeProductionType } from "../constants/productionTypes";
import {
  isActiveOperationalStatus,
  isProductionExecutionStatus,
  isReadyForProductionStatus,
  normalizeOperationalStatus,
} from "../orders/orderWorkflow";
import {
  getArtworkApprovalRequirement,
  normalizeArtworkApprovalStatus,
  normalizeDepositWorkflowStatus,
  normalizeWorkflowOverrides,
} from "../orders/workflowGating";
import { normalizeOrderFinancials } from "../orders/orderFinancials";
import {
  isQuoteReadyForProduction,
  normalizeQuoteStatus,
} from "../quotes/quoteWorkflow";
import { validatePaymentAmount } from "./financialValidation";
import { buildStaffAuditFields, getActiveStaffUser } from "./staffUsersStore";
import { getRawStorageItem, hasBrowserStorage, setRawStorageItem } from "./browserStorage";
import { formatShortDate, toIsoTimestamp } from "./dateFormatting";
import { getArtworkDisplayName, getOrderArtworkFiles } from "./orderArtwork";
import { createOperationalEvent } from "./operationalEventsStore";
import { backfillOrderPaymentsToPayments, recordPayment } from "./paymentsStore";
import { normalizeCustomerId } from "./customerIds";
import { addCustomerTimelineEvent } from "./customerTimelineStore";
import { resolveCustomerForRecord } from "./customerRecordMatching";
import { deriveOperationalWorkflowState } from "./operationalWorkflow";
import { updateArtworkApprovalStatus } from "./customerArtworkStore";
import { linkCustomerArtworkToOrder, linkCustomerArtworkToQuote } from "../services/customerArtworkService";
import { triggerNotificationEvent } from "./notificationDeliveryService";
import { NOTIFICATION_TYPES } from "./notificationTemplatesStore";

const STORAGE_KEY = "teeCoStaffOrders";
const orderListeners = new Set();
const EMPTY_ORDERS = [];

let cachedOrdersRaw = null;
let cachedOrdersSnapshot = EMPTY_ORDERS;

function persistArtworkRelationship(promise, context) {
  Promise.resolve(promise).catch((error) => {
    console.error("Unable to persist artwork relationship in Supabase", {
      context,
      error,
    });
  });
}

function persistArtworkApprovalMetadata(artworkIds, approvalStatus) {
  const normalizedArtworkIds = Array.from(
    new Set((Array.isArray(artworkIds) ? artworkIds : []).map((value) => String(value || "").trim()).filter(Boolean))
  );

  normalizedArtworkIds.forEach((artworkId) => {
    try {
      updateArtworkApprovalStatus(artworkId, approvalStatus);
    } catch (error) {
      console.error("Unable to update artwork approval metadata", {
        artworkId,
        approvalStatus,
        error,
      });
    }
  });
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function normalizeStatusText(value) {
  return String(value || "").trim();
}

function isApprovedState(value) {
  return normalizeStatusText(value).toLowerCase().includes("approved");
}

function buildOrderNotificationContext(order, source = "orders_store") {
  return {
    order,
    source,
    customerName: order?.customer_name || "",
    customerEmail: order?.customer_email || order?.email || "",
    customerPhone: order?.customer_phone || "",
    orderNumber: order?.order_number || "",
    quoteTotal: order?.total_amount,
    depositAmount: order?.deposit_amount || order?.deposit?.amount,
    balanceDue: order?.balance_due,
    pickupDate: order?.pickup_date || order?.due_date || "",
  };
}

function triggerOrderNotification(eventType, order, source = "orders_store") {
  if (!order) return;
  triggerNotificationEvent(eventType, buildOrderNotificationContext(order, source));
}

function normalizePlacements(order = {}) {
  if (Array.isArray(order.placements) && order.placements.length) {
    return order.placements.filter((placement) => placement?.placement);
  }

  if (order.placement) {
    return [
      {
        placement: order.placement,
        decoration_type: order.decoration_type || order.production_type || "",
        artwork_id: order.customer_artwork_id || "",
        artwork_name: order.customer_artwork_name || "",
      },
    ];
  }

  return [];
}

function resolveFirstTimestamp(candidates = [], fallbackTimestamp = new Date().toISOString()) {
  for (const candidate of candidates) {
    const resolvedValue = toIsoTimestamp(candidate);
    if (resolvedValue) return resolvedValue;
  }

  return fallbackTimestamp;
}

function resolveLatestTimestamp(candidates = [], fallbackTimestamp = new Date().toISOString()) {
  const timestamps = candidates
    .map((candidate) => toIsoTimestamp(candidate))
    .filter(Boolean);

  if (!timestamps.length) {
    return fallbackTimestamp;
  }

  return timestamps.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
}

function normalizeOrderTimestamps(order = {}) {
  const fallbackTimestamp = new Date().toISOString();
  const paymentTimestamps = Array.isArray(order.payment_history)
    ? order.payment_history.flatMap((payment) => [
        payment?.timestamp,
        payment?.created_at,
        payment?.recorded_at,
      ])
    : [];
  const activityTimestamps = Array.isArray(order.activity_log)
    ? order.activity_log.map((event) => event?.created_at)
    : [];
  const createdAt = resolveFirstTimestamp(
    [
      order.created_at,
      order.date,
      order.submitted_at,
      order.approval_sent_at,
      order.approved_at,
      order.customer_approved_at,
      order.production_started_at,
      order.canceled_at,
      order.quote_canceled_at,
      ...activityTimestamps,
      ...paymentTimestamps,
      order.updated_at,
    ],
    fallbackTimestamp
  );
  const updatedAt = resolveLatestTimestamp(
    [
      order.updated_at,
      order.completed_at,
      order.picked_up_at,
      order.canceled_at,
      order.quote_canceled_at,
      order.production_started_at,
      order.approved_at,
      order.customer_approved_at,
      order.customer_revision_requested_at,
      order.revision_requested_at,
      order.approval_sent_at,
      ...activityTimestamps,
      ...paymentTimestamps,
      createdAt,
    ],
    createdAt
  );

  return {
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function normalizeStoredOrder(order = {}) {
  const assignedToStaffId = order.assigned_to_staff_id || "";
  const assignedToStaffName = order.assigned_to_staff_name || "";
  const hasAssignedStaff = Boolean(assignedToStaffId);
  const productionOwnerStaffId =
    order.production_owner_staff_id || assignedToStaffId || "";
  const productionOwnerStaffName =
    order.production_owner_staff_name || assignedToStaffName || "";
  const productionOwnerStaffRole =
    order.production_owner_staff_role || order.assigned_to_staff_role || "";
  const status = normalizeOperationalStatus(order.status || "New");
  const quoteStatus = normalizeQuoteStatus(
    order.quote_status || (order.operational_visible === false ? "Draft" : "Ready For Production")
  );
  const artworkFiles = getOrderArtworkFiles(order);
  const placements = normalizePlacements(order);
  const primaryPlacement = placements[0] || null;
  const primaryArtwork = artworkFiles[0] || null;
  const timestamps = normalizeOrderTimestamps(order);
  const artworkApprovalRequired = getArtworkApprovalRequirement({
    ...order,
    artwork_files: artworkFiles,
    customer_artwork_id:
      order.customer_artwork_id || primaryArtwork?.id || primaryPlacement?.artwork_id || "",
  });
  const artworkApprovalStatus = normalizeArtworkApprovalStatus(
    order.artwork_approval_status || order.approval_status,
    { required: artworkApprovalRequired }
  );
  const depositRequirementLookup = String(order.deposit_requirement || "").trim().toLowerCase();
  const depositRequirementStatusLookup = String(order.deposit_requirement_status || "").trim().toLowerCase();
  const depositRequirementUndecided =
    depositRequirementLookup === "undecided" || depositRequirementStatusLookup === "undecided";
  const depositRequired =
    depositRequirementUndecided
      ? null
      : typeof order.deposit_required === "boolean"
      ? order.deposit_required
      : depositRequirementLookup === "required" ||
        Number(order.deposit_amount || order.deposit?.amount || 0) > 0;
  const depositWorkflowStatus = normalizeDepositWorkflowStatus(
    order.deposit_workflow_status || order.deposit?.status,
    {
      ...order,
      deposit_required: depositRequired,
    }
  );
  const workflowOverrides = normalizeWorkflowOverrides(order.workflow_overrides);
  backfillOrderPaymentsToPayments({
    ...order,
    customer_id:
      normalizeCustomerId(order.customer_id) || resolveCustomerForRecord(order)?.id || "",
  });

  return normalizeOrderFinancials({
    ...order,
    ...timestamps,
    customer_id:
      normalizeCustomerId(order.customer_id) || resolveCustomerForRecord(order)?.id || "",
    date: order.date || formatShortDate(timestamps.created_at),
    status,
    quote_status: quoteStatus,
    placements,
    artwork_files: artworkFiles,
    artwork_reference_names: artworkFiles.map((file) => getArtworkDisplayName(file)),
    placement: order.placement || primaryPlacement?.placement || "",
    decoration_type: normalizeProductionType(
      order.decoration_type || order.production_type || ""
    ),
    customer_artwork_id:
      order.customer_artwork_id || primaryArtwork?.id || primaryPlacement?.artwork_id || "",
    customer_artwork_name:
      order.customer_artwork_name ||
      (primaryArtwork ? getArtworkDisplayName(primaryArtwork) : "") ||
      primaryPlacement?.artwork_name ||
      "",
    artwork_approval_required: artworkApprovalRequired,
    artwork_approval_status: artworkApprovalStatus,
    deposit_required: depositRequired,
    deposit_workflow_status: depositWorkflowStatus,
    workflow_overrides: workflowOverrides,
    assigned_to_staff_id: assignedToStaffId,
    assigned_to_staff_name: assignedToStaffName,
    assigned_to_staff_role: order.assigned_to_staff_role || "",
    production_owner_staff_id: productionOwnerStaffId,
    production_owner_staff_name: productionOwnerStaffName,
    production_owner_staff_role: productionOwnerStaffRole,
    production_owner_assigned_at:
      order.production_owner_assigned_at || order.assigned_at || null,
    needs_assignment:
      typeof order.needs_assignment === "boolean"
        ? order.needs_assignment
        : !hasAssignedStaff,
    is_rush:
      typeof order.is_rush === "boolean"
        ? order.is_rush
        : typeof order.rush_requested === "boolean"
        ? order.rush_requested
        : typeof order.rush === "boolean"
        ? order.rush
        : false,
    production_ready:
      typeof order.production_ready === "boolean"
        ? order.production_ready
        : isQuoteReadyForProduction(quoteStatus) && isReadyForProductionStatus(status),
    operational_visible:
      typeof order.operational_visible === "boolean"
        ? order.operational_visible
        : isQuoteReadyForProduction(quoteStatus) && isActiveOperationalStatus(status),
    workflow_state: deriveOperationalWorkflowState({
      ...order,
      status,
      quote_status: quoteStatus,
      operational_visible:
        typeof order.operational_visible === "boolean"
          ? order.operational_visible
        : isQuoteReadyForProduction(quoteStatus) && isActiveOperationalStatus(status),
      quote_archived: order.quote_archived,
    }),
  });
}

function emitOrdersUpdated() {
  orderListeners.forEach((listener) => listener());
}

function buildSeedOrder(order, index = 0) {
  const createdAt = new Date().toISOString();

  return normalizeStoredOrder({
    ...order,
    order_number: order.order_number || `TC-SEED-${index + 1}`,
    customer_name:
      order.customer_name ||
      ["ABC Construction", "City Hockey", "Local Customer"][index] ||
      "Walk-in Customer",
    garment: order.garment || order.item || "Custom garment",
    qty: Number(order.qty || 0),
    due_date: order.due_date || "",
    source: order.source || "Demo Seed",
    date: order.date || formatShortDate(order.created_at || createdAt),
    created_at: order.created_at || createdAt,
    updated_at: order.updated_at || order.created_at || createdAt,
    activity_log: order.activity_log || [],
  });
}

function readStoredOrders() {
  if (!hasBrowserStorage()) return [];

  try {
    const rawOrders = getRawStorageItem(STORAGE_KEY);
    const normalizedRawOrders = rawOrders || "";

    if (normalizedRawOrders === cachedOrdersRaw) {
      return cachedOrdersSnapshot;
    }

    const parsedOrders = rawOrders ? JSON.parse(rawOrders) : [];

    cachedOrdersRaw = normalizedRawOrders;
    cachedOrdersSnapshot = Array.isArray(parsedOrders)
      ? parsedOrders.map((order) => normalizeStoredOrder(order))
      : EMPTY_ORDERS;

    return cachedOrdersSnapshot;
  } catch (error) {
    console.error("Unable to read stored Tee & Co orders", error);
    cachedOrdersRaw = null;
    cachedOrdersSnapshot = EMPTY_ORDERS;
    return EMPTY_ORDERS;
  }
}

function buildAssignmentUpdates(currentOrder, updates) {
  const hasAssignmentFields =
    Object.prototype.hasOwnProperty.call(updates, "assigned_to_staff_id") ||
    Object.prototype.hasOwnProperty.call(updates, "assigned_to_staff_name") ||
    Object.prototype.hasOwnProperty.call(updates, "assigned_to_staff_role") ||
    Object.prototype.hasOwnProperty.call(updates, "assigned_at") ||
    Object.prototype.hasOwnProperty.call(updates, "needs_assignment") ||
    Object.prototype.hasOwnProperty.call(updates, "production_owner_staff_id") ||
    Object.prototype.hasOwnProperty.call(updates, "production_owner_staff_name") ||
    Object.prototype.hasOwnProperty.call(updates, "production_owner_staff_role") ||
    Object.prototype.hasOwnProperty.call(updates, "production_owner_assigned_at");

  if (!hasAssignmentFields) return updates;

  const assignedToStaffId = Object.prototype.hasOwnProperty.call(
    updates,
    "assigned_to_staff_id"
  )
    ? updates.assigned_to_staff_id || ""
    : currentOrder.assigned_to_staff_id || "";
  const assignedToStaffName = Object.prototype.hasOwnProperty.call(
    updates,
    "assigned_to_staff_name"
  )
    ? updates.assigned_to_staff_name || ""
    : currentOrder.assigned_to_staff_name || "";
  const assignedToStaffRole = Object.prototype.hasOwnProperty.call(
    updates,
    "assigned_to_staff_role"
  )
    ? updates.assigned_to_staff_role || ""
    : currentOrder.assigned_to_staff_role || "";
  const assigned = Boolean(assignedToStaffId);
  const nextStatus = normalizeOperationalStatus(
    updates.status || currentOrder.status
  );
  const defaultProductionOwnerId =
    currentOrder.production_owner_staff_id || currentOrder.assigned_to_staff_id || "";
  const defaultProductionOwnerName =
    currentOrder.production_owner_staff_name || currentOrder.assigned_to_staff_name || "";
  const defaultProductionOwnerRole =
    currentOrder.production_owner_staff_role || currentOrder.assigned_to_staff_role || "";
  const productionOwnerStaffId = Object.prototype.hasOwnProperty.call(
    updates,
    "production_owner_staff_id"
  )
    ? updates.production_owner_staff_id || ""
    : defaultProductionOwnerId || assignedToStaffId;
  const productionOwnerStaffName = Object.prototype.hasOwnProperty.call(
    updates,
    "production_owner_staff_name"
  )
    ? updates.production_owner_staff_name || ""
    : defaultProductionOwnerName || assignedToStaffName;
  const productionOwnerStaffRole = Object.prototype.hasOwnProperty.call(
    updates,
    "production_owner_staff_role"
  )
    ? updates.production_owner_staff_role || ""
    : defaultProductionOwnerRole || assignedToStaffRole;
  const hasProductionOwner = Boolean(productionOwnerStaffId);

  return {
    ...updates,
    assigned_to_staff_id: assignedToStaffId,
    assigned_to_staff_name: assigned ? assignedToStaffName : "",
    assigned_to_staff_role: assigned ? assignedToStaffRole : "",
    assigned_at:
      Object.prototype.hasOwnProperty.call(updates, "assigned_at")
        ? updates.assigned_at
        : assigned
        ? currentOrder.assigned_at || new Date().toISOString()
        : null,
    needs_assignment: assigned ? false : true,
    status: nextStatus,
    production_owner_staff_id: productionOwnerStaffId,
    production_owner_staff_name: hasProductionOwner ? productionOwnerStaffName : "",
    production_owner_staff_role: hasProductionOwner ? productionOwnerStaffRole : "",
    production_owner_assigned_at:
      Object.prototype.hasOwnProperty.call(updates, "production_owner_assigned_at")
        ? updates.production_owner_assigned_at
        : hasProductionOwner
        ? currentOrder.production_owner_assigned_at || currentOrder.assigned_at || new Date().toISOString()
        : null,
    production_ready:
      Object.prototype.hasOwnProperty.call(updates, "production_ready")
        ? updates.production_ready
        : isReadyForProductionStatus(nextStatus),
  };
}

function buildActivityEvent(type, note, timestamp = new Date().toISOString()) {
  const staff = getActiveStaffUser();

  return {
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    note,
    staff_id: staff?.id || "",
    staff_name: staff?.name || "Unknown Staff",
    staff_role: staff?.role || "",
    created_at: timestamp,
  };
}

function buildWorkflowDerivedUpdates(currentOrder, updates) {
  const nextStatus = normalizeOperationalStatus(updates.status || currentOrder.status);
  const nextQuoteStatus = normalizeQuoteStatus(
    updates.quote_status || currentOrder.quote_status
  );
  const shouldDeriveStatus = Object.prototype.hasOwnProperty.call(updates, "status");
  const isCanceled =
    nextStatus === "Canceled" || nextQuoteStatus === "Canceled";
  const isArchived = Object.prototype.hasOwnProperty.call(updates, "quote_archived")
    ? updates.quote_archived === true
    : currentOrder.quote_archived === true;

  return {
    ...updates,
    status: isCanceled ? "Canceled" : nextStatus,
    quote_status: isCanceled ? "Canceled" : nextQuoteStatus,
    production_ready: shouldDeriveStatus
      ? isCanceled
        ? false
        : isReadyForProductionStatus(nextStatus)
      : Object.prototype.hasOwnProperty.call(updates, "production_ready")
      ? updates.production_ready
      : currentOrder.production_ready,
    operational_visible: shouldDeriveStatus
      ? isCanceled
        ? false
        : isActiveOperationalStatus(nextStatus)
      : Object.prototype.hasOwnProperty.call(updates, "operational_visible")
      ? updates.operational_visible
      : currentOrder.operational_visible,
    quote_archived: isArchived,
    quote_archived_at:
      Object.prototype.hasOwnProperty.call(updates, "quote_archived_at")
        ? updates.quote_archived_at
        : isArchived
        ? currentOrder.quote_archived_at || new Date().toISOString()
        : null,
  };
}

function buildWorkflowOverrideUpdates(currentOrder, updates) {
  if (!Object.prototype.hasOwnProperty.call(updates, "workflow_overrides")) {
    return updates;
  }

  return {
    ...updates,
    workflow_overrides: normalizeWorkflowOverrides({
      ...normalizeWorkflowOverrides(currentOrder.workflow_overrides),
      ...(updates.workflow_overrides || {}),
    }),
  };
}

function describeOrderUpdate(updates) {
  if (updates.activity_note) return updates.activity_note;
  if (updates.activity_type === "production_blocked") {
    return "Production movement blocked until workflow requirements are satisfied.";
  }
  if (updates.activity_type === "gating_override_used") {
    return "Workflow gating override used.";
  }
  if (updates.quote_archived === true) return "Quote archived from active workflow.";
  if (updates.quote_archived === false) return "Quote restored to active workflow.";
  if (updates.status === "Canceled" || updates.quote_status === "Canceled") {
    return "Workflow canceled while preserving operational and financial history.";
  }
  if (updates.status === "On Hold") return "Order placed on hold.";
  if (updates.activity_type === "resume_from_hold") return "Order resumed from hold.";
  if (updates.status === "Ready For Production") return "Order moved into the production queue.";
  if (updates.status === "Printing") return "Printing started.";
  if (updates.status === "Embroidery") return "Embroidery started.";
  if (updates.status === "QC / Finishing") return "Order moved into QC and finishing.";
  if (updates.status === "Ready For Pickup") return "Order marked ready for pickup.";
  if (updates.status) return `Status changed to ${updates.status}.`;
  if (updates.pickup_status === "Picked Up") return "Order marked as picked up.";
  if (updates.pickup_status === "Ready for Pickup") return "Order marked ready for pickup.";
  if (updates.payment_history) return "Payment recorded.";
  if (updates.deposit?.status === "paid") return "Deposit recorded as paid.";
  if (updates.deposit?.status === "pending") return "Deposit requested.";
  if (updates.deposit_workflow_status === "Deposit Requested") return "Deposit requested.";
  if (updates.deposit_workflow_status === "Deposit Received") return "Deposit received.";
  if (updates.quote_status) return `Quote status changed to ${updates.quote_status}.`;
  if (updates.artwork_approval_status === "Approved") return "Artwork approved.";
  if (updates.artwork_approval_status === "Needs Revision") return "Artwork revision requested.";
  if (updates.artwork_approval_status === "Pending Review") return "Artwork moved to pending review.";
  if (updates.artwork_files) return "Artwork file uploaded.";
  if (updates.size_breakdown) return "Size breakdown updated.";
  if (updates.quote) return "Quote snapshot saved.";
  if (updates.approval_note) return "Approval note updated.";
  return "Order updated.";
}

function describeActivityType(updates) {
  if (updates.activity_type) return updates.activity_type;
  if (Object.prototype.hasOwnProperty.call(updates, "quote_archived")) return "quote_archive";
  if (updates.status === "Canceled" || updates.quote_status === "Canceled") return "canceled";
  if (
    Object.prototype.hasOwnProperty.call(updates, "assigned_to_staff_id") ||
    Object.prototype.hasOwnProperty.call(updates, "production_owner_staff_id")
  ) {
    return "assignment";
  }
  if (updates.status) return "status_change";
  if (updates.pickup_status) return "pickup";
  if (updates.payment_history) return "payment";
  if (updates.deposit) return "deposit";
  if (updates.deposit_workflow_status) return "deposit";
  if (updates.quote_status) return "quote_status";
  if (updates.artwork_approval_status) return "artwork_approval";
  if (updates.artwork_files) return "artwork";
  if (updates.size_breakdown) return "sizes";
  if (updates.quote) return "quote";
  if (updates.approval_note) return "approval_note";
  return "updated";
}

function stripActivityMeta(updates) {
  const { activity_note: _ACTIVITY_NOTE, activity_type: _ACTIVITY_TYPE, ...cleanUpdates } =
    updates;
  return cleanUpdates;
}

function buildPaymentValidationError(validation) {
  const error = new Error(validation.message || "Invalid payment amount.");
  error.code = validation.code || "INVALID_AMOUNT";
  return error;
}

function resolveOperationalEventPath(order = {}, workflowLabel = "") {
  const orderNumber = order.order_number || "";
  if (!orderNumber) return "";

  if (workflowLabel === "Quote Lifecycle") {
    return `/admin/quotes/${orderNumber}`;
  }

  return `/admin/orders/${orderNumber}`;
}

function buildOperationalEventRecord(order, eventType, summary, options = {}) {
  if (!order?.order_number || !summary) return null;

  const staff = options.staffUser || getActiveStaffUser();
  const workflowLabel = options.workflowLabel || "Operations";

  return {
    event_type: eventType,
    workflow_label: workflowLabel,
    reference_type: options.referenceType || "order",
    reference_id: order.order_number,
    reference_label: `Order ${order.order_number}`,
    reference_path:
      Object.prototype.hasOwnProperty.call(options, "referencePath")
        ? options.referencePath
        : resolveOperationalEventPath(order, workflowLabel),
    summary,
    staff_id: staff?.id || "",
    staff_name: staff?.name || "Unknown Staff",
    staff_role: staff?.role || "",
    created_at: options.createdAt || new Date().toISOString(),
  };
}

function emitCustomerTimelineEventForOrder(order, eventType, summary, metadata = {}, timestamp) {
  const customer = resolveCustomerForRecord(order);
  if (!customer?.id) return;

  addCustomerTimelineEvent(customer.id, {
    eventType,
    summary,
    timestamp: timestamp || new Date().toISOString(),
    metadata: {
      orderNumber: order.order_number,
      workflowState: order.workflow_state,
      ...metadata,
    },
  });
}

function emitOperationalEventsForOrderUpdate(previousOrder, nextOrder, updates = {}, timestamp) {
  if (!previousOrder || !nextOrder) return;

  const previousFinancials = normalizeOrderFinancials(previousOrder);
  const nextFinancials = normalizeOrderFinancials(nextOrder);
  const recentPayment = Array.isArray(updates.payment_history) ? updates.payment_history[0] : null;
  const paymentMethod = recentPayment?.method ? ` via ${recentPayment.method}` : "";
  const normalizedPreviousStatus = normalizeOperationalStatus(previousOrder.status);
  const normalizedNextStatus = normalizeOperationalStatus(nextOrder.status);
  const previousQuoteStatus = normalizeQuoteStatus(previousOrder.quote_status);
  const nextQuoteStatus = normalizeQuoteStatus(nextOrder.quote_status);
  const previousPickupStatus = String(previousOrder.pickup_status || "").trim();
  const nextPickupStatus = String(nextOrder.pickup_status || "").trim();
  const previousCanceled =
    normalizedPreviousStatus === "Canceled" || previousQuoteStatus === "Canceled";
  const nextCanceled = normalizedNextStatus === "Canceled" || nextQuoteStatus === "Canceled";
  const previousDepositApplied = Number(previousFinancials.deposit_applied || 0);
  const nextDepositApplied = Number(nextFinancials.deposit_applied || 0);
  const depositRecordedAmount = Math.max(0, nextDepositApplied - previousDepositApplied);
  const previousArtworkApprovalStatus = normalizeArtworkApprovalStatus(
    previousOrder.artwork_approval_status || previousOrder.approval_status,
    { required: getArtworkApprovalRequirement(previousOrder) }
  );
  const nextArtworkApprovalStatus = normalizeArtworkApprovalStatus(
    nextOrder.artwork_approval_status || nextOrder.approval_status,
    { required: getArtworkApprovalRequirement(nextOrder) }
  );
  const previousDepositWorkflowStatus = normalizeDepositWorkflowStatus(
    previousOrder.deposit_workflow_status || previousOrder.deposit?.status,
    previousOrder
  );
  const nextDepositWorkflowStatus = normalizeDepositWorkflowStatus(
    nextOrder.deposit_workflow_status || nextOrder.deposit?.status,
    nextOrder
  );
  const previousOverrides = normalizeWorkflowOverrides(previousOrder.workflow_overrides);
  const nextOverrides = normalizeWorkflowOverrides(nextOrder.workflow_overrides);
  const eventRecords = [];
  const assignmentChanged =
    previousOrder.assigned_to_staff_id !== nextOrder.assigned_to_staff_id ||
    previousOrder.assigned_to_staff_name !== nextOrder.assigned_to_staff_name;
  const productionOwnerChanged =
    previousOrder.production_owner_staff_id !== nextOrder.production_owner_staff_id ||
    previousOrder.production_owner_staff_name !== nextOrder.production_owner_staff_name;

  if (
    Array.isArray(updates.payment_history) &&
    depositRecordedAmount > 0
  ) {
    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "deposit_recorded",
        `Deposit recorded for ${money(depositRecordedAmount)}${paymentMethod}.`,
        {
          createdAt: timestamp,
          workflowLabel: "Payments",
        }
      )
    );
  }

  if (
    previousArtworkApprovalStatus !== nextArtworkApprovalStatus &&
    nextArtworkApprovalStatus === "Approved"
  ) {
    emitCustomerTimelineEventForOrder(
      nextOrder,
      "artwork_approved",
      `Artwork approved for order ${nextOrder.order_number}.`,
      {
        previousArtworkApprovalStatus,
        nextArtworkApprovalStatus,
      },
      timestamp
    );

    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "artwork_approved",
        "Artwork approval completed.",
        {
          createdAt: timestamp,
          workflowLabel: "Artwork Workflow",
        }
      )
    );
  }

  if (
    previousArtworkApprovalStatus !== nextArtworkApprovalStatus &&
    nextArtworkApprovalStatus === "Needs Revision"
  ) {
    emitCustomerTimelineEventForOrder(
      nextOrder,
      "artwork_revision_requested",
      `Artwork revision requested for order ${nextOrder.order_number}.`,
      {
        previousArtworkApprovalStatus,
        nextArtworkApprovalStatus,
      },
      timestamp
    );

    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "artwork_revision_requested",
        "Artwork marked as needing revision.",
        {
          createdAt: timestamp,
          workflowLabel: "Artwork Workflow",
        }
      )
    );
  }

  if (
    previousDepositWorkflowStatus !== nextDepositWorkflowStatus &&
    nextDepositWorkflowStatus === "Deposit Requested"
  ) {
    emitCustomerTimelineEventForOrder(
      nextOrder,
      "deposit_requested",
      `Deposit requested for order ${nextOrder.order_number}.`,
      {
        previousDepositWorkflowStatus,
        nextDepositWorkflowStatus,
      },
      timestamp
    );

    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "deposit_requested",
        "Deposit requested.",
        {
          createdAt: timestamp,
          workflowLabel: "Payments",
        }
      )
    );
  }

  if (
    previousDepositWorkflowStatus !== nextDepositWorkflowStatus &&
    nextDepositWorkflowStatus === "Deposit Received"
  ) {
    emitCustomerTimelineEventForOrder(
      nextOrder,
      "deposit_received",
      `Deposit received for order ${nextOrder.order_number}.`,
      {
        previousDepositWorkflowStatus,
        nextDepositWorkflowStatus,
      },
      timestamp
    );

    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "deposit_received",
        "Deposit received and cleared for workflow progression.",
        {
          createdAt: timestamp,
          workflowLabel: "Payments",
        }
      )
    );
  }

  if (
    Array.isArray(updates.payment_history) &&
    previousFinancials.payment_status !== "Paid" &&
    nextFinancials.payment_status === "Paid"
  ) {
    const finalPaymentAmount = Number(recentPayment?.amount || 0);

    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "final_payment_recorded",
        `Final payment recorded for ${money(finalPaymentAmount)}${paymentMethod}. Order balance is now settled.`,
        {
          createdAt: timestamp,
          workflowLabel: "Payments",
        }
      )
    );
  }

  if (!previousCanceled && nextCanceled) {
    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "order_canceled",
        `${nextQuoteStatus === "Canceled" && previousQuoteStatus !== "Canceled" ? "Quote workflow" : "Order"} canceled.`,
        {
          createdAt: timestamp,
          workflowLabel:
            nextQuoteStatus === "Canceled" && previousQuoteStatus !== "Canceled"
              ? "Quote Lifecycle"
              : "Production Workflow",
          referencePath:
            nextQuoteStatus === "Canceled" && previousQuoteStatus !== "Canceled"
              ? `/admin/quotes/${nextOrder.order_number}`
              : `/admin/orders/${nextOrder.order_number}`,
        }
      )
    );
  }

  if (
    normalizedPreviousStatus !== "On Hold" &&
    normalizedPreviousStatus !== "Ready For Production" &&
    normalizedNextStatus === "Ready For Production"
  ) {
    emitCustomerTimelineEventForOrder(
      nextOrder,
      "moved_to_production",
      `Order ${nextOrder.order_number} moved to production.`,
      {
        previousStatus: previousOrder.status,
        nextStatus: nextOrder.status,
      },
      timestamp
    );

    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "moved_to_production",
        "Order released into the production queue.",
        {
          createdAt: timestamp,
          workflowLabel: "Production Workflow",
        }
      )
    );
  }

  if (
    !isProductionExecutionStatus(normalizedPreviousStatus) &&
    ["Printing", "Embroidery"].includes(normalizedNextStatus)
  ) {
    emitCustomerTimelineEventForOrder(
      nextOrder,
      "production_started",
      `${normalizedNextStatus} started for order ${nextOrder.order_number}.`,
      {
        previousStatus: previousOrder.status,
        nextStatus: nextOrder.status,
        productionStage: normalizedNextStatus,
      },
      timestamp
    );

    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "production_started",
        `${normalizedNextStatus} started${nextOrder.assigned_to_staff_name ? ` by ${nextOrder.assigned_to_staff_name}` : ""}.`,
        {
          createdAt: timestamp,
          workflowLabel: "Production Workflow",
        }
      )
    );

    if (normalizedNextStatus === "Printing") {
      emitCustomerTimelineEventForOrder(
        nextOrder,
        "moved_to_printing",
        `Order ${nextOrder.order_number} moved into printing.`,
        {
          previousStatus: previousOrder.status,
          nextStatus: nextOrder.status,
        },
        timestamp
      );

      eventRecords.push(
        buildOperationalEventRecord(
          nextOrder,
          "moved_to_printing",
          "Order moved into printing.",
          {
            createdAt: timestamp,
            workflowLabel: "Production Workflow",
          }
        )
      );
    }
  }

  if (
    normalizedPreviousStatus !== "QC / Finishing" &&
    normalizedNextStatus === "QC / Finishing"
  ) {
    emitCustomerTimelineEventForOrder(
      nextOrder,
      "moved_to_qc",
      `Order ${nextOrder.order_number} moved to QC / finishing.`,
      {
        previousStatus: previousOrder.status,
        nextStatus: nextOrder.status,
      },
      timestamp
    );

    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "moved_to_qc",
        "Order moved into QC and finishing.",
        {
          createdAt: timestamp,
          workflowLabel: "Production Workflow",
        }
      )
    );
  }

  if (
    normalizedPreviousStatus !== "Ready For Pickup" &&
    normalizedNextStatus === "Ready For Pickup"
  ) {
    emitCustomerTimelineEventForOrder(
      nextOrder,
      "ready_for_pickup",
      `Order ${nextOrder.order_number} is ready for pickup.`,
      {
        previousStatus: previousOrder.status,
        nextStatus: nextOrder.status,
      },
      timestamp
    );

    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "ready_for_pickup",
        "Order marked ready for pickup.",
        {
          createdAt: timestamp,
          workflowLabel: "Pickup Handling",
        }
      )
    );
  }

  if (
    normalizedPreviousStatus !== "On Hold" &&
    normalizedNextStatus === "On Hold"
  ) {
    emitCustomerTimelineEventForOrder(
      nextOrder,
      "order_on_hold",
      `Order ${nextOrder.order_number} was placed on hold.`,
      {
        previousStatus: previousOrder.status,
        nextStatus: nextOrder.status,
      },
      timestamp
    );

    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "order_on_hold",
        "Order placed on hold.",
        {
          createdAt: timestamp,
          workflowLabel: "Production Workflow",
        }
      )
    );
  }

  if (
    normalizedPreviousStatus === "On Hold" &&
    normalizedNextStatus !== "On Hold"
  ) {
    emitCustomerTimelineEventForOrder(
      nextOrder,
      "resumed_from_hold",
      `Order ${nextOrder.order_number} resumed from hold.`,
      {
        previousStatus: previousOrder.status,
        nextStatus: nextOrder.status,
      },
      timestamp
    );

    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "resumed_from_hold",
        `Order resumed from hold and returned to ${normalizedNextStatus}.`,
        {
          createdAt: timestamp,
          workflowLabel: "Production Workflow",
        }
      )
    );
  }

  if (
    normalizedPreviousStatus !== "Completed" &&
    normalizedNextStatus === "Completed"
  ) {
    emitCustomerTimelineEventForOrder(
      nextOrder,
      "order_completed",
      `Order ${nextOrder.order_number} completed.`,
      {
        previousStatus: previousOrder.status,
        nextStatus: nextOrder.status,
      },
      timestamp
    );

    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "order_completed",
        `Order marked complete${nextOrder.assigned_to_staff_name ? ` by ${nextOrder.assigned_to_staff_name}` : ""}.`,
        {
          createdAt: timestamp,
          workflowLabel: "Production Workflow",
        }
      )
    );

    if (nextOrder.assigned_to_staff_name) {
      eventRecords.push(
        buildOperationalEventRecord(
          nextOrder,
          "assignment_completed",
          `Assigned production work completed by ${nextOrder.assigned_to_staff_name}.`,
          {
            createdAt: timestamp,
            workflowLabel: "Assignments",
          }
        )
      );
    }
  }

  if (
    previousPickupStatus !== "Picked Up" &&
    nextPickupStatus === "Picked Up"
  ) {
    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "pickup_completed",
        "Pickup marked completed.",
        {
          createdAt: timestamp,
          workflowLabel: "Pickup Handling",
        }
      )
    );
  }

  if (assignmentChanged) {
    emitCustomerTimelineEventForOrder(
      nextOrder,
      "production_assignment_changed",
      `Production assignment updated for order ${nextOrder.order_number}.`,
      {
        previousAssignedStaff: previousOrder.assigned_to_staff_name || "Unassigned",
        nextAssignedStaff: nextOrder.assigned_to_staff_name || "Unassigned",
      },
      timestamp
    );

    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "production_assignment_changed",
        `Assigned staff changed from ${previousOrder.assigned_to_staff_name || "Unassigned"} to ${nextOrder.assigned_to_staff_name || "Unassigned"}.`,
        {
          createdAt: timestamp,
          workflowLabel: "Assignments",
        }
      )
    );
  }

  if (productionOwnerChanged) {
    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "production_owner_changed",
        `Production owner changed from ${previousOrder.production_owner_staff_name || "Unassigned"} to ${nextOrder.production_owner_staff_name || "Unassigned"}.`,
        {
          createdAt: timestamp,
          workflowLabel: "Assignments",
        }
      )
    );
  }

  if (
    updates.deposit?.status === "pending" &&
    updates.deposit?.requested_at &&
    updates.deposit.requested_at !== previousOrder.deposit?.requested_at
  ) {
    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "deposit_request_sent",
        `Deposit request prepared${updates.deposit.request_channel ? ` via ${updates.deposit.request_channel}` : ""}.`,
        {
          createdAt: timestamp,
          workflowLabel: "Payments",
        }
      )
    );
  }

  if (updates.activity_type === "customer_ready_sent") {
    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "customer_ready_communication_sent",
        updates.activity_note || "Customer-ready communication sent.",
        {
          createdAt: timestamp,
          workflowLabel: "Front Counter",
        }
      )
    );
  }

  if (updates.activity_type === "production_blocked") {
    emitCustomerTimelineEventForOrder(
      nextOrder,
      "production_blocked",
      updates.activity_note || `Production blocked for order ${nextOrder.order_number}.`,
      {
        blockingReasons: updates.last_production_blocked_reasons || [],
      },
      timestamp
    );

    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "production_blocked",
        updates.activity_note || "Production blocked by workflow gating.",
        {
          createdAt: timestamp,
          workflowLabel: "Production Workflow",
        }
      )
    );
  }

  if (
    updates.activity_type === "gating_override_used" ||
    Object.keys(nextOverrides).some(
      (key) => nextOverrides[key].active && nextOverrides[key].usedAt !== previousOverrides[key].usedAt
    )
  ) {
    emitCustomerTimelineEventForOrder(
      nextOrder,
      "gating_override_used",
      updates.activity_note || `Workflow gating override used for order ${nextOrder.order_number}.`,
      {},
      timestamp
    );

    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "gating_override_used",
        updates.activity_note || "Workflow gating override used.",
        {
          createdAt: timestamp,
          workflowLabel: "Production Workflow",
        }
      )
    );
  }

  if (
    updates.activity_type === "release_to_production" &&
    previousQuoteStatus !== "Ready For Production" &&
    nextQuoteStatus === "Ready For Production"
  ) {
    eventRecords.push(
      buildOperationalEventRecord(
        nextOrder,
        "quote_released_to_production",
        "Quote released into the production workflow.",
        {
          createdAt: timestamp,
          workflowLabel: "Quote Lifecycle",
          referencePath: `/admin/quotes/${nextOrder.order_number}`,
        }
      )
    );
  }

  if (
    previousOrder.operational_visible === false &&
    nextOrder.operational_visible === false &&
    Object.keys(stripActivityMeta(updates)).length > 0
  ) {
    emitCustomerTimelineEventForOrder(
      nextOrder,
      "quote_updated",
      `Quote ${nextOrder.order_number} updated.`,
      {
        previousQuoteStatus,
        nextQuoteStatus,
      },
      timestamp
    );
  }

  eventRecords.filter(Boolean).forEach((eventRecord) => {
    createOperationalEvent(eventRecord);
  });
}

export function getStoredOrders() {
  return readStoredOrders();
}

export function saveStoredOrders(orders) {
  if (!hasBrowserStorage()) return false;

  const normalizedOrders = Array.isArray(orders)
    ? orders.map((order) => normalizeStoredOrder(order))
    : [];

  const saved = setRawStorageItem(STORAGE_KEY, JSON.stringify(normalizedOrders));
  if (!saved) {
    return false;
  }

  emitOrdersUpdated();
  return true;
}

export function subscribeToStoredOrders(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  orderListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      orderListeners.delete(listener);
    };
  }

  const handleStorage = (event) => {
    if (!event.key || event.key === STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    orderListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useStoredOrders() {
  return useSyncExternalStore(subscribeToStoredOrders, getStoredOrders, () => EMPTY_ORDERS);
}

export function seedStoredOrders(seedOrders = demoOrders) {
  const currentOrders = getStoredOrders();
  if (currentOrders.length) return currentOrders;

  const nextOrders = (Array.isArray(seedOrders) ? seedOrders : []).map((order, index) =>
    buildSeedOrder(order, index)
  );

  if (!saveStoredOrders(nextOrders)) {
    throw new Error("Unable to seed stored orders.");
  }
  return nextOrders;
}

export function createStoredOrder(orderInput) {
  const currentOrders = getStoredOrders();
  const orderNumber = `TC-${Date.now().toString().slice(-6)}`;
  const createdAt = new Date().toISOString();
  const createdAuditFields = buildStaffAuditFields("created");
  const matchedCustomer = resolveCustomerForRecord(orderInput);

  const order = {
    ...orderInput,
    ...createdAuditFields,
    order_number: orderNumber,
    customer_id: normalizeCustomerId(orderInput.customer_id || matchedCustomer?.id) || "",
    customer_email:
      orderInput.customer_email || orderInput.email || matchedCustomer?.email || "",
    status: normalizeOperationalStatus(orderInput.status || "New"),
    date: formatShortDate(createdAt),
    created_at: createdAt,
    updated_at: createdAt,
    source: orderInput.source || "Staff Entry",
    activity_log: [
      buildActivityEvent(
        "created",
        `Order created for ${orderInput.customer_name || "Walk-in Customer"}.`,
        createdAt
      ),
    ],
  };

  const nextOrders = [order, ...currentOrders];
  if (!saveStoredOrders(nextOrders)) {
    throw new Error("Unable to save order. Browser storage write failed.");
  }

  emitCustomerTimelineEventForOrder(
    normalizeStoredOrder(order),
    order.operational_visible === false ? "quote_created" : "order_created",
    `${order.operational_visible === false ? "Quote" : "Order"} ${orderNumber} created.`,
    {
      quoteStatus: order.quote_status,
      orderStatus: order.status,
    },
    createdAt
  );

  triggerOrderNotification(NOTIFICATION_TYPES.newCustomerRequest, normalizeStoredOrder(order));

  if (order.customer_artwork_id) {
    if (order.operational_visible === false || order.quote_status !== "Ready For Production") {
      persistArtworkRelationship(
        linkCustomerArtworkToQuote(order.customer_artwork_id, order.order_number),
        {
          artworkId: order.customer_artwork_id,
          orderNumber: order.order_number,
          relationship: "quote",
        }
      );
    } else {
      persistArtworkRelationship(
        linkCustomerArtworkToOrder(order.customer_artwork_id, order.order_number),
        {
          artworkId: order.customer_artwork_id,
          orderNumber: order.order_number,
          relationship: "order",
        }
      );
    }
  }

  return order;
}

export function findStoredOrder(orderNumber) {
  return getStoredOrders().find((order) => order.order_number === orderNumber);
}

export function updateStoredOrder(orderNumber, updates) {
  const currentOrders = getStoredOrders();
  const now = new Date().toISOString();
  let updatedOrder = null;
  let previousOrder = null;

  const nextOrders = currentOrders.map((order) => {
    if (order.order_number !== orderNumber) return order;

    previousOrder = order;

    const cleanUpdates = stripActivityMeta(
      buildWorkflowDerivedUpdates(
        order,
        buildWorkflowOverrideUpdates(order, buildAssignmentUpdates(order, updates))
      )
    );

    updatedOrder = normalizeStoredOrder({
      ...order,
      ...cleanUpdates,
      customer_id:
        normalizeCustomerId(cleanUpdates.customer_id || order.customer_id) ||
        resolveCustomerForRecord({ ...order, ...cleanUpdates })?.id ||
        "",
      ...buildStaffAuditFields("updated"),
      created_at: order.created_at,
      updated_at: now,
      activity_log: [
        buildActivityEvent(
          describeActivityType(updates),
          describeOrderUpdate(updates),
          now
        ),
        ...(order.activity_log || []),
      ],
    });

    return updatedOrder;
  });

  if (!saveStoredOrders(nextOrders)) {
    throw new Error("Unable to update order. Browser storage write failed.");
  }

  emitOperationalEventsForOrderUpdate(previousOrder, updatedOrder, updates, now);

  if (
    updatedOrder &&
    previousOrder &&
    updatedOrder.artwork_approval_status !== previousOrder.artwork_approval_status
  ) {
    persistArtworkApprovalMetadata(
      [
        updatedOrder.customer_artwork_id,
        ...(Array.isArray(updatedOrder.artwork_files)
          ? updatedOrder.artwork_files.map((file) => file?.id)
          : []),
      ],
      updatedOrder.artwork_approval_status
    );
  }

  if (updatedOrder && previousOrder) {
    const previousQuoteStatus = normalizeStatusText(previousOrder.quote_status);
    const nextQuoteStatus = normalizeStatusText(updatedOrder.quote_status);
    const previousApprovalStatus = normalizeStatusText(previousOrder.approval_status);
    const nextApprovalStatus = normalizeStatusText(updatedOrder.approval_status);
    const previousArtworkStatus = normalizeStatusText(previousOrder.artwork_approval_status);
    const nextArtworkStatus = normalizeStatusText(updatedOrder.artwork_approval_status);
    const previousDepositStatus = normalizeStatusText(previousOrder.deposit_workflow_status);
    const nextDepositStatus = normalizeStatusText(updatedOrder.deposit_workflow_status);
    const previousStatus = normalizeOperationalStatus(previousOrder.status);
    const nextStatus = normalizeOperationalStatus(updatedOrder.status);

    if (previousQuoteStatus !== nextQuoteStatus && nextQuoteStatus === "Awaiting Approval") {
      triggerOrderNotification(NOTIFICATION_TYPES.quoteReadyForApproval, updatedOrder);
    }

    if (
      (!isApprovedState(previousApprovalStatus) && isApprovedState(nextApprovalStatus)) ||
      (previousQuoteStatus !== "Approved" && nextQuoteStatus === "Approved")
    ) {
      triggerOrderNotification(NOTIFICATION_TYPES.quoteApproved, updatedOrder);
    }

    if (
      previousArtworkStatus !== nextArtworkStatus &&
      nextArtworkStatus === "Needs Revision"
    ) {
      triggerOrderNotification(NOTIFICATION_TYPES.artworkRevisionRequested, updatedOrder);
    }

    if (
      previousArtworkStatus !== nextArtworkStatus &&
      nextArtworkStatus === "Approved"
    ) {
      triggerOrderNotification(NOTIFICATION_TYPES.artworkApproved, updatedOrder);
    }

    if (
      previousDepositStatus !== nextDepositStatus &&
      nextDepositStatus === "Deposit Requested"
    ) {
      triggerOrderNotification(NOTIFICATION_TYPES.depositRequested, updatedOrder);
    }

    if (
      !["Ready For Production", "Printing", "Embroidery"].includes(previousStatus) &&
      ["Ready For Production", "Printing", "Embroidery"].includes(nextStatus)
    ) {
      triggerOrderNotification(NOTIFICATION_TYPES.orderInProduction, updatedOrder);
    }

    if (previousStatus !== "Ready For Pickup" && nextStatus === "Ready For Pickup") {
      triggerOrderNotification(NOTIFICATION_TYPES.orderReadyForPickup, updatedOrder);
    }

    if (previousStatus !== "Completed" && nextStatus === "Completed") {
      triggerOrderNotification(NOTIFICATION_TYPES.orderCompleted, updatedOrder);
    }
  }

  if (updatedOrder?.customer_artwork_id) {
    const artworkIdChanged =
      updatedOrder.customer_artwork_id !== (previousOrder?.customer_artwork_id || "");

    if (updates.activity_type === "release_to_production") {
      persistArtworkRelationship(
        linkCustomerArtworkToOrder(updatedOrder.customer_artwork_id, updatedOrder.order_number),
        {
          artworkId: updatedOrder.customer_artwork_id,
          orderNumber: updatedOrder.order_number,
          relationship: "order",
          activityType: updates.activity_type,
        }
      );
    } else if (artworkIdChanged) {
      if (updatedOrder.operational_visible === false || updatedOrder.quote_status !== "Ready For Production") {
        persistArtworkRelationship(
          linkCustomerArtworkToQuote(updatedOrder.customer_artwork_id, updatedOrder.order_number),
          {
            artworkId: updatedOrder.customer_artwork_id,
            orderNumber: updatedOrder.order_number,
            relationship: "quote",
          }
        );
      } else {
        persistArtworkRelationship(
          linkCustomerArtworkToOrder(updatedOrder.customer_artwork_id, updatedOrder.order_number),
          {
            artworkId: updatedOrder.customer_artwork_id,
            orderNumber: updatedOrder.order_number,
            relationship: "order",
          }
        );
      }
    }
  }

  return updatedOrder;
}

export function recordStoredOrderPayment(orderNumber, paymentInput = {}, options = {}) {
  const order = findStoredOrder(orderNumber);
  if (!order) return null;

  const financialOptions = options.financialOptions || {};
  const activeStaff = options.staffUser || getActiveStaffUser();
  const normalizedOrder = normalizeOrderFinancials(order, financialOptions);
  const validation = validatePaymentAmount({
    amount: paymentInput.amount,
    remainingBalance: normalizedOrder.balance_due,
  });

  if (!validation.valid) {
    throw buildPaymentValidationError(validation);
  }

  const paymentEntry = {
    id: `payment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    amount: Number(paymentInput.amount) || 0,
    method: paymentInput.method || "Other",
    timestamp: new Date().toISOString(),
    staff_member: activeStaff?.name || "Unknown Staff",
    note: String(paymentInput.note || "").trim(),
  };
  const paymentHistory = [paymentEntry, ...(order.payment_history || [])];
  const nextFinancials = normalizeOrderFinancials(
    {
      ...order,
      payment_history: paymentHistory,
    },
    financialOptions
  );
  const paymentNote = paymentEntry.note ? ` Note: ${paymentEntry.note}` : "";
  const statusNote =
    nextFinancials.payment_status === "Paid"
      ? " Order is now paid in full."
      : ` Remaining balance: ${money(nextFinancials.balance_due)}.`;
  const depositPaidAmount =
    Number(nextFinancials.deposit_amount || 0) > 0
      ? Number(nextFinancials.deposit_applied || 0)
      : Number(order.deposit_paid_amount || 0) || 0;
  const prePaymentDepositOutstanding = Number(normalizedOrder.deposit_outstanding || 0);

  recordPayment({
    customer_id: order.customer_id,
    order_id: order.id || "",
    order_number: order.order_number,
    payment_type:
      prePaymentDepositOutstanding > 0 && Number(paymentEntry.amount || 0) <= prePaymentDepositOutstanding
        ? "deposit"
        : nextFinancials.payment_status === "Paid"
        ? "full"
        : "partial",
    status: "captured",
    amount: paymentEntry.amount,
    method: paymentEntry.method,
    provider: "manual",
    recorded_by_staff_user_id: activeStaff?.id || "",
    captured_at: paymentEntry.timestamp,
    note: paymentEntry.note,
    metadata: {
      source: "legacy_order_payment_recording",
      legacyPaymentId: paymentEntry.id,
    },
    created_at: paymentEntry.timestamp,
    updated_at: paymentEntry.timestamp,
  });

  return updateStoredOrder(orderNumber, {
    payment_history: paymentHistory,
    payment_status: nextFinancials.payment_status,
    total_paid: nextFinancials.total_paid,
    amount_paid: nextFinancials.total_paid,
    balance_due: nextFinancials.balance_due,
    deposit_paid_amount: depositPaidAmount,
    deposit_workflow_status:
      Number(nextFinancials.deposit_amount || 0) > 0 &&
      Number(nextFinancials.deposit_applied || 0) >= Number(nextFinancials.deposit_amount || 0)
        ? "Deposit Received"
        : order.deposit_workflow_status,
    activity_type: "payment",
    activity_note: `Recorded payment of ${money(paymentEntry.amount)} via ${paymentEntry.method}.${paymentNote}${statusNote}`,
  });
}

export function duplicateStoredOrder(orderNumber) {
  const original = findStoredOrder(orderNumber);
  if (!original) return null;

  const copiedOrder = {
    ...original,
    status: "New",
    approval_status: "Not Sent",
    approval_note: "",
    approval_sent_at: null,
    approved_at: null,
    revision_requested_at: null,
    customer_approval_note: "",
    customer_approved_at: null,
    customer_revision_requested_at: null,
    source: "Repeat Order",
    notes: original.notes ? `Repeat order copied from ${original.order_number}. ${original.notes}` : `Repeat order copied from ${original.order_number}.`,
  };

  delete copiedOrder.order_number;
  delete copiedOrder.created_at;
  delete copiedOrder.updated_at;
  delete copiedOrder.date;
  delete copiedOrder.created_by_staff_id;
  delete copiedOrder.created_by_staff_name;
  delete copiedOrder.created_by_staff_role;
  delete copiedOrder.updated_by_staff_id;
  delete copiedOrder.updated_by_staff_name;
  delete copiedOrder.updated_by_staff_role;
  delete copiedOrder.activity_log;

  return createStoredOrder(copiedOrder);
}
