#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { atomicImageSwap, guardedRollback, imageSnapshot, sha256, verifyPublicImage, verifyLiveStorageReader } from "./product-image-migration-safety.mjs";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_IMAGES_BUCKET = "product-images";
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_OUTPUT_ROOT = "migration-output";
const PRODUCTS_SELECT_FIELDS = [
  "id",
  "legacy_product_id",
  "sku",
  "name",
  "category",
  "status",
  "image",
  "image_storage_path",
  "image_content_type",
  "image_file_size",
  "image_updated_at",
  "image_thumb_storage_path",
].join(", ");

function parseArgs(argv) {
  const args = {
    mode: "dry-run",
    batchSize: DEFAULT_BATCH_SIZE,
    pageSize: DEFAULT_PAGE_SIZE,
    outputDir: "",
    resumeDir: "",
    rollbackFile: "",
    rollbackRemoveStorage: false,
    verify: true,
    thumbnailManifest: "",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      index += 1;
      return argv[index] || "";
    };

    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--export") args.mode = "export";
    else if (arg === "--thumbnail-manifest") args.thumbnailManifest = nextValue();
    else if (arg === "--execute") args.mode = "execute";
    else if (arg === "--dry-run") args.mode = "dry-run";
    else if (arg === "--rollback") args.mode = "rollback";
    else if (arg === "--batch-size") args.batchSize = Number(nextValue());
    else if (arg.startsWith("--batch-size=")) args.batchSize = Number(arg.split("=")[1]);
    else if (arg === "--page-size") args.pageSize = Number(nextValue());
    else if (arg.startsWith("--page-size=")) args.pageSize = Number(arg.split("=")[1]);
    else if (arg === "--output-dir") args.outputDir = nextValue();
    else if (arg.startsWith("--output-dir=")) args.outputDir = arg.slice("--output-dir=".length);
    else if (arg === "--resume-dir") args.resumeDir = nextValue();
    else if (arg.startsWith("--resume-dir=")) args.resumeDir = arg.slice("--resume-dir=".length);
    else if (arg === "--rollback-file") args.rollbackFile = nextValue();
    else if (arg.startsWith("--rollback-file=")) {
      args.rollbackFile = arg.slice("--rollback-file=".length);
    } else if (arg === "--rollback-remove-storage") args.rollbackRemoveStorage = true;
    else if (arg === "--no-verify") throw new Error("Verification cannot be disabled");
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(args.batchSize) || args.batchSize < 1) {
    throw new Error("--batch-size must be a positive number.");
  }

  if (!Number.isFinite(args.pageSize) || args.pageSize < 1) {
    throw new Error("--page-size must be a positive number.");
  }

  if (args.rollbackRemoveStorage) throw new Error("Deleting migration originals or thumbnails is prohibited");
  if (args.mode === "execute" && !args.thumbnailManifest) throw new Error("--thumbnail-manifest is required for execute");
  args.batchSize = Math.floor(args.batchSize);
  args.pageSize = Math.floor(args.pageSize);
  return args;
}

function printHelp() {
  console.log(`
Migrate existing base64 product images to Supabase Storage.

Default mode is read-only dry-run.

Usage:
  node scripts/migrate-product-images-to-storage.mjs --dry-run
  node scripts/migrate-product-images-to-storage.mjs --execute --thumbnail-manifest thumbnails/thumbnail-manifest.json --batch-size 3
  node scripts/migrate-product-images-to-storage.mjs --execute --thumbnail-manifest thumbnails/thumbnail-manifest.json --resume-dir migration-output/product-image-storage-migration-...
  node scripts/migrate-product-images-to-storage.mjs --rollback --rollback-file migration-output/.../rollback.jsonl

Options:
  --export                   Export original images and preparation manifest without remote writes.
  --thumbnail-manifest <p>   Verified generator manifest, required for execute.
  --execute                  Upload original + thumbnail and atomically update products.
  --dry-run                  Report eligible products without writing data. This is the default.
  --rollback                 Restore products.image and image metadata from a rollback JSONL file.
  --batch-size <n>           Maximum eligible products to process in this run. Default: ${DEFAULT_BATCH_SIZE}.
  --page-size <n>            Supabase read page size. Default: ${DEFAULT_PAGE_SIZE}.
  --output-dir <path>        Output directory for rollback and manifest files.
  --resume-dir <path>        Reuse an existing output directory and skip already migrated IDs.
  --rollback-file <path>     Rollback JSONL file. Defaults to <resume-dir>/rollback.jsonl.
  Originals and thumbnails are never deleted. Verification cannot be disabled.

Environment:
  VITE_SUPABASE_URL or SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY  Required for execute and rollback.
  VITE_SUPABASE_ANON_KEY     Enough for dry-run reads when service role is absent.
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
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^([\'\"])(.*)\1$/, "$2");
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
  const key = serviceRoleKey || publishableKey;

  if (!supabaseUrl || !key) {
    throw new Error("Missing Supabase URL/key environment variables.");
  }

  if (requireServiceRole && supabaseUrl !== "https://iwbajhxrgyjferbkibkl.supabase.co") {
    throw new Error("Refusing image writes outside the expected Tee & Co production project");
  }

  if (requireServiceRole && !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for this mode.");
  }

  return createClient(supabaseUrl, requireServiceRole ? serviceRoleKey : key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isBase64ProductImage(value) {
  const image = String(value || "");
  return image.startsWith("data:image/") && image.includes(";base64,");
}

function isStorageProductImage(value) {
  const image = String(value || "");
  return image.startsWith("http") && image.includes("/storage/v1/object/public/product-images/");
}

function parseDataUri(value) {
  const image = String(value || "");
  const marker = ";base64,";
  const markerIndex = image.indexOf(marker);
  if (!image.startsWith("data:image/") || markerIndex < 0) return null;

  const contentType = image.slice("data:".length, markerIndex).toLowerCase();
  const base64Payload = image.slice(markerIndex + marker.length);
  const buffer = Buffer.from(base64Payload, "base64");

  return {
    contentType,
    base64Payload,
    buffer,
  };
}

function detectImageContentType(buffer) {
  if (!buffer || buffer.length < 4) return "";

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (buffer.length >= 8 && buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return "";
}

function extensionForContentType(contentType) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "bin";
}

function normalizePathSegment(value, fallback = "product") {
  const normalized = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function buildStoragePath(product, contentType, buffer) {
  const productId = normalizePathSegment(product.id || product.legacy_product_id, "product");
  const name = normalizePathSegment(product.name, "product-image").slice(0, 80);
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const extension = extensionForContentType(contentType);

  return [
    "products",
    productId,
    `migrated-${Date.now()}-${randomUUID()}-${hash}-${name}.${extension}`,
  ].join("/");
}

async function appendJsonLine(filePath, value) {
  const file = await fs.open(filePath, "a", 0o600);
  try { await file.writeFile(`${JSON.stringify(value)}\n`, "utf8"); await file.sync(); }
  finally { await file.close(); }
}

async function readJsonLines(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function buildOutputDir(args) {
  if (args.resumeDir) return args.resumeDir;
  if (args.outputDir) return args.outputDir;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(DEFAULT_OUTPUT_ROOT, `product-image-storage-migration-${timestamp}`);
}

async function fetchProducts(supabase, pageSize) {
  const products = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCTS_SELECT_FIELDS)
      .order("id")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    products.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return products;
}

function summarizeProducts(products) {
  const base64Products = products.filter((product) => isBase64ProductImage(product.image));
  const storageProducts = products.filter((product) => isStorageProductImage(product.image));
  const otherImageProducts = products.filter((product) => (
    product.image &&
    !isBase64ProductImage(product.image) &&
    !isStorageProductImage(product.image)
  ));

  return {
    totalProducts: products.length,
    base64Products: base64Products.length,
    storageProducts: storageProducts.length,
    otherImageProducts: otherImageProducts.length,
  };
}

async function dryRun(args) {
  const supabase = getSupabaseClient();
  const products = await fetchProducts(supabase, args.pageSize);
  const eligible = products.filter((product) => isBase64ProductImage(product.image));

  console.log(JSON.stringify({
    mode: "dry-run",
    ...summarizeProducts(products),
    batchSize: args.batchSize,
    wouldProcess: eligible.slice(0, args.batchSize).map((product) => {
      const parsed = parseDataUri(product.image);
      const detectedContentType = detectImageContentType(parsed?.buffer);
      return {
        id: product.id,
        name: product.name,
        category: product.category,
        declaredContentType: parsed?.contentType || "",
        detectedContentType,
        imageBytes: parsed?.buffer?.length || 0,
        validImage: Boolean(parsed?.buffer?.length && detectedContentType === parsed.contentType),
      };
    }),
  }, null, 2));
}

export async function executeMigration(args, dependencies = {}) {
  const supabase = dependencies.client || getSupabaseClient({ requireServiceRole: true });
  const fetchImpl = dependencies.fetch || fetch;
  await verifyLiveStorageReader(fetchImpl);
  // Probe the RPC with identical states: this call can never mutate an image.
  await atomicImageSwap(supabase, "00000000-0000-0000-0000-000000000000", imageSnapshot({}), imageSnapshot({}));
  const outputDir = buildOutputDir(args);
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
  const thumbnails = JSON.parse(await fs.readFile(args.thumbnailManifest, "utf8"));
  if (!Array.isArray(thumbnails)) throw new Error("Thumbnail manifest must be an array");
  const thumbnailsById = new Map(thumbnails.map((entry) => [entry.id, entry]));
  if (thumbnailsById.size !== thumbnails.length) throw new Error("Duplicate thumbnail product IDs");

  const rollbackFile = path.join(outputDir, "rollback.jsonl");
  const manifestFile = path.join(outputDir, "manifest.jsonl");
  const priorManifestRows = await readJsonLines(manifestFile);
  const completedIds = new Set(
    priorManifestRows
      .filter((entry) => entry.status === "migrated")
      .map((entry) => entry.productId)
  );

  const products = await fetchProducts(supabase, args.pageSize);
  const eligible = products
    .filter((product) => isBase64ProductImage(product.image))
    .filter((product) => !completedIds.has(product.id))
    .slice(0, args.batchSize);

  const summary = {
    mode: "execute",
    outputDir,
    rollbackFile,
    manifestFile,
    ...summarizeProducts(products),
    resumedCompletedIds: completedIds.size,
    selectedForBatch: eligible.length,
    migrated: 0,
    skipped: 0,
    failed: 0,
  };

  for (const product of eligible) {
    const startedAt = new Date().toISOString();
    const parsed = parseDataUri(product.image);
    const detectedContentType = detectImageContentType(parsed?.buffer);

    if (!parsed?.buffer?.length || !detectedContentType || detectedContentType !== parsed.contentType) {
      summary.skipped += 1;
      await appendJsonLine(manifestFile, {
        status: "skipped-invalid-image",
        productId: product.id,
        name: product.name,
        declaredContentType: parsed?.contentType || "",
        detectedContentType,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
      continue;
    }

    const storagePath = buildStoragePath(product, detectedContentType, parsed.buffer);
    const thumbnailRecord = thumbnailsById.get(product.id);
    if (!thumbnailRecord || thumbnailRecord.sha256_original !== sha256(parsed.buffer)) {
      throw new Error("Thumbnail preparation does not match the current original; no writes performed for this product");
    }
    const thumbnailBytes = await fs.readFile(thumbnailRecord.thumbnail);
    if (sha256(thumbnailBytes) !== thumbnailRecord.sha256_thumbnail || detectImageContentType(thumbnailBytes) !== "image/webp") {
      throw new Error("Thumbnail hash or format mismatch");
    }
    const thumbnailPath = `products/${normalizePathSegment(product.id)}/thumb-${sha256(thumbnailBytes)}.webp`;
    const publicUrl = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath).data.publicUrl;
    const thumbnailUrl = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(thumbnailPath).data.publicUrl;
    const replacement = imageSnapshot({ image: publicUrl, image_storage_path: storagePath,
      image_thumb_storage_path: thumbnailPath, image_content_type: detectedContentType,
      image_file_size: parsed.buffer.length, image_updated_at: new Date().toISOString() });
    const rollbackEntry = { version: 2, productId: product.id, name: product.name,
      previous: imageSnapshot(product), expectedAfter: replacement,
      originalSha256: sha256(parsed.buffer), thumbnailSha256: sha256(thumbnailBytes),
      migration: { storagePath, thumbnailPath, publicUrl, thumbnailUrl, startedAt } };

    try {
      await appendJsonLine(rollbackFile, rollbackEntry);

      const { error: uploadError } = await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(storagePath, parsed.buffer, {
          cacheControl: "31536000",
          contentType: detectedContentType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: thumbUploadError } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET)
        .upload(thumbnailPath, thumbnailBytes, { cacheControl: "31536000", contentType: "image/webp", upsert: false });
      // A previous interrupted run can leave the same immutable thumbnail.
      // Never overwrite it; exact public byte verification below is mandatory.
      if (thumbUploadError && String(thumbUploadError.statusCode) !== "409") throw thumbUploadError;
      await verifyPublicImage(publicUrl, parsed.buffer, detectedContentType, fetchImpl);
      await verifyPublicImage(thumbnailUrl, thumbnailBytes, "image/webp", fetchImpl);
      const status = await atomicImageSwap(supabase, product.id, rollbackEntry.previous, replacement);
      if (status === "conflict" || status === "missing") {
        summary.skipped += 1;
        await appendJsonLine(manifestFile, { status: "skipped-concurrent-change", productId: product.id, storagePath, thumbnailPath });
        continue;
      }
      const { data: verified, error: verifyError } = await supabase.from("products")
        .select("id,image,image_storage_path,image_thumb_storage_path,image_content_type,image_file_size,image_updated_at")
        .eq("id", product.id).single();
      if (verifyError || verified.image !== replacement.image || verified.image_thumb_storage_path !== thumbnailPath ||
          verified.image_storage_path !== storagePath || verified.image_content_type !== detectedContentType ||
          Number(verified.image_file_size) !== parsed.buffer.length ||
          Date.parse(verified.image_updated_at) !== Date.parse(replacement.image_updated_at)) {
        throw new Error("Post-update image verification failed; stop and use guarded rollback if needed");
      }

      summary.migrated += 1;
      await appendJsonLine(manifestFile, {
        status: "migrated",
        productId: product.id,
        name: product.name,
        publicUrl,
        thumbnailUrl,
        thumbnailPath,
        storagePath,
        contentType: detectedContentType,
        fileSize: parsed.buffer.length,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    } catch (error) {
      summary.failed += 1;
      await appendJsonLine(manifestFile, {
        status: "failed",
        productId: product.id,
        name: product.name,
        storagePath,
        message: error?.message || String(error),
        startedAt,
        finishedAt: new Date().toISOString(),
      });
      throw new Error("Migration stopped after failure; inspect manifest before resuming");
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

export async function rollbackMigration(args) {
  const supabase = getSupabaseClient({ requireServiceRole: true });
  const rollbackFile = args.rollbackFile ||
    (args.resumeDir ? path.join(args.resumeDir, "rollback.jsonl") : "");

  if (!rollbackFile) {
    throw new Error("--rollback-file or --resume-dir is required for rollback.");
  }

  const rollbackRows = await readJsonLines(rollbackFile);
  const selectedRows = rollbackRows.slice(0, args.batchSize);
  const summary = {
    mode: "rollback",
    rollbackFile,
    selectedForBatch: selectedRows.length,
    restored: 0,
    storageObjectsRemoved: 0,
    failed: 0,
  };

  for (const entry of selectedRows) {
    try {
      const status = await guardedRollback(supabase, entry);
      if (status === "conflict" || status === "missing") {
        summary.skipped = (summary.skipped || 0) + 1;
        continue;
      }
      summary.restored += 1;

    } catch (error) {
      summary.failed += 1;
      console.error(JSON.stringify({
        status: "rollback-failed",
        productId: entry.productId,
        name: entry.name,
        message: error?.message || String(error),
      }));
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed) throw new Error("Some rollback records failed; no unguarded updates attempted");
}

async function exportOriginals(args) {
  const products = (await fetchProducts(getSupabaseClient(), args.pageSize)).filter((row) => isBase64ProductImage(row.image));
  const outputDir = buildOutputDir(args);
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
  const records = [];
  for (const product of products) {
    const parsed = parseDataUri(product.image);
    if (detectImageContentType(parsed?.buffer) !== parsed?.contentType) throw new Error("Invalid original image");
    const source = path.resolve(outputDir, `${product.id}-${sha256(parsed.buffer)}.${extensionForContentType(parsed.contentType)}`);
    await fs.writeFile(source, parsed.buffer, { flag: "wx", mode: 0o600 });
    records.push({ id: product.id, source, sha256_original: sha256(parsed.buffer) });
  }
  await fs.writeFile(path.join(outputDir, "image-backup.json"), JSON.stringify(products.map((row) => ({ productId: row.id, previous: imageSnapshot(row), originalSha256: sha256(parseDataUri(row.image).buffer) })), null, 2), { flag: "wx", mode: 0o600 });
  await fs.writeFile(path.join(outputDir, "originals.json"), JSON.stringify(records, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ exported: records.length, outputDir }));
}

async function main() {
  await loadDotEnv();
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.mode === "export") {
    await exportOriginals(args);
  } else if (args.mode === "dry-run") {
    await dryRun(args);
  } else if (args.mode === "execute") {
    await executeMigration(args);
  } else if (args.mode === "rollback") {
    await rollbackMigration(args);
  } else {
    throw new Error(`Unsupported mode: ${args.mode}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
