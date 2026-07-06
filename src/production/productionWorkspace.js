import { normalizeProductionType } from "../constants/productionTypes";
import { formatShortDate } from "../lib/dateFormatting";
import {
  normalizeWorkflowState,
  getWorkflowStateTone,
} from "../lib/operationalWorkflow";
import {
  getAvailableProductionActions,
  getOrderWorkflowState,
  isActiveOperationalStatus,
  isCanceledOperationalStatus,
  isCompletedOperationalStatus,
  isOnHoldOperationalStatus,
  normalizeOperationalStatus,
} from "../orders/orderWorkflow";
import { buildProductionReadinessSummary } from "../orders/workflowPresentation";
import { buildQueuePriority } from "../queue/buildQueuePriority";

export const PRODUCTION_STATUS_FILTERS = [
  { key: "active", label: "All Active Work" },
  { key: "blocked", label: "Blocked" },
  { key: "awaiting-deposit", label: "Awaiting Deposit" },
  { key: "ready-for-production", label: "Ready for Production" },
  { key: "printing", label: "Printing" },
  { key: "embroidery", label: "Embroidery" },
  { key: "qc-finishing", label: "QC / Finishing" },
  { key: "ready-for-pickup", label: "Ready for Pickup" },
  { key: "on-hold", label: "On Hold" },
  { key: "completed", label: "Completed" },
  { key: "canceled", label: "Canceled" },
  { key: "unassigned", label: "Unassigned Work" },
  { key: "urgent", label: "Urgent" },
];

export const PRODUCTION_METHOD_FILTERS = [
  { key: "all", label: "All Workflows" },
  { key: "dtf", label: "DTF" },
  { key: "embroidery", label: "Embroidery" },
  { key: "screen", label: "Screen Print" },
];

export const PRODUCTION_DATE_FILTERS = [
  { key: "all", label: "Any Date" },
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "custom", label: "Custom Range" },
];

export const PRODUCTION_VIEW_MODES = [
  { key: "table", label: "Table View" },
  { key: "queue", label: "Queue View" },
];

export function normalizeLookup(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeProductionOrder(order) {
  const normalizedStatus = normalizeOperationalStatus(order.status || "New");
  const workflowState = normalizeWorkflowState(
    getOrderWorkflowState({ ...order, status: normalizedStatus })
  );
  const queuePriority = buildQueuePriority({ ...order, status: normalizedStatus });
  const productionReadiness = buildProductionReadinessSummary({
    ...order,
    status: normalizedStatus,
    workflow_state: workflowState,
  });

  return {
    ...order,
    customer_name: order.customer_name || "Walk-in Customer",
    garment: order.garment || order.item || "Custom garment",
    assigned_to_staff_name: order.assigned_to_staff_name || "Unassigned",
    production_owner_staff_name:
      order.production_owner_staff_name || order.assigned_to_staff_name || "Unassigned",
    decoration_type: normalizeProductionType(order.decoration_type),
    status: normalizedStatus,
    workflow_state: workflowState,
    workflow_tone: getWorkflowStateTone(workflowState),
    production_readiness: productionReadiness,
    artwork_count:
      Number(order.artwork_count) ||
      (Array.isArray(order.artwork_files) ? order.artwork_files.length : 0) ||
      (order.customer_artwork_id ? 1 : 0),
    linked_artwork: Boolean(
      (Array.isArray(order.artwork_files) && order.artwork_files.length) || order.customer_artwork_id
    ),
    rush_active:
      typeof order.is_rush === "boolean" ? order.is_rush : queuePriority.overdue || queuePriority.dueSoon,
    queue_priority: queuePriority,
    available_actions: getAvailableProductionActions(
      { ...order, status: normalizedStatus, workflow_state: workflowState },
      { compact: false }
    ),
  };
}

function getOrderArtworkLabel(order) {
  return (order.artwork_files || [])
    .map((file) => file?.file_name || file?.name || "")
    .filter(Boolean)
    .join(" ");
}

export function getOrderSearchText(order) {
  return normalizeLookup(
    [
      order.order_number,
      order.customer_name,
      order.garment,
      order.decoration_type,
      order.assigned_to_staff_name,
      order.status,
      order.due_date,
      order.created_at,
      getOrderArtworkLabel(order),
    ].join(" ")
  );
}

export function getOrderFilterDate(order) {
  if (order.due_date) {
    return new Date(`${order.due_date}T00:00:00`);
  }

  if (order.created_at) {
    const createdAt = new Date(order.created_at);
    createdAt.setHours(0, 0, 0, 0);
    return createdAt;
  }

  return null;
}

function buildWeekStart(today) {
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  start.setHours(0, 0, 0, 0);
  return start;
}

function buildWeekEnd(today) {
  const end = buildWeekStart(today);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function buildMonthEnd(today) {
  return new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
}

export function matchesDateFilter(order, dateFilter, customStart, customEnd) {
  if (dateFilter === "all") return true;

  const orderDate = getOrderFilterDate(order);
  if (!orderDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dateFilter === "today") {
    return orderDate.getTime() === today.getTime();
  }

  if (dateFilter === "week") {
    return orderDate >= buildWeekStart(today) && orderDate <= buildWeekEnd(today);
  }

  if (dateFilter === "month") {
    return (
      orderDate >= new Date(today.getFullYear(), today.getMonth(), 1) &&
      orderDate <= buildMonthEnd(today)
    );
  }

  if (dateFilter === "custom") {
    const start = customStart ? new Date(`${customStart}T00:00:00`) : null;
    const end = customEnd ? new Date(`${customEnd}T23:59:59`) : null;

    if (start && orderDate < start) return false;
    if (end && orderDate > end) return false;
    return true;
  }

  return true;
}

export function matchesProductionMethod(order, activeMethod) {
  if (activeMethod === "all") return true;

  const normalizedDecorationType = normalizeLookup(order.decoration_type);

  if (activeMethod === "dtf") {
    return normalizedDecorationType === "dtf";
  }

  if (activeMethod === "embroidery") {
    return normalizedDecorationType === "embroidery";
  }

  if (activeMethod === "screen") {
    return normalizedDecorationType.includes("screen");
  }

  return true;
}

export function matchesProductionStatus(order, activeStatus) {
  const normalizedStatus = normalizeOperationalStatus(order.status);
  const workflowState = normalizeWorkflowState(order.workflow_state || normalizedStatus);
  const queuePriority = buildQueuePriority(order);
  const readiness = order.production_readiness || buildProductionReadinessSummary(order);

  if (activeStatus === "active") {
    return (
      order.operational_visible !== false &&
      isActiveOperationalStatus(normalizedStatus)
    );
  }

  if (activeStatus === "blocked") {
    return readiness.blocked === true;
  }

  if (activeStatus === "awaiting-deposit") {
    return workflowState === "Awaiting Deposit" || readiness.label === "Awaiting Payment";
  }

  if (activeStatus === "ready-for-production") {
    return readiness.statusKey === "ready-for-production";
  }

  if (activeStatus === "printing") {
    return workflowState === "Printing";
  }

  if (activeStatus === "embroidery") {
    return workflowState === "Embroidery";
  }

  if (activeStatus === "qc-finishing") {
    return workflowState === "QC / Finishing";
  }

  if (activeStatus === "ready-for-pickup") {
    return workflowState === "Ready For Pickup";
  }

  if (activeStatus === "on-hold") {
    return workflowState === "On Hold" || isOnHoldOperationalStatus(normalizedStatus);
  }

  if (activeStatus === "completed") {
    return workflowState === "Completed" || isCompletedOperationalStatus(normalizedStatus);
  }

  if (activeStatus === "canceled") {
    return isCanceledOperationalStatus(normalizedStatus) || workflowState === "Canceled";
  }

  if (activeStatus === "unassigned") {
    return order.needs_assignment || !order.assigned_to_staff_id;
  }

  if (activeStatus === "urgent") {
    return queuePriority.overdue || queuePriority.dueSoon;
  }

  return true;
}

export function matchesSearch(order, searchTerm) {
  if (!searchTerm) return true;
  return getOrderSearchText(order).includes(normalizeLookup(searchTerm));
}

export function matchesCustomer(order, customerFilter) {
  if (!customerFilter) return true;
  return normalizeLookup(order.customer_name) === normalizeLookup(customerFilter);
}

export function getProductionStatusCounts(orders = []) {
  return PRODUCTION_STATUS_FILTERS.reduce((counts, filter) => {
    counts[filter.key] = orders.filter((order) =>
      matchesProductionStatus(order, filter.key)
    ).length;
    return counts;
  }, {});
}

export function getProductionMethodCounts(orders = []) {
  return PRODUCTION_METHOD_FILTERS.reduce((counts, filter) => {
    counts[filter.key] = orders.filter((order) =>
      matchesProductionMethod(order, filter.key)
    ).length;
    return counts;
  }, {});
}

export function buildProductionWorkspaceSummary(orders = []) {
  const urgentOrders = orders.filter((order) =>
    matchesProductionStatus(order, "urgent")
  );
  const unassignedOrders = orders.filter((order) =>
    matchesProductionStatus(order, "unassigned")
  );
  const activeOrders = orders.filter((order) =>
    matchesProductionStatus(order, "active")
  );
  const completedOrders = orders.filter((order) =>
    matchesProductionStatus(order, "completed")
  );
  const canceledOrders = orders.filter((order) =>
    matchesProductionStatus(order, "canceled")
  );
  const onHoldOrders = orders.filter((order) =>
    matchesProductionStatus(order, "on-hold")
  );
  const readyForProductionOrders = orders.filter((order) =>
    matchesProductionStatus(order, "ready-for-production")
  );
  const blockedOrders = orders.filter((order) =>
    matchesProductionStatus(order, "blocked")
  );

  return {
    activeOrders: activeOrders.length,
    urgentOrders: urgentOrders.length,
    unassignedOrders: unassignedOrders.length,
    readyForProductionOrders: readyForProductionOrders.length,
    blockedOrders: blockedOrders.length,
    onHoldOrders: onHoldOrders.length,
    completedOrders: completedOrders.length,
    canceledOrders: canceledOrders.length,
  };
}

export function buildResultsLabel(count, activeStatus) {
  const activeFilter = PRODUCTION_STATUS_FILTERS.find(
    (filter) => filter.key === activeStatus
  );
  const label =
    activeFilter?.key === "active"
      ? "Active"
      : activeFilter?.label || "Results";
  return `${count} ${label.toLowerCase()}${count === 1 ? " job" : " jobs"}`;
}

export function formatOrderDateRange(order) {
  const createdLabel = formatShortDate(order.created_at);
  const dueLabel = order.due_date ? formatShortDate(order.due_date) : "—";
  return { createdLabel, dueLabel };
}
