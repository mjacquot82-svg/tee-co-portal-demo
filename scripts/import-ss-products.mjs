#!/usr/bin/env node
// STUB / FIRST VERSION: import S&S Activewear colour photos into public.supplier_color_images.
//
// DRY RUN BY DEFAULT: reads the S&S data, prints what it would import, writes nothing.
// --apply writes to STAGING ONLY (it refuses the live project ref).
//
// Sources (pick one):
//   --file <products.csv>    S&S product data file exported as CSV (one row per SKU). A .zip is
//                            unpacked with the system `unzip`. Excel files: save as CSV first.
//   --demo                   the bundled demo set (Gildan 5000 + 64000, scripts/data/ss-demo-colours.json)
//   --datalibrary <zip|dir>  the S&S Canada "Data Library" download (SNS_Canada_DataLibrary.zip with
//                            Products.xlsx + Specs.xlsx). Imports colour photos AND size charts.
//                            Excel is converted with scripts/ss-xlsx-to-csv.py (python3 + openpyxl).
//   --api                    S&S V2 API, needs SS_ACCOUNT_NUMBER and SS_API_KEY (not set up yet)
// Filters:
//   --style "Gildan 5000"    only this brand + style (repeatable). Required with --api.
//   --catalog <file.json>    only the styles/colours Tee & Co carries (scripts/data/tee-co-ss-styles.json).
//                            A style with an empty colour list keeps all its S&S colours.
//
// Writing (with --apply) needs SUPABASE_URL (staging) and TEECO_STAGING_SERVICE_ROLE_KEY.
// Examples:
//   node scripts/import-ss-products.mjs --demo
//   node scripts/import-ss-products.mjs --file ~/Downloads/ss-products.csv --style "Gildan 5000"
//   node scripts/import-ss-products.mjs --demo --apply

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Papa from "papaparse";
import {
  buildStyleKey,
  mapSsProductRowsToColorImages,
  mapSsSpecsToSizeCharts,
  normalizeKey,
} from "../src/lib/supplierColorPhotos.js";
import { resolveColorAlias } from "../src/lib/supplierColorAliases.js";

const LIVE_PROJECT_REF = "iwbajhxrgyjferbkibkl";
const TABLE = "supplier_color_images";
const CHART_TABLE = "supplier_size_charts";

function parseCsv(file) {
  const parsed = Papa.parse(fs.readFileSync(file, "utf8"), { header: true, skipEmptyLines: true });
  if (parsed.errors.length) console.warn(`CSV warnings in ${path.basename(file)}: ${parsed.errors.length}`);
  return parsed.data;
}

// S&S Data Library zip/folder -> { products: rows, specs: rows }
export function readDataLibrary(input) {
  let dir = input;
  if (/\.zip$/i.test(input)) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-datalibrary-"));
    execFileSync("unzip", ["-q", "-o", input, "-d", dir]);
  }
  const find = (name) => {
    for (const ext of ["csv", "xlsx"]) {
      const hit = fs.readdirSync(dir).find((f) => f.toLowerCase() === `${name}.${ext}`);
      if (hit) return path.join(dir, hit);
    }
    return "";
  };
  let products = find("products");
  let specs = find("specs");
  if (/\.xlsx$/i.test(products) || /\.xlsx$/i.test(specs)) {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "ss-csv-"));
    const helper = new URL("./ss-xlsx-to-csv.py", import.meta.url).pathname;
    execFileSync("python3", [helper, dir, out], { stdio: "inherit" });
    products = path.join(out, "Products.csv");
    specs = fs.existsSync(path.join(out, "Specs.csv")) ? path.join(out, "Specs.csv") : "";
  }
  if (!products || !fs.existsSync(products)) throw new Error("No Products sheet in the Data Library download.");
  return { products: parseCsv(products), specs: specs ? parseCsv(specs) : [] };
}

// Keep only the styles (and colours) Tee & Co carries.
export function filterByCatalog(records, catalog, { colors = true } = {}) {
  if (!catalog) return records;
  const norm = (c) => normalizeKey(c).replace(/grey/g, "gray").replace(/[^a-z0-9]/g, "");
  const allowed = new Map();
  for (const entry of catalog.styles || []) {
    const parts = String(entry.ss_style || "").trim().split(/\s+/);
    const key = buildStyleKey(parts.slice(0, -1).join(" "), parts[parts.length - 1]);
    allowed.set(key, entry.colors?.length ? new Set(entry.colors.flatMap((c) => [norm(c), norm(resolveColorAlias(c, key))])) : null);
  }
  return records.filter((record) => {
    if (!allowed.has(record.style_key)) return false;
    const set = allowed.get(record.style_key);
    return !colors || !set || set.has(norm(record.color_name));
  });
}

export function parseArgs(argv) {
  const opts = { apply: false, demo: false, api: false, file: "", datalibrary: "", catalog: "", styles: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--demo") opts.demo = true;
    else if (arg === "--api") opts.api = true;
    else if (arg === "--file") opts.file = argv[++i] || "";
    else if (arg === "--datalibrary") opts.datalibrary = argv[++i] || "";
    else if (arg === "--catalog") opts.catalog = argv[++i] || "";
    else if (arg === "--style") opts.styles.push(argv[++i] || "");
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  const sources = [opts.demo, opts.api, Boolean(opts.file), Boolean(opts.datalibrary)].filter(Boolean).length;
  if (!opts.help && sources !== 1) throw new Error("Pick exactly one source: --file, --datalibrary, --demo or --api");
  if (opts.api && !opts.styles.length) throw new Error("--api needs at least one --style");
  return opts;
}

// "Gildan 5000" -> { brand: "Gildan", style: "5000" } (last word is the style)
export function parseStyleFilter(value) {
  const parts = String(value || "").trim().split(/\s+/);
  if (parts.length < 2) throw new Error(`--style needs brand and style, e.g. "Gildan 5000" (got "${value}")`);
  return { brand: parts.slice(0, -1).join(" "), style: parts[parts.length - 1] };
}

export function assertStagingTarget(url) {
  const value = String(url || "");
  if (!value) throw new Error("SUPABASE_URL (staging) is required for --apply");
  if (value.includes(LIVE_PROJECT_REF)) throw new Error("Refusing to write: SUPABASE_URL points at the LIVE project.");
  return value;
}

function readCsvRows(file) {
  let csvPath = file;
  if (/\.zip$/i.test(file)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-products-"));
    execFileSync("unzip", ["-q", "-o", file, "-d", dir]);
    const csv = fs.readdirSync(dir).find((name) => /\.csv$/i.test(name));
    if (!csv) throw new Error("No .csv inside the zip. If S&S sent an Excel file, save it as CSV first.");
    csvPath = path.join(dir, csv);
  } else if (/\.xlsx?$/i.test(file)) {
    throw new Error("Excel files are not read directly. Open it and save as CSV, then pass the .csv.");
  }
  const parsed = Papa.parse(fs.readFileSync(csvPath, "utf8"), { header: true, skipEmptyLines: true });
  if (parsed.errors.length) console.warn(`CSV warnings: ${parsed.errors.length} (first: ${parsed.errors[0].message})`);
  return parsed.data;
}

async function readApiRows(styles) {
  // S&S V2 API (Canada). Not tested yet: needs Tee & Co's S&S account number + API key.
  const account = process.env.SS_ACCOUNT_NUMBER;
  const key = process.env.SS_API_KEY;
  if (!account || !key) throw new Error("--api needs SS_ACCOUNT_NUMBER and SS_API_KEY");
  const auth = Buffer.from(`${account}:${key}`).toString("base64");
  const rows = [];
  for (const { brand, style } of styles) {
    const url = `https://api-ca.ssactivewear.com/V2/products/?style=${encodeURIComponent(`${brand} ${style}`)}`;
    const response = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } });
    if (!response.ok) throw new Error(`S&S API ${response.status} for ${brand} ${style}`);
    rows.push(...(await response.json()));
  }
  return rows;
}

export function filterByStyles(records, styles) {
  if (!styles.length) return records;
  const keys = new Set(styles.map((s) => buildStyleKey(s.brand, s.style)));
  return records.filter((record) => keys.has(record.style_key));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 28).join("\n"));
    return;
  }
  const styles = opts.styles.map(parseStyleFilter);
  let rows;
  let specRows = [];
  let source = "ss_product_file";
  if (opts.demo) {
    rows = JSON.parse(fs.readFileSync(new URL("./data/ss-demo-colours.json", import.meta.url), "utf8")).rows;
    source = "demo_seed";
  } else if (opts.api) {
    rows = await readApiRows(styles);
    source = "ss_api";
  } else if (opts.datalibrary) {
    const library = readDataLibrary(opts.datalibrary);
    rows = library.products;
    specRows = library.specs;
    source = "ss_datalibrary";
  } else {
    rows = readCsvRows(opts.file);
  }
  const catalog = opts.catalog ? JSON.parse(fs.readFileSync(opts.catalog, "utf8")) : null;
  const records = filterByCatalog(filterByStyles(mapSsProductRowsToColorImages(rows, { source }), styles), catalog);
  const charts = filterByCatalog(filterByStyles(mapSsSpecsToSizeCharts(specRows, { source }), styles), catalog, { colors: false });
  console.log(`Size charts: ${charts.length} styles`);
  const byStyle = {};
  for (const record of records) byStyle[record.style_key] = (byStyle[record.style_key] || 0) + 1;
  console.log(`Read ${rows.length} S&S rows -> ${records.length} colours`);
  for (const [key, count] of Object.entries(byStyle)) console.log(`  ${key}: ${count} colours`);
  const noFront = records.filter((record) => !record.color_front_image).length;
  if (noFront) console.log(`  (${noFront} colours have no front photo and will fall back to the normal image)`);

  if (!opts.apply) {
    console.log("DRY RUN: nothing written. Add --apply to write to staging.");
    return;
  }
  const url = assertStagingTarget(process.env.SUPABASE_URL);
  const serviceKey = process.env.TEECO_STAGING_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("TEECO_STAGING_SERVICE_ROLE_KEY is required for --apply");
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  for (let i = 0; i < records.length; i += 200) {
    const chunk = records.slice(i, i + 200).map((record) => ({ ...record, updated_at: new Date().toISOString() }));
    const { error } = await client.from(TABLE).upsert(chunk, { onConflict: "supplier,style_key,color_key" });
    if (error) throw new Error(`Upsert failed: ${error.code || ""} ${error.message}`);
  }
  console.log(`Wrote ${records.length} colours to staging ${TABLE}.`);
  for (let i = 0; i < charts.length; i += 100) {
    const chunk = charts.slice(i, i + 100).map((chart) => ({ ...chart, updated_at: new Date().toISOString() }));
    const { error } = await client.from(CHART_TABLE).upsert(chunk, { onConflict: "supplier,style_key" });
    if (error) throw new Error(`Size chart upsert failed: ${error.code || ""} ${error.message}`);
  }
  console.log(`Wrote ${charts.length} size charts to staging ${CHART_TABLE}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
