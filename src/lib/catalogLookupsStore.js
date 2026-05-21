import { useEffect, useSyncExternalStore } from "react";
import { getRawStorageItem, hasBrowserStorage, setRawStorageItem } from "./browserStorage";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const STORAGE_KEY = "teeCoCatalogLookups";
const LOOKUP_TABLES = ["categories", "brands", "colors", "sizes", "garment_models"];

const DEFAULT_LOOKUPS = {
  categories: [
    { id: "category-t-shirts", name: "T-Shirts", active: true },
    { id: "category-hoodies", name: "Hoodies", active: true },
    { id: "category-hats", name: "Hats", active: true },
    { id: "category-workwear", name: "Workwear", active: true },
    { id: "category-teamwear", name: "Teamwear", active: true },
  ],
  brands: [
    { id: "brand-bella-canvas", name: "Bella + Canvas", active: true },
    { id: "brand-gildan", name: "Gildan", active: true },
    { id: "brand-independent-trading-co", name: "Independent Trading Co.", active: true },
    { id: "brand-port-authority", name: "Port Authority", active: true },
    { id: "brand-port-company", name: "Port & Company", active: true },
    { id: "brand-richardson", name: "Richardson", active: true },
    { id: "brand-sport-tek", name: "Sport-Tek", active: true },
  ],
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
  garment_models: [
    {
      id: "model-bc-3001",
      brand_id: "brand-bella-canvas",
      model_code: "3001",
      display_name: "Unisex Jersey Tee",
      category_id: "category-t-shirts",
      active: true,
    },
    {
      id: "model-gildan-64000",
      brand_id: "brand-gildan",
      model_code: "64000",
      display_name: "Softstyle Tee",
      category_id: "category-t-shirts",
      active: true,
    },
    {
      id: "model-ind4000",
      brand_id: "brand-independent-trading-co",
      model_code: "IND4000",
      display_name: "Heavyweight Hooded Sweatshirt",
      category_id: "category-hoodies",
      active: true,
    },
    {
      id: "model-pc78h",
      brand_id: "brand-port-company",
      model_code: "PC78H",
      display_name: "Core Fleece Pullover Hoodie",
      category_id: "category-hoodies",
      active: true,
    },
    {
      id: "model-pt45",
      brand_id: "brand-port-authority",
      model_code: "PT45",
      display_name: "Value Knit Beanie",
      category_id: "category-hats",
      active: true,
    },
    {
      id: "model-richardson-112",
      brand_id: "brand-richardson",
      model_code: "112",
      display_name: "Trucker Snapback",
      category_id: "category-hats",
      active: true,
    },
    {
      id: "model-j763h",
      brand_id: "brand-sport-tek",
      model_code: "J763H",
      display_name: "Colorblock Hooded Raglan Jacket",
      category_id: "category-teamwear",
      active: true,
    },
  ],
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

function mergeLookups(primary = {}, fallback = {}) {
  return LOOKUP_TABLES.reduce((accumulator, table) => {
    const seenKeys = new Set();
    const combined = [];

    [...(fallback?.[table] || []), ...(primary?.[table] || [])]
      .map((item) => normalizeLookupItem(table, item))
      .filter(Boolean)
      .forEach((item) => {
        const dedupKey = getLookupDedupKey(table, item);
        if (!dedupKey || seenKeys.has(dedupKey)) return;
        seenKeys.add(dedupKey);
        combined.push(item);
      });

    accumulator[table] = sortLookupItems(table, combined);
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

export async function createCatalogLookup(table, values) {
  if (!LOOKUP_TABLES.includes(table)) {
    throw new Error(`Unsupported catalog lookup table: ${table}`);
  }

  const normalizedRecord = normalizeLookupItem(table, values);
  if (!normalizedRecord) {
    throw new Error(`Invalid ${table} lookup values`);
  }

  if (!isSupabaseConfigured || !supabase) {
    const nextLookups = appendLookupRecord(getCatalogLookups(), table, normalizedRecord);
    saveLocalLookupsSnapshot(nextLookups);
    return normalizedRecord;
  }

  try {
    const { id: _unusedId, ...insertPayload } = normalizedRecord;
    const { data, error } = await supabase
      .from(table)
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const remoteRecord = normalizeLookupItem(table, data);
    const nextLookups = appendLookupRecord(getCatalogLookups(), table, remoteRecord);
    saveLocalLookupsSnapshot(nextLookups);
    return remoteRecord;
  } catch (error) {
    console.warn(`[catalogLookupsStore] Creating ${table} remotely failed, using local fallback`, error);
    const nextLookups = appendLookupRecord(getCatalogLookups(), table, normalizedRecord);
    saveLocalLookupsSnapshot(nextLookups);
    return normalizedRecord;
  }
}
