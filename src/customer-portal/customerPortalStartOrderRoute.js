export const PORTAL_REQUEST_ORDER_PATH = "/portal/request-order";
export const PORTAL_ORDER_CATALOG_PATH = "/portal/order";
export const PORTAL_ORDER_SUBMITTED_PATH = "/portal/order-submitted";
export const PUBLIC_STOREFRONT_PATH = "/";
export const PUBLIC_GARMENT_FLOW_SOURCE = "public-garment-flow";

export function isPublicGarmentFlowHandoff(source) {
  return String(source || "").trim() === PUBLIC_GARMENT_FLOW_SOURCE;
}

export function isPortalOrderingPath(pathname = "") {
  const normalizedPath = String(pathname || "");
  return normalizedPath === PORTAL_ORDER_CATALOG_PATH ||
    normalizedPath.startsWith(`${PORTAL_ORDER_CATALOG_PATH}/`);
}

export function getOrderingWorkflowPaths(pathname = "") {
  const portalOrdering = isPortalOrderingPath(pathname);
  const base = portalOrdering ? PORTAL_ORDER_CATALOG_PATH : "";

  return {
    portalOrdering,
    catalog: portalOrdering ? PORTAL_ORDER_CATALOG_PATH : PUBLIC_STOREFRONT_PATH,
    category: (categoryId) => `${base}/category/${categoryId}`,
    garment: (garmentId) => `${base}/garment/${garmentId}`,
    preview: `${base}/order-preview`,
  };
}

export function shouldOfferPendingDraftRecovery({
  pendingRequest = null,
  pendingRequestSource = "",
} = {}) {
  return Boolean(pendingRequest) && !isPublicGarmentFlowHandoff(pendingRequestSource);
}
