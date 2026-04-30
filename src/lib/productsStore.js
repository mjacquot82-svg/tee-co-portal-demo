const STORAGE_KEY = "teeCoProducts";

export const defaultProducts = [
  {
    id: "product-hoodie",
    name: "Pullover Hoodie",
    category: "Hoodie / Sweater",
    status: "Active",
    image: "",
    colors: ["Black", "Navy", "Gray", "White"],
    sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
    placements: ["Left Chest", "Front Center", "Back Center", "Sleeve"],
    decoration_types: ["Embroidery", "Screen Print", "DTF Transfer"],
    notes: "General hoodie option. Add specific brands later when known.",
  },
  {
    id: "product-hat",
    name: "Hat",
    category: "Hat",
    status: "Active",
    image: "",
    colors: ["Black", "Navy", "Gray", "White"],
    sizes: ["OSFA"],
    placements: ["Hat Front Panel", "Hat Side", "Hat Back"],
    decoration_types: ["Embroidery", "Patch"],
    notes: "Use for caps, snapbacks, and similar headwear.",
  },
  {
    id: "product-tee",
    name: "T-Shirt",
    category: "Shirt",
    status: "Active",
    image: "",
    colors: ["Black", "White", "Gray", "Navy"],
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    placements: ["Left Chest", "Front Center", "Back Center", "Sleeve"],
    decoration_types: ["Screen Print", "DTF Transfer", "Embroidery"],
    notes: "Generic shirt category until exact brand catalog is added.",
  },
];

function normalizeList(value) {
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getStoredProducts() {
  if (typeof window === "undefined") return defaultProducts;

  try {
    const rawProducts = window.localStorage.getItem(STORAGE_KEY);
    return rawProducts ? JSON.parse(rawProducts) : defaultProducts;
  } catch (error) {
    console.error("Unable to read Tee & Co products", error);
    return defaultProducts;
  }
}

export function saveStoredProducts(products) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

export function createStoredProduct(productInput) {
  const products = getStoredProducts();
  const product = {
    ...productInput,
    id: `product-${Date.now()}`,
    status: productInput.status || "Active",
    colors: normalizeList(productInput.colors),
    sizes: normalizeList(productInput.sizes),
    placements: normalizeList(productInput.placements),
    decoration_types: normalizeList(productInput.decoration_types),
  };

  const nextProducts = [product, ...products];
  saveStoredProducts(nextProducts);
  return product;
}

export function updateStoredProduct(productId, updates) {
  const products = getStoredProducts();
  const nextProducts = products.map((product) =>
    product.id === productId
      ? {
          ...product,
          ...updates,
          colors: updates.colors ? normalizeList(updates.colors) : product.colors,
          sizes: updates.sizes ? normalizeList(updates.sizes) : product.sizes,
          placements: updates.placements ? normalizeList(updates.placements) : product.placements,
          decoration_types: updates.decoration_types
            ? normalizeList(updates.decoration_types)
            : product.decoration_types,
        }
      : product
  );

  saveStoredProducts(nextProducts);
  return nextProducts.find((product) => product.id === productId);
}

export function deleteStoredProduct(productId) {
  const nextProducts = getStoredProducts().filter((product) => product.id !== productId);
  saveStoredProducts(nextProducts);
}
