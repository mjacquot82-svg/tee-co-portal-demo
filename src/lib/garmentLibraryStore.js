import { useEffect, useSyncExternalStore } from "react";
import { getRawStorageItem, hasBrowserStorage, setRawStorageItem } from "./browserStorage";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const STORAGE_KEY = "teeCoGarmentLibrary";
const EMPTY_ITEMS = [];
const listeners = new Set();
let cachedStorageRaw = null;
let cachedSnapshotRaw = null;
let cachedSnapshot = EMPTY_ITEMS;
let loadStarted = false;
let loadPromise = null;
let hasLoadedRemote = false;

const DEFAULT_LIBRARY_ITEMS = [];

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
  listeners.forEach((listener) => listener());
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
  return cachedSnapshot;
}

function saveSnapshot(items) {
  const normalized = cacheSnapshot(items);
  cachedStorageRaw = JSON.stringify(normalized);

  console.debug("[garmentLibraryStore] saveSnapshot", {
    inputCount: Array.isArray(items) ? items.length : 0,
    normalizedCount: normalized.length,
    normalizedItems: normalized,
  });

  if (hasBrowserStorage()) {
    setRawStorageItem(STORAGE_KEY, cachedStorageRaw);
  }

  emitUpdated();
  return normalized;
}

function getLocalSnapshot() {
  if (!hasBrowserStorage()) {
    console.debug("[garmentLibraryStore] getLocalSnapshot without browser storage", {
      cachedSnapshotCount: cachedSnapshot.length,
      cachedSnapshot,
    });
    return cachedSnapshot;
  }

  try {
    const raw = getRawStorageItem(STORAGE_KEY) || "";
    if (raw === cachedStorageRaw) return cachedSnapshot;

    const parsed = raw ? JSON.parse(raw) : EMPTY_ITEMS;
    cachedStorageRaw = raw;
    const snapshot = cacheSnapshot(parsed);
    console.debug("[garmentLibraryStore] hydrated local snapshot", {
      storageKey: STORAGE_KEY,
      rawStorageLength: raw.length,
      parsedCount: Array.isArray(parsed) ? parsed.length : 0,
      parsedItems: parsed,
      snapshotCount: snapshot.length,
      snapshot,
    });
    return snapshot;
  } catch (error) {
    console.error("Unable to read Tee & Co garment library", error);
    cachedStorageRaw = null;
    cachedSnapshotRaw = null;
    cachedSnapshot = mergeLibraryItems([], DEFAULT_LIBRARY_ITEMS);
    return cachedSnapshot;
  }
}

async function fetchLibraryFromSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    console.debug("[garmentLibraryStore] Supabase unavailable for garment library fetch", {
      isSupabaseConfigured,
      hasSupabaseClient: Boolean(supabase),
    });
    return null;
  }

  const { data, error } = await supabase
    .from("garment_library_items")
    .select(GARMENT_LIBRARY_SELECT_FIELDS)
    .order("title", { ascending: true });

  console.debug("[garmentLibraryStore] raw Supabase garment query response", {
    table: "garment_library_items",
    select: GARMENT_LIBRARY_SELECT_FIELDS,
    data,
    error,
  });
  console.debug("[garmentLibraryStore] total rows returned from Supabase", Array.isArray(data) ? data.length : 0);

  if (error) {
    console.warn("[garmentLibraryStore] Falling back to local library", error);
    return null;
  }

  const mappedItems = Array.isArray(data)
    ? data.map((item) => normalizeGarmentLibraryItem(item)).filter(Boolean)
    : EMPTY_ITEMS;

  console.debug("[garmentLibraryStore] mapped garment records after transformation", {
    mappedCount: mappedItems.length,
    mappedItems,
  });

  return mappedItems;
}

export async function refreshGarmentLibrary() {
  const remote = await fetchLibraryFromSupabase();

  if (!remote) {
    console.debug("[garmentLibraryStore] refreshGarmentLibrary using local snapshot fallback");
    return getLocalSnapshot();
  }

  hasLoadedRemote = true;
  console.debug("[garmentLibraryStore] refreshGarmentLibrary using remote snapshot", {
    remoteCount: remote.length,
    remote,
  });
  return saveSnapshot(remote);
}

function ensureLoaded() {
  if (loadPromise) return loadPromise;
  if (loadStarted) return Promise.resolve(cachedSnapshot);

  loadStarted = true;
  loadPromise = refreshGarmentLibrary()
    .catch((error) => {
      console.error("Unable to refresh Tee & Co garment library", error);
      return getLocalSnapshot();
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

export function getGarmentLibraryItems() {
  if (isSupabaseConfigured && supabase) {
    if (hasLoadedRemote || loadStarted) {
      console.debug("[garmentLibraryStore] getGarmentLibraryItems returning cached snapshot", {
        hasLoadedRemote,
        loadStarted,
        cachedSnapshotCount: cachedSnapshot.length,
        cachedSnapshot,
      });
      return cachedSnapshot;
    }

    console.debug("[garmentLibraryStore] getGarmentLibraryItems returning EMPTY_ITEMS pending remote load", {
      hasLoadedRemote,
      loadStarted,
    });
    return EMPTY_ITEMS;
  }

  console.debug("[garmentLibraryStore] getGarmentLibraryItems using local snapshot because Supabase is unavailable");
  return getLocalSnapshot();
}

export function subscribeToGarmentLibrary(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  listeners.add(listener);

  if (typeof window === "undefined") {
    return () => listeners.delete(listener);
  }

  const handleStorage = (event) => {
    if (!event.key || event.key === STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useGarmentLibraryItems() {
  const items = useSyncExternalStore(
    subscribeToGarmentLibrary,
    getGarmentLibraryItems,
    () => EMPTY_ITEMS
  );

  useEffect(() => {
    ensureLoaded();
  }, []);

  return items;
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
