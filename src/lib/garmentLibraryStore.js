import { useEffect, useSyncExternalStore } from "react";
import { getRawStorageItem, hasBrowserStorage, setRawStorageItem } from "./browserStorage";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const STORAGE_KEY = "teeCoGarmentLibrary";
const EMPTY_ITEMS = [];
const GARMENT_LIBRARY_TABLE = "garment_library_items";
const listeners = new Set();
let cachedStorageRaw = null;
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

function normalizeTextKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => normalizeText(item)).filter(Boolean)));
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeVariant(variant = {}) {
  const name = normalizeText(variant.name);
  if (!name) return null;

  return {
    id: variant.id || `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    supplier_sku: normalizeText(variant.supplier_sku),
    active: variant.active !== false,
  };
}

function normalizeGarmentLibraryItem(item = {}) {
  const title = normalizeText(item.title);
  if (!title) return null;

  const variants = Array.isArray(item.variants)
    ? item.variants.map((variant) => normalizeVariant(variant)).filter(Boolean)
    : [];

  return {
    id: item.id || `garment-library-${Date.now()}`,
    title,
    category_lookup_id: item.category_lookup_id || "",
    brand_lookup_id: item.brand_lookup_id || "",
    garment_model_lookup_id: item.garment_model_lookup_id || "",
    image: normalizeText(item.image),
    variants,
    sizes: normalizeStringList(item.sizes),
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

function buildStoredSnapshot(items) {
  return {
    version: SNAPSHOT_VERSION,
    garments: Array.isArray(items) ? items : EMPTY_ITEMS,
    savedAt: new Date().toISOString(),
  };
}

function extractStoredSnapshotItems(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (!parsed || typeof parsed !== "object") {
    return EMPTY_ITEMS;
  }

  if (Array.isArray(parsed.garments)) {
    return parsed.garments;
  }

  if (Array.isArray(parsed.items)) {
    return parsed.items;
  }

  if (Array.isArray(parsed.snapshot)) {
    return parsed.snapshot;
  }

  if (Array.isArray(parsed.data)) {
    return parsed.data;
  }

  return EMPTY_ITEMS;
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

function getLocalSnapshot() {
  console.debug("[garmentLibraryStore] getLocalSnapshot bypassed; returning in-memory garment library only", {
    storageKey: STORAGE_KEY,
    cachedSnapshotCount: cachedSnapshot.length,
  });
  return cachedSnapshot;
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
      isSupabaseConfigured,
      hasSupabaseClient: Boolean(supabase),
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

  if (!isSupabaseConfigured || !supabase) {
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
    const { data, error } = await supabase
      .from("garment_library_items")
      .insert(insertPayload)
      .select(GARMENT_LIBRARY_SELECT_FIELDS)
      .single();

    if (error) throw error;

    const created = normalizeGarmentLibraryItem(data);
    saveSnapshot([created, ...getGarmentLibraryItems().filter((item) => item.id !== created.id)]);
    return created;
  } catch (error) {
    console.warn("[garmentLibraryStore] Remote create failed, using local fallback", error);
    const localRecord = {
      ...normalized,
      id: normalized.id || `garment-library-${Date.now()}`,
    };
    saveSnapshot([localRecord, ...getGarmentLibraryItems()]);
    return localRecord;
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

  if (!isSupabaseConfigured || !supabase) {
    saveSnapshot(nextItems);
    return updated;
  }

  try {
    const { data, error } = await supabase
      .from("garment_library_items")
      .update({
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
      })
      .eq("id", itemId)
      .select(GARMENT_LIBRARY_SELECT_FIELDS)
      .single();

    if (error) throw error;

    const remoteUpdated = normalizeGarmentLibraryItem(data);
    saveSnapshot(nextItems.map((item) => (item.id === itemId ? remoteUpdated : item)));
    return remoteUpdated;
  } catch (error) {
    console.warn("[garmentLibraryStore] Remote update failed, using local fallback", error);
    saveSnapshot(nextItems);
    return updated;
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
