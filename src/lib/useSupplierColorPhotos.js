import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import {
  buildColorPhotoViews,
  fetchSupplierColorImages,
  findColorPhotoRecord,
  resolveSupplierStyle,
} from "./supplierColorPhotos";

// Returns the S&S photo views (front/back/side/on-model) for the selected colour, or [] when
// S&S has nothing for this garment/colour (the page then keeps its normal garment image).
const EMPTY = [];

export function useSupplierColorPhotos(product, garment, colorName) {
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
    () => buildColorPhotoViews(findColorPhotoRecord(records, colorName)),
    [records, colorName]
  );
}
