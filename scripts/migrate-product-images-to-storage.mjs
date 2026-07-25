#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
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
    else if (arg === "--no-verify") args.verify = false;
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
Migrate existing base64 product images to Supabase Storage.

Default mode is read-only dry-run.

Usage:
  node scripts/migrate-product-images-to-storage.mjs --dry-run
  node scripts/migrate-product-images-to-storage.mjs --execute --batch-size 10
  node scripts/migrate-product-images-to-storage.mjs --execute --resume-dir migration-output/product-image-storage-migration-...
  node scripts/migrate-product-images-to-storage.mjs --rollback --rollback-file migration-output/.../rollback.jsonl

Options:
  --execute                  Upload and update products. Requires SUPABASE_SERVICE_ROLE_KEY.
  --dry-run                  Report eligible products without writing data. This is the default.
  --rollback                 Restore products.image and image metadata from a rollback JSONL file.
  --batch-size <n>           Maximum eligible products to process in this run. Default: ${DEFAULT_BATCH_SIZE}.
  --page-size <n>            Supabase read page size. Default: ${DEFAULT_PAGE_SIZE}.
  --output-dir <path>        Output directory for rollback and manifest files.
  --resume-dir <path>        Reuse an existing output directory and skip already migrated IDs.
  --rollback-file <path>     Rollback JSONL file. Defaults to <resume-dir>/rollback.jsonl.
  --rollback-remove-storage  During rollback, also remove Storage objects recorded in the manifest.
  --no-verify                Skip post-update public URL and row verification.

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
  const key = serviceRoleKey || publishableKey;

  if (!supabaseUrl || !key) {
    throw new Error("Missing Supabase URL/key environment variables.");
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
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
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

async function executeMigration(args) {
  const supabase = getSupabaseClient({ requireServiceRole: true });
  const outputDir = buildOutputDir(args);
  await fs.mkdir(outputDir, { recursive: true });

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
    const rollbackEntry = {
      productId: product.id,
      legacyProductId: product.legacy_product_id,
      name: product.name,
      previous: {
        image: product.image,
        image_storage_path: product.image_storage_path,
        image_content_type: product.image_content_type,
        image_file_size: product.image_file_size,
        image_updated_at: product.image_updated_at,
      },
      migration: {
        storagePath,
        contentType: detectedContentType,
        fileSize: parsed.buffer.length,
        startedAt,
      },
    };

    try {
      const { data: currentProduct, error: currentError } = await supabase
        .from("products")
        .select("id,image")
        .eq("id", product.id)
        .maybeSingle();

      if (currentError) throw currentError;
      if (!currentProduct || currentProduct.image !== product.image) {
        summary.skipped += 1;
        await appendJsonLine(manifestFile, {
          status: "skipped-concurrent-change",
          productId: product.id,
          name: product.name,
          storagePath,
          startedAt,
          finishedAt: new Date().toISOString(),
        });
        continue;
      }

      await appendJsonLine(rollbackFile, rollbackEntry);

      const { error: uploadError } = await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(storagePath, parsed.buffer, {
          cacheControl: "31536000",
          contentType: detectedContentType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .getPublicUrl(storagePath);
      const publicUrl = publicUrlData?.publicUrl || "";
      if (!publicUrl) throw new Error("Unable to generate public URL after upload.");

      const imageUpdatedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("products")
        .update({
          image: publicUrl,
          image_storage_path: storagePath,
          image_content_type: detectedContentType,
          image_file_size: parsed.buffer.length,
          image_updated_at: imageUpdatedAt,
        })
        .eq("id", product.id);

      if (updateError) throw updateError;

      if (args.verify) {
        const [publicResponse, productResult] = await Promise.all([
          fetch(publicUrl),
          supabase
            .from("products")
            .select("id,image,image_storage_path,image_content_type,image_file_size,image_updated_at")
            .eq("id", product.id)
            .maybeSingle(),
        ]);

        if (!publicResponse.ok) {
          throw new Error(`Public image URL verification failed: ${publicResponse.status}`);
        }

        if (productResult.error) throw productResult.error;
        if (
          productResult.data?.image !== publicUrl ||
          productResult.data?.image_storage_path !== storagePath ||
          productResult.data?.image_content_type !== detectedContentType ||
          Number(productResult.data?.image_file_size) !== parsed.buffer.length ||
          !productResult.data?.image_updated_at
        ) {
          throw new Error("Post-update product row verification failed.");
        }
      }

      summary.migrated += 1;
      await appendJsonLine(manifestFile, {
        status: "migrated",
        productId: product.id,
        name: product.name,
        publicUrl,
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
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

async function rollbackMigration(args) {
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
      const { error } = await supabase
        .from("products")
        .update({
          image: entry.previous.image,
          image_storage_path: entry.previous.image_storage_path,
          image_content_type: entry.previous.image_content_type,
          image_file_size: entry.previous.image_file_size,
          image_updated_at: entry.previous.image_updated_at,
        })
        .eq("id", entry.productId);

      if (error) throw error;
      summary.restored += 1;

      if (args.rollbackRemoveStorage && entry.migration?.storagePath) {
        const { error: removeError } = await supabase.storage
          .from(PRODUCT_IMAGES_BUCKET)
          .remove([entry.migration.storagePath]);
        if (removeError) throw removeError;
        summary.storageObjectsRemoved += 1;
      }
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
}

async function main() {
  await loadDotEnv();
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.mode === "dry-run") {
    await dryRun(args);
  } else if (args.mode === "execute") {
    await executeMigration(args);
  } else if (args.mode === "rollback") {
    await rollbackMigration(args);
  } else {
    throw new Error(`Unsupported mode: ${args.mode}`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
