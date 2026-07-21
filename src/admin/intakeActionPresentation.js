import { getUploadedOrderArtworkFiles } from "../lib/orderArtwork";

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function hasActivity(order, type) {
  return (Array.isArray(order?.activity_log) ? order.activity_log : []).some(
    (entry) => normalized(entry?.type) === normalized(type)
  );
}

export function getCompletedIntakeActions(order = {}) {
  const requestStatus = normalized(order.request_status);
  const staffReviewStatus = normalized(order.staff_review_status);
  const approvalStatus = normalized(order.approval_status);
  const depositRequirement = normalized(order.deposit_requirement);
  const depositRequirementStatus = normalized(order.deposit_requirement_status);
  const depositWorkflowStatus = normalized(order.deposit_workflow_status);
  const artworkStatuses = [
    normalized(order.artwork_approval_status),
    normalized(order.artwork_status),
  ];

  return {
    approveRequest:
      staffReviewStatus === "approved" ||
      approvalStatus === "approved" ||
      hasActivity(order, "order_request_review"),
    requestArtwork:
      requestStatus === "awaiting artwork" || hasActivity(order, "artwork_request"),
    requestChanges:
      requestStatus === "awaiting customer response" ||
      staffReviewStatus === "changes requested" ||
      approvalStatus === "revision requested" ||
      hasActivity(order, "order_request_changes"),
    requireDeposit:
      order.deposit_required === true ||
      depositRequirement === "required" ||
      depositRequirementStatus === "required" ||
      ["deposit requested", "deposit received"].includes(depositWorkflowStatus) ||
      hasActivity(order, "deposit_request"),
    markDepositNotRequired:
      depositRequirement === "not_required" ||
      depositRequirementStatus === "not required" ||
      depositWorkflowStatus === "deposit not required",
    approveArtwork: artworkStatuses.includes("approved"),
  };
}

export function getAvailableIntakeActions(order = {}) {
  const completed = getCompletedIntakeActions(order);
  const artworkStatuses = [
    normalized(order.artwork_approval_status),
    normalized(order.artwork_status),
  ];
  const artworkApproved = artworkStatuses.includes("approved");
  const depositWorkflowStatus = normalized(order.deposit_workflow_status);
  const hasUploadedArtwork = getUploadedOrderArtworkFiles(order).length > 0;

  return {
    approveRequest: !completed.approveRequest,
    requestArtwork: !completed.requestArtwork && !artworkApproved && !hasUploadedArtwork,
    requestChanges: !completed.requestChanges,
    requireDeposit: !completed.requireDeposit,
    markDepositNotRequired:
      !completed.markDepositNotRequired && depositWorkflowStatus !== "deposit received",
    approveArtwork:
      !artworkApproved && artworkStatuses.includes("pending review") && hasUploadedArtwork,
  };
}

export function getOutstandingIntakeRequirements(order = {}) {
  const requirements = [];
  const staffReview = normalized(order.staff_review_status || order.approval_status);
  const artworkStatus = normalized(order.artwork_status || order.artwork_approval_status);
  const depositStatus = normalized(order.deposit_workflow_status);
  const depositRequirement = normalized(order.deposit_requirement);
  const depositRequirementStatus = normalized(order.deposit_requirement_status);
  const requestStatus = normalized(order.request_status);

  if (staffReview !== "approved") requirements.push("Staff Review");

  if (artworkStatus === "missing") {
    requirements.push("Artwork Needed");
  } else if (!artworkStatus || artworkStatus === "pending review") {
    requirements.push("Artwork Review");
  } else if (artworkStatus === "needs revision") {
    requirements.push("Customer Response");
  }

  if (
    depositStatus === "pending decision" ||
    depositRequirementStatus === "undecided" ||
    depositRequirement === "undecided"
  ) {
    requirements.push("Deposit Decision");
  }

  if (requestStatus === "awaiting customer response") requirements.push("Customer Response");

  return Array.from(new Set(requirements));
}
