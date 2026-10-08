// Legacy inline images can exceed 22 MB across the catalog. Keep them out of
// the metadata query and read a bounded number at a time until Storage migration.
export async function hydrateLegacyProductImages(client, products, onError = () => {}) {
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
  }
  return products.map((product) => images.has(product.id)
    ? { ...product, image: images.get(product.id) }
    : product);
}
