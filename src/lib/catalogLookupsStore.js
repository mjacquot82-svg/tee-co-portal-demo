import { useEffect, useSyncExternalStore } from "react";
import { getRawStorageItem, hasBrowserStorage, setRawStorageItem } from "./browserStorage";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const STORAGE_KEY = "teeCoCatalogLookups";
const LOOKUP_TABLES = [
  "categories",
  "storefront_categories",
  "brands",
  "colors",
  "sizes",
  "garment_models",
];
const UUID_LOOKUP_TABLES = new Set([
  "categories",
  "storefront_categories",
  "brands",
  "garment_models",
]);

const DEFAULT_LOOKUPS = {
  categories: [
    { id: "category-t-shirts", name: "T-Shirts", active: true },
    { id: "category-hoodies", name: "Hoodies", active: true },
    { id: "category-hats", name: "Hats", active: true },
    { id: "category-workwear", name: "Workwear", active: true },
    { id: "category-teamwear", name: "Teamwear", active: true },
  ],
  storefront_categories: [
    { id: "storefront-category-apparel", name: "Apparel", active: true },
    { id: "storefront-category-hoodies", name: "Hoodies", active: true },
    { id: "storefront-category-hats", name: "Hats", active: true },
    { id: "storefront-category-drinkware", name: "Drinkware", active: true },
    { id: "storefront-category-accessories", name: "Accessories", active: true },
    { id: "storefront-category-clearance", name: "Clearance", active: true },
  ],
  brands: [],
  colors: [
    { id: "color-athletic-heather", name: "Athletic Heather", hex_code: "#b8bec6", active: true },
    { id: "color-black", name: "Black", hex_code: "#111111", active: true },
    { id: "color-cardinal", name: "Cardinal", hex_code: "#8c1d2c", active: true },
    { id: "color-charcoal", name: "Charcoal", hex_code: "#4b5563", active: true },
    { id: "color-forest", name: "Forest", hex_code: "#1f5134", active: true },
    { id: "color-gold", name: "Gold", hex_code: "#d4a017", active: true },
    { id: "color-heather-gray", name: "Heather Gray", hex_code: "#9ca3af", active: true },
    { id: "color-kelly", name: "Kelly", hex_code: "#1f8f4e", active: true },
    { id: "color-maroon", name: "Maroon", hex_code: "#6b1f2e", active: true },
    { id: "color-navy", name: "Navy", hex_code: "#142c52", active: true },
    { id: "color-orange", name: "Orange", hex_code: "#f97316", active: true },
    { id: "color-purple", name: "Purple", hex_code: "#6d28d9", active: true },
    { id: "color-red", name: "Red", hex_code: "#c62828", active: true },
    { id: "color-royal", name: "Royal", hex_code: "#2563eb", active: true },
    { id: "color-sand", name: "Sand", hex_code: "#d6c5a4", active: true },
    { id: "color-white", name: "White", hex_code: "#f8fafc", active: true },
  ],
  sizes: [
    { id: "size-xs", name: "XS", sort_order: 10, active: true },
    { id: "size-s", name: "S", sort_order: 20, active: true },
    { id: "size-m", name: "M", sort_order: 30, active: true },
    { id: "size-l", name: "L", sort_order: 40, active: true },
    { id: "size-xl", name: "XL", sort_order: 50, active: true },
    { id: "size-2xl", name: "2XL", sort_order: 60, active: true },
    { id: "size-3xl", name: "3XL", sort_order: 70, active: true },
    { id: "size-4xl", name: "4XL", sort_order: 80, active: true },
    { id: "size-5xl", name: "5XL", sort_order: 90, active: true },
    { id: "size-one-size", name: "One Size", sort_order: 100, active: true },
  ],
  garment_models: [],
};

let cachedStorageRaw = null;
let cachedSnapshotRaw = null;
let cachedSnapshot = cloneLookups(DEFAULT_LOOKUPS);
let loadStarted = false;
let loadPromise = null;
const listeners = new Set();

function cloneLookups(lookups) {
  return LOOKUP_TABLES.reduce((accumulator, table) => {
    accumulator[table] = Array.isArray(lookups?.[table])
      ? lookups[table].map((item) => ({ ...item }))
      : [];
    return accumulator;
  }, {});
}

function normalizeText(value) {
  return String(value || "").trim();
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalizeText(value)
  );
}

function isMissingLookupTableError(error, table) {
  const message = normalizeText(error?.message).toLowerCase();
  const details = normalizeText(error?.details).toLowerCase();
  const hint = normalizeText(error?.hint).toLowerCase();
  const patterns = [
    `relation "${table}" does not exist`,
    `table "${table}" does not exist`,
    `could not find the table '${table}'`,
  ];

  return patterns.some(
    (pattern) => message.includes(pattern) || details.includes(pattern) || hint.includes(pattern)
  );
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nowIso() {
  return new Date().toISOString();
}

function buildLocalId(table, value) {
  return `${table}-${slugify(value) || Date.now()}`;
}

function normalizeLookupItem(table, item = {}) {
  if (!item || typeof item !== "object") return null;

  if (table === "colors") {
    const name = normalizeText(item.name);
    if (!name) return null;

    return {
      id: item.id || buildLocalId(table, name),
      name,
      hex_code: normalizeText(item.hex_code) || null,
      active: item.active !== false,
      created_at: item.created_at || nowIso(),
    };
  }

  if (table === "sizes") {
    const name = normalizeText(item.name);
    if (!name) return null;

    const parsedOrder = Number(item.sort_order);

    return {
      id: item.id || buildLocalId(table, name),
      name,
      sort_order: Number.isFinite(parsedOrder) ? parsedOrder : 999,
      active: item.active !== false,
      created_at: item.created_at || nowIso(),
    };
  }

  if (table === "garment_models") {
    const displayName = normalizeText(item.display_name);
    if (!displayName) return null;

    return {
      id: item.id || buildLocalId(table, `${item.brand_id || ""}-${item.model_code || displayName}`),
      brand_id: item.brand_id || "",
      model_code: normalizeText(item.model_code),
      display_name: displayName,
      category_id: item.category_id || "",
      active: item.active !== false,
      created_at: item.created_at || nowIso(),
    };
  }

  const name = normalizeText(item.name);
  if (!name) return null;

  return {
    id: item.id || buildLocalId(table, name),
    name,
    active: item.active !== false,
    created_at: item.created_at || nowIso(),
  };
}

function sortLookupItems(table, items = []) {
  const nextItems = [...items];

  if (table === "sizes") {
    nextItems.sort((left, right) => {
      const orderDiff = Number(left?.sort_order || 999) - Number(right?.sort_order || 999);
      if (orderDiff !== 0) return orderDiff;
      return String(left?.name || "").localeCompare(String(right?.name || ""));
    });
    return nextItems;
  }

  if (table === "garment_models") {
    nextItems.sort((left, right) => {
      const leftLabel = `${left?.display_name || ""} ${left?.model_code || ""}`;
      const rightLabel = `${right?.display_name || ""} ${right?.model_code || ""}`;
      return leftLabel.localeCompare(rightLabel);
    });
    return nextItems;
  }

  nextItems.sort((left, right) =>
    String(left?.name || "").localeCompare(String(right?.name || ""))
  );
  return nextItems;
}

function getLookupDedupKey(table, item = {}) {
  if (table === "garment_models") {
    return [
      normalizeText(item.brand_id).toLowerCase(),
      normalizeText(item.model_code).toLowerCase(),
      normalizeText(item.display_name).toLowerCase(),
    ].join("::");
  }

  return normalizeText(item.name).toLowerCase();
}

function shouldKeepLookupRecord(table, item) {
  if (!item) {
    return false;
  }

  if (!isSupabaseConfigured || !supabase) {
    return true;
  }

  if (!UUID_LOOKUP_TABLES.has(table)) {
    return true;
  }

  return isUuidLike(item.id);
}

function mergeLookups(primary = {}, fallback = {}) {
  return LOOKUP_TABLES.reduce((accumulator, table) => {
    const recordsByKey = new Map();

    [...(fallback?.[table] || []), ...(primary?.[table] || [])]
      .map((item) => normalizeLookupItem(table, item))
      .filter((item) => shouldKeepLookupRecord(table, item))
      .forEach((item) => {
        const dedupKey = getLookupDedupKey(table, item);
        if (!dedupKey) return;
        recordsByKey.set(dedupKey, item);
      });

    accumulator[table] = sortLookupItems(table, Array.from(recordsByKey.values()));
    return accumulator;
  }, {});
}

function emitLookupsUpdated() {
  listeners.forEach((listener) => listener());
}

function cacheLookups(lookups) {
  const normalized = mergeLookups(lookups, DEFAULT_LOOKUPS);
  const serialized = JSON.stringify(normalized);

  if (serialized === cachedSnapshotRaw) {
    return cachedSnapshot;
  }

  cachedSnapshotRaw = serialized;
  cachedSnapshot = normalized;
  return cachedSnapshot;
}

function saveLocalLookupsSnapshot(lookups) {
  const normalized = cacheLookups(lookups);
  cachedStorageRaw = JSON.stringify(normalized);

  if (hasBrowserStorage()) {
    setRawStorageItem(STORAGE_KEY, cachedStorageRaw);
  }

  emitLookupsUpdated();
  return normalized;
}

function getLocalLookupsSnapshot() {
  if (!hasBrowserStorage()) {
    return cachedSnapshot;
  }

  try {
    const rawValue = getRawStorageItem(STORAGE_KEY) || "";

    if (rawValue === cachedStorageRaw) {
      return cachedSnapshot;
    }

    const parsed = rawValue ? JSON.parse(rawValue) : {};
    cachedStorageRaw = rawValue;
    return cacheLookups(parsed);
  } catch (error) {
    console.error("Unable to read Tee & Co catalog lookups", error);
    cachedStorageRaw = null;
    cachedSnapshotRaw = null;
    cachedSnapshot = cloneLookups(DEFAULT_LOOKUPS);
    return cachedSnapshot;
  }
}

async function fetchTable(table) {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  let query = supabase.from(table).select("*").eq("active", true);

  if (table === "sizes") {
    query = query.order("sort_order", { ascending: true }).order("name", { ascending: true });
  } else if (table === "garment_models") {
    query = query.order("display_name", { ascending: true });
  } else {
    query = query.order("name", { ascending: true });
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return sortLookupItems(
    table,
    Array.isArray(data)
      ? data.map((item) => normalizeLookupItem(table, item)).filter(Boolean)
      : []
  );
}

async function fetchCatalogLookupsFromSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  const settled = await Promise.allSettled(LOOKUP_TABLES.map((table) => fetchTable(table)));

  const lookups = {};

  settled.forEach((result, index) => {
    const table = LOOKUP_TABLES[index];

    if (result.status === "fulfilled") {
      lookups[table] = result.value;
      return;
    }

    console.warn(`[catalogLookupsStore] Falling back to local ${table}`, result.reason);
    lookups[table] = getLocalLookupsSnapshot()?.[table] || DEFAULT_LOOKUPS[table];
  });

  return lookups;
}

export async function refreshCatalogLookups() {
  const remoteLookups = await fetchCatalogLookupsFromSupabase();

  if (!remoteLookups) {
    return getLocalLookupsSnapshot();
  }

  return saveLocalLookupsSnapshot(remoteLookups);
}

function ensureCatalogLookupsLoaded() {
  if (loadPromise) return loadPromise;
  if (loadStarted) return Promise.resolve(cachedSnapshot);

  loadStarted = true;
  loadPromise = refreshCatalogLookups()
    .catch((error) => {
      console.error("Unable to refresh Tee & Co catalog lookups", error);
      return getLocalLookupsSnapshot();
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

export function getCatalogLookups() {
  return hasBrowserStorage() ? getLocalLookupsSnapshot() : cachedSnapshot;
}

export function subscribeToCatalogLookups(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  listeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      listeners.delete(listener);
    };
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

export function useCatalogLookups() {
  const lookups = useSyncExternalStore(
    subscribeToCatalogLookups,
    getCatalogLookups,
    () => cloneLookups(DEFAULT_LOOKUPS)
  );

  useEffect(() => {
    ensureCatalogLookupsLoaded();
  }, []);

  return lookups;
}

function appendLookupRecord(lookups, table, record) {
  return {
    ...lookups,
    [table]: sortLookupItems(table, [...(lookups?.[table] || []), record]),
  };
}

function replaceLookupRecord(lookups, table, record) {
  const dedupKey = getLookupDedupKey(table, record);
  const nextRecords = (lookups?.[table] || []).filter(
    (item) => getLookupDedupKey(table, item) !== dedupKey && item?.id !== record.id
  );

  return {
    ...lookups,
    [table]: sortLookupItems(table, [...nextRecords, record]),
  };
}

function findExistingLookupRecord(table, values, options = []) {
  const normalizedRecord = normalizeLookupItem(table, values);
  if (!normalizedRecord) return null;

  const dedupKey = getLookupDedupKey(table, normalizedRecord);
  return options.find((option) => getLookupDedupKey(table, option) === dedupKey) || null;
}

async function fetchExistingLookupRecordFromSupabase(table, values) {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  const normalizedRecord = normalizeLookupItem(table, values);
  if (!normalizedRecord) {
    return null;
  }

  let query = supabase.from(table).select("*");

  if (table === "garment_models") {
    query = query
      .eq("brand_id", normalizedRecord.brand_id || null)
      .eq("category_id", normalizedRecord.category_id || null)
      .eq("display_name", normalizedRecord.display_name)
      .eq("model_code", normalizedRecord.model_code || "")
      .limit(1);
  } else {
    query = query.eq("name", normalizedRecord.name).limit(1);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const existingRecord = Array.isArray(data) ? data[0] : null;
  return existingRecord ? normalizeLookupItem(table, existingRecord) : null;
}

async function reactivateLookupRecord(table, record) {
  if (!isSupabaseConfigured || !supabase || !record?.id || record.active !== false) {
    return record;
  }

  const { data, error } = await supabase
    .from(table)
    .update({ active: true })
    .eq("id", record.id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return normalizeLookupItem(table, data);
}

export async function createCatalogLookup(table, values) {
  if (!LOOKUP_TABLES.includes(table)) {
    throw new Error(`Unsupported catalog lookup table: ${table}`);
  }

  const normalizedRecord = normalizeLookupItem(table, values);
  if (!normalizedRecord) {
    throw new Error(`Invalid ${table} lookup values`);
  }

  const existingLocalRecord = findExistingLookupRecord(
    table,
    normalizedRecord,
    getCatalogLookups()?.[table] || []
  );
  if (existingLocalRecord && (!isSupabaseConfigured || !supabase || isUuidLike(existingLocalRecord.id))) {
    return existingLocalRecord;
  }

  if (!isSupabaseConfigured || !supabase) {
    console.warn("[catalogLookupsStore] createCatalogLookup using local-only fallback because Supabase is unavailable", {
      table,
      values: normalizedRecord,
    });
    const nextLookups = appendLookupRecord(getCatalogLookups(), table, normalizedRecord);
    saveLocalLookupsSnapshot(nextLookups);
    return normalizedRecord;
  }

  try {
    const { id: _unusedId, ...insertPayload } = normalizedRecord;
    console.info("[catalogLookupsStore] remote lookup insert start", {
      table,
      insertCount: 1,
      payload: insertPayload,
    });
    const { data, error } = await supabase
      .from(table)
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const remoteRecord = normalizeLookupItem(table, data);
    console.info("[catalogLookupsStore] remote lookup insert success", {
      table,
      insertCount: 1,
      recordId: remoteRecord?.id || null,
      recordIdIsUuid: isUuidLike(remoteRecord?.id),
    });
    const nextLookups = appendLookupRecord(getCatalogLookups(), table, remoteRecord);
    saveLocalLookupsSnapshot(nextLookups);
    return remoteRecord;
  } catch (error) {
    if (isMissingLookupTableError(error, table)) {
      const nextLookups = appendLookupRecord(getCatalogLookups(), table, normalizedRecord);
      saveLocalLookupsSnapshot(nextLookups);
      return normalizedRecord;
    }

    console.error("[catalogLookupsStore] remote lookup insert failed", {
      table,
      insertCount: 1,
      payload: normalizedRecord,
      message: error?.message,
      error,
    });
    try {
      const existingRemoteRecord = await fetchExistingLookupRecordFromSupabase(table, normalizedRecord);
      if (existingRemoteRecord) {
        const activeRecord = await reactivateLookupRecord(table, existingRemoteRecord);
        console.info("[catalogLookupsStore] recovered existing remote lookup after insert failure", {
          table,
          recordId: activeRecord?.id || null,
          recordIdIsUuid: isUuidLike(activeRecord?.id),
        });
        const nextLookups = replaceLookupRecord(getCatalogLookups(), table, activeRecord);
        saveLocalLookupsSnapshot(nextLookups);
        return activeRecord;
      }
    } catch (recoveryError) {
      console.warn(
        `[catalogLookupsStore] Failed to recover existing ${table} lookup after create error`,
        recoveryError
      );
    }

    console.warn("[catalogLookupsStore] createCatalogLookup falling back to local snapshot after remote failure", {
      table,
      values: normalizedRecord,
      message: error?.message,
    });
    const nextLookups = appendLookupRecord(getCatalogLookups(), table, normalizedRecord);
    saveLocalLookupsSnapshot(nextLookups);
    return normalizedRecord;
  }
}

export async function updateCatalogLookup(table, lookupId, values = {}) {
  if (!LOOKUP_TABLES.includes(table)) {
    throw new Error(`Unsupported catalog lookup table: ${table}`);
  }

  const existingRecord = (getCatalogLookups()?.[table] || []).find((item) => item.id === lookupId);
  if (!existingRecord) {
    throw new Error(`Unable to find ${table} lookup: ${lookupId}`);
  }

  const normalizedRecord = normalizeLookupItem(table, {
    ...existingRecord,
    ...values,
    id: existingRecord.id,
  });

  if (!normalizedRecord) {
    throw new Error(`Invalid ${table} lookup values`);
  }

  if (!isSupabaseConfigured || !supabase) {
    const nextLookups = replaceLookupRecord(getCatalogLookups(), table, normalizedRecord);
    saveLocalLookupsSnapshot(nextLookups);
    return normalizedRecord;
  }

  const { id: _unusedId, created_at: _unusedCreatedAt, ...updatePayload } = normalizedRecord;
  const { data, error } = await supabase
    .from(table)
    .update(updatePayload)
    .eq("id", lookupId)
    .select("*")
    .single();

  if (error) {
    if (isMissingLookupTableError(error, table)) {
      const nextLookups = replaceLookupRecord(getCatalogLookups(), table, normalizedRecord);
      saveLocalLookupsSnapshot(nextLookups);
      return normalizedRecord;
    }

    throw error;
  }

  const remoteRecord = normalizeLookupItem(table, data);
  const nextLookups = replaceLookupRecord(getCatalogLookups(), table, remoteRecord);
  saveLocalLookupsSnapshot(nextLookups);
  return remoteRecord;
}
