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
  };
}
