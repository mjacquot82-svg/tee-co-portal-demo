import { useEffect, useSyncExternalStore } from "react";
import {
  isSupabaseConfigured,
  supabase,
} from "./supabaseClient";

const GARMENT_MODEL_COLORS_TABLE = "garment_model_colors";
const EMPTY_MODEL_COLORS = Object.freeze([]);
const EMPTY_COLOR_MAP = Object.freeze({});
const listeners = new Set();

let cachedSnapshot = EMPTY_COLOR_MAP;
let loadStarted = false;
let loadPromise = null;

function normalizeText(value) {
  return String(value || "").trim();
}

function isMissingTableError(error) {
  const message = normalizeText(error?.message).toLowerCase();
  const details = normalizeText(error?.details).toLowerCase();
  const hint = normalizeText(error?.hint).toLowerCase();
  return [message, details, hint].some((value) =>
    value.includes("garment_model_colors") &&
      (value.includes("does not exist") || value.includes("could not find the table"))
  );
}

function normalizeDisplayOrder(value, fallback = 999) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeGarmentModelColor(row = {}) {
  const colorName = normalizeText(row.color_name || row.name);
  const garmentModelId = normalizeText(row.garment_model_id);

  if (!colorName || !garmentModelId) return null;

  return {
    id: normalizeText(row.id),
    garment_model_id: garmentModelId,
    color_name: colorName,
    display_order: normalizeDisplayOrder(row.display_order),
    hex_value: normalizeText(row.hex_value || row.hex_code) || null,
    active: row.active !== false,
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
}

function sortGarmentModelColors(colors = []) {
  return [...colors].sort((left, right) => {
    const orderDiff = normalizeDisplayOrder(left.display_order) -
      normalizeDisplayOrder(right.display_order);
    if (orderDiff !== 0) return orderDiff;
    return normalizeText(left.color_name).localeCompare(normalizeText(right.color_name));
  });
}

function groupColorsByGarmentModel(rows = []) {
  const grouped = rows.reduce((accumulator, row) => {
    const color = normalizeGarmentModelColor(row);
    if (!color) return accumulator;

    const existing = accumulator[color.garment_model_id] || [];
    accumulator[color.garment_model_id] = [...existing, color];
    return accumulator;
  }, {});

  return Object.freeze(
    Object.fromEntries(
      Object.entries(grouped).map(([garmentModelId, colors]) => [
        garmentModelId,
        Object.freeze(sortGarmentModelColors(colors)),
      ])
    )
  );
}

function emitUpdated() {
  listeners.forEach((listener) => listener());
}

async function fetchGarmentModelColorsFromSupabase() {
  if (!isSupabaseConfigured || !supabase) return EMPTY_COLOR_MAP;

  const { data, error } = await supabase
    .from(GARMENT_MODEL_COLORS_TABLE)
    .select("*")
    .eq("active", true)
    .order("garment_model_id", { ascending: true })
    .order("display_order", { ascending: true })
    .order("color_name", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      console.warn("[garmentModelColorsStore] garment_model_colors table is unavailable; falling back to product colors.");
      return EMPTY_COLOR_MAP;
    }
    throw error;
  }

  return groupColorsByGarmentModel(Array.isArray(data) ? data : []);
}

export async function refreshGarmentModelColors() {
  cachedSnapshot = await fetchGarmentModelColorsFromSupabase();
  emitUpdated();
  return cachedSnapshot;
}

function ensureGarmentModelColorsLoaded() {
  if (loadPromise) return loadPromise;
  if (loadStarted) return Promise.resolve(cachedSnapshot);

  loadStarted = true;
  loadPromise = refreshGarmentModelColors()
    .catch((error) => {
      console.error("[garmentModelColorsStore] Unable to refresh garment model colors", error);
      return cachedSnapshot;
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

export function getGarmentModelColorsSnapshot() {
  return cachedSnapshot;
}

export function subscribeToGarmentModelColors(listener) {
  if (typeof listener !== "function") return () => {};

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useGarmentModelColors() {
  const colorsByGarmentModel = useSyncExternalStore(
    subscribeToGarmentModelColors,
    getGarmentModelColorsSnapshot,
    () => EMPTY_COLOR_MAP
  );

  useEffect(() => {
    ensureGarmentModelColorsLoaded();
  }, []);

  return colorsByGarmentModel;
}

export function getColorsForGarmentModel(colorsByGarmentModel = EMPTY_COLOR_MAP, garmentModelId = "") {
  const normalizedGarmentModelId = normalizeText(garmentModelId);
  if (!normalizedGarmentModelId) return EMPTY_MODEL_COLORS;
  return colorsByGarmentModel[normalizedGarmentModelId] || EMPTY_MODEL_COLORS;
}

export function resolveProductDisplayColors(product = {}, colorsByGarmentModel = EMPTY_COLOR_MAP) {
  const garmentModelColors = getColorsForGarmentModel(
    colorsByGarmentModel,
    product.garment_model_lookup_id
  );

  if (garmentModelColors.length) {
    return {
      source: "garment_model_colors",
      colors: garmentModelColors,
      colorNames: garmentModelColors.map((color) => color.color_name),
    };
  }

  const productColors = Array.isArray(product.colors)
    ? product.colors.map(normalizeText).filter(Boolean)
    : [];

  return {
    source: "products.colors",
    colors: productColors.map((colorName, index) => ({
      id: `${product.id || "product"}-${index}-${colorName}`,
      garment_model_id: normalizeText(product.garment_model_lookup_id),
      color_name: colorName,
      display_order: index + 1,
      hex_value: null,
      active: true,
      created_at: "",
      updated_at: "",
    })),
    colorNames: productColors,
  };
}
