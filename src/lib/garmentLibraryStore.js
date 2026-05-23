import { useEffect, useSyncExternalStore } from "react";
import { hasBrowserStorage } from "./browserStorage";
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfig,
  supabaseDiagnostics,
  supabaseInitializationError,
} from "./supabaseClient";

const STORAGE_KEY = "teeCoGarmentLibrary";
const EMPTY_ITEMS = [];
const GARMENT_LIBRARY_TABLE = "garment_library_items";
const listeners = new Set();
let cachedSnapshotRaw = null;
let cachedSnapshot = EMPTY_ITEMS;
let snapshotVersion = 0;
let cachedExternalSnapshot = Object.freeze({
  version: snapshotVersion,
  items: cachedSnapshot,
  isLoading: false,
  hasLoadedRemote: false,
  hasFinishedInitialLoad: false,
});
let loadStarted = false;
let loadPromise = null;
let hasLoadedRemote = false;
let hasFinishedInitialLoad = false;

const DEFAULT_LIBRARY_ITEMS = [];
const SNAPSHOT_VERSION = 1;

const GARMENT_LIBRARY_SELECT_FIELDS = [
  "id",
  "title",
  "category_lookup_id",
  "brand_lookup_id",
  "garment_model_lookup_id",
  "image",
  "variants",
  "sizes",
  "default_placements",
  "default_production_methods",
  "notes",
  "active",
  "created_at",
  "updated_at",
].join(", ");

function getSupabaseUnavailableDiagnostics() {
  return {
    reason: !isSupabaseConfigured
      ? "missing_env_configuration"
      : !supabase
        ? "client_initialization_failed"
        : null,
    missingConfiguration: !isSupabaseConfigured,
    missingClient: !supabase,
    hasSupabaseClient: Boolean(supabase),
    hasSupabaseUrlValue: Boolean(supabaseConfig.url),
    hasSupabasePublishableKeyValue: Boolean(supabaseConfig.publishableKey),
    hasSupabaseUrlEnvVar: supabaseDiagnostics.hasSupabaseUrlEnvVar,
    hasSupabasePublishableKeyEnvVar: supabaseDiagnostics.hasSupabasePublishableKeyEnvVar,
    hasSupabaseAnonKeyEnvVar: supabaseDiagnostics.hasSupabaseAnonKeyEnvVar,
    resolvedPublishableKeySource: supabaseDiagnostics.resolvedPublishableKeySource,
    isCodespacesHost: supabaseDiagnostics.isCodespacesHost,
    hostname: supabaseDiagnostics.hostname,
    initializationError: supabaseInitializationError
      ? {
          name: supabaseInitializationError.name,
          message: supabaseInitializationError.message,
        }
      : null,
  };
}

function emitUpdated() {
  console.log("[garmentLibraryStore] emitUpdated publishing garment library snapshot", {
    listenerCount: listeners.size,
    snapshotVersion,
    cachedSnapshotCount: Array.isArray(cachedSnapshot) ? cachedSnapshot.length : 0,
  });
  listeners.forEach((listener) => listener());
}

function getSnapshotStatus() {
  return {
    isLoading: loadStarted && !hasFinishedInitialLoad,
    hasLoadedRemote,
    hasFinishedInitialLoad,
  };
}

function updateExternalSnapshot(items = cachedSnapshot) {
  const status = getSnapshotStatus();
  snapshotVersion += 1;
  cachedExternalSnapshot = Object.freeze({
    version: snapshotVersion,
    items,
    ...status,
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return `[unstringifiable: ${error?.message || "unknown_error"}]`;
  }
}

function summarizeVariantForDebug(variant = {}) {
  if (!variant || typeof variant !== "object") {
    return {
      variantType: typeof variant,
      variant,
    };
  }

  return {
    id: variant.id || null,
    name: variant.name || null,
    color: variant.color || null,
    colors: Array.isArray(variant.colors) ? variant.colors : variant.colors || null,
    size: variant.size || null,
    sizes: Array.isArray(variant.sizes) ? variant.sizes : variant.sizes || null,
    available_sizes: Array.isArray(variant.available_sizes)
      ? variant.available_sizes
      : variant.available_sizes || null,
    availableSizes: Array.isArray(variant.availableSizes)
      ? variant.availableSizes
      : variant.availableSizes || null,
    size_run: variant.size_run || null,
    supplier_variant: variant.supplier_variant || variant.supplierVariant || null,
    supplier_sku: variant.supplier_sku || variant.supplierSku || variant.sku || null,
    active: variant.active,
    keys: Object.keys(variant),
  };
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalizeText(value)
  );
}

function normalizeTextKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .flatMap((item) => normalizeStringList(item))
          .map((item) => normalizeText(item))
          .filter(Boolean)
      )
    );
  }

  return String(value || "")
    .split(/[\n,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitCollapsedColorTokens(value) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue || /[\s,;|/]/.test(normalizedValue)) {
    return normalizedValue ? [normalizedValue] : [];
  }

  const segments = normalizedValue.match(/[A-Z][a-z]+|[A-Z]{2,}(?=[A-Z][a-z]|\b)/g);
  if (!Array.isArray(segments) || segments.length < 3) {
    return normalizedValue ? [normalizedValue] : [];
  }

  return segments.map((segment) => normalizeText(segment)).filter(Boolean);
}

function normalizeColorList(value) {
  const normalizedValues = normalizeStringList(value);
  if (normalizedValues.length > 1) {
    return normalizedValues;
  }

  return normalizedValues.flatMap((item) => splitCollapsedColorTokens(item));
}

function normalizeVariant(variant = {}, context = {}) {
  const parsedSizesBeforeNormalization = normalizeStringList(
    variant?.sizes ||
      variant?.available_sizes ||
      variant?.availableSizes ||
      variant?.size_run ||
      variant?.sizeRun ||
      variant?.size ||
      variant?.size_name ||
      variant?.sizeName ||
      variant?.variant_size
  );
  const parsedColorsBeforeNormalization = Array.from(
    new Set(
      [
        ...normalizeColorList(
          variant?.color || variant?.color_name || variant?.colorName || variant?.variant_color
        ),
        ...normalizeColorList(
          variant?.colors ||
            variant?.variant_colors ||
            variant?.supplier_variant ||
            variant?.supplierVariant ||
            variant?.variant_name ||
            variant?.name
        ),
      ].filter(Boolean)
    )
  );

  console.info("[garmentLibraryStore] parsed variant before normalization", {
    ...context,
    parsedColorsBeforeNormalization,
    parsedSizesBeforeNormalization,
    rawVariant: summarizeVariantForDebug(variant),
    rawVariantJson: safeStringify(variant),
  });

  const supplierSku = normalizeText(variant.supplier_sku || variant.supplierSku || variant.sku);
  const colors = Array.from(
    new Set(
      [
        ...normalizeColorList(variant.color || variant.color_name || variant.colorName || variant.variant_color),
        ...normalizeColorList(
          variant.colors ||
            variant.variant_colors ||
            variant.supplier_variant ||
            variant.supplierVariant ||
            variant.variant_name ||
            variant.name
        ),
      ].filter(Boolean)
    )
  );
  const color = normalizeText(colors[0] || "");
  const size = normalizeText(
    variant.size || variant.size_name || variant.sizeName || variant.variant_size
  );
  const sizes = normalizeStringList(
    variant.sizes ||
      variant.available_sizes ||
      variant.availableSizes ||
      variant.size_run ||
      variant.sizeRun ||
      (size ? [size] : [])
  );
  const supplierVariant = normalizeText(
    variant.supplier_variant || variant.supplierVariant || variant.variant_name || color || variant.name
  );
  const name = normalizeText(variant.name || supplierVariant || color);
  if (!name) {
    console.warn("[garmentLibraryStore] rejected variant during normalization", {
      ...context,
      rejectionReason: "missing-name-after-normalization",
      parsedColorsBeforeNormalization,
      parsedSizesBeforeNormalization,
      rawVariant: summarizeVariantForDebug(variant),
      rawVariantJson: safeStringify(variant),
    });
    return null;
  }

  const normalizedVariant = {
    ...variant,
    id: variant.id || `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    color,
    colors,
    size,
    sizes,
    supplier_variant: supplierVariant || name,
    supplier_sku: supplierSku,
    sku: supplierSku,
    active: variant.active !== false,
  };

  console.info("[garmentLibraryStore] normalized variant accepted", {
    ...context,
    parsedColorsBeforeNormalization,
    parsedSizesBeforeNormalization,
    normalizedVariant: summarizeVariantForDebug(normalizedVariant),
    normalizedVariantJson: safeStringify(normalizedVariant),
  });

  return normalizedVariant;
}

function normalizeGarmentLibraryItem(item = {}) {
  const title = normalizeText(item.title);
  if (!title) return null;

  const rawVariants = Array.isArray(item.variants) ? item.variants : [];
  const variantNormalizationResults = rawVariants.map((variant, variantIndex) =>
    normalizeVariant(variant, {
      garmentTitle: title,
      variantIndex,
      source: "normalizeGarmentLibraryItem",
    })
  );
  const rejectedVariants = rawVariants
    .map((variant, variantIndex) => ({
      variantIndex,
      variant,
      normalizedVariant: variantNormalizationResults[variantIndex],
    }))
    .filter((entry) => !entry.normalizedVariant)
    .map((entry) => ({
      variantIndex: entry.variantIndex,
      rejectionReason: "normalizeVariant-returned-null",
      rawVariant: summarizeVariantForDebug(entry.variant),
      rawVariantJson: safeStringify(entry.variant),
    }));
  const variants = variantNormalizationResults.filter(Boolean);
  const derivedVariantSizes = variants.flatMap((variant) => normalizeStringList(variant.sizes));
  const sizes = normalizeStringList([...(Array.isArray(item.sizes) ? item.sizes : []), ...derivedVariantSizes]);
  const placeholderVariantCount = rawVariants.filter((variant) => {
    if (!variant || typeof variant !== "object") return false;
    return !Object.values(variant).some((value) => normalizeText(value));
  }).length;

  console.info("[garmentLibraryStore] normalized garment library item", {
    title,
    rawVariantCount: rawVariants.length,
    rawVariantsWereArray: Array.isArray(item.variants),
    rawVariantsJson: safeStringify(rawVariants),
    placeholderVariantCount,
    rejectedVariantCount: rejectedVariants.length,
    rejectedVariants,
    parsedVariantArrayBeforeNormalization: rawVariants.map((variant) => summarizeVariantForDebug(variant)),
    parsedSizesBeforeNormalization: Array.isArray(item.sizes) ? item.sizes : item.sizes || [],
    parsedColors: variants.map((variant) => variant.color || variant.name).filter(Boolean),
    parsedSizes: sizes,
    generatedVariantCount: variants.length,
    finalPersistedVariantStructure: variants.map((variant) => summarizeVariantForDebug(variant)),
    rawItemJson: safeStringify(item),
    normalizedItemJson: safeStringify({
      ...item,
      title,
      variants,
      sizes,
    }),
  });

  return {
    id: item.id || `garment-library-${Date.now()}`,
    title,
    category_lookup_id: item.category_lookup_id || "",
    brand_lookup_id: item.brand_lookup_id || "",
    garment_model_lookup_id: item.garment_model_lookup_id || "",
    image: normalizeText(item.image),
    variants,
    sizes,
    default_placements: normalizeStringList(item.default_placements),
    default_production_methods: normalizeStringList(item.default_production_methods),
    notes: normalizeText(item.notes),
    active: item.active !== false,
    created_at: item.created_at || new Date().toISOString(),
    updated_at: item.updated_at || new Date().toISOString(),
  };
}

function mergeLibraryItems(primary = [], fallback = []) {
  const seen = new Set();
  const merged = [];

  [...fallback, ...primary]
    .map((item) => normalizeGarmentLibraryItem(item))
    .filter(Boolean)
    .forEach((item) => {
      const dedupKey = [
        normalizeTextKey(item.garment_model_lookup_id),
        normalizeTextKey(item.title),
      ].join("::");
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);
      merged.push(item);
    });

  return merged.sort((left, right) => left.title.localeCompare(right.title));
}

function cacheSnapshot(items) {
  const normalized = mergeLibraryItems(items, DEFAULT_LIBRARY_ITEMS);
  const serialized = JSON.stringify(normalized);

  if (serialized === cachedSnapshotRaw) {
    return cachedSnapshot;
  }

  cachedSnapshotRaw = serialized;
  cachedSnapshot = normalized;
  updateExternalSnapshot(cachedSnapshot);
  return cachedSnapshot;
}

function setInMemorySnapshot(items) {
  const normalized = cacheSnapshot(items);
  emitUpdated();
  return normalized;
}

function saveSnapshot(items) {
  const normalized = cacheSnapshot(items);
  console.log("[garmentLibraryStore] saveSnapshot bypassed; keeping garment library in memory only", {
    storageKey: STORAGE_KEY,
    inputCount: Array.isArray(items) ? items.length : 0,
    normalizedCount: normalized.length,
    hasBrowserStorage: hasBrowserStorage(),
  });
  emitUpdated();
  return normalized;
}

function getActiveSnapshot() {
  return cachedSnapshot;
}

function getGarmentLibrarySnapshot() {
  try {
    const items = getGarmentLibraryItems();
    const status = getSnapshotStatus();

    if (
      items !== cachedExternalSnapshot.items ||
      status.isLoading !== cachedExternalSnapshot.isLoading ||
      status.hasLoadedRemote !== cachedExternalSnapshot.hasLoadedRemote ||
      status.hasFinishedInitialLoad !== cachedExternalSnapshot.hasFinishedInitialLoad
    ) {
      updateExternalSnapshot(items);
    }

    console.debug("[garmentLibraryStore] getGarmentLibrarySnapshot returning external snapshot", {
      snapshotVersion: cachedExternalSnapshot.version,
      itemCount: Array.isArray(cachedExternalSnapshot.items) ? cachedExternalSnapshot.items.length : 0,
    });

    return cachedExternalSnapshot;
  } catch (error) {
    console.error("[garmentLibraryStore] getGarmentLibrarySnapshot threw before returning", error);
    console.error("[garmentLibraryStore] getGarmentLibrarySnapshot stack", error?.stack);
    return cachedExternalSnapshot;
  }
}

async function fetchLibraryFromSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    console.log("[garmentLibraryStore] Supabase unavailable for garment library fetch", {
      ...getSupabaseUnavailableDiagnostics(),
    });
    return null;
  }

  console.log("[garmentLibraryStore] remote garment fetch start", {
    table: GARMENT_LIBRARY_TABLE,
    select: GARMENT_LIBRARY_SELECT_FIELDS,
    hasLoadedRemote,
    loadStarted,
  });

  let data = null;
  let error = null;

  try {
    ({ data, error } = await supabase
      .from(GARMENT_LIBRARY_TABLE)
      .select(GARMENT_LIBRARY_SELECT_FIELDS)
      .order("title", { ascending: true }));
  } catch (queryError) {
    console.error("[garmentLibraryStore] remote garment fetch threw before response", {
      table: GARMENT_LIBRARY_TABLE,
      message: queryError?.message,
      stack: queryError?.stack,
      queryError,
    });
    return null;
  }

  console.log("[garmentLibraryStore] raw Supabase garment query response", {
    table: GARMENT_LIBRARY_TABLE,
    select: GARMENT_LIBRARY_SELECT_FIELDS,
    rowCount: Array.isArray(data) ? data.length : 0,
    rows: data,
    error,
  });

  if (error) {
    console.error("[garmentLibraryStore] remote garment fetch failed; falling back to local library", {
      table: GARMENT_LIBRARY_TABLE,
      error,
    });
    return null;
  }

  if (!Array.isArray(data)) {
    console.warn("[garmentLibraryStore] remote garment fetch returned non-array rows", {
      table: GARMENT_LIBRARY_TABLE,
      dataType: typeof data,
      data,
    });
  }

  const mappedItems = Array.isArray(data)
    ? data.map((item) => normalizeGarmentLibraryItem(item)).filter(Boolean)
    : EMPTY_ITEMS;

  console.log("[garmentLibraryStore] mapped garment rows", {
    table: GARMENT_LIBRARY_TABLE,
    sourceRowCount: Array.isArray(data) ? data.length : 0,
    mappedCount: mappedItems.length,
    discardedCount: Array.isArray(data) ? data.length - mappedItems.length : 0,
    mappedItems,
  });

  console.log("[garmentLibraryStore] remote garment fetch success", {
    table: GARMENT_LIBRARY_TABLE,
    rowCount: Array.isArray(data) ? data.length : 0,
    mappedCount: mappedItems.length,
  });

  return mappedItems;
}

export async function refreshGarmentLibrary() {
  console.log("[garmentLibraryStore] refreshGarmentLibrary start", {
    hasLoadedRemote,
    loadStarted,
    cachedSnapshotCount: Array.isArray(cachedSnapshot) ? cachedSnapshot.length : 0,
  });
  const remote = await fetchLibraryFromSupabase();

  if (!remote) {
    console.warn("[garmentLibraryStore] refreshGarmentLibrary using local snapshot fallback", {
      hasLoadedRemote,
      loadStarted,
      cachedSnapshotCount: Array.isArray(cachedSnapshot) ? cachedSnapshot.length : 0,
    });
    return getActiveSnapshot();
  }

  hasLoadedRemote = true;
  console.log("[garmentLibraryStore] refreshGarmentLibrary received remote rows", {
    remoteCount: remote.length,
    remote,
  });
  console.log("[garmentLibraryStore] refreshGarmentLibrary publishing remote rows to in-memory store", {
    remoteCount: remote.length,
  });
  const publishedSnapshot = setInMemorySnapshot(remote);
  console.log("[garmentLibraryStore] refreshGarmentLibrary published remote rows", {
    publishedCount: Array.isArray(publishedSnapshot) ? publishedSnapshot.length : 0,
    hasLoadedRemote,
  });
  return publishedSnapshot;
}

function ensureLoaded() {
  console.log("[garmentLibraryStore] ensureLoaded invoked", {
    hasLoadedRemote,
    loadStarted,
    hasLoadPromise: Boolean(loadPromise),
    cachedSnapshotCount: Array.isArray(cachedSnapshot) ? cachedSnapshot.length : 0,
  });

  if (loadPromise) {
    console.log("[garmentLibraryStore] ensureLoaded reusing in-flight loadPromise");
    return loadPromise;
  }
  if (loadStarted) {
    console.log("[garmentLibraryStore] ensureLoaded short-circuiting because load already started", {
      cachedSnapshotCount: getActiveSnapshot().length,
      hasLoadedRemote,
    });
    return Promise.resolve(getActiveSnapshot());
  }

  getActiveSnapshot();
  loadStarted = true;
  updateExternalSnapshot();
  emitUpdated();
  console.log("[garmentLibraryStore] ensureLoaded starting refreshGarmentLibrary", {
    hasLoadedRemote,
    loadStarted,
    cachedSnapshotCount: Array.isArray(cachedSnapshot) ? cachedSnapshot.length : 0,
  });
  loadPromise = refreshGarmentLibrary()
    .catch((error) => {
      console.error("Unable to refresh Tee & Co garment library", error);
      return getActiveSnapshot();
    })
    .then((result) => {
      console.log("[garmentLibraryStore] ensureLoaded refresh resolved", {
        resultCount: Array.isArray(result) ? result.length : 0,
        hasLoadedRemote,
      });
      return result;
    })
    .finally(() => {
      hasFinishedInitialLoad = true;
      updateExternalSnapshot();
      emitUpdated();
      console.log("[garmentLibraryStore] ensureLoaded refresh finished", {
        hasLoadedRemote,
        hasFinishedInitialLoad,
        cachedSnapshotCount: Array.isArray(cachedSnapshot) ? cachedSnapshot.length : 0,
      });
      loadPromise = null;
    });

  return loadPromise;
}

export function getGarmentLibraryItems() {
  try {
    const snapshot = getActiveSnapshot();
    const snapshotCount = Array.isArray(snapshot) ? snapshot.length : 0;

    if (snapshotCount > 0 || hasLoadedRemote || loadStarted || !isSupabaseConfigured || !supabase) {
      console.log("[garmentLibraryStore] getGarmentLibraryItems returning active in-memory snapshot", {
        hasLoadedRemote,
        loadStarted,
        isSupabaseConfigured,
        hasSupabaseClient: Boolean(supabase),
        cachedSnapshotCount: snapshotCount,
      });
      console.debug("[garmentLibraryStore] getGarmentLibraryItems active snapshot payload", {
        cachedSnapshotCount: snapshotCount,
        cachedSnapshot: snapshot,
      });
      return snapshot;
    }

    console.warn("[garmentLibraryStore] getGarmentLibraryItems returning EMPTY_ITEMS before remote load completes", {
      hasLoadedRemote,
      loadStarted,
      cachedSnapshotCount: snapshotCount,
    });
    return EMPTY_ITEMS;
  } catch (error) {
    console.error("[garmentLibraryStore] getGarmentLibraryItems threw before returning", error);
    console.error("[garmentLibraryStore] getGarmentLibraryItems stack", error?.stack);
    return cachedSnapshot || EMPTY_ITEMS;
  }
}

export function subscribeToGarmentLibrary(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  const subscribedVersion = cachedExternalSnapshot.version;
  const notifyListener = () => {
    console.debug("[garmentLibraryStore] subscribeToGarmentLibrary callback firing", {
      snapshotVersion: cachedExternalSnapshot.version,
      itemCount: Array.isArray(cachedExternalSnapshot.items) ? cachedExternalSnapshot.items.length : 0,
    });
    listener();
  };

  listeners.add(notifyListener);
  console.log("[garmentLibraryStore] subscribeToGarmentLibrary listener added", {
    listenerCount: listeners.size,
    snapshotVersion: cachedExternalSnapshot.version,
  });

  queueMicrotask(() => {
    if (!listeners.has(notifyListener)) {
      return;
    }

    if (!hasLoadedRemote && !loadStarted) {
      console.debug("[garmentLibraryStore] subscribeToGarmentLibrary starting ensureLoaded from active subscriber", {
        listenerCount: listeners.size,
        snapshotVersion: cachedExternalSnapshot.version,
      });
      ensureLoaded();
    }

    if (cachedExternalSnapshot.version !== subscribedVersion) {
      console.debug("[garmentLibraryStore] subscribeToGarmentLibrary replaying missed snapshot for new listener", {
        subscribedVersion,
        currentVersion: cachedExternalSnapshot.version,
      });
      notifyListener();
    }
  });

  if (typeof window === "undefined") {
    return () => {
      listeners.delete(notifyListener);
      console.log("[garmentLibraryStore] subscribeToGarmentLibrary listener removed", {
        listenerCount: listeners.size,
      });
    };
  }

  const handleStorage = (event) => {
    if (!event.key || event.key === STORAGE_KEY) {
      notifyListener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(notifyListener);
    window.removeEventListener("storage", handleStorage);
    console.log("[garmentLibraryStore] subscribeToGarmentLibrary listener removed", {
      listenerCount: listeners.size,
    });
  };
}

export function useGarmentLibraryItems() {
  const snapshot = useSyncExternalStore(
    subscribeToGarmentLibrary,
    getGarmentLibrarySnapshot,
    () => cachedExternalSnapshot
  );

  useEffect(() => {
    console.log("[garmentLibraryStore] useGarmentLibraryItems mount: ensureLoaded starting", {
      hasLoadedRemote,
      loadStarted,
      cachedSnapshotCount: cachedSnapshot.length,
    });
    ensureLoaded();
  }, []);

  console.debug("[garmentLibraryStore] useGarmentLibraryItems observed snapshot", {
    snapshotVersion: snapshot?.version,
    itemCount: Array.isArray(snapshot?.items) ? snapshot.items.length : 0,
  });

  return Array.isArray(snapshot?.items) ? snapshot.items : EMPTY_ITEMS;
}

export function useGarmentLibraryStatus() {
  const snapshot = useSyncExternalStore(
    subscribeToGarmentLibrary,
    getGarmentLibrarySnapshot,
    () => cachedExternalSnapshot
  );

  return {
    isLoading: Boolean(snapshot?.isLoading),
    hasLoadedRemote: Boolean(snapshot?.hasLoadedRemote),
    hasFinishedInitialLoad: Boolean(snapshot?.hasFinishedInitialLoad),
  };
}

export async function createGarmentLibraryItem(values) {
  const normalized = normalizeGarmentLibraryItem(values);
  if (!normalized) {
    throw new Error("Invalid garment library item");
  }

  console.info("[garmentLibraryStore] final garment object before persistence", {
    operation: "create",
    title: normalized.title,
    placeholderVariantCount: normalized.variants.filter((variant) => {
      if (!variant || typeof variant !== "object") return false;
      return !normalizeText(variant.name) && !normalizeText(variant.color);
    }).length,
    parsedColors: normalized.variants.map((variant) => variant.color || variant.name).filter(Boolean),
    parsedSizes: normalized.sizes,
    generatedVariantCount: normalized.variants.length,
    finalPersistedVariantStructure: normalized.variants.map((variant) => summarizeVariantForDebug(variant)),
    garment: normalized,
    garmentJson: safeStringify(normalized),
  });

  if (!isSupabaseConfigured || !supabase) {
    console.warn("[garmentLibraryStore] createGarmentLibraryItem using local-only fallback because Supabase is unavailable", {
      table: GARMENT_LIBRARY_TABLE,
      insertCount: 1,
      title: normalized.title,
    });
    const localRecord = {
      ...normalized,
      id: normalized.id || `garment-library-${Date.now()}`,
    };
    const nextItems = [localRecord, ...getGarmentLibraryItems()];
    saveSnapshot(nextItems);
    return localRecord;
  }

  try {
    const { id: _unusedId, ...insertPayload } = normalized;
    console.info("[garmentLibraryStore] remote garment insert start", {
      table: GARMENT_LIBRARY_TABLE,
      insertCount: 1,
      title: normalized.title,
      variantCount: Array.isArray(insertPayload.variants) ? insertPayload.variants.length : 0,
      categoryLookupId: insertPayload.category_lookup_id || null,
      brandLookupId: insertPayload.brand_lookup_id || null,
      garmentModelLookupId: insertPayload.garment_model_lookup_id || null,
      categoryLookupIdIsUuid: isUuidLike(insertPayload.category_lookup_id),
      brandLookupIdIsUuid: isUuidLike(insertPayload.brand_lookup_id),
      garmentModelLookupIdIsUuid: isUuidLike(insertPayload.garment_model_lookup_id),
      payload: insertPayload,
      payloadJson: safeStringify(insertPayload),
    });
    const { data, error } = await supabase
      .from(GARMENT_LIBRARY_TABLE)
      .insert(insertPayload)
      .select(GARMENT_LIBRARY_SELECT_FIELDS)
      .single();

    if (error) throw error;

    const created = normalizeGarmentLibraryItem(data);
    console.info("[garmentLibraryStore] remote garment insert success", {
      table: GARMENT_LIBRARY_TABLE,
      insertCount: 1,
      recordId: created?.id || null,
      title: created?.title || normalized.title,
      fetchedRowCount: created ? 1 : 0,
    });
    saveSnapshot([created, ...getGarmentLibraryItems().filter((item) => item.id !== created.id)]);
    return created;
  } catch (error) {
    console.error("[garmentLibraryStore] remote garment insert failed", {
      table: GARMENT_LIBRARY_TABLE,
      insertCount: 1,
      title: normalized.title,
      message: error?.message,
      error,
    });
    throw error;
  }
}

export async function updateGarmentLibraryItem(itemId, updates) {
  const nextItems = getGarmentLibraryItems().map((item) => {
    if (item.id !== itemId) return item;

    return normalizeGarmentLibraryItem({
      ...item,
      ...updates,
      id: item.id,
      updated_at: new Date().toISOString(),
    });
  });

  const updated = nextItems.find((item) => item.id === itemId) || null;
  if (!updated) return null;

  console.info("[garmentLibraryStore] final garment object before persistence", {
    operation: "update",
    itemId,
    title: updated.title,
    placeholderVariantCount: updated.variants.filter((variant) => {
      if (!variant || typeof variant !== "object") return false;
      return !normalizeText(variant.name) && !normalizeText(variant.color);
    }).length,
    parsedColors: updated.variants.map((variant) => variant.color || variant.name).filter(Boolean),
    parsedSizes: updated.sizes,
    generatedVariantCount: updated.variants.length,
    finalPersistedVariantStructure: updated.variants.map((variant) => summarizeVariantForDebug(variant)),
    garment: updated,
    garmentJson: safeStringify(updated),
  });

  if (!isSupabaseConfigured || !supabase) {
    console.warn("[garmentLibraryStore] updateGarmentLibraryItem using local-only fallback because Supabase is unavailable", {
      table: GARMENT_LIBRARY_TABLE,
      itemId,
    });
    saveSnapshot(nextItems);
    return updated;
  }

  try {
    const updatePayload = {
      title: updated.title,
      category_lookup_id: updated.category_lookup_id || null,
      brand_lookup_id: updated.brand_lookup_id || null,
      garment_model_lookup_id: updated.garment_model_lookup_id || null,
      image: updated.image,
      variants: updated.variants,
      sizes: updated.sizes,
      default_placements: updated.default_placements,
      default_production_methods: updated.default_production_methods,
      notes: updated.notes,
      active: updated.active,
    };
    console.info("[garmentLibraryStore] remote garment update start", {
      table: GARMENT_LIBRARY_TABLE,
      itemId,
      updateCount: 1,
      title: updated.title,
      variantCount: Array.isArray(updatePayload.variants) ? updatePayload.variants.length : 0,
      payload: updatePayload,
      payloadJson: safeStringify(updatePayload),
    });
    const { data, error } = await supabase
      .from(GARMENT_LIBRARY_TABLE)
      .update(updatePayload)
      .eq("id", itemId)
      .select(GARMENT_LIBRARY_SELECT_FIELDS)
      .single();

    if (error) throw error;

    const remoteUpdated = normalizeGarmentLibraryItem(data);
    console.info("[garmentLibraryStore] remote garment update success", {
      table: GARMENT_LIBRARY_TABLE,
      itemId,
      updateCount: 1,
      fetchedRowCount: remoteUpdated ? 1 : 0,
    });
    saveSnapshot(nextItems.map((item) => (item.id === itemId ? remoteUpdated : item)));
    return remoteUpdated;
  } catch (error) {
    console.error("[garmentLibraryStore] remote garment update failed", {
      table: GARMENT_LIBRARY_TABLE,
      itemId,
      updateCount: 1,
      title: updated.title,
      message: error?.message,
      error,
    });
    throw error;
  }
}

export async function deleteGarmentLibraryItem(itemId) {
  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.from("garment_library_items").delete().eq("id", itemId);
      if (error) throw error;
    } catch (error) {
      console.warn("[garmentLibraryStore] Remote delete failed, removing local copy", error);
    }
  }

  saveSnapshot(getGarmentLibraryItems().filter((item) => item.id !== itemId));
}
