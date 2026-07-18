export const PORTAL_REQUEST_ORDER_PATH = "/portal/request-order";
export const PORTAL_ORDER_SUBMITTED_PATH = "/portal/order-submitted";
export const PUBLIC_STOREFRONT_PATH = "/";
export const PUBLIC_GARMENT_FLOW_SOURCE = "public-garment-flow";

export function isPublicGarmentFlowHandoff(source) {
  return String(source || "").trim() === PUBLIC_GARMENT_FLOW_SOURCE;
}

export function shouldRedirectRequestOrderToStorefront({
  pendingRequest = null,
  pendingRequestSource = "",
} = {}) {
  return !pendingRequest && !isPublicGarmentFlowHandoff(pendingRequestSource);
}

export function shouldOfferPendingDraftRecovery({
  pendingRequest = null,
  pendingRequestSource = "",
} = {}) {
  return Boolean(pendingRequest) && !isPublicGarmentFlowHandoff(pendingRequestSource);
}
