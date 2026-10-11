import { createHash } from "node:crypto";
export const IMAGE_FIELDS = ["image", "image_storage_path", "image_thumb_storage_path", "image_content_type", "image_file_size", "image_updated_at"];
export const imageSnapshot = (row) => Object.fromEntries(IMAGE_FIELDS.map((key) => [key, row[key] ?? null]));
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function atomicImageSwap(client, productId, expected, replacement) {
  const { data, error } = await client.rpc("compare_and_swap_product_images", {
    p_product_id: productId, p_expected: imageSnapshot(expected), p_replacement: imageSnapshot(replacement),
  });
  if (error) throw new Error(`Atomic image swap failed (${error.code || "unknown"}); no automatic retry`);
  if (!["changed", "already-applied", "conflict", "missing"].includes(data?.status)) {
    throw new Error("Atomic image swap returned an unknown result; no automatic retry");
  }
  return data.status;
}
export async function verifyPublicImage(url, bytes, contentType, fetchImpl = fetch) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Image verification returned HTTP ${response.status}`);
  if (response.headers.get("content-type")?.split(";")[0].trim() !== contentType) {
    throw new Error("Public image MIME type mismatch");
  }
  const maxAge = response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1];
  if (!maxAge || Number(maxAge) < 86400) throw new Error("Public image is not long-cacheable");
  if (sha256(Buffer.from(await response.arrayBuffer())) !== sha256(bytes)) {
    throw new Error("Public image bytes do not match the uploaded original/thumbnail");
  }
}
export function validateRollbackEntry(entry) {
  if (entry.version !== 2 || !entry.productId || !entry.previous || !entry.expectedAfter) {
    throw new Error("Rollback needs a version 2 guarded record; legacy unguarded records are refused");
  }
  if (IMAGE_FIELDS.some((key) => !(key in entry.previous) || !(key in entry.expectedAfter))) {
    throw new Error("Incomplete rollback image snapshot");
  }
  const source = String(entry.previous.image || "").split(";base64,")[1];
  if (!source || sha256(Buffer.from(source, "base64")) !== entry.originalSha256) {
    throw new Error("Rollback original hash mismatch");
  }
}
export async function guardedRollback(client, entry) {
  validateRollbackEntry(entry);
  return atomicImageSwap(client, entry.productId, entry.expectedAfter, entry.previous);
}

export async function verifyLiveStorageReader(fetchImpl = fetch) {
  const response = await fetchImpl("https://teeandco.jdsstudio.ca/", {
    cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok || !(await response.text()).includes('<meta name="tee-co-storage-image-reader" content="2"')) {
    throw new Error("Live storefront does not yet support Storage image metadata; deploy and verify the reader before migration");
  }
}
