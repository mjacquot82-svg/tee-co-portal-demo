import { normalizeProductionType } from "../constants/productionTypes";
import { normalizeWorkflowState } from "../lib/operationalWorkflow";

export const OPERATIONAL_ORDER_STATUSES = [
  "New",
  "Awaiting Deposit",
  "Ready For Production",
  "Printing",
  "Embroidery",
  "QC / Finishing",
  "Ready For Pickup",
  "On Hold",
  "Completed",
  "Canceled",
];

export const OPERATIONAL_STATUS_PROGRESS_STAGES = [
  "Awaiting Deposit",
  "Ready For Production",
  "Printing",
  "Embroidery",
  "QC / Finishing",
  "Ready For Pickup",
  "Completed",
];

export const PRODUCTION_WORKFLOW_EVENT_TYPES = [
  "moved_to_production",
  "production_started",
  "moved_to_printing",
  "moved_to_qc",
  "ready_for_pickup",
  "order_completed",
  "order_on_hold",
  "resumed_from_hold",
  "production_assignment_changed",
];

export const PRODUCTION_WORKFLOW_ACTIONS = [
  "move_to_production",
  "start_printing",
  "start_embroidery",
  "move_to_qc",
  "mark_ready_for_pickup",
  "complete_order",
  "put_on_hold",
  "resume_from_hold",
];

const ACTIVE_OPERATIONAL_STATUSES = new Set(
  OPERATIONAL_ORDER_STATUSES.filter((status) => !["Completed", "Canceled"].includes(status))
);
const TERMINAL_OPERATIONAL_STATUSES = new Set(["Completed", "Canceled"]);
const DIRECT_ADVANCE_SEQUENCE = [
  "New",
  "Awaiting Deposit",
  "Ready For Production",
  "Printing",
  "Embroidery",
  "QC / Finishing",
  "Ready For Pickup",
  "Completed",
];

const STATUS_ALIASES = {
  submitted: "New",
  paid: "New",
  approved: "Ready For Production",
  "ready for production": "Ready For Production",
  "awaiting production": "Ready For Production",
  "awaiting artwork": "New",
  "awaiting approval": "New",
  "mockup sent": "New",
  "awaiting deposit": "Awaiting Deposit",
  printing: "Printing",
  embroidery: "Embroidery",
  "in production": "Printing",
  "qc": "QC / Finishing",
  "qc / finishing": "QC / Finishing",
  "qc and finishing": "QC / Finishing",
  "ready for pickup": "Ready For Pickup",
  "picked up": "Completed",
  "on hold": "On Hold",
  hold: "On Hold",
};

const ACTION_DEFINITIONS = {
  move_to_production: {
    key: "move_to_production",
    label: "Move To Production",
    targetStatus: "Ready For Production",
    eventType: "moved_to_production",
  },
  start_printing: {
    key: "start_printing",
    label: "Start Printing",
    targetStatus: "Printing",
    eventTypes: ["production_started", "moved_to_printing"],
  },
  start_embroidery: {
    key: "start_embroidery",
    label: "Start Embroidery",
    targetStatus: "Embroidery",
    eventType: "production_started",
  },
  move_to_qc: {
    key: "move_to_qc",
    label: "Move To QC",
    targetStatus: "QC / Finishing",
    eventType: "moved_to_qc",
  },
  mark_ready_for_pickup: {
    key: "mark_ready_for_pickup",
    label: "Mark Ready For Pickup",
    targetStatus: "Ready For Pickup",
    eventType: "ready_for_pickup",
  },
  complete_order: {
    key: "complete_order",
    label: "Complete Order",
    targetStatus: "Completed",
    eventType: "order_completed",
  },
  put_on_hold: {
    key: "put_on_hold",
    label: "Put On Hold",
    targetStatus: "On Hold",
    eventType: "order_on_hold",
  },
  resume_from_hold: {
    key: "resume_from_hold",
    label: "Resume From Hold",
    targetStatus: "Ready For Production",
    eventType: "resumed_from_hold",
  },
};

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function buildDecorationLookup(order = {}) {
  return normalizeProductionType(order.decoration_type || order.production_type || "");
}

export function normalizeOperationalStatus(status) {
  const trimmed = String(status || "").trim();
  if (!trimmed) return "New";

  const alias = STATUS_ALIASES[normalize(trimmed)];
  return alias || trimmed;
}

export function getOrderWorkflowState(order = {}) {
  return normalizeWorkflowState(order.workflow_state || order.status || "Draft");
}

export function getOperationalStatusIndex(status) {
  return OPERATIONAL_ORDER_STATUSES.indexOf(normalizeOperationalStatus(status));
}

export function getOperationalProgressStageIndex(status) {
  return OPERATIONAL_STATUS_PROGRESS_STAGES.indexOf(normalizeOperationalStatus(status));
}

export function isCompletedOperationalStatus(status) {
  return normalizeOperationalStatus(status) === "Completed";
}

export function isCanceledOperationalStatus(status) {
  return normalizeOperationalStatus(status) === "Canceled";
}

export function isOnHoldOperationalStatus(status) {
  return normalizeOperationalStatus(status) === "On Hold";
}

export function isActiveOperationalStatus(status) {
  const normalizedStatus = normalizeOperationalStatus(status);
  return ACTIVE_OPERATIONAL_STATUSES.has(normalizedStatus);
}

export function isReadyForProductionStatus(status) {
  return [
    "Ready For Production",
    "Printing",
    "Embroidery",
    "QC / Finishing",
    "Ready For Pickup",
    "On Hold",
    "Completed",
  ].includes(normalizeOperationalStatus(status));
}

export function isProductionExecutionStatus(status) {
  return ["Printing", "Embroidery", "QC / Finishing"].includes(
    normalizeOperationalStatus(status)
  );
}

export function canAdvanceOperationalStatus(status) {
  const normalizedStatus = normalizeOperationalStatus(status);
  if (TERMINAL_OPERATIONAL_STATUSES.has(normalizedStatus)) return false;
  if (normalizedStatus === "On Hold") return false;

  const index = DIRECT_ADVANCE_SEQUENCE.indexOf(normalizedStatus);
  return index >= 0 && index < DIRECT_ADVANCE_SEQUENCE.length - 1;
}

export function getNextOperationalStatus(status) {
  const normalizedStatus = normalizeOperationalStatus(status);
  if (TERMINAL_OPERATIONAL_STATUSES.has(normalizedStatus)) return normalizedStatus;
  if (normalizedStatus === "On Hold") return "Ready For Production";

  const index = DIRECT_ADVANCE_SEQUENCE.indexOf(normalizedStatus);
  if (index < 0) return "Ready For Production";
  return DIRECT_ADVANCE_SEQUENCE[Math.min(index + 1, DIRECT_ADVANCE_SEQUENCE.length - 1)];
}

export function getPreferredProductionStartAction(order = {}) {
  const decorationType = buildDecorationLookup(order);
  return decorationType === "Embroidery"
    ? ACTION_DEFINITIONS.start_embroidery
    : ACTION_DEFINITIONS.start_printing;
}

export function getProductionWorkflowAction(actionKey) {
  return ACTION_DEFINITIONS[actionKey] || null;
}

export function getAvailableProductionActions(order = {}, options = {}) {
  const status = getOrderWorkflowState(order);
  const compact = options.compact === true;
  const actions = [];
  const preferredStartAction = getPreferredProductionStartAction(order);

  if (["Completed", "Canceled"].includes(status)) {
    return actions;
  }

  if (status === "On Hold") {
    const previousStatus = String(order.production_hold_previous_status || "").trim();
    actions.push({
      ...ACTION_DEFINITIONS.resume_from_hold,
      targetStatus: previousStatus
        ? normalizeOperationalStatus(previousStatus)
        : "Ready For Production",
    });
    if (!compact) {
      actions.push(ACTION_DEFINITIONS.complete_order);
    }
    return actions;
  }

  if (["Draft", "Approved", "New", "Awaiting Deposit"].includes(status)) {
    actions.push(ACTION_DEFINITIONS.move_to_production);
  } else if (status === "Ready For Production") {
    actions.push(preferredStartAction);
    if (!compact) {
      const alternateStartAction =
        preferredStartAction.key === "start_printing"
          ? ACTION_DEFINITIONS.start_embroidery
          : ACTION_DEFINITIONS.start_printing;
      actions.push(alternateStartAction);
      actions.push(ACTION_DEFINITIONS.put_on_hold);
    }
  } else if (["Printing", "Embroidery"].includes(status)) {
    actions.push(ACTION_DEFINITIONS.move_to_qc);
    if (!compact) {
      actions.push(ACTION_DEFINITIONS.mark_ready_for_pickup);
      actions.push(ACTION_DEFINITIONS.put_on_hold);
    }
  } else if (status === "QC / Finishing") {
    actions.push(ACTION_DEFINITIONS.mark_ready_for_pickup);
    if (!compact) {
      actions.push(ACTION_DEFINITIONS.put_on_hold);
    }
  } else if (status === "Ready For Pickup") {
    actions.push(ACTION_DEFINITIONS.complete_order);
  } else if (canAdvanceOperationalStatus(status)) {
    actions.push({
      key: `advance_to_${getNextOperationalStatus(status)}`,
      label: `Mark ${getNextOperationalStatus(status)}`,
      targetStatus: getNextOperationalStatus(status),
      eventType: "production_state_changed",
    });
  }

  return actions;
}

export function sortOrdersByOperationalStatus(orders = []) {
  return [...orders].sort((left, right) => {
    const leftIndex = getOperationalStatusIndex(left.status);
    const rightIndex = getOperationalStatusIndex(right.status);

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return String(left.due_date || "9999-12-31").localeCompare(
      String(right.due_date || "9999-12-31")
    );
  });
}
