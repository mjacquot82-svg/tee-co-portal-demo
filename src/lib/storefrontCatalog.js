function normalizeText(value) {
  return String(value || "").trim();
}

const INTERNAL_STOREFRONT_LABELS = new Set([
  "manual",
  "manual product",
  "apparel product",
  "garment-linked",
  "garment linked",
  "catalog",
  "featured",
]);

const CATEGORY_DESCRIPTOR_OVERRIDES = {
  accessories: "Finishing pieces for gifting, events, and easy add-ons.",
  apparel: "Everyday staples built for teams, brands, and custom drops.",
  candles: "Gift-ready scents for seasonal launches and curated sets.",
  clearance: "Limited-run picks and end-of-season favorites.",
  drinkware: "Mugs, tumblers, and easy add-on favorites.",
  hats: "Caps and headwear ready for crews, clubs, and merch tables.",
};

function getCharacteristicCount(product = {}) {
  return Array.isArray(product?.characteristics) ? product.characteristics.length : 0;
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
    storefront_category: normalizeText(product?.storefront_category),
    status: product?.status || "",
    normalizedStatus: normalizeProductStatus(product?.status || "Active"),
    garment_library_item_id: product?.garment_library_item_id || null,
    hasName: Boolean(normalizeText(product?.name)),
    hasCategory: Boolean(normalizeText(product?.category)),
    hasStorefrontCategory: Boolean(normalizeText(product?.storefront_category)),
    hasStatus: Boolean(normalizeText(product?.status)),
    hasImage: Boolean(normalizeText(product?.image)),
    hasPrice: Number.isFinite(Number(resolvedPrice)) && Number(resolvedPrice) > 0,
    hasCharacteristics: getCharacteristicCount(product) > 0,
    characteristicCount: getCharacteristicCount(product),
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
      storefront_category: normalizeText(product?.storefront_category),
      status: product?.status || "",
    })),
    excludedProducts,
  });

  return includedProducts;
}

export function getFeaturedStorefrontProducts(products = [], limit = null) {
  const featuredProducts = getStorefrontProducts(products).filter((product) => product?.is_featured);

  if (!Number.isFinite(limit) || limit <= 0) {
    return featuredProducts;
  }

  return featuredProducts.slice(0, limit);
}

export function getHeroStorefrontProduct(products = []) {
  return (
    getStorefrontProducts(products).find((product) => product?.is_hero_feature) || null
  );
}

export function getStorefrontProductImage(product) {
  return normalizeText(product?.image);
}

function isCustomerFacingStorefrontLabel(value) {
  const normalizedValue = normalizeText(value).toLowerCase();
  return Boolean(normalizedValue) && !INTERNAL_STOREFRONT_LABELS.has(normalizedValue);
}

function getCategoryDescriptor(categoryName, productCount) {
  const normalizedKey = normalizeCategorySlug(categoryName);
  if (CATEGORY_DESCRIPTOR_OVERRIDES[normalizedKey]) {
    return CATEGORY_DESCRIPTOR_OVERRIDES[normalizedKey];
  }
  if (productCount <= 1) {
    return "A curated starting point for custom merch and easy browsing.";
  }
  return `A curated selection of ${productCount} products to browse in one place.`;
}

function formatProductCountLabel(productCount) {
  if (productCount === 1) return "1 product";
  return `${productCount} products`;
}

function buildFallbackStorefrontCategory() {
  return {
    id: "uncategorized",
    lookupId: "",
    name: "Uncategorized",
    active: true,
  };
}

function sortStorefrontCategories(leftCategory, rightCategory) {
  const leftUncategorized = normalizeCategorySlug(leftCategory?.name) === "uncategorized";
  const rightUncategorized = normalizeCategorySlug(rightCategory?.name) === "uncategorized";

  if (leftUncategorized && !rightUncategorized) return 1;
  if (!leftUncategorized && rightUncategorized) return -1;

  return String(leftCategory?.name || "").localeCompare(String(rightCategory?.name || ""));
}

function buildStorefrontCategoryRecord(category = {}) {
  const rawName = normalizeText(category?.name);
  const fallbackName = normalizeText(category?.fallbackName);
  const name = isCustomerFacingStorefrontLabel(rawName)
    ? rawName
    : isCustomerFacingStorefrontLabel(fallbackName)
      ? fallbackName
      : "";
  const lookupId = normalizeText(category?.lookupId ?? category?.id);
  const id = normalizeCategorySlug(category?.slug || name || lookupId);

  if (!name || !id) {
    return null;
  }

  return {
    id,
    lookupId,
    name,
    active: category?.active !== false,
  };
}

function mergeStorefrontCategoryRecord(existingCategory, nextCategory) {
  if (!existingCategory) {
    return {
      ...nextCategory,
    };
  }

  return {
    ...existingCategory,
    ...nextCategory,
    lookupId: existingCategory.lookupId || nextCategory.lookupId || "",
    name: existingCategory.name || nextCategory.name || "Catalog",
    active:
      existingCategory.active !== false &&
      nextCategory.active !== false,
  };
}

function buildStorefrontProductCategoryRecord(product = {}) {
  const lookupId = normalizeText(product?.storefront_category_lookup_id);
  const name = normalizeText(product?.storefront_category);
  if (!lookupId && !name) return null;
  if (name && !isCustomerFacingStorefrontLabel(name)) return null;

  return buildStorefrontCategoryRecord({
    id: lookupId || name,
    lookupId,
    name: name || "Catalog",
    active: true,
  });
}

function buildProductFallbackCategoryRecord(product = {}) {
  const lookupId = normalizeText(product?.category_lookup_id);
  const name = normalizeText(product?.category);
  if (!lookupId && !name) return null;
  if (name && !isCustomerFacingStorefrontLabel(name)) return null;

  return buildStorefrontCategoryRecord({
    id: lookupId || name,
    lookupId,
    name,
    active: true,
  });
}

function buildStorefrontCategoryRegistryMaps(products = [], storefrontCategories = []) {
  const categoriesById = new Map();
  const categoriesByLookupId = new Map();
  const categoriesByName = new Map();

  const registerCategory = (category) => {
    const normalizedCategory = buildStorefrontCategoryRecord(category);
    if (!normalizedCategory) return;
    const existingCategory =
      categoriesByLookupId.get(normalizedCategory.lookupId) ||
      categoriesById.get(normalizedCategory.id) ||
      categoriesByName.get(normalizeText(normalizedCategory.name).toLowerCase()) ||
      null;
    const mergedCategory = mergeStorefrontCategoryRecord(existingCategory, normalizedCategory);

    categoriesById.set(mergedCategory.id, mergedCategory);
    if (mergedCategory.lookupId) {
      categoriesByLookupId.set(mergedCategory.lookupId, mergedCategory);
    }

    const normalizedName = normalizeText(mergedCategory.name).toLowerCase();
    if (normalizedName) {
      categoriesByName.set(normalizedName, mergedCategory);
    }
  };

  (Array.isArray(storefrontCategories) ? storefrontCategories : [])
    .filter((category) => category?.active !== false)
    .forEach(registerCategory);

  (Array.isArray(products) ? products : [])
    .map((product) => buildStorefrontProductCategoryRecord(product))
    .filter(Boolean)
    .forEach(registerCategory);

  (Array.isArray(products) ? products : [])
    .map((product) => buildProductFallbackCategoryRecord(product))
    .filter(Boolean)
    .forEach(registerCategory);

  return {
    categoriesById,
    categoriesByLookupId,
    categoriesByName,
  };
}

function resolveProductStorefrontCategory(product, registry) {
  const storefrontLookupId = normalizeText(product?.storefront_category_lookup_id);
  const explicitStorefrontName = normalizeText(product?.storefront_category);
  const fallbackCategoryLookupId = normalizeText(product?.category_lookup_id);
  const fallbackCategoryName = normalizeText(product?.category);

  if (storefrontLookupId && registry.categoriesByLookupId.has(storefrontLookupId)) {
    return registry.categoriesByLookupId.get(storefrontLookupId);
  }

  const normalizedExplicitName = explicitStorefrontName.toLowerCase();
  if (normalizedExplicitName && registry.categoriesByName.has(normalizedExplicitName)) {
    return registry.categoriesByName.get(normalizedExplicitName);
  }

  if (fallbackCategoryLookupId && registry.categoriesByLookupId.has(fallbackCategoryLookupId)) {
    return registry.categoriesByLookupId.get(fallbackCategoryLookupId);
  }

  const normalizedFallbackName = fallbackCategoryName.toLowerCase();
  if (normalizedFallbackName && registry.categoriesByName.has(normalizedFallbackName)) {
    return registry.categoriesByName.get(normalizedFallbackName);
  }

  return buildProductFallbackCategoryRecord(product) || buildFallbackStorefrontCategory();
}

export function buildStorefrontCategoryRegistry(products = [], storefrontCategories = []) {
  const registry = buildStorefrontCategoryRegistryMaps(products, storefrontCategories);

  return Array.from(registry.categoriesById.values()).sort(sortStorefrontCategories);
}

export function buildStorefrontCategorySelectionValue(category = {}) {
  return normalizeText(category?.lookupId ?? category?.id) || `slug:${normalizeText(category?.id)}`;
}

export function findStorefrontCategoryBySelectionValue(categories = [], value = "") {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) return null;

  return (
    (Array.isArray(categories) ? categories : []).find(
      (category) => buildStorefrontCategorySelectionValue(category) === normalizedValue
    ) || null
  );
}

export function resolveStorefrontCategoryAssignment(product, storefrontCategories = []) {
  const resolvedCategory = resolveProductStorefrontCategory(
    product,
    buildStorefrontCategoryRegistryMaps([product], storefrontCategories)
  );
  const explicitStorefrontName = normalizeText(product?.storefront_category);
  const storefrontLookupId = normalizeText(product?.storefront_category_lookup_id);

  return {
    ...resolvedCategory,
    hasAssignedStorefrontCategory: Boolean(storefrontLookupId || explicitStorefrontName),
    hasResolvedCategory: Boolean(normalizeText(resolvedCategory?.name)),
  };
}

export function getStorefrontProductCategoryLabel(product, storefrontCategories = []) {
  return resolveStorefrontCategoryAssignment(product, storefrontCategories).name;
}

export function buildStorefrontCategories(products = [], storefrontCategories = []) {
  const registry = buildStorefrontCategoryRegistryMaps(products, storefrontCategories);
  const groupedCategories = new Map();

  getStorefrontProducts(products).forEach((product) => {
    const resolvedCategory = resolveProductStorefrontCategory(product, registry);
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
      description: getCategoryDescriptor(category.name, category.products.length),
      products: category.products,
      productCount: category.products.length,
      productCountLabel: formatProductCountLabel(category.products.length),
    }))
    .sort(sortStorefrontCategories);
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
