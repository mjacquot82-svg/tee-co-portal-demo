// Resolve immutable Storage paths without downloading inline database images.
export function resolveStorageProductImages(client, product) {
  if (!client) return product;
  const urlFor = (path) => path ? client.storage.from("product-images").getPublicUrl(path).data.publicUrl : "";
  const original = urlFor(product.image_storage_path);
  const thumbnail = urlFor(product.image_thumb_storage_path);
  return {
    ...product,
    ...(original ? { image: original, image_original_url: original, image_medium_url: original } : {}),
    ...(thumbnail ? { image_thumb_url: thumbnail } : {}),
  };
}

// Legacy inline images can exceed 22 MB across the catalog. Keep them out of
// the metadata query and read a bounded number at a time until Storage migration.
export async function hydrateLegacyProductImages(client, products, onError = () => {}, onBatch = () => {}) {
  const missing = products.filter((product) => product.id && !product.image && !product.image_storage_path);
  const images = new Map();
  const batches = [];
  for (let offset = 0; offset < missing.length; offset += 4) {
    batches.push(missing.slice(offset, offset + 4).map((product) => product.id));
  }
  // Bound both response size and concurrent database requests.
  for (let offset = 0; offset < batches.length; offset += 3) {
    await Promise.all(batches.slice(offset, offset + 3).map(async (ids) => {
      try {
        const { data, error } = await client.from("products").select("id, image").in("id", ids);
        if (error) throw error;
        for (const row of data || []) images.set(row.id, row.image || "");
      } catch (error) {
        // An image failure must not make garments or ordering unavailable.
        onError(error, ids);
      }
    }));
    // Release images as each bounded group completes, rather than waiting
    // for every legacy image in the catalogue.
    onBatch(products.map((product) => images.has(product.id)
      ? { ...product, image: images.get(product.id) }
      : product));
  }
  return products.map((product) => images.has(product.id)
    ? { ...product, image: images.get(product.id) }
    : product);
}
