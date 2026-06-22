import { getOrderArtworkFiles } from "./orderArtwork";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

export function getCustomerArtworkActionState(order = {}) {
  const artworkFiles = getOrderArtworkFiles(order);
  const hasArtwork = artworkFiles.length > 0;
  const requirement = normalizeLower(order.artwork_requirement);
  const artworkStatus = normalizeLower(order.artwork_status);
  const approvalStatus = normalizeLower(order.artwork_approval_status || order.approval_status);
  const quoteStatus = normalizeLower(order.quote_status);
  const requestStatus = normalizeLower(order.request_status);
  const revisionRequested =
    approvalStatus === "needs revision" ||
    approvalStatus === "revision requested" ||
    artworkStatus === "needs revision" ||
    requestStatus === "awaiting customer response";
  const missingArtwork =
    artworkStatus === "missing" ||
    requestStatus === "awaiting artwork" ||
    quoteStatus === "awaiting artwork approval" ||
    requirement === "upload later" ||
    requirement === "upload_later" ||
    requirement === "help needed" ||
    requirement === "need artwork help" ||
    requirement === "need_help";

  if (approvalStatus === "approved" || approvalStatus === "not required") {
    return {
      required: false,
      revisionRequested: false,
      label: "Artwork Complete",
      primaryLabel: "",
    };
  }

  if (revisionRequested) {
    return {
      required: true,
      revisionRequested: true,
      label: "Action Needed: Upload Revised Artwork",
      primaryLabel: "Upload Revised Artwork",
    };
  }

  if (!hasArtwork && missingArtwork) {
    return {
      required: true,
      revisionRequested: false,
      label: "Action Needed: Upload Artwork",
      primaryLabel: "Upload Artwork",
    };
  }

  return {
    required: false,
    revisionRequested: false,
    label: "",
    primaryLabel: "",
  };
}

export function isCustomerArtworkActionRequired(order = {}) {
  return getCustomerArtworkActionState(order).required;
}

export function buildArtworkActionRoute(orderNumber) {
  return `/portal/orders/${encodeURIComponent(orderNumber || "")}/artwork`;
}
