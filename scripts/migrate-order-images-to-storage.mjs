#!/usr/bin/env node
// Move inline (base64 data: URL) product/garment images out of public.orders
// into the public "product-images" Storage bucket (order-images/<sha256>.<ext>)
// and replace them with public URLs.
//
//   node scripts/migrate-order-images-to-storage.mjs --dry-run            (default, read-only)
//   node scripts/migrate-order-images-to-storage.mjs --execute [--order TC-123]
//   node scripts/migrate-order-images-to-storage.mjs --rollback --rollback-file <dir>/backup.json
//   add --target garments to do the same for garment_library_items.image
//   (garment-images/<sha256>.<ext>). Run garments FIRST, then orders.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Safety:
//  * --execute writes a full backup of every touched column BEFORE any change.
//  * every uploaded object is downloaded back and hash-checked before the row is changed.
//  * each row update is guarded on updated_at, so a staff edit made meanwhile is never overwritten
//    (that order is skipped and reported; just re-run).
//  * rollback only restores rows that still hold exactly what the migration wrote.
//  * customer artwork keys are never touched (only product image keys).
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import {
  GARMENT_IMAGES_PREFIX,
  ORDER_IMAGES_BUCKET,
  ORDER_IMAGES_PREFIX,
  buildOrderImageStoragePath,
  isInlineImage,
  collectInlineProductImages,
  replaceInlineProductImages,
} from "../src/lib/orderImageStorage.js";

const TARGETS = {
  orders: { table: "orders", key: "order_number", columns: ["quote", "line_items", "placements", "artwork_files", "order_metadata"], prefix: ORDER_IMAGES_PREFIX },
  garments: { table: "garment_library_items", key: "id", columns: ["image"], prefix: GARMENT_IMAGES_PREFIX },
};
let T = TARGETS.orders;
let JSON_COLUMNS = T.columns;

function collectImages(target, row) {
  if (target === TARGETS.garments) return new Set(isInlineImage(row.image) ? [row.image] : []);
  return collectInlineProductImages(Object.fromEntries(JSON_COLUMNS.map((c) => [c, row[c]])));
}

function replaceImages(target, column, value, urls) {
  if (target === TARGETS.garments) return isInlineImage(value) && urls.has(value) ? urls.get(value) : value;
  return replaceInlineProductImages(value, urls);
}
const sha = (value) => createHash("sha256").update(value).digest("hex");
const jsonHash = (value) => sha(JSON.stringify(value ?? null));

function parseArgs(argv) {
  const args = { mode: "dry-run", orders: [], outputDir: "", rollbackFile: "", target: "orders" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.mode = "dry-run";
    else if (arg === "--execute") args.mode = "execute";
    else if (arg === "--rollback") args.mode = "rollback";
    else if (arg === "--order" || arg === "--id") args.orders.push(argv[++i]);
    else if (arg === "--target") args.target = argv[++i];
    else if (arg === "--output-dir") args.outputDir = argv[++i];
    else if (arg === "--rollback-file") args.rollbackFile = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!TARGETS[args.target]) throw new Error("--target must be orders or garments");
  if (args.mode === "rollback" && !args.rollbackFile) throw new Error("--rollback needs --rollback-file");
  return args;
}

// Node 20 has no native WebSocket; supabase-js needs one even when realtime is unused.
const realtimeTransport = globalThis.WebSocket ? undefined : (await import("ws")).default;

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false },
    ...(realtimeTransport ? { realtime: { transport: realtimeTransport } } : {}),
  });
}

async function listOrderNumbers(db, only) {
  if (only.length) return only;
  // Small select first; heavy JSON columns are fetched one order at a time.
  const { data, error } = await db.from(T.table).select(T.key).order("created_at");
  if (error) throw error;
  return data.map((row) => row[T.key]);
}

async function fetchOrder(db, orderNumber) {
  const { data, error } = await db
    .from(T.table)
    .select([...new Set(["id", T.key, "updated_at", ...JSON_COLUMNS])].join(","))
    .eq(T.key, orderNumber)
    .single();
  if (error) throw error;
  return data;
}

async function uploadVerified(db, dataUrl) {
  const target = await buildOrderImageStoragePath(dataUrl, T.prefix);
  const bucket = db.storage.from(ORDER_IMAGES_BUCKET);
  const { error } = await bucket.upload(target.path, target.bytes, {
    contentType: target.contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error && !/exists|duplicate/i.test(error.message || "")) throw error;
  const publicUrl = bucket.getPublicUrl(target.path).data.publicUrl;
  const response = await fetch(publicUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Public read failed (${response.status}) for ${target.path}`);
  const downloadedHash = sha(Buffer.from(await response.arrayBuffer()));
  if (downloadedHash !== target.hash) throw new Error(`Hash mismatch for ${target.path}`);
  return { publicUrl, path: target.path, bytes: target.bytes.length };
}

async function migrate(args) {
  const db = client();
  const execute = args.mode === "execute";
  const outDir = args.outputDir || path.join("migration-output", `${args.target}-images-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await fs.mkdir(outDir, { recursive: true });
  const backupFile = path.join(outDir, "backup.json");
  const backup = [];
  const report = { target: args.target, mode: args.mode, ordersScanned: 0, ordersWithImages: 0, inlineImages: 0, inlineMb: 0, migrated: [], skipped: [], failed: [] };
  const urlCache = new Map();

  for (const orderNumber of await listOrderNumbers(db, args.orders)) {
    const row = await fetchOrder(db, orderNumber);
    report.ordersScanned += 1;
    const images = collectImages(T, row);
    if (!images.size) continue;
    report.ordersWithImages += 1;
    report.inlineImages += images.size;
    const beforeBytes = JSON.stringify(JSON_COLUMNS.map((c) => row[c])).length;
    report.inlineMb += [...images].reduce((t, s) => t + s.length, 0) / 1e6;
    if (!execute) {
      report.migrated.push({ order_number: orderNumber, distinct_images: images.size, before_mb: +(beforeBytes / 1e6).toFixed(2) });
      continue;
    }
    try {
      for (const dataUrl of images) {
        if (!urlCache.has(dataUrl)) urlCache.set(dataUrl, (await uploadVerified(db, dataUrl)).publicUrl);
      }
      const patch = {};
      for (const column of JSON_COLUMNS) {
        if (row[column] == null) continue;
        const next = replaceImages(T, column, row[column], urlCache);
        if (JSON.stringify(next) !== JSON.stringify(row[column])) patch[column] = next;
      }
      // Back up before writing; flush to disk every time.
      backup.push({
        target: args.target,
        order_number: orderNumber,
        id: row.id,
        updated_at_before: row.updated_at,
        columns: Object.fromEntries(Object.keys(patch).map((c) => [c, row[c]])),
        written_hashes: Object.fromEntries(Object.entries(patch).map(([c, v]) => [c, jsonHash(v)])),
      });
      await fs.writeFile(backupFile, JSON.stringify(backup));
      const { data, error } = await db
        .from(T.table)
        .update(patch)
        .eq(T.key, orderNumber)
        .eq("updated_at", row.updated_at)
        .select(T.key);
      if (error) throw error;
      if (!data?.length) {
        backup.pop();
        await fs.writeFile(backupFile, JSON.stringify(backup));
        report.skipped.push({ order_number: orderNumber, reason: "order changed during migration; re-run" });
        continue;
      }
      const afterBytes = JSON.stringify(JSON_COLUMNS.map((c) => patch[c] ?? row[c])).length;
      report.migrated.push({ order_number: orderNumber, distinct_images: images.size, before_mb: +(beforeBytes / 1e6).toFixed(2), after_mb: +(afterBytes / 1e6).toFixed(3) });
    } catch (error) {
      report.failed.push({ order_number: orderNumber, error: String(error?.message || error) });
    }
  }
  report.inlineMb = +report.inlineMb.toFixed(2);
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, backupFile: execute ? backupFile : null, outDir }, null, 2));
  if (report.failed.length) process.exitCode = 1;
}

async function rollback(args) {
  const db = client();
  const entries = JSON.parse(await fs.readFile(args.rollbackFile, "utf8"));
  const result = { restored: [], skipped: [] };
  const wrongTarget = entries.find((entry) => (entry.target || "orders") !== args.target);
  if (wrongTarget) throw new Error(`Backup is for --target ${wrongTarget.target}; pass the same --target`);
  for (const entry of entries) {
    const row = await fetchOrder(db, entry.order_number);
    const unchanged = Object.entries(entry.written_hashes).every(([c, h]) => jsonHash(row[c]) === h);
    if (!unchanged) {
      result.skipped.push({ order_number: entry.order_number, reason: "edited after migration; restore by hand" });
      continue;
    }
    const { error } = await db.from(T.table).update(entry.columns).eq(T.key, entry.order_number).eq("updated_at", row.updated_at);
    if (error) result.skipped.push({ order_number: entry.order_number, reason: error.message });
    else result.restored.push(entry.order_number);
  }
  // Storage objects are left in place on purpose: they are content-addressed,
  // harmless, and may be referenced by orders saved since.
  console.log(JSON.stringify(result, null, 2));
  if (result.skipped.length) process.exitCode = 1;
}

const args = parseArgs(process.argv.slice(2));
T = TARGETS[args.target];
JSON_COLUMNS = T.columns;
(args.mode === "rollback" ? rollback(args) : migrate(args)).catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
