export const PICKUP_PRESENTATION_STAGES = Object.freeze({
  SEARCH: "search",
  ORDERS: "orders",
  ACTION: "action",
  COMPLETION: "completion",
});

export function derivePickupPresentationStage({
  hasCustomer = false,
  hasSelectedOrder = false,
  hasCompletedPickup = false,
} = {}) {
  if (!hasCustomer) return PICKUP_PRESENTATION_STAGES.SEARCH;
  if (hasCompletedPickup) return PICKUP_PRESENTATION_STAGES.COMPLETION;
  if (hasSelectedOrder) return PICKUP_PRESENTATION_STAGES.ACTION;
  return PICKUP_PRESENTATION_STAGES.ORDERS;
}
