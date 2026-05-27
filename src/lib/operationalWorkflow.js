const WORKFLOW_STATE_ALIASES = {
  draft: "Draft",
  new: "Draft",
  sent: "Awaiting Approval",
  "awaiting approval": "Awaiting Approval",
  "awaiting artwork approval": "Awaiting Approval",
  "awaiting artwork": "Awaiting Approval",
  approved: "Approved",
  "ready for production": "Ready For Production",
  "awaiting production": "Ready For Production",
  "awaiting deposit": "Awaiting Deposit",
  printing: "Printing",
  embroidery: "Embroidery",
  "in production": "Printing",
  "qc / finishing": "QC / Finishing",
  "ready for pickup": "Ready For Pickup",
  "picked up": "Completed",
  "on hold": "On Hold",
  completed: "Completed",
  archived: "Archived",
  canceled: "Canceled",
};

export const OPERATIONAL_WORKFLOW_STATES = [
  "Draft",
  "Awaiting Approval",
  "Approved",
  "Awaiting Deposit",
  "Ready For Production",
  "Printing",
  "Embroidery",
  "QC / Finishing",
  "Ready For Pickup",
  "On Hold",
  "Completed",
  "Archived",
];

export const EXTENDED_OPERATIONAL_WORKFLOW_STATES = [
  ...OPERATIONAL_WORKFLOW_STATES,
  "Canceled",
];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeWorkflowState(state) {
  const trimmed = String(state || "").trim();
  if (!trimmed) return "Draft";

  return WORKFLOW_STATE_ALIASES[normalize(trimmed)] || trimmed;
}

export function isWorkflowCompletedState(state) {
  return normalizeWorkflowState(state) === "Completed";
}

export function isWorkflowArchivedState(state) {
  return normalizeWorkflowState(state) === "Archived";
}

export function isWorkflowActiveState(state) {
  const normalizedState = normalizeWorkflowState(state);
  return !["Completed", "Archived", "Canceled"].includes(normalizedState);
}

export function getWorkflowStateIndex(state) {
  return EXTENDED_OPERATIONAL_WORKFLOW_STATES.indexOf(normalizeWorkflowState(state));
}

export function deriveOperationalWorkflowState(record = {}) {
  if (record.quote_archived === true) {
    return "Archived";
  }

  const quoteStatus = normalizeWorkflowState(record.quote_status);
  const orderStatus = normalizeWorkflowState(record.status);

  if (quoteStatus === "Canceled" || orderStatus === "Canceled") {
    return "Canceled";
  }

  const isQuoteRecord =
    record.operational_visible === false ||
    (String(record.quote_status || "").trim() &&
      normalize(record.quote_status) !== "ready for production" &&
      normalize(record.status) !== "completed");

  if (isQuoteRecord) {
    if (quoteStatus === "Approved" && record.operational_visible === false) {
      return "Approved";
    }

    return quoteStatus || "Draft";
  }

  if (orderStatus === "Draft") {
    return "Approved";
  }

  return orderStatus || "Approved";
}

export function getWorkflowStateTone(state) {
  switch (normalizeWorkflowState(state)) {
    case "Awaiting Approval":
    case "Awaiting Deposit":
      return { background: "#fff7ed", border: "#fed7aa", color: "#9a3412" };
    case "Approved":
    case "Ready For Production":
      return { background: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8" };
    case "Printing":
      return { background: "#eef2ff", border: "#c7d2fe", color: "#4338ca" };
    case "Embroidery":
      return { background: "#f5f3ff", border: "#ddd6fe", color: "#6d28d9" };
    case "QC / Finishing":
      return { background: "#fef3c7", border: "#fde68a", color: "#92400e" };
    case "Ready For Pickup":
      return { background: "#e0f2fe", border: "#bae6fd", color: "#0369a1" };
    case "On Hold":
      return { background: "#fef2f2", border: "#fecaca", color: "#b91c1c" };
    case "Completed":
      return { background: "#ecfdf5", border: "#bbf7d0", color: "#166534" };
    case "Archived":
      return { background: "#f5f5f4", border: "#d6d3d1", color: "#57534e" };
    case "Canceled":
      return { background: "#fef2f2", border: "#fecaca", color: "#b91c1c" };
    default:
      return { background: "#f8fafc", border: "#e2e8f0", color: "#0f172a" };
  }
}
