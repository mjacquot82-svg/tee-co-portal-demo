function normalizeId(value) {
  return String(value || "").trim();
}

function appendLinkedProduct(usageMap, garmentId, productId) {
  const normalizedGarmentId = normalizeId(garmentId);
  const normalizedProductId = normalizeId(productId);
  if (!normalizedGarmentId || !normalizedProductId) return;

  const currentUsage = usageMap.get(normalizedGarmentId) || {
    linkedProductCount: 0,
    linkedProductIds: [],
  };
  const linkedProductIds = Array.isArray(currentUsage.linkedProductIds)
    ? currentUsage.linkedProductIds
    : [];

  if (linkedProductIds.includes(normalizedProductId)) {
    return;
  }

  const nextLinkedProductIds = [...linkedProductIds, normalizedProductId];
  usageMap.set(normalizedGarmentId, {
    linkedProductCount: nextLinkedProductIds.length,
    linkedProductIds: nextLinkedProductIds,
  });
}

function buildGarmentIndexes(garments = []) {
  const byId = new Map();
  const byModelId = new Map();

  (Array.isArray(garments) ? garments : []).forEach((garment) => {
    const garmentId = normalizeId(garment?.id);
    const modelId = normalizeId(garment?.garment_model_lookup_id);

    if (garmentId) {
      byId.set(garmentId, garment);
    }

    if (modelId) {
      const existing = byModelId.get(modelId) || [];
      existing.push(garment);
      byModelId.set(modelId, existing);
    }
  });

  return { byId, byModelId };
}

export function getProductGarmentLibraryItemId(product = {}) {
  return (
    normalizeId(product?.garment_library_item_id) ||
    normalizeId(product?.garment_library_id) ||
    normalizeId(product?.selectedGarmentLibraryId) ||
    ""
  );
}

export function getProductGarmentModelLookupId(product = {}) {
  return normalizeId(product?.garment_model_lookup_id);
}

export function findLinkedGarmentLibraryItem(product = {}, garments = []) {
  const garmentLibraryItemId = getProductGarmentLibraryItemId(product);
  const { byId, byModelId } = buildGarmentIndexes(garments);

  if (garmentLibraryItemId && byId.has(garmentLibraryItemId)) {
    return byId.get(garmentLibraryItemId) || null;
  }

  const garmentModelLookupId = getProductGarmentModelLookupId(product);
  if (!garmentModelLookupId) return null;

  const matchedGarments = byModelId.get(garmentModelLookupId) || [];
  return matchedGarments[0] || null;
}

export function buildGarmentUsageMap(products = [], garments = []) {
  const usageMap = new Map();
  const { byId, byModelId } = buildGarmentIndexes(garments);

  (Array.isArray(products) ? products : []).forEach((product) => {
    const productId = normalizeId(product?.id);
    const garmentLibraryItemId = getProductGarmentLibraryItemId(product);

    if (garmentLibraryItemId && byId.has(garmentLibraryItemId)) {
      appendLinkedProduct(usageMap, garmentLibraryItemId, productId);
      return;
    }

    const garmentModelLookupId = getProductGarmentModelLookupId(product);
    if (!garmentModelLookupId) return;

    const matchedGarments = byModelId.get(garmentModelLookupId) || [];
    matchedGarments.forEach((garment) => {
      const garmentId = normalizeId(garment?.id);
      if (!garmentId) return;
      appendLinkedProduct(usageMap, garmentId, productId);
    });
  });

  return usageMap;
}
