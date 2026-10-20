// Orders must never carry inline (base64 data: URL) product/garment images.
// They bloat the orders row (one live order reached ~9.7 MB) and make every
// staff save slow enough to hit the database statement timeout.
//
// Product images belong in the public "product-images" Storage bucket. This
// module moves any inline product image found in an order payload into that
// bucket (content-addressed, so the same picture is stored once) and replaces
// it with its public URL. Customer artwork is NOT handled here: it is private
// and already lives in the "customer-artwork" bucket.

export const ORDER_IMAGES_BUCKET = "product-images";
export const ORDER_IMAGES_PREFIX = "order-images";

// Keys that hold a *catalog/garment* picture. Artwork keys are deliberately
// excluded so private customer files can never land in a public bucket.
export const ORDER_PRODUCT_IMAGE_KEYS = new Set([
  "product_image",
  "productImage",
  "garment_image",
  "garmentImage",
  "imageSrc",
  "image",
  "image_url",
  "image_medium_url",
  "image_thumb_url",
  "image_original_url",
]);

const DATA_IMAGE_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,/i;
const EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" };

export function isInlineImage(value) {
  return typeof value === "string" && DATA_IMAGE_PATTERN.test(value);
}

export function parseInlineImage(dataUrl) {
  const match = DATA_IMAGE_PATTERN.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1].toLowerCase();
  const base64 = dataUrl.slice(match[0].length);
  let bytes;
  if (typeof globalThis.Buffer !== "undefined") {
    bytes = new Uint8Array(globalThis.Buffer.from(base64, "base64"));
  } else {
    const binary = globalThis.atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  }
  return { contentType, bytes, extension: EXTENSIONS[contentType] || "bin" };
}

async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildOrderImageStoragePath(dataUrl) {
  const parsed = parseInlineImage(dataUrl);
  if (!parsed) return null;
  const hash = await sha256Hex(parsed.bytes);
  return { ...parsed, hash, path: `${ORDER_IMAGES_PREFIX}/${hash}.${parsed.extension}` };
}

// Visit every product-image key anywhere in the value.
export function collectInlineProductImages(value, found = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectInlineProductImages(entry, found));
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (ORDER_PRODUCT_IMAGE_KEYS.has(key) && isInlineImage(nested)) found.add(nested);
      else if (nested && typeof nested === "object") collectInlineProductImages(nested, found);
    }
  }
  return found;
}

export function replaceInlineProductImages(value, replacements) {
  if (Array.isArray(value)) return value.map((entry) => replaceInlineProductImages(entry, replacements));
  if (!value || typeof value !== "object") return value;
  const next = {};
  for (const [key, nested] of Object.entries(value)) {
    if (ORDER_PRODUCT_IMAGE_KEYS.has(key) && isInlineImage(nested)) {
      // Unknown inline image (upload failed or not allowed): drop it. Screens
      // fall back to the catalog product image via product_id.
      next[key] = replacements.get(nested) || "";
    } else {
      next[key] = nested && typeof nested === "object" ? replaceInlineProductImages(nested, replacements) : nested;
    }
  }
  return next;
}

// Upload each distinct inline image once and swap in its public URL.
// Never throws: a failed upload just drops the inline copy, so saving an
// order can't be blocked by Storage.
export async function externalizeOrderProductImages(order, client, { onError = () => {} } = {}) {
  const inlineImages = collectInlineProductImages(order);
  if (!inlineImages.size) return order;
  const replacements = new Map();
  for (const dataUrl of inlineImages) {
    try {
      if (!client?.storage) throw new Error("Storage client unavailable");
      const target = await buildOrderImageStoragePath(dataUrl);
      if (!target) continue;
      const bucket = client.storage.from(ORDER_IMAGES_BUCKET);
      const { error } = await bucket.upload(target.path, target.bytes, {
        contentType: target.contentType,
        cacheControl: "31536000",
        upsert: false,
      });
      // Content-addressed paths: "already exists" means the same bytes are there.
      if (error && !/exists|duplicate|409/i.test(`${error.message || ""} ${error.statusCode || ""}`)) throw error;
      const publicUrl = bucket.getPublicUrl(target.path)?.data?.publicUrl;
      if (publicUrl) replacements.set(dataUrl, publicUrl);
    } catch (error) {
      onError(error);
    }
  }
  return replaceInlineProductImages(order, replacements);
}
