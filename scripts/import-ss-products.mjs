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
//   --api                    S&S V2 API, needs SS_ACCOUNT_NUMBER and SS_API_KEY (not set up yet)
// Filters:
//   --style "Gildan 5000"    only this brand + style (repeatable). Required with --api.
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
import { buildStyleKey, mapSsProductRowsToColorImages } from "../src/lib/supplierColorPhotos.js";

const LIVE_PROJECT_REF = "iwbajhxrgyjferbkibkl";
const TABLE = "supplier_color_images";

export function parseArgs(argv) {
  const opts = { apply: false, demo: false, api: false, file: "", styles: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--demo") opts.demo = true;
    else if (arg === "--api") opts.api = true;
    else if (arg === "--file") opts.file = argv[++i] || "";
    else if (arg === "--style") opts.styles.push(argv[++i] || "");
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  const sources = [opts.demo, opts.api, Boolean(opts.file)].filter(Boolean).length;
  if (!opts.help && sources !== 1) throw new Error("Pick exactly one source: --file, --demo or --api");
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
    console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 22).join("\n"));
    return;
  }
  const styles = opts.styles.map(parseStyleFilter);
  let rows;
  let source = "ss_product_file";
  if (opts.demo) {
    rows = JSON.parse(fs.readFileSync(new URL("./data/ss-demo-colours.json", import.meta.url), "utf8")).rows;
    source = "demo_seed";
  } else if (opts.api) {
    rows = await readApiRows(styles);
    source = "ss_api";
  } else {
    rows = readCsvRows(opts.file);
  }
  const records = filterByStyles(mapSsProductRowsToColorImages(rows, { source }), styles);
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
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
