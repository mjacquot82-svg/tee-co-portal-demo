function normalizeText(value) {
  return String(value || "").trim();
}

function buildCatalogFieldDiagnostics(product = {}) {
  const resolvedPrice =
    product?.unit_price ??
    product?.base_garment_price ??
    product?.calculated_base_price ??
    product?.price ??
    null;

  return {
    id: product?.id || null,
    name: normalizeText(product?.name),
    category: normalizeText(product?.category),
    storefront_category: normalizeText(product?.storefront_category || product?.category),
    status: product?.status || "",
    normalizedStatus: normalizeProductStatus(product?.status || "Active"),
    garment_library_item_id: product?.garment_library_item_id || null,
    hasName: Boolean(normalizeText(product?.name)),
    hasCategory: Boolean(normalizeText(product?.category)),
    hasStorefrontCategory: Boolean(
      normalizeText(product?.storefront_category || product?.category)
    ),
    hasStatus: Boolean(normalizeText(product?.status)),
    hasImage: Boolean(normalizeText(product?.image)),
    hasPrice: Number.isFinite(Number(resolvedPrice)) && Number(resolvedPrice) > 0,
    hasVariants: Array.isArray(product?.colors) ? product.colors.length > 0 : false,
    hasSizes: Array.isArray(product?.sizes) ? product.sizes.length > 0 : false,
    hasGarmentReference: Boolean(product?.garment_library_item_id),
    resolvedPrice,
  };
}

export function normalizeCategorySlug(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeProductStatus(value) {
  return normalizeText(value).toLowerCase();
}

export function getStorefrontProducts(products = []) {
  const sourceProducts = Array.isArray(products) ? products : [];
  const includedProducts = [];
  const excludedProducts = [];

  sourceProducts.forEach((product) => {
    const normalizedStatus = normalizeProductStatus(product?.status || "Active");
    const include = normalizedStatus === "active";
    const fieldDiagnostics = buildCatalogFieldDiagnostics(product);

    if (include) {
      includedProducts.push(product);
      return;
    }

    excludedProducts.push({
      ...fieldDiagnostics,
      exclusionReason: normalizedStatus ? "inactive-status" : "missing-status",
    });
  });

  console.info("[storefrontCatalog] Storefront product filter results", {
    sourceCount: sourceProducts.length,
    includedCount: includedProducts.length,
    excludedCount: excludedProducts.length,
    includedProducts: includedProducts.map((product) => ({
      id: product?.id || null,
      name: normalizeText(product?.name),
      storefront_category: normalizeText(product?.storefront_category || product?.category),
      status: product?.status || "",
    })),
    excludedProducts,
  });

  return includedProducts;
}

export function getStorefrontProductImage(product) {
  return normalizeText(product?.image);
}

function buildCategoryDescription(categoryName, productCount) {
  if (!categoryName) return "Browse available products";
  if (productCount === 1) return "1 product available";
  return `${productCount} products available`;
}

function buildStorefrontCategoryRecord(category = {}) {
  const name = normalizeText(category?.name);
  const id =
    normalizeCategorySlug(category?.slug || category?.id || category?.name) || "catalog";

  return {
    id,
    lookupId: category?.id || "",
    name: name || "Catalog",
    active: category?.active !== false,
  };
}

function resolveProductStorefrontCategory(product, storefrontCategoryMap) {
  const storefrontLookupId = normalizeText(product?.storefront_category_lookup_id);
  const explicitStorefrontName = normalizeText(product?.storefront_category);

  if (storefrontLookupId && storefrontCategoryMap.has(storefrontLookupId)) {
    return storefrontCategoryMap.get(storefrontLookupId);
  }

  const normalizedExplicitName = explicitStorefrontName.toLowerCase();
  if (normalizedExplicitName) {
    for (const category of storefrontCategoryMap.values()) {
      if (normalizeText(category.name).toLowerCase() === normalizedExplicitName) {
        return category;
      }
    }
  }

  return buildStorefrontCategoryRecord({
    id: normalizeCategorySlug(explicitStorefrontName || product?.category || "catalog"),
    name: explicitStorefrontName || product?.category || "Catalog",
    active: true,
  });
}

export function resolveStorefrontCategoryAssignment(product, storefrontCategories = []) {
  const categoryMap = new Map(
    (Array.isArray(storefrontCategories) ? storefrontCategories : [])
      .map(buildStorefrontCategoryRecord)
      .filter((category) => category.active)
      .map((category) => [category.lookupId || category.id, category])
  );
  const resolvedCategory = resolveProductStorefrontCategory(product, categoryMap);
  const explicitStorefrontName = normalizeText(product?.storefront_category);
  const storefrontLookupId = normalizeText(product?.storefront_category_lookup_id);

  return {
    ...resolvedCategory,
    hasAssignedStorefrontCategory: Boolean(storefrontLookupId || explicitStorefrontName),
  };
}

export function buildStorefrontCategories(products = [], storefrontCategories = []) {
  const groupedCategories = new Map();

  getStorefrontProducts(products).forEach((product) => {
    const resolvedCategory = resolveStorefrontCategoryAssignment(product, storefrontCategories);
    const categoryId = resolvedCategory.id || "catalog";
    const existingCategory = groupedCategories.get(categoryId);

    if (existingCategory) {
      existingCategory.products.push(product);
      if (!existingCategory.image && product?.image) {
        existingCategory.image = product.image;
      }
      return;
    }

    groupedCategories.set(categoryId, {
      ...resolvedCategory,
      image: normalizeText(product?.image),
      products: [product],
    });
  });

  return Array.from(groupedCategories.values())
    .map((category) => ({
      id: category.id,
      lookupId: category.lookupId || "",
      name: category.name,
      image: normalizeText(category.image),
      description: buildCategoryDescription(category.name, category.products.length),
      products: category.products,
      productCount: category.products.length,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getStorefrontCategoryById(
  products = [],
  categoryId = "",
  storefrontCategories = []
) {
  return (
    buildStorefrontCategories(products, storefrontCategories).find(
      (category) => category.id === categoryId
    ) || null
  );
}

export function getStorefrontProductsByCategory(
  products = [],
  categoryId = "",
  storefrontCategories = []
) {
  return getStorefrontCategoryById(products, categoryId, storefrontCategories)?.products || [];
}
