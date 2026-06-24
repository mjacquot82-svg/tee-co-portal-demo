import { isDepositSatisfied } from "./canonicalState";

const ARTWORK_APPROVAL_STATE_ALIASES = {
  approved: "Approved",
  "customer approved": "Approved",
  "pending review": "Pending Review",
  pending: "Pending Review",
  review: "Pending Review",
  "not required": "Not Required",
  not_required: "Not Required",
  "needs revision": "Needs Revision",
  "revision requested": "Needs Revision",
  "customer requested changes": "Needs Revision",
  "requested changes": "Needs Revision",
};

const DEPOSIT_WORKFLOW_STATE_ALIASES = {
  "pending decision": "Pending Decision",
  undecided: "Pending Decision",
  "deposit not required": "Deposit Not Required",
  "not required": "Deposit Not Required",
  not_required: "Deposit Not Required",
  "deposit requested": "Deposit Requested",
  requested: "Deposit Requested",
  pending: "Deposit Requested",
  "awaiting deposit": "Awaiting Deposit",
  awaiting: "Awaiting Deposit",
  unpaid: "Awaiting Deposit",
  "deposit received": "Deposit Received",
  received: "Deposit Received",
  paid: "Deposit Received",
};

export const ARTWORK_APPROVAL_STATES = [
  "Pending Review",
  "Approved",
  "Not Required",
  "Needs Revision",
];

export const DEPOSIT_WORKFLOW_STATES = [
  "Pending Decision",
  "Deposit Not Required",
  "Deposit Requested",
  "Awaiting Deposit",
  "Deposit Received",
];

const GATED_PRODUCTION_STATUSES = new Set([
  "Ready For Production",
  "Printing",
  "Embroidery",
  "QC / Finishing",
  "Ready For Pickup",
]);

function normalizeLookup(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function resolveRecordedPayments(order = {}) {
  if (Array.isArray(order.payment_history) && order.payment_history.length) {
    return order.payment_history.reduce(
      (sum, payment) => sum + (Number(payment?.amount || 0) || 0),
      0
    );
  }

  return Number(order.total_paid || order.amount_paid || 0) || 0;
}

export function normalizeArtworkApprovalStatus(status, options = {}) {
  const trimmed = String(status || "").trim();
  if (!trimmed) {
    return normalizeBoolean(options.required, true) ? "Pending Review" : "Not Required";
  }

  return ARTWORK_APPROVAL_STATE_ALIASES[normalizeLookup(trimmed)] || trimmed;
}

export function normalizeDepositWorkflowStatus(status, order = {}) {
  const depositAmount = Number(order.deposit_amount || order.deposit?.amount || 0) || 0;
  const depositRequired =
    normalizeBoolean(order.deposit_required, false) ||
    normalizeLookup(order.deposit_requirement) === "required" ||
    depositAmount > 0;
  const totalPaid = resolveRecordedPayments(order);
  const trimmed = String(status || "").trim();
  const explicitStatus = DEPOSIT_WORKFLOW_STATE_ALIASES[normalizeLookup(trimmed)] || trimmed;

  if (explicitStatus === "Pending Decision") {
    return "Pending Decision";
  }

  if (trimmed) {
    return explicitStatus;
  }

  if (!depositRequired) {
    return "Deposit Not Required";
  }

  if (totalPaid >= depositAmount && depositAmount > 0) {
    return "Deposit Received";
  }

  if (!trimmed) {
    return "Awaiting Deposit";
  }

  return explicitStatus;
}

export function normalizeWorkflowOverrides(overrides = {}) {
  const current = overrides && typeof overrides === "object" && !Array.isArray(overrides)
    ? overrides
    : {};

  const normalizeOverride = (value) => {
    if (typeof value === "boolean") {
      return {
        active: value,
        usedAt: "",
        usedByName: "",
        usedByRole: "",
      };
    }

    const record = value && typeof value === "object" ? value : {};
    return {
      active: normalizeBoolean(record.active, false),
      usedAt: String(record.usedAt || record.used_at || "").trim(),
      usedByName: String(record.usedByName || record.used_by_name || "").trim(),
      usedByRole: String(record.usedByRole || record.used_by_role || "").trim(),
    };
  };

  return {
    forceProduction: normalizeOverride(current.forceProduction),
    depositRequirement: normalizeOverride(current.depositRequirement),
    artworkApprovalRequirement: normalizeOverride(current.artworkApprovalRequirement),
  };
}

export function getArtworkApprovalRequirement(order = {}) {
  const hasArtwork =
    (Array.isArray(order.artwork_files) && order.artwork_files.length > 0) ||
    Boolean(String(order.customer_artwork_id || "").trim());

  return normalizeBoolean(order.artwork_approval_required, hasArtwork);
}

export function isArtworkApprovalSatisfied(order = {}) {
  const required = getArtworkApprovalRequirement(order);
  const approvalStatus = normalizeArtworkApprovalStatus(order.artwork_approval_status, {
    required,
  });
  const overrides = normalizeWorkflowOverrides(order.workflow_overrides);

  return !required || approvalStatus === "Approved" || approvalStatus === "Not Required" || overrides.forceProduction.active || overrides.artworkApprovalRequirement.active;
}

export function isDepositRequirementSatisfied(order = {}) {
  const depositStatus = normalizeDepositWorkflowStatus(order.deposit_workflow_status, order);
  const overrides = normalizeWorkflowOverrides(order.workflow_overrides);

  return (
    isDepositSatisfied(order) ||
    depositStatus === "Deposit Not Required" ||
    overrides.forceProduction.active ||
    overrides.depositRequirement.active
  );
}

export function isProductionTargetStatus(status) {
  return GATED_PRODUCTION_STATUSES.has(String(status || "").trim());
}

export function buildProductionGatingState(order = {}, action = null) {
  const targetStatus = String(action?.targetStatus || action?.status || order.status || "").trim();
  const overrides = normalizeWorkflowOverrides(order.workflow_overrides);
  const artworkApprovalRequired = getArtworkApprovalRequirement(order);
  const artworkApprovalStatus = normalizeArtworkApprovalStatus(order.artwork_approval_status, {
    required: artworkApprovalRequired,
  });
  const depositWorkflowStatus = normalizeDepositWorkflowStatus(
    order.deposit_workflow_status,
    order
  );
  const artworkSatisfied = isArtworkApprovalSatisfied(order);
  const depositSatisfied = isDepositRequirementSatisfied(order);
  const appliesToTarget = isProductionTargetStatus(targetStatus);

  const checks = [
    {
      key: "artworkApproval",
      label: "Artwork Approval",
      required: artworkApprovalRequired,
      satisfied: artworkSatisfied,
      statusLabel: artworkApprovalRequired ? artworkApprovalStatus : "Not Required",
      overridden: overrides.forceProduction.active || overrides.artworkApprovalRequirement.active,
      overrideKey: "artworkApprovalRequirement",
      blockedSummary:
        artworkApprovalStatus === "Needs Revision"
          ? "Awaiting customer revision."
          : "Artwork approval required before production.",
    },
    {
      key: "depositRequirement",
      label: "Deposit",
      required: depositWorkflowStatus !== "Deposit Not Required",
      satisfied: depositSatisfied,
      statusLabel: depositWorkflowStatus,
      overridden: overrides.forceProduction.active || overrides.depositRequirement.active,
      overrideKey: "depositRequirement",
      blockedSummary:
        depositWorkflowStatus === "Deposit Requested"
          ? "Awaiting deposit payment."
          : "Deposit must be received before production.",
    },
  ];

  const blockingChecks = appliesToTarget
    ? checks.filter((check) => check.required && !check.satisfied)
    : [];

  return {
    targetStatus,
    appliesToTarget,
    blocked: blockingChecks.length > 0,
    blockingChecks,
    blockingReasons: blockingChecks.map((check) => check.blockedSummary),
    checks,
    activeOverrides: Object.entries(overrides)
      .filter(([, value]) => value.active)
      .map(([key, value]) => ({
        key,
        usedAt: value.usedAt,
        usedByName: value.usedByName,
        usedByRole: value.usedByRole,
      })),
  };
}
