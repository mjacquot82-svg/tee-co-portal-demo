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

export function normalizePendingCustomerRequest(request = {}) {
  const placement = normalizeText(request.placement);
  const placements = normalizePlacements(request.placements, placement);

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
