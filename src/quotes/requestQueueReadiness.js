import { getOrderArtworkNames } from "../lib/orderArtwork";
import { normalizeOrderFinancials } from "../orders/orderFinancials";
import {
  buildApprovalStatus,
  buildDepositStatus,
  buildProductionReadiness,
} from "./productionReadiness";
import {
  getArtworkApprovalRequirement,
  normalizeArtworkApprovalStatus,
  normalizeDepositWorkflowStatus,
} from "../orders/workflowGating";

function formatValue(value, fallback = "—") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function formatList(values = [], fallback = "—") {
  const items = Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
  return items.length ? items.join(", ") : fallback;
}

export function buildQuoteSummary(order) {
  const financials = normalizeOrderFinancials(order, {
    additionalSources: order.quote ? [{ label: "storedQuote", value: order.quote }] : [],
  });
  const placements = Array.isArray(order.placements) ? order.placements : [];
  const artworkNames = getOrderArtworkNames(order);
  const readiness = buildProductionReadiness(order, financials);

  return {
    financials,
    total: financials.total_amount,
    depositTarget: financials.deposit_amount,
    balance: financials.balance_due,
    depositStatus: buildDepositStatus(order, financials),
    approvalStatus: buildApprovalStatus(order),
    dueDate: formatValue(order.due_date),
    artworkNames,
    placementSummary: formatList(placements.map((entry) => entry.placement)),
    decorationSummary: formatList(
      placements.map((entry) => entry.decoration_type || order.decoration_type),
      formatValue(order.decoration_type)
    ),
    readiness,
  };
}

export function matchesQuoteQueueFilter(quote, summary, filterKey) {
  if (filterKey === "all") return true;
  if (filterKey === "new") return quote.quote_status === "Draft";
  if (filterKey === "quote-preparation") return quote.quote_status === "Sent";
  if (filterKey === "artwork-review") {
    const artworkRequired = getArtworkApprovalRequirement(quote);
    const artworkStatus = normalizeArtworkApprovalStatus(quote.artwork_approval_status, {
      required: artworkRequired,
    });
    const hasArtwork =
      (Array.isArray(quote.artwork_files) && quote.artwork_files.length > 0) ||
      Boolean(String(quote.customer_artwork_id || "").trim());
    return artworkRequired && artworkStatus === "Pending Review" && hasArtwork;
  }
  if (filterKey === "customer-artwork") {
    const artworkRequired = getArtworkApprovalRequirement(quote);
    const artworkStatus = normalizeArtworkApprovalStatus(quote.artwork_approval_status, {
      required: artworkRequired,
    });
    const hasArtwork =
      (Array.isArray(quote.artwork_files) && quote.artwork_files.length > 0) ||
      Boolean(String(quote.customer_artwork_id || "").trim());
    return (
      quote.quote_status === "Awaiting Artwork Approval" &&
      (!hasArtwork || artworkStatus === "Needs Revision")
    );
  }
  if (filterKey === "deposit-request-needed") {
    const depositStatus = normalizeDepositWorkflowStatus(quote.deposit_workflow_status, quote);
    const depositAmount = Number(quote.deposit_amount || quote.deposit?.amount || 0) || 0;
    const depositRequired =
      quote.deposit_required === true ||
      depositAmount > 0 ||
      String(quote.deposit_requirement || "").trim().toLowerCase() === "required";
    return depositRequired && ["Pending Decision", "Deposit Not Requested"].includes(depositStatus);
  }
  if (filterKey === "awaiting-approval") return quote.quote_status === "Awaiting Approval";
  if (filterKey === "awaiting-artwork") return quote.quote_status === "Awaiting Artwork Approval";
  if (filterKey === "awaiting-deposit") return quote.quote_status === "Awaiting Deposit";
  if (filterKey === "ready") return summary.readiness.ready;
  if (filterKey === "blocked") return !summary.readiness.ready;
  return true;
}
