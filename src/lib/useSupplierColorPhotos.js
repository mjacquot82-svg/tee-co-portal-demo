import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import {
  buildColorPhotoViews,
  buildStyleKey,
  fetchSupplierColorImages,
  fetchSupplierSizeChart,
  findColorPhotoRecord,
  resolveSupplierStyle,
  withLookupBrand,
} from "./supplierColorPhotos";
import { useCatalogLookups } from "./catalogLookupsStore";

function useBrandedProduct(product) {
  const brands = useCatalogLookups()?.brands;
  return useMemo(() => withLookupBrand(product, brands), [product, brands]);
}

// Returns the S&S photo views (front/back/side/on-model) for the selected colour, or [] when
// S&S has nothing for this garment/colour (the page then keeps its normal garment image).
const EMPTY = [];

export function useSupplierColorPhotos(rawProduct, garment, colorName) {
  const product = useBrandedProduct(rawProduct);
  const style = useMemo(() => resolveSupplierStyle(product || {}, garment || {}), [product, garment]);
  const styleKey = style ? `${style.brand}|${style.style}` : "";
  const [loaded, setLoaded] = useState({ styleKey: "", rows: [] });

  useEffect(() => {
    let active = true;
    if (!styleKey || !isSupabaseConfigured || !supabase) return undefined;
    fetchSupplierColorImages(supabase, style).then((rows) => {
      if (active) setLoaded({ styleKey, rows });
    });
    return () => {
      active = false;
    };
    // style is derived from styleKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey]);

  const records = loaded.styleKey === styleKey ? loaded.rows : EMPTY;
  return useMemo(
    () => buildColorPhotoViews(findColorPhotoRecord(records, colorName, style ? buildStyleKey(style.brand, style.style) : "")),
    [records, colorName, style]
  );
}

// S&S size chart (inches) for the garment, or null when S&S has none for it.
export function useSupplierSizeChart(rawProduct, garment) {
  const product = useBrandedProduct(rawProduct);
  const style = useMemo(() => resolveSupplierStyle(product || {}, garment || {}), [product, garment]);
  const styleKey = style ? `${style.brand}|${style.style}` : "";
  const [loaded, setLoaded] = useState({ styleKey: "", chart: null });

  useEffect(() => {
    let active = true;
    if (!styleKey || !isSupabaseConfigured || !supabase) return undefined;
    fetchSupplierSizeChart(supabase, style).then((chart) => {
      if (active) setLoaded({ styleKey, chart });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey]);

  return loaded.styleKey === styleKey ? loaded.chart : null;
}

// First colour photo (front) for a product card when the product has no image of its own.
export function useSupplierCardImage(rawProduct, enabled = true) {
  const product = useBrandedProduct(rawProduct);
  const style = useMemo(() => (enabled ? resolveSupplierStyle(product || {}, {}) : null), [product, enabled]);
  const styleKey = style ? `${style.brand}|${style.style}` : "";
  const [loaded, setLoaded] = useState({ styleKey: "", rows: [] });
  useEffect(() => {
    let active = true;
    if (!styleKey || !isSupabaseConfigured || !supabase) return undefined;
    fetchSupplierColorImages(supabase, style).then((rows) => {
      if (active) setLoaded({ styleKey, rows });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey]);
  const records = loaded.styleKey === styleKey ? loaded.rows : EMPTY;
  return useMemo(() => {
    if (!records.length) return "";
    const colors = Array.isArray(product?.colors) ? product.colors : [];
    const key = style ? buildStyleKey(style.brand, style.style) : "";
    const record = colors.map((c) => findColorPhotoRecord(records, typeof c === "string" ? c : c?.name, key)).find(Boolean) || records[0];
    const views = buildColorPhotoViews(record, "medium");
    return (views.find((v) => v.view === "front") || views[0])?.src || "";
  }, [records, product, style]);
}
