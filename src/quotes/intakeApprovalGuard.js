function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

export function isIntakeRequestApproved(order = {}) {
  return (
    normalized(order.staff_review_status) === "approved" ||
    normalized(order.approval_status) === "approved"
  );
}

export function isArtworkReviewComplete(order = {}) {
  const statuses = [
    normalized(order.artwork_status),
    normalized(order.artwork_approval_status),
  ];
  return statuses.some((status) => status === "not required" || status.includes("approved"));
}

export function isDepositDecisionComplete(order = {}) {
  const statuses = [
    normalized(order.deposit_requirement),
    normalized(order.deposit_requirement_status),
    normalized(order.deposit_workflow_status),
  ];

  return (
    order.deposit_required === true ||
    statuses.some((status) =>
      [
        "required",
        "not required",
        "not_required",
        "deposit requested",
        "deposit received",
        "deposit not required",
      ].includes(status)
    )
  );
}

export function getIntakeApprovalEligibility(order = {}) {
  const artworkComplete = isArtworkReviewComplete(order);
  const depositDecisionComplete = isDepositDecisionComplete(order);
  const blockers = [
    !artworkComplete ? "Artwork Review" : null,
    !depositDecisionComplete ? "Deposit Decision" : null,
  ].filter(Boolean);

  return {
    allowed: blockers.length === 0,
    artworkComplete,
    depositDecisionComplete,
    blockers,
  };
}

export function canApproveIntakeRequest(order = {}) {
  return isIntakeRequestApproved(order) || getIntakeApprovalEligibility(order).allowed;
}

export function assertIntakeRequestApprovalAllowed(order = {}) {
  if (canApproveIntakeRequest(order)) return;

  const { blockers } = getIntakeApprovalEligibility(order);
  const error = new Error(
    `Approve Request is unavailable until ${blockers.join(" and ")} ${
      blockers.length === 1 ? "is" : "are"
    } complete.`
  );
  error.code = "INTAKE_APPROVAL_PREREQUISITES_INCOMPLETE";
  error.blockers = blockers;
  throw error;
}

