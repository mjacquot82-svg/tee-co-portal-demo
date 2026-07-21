import {
  getJsonStorageItem,
  hasBrowserStorage,
  removeStorageItem,
  setJsonStorageItem,
} from "./browserStorage";

const STORAGE_KEY = "teeCoPendingCustomerRequest";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeQuantity(value) {
  const quantity = Number(value || 1);
  return Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
}

function normalizePlacements(placements, fallbackPlacement = "") {
  const values = Array.isArray(placements) ? placements : [];
  const normalized = values.map(normalizeText).filter(Boolean);
  const fallback = normalizeText(fallbackPlacement);

  return normalized.length ? normalized : fallback ? [fallback] : [];
}

function normalizeImageSrc(value) {
  const imageSrc = normalizeText(value);
  return imageSrc.startsWith("data:") ? "" : imageSrc;
}

function normalizeSizeBreakdown(value = {}) {
  return Object.entries(value || {}).reduce((result, [size, quantity]) => {
    const normalizedSize = normalizeText(size);
    const normalizedQuantity = normalizeQuantity(quantity);
    if (normalizedSize) result[normalizedSize] = normalizedQuantity;
    return result;
  }, {});
}

function normalizeLineItem(item = {}, index = 0) {
  const selectedSize = normalizeText(item.selectedSize || item.selected_size);
  const quantity = normalizeQuantity(item.quantity);
  const sizeBreakdown = normalizeSizeBreakdown(
    item.size_breakdown || (selectedSize ? { [selectedSize]: quantity } : {})
  );
  return {
    id: normalizeText(item.id) || `line-item-${index + 1}`,
    productId: normalizeText(item.productId || item.product_id),
    garmentId: normalizeText(item.garmentId),
    garmentName: normalizeText(item.garmentName || item.garment),
    brand: normalizeText(item.brand),
    category: normalizeText(item.category),
    description: normalizeText(item.description),
    imageSrc: normalizeImageSrc(item.imageSrc || item.product_image),
    selectedColor: normalizeText(item.selectedColor || item.selected_color),
    availableSizes: Array.from(new Set(
      (Array.isArray(item.availableSizes) ? item.availableSizes : [])
        .map(normalizeText)
        .filter(Boolean)
    )),
    size_breakdown: sizeBreakdown,
    quantity: Object.values(sizeBreakdown).reduce((total, value) => total + value, 0) || quantity,
    placement: normalizeText(item.placement),
    placements: normalizePlacements(item.placements, item.placement),
    decorationType: normalizeText(item.decorationType || item.decoration_type),
  };
}

export function upsertPendingCustomerLineItem(lineItems = [], lineItem = {}) {
  const normalizedItems = Array.isArray(lineItems) ? lineItems.map(normalizeLineItem) : [];
  const normalizedLineItem = normalizeLineItem(lineItem, normalizedItems.length);
  const matchingIndex = normalizedItems.findIndex((item) => item.id === normalizedLineItem.id);
  return matchingIndex >= 0
    ? normalizedItems.map((item, index) => index === matchingIndex ? normalizedLineItem : item)
    : [...normalizedItems, normalizedLineItem];
}

export function normalizePendingCustomerRequest(request = {}) {
  const placement = normalizeText(request.placement);
  const placements = normalizePlacements(request.placements, placement);

  const legacyLineItem = normalizeLineItem(request);
  const lineItems = Array.isArray(request.lineItems) && request.lineItems.length
    ? request.lineItems.map(normalizeLineItem)
    : legacyLineItem.productId || legacyLineItem.garmentName
    ? [legacyLineItem]
    : [];

  return {
    source: "public-garment-flow",
    created_at: request.created_at || new Date().toISOString(),
    garmentId: normalizeText(request.garmentId),
    productId: normalizeText(request.productId),
    garmentName: normalizeText(request.garmentName),
    brand: normalizeText(request.brand),
    category: normalizeText(request.category),
    description: normalizeText(request.description),
    imageSrc: normalizeImageSrc(request.imageSrc),
    selectedColor: normalizeText(request.selectedColor),
    selectedSize: normalizeText(request.selectedSize),
    quantity: normalizeQuantity(request.quantity),
    placement: placements[0] || "",
    placements,
    decorationType: normalizeText(request.decorationType),
    notes: normalizeText(request.notes),
    artworkName: normalizeText(request.artworkName),
    lineItems,
  };
}

export function savePendingCustomerRequest(request) {
  if (!hasBrowserStorage()) return false;
  return setJsonStorageItem(STORAGE_KEY, normalizePendingCustomerRequest(request), {
    storage: "session",
  });
}

export function getPendingCustomerRequest() {
  if (!hasBrowserStorage()) return null;
  const request = getJsonStorageItem(STORAGE_KEY, null, { storage: "session" });
  return request ? normalizePendingCustomerRequest(request) : null;
}

export function clearPendingCustomerRequest() {
  if (!hasBrowserStorage()) return false;
  return removeStorageItem(STORAGE_KEY, { storage: "session" });
}
