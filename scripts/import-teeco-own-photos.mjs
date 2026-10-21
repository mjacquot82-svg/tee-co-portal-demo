#!/usr/bin/env node
// Tee & Co's own photos + size charts for garments S&S doesn't carry (24/7, CX2, Heritage 54, Canada Sportswear).
// Data: scripts/data/teeco-own-photos.json (colour -> photo file, parsed size charts).
// DRY RUN BY DEFAULT. --apply uploads the resized photos (--photos <dir>, files named like the JSON "key"
// with "/" -> "__") to the public product-images bucket and upserts supplier_color_images / supplier_size_charts.
// STAGING ONLY: needs SUPABASE_URL + TEECO_STAGING_SERVICE_ROLE_KEY and refuses the live project.
import fs from "node:fs";
import path from "node:path";
import { buildStyleKey, normalizeKey } from "../src/lib/supplierColorPhotos.js";

const LIVE_PROJECT_REF = "iwbajhxrgyjferbkibkl";
const SUPPLIER = "tee_co_supplied";
const SOURCE = "teeco_supplier_files_2026_10";
const BUCKET = "product-images";
const VIEW_FIELD = { front: "color_front_image", back: "color_back_image", side: "color_direct_side_image" };

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const photosDir = args.includes("--photos") ? args[args.indexOf("--photos") + 1] : "";
const data = JSON.parse(fs.readFileSync(new URL("./data/teeco-own-photos.json", import.meta.url), "utf8"));
const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.TEECO_STAGING_SERVICE_ROLE_KEY || "";

export function buildRows(base) {
  const byColor = new Map();
  for (const p of data.photos) {
    const styleKey = buildStyleKey(p.brand, p.style);
    const id = `${styleKey}#${normalizeKey(p.color)}`;
    if (!byColor.has(id)) byColor.set(id, { supplier: SUPPLIER, brand_name: p.brand, style_name: p.style, style_key: styleKey,
      color_name: p.color, color_key: normalizeKey(p.color), source: SOURCE, active: true,
      color_front_image: null, color_back_image: null, color_direct_side_image: null });
    byColor.get(id)[VIEW_FIELD[p.view]] = `${base}/storage/v1/object/public/${BUCKET}/${p.key}`;
  }
  const charts = data.size_charts.map((c) => ({ supplier: SUPPLIER, brand_name: c.brand, style_name: c.style,
    style_key: buildStyleKey(c.brand, c.style), unit: c.unit, sizes: c.sizes, measurements: c.measurements, source: SOURCE, active: true }));
  return { colors: [...byColor.values()], charts };
}

async function main() {
  const { colors, charts } = buildRows(url || "https://<staging>.supabase.co");
  console.log(`${data.photos.length} photos -> ${colors.length} colours on ${new Set(colors.map((c) => c.style_key)).size} styles; ${charts.length} size charts`);
  if (!apply) return console.log("Dry run. Add --apply --photos <dir> to write to staging.");
  if (!url || !key) throw new Error("Set SUPABASE_URL (staging) and TEECO_STAGING_SERVICE_ROLE_KEY.");
  if (url.includes(LIVE_PROJECT_REF)) throw new Error("Refusing: that is the LIVE project.");
  const H = { apikey: key, Authorization: `Bearer ${key}` };
  for (const p of data.photos) {
    const file = path.join(photosDir, p.key.replaceAll("/", "__"));
    const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${p.key}`, { method: "POST",
      headers: { ...H, "Content-Type": "image/jpeg", "x-upsert": "true", "Cache-Control": "max-age=86400" }, body: fs.readFileSync(file) });
    if (!r.ok) throw new Error(`upload ${p.key}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  for (const [table, rows, on] of [["supplier_color_images", colors, "supplier,style_key,color_key"], ["supplier_size_charts", charts, "supplier,style_key"]]) {
    const r = await fetch(`${url}/rest/v1/${table}?on_conflict=${on}`, { method: "POST",
      headers: { ...H, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
    if (!r.ok) throw new Error(`${table}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
  console.log("Staging updated.");
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
