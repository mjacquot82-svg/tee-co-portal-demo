function normalizeLower(value) {
  return String(value || "").trim().toLowerCase();
}

export function buildDepositStatus(order, financials) {
  return order?.deposit_workflow_status || (Number(financials?.deposit_amount || 0) > 0 ? "Awaiting Deposit" : "Deposit Not Required");
}

export function buildApprovalStatus(order) {
  return order?.artwork_approval_status || order?.approval_status || "Pending Review";
}

export function buildArtworkStatus(order) {
  return buildApprovalStatus(order);
}

export function buildProductionReadiness(order, financials) {
  const depositTarget = Number(financials?.deposit_amount || 0);
  const totalPaid = Number(financials?.total_paid || financials?.amount_paid || 0);
  const depositState = normalizeLower(buildDepositStatus(order, financials));
  const approvalState = normalizeLower(buildApprovalStatus(order));
  const artworkCount = Array.isArray(order?.artwork_files) ? order.artwork_files.length : 0;

  const checks = [
    {
      label: "Customer Approval",
      passed: approvalState.includes("approved"),
      detail: buildApprovalStatus(order),
    },
    {
      label: "Deposit",
      passed:
        depositTarget <= 0 ||
        depositState === "deposit received" ||
        totalPaid >= depositTarget,
      detail: buildDepositStatus(order, financials),
    },
    {
      label: "Artwork",
      passed: artworkCount === 0 || approvalState.includes("approved"),
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
