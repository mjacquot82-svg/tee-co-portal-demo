import { useMemo, useRef, useState } from "react";
import "./Products.css";
import ProductPricingFields from "../components/ProductPricingFields";
import { PRODUCTION_TYPES } from "../constants/productionTypes";
import {
  buildPlacementConfig,
  createStoredProduct,
  deleteStoredProduct,
  getProductPlacementConfig,
  useStoredProducts,
  updateStoredProduct,
} from "../lib/productsStore";

const fieldStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "15px",
  width: "100%",
  boxSizing: "border-box",
  background: "#ffffff",
};

const labelStyle = {
  display: "grid",
  gap: "8px",
  fontWeight: 700,
  color: "#292524",
};

function PencilIcon({ color = "#0f172a", size = 18 }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L7 21l-4 1 1-4Z" />
    </svg>
  );
}

const emptyProduct = {
  name: "",
  category: "T-Shirt",
  product_type: "",
  brand_model: "",
  image: "",
  cost_price: "0",
  markup_percentage: "0",
  status: "Active",
  colors: "Black, White",
  sizes: "S, M, L, XL",
  placementsText: "Left Chest, Full Front, Full Back",
  placementPriceMap: {},
  production_methods: ["Screen Print"],
  production_method_prices: {},
  notes: "",
};

function formatMoney(value, fallback = "Not set") {
  if (value === null || value === undefined || value === "") return fallback;

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return fallback;

  return `$${parsedValue.toFixed(2)}`;
}

function parseOptionalPrice(value) {
  if (value === null || value === undefined || value === "") return null;

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return null;

  return Number(parsedValue.toFixed(2));
}

function formatPercent(value, fallback = "Not set") {
  if (value === null || value === undefined || value === "") return fallback;

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return fallback;

  return `${parsedValue.toFixed(0)}%`;
}

function normalizeListInput(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildPlacementPriceMap(placements, existing = {}) {
  return placements.reduce((accumulator, placement) => {
    accumulator[placement] =
      existing?.[placement] === null || existing?.[placement] === undefined
        ? ""
        : String(existing[placement]);
    return accumulator;
  }, {});
}

function buildMethodPriceMap(methods, existing = {}) {
  return methods.reduce((accumulator, method) => {
    accumulator[method] =
      existing?.[method] === null || existing?.[method] === undefined
        ? ""
        : String(existing[method]);
    return accumulator;
  }, {});
}

function buildFormFromProduct(product) {
  const safeProduct = product && typeof product === "object" ? product : {};
  const placements = getProductPlacementConfig(safeProduct).map(
    (placement) => placement.label
  );
  const productionMethods = safeProduct?.production_methods?.length
    ? safeProduct.production_methods
    : safeProduct?.decoration_types?.length
    ? safeProduct.decoration_types
    : ["Screen Print"];

  return {
    ...emptyProduct,
    ...safeProduct,
    product_type: safeProduct?.product_type || safeProduct?.name || "",
    cost_price:
      safeProduct?.cost_price === null || safeProduct?.cost_price === undefined
        ? ""
        : String(safeProduct.cost_price),
    markup_percentage:
      safeProduct?.markup_percentage === null ||
      safeProduct?.markup_percentage === undefined
        ? ""
        : String(safeProduct.markup_percentage),
    colors: Array.isArray(safeProduct?.colors) ? safeProduct.colors.join(", ") : "",
    sizes: Array.isArray(safeProduct?.sizes) ? safeProduct.sizes.join(", ") : "",
    placementsText: placements.join(", "),
    placementPriceMap: buildPlacementPriceMap(
      placements,
      safeProduct?.placement_prices || {}
    ),
    production_methods: productionMethods,
    production_method_prices: buildMethodPriceMap(
      productionMethods,
      safeProduct?.production_method_prices || {}
    ),
    notes: safeProduct?.notes || "",
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function normalizeProductStatus(status) {
  return String(status || "Active").trim().toLowerCase();
}

function getStatusLabel(status) {
  return normalizeProductStatus(status) === "active" ? "Active" : "Archived";
}

function getStatusTone(status) {
  return normalizeProductStatus(status) === "active" ? "active" : "archived";
}

function getProductTimestamp(product, index) {
  if (product?.created_at) {
    const createdAt = Date.parse(product.created_at);
    if (Number.isFinite(createdAt)) return createdAt;
  }

  const idMatch = String(product?.id || "").match(/(\d{10,})/);
  if (idMatch) {
    const parsedId = Number(idMatch[1]);
    if (Number.isFinite(parsedId)) return parsedId;
  }

  return Number.MAX_SAFE_INTEGER - index;
}

function buildFilterOptions(products, key) {
  return Array.from(
    new Set(
      products
        .map((product) => String(product?.[key] || "").trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
}

export default function Products() {
  const pageRef = useRef(null);
  const editorRef = useRef(null);
  const nameInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const products = useStoredProducts();
  const [form, setForm] = useState(emptyProduct);
  const [editingProductId, setEditingProductId] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedMethod, setSelectedMethod] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const placementOptions = normalizeListInput(form.placementsText);
  const editingProduct = editingProductId
    ? products.find((product) => product.id === editingProductId) || null
    : null;
  const editorTitle = editingProduct
    ? `Editing: ${editingProduct.name || form.name || "Product"}`
    : "Create Product";
  const editorDescription = editingProduct
    ? "Update garment settings, pricing, and workflow options for this catalog item."
    : "Configure garment price, allowed placements, and supported production methods.";

  const categoryOptions = useMemo(
    () => buildFilterOptions(products, "category"),
    [products]
  );

  const productionMethodOptions = useMemo(
    () =>
      Array.from(
        new Set(
          products.flatMap((product) =>
            Array.isArray(product?.production_methods)
              ? product.production_methods.filter(Boolean)
              : []
          )
        )
      ).sort((left, right) => left.localeCompare(right)),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const nextProducts = products.filter((product) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          product?.name,
          product?.category,
          product?.product_type,
          product?.brand_model,
          product?.notes,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(normalizedSearch)
          );
      const matchesCategory =
        selectedCategory === "all" || product?.category === selectedCategory;
      const matchesMethod =
        selectedMethod === "all" ||
        product?.production_methods?.includes(selectedMethod);
      const matchesStatus =
        selectedStatus === "all" ||
        (selectedStatus === "active"
          ? normalizeProductStatus(product?.status) === "active"
          : normalizeProductStatus(product?.status) !== "active");

      return matchesSearch && matchesCategory && matchesMethod && matchesStatus;
    });

    return [...nextProducts].sort((left, right) => {
      if (sortBy === "alphabetical") {
        return String(left?.name || "").localeCompare(String(right?.name || ""));
      }

      if (sortBy === "highest-price") {
        return Number(right?.base_garment_price || 0) - Number(left?.base_garment_price || 0);
      }

      return getProductTimestamp(right, 0) - getProductTimestamp(left, 1);
    });
  }, [
    products,
    searchTerm,
    selectedCategory,
    selectedMethod,
    selectedStatus,
    sortBy,
  ]);

  const activeCount = useMemo(
    () =>
      products.filter(
        (product) => normalizeProductStatus(product?.status) === "active"
      ).length,
    [products]
  );

  const archivedCount = products.length - activeCount;

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function updatePlacementsText(event) {
    const nextText = event.target.value;
    const placements = normalizeListInput(nextText);

    setForm((current) => ({
      ...current,
      placementsText: nextText,
      placementPriceMap: buildPlacementPriceMap(
        placements,
        current.placementPriceMap
      ),
    }));
  }

  function toggleProductionMethod(method) {
    setForm((current) => {
      const exists = current.production_methods.includes(method);
      const nextMethods = exists
        ? current.production_methods.filter((item) => item !== method)
        : [...current.production_methods, method];
      const safeMethods = nextMethods.length ? nextMethods : ["Screen Print"];

      return {
        ...current,
        production_methods: safeMethods,
        production_method_prices: buildMethodPriceMap(
          safeMethods,
          current.production_method_prices
        ),
      };
    });
  }

  function updatePlacementPrice(placement, value) {
    setForm((current) => ({
      ...current,
      placementPriceMap: {
        ...current.placementPriceMap,
        [placement]: value,
      },
    }));
  }

  function updateMethodPrice(method, value) {
    setForm((current) => ({
      ...current,
      production_method_prices: {
        ...current.production_method_prices,
        [method]: value,
      },
    }));
  }

  async function updateImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    const image = await fileToDataUrl(file);

    setForm((current) => ({
      ...current,
      image,
    }));
  }

  function resetForm() {
    setForm(emptyProduct);
    setEditingProductId(null);
    setSelectedFileName("");

    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  }

  function handleEdit(product) {
    setEditingProductId(product.id);
    setSelectedFileName("");
    setForm(buildFormFromProduct(product));
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError("");

    const placements = placementOptions;
    const placementPrices = placements.reduce((accumulator, placement) => {
      accumulator[placement] = parseOptionalPrice(form.placementPriceMap?.[placement]);
      return accumulator;
    }, {});
    const productionMethods = form.production_methods.length
      ? form.production_methods
      : ["Screen Print"];
    const productionMethodPrices = productionMethods.reduce((accumulator, method) => {
      accumulator[method] = parseOptionalPrice(
        form.production_method_prices?.[method]
      );
      return accumulator;
    }, {});
    const productPayload = {
      name: form.name,
      category: form.category,
      product_type: form.product_type || form.name,
      brand_model: form.brand_model,
      image: form.image,
      cost_price: Number(form.cost_price || 0),
      markup_percentage: Number(form.markup_percentage || 0),
      status: form.status,
      colors: normalizeListInput(form.colors),
      sizes: normalizeListInput(form.sizes),
      placements,
      placement_prices: placementPrices,
      placement_config: buildPlacementConfig(placements, placementPrices),
      production_methods: productionMethods,
      decoration_types: productionMethods,
      production_method_prices: productionMethodPrices,
      notes: form.notes,
    };

    try {
      setIsSaving(true);

      if (editingProductId) {
        await updateStoredProduct(editingProductId, productPayload);
      } else {
        await createStoredProduct(productPayload);
      }

      resetForm();
      pageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error("Product save failed", error);
      setSaveError("Unable to save this product right now. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(productId) {
    setSaveError("");

    try {
      await deleteStoredProduct(productId);

      if (editingProductId === productId) {
        resetForm();
      }
    } catch (error) {
      console.error("Product delete failed", error);
      setSaveError("Unable to delete this product right now. Please try again.");
    }
  }

  return (
    <div ref={pageRef} className="products-page">
      <div className="products-workspace">
        <form
          ref={editorRef}
          onSubmit={handleSubmit}
          className={`products-editor ${editingProduct ? "is-editing" : ""}`}
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <p
              style={{
                margin: 0,
                color: editingProduct ? "#0369a1" : "#78716c",
                fontSize: "12px",
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Owner Catalog Control
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: editingProduct ? "14px 16px" : 0,
                borderRadius: "18px",
                background: editingProduct ? "#e0f2fe" : "transparent",
                border: editingProduct ? "1px solid #bae6fd" : "none",
              }}
            >
              {editingProduct ? (
                <div
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "12px",
                    display: "grid",
                    placeItems: "center",
                    background: "#ffffff",
                    border: "1px solid #bae6fd",
                    flexShrink: 0,
                  }}
                >
                  <PencilIcon color="#0369a1" size={18} />
                </div>
              ) : null}
              <h1 style={{ margin: 0 }}>{editorTitle}</h1>
            </div>
            <p style={{ margin: 0, color: "#64748b" }}>{editorDescription}</p>
          </div>

          {editingProduct ? (
            <div
              style={{
                display: "grid",
                gap: "4px",
                padding: "14px 16px",
                borderRadius: "18px",
                border: "1px solid #bfdbfe",
                background: "#eff6ff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "#1d4ed8",
                  fontWeight: 800,
                }}
              >
                <PencilIcon color="#1d4ed8" size={16} />
                <span>Editing Existing Product</span>
              </div>
              <p style={{ margin: 0, color: "#475569", fontSize: "13px" }}>
                Changes will update catalog pricing and order workflows.
              </p>
            </div>
          ) : null}

          {saveError ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "14px",
                border: "1px solid #fecaca",
                background: "#fef2f2",
                color: "#991b1b",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              {saveError}
            </div>
          ) : null}

          <div className="products-editor-grid">
            <label style={labelStyle}>
              Product Name
              <input
                ref={nameInputRef}
                name="name"
                value={form.name}
                onChange={updateField}
                placeholder="Pullover Hoodie"
                required
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Category
              <input
                name="category"
                value={form.category}
                onChange={updateField}
                placeholder="Hoodie / Sweater"
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Product Type
              <input
                name="product_type"
                value={form.product_type}
                onChange={updateField}
                placeholder="Pullover Hoodie"
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Brand / Model
              <input
                name="brand_model"
                value={form.brand_model}
                onChange={updateField}
                placeholder="Independent Trading Co. IND4000"
                style={fieldStyle}
              />
            </label>
          </div>

          <ProductPricingFields
            form={form}
            updateField={updateField}
            fieldStyle={fieldStyle}
            labelStyle={labelStyle}
          />

          <div className="products-editor-section">
            <div>
              <strong style={{ display: "block", marginBottom: "4px" }}>
                Supported Production Methods
              </strong>
              <span style={{ color: "#64748b", fontSize: "13px" }}>
                These methods appear on Quotes and can carry per-unit production charges.
              </span>
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              {PRODUCTION_TYPES.map((method) => {
                const checked = form.production_methods.includes(method);

                return (
                  <label
                    key={method}
                    className="products-price-row"
                    style={{
                      gridTemplateColumns: "auto minmax(0, 1fr) 120px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProductionMethod(method)}
                    />
                    <span style={{ fontWeight: 700 }}>{method}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.production_method_prices?.[method] || "0"}
                      onChange={(event) => updateMethodPrice(method, event.target.value)}
                      disabled={!checked}
                      placeholder="0.00"
                      style={fieldStyle}
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="products-editor-section">
            <div>
              <strong style={{ display: "block", marginBottom: "4px" }}>
                Placements And Pricing
              </strong>
              <span style={{ color: "#64748b", fontSize: "13px" }}>
                Enter allowed placements, then set the price for each one.
              </span>
            </div>

            <label style={labelStyle}>
              Allowed Placements
              <textarea
                name="placementsText"
                value={form.placementsText}
                onChange={updatePlacementsText}
                placeholder="Left Chest, Full Front, Full Back, Sleeve"
                style={{ ...fieldStyle, minHeight: "88px", resize: "vertical" }}
              />
            </label>

            <div style={{ display: "grid", gap: "10px" }}>
              {placementOptions.map((placement) => (
                <label
                  key={placement}
                  className="products-price-row"
                  style={{
                    gridTemplateColumns: "minmax(0, 1fr) 120px",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{placement}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.placementPriceMap?.[placement] || "0"}
                    onChange={(event) => updatePlacementPrice(placement, event.target.value)}
                    placeholder="0.00"
                    style={fieldStyle}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="products-editor-grid">
            <label style={labelStyle}>
              Colors
              <textarea
                name="colors"
                value={form.colors}
                onChange={updateField}
                placeholder="Black, White, Navy"
                style={{ ...fieldStyle, minHeight: "84px", resize: "vertical" }}
              />
            </label>

            <label style={labelStyle}>
              Sizes
              <textarea
                name="sizes"
                value={form.sizes}
                onChange={updateField}
                placeholder="S, M, L, XL"
                style={{ ...fieldStyle, minHeight: "84px", resize: "vertical" }}
              />
            </label>
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            <label
              htmlFor="product-image-upload"
              style={{
                background: "#171717",
                color: "#ffffff",
                borderRadius: "12px",
                padding: "12px 14px",
                fontWeight: 800,
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              Upload Product Image
            </label>

            <input
              id="product-image-upload"
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={updateImage}
              style={{ display: "none" }}
            />

            <div style={{ color: "#78716c", fontSize: "13px" }}>
              {selectedFileName || "No image selected"}
            </div>
          </div>

          {form.image ? (
            <img
              src={form.image}
              alt="Preview"
              style={{
                width: "100%",
                borderRadius: "16px",
                border: "1px solid #e2e8f0",
              }}
            />
          ) : null}

          <label style={labelStyle}>
            Notes
            <textarea
              name="notes"
              value={form.notes}
              onChange={updateField}
              placeholder="Catalog notes for staff."
              style={{ ...fieldStyle, minHeight: "96px", resize: "vertical" }}
            />
          </label>

          <label style={labelStyle}>
            Status
            <select
              name="status"
              value={form.status}
              onChange={updateField}
              style={fieldStyle}
            >
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </label>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: editingProductId ? "1fr 1fr" : "1fr",
              gap: "10px",
            }}
          >
            <button
              type="submit"
              disabled={isSaving}
              style={{
                background: "#171717",
                color: "#ffffff",
                border: "none",
                borderRadius: "12px",
                padding: "13px 18px",
                fontWeight: 800,
                cursor: "pointer",
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              {isSaving ? "Saving..." : editingProductId ? "Update Product" : "Save Product"}
            </button>

            {editingProductId ? (
              <button
                type="button"
                onClick={resetForm}
                style={{
                  background: editingProduct ? "#eff6ff" : "#ffffff",
                  color: editingProduct ? "#1d4ed8" : "#171717",
                  border: editingProduct ? "1px solid #bfdbfe" : "1px solid #cbd5e1",
                  borderRadius: "12px",
                  padding: "13px 18px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Cancel Editing
              </button>
            ) : null}
          </div>
        </form>

        <section className="products-catalog-panel">
          <div className="products-catalog-header">
            <div>
              <p className="products-eyebrow">Catalog Workspace</p>
              <h2 style={{ margin: "6px 0 0" }}>Browse and manage products</h2>
            </div>

            <div className="products-stat-row">
              <div className="products-stat-card">
                <span>Total Products</span>
                <strong>{products.length}</strong>
              </div>
              <div className="products-stat-card">
                <span>Active</span>
                <strong>{activeCount}</strong>
              </div>
              <div className="products-stat-card">
                <span>Archived</span>
                <strong>{archivedCount}</strong>
              </div>
            </div>
          </div>

          <div className="products-toolbar">
            <label className="products-toolbar-field">
              <span>Search Products</span>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search name, category, model, or notes"
                style={fieldStyle}
              />
            </label>

            <label className="products-toolbar-field">
              <span>Category</span>
              <select
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                style={fieldStyle}
              >
                <option value="all">All categories</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="products-toolbar-field">
              <span>Production Method</span>
              <select
                value={selectedMethod}
                onChange={(event) => setSelectedMethod(event.target.value)}
                style={fieldStyle}
              >
                <option value="all">All methods</option>
                {productionMethodOptions.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>

            <label className="products-toolbar-field">
              <span>Status</span>
              <select
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value)}
                style={fieldStyle}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>

            <label className="products-toolbar-field">
              <span>Sort</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                style={fieldStyle}
              >
                <option value="newest">Newest</option>
                <option value="alphabetical">Alphabetical</option>
                <option value="highest-price">Highest Price</option>
              </select>
            </label>
          </div>

          <div className="products-results-meta">
            <span>
              Showing <strong>{filteredProducts.length}</strong> of{" "}
              <strong>{products.length}</strong> products
            </span>
            {(searchTerm || selectedCategory !== "all" || selectedMethod !== "all" || selectedStatus !== "all") ? (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("all");
                  setSelectedMethod("all");
                  setSelectedStatus("all");
                }}
                className="products-clear-filters"
              >
                Clear filters
              </button>
            ) : null}
          </div>

          <div className="products-list-scroll">
            <div className="products-list-grid">
              {filteredProducts.length ? (
                filteredProducts.map((product) => {
                  const isActive = product.id === editingProductId;
                  const visiblePlacements = (product?.placement_config || [])
                    .map((placement) => placement?.label)
                    .filter(Boolean)
                    .slice(0, 3);
                  const hasExtraPlacements =
                    (product?.placement_config || []).length > visiblePlacements.length;

                  return (
                    <article
                      key={product.id}
                      className={`products-card ${isActive ? "is-active" : ""}`}
                    >
                      <div className="products-card-media">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.name}
                            className="products-card-image"
                          />
                        ) : (
                          <div className="products-card-image-placeholder">
                            No Image
                          </div>
                        )}
                      </div>

                      <div className="products-card-body">
                        <div className="products-card-topline">
                          <div style={{ minWidth: 0 }}>
                            <div className="products-card-title-row">
                              <h3 style={{ margin: 0 }}>{product.name}</h3>
                              {isActive ? (
                                <span className="products-card-editing-pill">
                                  Editing
                                </span>
                              ) : null}
                            </div>
                            <p className="products-card-subtitle">
                              {product.category || "General"} •{" "}
                              {product.product_type || "General"}
                            </p>
                          </div>

                          <strong className="products-card-price">
                            {formatMoney(product?.base_garment_price)}
                          </strong>
                        </div>

                        <div className="products-card-detail-grid">
                          <div className="products-card-detail">
                            <span>Production</span>
                            <strong>
                              {product?.production_methods?.join(", ") || "None"}
                            </strong>
                          </div>

                          <div className="products-card-detail">
                            <span>Status</span>
                            <strong
                              className={`products-status products-status-${getStatusTone(
                                product?.status
                              )}`}
                            >
                              {getStatusLabel(product?.status)}
                            </strong>
                          </div>

                          <div className="products-card-detail">
                            <span>Pricing</span>
                            <strong>
                              Cost {formatMoney(product?.cost_price)} • Markup{" "}
                              {formatPercent(product?.markup_percentage)}
                            </strong>
                          </div>

                          <div className="products-card-detail">
                            <span>Placements</span>
                            <strong>
                              {visiblePlacements.join(", ") || "No placements"}
                              {hasExtraPlacements ? " +" : ""}
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div className="products-card-actions">
                        <button
                          type="button"
                          onClick={() => handleEdit(product)}
                          style={{
                            border: isActive ? "1px solid #0ea5e9" : "1px solid #cbd5e1",
                            background: isActive ? "#0f172a" : "#ffffff",
                            color: isActive ? "#ffffff" : "#171717",
                            borderRadius: "10px",
                            padding: "9px 12px",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          {isActive ? "Editing" : "Edit"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(product.id)}
                          style={{
                            border: "1px solid #fecaca",
                            background: "#fff1f2",
                            color: "#be123c",
                            borderRadius: "10px",
                            padding: "9px 12px",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="products-empty-state">
                  <strong>No products match the current filters.</strong>
                  <span>Adjust search, filters, or status selections to see more catalog items.</span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
