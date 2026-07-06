import { formatDateTime } from "../lib/dateFormatting";
import {
  deriveOrderPaymentState,
  deriveOrderWorkflowState,
  ORDER_WORKFLOW_STATES,
  OWNER_PAYMENT_STATES,
} from "./canonicalState";
import { normalizeOperationalStatus } from "./orderWorkflow";
import {
  buildProductionGatingState,
  getArtworkApprovalRequirement,
  normalizeArtworkApprovalStatus,
  normalizeDepositWorkflowStatus,
} from "./workflowGating";

function buildBadge(label, tone) {
  return { label, tone };
}

function normalizeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function buildBlockerDetail(check = {}) {
  if (check.key === "artworkApproval") {
    if (check.statusLabel === "Needs Revision") {
      return {
        key: check.key,
        label: "Awaiting Artwork",
        reason: "Customer artwork revision is required before production.",
        requiredAction: "Upload revised artwork or update the artwork record.",
        responsibleParty: "Customer",
      };
    }

    return {
      key: check.key,
      label: "Awaiting Approval",
      reason: "Artwork must be approved before production starts.",
      requiredAction: "Review and approve artwork, or mark artwork not required.",
      responsibleParty: "Staff",
    };
  }

  if (check.key === "depositRequirement") {
    if (check.statusLabel === "Pending Decision") {
      return {
        key: check.key,
        label: "Awaiting Payment Decision",
        reason: "Deposit requirement has not been finalized.",
        requiredAction: "Decide whether a deposit is required for this order.",
        responsibleParty: "Owner",
      };
    }

    if (check.statusLabel === "Deposit Requested" || check.statusLabel === "Awaiting Deposit") {
      return {
        key: check.key,
        label: "Awaiting Payment",
        reason: "Deposit must be received before production.",
        requiredAction: "Collect or record the customer deposit.",
        responsibleParty: "Customer",
      };
    }

    return {
      key: check.key,
      label: "Awaiting Payment",
      reason: "Deposit status must be resolved before production.",
      requiredAction: "Request, waive, or record the required deposit.",
      responsibleParty: "Staff",
    };
  }

  return {
    key: check.key || "workflow",
    label: check.label || "Blocked",
    reason: check.blockedSummary || "Workflow requirement is blocking production.",
    requiredAction: "Resolve the blocking requirement.",
    responsibleParty: "Staff",
  };
}

export function buildProductionReadinessSummary(order = {}, action = null) {
  const status = normalizeOperationalStatus(order.status);
  const gating = buildProductionGatingState(
    order,
    action || { targetStatus: "Ready For Production" }
  );
  const blockers = gating.blockingChecks.map(buildBlockerDetail);
  const [primaryBlocker] = blockers;

  if (status === "Canceled") {
    return {
      statusKey: "canceled",
      label: "Canceled",
      tone: "danger",
      blocked: false,
      blockers: [],
      nextRecommendedAction: "Review canceled record",
      responsibleParty: "Staff",
      detail: "Production actions are disabled.",
      gating,
    };
  }

  if (status === "Completed") {
    return {
      statusKey: "completed",
      label: "Completed",
      tone: "success",
      blocked: false,
      blockers: [],
      nextRecommendedAction: "No production action required",
      responsibleParty: "Staff",
      detail: "Production workflow is complete.",
      gating,
    };
  }

  if (status === "Ready For Pickup") {
    return {
      statusKey: "ready-for-pickup",
      label: "Ready For Pickup",
      tone: "success",
      blocked: false,
      blockers: [],
      nextRecommendedAction: "Coordinate pickup or complete the order",
      responsibleParty: "Staff",
      detail: "Production is complete and pickup is the next operational step.",
      gating,
    };
  }

  if (["Printing", "Embroidery", "QC / Finishing"].includes(status)) {
    return {
      statusKey: "in-production",
      label: "In Production",
      tone: "info",
      blocked: false,
      blockers: [],
      nextRecommendedAction:
        status === "QC / Finishing" ? "Mark ready for pickup" : "Move to QC when production is complete",
      responsibleParty: "Staff",
      detail: "This order is already in production.",
      gating,
    };
  }

  if (status === "On Hold") {
    return {
      statusKey: "blocked",
      label: "Blocked",
      tone: "danger",
      blocked: true,
      blockers: blockers.length
        ? blockers
        : [
            {
              key: "hold",
              label: "On Hold",
              reason: "Order is paused by staff.",
              requiredAction: "Review hold context and resume when work can continue.",
              responsibleParty: "Staff",
            },
          ],
      nextRecommendedAction: "Review hold context and resume when ready",
      responsibleParty: "Staff",
      detail: "This order is paused and should not be worked until resumed.",
      gating,
    };
  }

  if (gating.blocked) {
    const label = blockers.length === 1 ? primaryBlocker.label : "Blocked";
    return {
      statusKey: "blocked",
      label,
      tone: "danger",
      blocked: true,
      blockers,
      nextRecommendedAction: primaryBlocker?.requiredAction || "Resolve blockers before production",
      responsibleParty: primaryBlocker?.responsibleParty || "Staff",
      detail: blockers.map((blocker) => blocker.reason).join(" "),
      gating,
    };
  }

  return {
    statusKey: "ready-for-production",
    label: "Ready For Production",
    tone: "success",
    blocked: false,
    blockers: [],
    nextRecommendedAction:
      status === "Ready For Production" ? "Start production" : "Move to production",
    responsibleParty: "Staff",
    detail:
      status === "Ready For Production"
        ? "All production gates are satisfied and the order is queued."
        : "All production gates are satisfied and the order can be released.",
    gating,
  };
}

export function buildWorkflowStatusBadges(order = {}, options = {}) {
  const surface = options.surface || "internal";
  const badges = [];
  const artworkRequired = getArtworkApprovalRequirement(order);
  const artworkStatus = normalizeArtworkApprovalStatus(order.artwork_approval_status, {
    required: artworkRequired,
  });
  const paymentState = deriveOrderPaymentState(order);
  const depositStatus = normalizeDepositWorkflowStatus(order.deposit_workflow_status, order);
  const gating = buildProductionGatingState(order, { targetStatus: "Ready For Production" });
  const status = normalizeOperationalStatus(order.status);

  if (artworkRequired) {
    if (artworkStatus === "Approved") {
      badges.push(buildBadge("Artwork Approved", "success"));
    } else if (artworkStatus === "Needs Revision") {
      badges.push(
        buildBadge(surface === "customer" ? "Action Needed: Upload Revised Artwork" : "Revision Needed", "danger")
      );
    } else {
      badges.push(
        buildBadge(surface === "customer" ? "Action Needed: Upload Artwork" : "Awaiting Approval", "warning")
      );
    }
  }

  if (
    paymentState.ownerPaymentState === OWNER_PAYMENT_STATES.DEPOSIT_REQUIRED ||
    paymentState.ownerPaymentState === OWNER_PAYMENT_STATES.AWAITING_PAYMENT
  ) {
    badges.push(
      buildBadge(
        surface === "customer"
          ? paymentState.depositRequired && !paymentState.depositSatisfied
            ? "Action Needed: Deposit Required"
            : "Action Needed: Payment Required"
          : paymentState.ownerPaymentState,
        "warning"
      )
    );
  } else if (
    paymentState.ownerPaymentState === OWNER_PAYMENT_STATES.AWAITING_VERIFICATION ||
    paymentState.ownerPaymentState === OWNER_PAYMENT_STATES.BALANCE_DUE
  ) {
    badges.push(buildBadge(paymentState.ownerPaymentState, "info"));
  } else if (
    paymentState.ownerPaymentState === OWNER_PAYMENT_STATES.DEPOSIT_RECEIVED ||
    depositStatus === "Deposit Received"
  ) {
    badges.push(buildBadge("Deposit Received", "success"));
  } else if (paymentState.ownerPaymentState === OWNER_PAYMENT_STATES.FAILED) {
    badges.push(buildBadge("Payment Failed", "danger"));
  }

  if (gating.blocked) {
    badges.push(buildBadge("Production Blocked", "danger"));
  } else if (status === "Ready For Production") {
    badges.push(
      buildBadge(surface === "customer" ? "Ready for Production" : "Production Ready", "info")
    );
  } else if (["Printing", "Embroidery", "QC / Finishing"].includes(status)) {
    badges.push(buildBadge("In Production", "info"));
  }

  return badges;
}

export function buildWorkflowProgressStages(order = {}) {
  const workflowState = deriveOrderWorkflowState(order);
  const paymentState = workflowState.paymentState || deriveOrderPaymentState(order);
  const gating = buildProductionGatingState(order, { targetStatus: "Ready For Production" });
  const status = normalizeOperationalStatus(order.status);
  const quoteStatus = normalizeLower(order.quote_status || order.approval_status);
  const depositStatus = normalizeLower(order.deposit_workflow_status || order.deposit?.status);
  const depositRequestExists =
    paymentState.paymentRequests?.some((request) => normalizeLower(request.request_type || request.payment_type) === "deposit") ||
    depositStatus.includes("requested") ||
    depositStatus.includes("received") ||
    Boolean(order.deposit?.payment_request_id || order.deposit?.requested_at);
  const quoteApproved =
    ["approved", "awaiting deposit", "ready for production"].includes(quoteStatus) ||
    paymentState.depositSatisfied ||
    status !== "New";
  const artworkCheck = gating.checks.find((check) => check.key === "artworkApproval");
  const productionStarted = workflowState.workflowState === ORDER_WORKFLOW_STATES.IN_PRODUCTION ||
    workflowState.workflowState === ORDER_WORKFLOW_STATES.READY_FOR_PICKUP ||
    workflowState.workflowState === ORDER_WORKFLOW_STATES.COMPLETED;
  const readyForPickup = workflowState.workflowState === ORDER_WORKFLOW_STATES.READY_FOR_PICKUP ||
    workflowState.workflowState === ORDER_WORKFLOW_STATES.COMPLETED;

  const stages = [
    {
      key: "quote-approved",
      label: "Quote Approved",
      complete: quoteApproved,
    },
    {
      key: "deposit-requested",
      label: "Deposit Requested",
      complete: Boolean(depositRequestExists || paymentState.depositSatisfied || !paymentState.depositRequired),
    },
    {
      key: "deposit-received",
      label: "Deposit Received",
      complete: Boolean(paymentState.depositSatisfied),
    },
    {
      key: "artwork-review",
      label: "Artwork Review",
      complete: Boolean(artworkCheck?.satisfied),
    },
    {
      key: "production",
      label: "Production",
      complete: workflowState.workflowState === ORDER_WORKFLOW_STATES.READY_FOR_PICKUP ||
        workflowState.workflowState === ORDER_WORKFLOW_STATES.COMPLETED,
      active: productionStarted && !readyForPickup,
    },
    {
      key: "ready-for-pickup",
      label: "Ready for Pickup",
      complete: workflowState.workflowState === ORDER_WORKFLOW_STATES.COMPLETED,
      active: workflowState.workflowState === ORDER_WORKFLOW_STATES.READY_FOR_PICKUP,
    },
  ];
  const firstOpenIndex = stages.findIndex((stage) => !stage.complete && !stage.active);

  return stages.map((stage, index) => ({
    ...stage,
    state: stage.complete ? "complete" : stage.active || index === firstOpenIndex ? "active" : "pending",
  }));
}

export function buildWorkflowBlockDetails(order = {}, action = null) {
  const gating = buildProductionGatingState(order, action || { targetStatus: "Ready For Production" });

  if (!gating.blocked) {
    return {
      ...gating,
      summary: "",
      detail: "",
      nextActionLabel: "",
    };
  }

  const [primaryCheck] = gating.blockingChecks;
  const blockers = gating.blockingChecks.map(buildBlockerDetail);
  const detail = blockers.map((blocker) => blocker.reason).join(" ");
  const nextActionLabel = blockers[0]?.requiredAction || "";

  if (primaryCheck?.key === "artworkApproval") {
    return {
      ...gating,
      blockers,
      summary: "Artwork approval required before production.",
      detail:
        primaryCheck.statusLabel === "Needs Revision"
          ? "Awaiting customer revision."
          : detail || "Waiting for artwork approval.",
      nextActionLabel,
    };
  }

  if (primaryCheck?.key === "depositRequirement") {
    return {
      ...gating,
      blockers,
      summary: "Deposit must be received before production.",
      detail:
        primaryCheck.statusLabel === "Deposit Requested"
          ? "Awaiting deposit payment."
          : detail || "Deposit required before production.",
      nextActionLabel,
    };
  }

  return {
    ...gating,
    blockers,
    summary: "Production is blocked by workflow requirements.",
    detail: detail || gating.blockingReasons.join(" "),
    nextActionLabel: nextActionLabel || "Override and Continue",
  };
}

export function buildCustomerWorkflowMessage(order = {}) {
  const workflowState = deriveOrderWorkflowState(order);

  if (workflowState.workflowState === ORDER_WORKFLOW_STATES.ARTWORK_NEEDED) {
    const artworkStatus = normalizeArtworkApprovalStatus(order.artwork_approval_status, {
      required: getArtworkApprovalRequirement(order),
    });
    return artworkStatus === "Needs Revision"
      ? "Action needed: upload revised artwork"
      : "Action needed: upload artwork";
  }

  if (workflowState.workflowState === ORDER_WORKFLOW_STATES.AWAITING_PAYMENT) {
    return "Action needed: payment required before production";
  }

  if (workflowState.workflowState === ORDER_WORKFLOW_STATES.READY_FOR_PRODUCTION) {
    return "Ready for production";
  }

  if (workflowState.workflowState === ORDER_WORKFLOW_STATES.IN_PRODUCTION) {
    return "In production";
  }

  if (workflowState.workflowState === ORDER_WORKFLOW_STATES.READY_FOR_PICKUP) {
    return "Ready for pickup";
  }

  if (workflowState.workflowState === ORDER_WORKFLOW_STATES.COMPLETED) {
    return "Completed and released";
  }

  return "Order in progress";
}

export function formatWorkflowTimelineEvent(event = {}) {
  const eventType = String(event.type || event.event_type || "").trim();
  const note = String(event.note || event.summary || "").trim();
  const actor = String(event.staff_name || "").trim();
  const actorSuffix = actor ? ` by ${actor}` : "";

  switch (eventType) {
    case "artwork_approved":
      return {
        title: `Artwork approved${actorSuffix}`,
        tone: "success",
      };
    case "artwork_revision_requested":
      return {
        title: `Revision requested${actorSuffix}`,
        tone: "danger",
      };
    case "deposit_requested":
    case "deposit_request":
    case "deposit_request_sent":
      return {
        title: "Deposit requested",
        tone: "warning",
      };
    case "deposit_received":
    case "deposit_recorded":
      return {
        title: "Deposit received",
        tone: "success",
      };
    case "production_blocked":
      return {
        title: note.toLowerCase().includes("artwork")
          ? "Production blocked awaiting approval"
          : "Production blocked awaiting deposit",
        tone: "danger",
      };
    case "gating_override_used":
      return {
        title: `Override used to continue production${actorSuffix}`,
        tone: "info",
      };
    default:
      return {
        title: note || "Operational update recorded",
        tone: eventType === "canceled" ? "danger" : "neutral",
      };
  }
}

export function formatOverrideMeta(override = {}) {
  const pieces = ["Override active"];

  if (override.usedByName) {
    pieces.push(override.usedByName);
  }

  if (override.usedAt) {
    pieces.push(formatDateTime(override.usedAt));
  }

  return pieces.join(" • ");
}
