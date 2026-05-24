import {
  normalizeProductionType,
  PRODUCTION_TYPES,
} from "../constants/productionTypes";
import { useEffect, useSyncExternalStore } from "react";
import { getRawStorageItem, hasBrowserStorage, setRawStorageItem } from "./browserStorage";
import { syncGarmentLibraryProductLinks } from "./garmentLibraryStore";
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfig,
  supabaseDiagnostics,
} from "./supabaseClient";

const STORAGE_KEY = "teeCoProducts";
const EMPTY_PRODUCTS = [];
const productListeners = new Set();
let cachedProductsStorageRaw = null;
let cachedProductsSnapshotRaw = null;
let cachedProductsSnapshot = EMPTY_PRODUCTS;
let productsLoadStarted = false;
let productsLoadPromise = null;
let hasLoadedProductsFromSupabase = false;
let refreshSequence = 0;

const PRODUCTS_SELECT_FIELDS = [
  "id",
  "legacy_product_id",
  "sku",
  "name",
  "category",
  "storefront_category",
  "category_lookup_id",
  "storefront_category_lookup_id",
  "product_type",
  "brand_model",
  "brand_lookup_id",
  "garment_library_item_id",
  "garment_model_lookup_id",
  "status",
  "image",
  "colors",
  "sizes",
  "placements",
  "placement_config",
  "placement_prices",
  "production_methods",
  "decoration_types",
  "production_method_prices",
  "cost_price",
  "markup_percentage",
  "base_garment_price",
  "compare_at_price",
  "unit_price",
  "notes",
].join(", ");

const LEGACY_PRODUCTS_SELECT_FIELDS = PRODUCTS_SELECT_FIELDS
  .replace("storefront_category, ", "")
  .replace("storefront_category_lookup_id, ", "")
  .replace("compare_at_price, ", "")
  .replace("garment_library_item_id, ", "");

function buildSupabaseProductErrorDetails(error, extra = {}) {
  if (!error || typeof error !== "object") {
    return {
      ...extra,
      error,
    };
  }

  return {
    ...extra,
    name: error.name,
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    status: error.status,
    statusCode: error.statusCode,
    error,
  };
}

function logSupabaseProductError(message, error, extra = {}) {
  console.error(message, buildSupabaseProductErrorDetails(error, extra));
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isMissingProductColumnError(error, columnName) {
  const message = String(error?.message || "");
  const details = String(error?.details || "");
  const hint = String(error?.hint || "");
  return [message, details, hint].some((value) => value.includes(columnName));
}

function isLegacyProductSchemaError(error) {
  return [
    "garment_library_item_id",
    "storefront_category",
    "storefront_category_lookup_id",
    "compare_at_price",
  ].some((columnName) => isMissingProductColumnError(error, columnName));
}

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

function normalizeStatusValue(value) {
  return String(value || "").trim().toLowerCase();
}

function buildPersistentStatus(value, fallback = "Active") {
  const normalizedValue = normalizeStatusValue(value);
  if (!normalizedValue) return fallback;
  return normalizedValue === "active" ? "Active" : "Inactive";
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
    status: buildPersistentStatus(
      product?.status ?? (product?.active === false ? "Inactive" : "Active")
    ),
    storefront_category: product.storefront_category || product.category || "Catalog",
    storefront_category_lookup_id:
      product.storefront_category_lookup_id || product.category_lookup_id || null,
    garment_library_item_id:
      product.garment_library_item_id || product.garment_library_id || null,
    product_type: product.product_type || product.type || product.name || "General",
    cost_price: costPrice,
    markup_percentage: markupPercentage,
    calculated_base_price: resolvedBasePrice,
    base_garment_price: resolvedBasePrice,
    compare_at_price: normalizeNumericPrice(product?.compare_at_price),
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
  const sourceProducts = Array.isArray(products) ? products : EMPTY_PRODUCTS;
  return sourceProducts.map(normalizeProduct).filter(Boolean);
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

function buildProductDebugSummary(product = {}) {
  return {
    id: product?.id || null,
    name: product?.name || "",
    status: product?.status || "",
    category: product?.category || "",
    storefront_category: product?.storefront_category || "",
    garment_library_item_id: product?.garment_library_item_id || null,
    colorCount: Array.isArray(product?.colors) ? product.colors.length : 0,
    sizeCount: Array.isArray(product?.sizes) ? product.sizes.length : 0,
    price: product?.unit_price ?? product?.base_garment_price ?? null,
  };
}

function safeProductsSnapshot(products = []) {
  return (Array.isArray(products) ? products : []).map((product) => buildProductDebugSummary(product));
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

async function syncGarmentLinks(products) {
  try {
    await syncGarmentLibraryProductLinks(products);
  } catch (error) {
    console.warn("[productsStore] Unable to synchronize garment storefront links", {
      productCount: Array.isArray(products) ? products.length : 0,
      message: error?.message,
      error,
    });
  }
}

function getLocalProductsSnapshot() {
  if (!hasBrowserStorage()) return EMPTY_PRODUCTS;

  try {
    const rawProducts = getRawStorageItem(STORAGE_KEY);
    const storageRawProducts = rawProducts || "";

    if (storageRawProducts === cachedProductsStorageRaw) {
      return cachedProductsSnapshot;
    }

    const parsedProducts = rawProducts ? JSON.parse(rawProducts) : EMPTY_PRODUCTS;
    const { normalizedProducts } = cacheProductsSnapshot(parsedProducts);

    cachedProductsStorageRaw = storageRawProducts;

    return normalizedProducts;
  } catch (error) {
    console.error("Unable to read Tee & Co products", error);
    cachedProductsStorageRaw = null;
    cachedProductsSnapshotRaw = null;
    cachedProductsSnapshot = EMPTY_PRODUCTS;
    return cachedProductsSnapshot;
  }
}

function buildSupabaseProductRecord(product = {}, options = {}) {
  const normalizedStatus =
    product.active !== undefined && !Object.prototype.hasOwnProperty.call(product, "status")
      ? product.active
        ? "Active"
        : "Inactive"
      : buildPersistentStatus(product.status);

  const record = {
    legacy_product_id: product.legacy_product_id || null,
    sku: product.sku || "",
    name: product.name || "",
    category: product.category || "Catalog",
    storefront_category: product.storefront_category || product.category || "Catalog",
    category_lookup_id: product.category_lookup_id || null,
    storefront_category_lookup_id:
      product.storefront_category_lookup_id || product.category_lookup_id || null,
    product_type: product.product_type || product.type || product.name || "",
    brand_model: product.brand_model || "",
    brand_lookup_id: product.brand_lookup_id || null,
    garment_library_item_id:
      product.garment_library_item_id || product.garment_library_id || null,
    garment_model_lookup_id: product.garment_model_lookup_id || null,
    status: normalizedStatus,
    image: product.image || "",
    colors: normalizeList(product.colors),
    sizes: normalizeList(product.sizes),
    placements: normalizeList(product.placements),
    placement_config: buildPlacementConfig(
      Array.isArray(product.placement_config) && product.placement_config.length
        ? product.placement_config
        : product.placements,
      product.placement_prices || {}
    ),
    placement_prices: product.placement_prices || {},
    production_methods: Array.isArray(product.production_methods)
      ? product.production_methods
      : [],
    decoration_types: Array.isArray(product.decoration_types)
      ? product.decoration_types
      : Array.isArray(product.production_methods)
      ? product.production_methods
      : [],
    production_method_prices: product.production_method_prices || {},
    cost_price: normalizeNumericPrice(product.cost_price) ?? 0,
    markup_percentage: normalizeNumericPrice(product.markup_percentage) ?? 0,
    base_garment_price: resolveProductBasePrice(product),
    compare_at_price: normalizeNumericPrice(product.compare_at_price),
    unit_price: resolveProductBasePrice(product),
    notes: product.notes || "",
  };

  if (options.includeId && product.id) {
    record.id = product.id;
  }

  return record;
}

function normalizeSupabaseProduct(product = {}) {
  return normalizeProduct({
    ...product,
    status: buildPersistentStatus(
      product?.status ?? (product?.active === false ? "Inactive" : "Active")
    ),
    price: normalizeNumericPrice(
      product?.unit_price ?? product?.base_garment_price ?? product?.price
    ),
    base_price: normalizeNumericPrice(
      product?.unit_price ?? product?.base_garment_price ?? product?.price
    ),
    unit_price: normalizeNumericPrice(
      product?.unit_price ?? product?.base_garment_price ?? product?.price
    ),
    base_garment_price: normalizeNumericPrice(
      product?.base_garment_price ?? product?.unit_price ?? product?.price
    ),
    compare_at_price: normalizeNumericPrice(product?.compare_at_price),
    calculated_base_price: normalizeNumericPrice(
      product?.unit_price ?? product?.base_garment_price ?? product?.price
    ),
  });
}

function omitGarmentLibraryItemId(record = {}) {
  const {
    garment_library_item_id: _GARMENT_LIBRARY_ITEM_ID,
    storefront_category: _STOREFRONT_CATEGORY,
    storefront_category_lookup_id: _STOREFRONT_CATEGORY_LOOKUP_ID,
    compare_at_price: _COMPARE_AT_PRICE,
    ...legacyRecord
  } = record;
  return legacyRecord;
}

async function queryInsertedProductRow(productId, options = {}) {
  if (!productId || !isSupabaseConfigured || !supabase) {
    return {
      data: null,
      error: null,
      usedLegacySelect: false,
      usedLegacyFilter: false,
      label: options.label || "unspecified",
    };
  }

  const label = options.label || "unspecified";
  let usedLegacySelect = false;
  let usedLegacyFilter = false;
  let query = supabase
    .from("products")
    .select(PRODUCTS_SELECT_FIELDS)
    .eq("id", productId)
    .maybeSingle();
  let { data, error } = await query;

  if (error && isLegacyProductSchemaError(error)) {
    usedLegacySelect = true;
    query = supabase
      .from("products")
      .select(LEGACY_PRODUCTS_SELECT_FIELDS)
      .eq("id", productId)
      .maybeSingle();
    ({ data, error } = await query);
  }

  if (error && isLegacyProductSchemaError(error)) {
    usedLegacyFilter = true;
    query = supabase
      .from("products")
      .select(LEGACY_PRODUCTS_SELECT_FIELDS)
      .eq("legacy_product_id", productId)
      .maybeSingle();
    ({ data, error } = await query);
  }

  console.info("[StorefrontCreateVerification] post-insert products table query result", {
    verificationStep: label,
    productId,
    usedLegacySelect,
    usedLegacyFilter,
    queryData: data,
    queryError: error
      ? buildSupabaseProductErrorDetails(error, {
          table: "products",
          action: "select-after-insert",
          label,
          productId,
        })
      : null,
    rowExists: Boolean(data),
  });

  return {
    data,
    error,
    usedLegacySelect,
    usedLegacyFilter,
    label,
  };
}

async function fetchProductsFromSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  console.info("[productsStore] Fetching storefront products from Supabase");

  let query = supabase.from("products").select(PRODUCTS_SELECT_FIELDS);
  let { data, error } = await query;

  if (error && isLegacyProductSchemaError(error)) {
    console.warn(
      "[productsStore] storefront product schema is unavailable; falling back to legacy product schema"
    );
    query = supabase.from("products").select(LEGACY_PRODUCTS_SELECT_FIELDS);
    ({ data, error } = await query);
  }

  if (error) {
    logSupabaseProductError("Unable to fetch Tee & Co products from Supabase", error, {
      table: "products",
      action: "select",
      select: PRODUCTS_SELECT_FIELDS,
    });
    throw error;
  }

  const normalizedProducts = Array.isArray(data)
    ? data.map(normalizeSupabaseProduct).filter(Boolean)
    : [];
  normalizedProducts.sort((left, right) => {
    const leftTimestamp = Date.parse(left?.created_at || "") || 0;
    const rightTimestamp = Date.parse(right?.created_at || "") || 0;

    if (leftTimestamp !== rightTimestamp) {
      return rightTimestamp - leftTimestamp;
    }

    return String(right?.id || "").localeCompare(String(left?.id || ""));
  });
  console.info(
    "[productsStore] Supabase storefront products fetched",
    {
      count: normalizedProducts.length,
      products: normalizedProducts.map((product) => buildProductDebugSummary(product)),
    }
  );
  return normalizedProducts;
}

export async function refreshStoredProducts() {
  const refreshId = ++refreshSequence;
  const localProductsBeforeRefresh = getLocalProductsSnapshot();
  console.info("[productsStore] Starting storefront products refresh", {
    refreshId,
    localCountBeforeRefresh: localProductsBeforeRefresh.length,
    localProductsBeforeRefresh: safeProductsSnapshot(localProductsBeforeRefresh),
  });
  const remoteProducts = await fetchProductsFromSupabase();

  if (!remoteProducts) {
    console.info("[productsStore] Skipping storefront product publish because no remote products were returned", {
      refreshId,
      localCountBeforeRefresh: localProductsBeforeRefresh.length,
    });
    return getLocalProductsSnapshot();
  }

  hasLoadedProductsFromSupabase = true;
  const snapshot = setProductsSnapshot(remoteProducts);
  console.info("[productsStore] Published storefront product snapshot after refresh", {
    refreshId,
    remoteCount: remoteProducts.length,
    localCountBeforeRefresh: localProductsBeforeRefresh.length,
    publishedCount: snapshot.length,
    publishedProducts: snapshot.map((product) => buildProductDebugSummary(product)),
  });
  await syncGarmentLinks(snapshot);
  return snapshot;
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
      return cachedProductsSnapshot;
    })
    .finally(() => {
      productsLoadPromise = null;
    });

  return productsLoadPromise;
}

export function getStoredProducts() {
  if (isSupabaseConfigured && supabase) {
    if (hasLoadedProductsFromSupabase || productsLoadStarted || cachedProductsSnapshot.length > 0) {
      return cachedProductsSnapshot;
    }

    return EMPTY_PRODUCTS;
  }

  return getLocalProductsSnapshot();
}

export function areStoredProductsReady() {
  if (!isSupabaseConfigured || !supabase) {
    return true;
  }

  return hasLoadedProductsFromSupabase;
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
  console.info("[productsStore] createStoredProduct called", {
    verificationStep: "step-2 createStoredProduct called",
    rawInput: productInput,
    rawInputSummary: buildProductDebugSummary(productInput),
    currentStoredProductCountBeforeCreate: getStoredProducts().length,
    currentStoredProductsBeforeCreate: safeProductsSnapshot(getStoredProducts()),
  });
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
    status: buildPersistentStatus(productInput.status),
    colors: normalizeList(productInput.colors),
    sizes: normalizeList(productInput.sizes),
    placements,
    placement_prices: placementPrices,
    placement_config: placementConfig,
    decoration_types: normalizeList(productInput.decoration_types),
  });
  console.info("[productsStore] Preparing storefront product for creation", {
    verificationStep: "step-3 normalized product payload",
    input: buildProductDebugSummary(productInput),
    normalizedProduct: buildProductDebugSummary(product),
    normalizedProductSnapshot: product,
    requiredFieldSummary: {
      hasName: Boolean(String(product?.name || "").trim()),
      hasStatus: Boolean(String(product?.status || "").trim()),
      hasCategory: Boolean(String(product?.category || "").trim()),
      hasGarmentLibraryItemId: Boolean(product?.garment_library_item_id),
    },
  });

  if (!isSupabaseConfigured || !supabase) {
    const previousProducts = getStoredProducts();
    const localProduct = {
      ...product,
      id: `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    const nextProducts = [localProduct, ...previousProducts];
    hasLoadedProductsFromSupabase = true;
    saveStoredProducts(nextProducts);
    console.info("[StorefrontCreateVerification] step-4 product added to products store", {
      createdProduct: buildProductDebugSummary(localProduct),
      createStoredProductReturnValue: localProduct,
      addedToLocalProductsArray: nextProducts.some((entry) => entry.id === localProduct.id),
      productCounts: {
        beforeCreate: previousProducts.length,
        afterCreate: nextProducts.length,
        increased: nextProducts.length > previousProducts.length,
      },
      persistedSnapshot: nextProducts.map((entry) => buildProductDebugSummary(entry)),
    });
    console.info("[StorefrontCreateVerification] step-5 products store count increased", {
      createdProductId: localProduct.id,
      createdProductName: localProduct.name,
      createdProductPresentInStore: nextProducts.some((entry) => entry.id === localProduct.id),
      productCounts: {
        beforeCreate: previousProducts.length,
        afterCreate: nextProducts.length,
        increased: nextProducts.length > previousProducts.length,
      },
    });
    await syncGarmentLinks(nextProducts);
    return localProduct;
  }

  const payload = buildSupabaseProductRecord(product, { includeId: true });
  console.info("[StorefrontCreateVerification] step-3 exact payload sent to Supabase", {
    verificationStep: "step-3 exact payload sent to Supabase",
    supabaseTarget: {
      url: supabaseConfig.url,
      resolvedPublishableKeySource: supabaseDiagnostics.resolvedPublishableKeySource,
      table: "public.products",
    },
    payload,
    payloadSummary: buildProductDebugSummary(payload),
  });
  let query = supabase.from("products").insert(payload).select(PRODUCTS_SELECT_FIELDS).single();
  let { data, error } = await query;
  console.info("[StorefrontCreateVerification] step-4 exact Supabase insert response", {
    verificationStep: "step-4 exact Supabase insert response",
    usedLegacyInsertFallback: false,
    insertResponseData: data,
    insertResponseError: error
      ? buildSupabaseProductErrorDetails(error, {
          table: "products",
          action: "insert",
          select: PRODUCTS_SELECT_FIELDS,
        })
      : null,
  });

  if (error && isLegacyProductSchemaError(error)) {
    console.warn(
      "[StorefrontCreateVerification] insert fallback triggered because storefront category fields are unavailable"
    );
    query = supabase
      .from("products")
      .insert(omitGarmentLibraryItemId(payload))
      .select(LEGACY_PRODUCTS_SELECT_FIELDS)
      .single();
    ({ data, error } = await query);
    console.info("[StorefrontCreateVerification] step-4 exact Supabase insert response", {
      verificationStep: "step-4 exact Supabase insert response",
      usedLegacyInsertFallback: true,
      insertPayload: omitGarmentLibraryItemId(payload),
      insertResponseData: data,
      insertResponseError: error
        ? buildSupabaseProductErrorDetails(error, {
            table: "products",
            action: "insert",
            select: LEGACY_PRODUCTS_SELECT_FIELDS,
          })
        : null,
    });
  }

  if (error) {
    console.error("[StorefrontCreateVerification] step-5 Supabase insert error", {
      verificationStep: "step-5 Supabase insert error",
      error: buildSupabaseProductErrorDetails(error, {
        table: "products",
        action: "insert",
        select: PRODUCTS_SELECT_FIELDS,
        payload,
      }),
    });
    logSupabaseProductError("Unable to create Tee & Co product in Supabase", error, {
      table: "products",
      action: "insert",
      select: PRODUCTS_SELECT_FIELDS,
      payload,
    });
    throw error;
  }

  const createdProduct = normalizeProduct({
    ...normalizeSupabaseProduct(data),
    garment_library_item_id:
      data?.garment_library_item_id ?? product.garment_library_item_id ?? null,
  });
  const insertedProductId = data?.id ?? createdProduct?.id ?? payload?.id ?? null;
  const immediateQuery = await queryInsertedProductRow(insertedProductId, {
    label: "step-6 immediate products table query after insert",
  });
  const delayedQueryDelayMs = 1500;
  await sleep(delayedQueryDelayMs);
  const delayedQuery = await queryInsertedProductRow(insertedProductId, {
    label: "step-8 delayed products table query after insert",
  });
  console.info("[StorefrontCreateVerification] insert lifecycle verdict", {
    verificationStep: "insert lifecycle verdict",
    insertedProductId,
    insertReturnedRow: data,
    immediateQueryRow: immediateQuery.data,
    immediateQueryError: immediateQuery.error
      ? buildSupabaseProductErrorDetails(immediateQuery.error, {
          table: "products",
          action: "select-after-insert",
          label: immediateQuery.label,
        })
      : null,
    delayedQueryRow: delayedQuery.data,
    delayedQueryError: delayedQuery.error
      ? buildSupabaseProductErrorDetails(delayedQuery.error, {
          table: "products",
          action: "select-after-insert",
          label: delayedQuery.label,
        })
      : null,
    rowExistsImmediatelyAfterInsert: Boolean(immediateQuery.data),
    rowStillExistsAfterDelay: Boolean(delayedQuery.data),
    rowDisappearedAfterInsert:
      Boolean(immediateQuery.data) && !Boolean(delayedQuery.data),
    delayedQueryDelayMs,
  });
  const nextProducts = [
    createdProduct,
    ...getStoredProducts().filter(
      (existingProduct) => existingProduct.id !== createdProduct.id
    ),
  ];
  const previousProducts = getStoredProducts();
  hasLoadedProductsFromSupabase = true;
  saveStoredProducts(nextProducts);
  console.info("[StorefrontCreateVerification] step-4 product added to products store", {
    createdProduct: buildProductDebugSummary(createdProduct),
    createdProductSnapshot: createdProduct,
    createStoredProductReturnValue: createdProduct,
    addedToLocalProductsArray: nextProducts.some((entry) => entry.id === createdProduct.id),
    productCounts: {
      beforeCreate: previousProducts.length,
      afterCreate: nextProducts.length,
      increased: nextProducts.length > previousProducts.length,
    },
    persistedSnapshot: nextProducts.map((entry) => buildProductDebugSummary(entry)),
  });
  console.info("[StorefrontCreateVerification] step-5 products store count increased", {
    createdProductId: createdProduct.id,
    createdProductName: createdProduct.name,
    createdProductPresentInStore: nextProducts.some((entry) => entry.id === createdProduct.id),
    productCounts: {
      beforeCreate: previousProducts.length,
      afterCreate: nextProducts.length,
      increased: nextProducts.length > previousProducts.length,
    },
  });
  await syncGarmentLinks(nextProducts);
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
      status: hasOwn("status")
        ? buildPersistentStatus(updates.status)
        : buildPersistentStatus(product.status),
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
    hasLoadedProductsFromSupabase = true;
    saveStoredProducts(nextProducts);
    await syncGarmentLinks(nextProducts);
    return updatedProduct;
  }

  const payload = buildSupabaseProductRecord(updatedProduct);
  let query = supabase
    .from("products")
    .update(payload)
    .eq("id", productId)
    .select(PRODUCTS_SELECT_FIELDS)
    .single();
  let { data, error } = await query;

  if (error && isLegacyProductSchemaError(error)) {
    query = supabase
      .from("products")
      .update(omitGarmentLibraryItemId(payload))
      .eq("id", productId)
      .select(LEGACY_PRODUCTS_SELECT_FIELDS)
      .single();
    ({ data, error } = await query);
  }

  if (error) {
    logSupabaseProductError("Unable to update Tee & Co product in Supabase", error, {
      table: "products",
      action: "update",
      productId,
      select: PRODUCTS_SELECT_FIELDS,
      payload,
    });
    throw error;
  }

  const normalizedUpdatedProduct = normalizeProduct({
    ...normalizeSupabaseProduct(data),
    garment_library_item_id:
      data?.garment_library_item_id ?? updatedProduct.garment_library_item_id ?? null,
  });
  hasLoadedProductsFromSupabase = true;
  saveStoredProducts(
    nextProducts.map((product) =>
      product.id === productId ? normalizedUpdatedProduct : product
    )
  );
  await syncGarmentLinks(
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
  hasLoadedProductsFromSupabase = true;
  saveStoredProducts(nextProducts);
  await syncGarmentLinks(nextProducts);
}
