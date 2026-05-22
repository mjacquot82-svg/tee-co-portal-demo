function normalizeText(value) {
  return String(value || "").trim();
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
  return (Array.isArray(products) ? products : []).filter(
    (product) => normalizeProductStatus(product?.status || "Active") === "active"
  );
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
