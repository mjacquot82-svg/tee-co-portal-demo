function formatSatisfiedRequirement(check) {
  if (check.key === "artworkApproval") {
    if (check.statusLabel === "Approved") return "✓ Artwork Approved";
    if (check.statusLabel === "Not Required") return "✓ Artwork Not Required";
    return "✓ Artwork Requirement Satisfied";
  }

  if (check.key === "depositRequirement") {
    if (check.statusLabel === "Deposit Received") return "✓ Deposit Received";
    if (check.statusLabel === "Deposit Not Required") return "✓ Deposit Not Required";
    return "✓ Deposit Requirement Satisfied";
  }

  return `✓ ${check.statusLabel}`;
}

export function buildPrerequisitePresentation(productionGating = null) {
  const checks = Array.isArray(productionGating?.checks) ? productionGating.checks : [];
  const artworkGate = checks.find((check) => check.key === "artworkApproval") || null;
  const depositGate = checks.find((check) => check.key === "depositRequirement") || null;

  return {
    checks: checks.map((check) => ({
      ...check,
      displayStatus: check.satisfied ? formatSatisfiedRequirement(check) : check.statusLabel,
    })),
    allSatisfied: checks.length > 0 && checks.every((check) => check.satisfied),
    artwork: {
      gate: artworkGate,
      showApprove: Boolean(artworkGate && !artworkGate.satisfied),
      showRequestRevision: Boolean(artworkGate && artworkGate.statusLabel !== "Needs Revision"),
      showSelector: Boolean(artworkGate && !artworkGate.satisfied),
      showOverride: Boolean(artworkGate && !artworkGate.satisfied),
    },
    deposit: {
      gate: depositGate,
      showOverride: Boolean(depositGate && !depositGate.satisfied),
    },
  };
}
