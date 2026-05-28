import { formatDateTime } from "../lib/dateFormatting";
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

export function buildWorkflowStatusBadges(order = {}, options = {}) {
  const surface = options.surface || "internal";
  const badges = [];
  const artworkRequired = getArtworkApprovalRequirement(order);
  const artworkStatus = normalizeArtworkApprovalStatus(order.artwork_approval_status, {
    required: artworkRequired,
  });
  const depositStatus = normalizeDepositWorkflowStatus(order.deposit_workflow_status, order);
  const gating = buildProductionGatingState(order, { targetStatus: "Ready For Production" });
  const status = normalizeOperationalStatus(order.status);

  if (artworkRequired) {
    if (artworkStatus === "Approved") {
      badges.push(buildBadge("Artwork Approved", "success"));
    } else if (artworkStatus === "Needs Revision") {
      badges.push(
        buildBadge(surface === "customer" ? "Revision Requested" : "Revision Needed", "danger")
      );
    } else {
      badges.push(
        buildBadge(surface === "customer" ? "Awaiting Your Approval" : "Awaiting Approval", "warning")
      );
    }
  }

  if (depositStatus === "Deposit Requested" || depositStatus === "Awaiting Deposit") {
    badges.push(
      buildBadge(
        surface === "customer" && depositStatus === "Deposit Requested"
          ? "Deposit Requested"
          : "Awaiting Deposit",
        "warning"
      )
    );
  } else if (depositStatus === "Deposit Received") {
    badges.push(buildBadge("Deposit Received", "success"));
  }

  if (gating.blocked) {
    badges.push(buildBadge("Production Blocked", "danger"));
  } else if (["Ready For Production", "Printing", "Embroidery", "QC / Finishing"].includes(status)) {
    badges.push(
      buildBadge(surface === "customer" ? "Ready for Production" : "Production Ready", "info")
    );
  }

  return badges;
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

  if (primaryCheck?.key === "artworkApproval") {
    return {
      ...gating,
      summary: "Artwork approval required before production.",
      detail:
        primaryCheck.statusLabel === "Needs Revision"
          ? "Awaiting customer revision."
          : "Waiting for artwork approval.",
      nextActionLabel:
        primaryCheck.statusLabel === "Needs Revision" ? "Request Revision" : "Approve Artwork",
    };
  }

  if (primaryCheck?.key === "depositRequirement") {
    return {
      ...gating,
      summary: "Deposit must be received before production.",
      detail:
        primaryCheck.statusLabel === "Deposit Requested"
          ? "Awaiting deposit payment."
          : "Deposit required before production.",
      nextActionLabel:
        primaryCheck.statusLabel === "Deposit Requested"
          ? "Mark Deposit Received"
          : "Request Deposit",
    };
  }

  return {
    ...gating,
    summary: "Production is blocked by workflow requirements.",
    detail: gating.blockingReasons.join(" "),
    nextActionLabel: "Override and Continue",
  };
}

export function buildCustomerWorkflowMessage(order = {}) {
  const artworkRequired = getArtworkApprovalRequirement(order);
  const artworkStatus = normalizeArtworkApprovalStatus(order.artwork_approval_status, {
    required: artworkRequired,
  });
  const depositStatus = normalizeDepositWorkflowStatus(order.deposit_workflow_status, order);
  const status = normalizeOperationalStatus(order.status);

  if (artworkRequired && artworkStatus === "Needs Revision") {
    return "Revision requested by shop";
  }

  if (artworkRequired && artworkStatus !== "Approved") {
    return "Awaiting your artwork approval";
  }

  if (depositStatus === "Deposit Requested" || depositStatus === "Awaiting Deposit") {
    return "Deposit requested before production";
  }

  if (["Ready For Production", "Printing", "Embroidery", "QC / Finishing"].includes(status)) {
    return "Ready for production";
  }

  if (status === "Ready For Pickup") {
    return "Ready for pickup";
  }

  if (status === "Completed") {
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
