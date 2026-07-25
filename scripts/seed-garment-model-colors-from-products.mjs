#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const TABLE_NAME = "garment_model_colors";
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_PAGE_SIZE = 1000;

function parseArgs(argv) {
  const args = {
    mode: "dry-run",
    batchSize: DEFAULT_BATCH_SIZE,
    pageSize: DEFAULT_PAGE_SIZE,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      index += 1;
      return argv[index] || "";
    };

    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--execute") args.mode = "execute";
    else if (arg === "--dry-run") args.mode = "dry-run";
    else if (arg === "--batch-size") args.batchSize = Number(nextValue());
    else if (arg.startsWith("--batch-size=")) args.batchSize = Number(arg.split("=")[1]);
    else if (arg === "--page-size") args.pageSize = Number(nextValue());
    else if (arg.startsWith("--page-size=")) args.pageSize = Number(arg.split("=")[1]);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(args.batchSize) || args.batchSize < 1) {
    throw new Error("--batch-size must be a positive number.");
  }

  if (!Number.isFinite(args.pageSize) || args.pageSize < 1) {
    throw new Error("--page-size must be a positive number.");
  }

  args.batchSize = Math.floor(args.batchSize);
  args.pageSize = Math.floor(args.pageSize);
  return args;
}

function printHelp() {
  console.log(`
Seed garment_model_colors from existing products.colors arrays.

Default mode is read-only dry-run.

Usage:
  node scripts/seed-garment-model-colors-from-products.mjs --dry-run
  node scripts/seed-garment-model-colors-from-products.mjs --execute --batch-size 100

Options:
  --execute                  Insert missing garment_model_colors rows.
  --dry-run                  Report what would be inserted without writing.
  --batch-size <n>           Max rows written per insert batch. Default: ${DEFAULT_BATCH_SIZE}.
  --page-size <n>            Supabase read page size. Default: ${DEFAULT_PAGE_SIZE}.

Environment:
  VITE_SUPABASE_URL or SUPABASE_URL
  VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY for dry-run reads
  SUPABASE_SERVICE_ROLE_KEY required for execute

The script reads .env automatically when those variables are not already set.
`);
}

async function loadDotEnv(filePath = ".env") {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex < 0) return;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (key && !Object.prototype.hasOwnProperty.call(process.env, key)) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function getSupabaseClient({ requireServiceRole = false } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const key = requireServiceRole ? serviceRoleKey : publishableKey || serviceRoleKey;

  if (!supabaseUrl || !key) {
    throw new Error("Missing Supabase URL/key environment variables.");
  }

  if (requireServiceRole && !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for execute mode.");
  }

  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeColorKey(value) {
  return normalizeText(value).toLowerCase();
}

function looksLikeStyleCode(token) {
  const cleaned = normalizeText(token).replace(/[®™]/g, "");
  return Boolean(cleaned) && /[0-9]/.test(cleaned) && /^[A-Za-z0-9]+$/.test(cleaned);
}

function extractStyleCode(...values) {
  for (const value of values.map(normalizeText).filter(Boolean)) {
    const firstSegment = value.split(/\s+-\s+/)[0];
    const tokens = firstSegment.split(/\s+/).filter(Boolean);

    for (let index = tokens.length - 1; index >= 0; index -= 1) {
      if (looksLikeStyleCode(tokens[index])) {
        return normalizeText(tokens[index]).replace(/[®™]/g, "");
      }
    }

    const allTokens = value.split(/\s+/).filter(Boolean);
    for (let index = allTokens.length - 1; index >= 0; index -= 1) {
      if (looksLikeStyleCode(allTokens[index])) {
        return normalizeText(allTokens[index]).replace(/[®™]/g, "");
      }
    }
  }

  return "";
}

function isProductRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeColorList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeText).filter(Boolean);
}

function isMissingTableError(error) {
  const message = normalizeText(error?.message).toLowerCase();
  const details = normalizeText(error?.details).toLowerCase();
  const hint = normalizeText(error?.hint).toLowerCase();
  return [message, details, hint].some(
    (value) =>
      value.includes(TABLE_NAME) &&
      (value.includes("does not exist") ||
        value.includes("could not find the table") ||
        value.includes("schema cache"))
  );
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchAllRows(client, tableName, pageSize, selectFields, orderBy) {
  const rows = [];
  let from = 0;

  while (true) {
    let query = client.from(tableName).select(selectFields).range(from, from + pageSize - 1);

    for (const order of orderBy) {
      query = query.order(order.column, { ascending: order.ascending });
    }

    const { data, error } = await query;
    if (error) throw error;

    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function buildCandidateRows(products = [], garmentModelsById = new Map()) {
  const garmentModelIds = new Set();
  const candidates = [];
  const skippedProducts = [];
  const sourceDuplicates = [];
  const seenSourceKeys = new Set();

  for (const product of products) {
    if (!isProductRecord(product)) continue;

    const garmentModelId = normalizeText(product.garment_model_lookup_id);
    const colors = normalizeColorList(product.colors);
    const garmentModel = garmentModelsById.get(garmentModelId) || null;

    if (!garmentModelId || !colors.length) {
      skippedProducts.push({
        product_id: normalizeText(product.id),
        product_name: normalizeText(product.name),
        garment_model_id: garmentModelId || null,
        reason: !garmentModelId ? "missing-garment-model" : "no-colors",
      });
      continue;
    }

    garmentModelIds.add(garmentModelId);

    const seenInProduct = new Set();
    colors.forEach((colorName, index) => {
      const colorKey = normalizeColorKey(colorName);
      const sourceKey = `${garmentModelId}::${colorKey}`;
      if (!colorKey) return;

      const candidate = {
        garment_model_id: garmentModelId,
        garment_model_name: normalizeText(garmentModel?.display_name || product.name),
        style_code: extractStyleCode(
          garmentModel?.model_code,
          garmentModel?.display_name,
          product.brand_model,
          product.name
        ),
        color_name: colorName,
        display_order: index + 1,
        hex_value: null,
        active: true,
        source_product_id: normalizeText(product.id),
        source_product_name: normalizeText(product.name),
      };

      if (seenInProduct.has(colorKey)) {
        sourceDuplicates.push({
          garment_model_id: garmentModelId,
          garment_model_name: candidate.garment_model_name,
          color_name: colorName,
          source_product_id: candidate.source_product_id,
          source_product_name: candidate.source_product_name,
          reason: "duplicate-within-product",
        });
        return;
      }

      if (seenSourceKeys.has(sourceKey)) {
        sourceDuplicates.push({
          garment_model_id: garmentModelId,
          garment_model_name: candidate.garment_model_name,
          color_name: colorName,
          source_product_id: candidate.source_product_id,
          source_product_name: candidate.source_product_name,
          reason: "duplicate-across-source-products",
        });
        return;
      }

      seenInProduct.add(colorKey);
      seenSourceKeys.add(sourceKey);
      candidates.push(candidate);
    });
  }

  return {
    garmentModelIds: Array.from(garmentModelIds),
    candidates,
    skippedProducts,
    sourceDuplicates,
  };
}

function buildExistingKeyMap(existingRows = []) {
  return existingRows.reduce((accumulator, row) => {
    const garmentModelId = normalizeText(row.garment_model_id);
    const colorKey = normalizeColorKey(row.color_name);
    if (!garmentModelId || !colorKey) return accumulator;
    accumulator.set(`${garmentModelId}::${colorKey}`, row);
    return accumulator;
  }, new Map());
}

function buildVerificationSummary({
  sourceProductsAnalyzed,
  garmentModelsProcessed,
  candidateRows,
  insertedRows,
  skippedExisting,
  skippedProducts,
  sourceDuplicates,
  failures,
}) {
  return {
    sourceProductsAnalyzed,
    garmentModelsProcessed,
    rowsInserted: insertedRows.length,
    rowsSkipped: skippedProducts.length + skippedExisting.length + sourceDuplicates.length,
    duplicatesDetected: skippedExisting.length + sourceDuplicates.length,
    failures: failures.length,
    candidateRows: candidateRows.length,
    skippedProducts: skippedProducts.length,
    skippedExisting: skippedExisting.length,
    sourceDuplicates: sourceDuplicates.length,
  };
}

function printVerificationReport(label, summary) {
  console.log("");
  console.log(label);
  console.log("Verification Report");
  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  await loadDotEnv();

  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    printHelp();
    return;
  }

  const supabase = getSupabaseClient({ requireServiceRole: args.mode === "execute" });
  const productFields = "id, name, brand_model, garment_model_lookup_id, colors";
  const garmentModelFields = "id, model_code, display_name";

  const [products, garmentModels] = await Promise.all([
    fetchAllRows(supabase, "products", args.pageSize, productFields, [
      { column: "name", ascending: true },
    ]),
    fetchAllRows(supabase, "garment_models", args.pageSize, garmentModelFields, [
      { column: "display_name", ascending: true },
    ]),
  ]);

  const garmentModelsById = new Map(
    garmentModels.map((row) => [normalizeText(row.id), row])
  );

  const { garmentModelIds, candidates, skippedProducts, sourceDuplicates } =
    buildCandidateRows(products, garmentModelsById);

  let existingRows = [];
  try {
    existingRows = await fetchAllRows(
      supabase,
      TABLE_NAME,
      args.pageSize,
      "id, garment_model_id, color_name, display_order, hex_value, active",
      [
        { column: "garment_model_id", ascending: true },
        { column: "display_order", ascending: true },
        { column: "color_name", ascending: true },
      ]
    );
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
    console.warn(
      "[seed:garment-model-colors] garment_model_colors table is unavailable; assuming empty existing set for dry-run."
    );
  }

  const existingKeyMap = buildExistingKeyMap(existingRows);
  const rowsToInsert = [];
  const skippedExisting = [];

  for (const candidate of candidates) {
    const key = `${candidate.garment_model_id}::${normalizeColorKey(candidate.color_name)}`;
    if (existingKeyMap.has(key)) {
      skippedExisting.push({
        garment_model_id: candidate.garment_model_id,
        garment_model_name: candidate.garment_model_name,
        color_name: candidate.color_name,
        reason: "already-exists",
      });
      continue;
    }

    rowsToInsert.push({
      garment_model_id: candidate.garment_model_id,
      color_name: candidate.color_name,
      display_order: candidate.display_order,
      hex_value: null,
      active: true,
    });
  }

  const dryRunSummary = buildVerificationSummary({
    sourceProductsAnalyzed: products.length,
    garmentModelsProcessed: garmentModelIds.length,
    candidateRows: rowsToInsert,
    insertedRows: [],
    skippedExisting,
    skippedProducts,
    sourceDuplicates,
    failures: [],
  });

  if (args.mode === "dry-run") {
    printVerificationReport("Dry Run", dryRunSummary);
    return;
  }

  const insertedRows = [];
  const failures = [];
  const batches = chunk(rowsToInsert, args.batchSize);

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    try {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .upsert(batch, {
          onConflict: "garment_model_id,color_name",
          ignoreDuplicates: true,
        })
        .select("id, garment_model_id, color_name, display_order, hex_value, active");

      if (error) throw error;

      insertedRows.push(...(Array.isArray(data) ? data : []));
    } catch (error) {
      failures.push({
        batch: index + 1,
        rowCount: batch.length,
        message: error?.message || String(error),
      });
    }
  }

  const verificationSummary = buildVerificationSummary({
    sourceProductsAnalyzed: products.length,
    garmentModelsProcessed: garmentModelIds.length,
    candidateRows: rowsToInsert,
    insertedRows,
    skippedExisting,
    skippedProducts,
    sourceDuplicates,
    failures,
  });

  printVerificationReport("Execute", verificationSummary);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
