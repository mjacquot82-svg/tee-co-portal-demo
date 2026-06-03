import { normalizeQuoteStatus } from "./quoteWorkflow";

function normalizeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function hasArtwork(order = {}) {
  return Boolean(String(order?.customer_artwork_id || "").trim()) ||
    (Array.isArray(order?.artwork_files) && order.artwork_files.length > 0);
}

export function isStorefrontRequestRecord(order = {}) {
  const source = String(order?.source || "").trim();
  const requestType = String(order?.request_type || "").trim();

  return (
    (source === "Storefront Request" && requestType === "Product Request") ||
    (source === "Storefront" &&
      requestType === "Standard Purchase" &&
      Array.isArray(order?.cart_items) &&
      order.cart_items.length > 0)
  );
}

export function getRequestCompletionStatus(order = {}) {
  const normalized = normalizeLower(order?.request_completion_status);
  if (normalized === "awaiting_artwork") return "awaiting_artwork";
  if (normalized === "artwork_assistance_required") return "artwork_assistance_required";
  if (normalized === "ready_for_review") return "ready_for_review";
  return "pending_completion";
}

function isStorefrontQuoteSideRecord(order = {}) {
  return isStorefrontRequestRecord(order) && order?.operational_visible !== true;
}

function buildRequestCompletionDetail(order = {}) {
  const completionStatus = getRequestCompletionStatus(order);

  switch (completionStatus) {
    case "awaiting_artwork":
      return "Awaiting customer artwork";
    case "artwork_assistance_required":
      return "Artwork assistance requested";
    case "ready_for_review":
      return "Ready for review";
    default:
      return "Pending completion";
  }
}

export function buildDepositStatus(order, financials) {
  const quoteStatus = normalizeQuoteStatus(order?.quote_status);
  const explicitStatus = String(order?.deposit_workflow_status || order?.deposit?.status || "").trim();

  if (
    isStorefrontQuoteSideRecord(order) &&
    !explicitStatus &&
    ["Draft", "Sent", "Awaiting Approval", "Awaiting Artwork Approval"].includes(quoteStatus)
  ) {
    return "Not Started";
  }

  return order?.deposit_workflow_status || (Number(financials?.deposit_amount || 0) > 0 ? "Awaiting Deposit" : "Deposit Not Required");
}

export function buildApprovalStatus(order) {
  const quoteStatus = normalizeQuoteStatus(order?.quote_status);
  const explicitStatus = String(order?.approval_status || order?.artwork_approval_status || "").trim();

  if (isStorefrontQuoteSideRecord(order)) {
    if (quoteStatus === "Awaiting Deposit" || quoteStatus === "Approved" || quoteStatus === "Ready For Production") {
      return explicitStatus || "Approved";
    }

    if (quoteStatus === "Awaiting Approval" || quoteStatus === "Awaiting Artwork Approval") {
      return "Awaiting Approval";
    }

    if (quoteStatus === "Sent") {
      return "Quote In Preparation";
    }

    if (quoteStatus === "Draft") {
      return getRequestCompletionStatus(order) === "pending_completion" ? "Not Started" : "Not Requested";
    }
  }

  return order?.artwork_approval_status || order?.approval_status || "Pending Review";
}

export function buildArtworkStatus(order) {
  const quoteStatus = normalizeQuoteStatus(order?.quote_status);
  const explicitStatus = String(order?.artwork_approval_status || order?.approval_status || "").trim();
  const artworkAttached = hasArtwork(order);

  if (isStorefrontQuoteSideRecord(order)) {
    if (quoteStatus === "Ready For Production" || quoteStatus === "Approved" || quoteStatus === "Awaiting Deposit") {
      return explicitStatus || (artworkAttached ? "Approved" : "As Directed");
    }

    if (quoteStatus === "Awaiting Artwork Approval") {
      return explicitStatus || "Awaiting Artwork Approval";
    }

    if (quoteStatus === "Awaiting Approval") {
      return artworkAttached ? "Artwork Received" : "Pending Review";
    }

    if (quoteStatus === "Sent") {
      return artworkAttached ? "Artwork Received" : "Awaiting Internal Review";
    }

    const completionStatus = getRequestCompletionStatus(order);
    if (completionStatus === "awaiting_artwork") {
      return "Awaiting Customer Artwork";
    }

    if (completionStatus === "artwork_assistance_required") {
      return "Artwork Assistance Requested";
    }

    if (completionStatus === "ready_for_review") {
      return artworkAttached ? "Artwork Received" : "Ready For Review";
    }

    return "Waiting for customer completion";
  }

  return buildApprovalStatus(order);
}

export function buildProductionReadiness(order, financials) {
  const quoteStatus = normalizeQuoteStatus(order?.quote_status);
  const depositStatus = buildDepositStatus(order, financials);
  const approvalStatus = buildApprovalStatus(order);
  const artworkStatus = buildArtworkStatus(order);

  if (isStorefrontQuoteSideRecord(order)) {
    const completionStatus = getRequestCompletionStatus(order);
    const ready = quoteStatus === "Ready For Production";
    const checks = [
      {
        label: "Request Intake",
        passed: completionStatus !== "pending_completion",
        detail: buildRequestCompletionDetail(order),
      },
      {
        label: "Artwork",
        passed:
          completionStatus === "artwork_assistance_required" ||
          completionStatus === "ready_for_review" ||
          ["Sent", "Awaiting Approval", "Awaiting Artwork Approval", "Awaiting Deposit", "Approved", "Ready For Production"].includes(quoteStatus),
        detail: artworkStatus,
      },
      {
        label: "Quote Progress",
        passed: quoteStatus !== "Draft",
        detail:
          quoteStatus === "Draft"
            ? "Quote not started"
            : quoteStatus === "Sent"
            ? "Quote in preparation"
            : quoteStatus,
      },
      {
        label: "Customer Approval",
        passed: ["Awaiting Deposit", "Approved", "Ready For Production"].includes(quoteStatus),
        detail: approvalStatus,
      },
      {
        label: "Deposit",
        passed:
          ready ||
          depositStatus === "Deposit Received" ||
          depositStatus === "Deposit Not Required",
        detail: depositStatus,
      },
    ];

    return {
      checks,
      ready,
      remainingRequirements: ready ? 0 : checks.filter((check) => !check.passed).length,
    };
  }

  const depositTarget = Number(financials?.deposit_amount || 0);
  const totalPaid = Number(financials?.total_paid || financials?.amount_paid || 0);
  const depositState = normalizeLower(depositStatus);
  const approvalState = normalizeLower(approvalStatus);
  const artworkCount = Array.isArray(order?.artwork_files) ? order.artwork_files.length : 0;

  const checks = [
    {
      label: "Customer Approval",
      passed: approvalState.includes("approved"),
      detail: approvalStatus,
    },
    {
      label: "Deposit",
      passed:
        depositTarget <= 0 ||
        depositState === "deposit received" ||
        totalPaid >= depositTarget,
      detail: depositStatus,
    },
    {
      label: "Artwork",
      passed: artworkCount === 0 || approvalState.includes("approved"),
      detail: artworkStatus,
    },
  ];

  const remainingRequirements = checks.filter((check) => !check.passed).length;

  return {
    checks,
    ready: remainingRequirements === 0,
    remainingRequirements,
  };
}
