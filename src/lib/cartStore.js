import { useSyncExternalStore } from "react";
import { getRawStorageItem, hasBrowserStorage, setRawStorageItem } from "./browserStorage";

const STORAGE_KEY = "teeCoCart";
const cartListeners = new Set();
const EMPTY_CART = [];

let cachedCartRaw = null;
let cachedCartSnapshot = EMPTY_CART;

function emitCartUpdated() {
  cartListeners.forEach((listener) => listener());
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizePrice(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) return 0;
  return Number(parsedValue.toFixed(2));
}

function normalizeQuantity(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) return 1;
  return Math.max(1, Math.round(parsedValue));
}

function buildCartItemId(item = {}) {
  return [
    normalizeText(item.productId || item.product_id),
    normalizeText(item.selectedColor || item.selected_color),
    normalizeText(item.selectedSize || item.selected_size),
  ].join("::");
}

function normalizeCartItem(item = {}) {
  return {
    id: normalizeText(item.id) || buildCartItemId(item),
    productId: normalizeText(item.productId || item.product_id),
    garmentId: normalizeText(item.garmentId || item.garment_id),
    name: normalizeText(item.name || item.garmentName || item.garment_name) || "Catalog Product",
    brand: normalizeText(item.brand),
    category: normalizeText(item.category),
    imageSrc: normalizeText(item.imageSrc || item.image_src),
    selectedColor: normalizeText(item.selectedColor || item.selected_color) || "Default",
    selectedSize: normalizeText(item.selectedSize || item.selected_size) || "Default",
    quantity: normalizeQuantity(item.quantity),
    unitPrice: normalizePrice(item.unitPrice ?? item.unit_price),
    createdAt: normalizeText(item.createdAt || item.created_at) || new Date().toISOString(),
  };
}

function readStoredCart() {
  if (!hasBrowserStorage()) return EMPTY_CART;

  try {
    const rawCart = getRawStorageItem(STORAGE_KEY);
    const normalizedRawCart = rawCart || "";

    if (normalizedRawCart === cachedCartRaw) {
      return cachedCartSnapshot;
    }

    const parsedCart = rawCart ? JSON.parse(rawCart) : [];

    cachedCartRaw = normalizedRawCart;
    cachedCartSnapshot = Array.isArray(parsedCart)
      ? parsedCart.map((item) => normalizeCartItem(item))
      : EMPTY_CART;

    return cachedCartSnapshot;
  } catch (error) {
    console.error("Unable to read stored Tee & Co cart", error);
    cachedCartRaw = null;
    cachedCartSnapshot = EMPTY_CART;
    return EMPTY_CART;
  }
}

function saveStoredCart(items) {
  if (!hasBrowserStorage()) return false;

  const normalizedItems = Array.isArray(items)
    ? items.map((item) => normalizeCartItem(item))
    : [];

  const saved = setRawStorageItem(STORAGE_KEY, JSON.stringify(normalizedItems));
  if (!saved) {
    return false;
  }

  emitCartUpdated();
  return true;
}

export function getStoredCart() {
  return readStoredCart();
}

export function subscribeToStoredCart(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  cartListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      cartListeners.delete(listener);
    };
  }

  const handleStorage = (event) => {
    if (!event.key || event.key === STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    cartListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useStoredCart() {
  return useSyncExternalStore(subscribeToStoredCart, getStoredCart, () => EMPTY_CART);
}

export function addCartItem(itemInput = {}) {
  const nextItem = normalizeCartItem(itemInput);
  const currentCart = getStoredCart();
  const existingItem = currentCart.find((item) => item.id === nextItem.id);

  const nextCart = existingItem
    ? currentCart.map((item) =>
        item.id === nextItem.id
          ? normalizeCartItem({
              ...item,
              quantity: item.quantity + nextItem.quantity,
              unitPrice: nextItem.unitPrice || item.unitPrice,
              imageSrc: nextItem.imageSrc || item.imageSrc,
              name: nextItem.name || item.name,
              brand: nextItem.brand || item.brand,
              category: nextItem.category || item.category,
            })
          : item
      )
    : [...currentCart, nextItem];

  if (!saveStoredCart(nextCart)) {
    throw new Error("Unable to add item to cart. Browser storage write failed.");
  }

  return nextItem;
}

export function removeCartItem(itemId) {
  const normalizedItemId = normalizeText(itemId);
  const nextCart = getStoredCart().filter((item) => item.id !== normalizedItemId);

  if (!saveStoredCart(nextCart)) {
    throw new Error("Unable to remove item from cart. Browser storage write failed.");
  }
}

export function updateCartItemQuantity(itemId, quantity) {
  const normalizedItemId = normalizeText(itemId);
  const normalizedQuantity = normalizeQuantity(quantity);
  const nextCart = getStoredCart().map((item) =>
    item.id === normalizedItemId
      ? normalizeCartItem({
          ...item,
          quantity: normalizedQuantity,
        })
      : item
  );

  if (!saveStoredCart(nextCart)) {
    throw new Error("Unable to update cart quantity. Browser storage write failed.");
  }
}

export function clearCart() {
  if (!saveStoredCart([])) {
    throw new Error("Unable to clear cart. Browser storage write failed.");
  }
}

export function getCartItemCount(items = []) {
  return (Array.isArray(items) ? items : []).reduce(
    (total, item) => total + normalizeQuantity(item?.quantity),
    0
  );
}

export function getCartTotal(items = []) {
  return (Array.isArray(items) ? items : []).reduce(
    (total, item) => total + normalizePrice(item?.unitPrice) * normalizeQuantity(item?.quantity),
    0
  );
}
