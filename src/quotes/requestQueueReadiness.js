import { getOrderArtworkNames } from "../lib/orderArtwork";
import { normalizeOrderFinancials } from "../orders/orderFinancials";
import {
  buildApprovalStatus,
  buildDepositStatus,
  buildProductionReadiness,
} from "./productionReadiness";

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
  if (filterKey === "awaiting-approval") return quote.quote_status === "Awaiting Approval";
  if (filterKey === "awaiting-artwork") return quote.quote_status === "Awaiting Artwork Approval";
  if (filterKey === "awaiting-deposit") return quote.quote_status === "Awaiting Deposit";
  if (filterKey === "ready") return summary.readiness.ready;
  if (filterKey === "blocked") return !summary.readiness.ready;
  return true;
}
