// S&S Activewear colour photos (front / back / side / on-model) for the garment colour picker.
// Data lives in public.supplier_color_images (see supabase/supplier-color-images.sql), filled by
// scripts/import-ss-products.mjs from S&S's product file or their V2 API. Garments S&S does not
// carry simply have no rows, and the page keeps showing the existing garment image.

export const SS_SUPPLIER = "ss_activewear";
export const SS_IMAGE_HOST = "https://cdn.ssactivewear.com/";
export const SUPPLIER_COLOR_IMAGES_TABLE = "supplier_color_images";

const SIZE_SUFFIX = { small: "_fs", medium: "_fm", large: "_fl" };

function normalizeText(value) {
  return String(value ?? "").trim();
}

export function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[™®©�]/g, "").replace(/\s+/g, " ").trim();
}

// Brand spellings differ between S&S ("CORE365", "BELLA + CANVAS", "Rabbit Skins") and the Tee & Co
// catalogue ("Core 365", "Bella + Canvas", "Rabbit Skin"), so brands are compared letters/digits only.
const BRAND_ALIASES = { rabbitskin: "rabbitskins", ypclassic: "ypclassics", bella: "bellacanvas" };

export function normalizeBrandKey(value) {
  const key = normalizeKey(value).replace(/[^a-z0-9]/g, "");
  return BRAND_ALIASES[key] || key;
}

export function buildStyleKey(brandName, styleName) {
  const brand = normalizeBrandKey(brandName);
  const style = normalizeKey(styleName);
  return brand && style ? `${brand}|${style}` : "";
}

// Accepts what S&S gives in its file/API ("Images/Color/16813_f_fm.jpg"), the short form used on
// its product pages ("Color/16813_f"), or a full https URL. Returns a CDN URL at the wanted size.
export function buildSsImageUrl(path, size = "medium") {
  let value = normalizeText(path);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) {
    if (!/^https:\/\/cdn\.ssactivewear\.com\//i.test(value)) return value;
    value = value.replace(/^https:\/\/cdn\.ssactivewear\.com\//i, "");
  }
  value = value.replace(/^\/+/, "");
  if (!/^Images\//i.test(value)) value = `Images/${value}`;
  const suffix = SIZE_SUFFIX[size] || SIZE_SUFFIX.medium;
  value = value.replace(/\.(jpe?g|png)$/i, "");
  value = /_f[sml]$/i.test(value) ? value.replace(/_f[sml]$/i, suffix) : `${value}${suffix}`;
  return `${SS_IMAGE_HOST}${value}.jpg`;
}

// Works out which S&S style a catalog product is, e.g. "Gildan Youth Heavy Cotton T-Shirt - 5000B"
// or brand_model "Gildan 5000B" -> { brand: "Gildan", style: "5000B" }.
export function resolveSupplierStyle(product = {}, garment = {}) {
  const explicitBrand = normalizeText(product?.supplier_brand || garment?.supplier_brand);
  const explicitStyle = normalizeText(product?.supplier_style || garment?.supplier_style);
  if (explicitBrand && explicitStyle) return { brand: explicitBrand, style: explicitStyle };

  const brandModel = normalizeText(product?.brand_model);
  const name = normalizeText(product?.name || garment?.display_name);
  const brand = explicitBrand || normalizeText(garment?.brand) || brandModel.split(/\s+/)[0] || name.split(/\s+/)[0] || "";
  const styleFrom = (text) => {
    const dash = text.match(/[-–]\s*([A-Z0-9]{2,}[A-Z0-9-]*)\s*$/i);
    if (dash && /\d/.test(dash[1])) return dash[1];
    const last = text.split(/\s+/).pop() || "";
    return /\d/.test(last) && /^[A-Z0-9-]+$/i.test(last) ? last : "";
  };
  const garmentStyle = normalizeText(garment?.garment_id).split("_").pop();
  const style = explicitStyle || styleFrom(brandModel) || styleFrom(name) || (/\d/.test(garmentStyle || "") ? garmentStyle : "");
  return brand && style ? { brand, style: style.toUpperCase() } : null;
}

const VIEW_FIELDS = [
  { view: "front", label: "Front", fields: ["color_front_image"] },
  { view: "back", label: "Back", fields: ["color_back_image"] },
  { view: "side", label: "Side", fields: ["color_direct_side_image", "color_side_image"] },
  { view: "model-front", label: "On model", fields: ["color_on_model_front_image"] },
  { view: "model-back", label: "Model back", fields: ["color_on_model_back_image"] },
  { view: "model-side", label: "Model side", fields: ["color_on_model_side_image"] },
];

export function buildColorPhotoViews(record, size = "large") {
  if (!record) return [];
  return VIEW_FIELDS.map(({ view, label, fields }) => {
    const path = fields.map((field) => normalizeText(record[field])).find(Boolean);
    return path ? { view, label, src: buildSsImageUrl(path, size), thumb: buildSsImageUrl(path, "small") } : null;
  }).filter(Boolean);
}

export function findColorPhotoRecord(records = [], colorName = "") {
  const key = normalizeKey(colorName);
  if (!key) return null;
  return records.find((record) => normalizeKey(record.color_name) === key) || null;
}

// S&S product file / API row (one row per SKU = colour + size) -> one row per colour for our table.
export function mapSsProductRowsToColorImages(rows = [], { source = "ss_product_file" } = {}) {
  const byKey = new Map();
  for (const row of rows) {
    const brandName = normalizeText(row.brandName);
    const styleName = normalizeText(row.styleName);
    const colorName = normalizeText(row.colorName);
    const styleKey = buildStyleKey(brandName, styleName);
    if (!styleKey || !colorName) continue;
    const key = `${styleKey}|${normalizeKey(colorName)}`;
    if (byKey.has(key)) continue;
    const pick = (field) => normalizeText(row[field]) || null;
    const colorStyleId = Number(String(row.colorFrontImage || "").match(/\/(\d+)_/)?.[1]) || null;
    byKey.set(key, {
      supplier: SS_SUPPLIER,
      brand_name: brandName,
      style_name: styleName,
      style_key: styleKey,
      style_id: Number(row.styleID) || null,
      color_name: colorName,
      color_key: normalizeKey(colorName),
      color_code: pick("colorCode"),
      color_style_id: colorStyleId,
      color_hex: pick("color1"),
      color_swatch_image: pick("colorSwatchImage"),
      color_front_image: pick("colorFrontImage"),
      color_back_image: pick("colorBackImage"),
      color_side_image: pick("colorSideImage"),
      color_direct_side_image: pick("colorDirectSideImage"),
      color_on_model_front_image: pick("colorOnModelFrontImage"),
      color_on_model_back_image: pick("colorOnModelBackImage"),
      color_on_model_side_image: pick("colorOnModelSideImage"),
      source,
      active: true,
    });
  }
  return [...byKey.values()];
}

// ---- loading (one request per style, cached) ----
const cache = new Map();

export async function fetchSupplierColorImages(client, style) {
  const styleKey = style ? buildStyleKey(style.brand, style.style) : "";
  if (!client || !styleKey) return [];
  if (!cache.has(styleKey)) {
    cache.set(styleKey, (async () => {
      const { data, error } = await client
        .from(SUPPLIER_COLOR_IMAGES_TABLE)
        .select("color_name, color_hex, color_swatch_image, color_front_image, color_back_image, color_side_image, color_direct_side_image, color_on_model_front_image, color_on_model_back_image, color_on_model_side_image")
        .eq("style_key", styleKey)
        .eq("active", true);
      if (error) {
        // Table not installed yet (or offline): no S&S photos, keep the normal garment image.
        console.warn("[supplierColorPhotos] colour photos unavailable", error.code || error.message);
        return [];
      }
      return Array.isArray(data) ? data : [];
    })().catch(() => []));
  }
  return cache.get(styleKey);
}

export function clearSupplierColorImagesCache() {
  cache.clear();
  chartCache.clear();
}

// ---- size charts (S&S Specs file: one row per style + size + measurement) ----
export const SUPPLIER_SIZE_CHARTS_TABLE = "supplier_size_charts";

function sizeOrderValue(value) {
  // S&S sizeOrder looks like "B1", "B2"... ; fall back to a common size ladder.
  const match = String(value ?? "").match(/(\d+)/);
  return match ? Number(match[1]) : 999;
}

// Measurements customers care about first; tolerances are left out of the customer chart.
const SPEC_PRIORITY = ["chest width (laid flat)", "chest circumference", "body length", "sleeve length", "sleeve length (from center back)"];

export function mapSsSpecsToSizeCharts(rows = [], { source = "ss_product_file" } = {}) {
  const byStyle = new Map();
  for (const row of rows) {
    const styleKey = buildStyleKey(row.brandName, row.styleName);
    const sizeName = normalizeText(row.sizeName);
    const specName = normalizeText(row.specName);
    const value = normalizeText(row.value);
    if (!styleKey || !sizeName || !specName || !value) continue;
    if (/tolerance/i.test(specName)) continue;
    if (!byStyle.has(styleKey)) {
      byStyle.set(styleKey, {
        brandName: normalizeText(row.brandName),
        styleName: normalizeText(row.styleName),
        styleId: Number(row.styleID) || null,
        sizes: new Map(),
        specs: new Map(),
      });
    }
    const entry = byStyle.get(styleKey);
    if (!entry.sizes.has(sizeName)) entry.sizes.set(sizeName, sizeOrderValue(row.sizeOrder));
    if (!entry.specs.has(specName)) entry.specs.set(specName, {});
    entry.specs.get(specName)[sizeName] = value;
  }
  return [...byStyle.entries()].map(([styleKey, entry]) => {
    const sizes = [...entry.sizes.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
    const rank = (name) => {
      const i = SPEC_PRIORITY.indexOf(name.toLowerCase());
      return i === -1 ? SPEC_PRIORITY.length : i;
    };
    const measurements = [...entry.specs.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
      .map(([name, values]) => ({ name, values }));
    return {
      supplier: SS_SUPPLIER,
      brand_name: entry.brandName,
      style_name: entry.styleName,
      style_key: styleKey,
      style_id: entry.styleId,
      unit: "in",
      sizes,
      measurements,
      source,
      active: true,
    };
  });
}

const chartCache = new Map();

export async function fetchSupplierSizeChart(client, style) {
  const styleKey = style ? buildStyleKey(style.brand, style.style) : "";
  if (!client || !styleKey) return null;
  if (!chartCache.has(styleKey)) {
    chartCache.set(styleKey, (async () => {
      const { data, error } = await client
        .from(SUPPLIER_SIZE_CHARTS_TABLE)
        .select("unit, sizes, measurements")
        .eq("style_key", styleKey)
        .eq("active", true)
        .limit(1);
      if (error) {
        console.warn("[supplierColorPhotos] size chart unavailable", error.code || error.message);
        return null;
      }
      return Array.isArray(data) && data[0] ? data[0] : null;
    })().catch(() => null));
  }
  return chartCache.get(styleKey);
}
