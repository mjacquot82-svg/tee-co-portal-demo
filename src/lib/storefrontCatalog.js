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
    status: product?.status || "",
    normalizedStatus: normalizeProductStatus(product?.status || "Active"),
    garment_library_item_id: product?.garment_library_item_id || null,
    hasName: Boolean(normalizeText(product?.name)),
    hasCategory: Boolean(normalizeText(product?.category)),
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
      console.info("[storefrontCatalog] Included storefront product", {
        product: fieldDiagnostics,
      });
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

export function buildStorefrontCategories(products = []) {
  const groupedCategories = new Map();

  getStorefrontProducts(products).forEach((product) => {
    const categoryName = normalizeText(product?.category) || "Catalog";
    const categoryId = normalizeCategorySlug(categoryName) || "catalog";
    const existingCategory = groupedCategories.get(categoryId);

    if (existingCategory) {
      existingCategory.products.push(product);
      if (!existingCategory.image && product?.image) {
        existingCategory.image = product.image;
      }
      return;
    }

    groupedCategories.set(categoryId, {
      id: categoryId,
      name: categoryName,
      image: normalizeText(product?.image),
      products: [product],
    });
  });

  return Array.from(groupedCategories.values())
    .map((category) => ({
      id: category.id,
      name: category.name,
      image: normalizeText(category.image),
      description: buildCategoryDescription(
        category.name,
        category.products.length
      ),
      products: category.products,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getStorefrontCategoryById(products = [], categoryId = "") {
  return buildStorefrontCategories(products).find(
    (category) => category.id === categoryId
  ) || null;
}

export function getStorefrontProductsByCategory(products = [], categoryId = "") {
  return getStorefrontCategoryById(products, categoryId)?.products || [];
}
