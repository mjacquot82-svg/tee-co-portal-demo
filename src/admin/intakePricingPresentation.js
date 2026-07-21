export function getPricingAttentionReason(order = {}, financials = {}) {
  const pricingStatus = String(order.pricing_status || order.quote?.pricing_status || "")
    .trim()
    .toLowerCase();
  const catalogPricingAvailable =
    order.garment_pricing_available ?? order.quote?.garment_pricing_available;

  if (order.margin_warning === true || pricingStatus.includes("margin warning")) {
    return "The calculated price has a margin warning and needs a staff decision.";
  }
  if (order.manual_pricing_required === true || pricingStatus.includes("manual")) {
    return "This request requires a staff-entered price.";
  }
  if (
    order.pricing_calculation_failed === true ||
    pricingStatus.includes("failed") ||
    pricingStatus.includes("error")
  ) {
    return "The automatic pricing calculation did not complete successfully.";
  }
  if (order.custom_pricing_exception === true || pricingStatus.includes("exception")) {
    return "This request has a custom pricing exception that requires staff input.";
  }
  if (catalogPricingAvailable === false) {
    return "Catalog pricing is unavailable for one or more garments.";
  }
  if (Number(financials.total_amount || 0) <= 0) {
    return "No calculated order total is available.";
  }

  return "";
}
