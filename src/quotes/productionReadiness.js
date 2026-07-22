function normalizeLower(value) {
  return String(value || "").trim().toLowerCase();
}

export function buildDepositStatus(order, financials) {
  if (order?.deposit_workflow_status) return order.deposit_workflow_status;
  if (
    order?.deposit_requirement_status === "Undecided" ||
    String(order?.deposit_requirement || "").trim().toLowerCase() === "undecided"
  ) {
    return "Pending Decision";
  }
  return Number(financials?.deposit_amount || 0) > 0 ? "Awaiting Deposit" : "Deposit Not Required";
}

export function buildApprovalStatus(order) {
  return order?.staff_review_status || order?.approval_status || order?.artwork_approval_status || "Pending Review";
}

export function buildArtworkStatus(order) {
  return order?.artwork_status || order?.artwork_approval_status || "Pending Review";
}

export function buildProductionReadiness(order, financials) {
  const depositTarget = Number(financials?.deposit_amount || 0);
  const totalPaid = Number(financials?.total_paid || financials?.amount_paid || 0);
  const depositState = normalizeLower(buildDepositStatus(order, financials));
  const approvalState = normalizeLower(buildApprovalStatus(order));
  const artworkState = normalizeLower(buildArtworkStatus(order));

  const checks = [
    {
      label: "Staff Review",
      passed: approvalState.includes("approved"),
      detail: buildApprovalStatus(order),
    },
    {
      label: "Deposit",
      passed:
        depositState === "deposit not required" ||
        depositState === "deposit received" ||
        (depositTarget > 0 && totalPaid >= depositTarget),
      detail: buildDepositStatus(order, financials),
    },
    {
      label: "Artwork",
      passed: artworkState === "not required" || artworkState.includes("approved"),
      detail: buildArtworkStatus(order),
    },
  ];

  const remainingRequirements = checks.filter((check) => !check.passed).length;

  return {
    checks,
    ready: remainingRequirements === 0,
    remainingRequirements,
  };
}

export function buildProductionReadyWorkflowUpdates(order, financials) {
  if (!buildProductionReadiness(order, financials).ready) return {};

  return {
    status: "Ready For Production",
    quote_status: "Ready For Production",
    production_ready: true,
  };
}
