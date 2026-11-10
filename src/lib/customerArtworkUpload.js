// Read the file before starting a network upload. Browser-backed Files restored
// after navigation can still have a name while their contents are unavailable.
export const ARTWORK_RESELECT_MESSAGE =
  "We couldn't read your artwork file. Please return to the artwork selection, choose the file again, and resubmit your order.";

export async function readArtworkBytes(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) {
    throw new Error(ARTWORK_RESELECT_MESSAGE);
  }
  try {
    const buffer = typeof file.arrayBuffer === "function"
      ? await file.arrayBuffer()
      : await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.onabort = () => reject(new Error("Artwork read cancelled"));
          reader.readAsArrayBuffer(file);
        });
    const bytes = new Uint8Array(buffer);
    if (!bytes.byteLength || bytes.byteLength !== file.size) throw new Error("Incomplete artwork");
    return bytes;
  } catch {
    throw new Error(ARTWORK_RESELECT_MESSAGE);
  }
}

export async function uploadArtworkFile(bucket, path, file, fileType = "") {
  const bytes = await readArtworkBytes(file);
  // Send verified binary bytes instead of relying on a restored File's multipart
  // serialization. Keep the same private bucket, permissions and no-overwrite rule.
  const { error } = await bucket.upload(path, bytes, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || fileType || "application/octet-stream",
  });
  if (error) {
    throw new Error(/no content provided/i.test(error.message || "")
      ? ARTWORK_RESELECT_MESSAGE
      : error.message || "Unable to upload artwork file.");
  }
}

// Replacing artwork leaves the old draft in the shared library. Only artwork
// still selected on an order line belongs in this submission; a stale file
// must not prevent a customer from recovering by selecting a fresh copy.
export function selectOrderArtwork(artworkLibrary, lineItems) {
  const selectedIds = new Set(lineItems.flatMap((item) => [
    item.artwork_id,
    ...(item.placements || []).map((placement) => placement.artwork_id),
  ]).filter(Boolean));
  // Older saved requests selected artwork by name, or only at library level.
  // Keep those valid uploads rather than silently submitting without artwork.
  if (!selectedIds.size) return artworkLibrary;
  const selectedNames = new Set(lineItems
    .filter((item) => !item.artwork_id && item.artwork_name)
    .map((item) => item.artwork_name));
  return artworkLibrary.filter((asset) => selectedIds.has(asset.id) ||
    [asset.displayName, asset.display_name, asset.originalFilename, asset.file_name, asset.name]
      .some((name) => name && selectedNames.has(name)));
}
