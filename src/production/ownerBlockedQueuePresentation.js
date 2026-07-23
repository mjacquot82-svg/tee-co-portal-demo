function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function buildOwnerBlockedQueuePresentation(readiness = {}) {
  const blockers = Array.isArray(readiness.blockers) ? readiness.blockers : [];

  if (blockers.length > 1) {
    return {
      actionLabel: "Resolve Blockers",
      responsibleLabel: "Owner coordination",
      workspace: "order-management",
    };
  }

  const blocker = blockers[0] || {};
  const statusLabel = normalize(
    readiness.gating?.blockingChecks?.find((check) => check.key === blocker.key)?.statusLabel
  );

  if (blocker.key === "artworkApproval") {
    if (statusLabel === "needs revision") {
      return {
        actionLabel: "Contact Customer",
        responsibleLabel: "Customer artwork revision",
        workspace: "order-management",
      };
    }

    return {
      actionLabel: statusLabel === "pending review" ? "Review Artwork" : "Approve Artwork",
      responsibleLabel: "Owner artwork review",
      workspace: "order-management",
    };
  }

  if (blocker.key === "depositRequirement") {
    return {
      actionLabel: "Open Payment Review",
      responsibleLabel:
        statusLabel === "deposit requested" || statusLabel === "awaiting deposit"
          ? "Customer payment, monitored by Owner"
          : "Owner payment decision",
      workspace: "financial",
    };
  }

  if (blocker.key === "hold") {
    return {
      actionLabel: "Resolve Blocker",
      responsibleLabel: "Owner review",
      workspace: "order-management",
    };
  }

  return {
    actionLabel: "Resolve Blocker",
    responsibleLabel: "Owner review",
    workspace: "order-management",
  };
}
