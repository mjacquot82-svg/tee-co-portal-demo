import {
  normalizeProductionType,
  PRODUCTION_TYPES,
} from "../constants/productionTypes";
import { useEffect, useSyncExternalStore } from "react";
import { getRawStorageItem, hasBrowserStorage, setRawStorageItem } from "./browserStorage";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const STORAGE_KEY = "teeCoProducts";
const EMPTY_PRODUCTS = [];
const productListeners = new Set();
let cachedProductsStorageRaw = null;
let cachedProductsSnapshotRaw = null;
let cachedProductsSnapshot = EMPTY_PRODUCTS;
let cachedDefaultProductsSnapshot = null;
let productsLoadStarted = false;
let productsLoadPromise = null;

function emitProductsUpdated() {
  productListeners.forEach((listener) => {
    listener();
  });
}

function toPlacementId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

function normalizePlacementLabel(value) {
  return String(value || "").trim();
}

function isProductRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeNumericPrice(value) {
  if (value === null || value === undefined || value === "") return null;

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return null;

  return Number(parsedValue.toFixed(2));
}

export function buildPlacementConfig(source = [], placementPrices = {}) {
  const rawPlacements = Array.isArray(source) ? source : [];
  const seenLabels = new Set();

  return rawPlacements.reduce((placements, entry) => {
    const label = normalizePlacementLabel(
      typeof entry === "string" ? entry : entry?.label
    );

    if (!label || seenLabels.has(label)) return placements;
    seenLabels.add(label);

    const configuredPrice =
      placementPrices?.[label] ??
      (typeof entry === "object" && entry !== null ? entry.price : undefined);

    placements.push({
      id:
        (typeof entry === "object" && entry !== null ? entry.id : "") ||
        toPlacementId(label),
      label,
      price: normalizeNumericPrice(configuredPrice),
    });

    return placements;
  }, []);
}

export function getProductPlacementConfig(product = {}) {
  const safeProduct = isProductRecord(product) ? product : {};

  if (
    Array.isArray(safeProduct.placement_config) &&
    safeProduct.placement_config.length
  ) {
    return buildPlacementConfig(
      safeProduct.placement_config,
      safeProduct.placement_prices || {}
    );
  }

  const placementLabels = normalizeList(
    safeProduct.placements ||
      safeProduct.allowed_placements ||
      safeProduct.placement_options?.map((item) => item?.label)
  );

  return buildPlacementConfig(placementLabels, safeProduct.placement_prices || {});
}

function buildPlacementPricesFromConfig(placementConfig, placementPrices = {}) {
  return placementConfig.reduce((prices, placement) => {
    const configuredPrice = placementPrices?.[placement.label];
    prices[placement.label] =
      configuredPrice === undefined
        ? normalizeNumericPrice(placement.price)
        : normalizeNumericPrice(configuredPrice);
    return prices;
  }, {});
}

export const defaultProducts = [
  {
    id: "product-hoodie",
    name: "Pullover Hoodie",
    category: "Hoodie / Sweater",
    product_type: "Pullover Hoodie",
    status: "Active",
    image: "",
    cost_price: 18,
    markup_percentage: 50,
    calculated_base_price: 28,
    colors: ["Black", "Navy", "Gray", "White"],
    sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
    placements: ["Left Chest", "Full Front", "Full Back", "Sleeve"],
    placement_prices: {
      "Left Chest": 8,
      "Full Front": 12,
      "Full Back": 18,
      Sleeve: 6,
    },
    placement_config: [
      { id: "left-chest", label: "Left Chest", price: 8 },
      { id: "full-front", label: "Full Front", price: 12 },
      { id: "full-back", label: "Full Back", price: 18 },
      { id: "sleeve", label: "Sleeve", price: 6 },
    ],
    decoration_types: ["Embroidery", "Screen Print", "DTF"],
    production_method_prices: {
      "Screen Print": 0,
      DTF: 1.5,
      Embroidery: 4.5,
    },
    notes: "General hoodie option. Add specific brands later when known.",
  },
  {
    id: "product-hat",
    name: "Hat",
    category: "Hat",
    product_type: "Cap / Hat",
    status: "Active",
    image: "",
    cost_price: 8,
    markup_percentage: 75,
    calculated_base_price: 14,
    colors: ["Black", "Navy", "Gray", "White"],
    sizes: ["OSFA"],
    placements: ["Front", "Side", "Back"],
    placement_prices: {
      Front: 10,
      Side: 6,
      Back: 5,
    },
    placement_config: [
      { id: "front", label: "Front", price: 10 },
      { id: "side", label: "Side", price: 6 },
      { id: "back", label: "Back", price: 5 },
    ],
    decoration_types: ["Embroidery"],
    production_method_prices: {
      Embroidery: 3,
    },
    notes: "Use for caps, snapbacks, and similar headwear.",
  },
  {
    id: "product-tee",
    name: "T-Shirt",
    category: "Shirt",
    product_type: "T-Shirt",
    status: "Active",
    image: "",
    cost_price: 5.5,
    markup_percentage: 80,
    calculated_base_price: 18,
    colors: ["Black", "White", "Gray", "Navy"],
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    placements: ["Left Chest", "Full Front", "Full Back", "Sleeve"],
    placement_prices: {
      "Left Chest": 4,
      "Full Front": 12,
      "Full Back": 12,
      Sleeve: 5,
    },
    placement_config: [
      { id: "left-chest", label: "Left Chest", price: 4 },
      { id: "full-front", label: "Full Front", price: 12 },
      { id: "full-back", label: "Full Back", price: 12 },
      { id: "sleeve", label: "Sleeve", price: 5 },
    ],
    decoration_types: ["Screen Print", "DTF", "Embroidery"],
    production_method_prices: {
      "Screen Print": 0,
      DTF: 1.25,
      Embroidery: 3.5,
    },
    notes: "Generic shirt category until exact brand catalog is added.",
  },
];

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePlacementPrices(placements, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return placements.reduce((prices, placement) => {
      prices[placement] = normalizeNumericPrice(value?.[placement]);
      return prices;
    }, {});
  }

  const prices = {};
  const lines = String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line) => {
    const [placement, price] = line.split(":").map((item) => item.trim());
    if (placement) prices[placement] = normalizeNumericPrice(price);
  });

  placements.forEach((placement) => {
    if (!(placement in prices)) prices[placement] = null;
  });

  return prices;
}

function calculateBaseSellPrice(cost = 0, markup = 0) {
  const parsedCost = Number(cost || 0);
  const parsedMarkup = Number(markup || 0);

  return Number(
    (parsedCost + parsedCost * (parsedMarkup / 100)).toFixed(2)
  );
}

function parsePriceCandidate(value) {
  if (value === null || value === undefined || value === "") return null;

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return null;

  return parsedValue;
}

function findFirstPositivePrice(...values) {
  for (const value of values) {
    const parsedValue = parsePriceCandidate(value);
    if (parsedValue !== null && parsedValue > 0) {
      return Number(parsedValue.toFixed(2));
    }
  }

  return null;
}

export function resolveProductBasePrice(product = {}) {
  const explicitBasePrice = findFirstPositivePrice(
    product?.unit_price,
    product?.base_garment_price,
    product?.calculated_base_price,
    product?.startingPrice,
    product?.starting_price,
    product?.basePrice,
    product?.base_price,
    product?.garmentPrice,
    product?.garment_price,
    product?.price,
    product?.retail_price
  );

  if (explicitBasePrice !== null) {
    return explicitBasePrice;
  }

  const costPrice = parsePriceCandidate(product?.cost_price);
  const markupPercentage = parsePriceCandidate(product?.markup_percentage) ?? 0;

  if (costPrice !== null && costPrice > 0) {
    return calculateBaseSellPrice(costPrice, markupPercentage);
  }

  return null;
}

function normalizeProductionMethods(product) {
  const explicitMethods = [
    ...(Array.isArray(product?.production_methods)
      ? product.production_methods
      : []),
    ...(Array.isArray(product?.decoration_types)
      ? product.decoration_types
      : []),
    ...(product?.decoration_type ? [product.decoration_type] : []),
  ]
    .map((type) => normalizeProductionType(type))
    .filter(Boolean);

  return Array.from(
    new Set(explicitMethods.length ? explicitMethods : PRODUCTION_TYPES)
  );
}

function normalizeProductionMethodPrices(methods, value) {
  const prices =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};

  return methods.reduce((accumulator, method) => {
    accumulator[method] = normalizeNumericPrice(prices?.[method]);
    return accumulator;
  }, {});
}

function normalizeProduct(product) {
  if (!isProductRecord(product)) return null;

  const placementConfig = getProductPlacementConfig(product);
  const placements = placementConfig.map((item) => item.label);
  const placementPrices = buildPlacementPricesFromConfig(
    placementConfig,
    normalizePlacementPrices(placements, product.placement_prices)
  );
  const costPrice = Number(product.cost_price || 0);
  const markupPercentage = Number(product.markup_percentage || 0);
  const resolvedBasePrice = resolveProductBasePrice(product);
  const productionMethods = normalizeProductionMethods(product);
  const productionMethodPrices = normalizeProductionMethodPrices(
    productionMethods,
    product.production_method_prices
  );

  return {
    ...product,
    product_type: product.product_type || product.type || product.name || "General",
    cost_price: costPrice,
    markup_percentage: markupPercentage,
    calculated_base_price: resolvedBasePrice,
    base_garment_price: resolvedBasePrice,
    unit_price: resolvedBasePrice,
    placements,
    allowed_placements: placements,
    placement_prices: placementPrices,
    placement_config: placementConfig,
    production_methods: productionMethods,
    decoration_types: productionMethods,
    production_method_prices: productionMethodPrices,
  };
}

function normalizeStoredProductsCollection(products) {
  const sourceProducts = Array.isArray(products) ? products : defaultProducts;
  return sourceProducts.map(normalizeProduct).filter(Boolean);
}

function getDefaultProductsSnapshot() {
  if (cachedDefaultProductsSnapshot) {
    return cachedDefaultProductsSnapshot;
  }

  cachedDefaultProductsSnapshot = normalizeStoredProductsCollection(defaultProducts);
  return cachedDefaultProductsSnapshot;
}

function cacheProductsSnapshot(products) {
  const normalizedProducts = normalizeStoredProductsCollection(products);
  const normalizedSnapshot = JSON.stringify(normalizedProducts);

  if (normalizedSnapshot === cachedProductsSnapshotRaw) {
    return {
      normalizedProducts: cachedProductsSnapshot,
      normalizedSnapshot,
    };
  }

  cachedProductsSnapshotRaw = normalizedSnapshot;
  cachedProductsSnapshot = normalizedProducts;

  return {
    normalizedProducts: cachedProductsSnapshot,
    normalizedSnapshot,
  };
}

function setProductsSnapshot(products) {
  const { normalizedProducts, normalizedSnapshot } = cacheProductsSnapshot(products);
  cachedProductsStorageRaw = normalizedSnapshot;

  if (hasBrowserStorage()) {
    setRawStorageItem(STORAGE_KEY, normalizedSnapshot);
  }

  emitProductsUpdated();
  return normalizedProducts;
}

function buildSupabaseProductRecord(product = {}, options = {}) {
  const record = {
    name: product.name || "",
    category: product.category || "Catalog",
    image: product.image || "",
    active:
      typeof product.active === "boolean"
        ? product.active
        : normalizeProductStatus(product.status) === "active",
    price: resolveProductBasePrice(product) ?? normalizeNumericPrice(product.price) ?? 0,
  };

  if (options.includeId && product.id) {
    record.id = product.id;
  }

  return record;
}

function normalizeSupabaseProduct(product = {}) {
  return normalizeProduct({
    ...product,
    status: product?.active === false ? "Archived" : "Active",
    price: normalizeNumericPrice(product?.price),
    base_price: normalizeNumericPrice(product?.price),
    unit_price: normalizeNumericPrice(product?.price),
    base_garment_price: normalizeNumericPrice(product?.price),
    calculated_base_price: normalizeNumericPrice(product?.price),
  });
}

async function fetchProductsFromSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("products")
    .select("id, created_at, name, category, price, image, active")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Unable to fetch Tee & Co products from Supabase", error);
    throw error;
  }

  return Array.isArray(data) ? data.map(normalizeSupabaseProduct).filter(Boolean) : [];
}

export async function refreshStoredProducts() {
  const remoteProducts = await fetchProductsFromSupabase();

  if (!remoteProducts) {
    return getStoredProducts();
  }

  return setProductsSnapshot(remoteProducts);
}

function ensureStoredProductsLoaded() {
  if (productsLoadPromise) {
    return productsLoadPromise;
  }

  if (productsLoadStarted) {
    return Promise.resolve(cachedProductsSnapshot);
  }

  productsLoadStarted = true;
  productsLoadPromise = refreshStoredProducts()
    .catch((error) => {
      console.error("Falling back to cached Tee & Co products", error);
      return getStoredProducts();
    })
    .finally(() => {
      productsLoadPromise = null;
    });

  return productsLoadPromise;
}

export function getStoredProducts() {
  if (!hasBrowserStorage()) return getDefaultProductsSnapshot();

  try {
    const rawProducts = getRawStorageItem(STORAGE_KEY);
    const storageRawProducts = rawProducts || "";

    if (storageRawProducts === cachedProductsStorageRaw) {
      return cachedProductsSnapshot;
    }

    const parsedProducts = rawProducts ? JSON.parse(rawProducts) : getDefaultProductsSnapshot();
    const { normalizedProducts } = cacheProductsSnapshot(parsedProducts);

    cachedProductsStorageRaw = storageRawProducts;

    return normalizedProducts;
  } catch (error) {
    console.error("Unable to read Tee & Co products", error);
    cachedProductsStorageRaw = null;
    cachedProductsSnapshotRaw = null;
    cachedProductsSnapshot = getDefaultProductsSnapshot();
    return cachedProductsSnapshot;
  }
}

export function saveStoredProducts(products) {
  setProductsSnapshot(products);
}

export function subscribeToStoredProducts(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  productListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      productListeners.delete(listener);
    };
  }

  const handleStorage = (event) => {
    if (!event.key || event.key === STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    productListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useStoredProducts() {
  const products = useSyncExternalStore(
    subscribeToStoredProducts,
    getStoredProducts,
    () => EMPTY_PRODUCTS
  );

  useEffect(() => {
    ensureStoredProductsLoaded();
  }, []);

  return products;
}

export async function createStoredProduct(productInput) {
  const placements = normalizeList(productInput.placements);
  const placementPrices = normalizePlacementPrices(placements, productInput.placement_prices);
  const placementConfig = buildPlacementConfig(
    Array.isArray(productInput.placement_config) && productInput.placement_config.length
      ? productInput.placement_config
      : placements,
    placementPrices
  );
  const product = normalizeProduct({
    ...productInput,
    status: productInput.status || "Active",
    colors: normalizeList(productInput.colors),
    sizes: normalizeList(productInput.sizes),
    placements,
    placement_prices: placementPrices,
    placement_config: placementConfig,
    decoration_types: normalizeList(productInput.decoration_types),
  });

  if (!isSupabaseConfigured || !supabase) {
    const localProduct = {
      ...product,
      id: `product-${Date.now()}`,
    };
    const nextProducts = [localProduct, ...getStoredProducts()];
    saveStoredProducts(nextProducts);
    return localProduct;
  }

  const { data, error } = await supabase
    .from("products")
    .insert(buildSupabaseProductRecord(product, { includeId: true }))
    .select("id, created_at, name, category, price, image, active")
    .single();

  if (error) {
    console.error("Unable to create Tee & Co product in Supabase", error);
    throw error;
  }

  const createdProduct = normalizeSupabaseProduct(data);
  const nextProducts = [
    createdProduct,
    ...getStoredProducts().filter(
      (existingProduct) => existingProduct.id !== createdProduct.id
    ),
  ];
  saveStoredProducts(nextProducts);
  return createdProduct;
}

export function getStoredProduct(productId) {
  return getStoredProducts().find((product) => product.id === productId) || null;
}

export async function updateStoredProduct(productId, updates) {
  const products = getStoredProducts();
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(updates, key);
  const nextProducts = products.map((product) => {
    if (product.id !== productId) return product;

    const placements = hasOwn("placements")
      ? normalizeList(updates.placements)
      : product.placements;
    const placementPrices = hasOwn("placement_prices")
      ? normalizePlacementPrices(placements, updates.placement_prices)
      : product.placement_prices || normalizePlacementPrices(placements, {});
    const placementConfig = buildPlacementConfig(
      Array.isArray(updates.placement_config) && updates.placement_config.length
        ? updates.placement_config
        : placements,
      placementPrices
    );

    return normalizeProduct({
      ...product,
      ...updates,
      colors: hasOwn("colors") ? normalizeList(updates.colors) : product.colors,
      sizes: hasOwn("sizes") ? normalizeList(updates.sizes) : product.sizes,
      placements,
      placement_prices: placementPrices,
      placement_config: placementConfig,
      decoration_types: hasOwn("decoration_types")
        ? normalizeList(updates.decoration_types)
        : product.decoration_types,
    });
  });

  const updatedProduct = nextProducts.find((product) => product.id === productId) || null;
  if (!updatedProduct) return null;

  if (!isSupabaseConfigured || !supabase) {
    saveStoredProducts(nextProducts);
    return updatedProduct;
  }

  const { data, error } = await supabase
    .from("products")
    .update(buildSupabaseProductRecord(updatedProduct))
    .eq("id", productId)
    .select("id, created_at, name, category, price, image, active")
    .single();

  if (error) {
    console.error("Unable to update Tee & Co product in Supabase", error);
    throw error;
  }

  const normalizedUpdatedProduct = normalizeSupabaseProduct(data);
  saveStoredProducts(
    nextProducts.map((product) =>
      product.id === productId ? normalizedUpdatedProduct : product
    )
  );
  return normalizedUpdatedProduct;
}

export async function deleteStoredProduct(productId) {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from("products").delete().eq("id", productId);

    if (error) {
      console.error("Unable to delete Tee & Co product from Supabase", error);
      throw error;
    }
  }

  const nextProducts = getStoredProducts().filter((product) => product.id !== productId);
  saveStoredProducts(nextProducts);
}
