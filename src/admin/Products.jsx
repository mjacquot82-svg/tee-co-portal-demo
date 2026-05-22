import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./Products.css";
import ProductImageUploader from "../components/ProductImageUploader";
import { PRODUCTION_TYPES } from "../constants/productionTypes";
import { useCatalogLookups } from "../lib/catalogLookupsStore";
import { useGarmentLibraryItems } from "../lib/garmentLibraryStore";
import { findLinkedGarmentLibraryItem } from "../lib/productGarmentLinks";
import {
  buildPlacementConfig,
  createStoredProduct,
  deleteStoredProduct,
  getProductPlacementConfig,
  updateStoredProduct,
  useStoredProducts,
} from "../lib/productsStore";
import {
  buildGarmentLibraryLabel,
  buildLegacyBrandModelValue,
  buildMethodPriceMap,
  buildPlacementPriceMap,
  fieldStyle,
  findLookupById,
  formatMoney,
  labelStyle,
  MultiSelectLookupField,
  normalizeListInput,
  normalizeText,
  normalizeTextKey,
  parseOptionalPrice,
  resolveStructuredProductType,
  SearchableLookupField,
  sortSizesByLookup,
  uniqueList,
} from "./catalogShared";

const COMMON_PLACEMENT_OPTIONS = [
  "Left Chest",
  "Right Chest",
  "Full Front",
  "Center Chest",
  "Full Back",
  "Upper Back",
  "Sleeve",
  "Left Sleeve",
  "Right Sleeve",
  "Front Panel",
  "Side Panel",
  "Yoke",
];

const emptyProduct = {
  name: "",
  selectedGarmentLibraryId: "",
  garmentSearch: "",
  flat_price: "",
  image: "",
  visibleVariants: [],
  sizes: [],
  notes: "",
  status: "Active",
  placementsText: "",
  placementPriceMap: {},
  production_methods: ["Screen Print"],
  production_method_prices: {},
  cost_price: "",
  markup_percentage: "",
};

function isOneSizeOnly(values = []) {
  return values.length === 1 && normalizeTextKey(values[0]) === "one size";
}

function getVariantOptions(item) {
  return (item?.variants || [])
    .filter((variant) => variant.active !== false)
    .map((variant) => ({
      id: variant.id,
      name: variant.name,
      meta: variant.supplier_sku ? `SKU ${variant.supplier_sku}` : "",
    }));
}

function buildPlacementLibrary(products = [], libraryItems = []) {
  const placementNames = new Set(COMMON_PLACEMENT_OPTIONS);

  products.forEach((product) => {
    getProductPlacementConfig(product).forEach((placement) => {
      if (placement?.label) placementNames.add(placement.label);
    });
  });

  libraryItems.forEach((item) => {
    (item?.default_placements || []).forEach((placement) => {
      if (placement) placementNames.add(placement);
    });
  });

  return Array.from(placementNames).sort((left, right) => left.localeCompare(right));
}

function buildFormFromProduct(product, libraryItems, sizeLookups, brands, categories, garmentModels) {
  const matchedItem = findLinkedGarmentLibraryItem(product, libraryItems);
  const placements = getProductPlacementConfig(product).map((placement) => placement.label);
  const productionMethods = Array.isArray(product?.production_methods) && product.production_methods.length
    ? product.production_methods
    : matchedItem?.default_production_methods?.length
      ? matchedItem.default_production_methods
      : ["Screen Print"];

  return {
    ...emptyProduct,
    ...product,
    selectedGarmentLibraryId: matchedItem?.id || "",
    garmentSearch: matchedItem
      ? buildGarmentLibraryLabel(matchedItem, brands, categories, garmentModels)
      : "",
    flat_price:
      product?.base_garment_price === null || product?.base_garment_price === undefined
        ? ""
        : String(product.base_garment_price),
    visibleVariants: Array.isArray(product?.colors) ? uniqueList(product.colors) : [],
    sizes: sortSizesByLookup(Array.isArray(product?.sizes) ? product.sizes : [], sizeLookups),
    placementsText: placements.join(", "),
    placementPriceMap: buildPlacementPriceMap(placements, product?.placement_prices || {}),
    production_methods: productionMethods,
    production_method_prices: buildMethodPriceMap(
      productionMethods,
      product?.production_method_prices || {}
    ),
    cost_price:
      product?.cost_price === null || product?.cost_price === undefined ? "" : String(product.cost_price),
    markup_percentage:
      product?.markup_percentage === null || product?.markup_percentage === undefined
        ? ""
        : String(product.markup_percentage),
    notes: product?.notes || "",
  };
}

function normalizeStatusValue(value) {
  return String(value || "Active").trim().toLowerCase();
}

export default function Products() {
  const pageRef = useRef(null);
  const editorRef = useRef(null);
  const nameInputRef = useRef(null);
  const products = useStoredProducts();
  const libraryItems = useGarmentLibraryItems();
  const lookups = useCatalogLookups();
  const categories = useMemo(() => lookups.categories || [], [lookups.categories]);
  const brands = useMemo(() => lookups.brands || [], [lookups.brands]);
  const sizes = useMemo(() => lookups.sizes || [], [lookups.sizes]);
  const garmentModels = useMemo(() => lookups.garment_models || [], [lookups.garment_models]);
  const [form, setForm] = useState(emptyProduct);
  const [editingProductId, setEditingProductId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const editingProduct = editingProductId
    ? products.find((product) => product.id === editingProductId) || null
    : null;
  const selectedGarmentItem =
    libraryItems.find((item) => item.id === form.selectedGarmentLibraryId) || null;
  const garmentVariants = getVariantOptions(selectedGarmentItem);
  const garmentSizes = useMemo(
    () => sortSizesByLookup(selectedGarmentItem?.sizes || [], sizes),
    [selectedGarmentItem, sizes]
  );
  const garmentSizeOptions = useMemo(
    () =>
      garmentSizes.map((size) => ({
        id: size,
        name: size,
      })),
    [garmentSizes]
  );
  const garmentBrand = findLookupById(brands, selectedGarmentItem?.brand_lookup_id);
  const garmentCategory = findLookupById(categories, selectedGarmentItem?.category_lookup_id);
  const selectedGarmentVariantCount = garmentVariants.length;
  const showVariantSelection = Boolean(selectedGarmentItem) && selectedGarmentVariantCount > 0;
  const showSizeSelection = Boolean(selectedGarmentItem) && garmentSizeOptions.length > 0;
  const isSelectedGarmentOneSize = isOneSizeOnly(garmentSizes);
  const placementLibrary = useMemo(
    () => buildPlacementLibrary(products, libraryItems),
    [products, libraryItems]
  );
  const placementOptions = normalizeListInput(form.placementsText);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        !normalizedSearch ||
        [product?.name, product?.brand_model, product?.category, product?.notes]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      const matchesStatus =
        selectedStatus === "all" ||
        (selectedStatus === "active"
          ? normalizeStatusValue(product?.status) === "active"
          : normalizeStatusValue(product?.status) !== "active");
      return matchesSearch && matchesStatus;
    });
  }, [products, searchTerm, selectedStatus]);

  const activeCount = products.filter((product) => normalizeStatusValue(product?.status) === "active").length;

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setForm(emptyProduct);
    setEditingProductId(null);
  }

  function handleGarmentSelect(item) {
    const garmentModel = findLookupById(garmentModels, item.garment_model_lookup_id);
    const brand = findLookupById(brands, item.brand_lookup_id);

    setForm((current) => ({
      ...current,
      selectedGarmentLibraryId: item.id,
      garmentSearch: buildGarmentLibraryLabel(item, brands, categories, garmentModels),
      name: current.name || item.title,
      image: current.image || item.image || "",
      visibleVariants: getVariantOptions(item).map((variant) => variant.name),
      sizes: sortSizesByLookup(item.sizes || [], sizes),
      placementsText: current.placementsText || (item.default_placements || []).join(", "),
      placementPriceMap: buildPlacementPriceMap(
        current.placementsText ? normalizeListInput(current.placementsText) : item.default_placements || [],
        current.placementPriceMap
      ),
      production_methods: current.production_methods.length
        ? current.production_methods
        : item.default_production_methods?.length
          ? item.default_production_methods
          : ["Screen Print"],
      production_method_prices: buildMethodPriceMap(
        current.production_methods.length
          ? current.production_methods
          : item.default_production_methods?.length
            ? item.default_production_methods
            : ["Screen Print"],
        current.production_method_prices
      ),
      category: findLookupById(categories, item.category_lookup_id)?.name || current.category || "",
      category_lookup_id: item.category_lookup_id || current.category_lookup_id || "",
      brand_lookup_id: item.brand_lookup_id || current.brand_lookup_id || "",
      garment_model_lookup_id: item.garment_model_lookup_id || current.garment_model_lookup_id || "",
      product_type: resolveStructuredProductType(garmentModel, current.product_type, current.name || item.title),
      brand_model: buildLegacyBrandModelValue(brand, garmentModel, current.brand_model),
    }));
  }

  function handleGarmentSearchChange(event) {
    const nextValue = event.target.value;
    setForm((current) => ({
      ...current,
      selectedGarmentLibraryId: "",
      garmentSearch: nextValue,
    }));
  }

  function toggleVariant(variantName) {
    setForm((current) => ({
      ...current,
      visibleVariants: current.visibleVariants.some(
        (variant) => normalizeTextKey(variant) === normalizeTextKey(variantName)
      )
        ? current.visibleVariants.filter(
            (variant) => normalizeTextKey(variant) !== normalizeTextKey(variantName)
          )
        : uniqueList([...current.visibleVariants, variantName]),
    }));
  }

  function toggleSize(sizeName) {
    setForm((current) => {
      const nextSizes = current.sizes.some(
        (size) => normalizeTextKey(size) === normalizeTextKey(sizeName)
      )
        ? current.sizes.filter((size) => normalizeTextKey(size) !== normalizeTextKey(sizeName))
        : [...current.sizes, sizeName];

      return {
        ...current,
        sizes: sortSizesByLookup(nextSizes, sizes),
      };
    });
  }

  function togglePlacement(placementName) {
    setForm((current) => {
      const nextPlacements = normalizeListInput(current.placementsText);
      const exists = nextPlacements.some(
        (placement) => normalizeTextKey(placement) === normalizeTextKey(placementName)
      );
      const placements = exists
        ? nextPlacements.filter(
            (placement) => normalizeTextKey(placement) !== normalizeTextKey(placementName)
          )
        : [...nextPlacements, placementName];

      return {
        ...current,
        placementsText: placements.join(", "),
        placementPriceMap: buildPlacementPriceMap(placements, current.placementPriceMap),
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

  function updateMethodPrice(method, value) {
    setForm((current) => ({
      ...current,
      production_method_prices: {
        ...current.production_method_prices,
        [method]: value,
      },
    }));
  }

  function handleEdit(product) {
    setEditingProductId(product.id);
    setForm(buildFormFromProduct(product, libraryItems, sizes, brands, categories, garmentModels));
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError("");

    if (!editingProductId && !selectedGarmentItem) {
      setSaveError("Choose a garment from the Garment Library before publishing a storefront product.");
      return;
    }

    const placements = placementOptions;
    const placementPrices = placements.reduce((accumulator, placement) => {
      accumulator[placement] = parseOptionalPrice(form.placementPriceMap?.[placement]);
      return accumulator;
    }, {});
    const productionMethodPrices = form.production_methods.reduce((accumulator, method) => {
      accumulator[method] = parseOptionalPrice(form.production_method_prices?.[method]);
      return accumulator;
    }, {});
    const garmentModel = findLookupById(
      garmentModels,
      selectedGarmentItem?.garment_model_lookup_id || form.garment_model_lookup_id
    );
    const brand = findLookupById(
      brands,
      selectedGarmentItem?.brand_lookup_id || form.brand_lookup_id
    );
    const category = findLookupById(
      categories,
      selectedGarmentItem?.category_lookup_id || form.category_lookup_id
    );
    const flatPrice = Number(form.flat_price || 0);
    const selectedSizes =
      selectedGarmentItem && isOneSizeOnly(selectedGarmentItem.sizes || [])
        ? sortSizesByLookup(selectedGarmentItem.sizes || [], sizes)
        : sortSizesByLookup(form.sizes, sizes);

    const productPayload = {
      name: normalizeText(form.name),
      garment_library_item_id: selectedGarmentItem?.id || form.selectedGarmentLibraryId || null,
      category: category?.name || form.category || "Catalog",
      category_lookup_id: category?.id || form.category_lookup_id || null,
      product_type: resolveStructuredProductType(garmentModel, form.product_type, form.name),
      brand_model: buildLegacyBrandModelValue(brand, garmentModel, form.brand_model),
      brand_lookup_id: brand?.id || form.brand_lookup_id || null,
      garment_model_lookup_id: garmentModel?.id || form.garment_model_lookup_id || null,
      image: form.image,
      status: form.status,
      colors: uniqueList(form.visibleVariants),
      sizes: selectedSizes,
      placements,
      placement_prices: placementPrices,
      placement_config: buildPlacementConfig(placements, placementPrices),
      production_methods: form.production_methods,
      decoration_types: form.production_methods,
      production_method_prices: productionMethodPrices,
      cost_price: Number(form.cost_price || 0),
      markup_percentage: Number(form.markup_percentage || 0),
      base_garment_price: flatPrice,
      unit_price: flatPrice,
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
      console.error("Unable to save product", error);
      setSaveError("Unable to save this product right now. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(productId) {
    try {
      await deleteStoredProduct(productId);
      if (editingProductId === productId) {
        resetForm();
      }
    } catch (error) {
      console.error("Unable to delete product", error);
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
          <div style={{ display: "grid", gap: "10px" }}>
            <p className="products-eyebrow">Customer Product Catalog</p>
            <h1 style={{ margin: 0 }}>
              {editingProduct ? `Edit ${editingProduct.name}` : "Publish Storefront Product"}
            </h1>
            <p style={{ margin: 0, color: "#64748b" }}>
              Choose a garment, enable the customer-facing variants, set a flat price, and publish.
            </p>
            <div className="products-callout">
              Supplier models, long color runs, and SKU setup live in the{" "}
              <Link to="/admin/garments">Garment Library</Link>.
            </div>
          </div>

          {saveError ? <div className="products-error-banner">{saveError}</div> : null}

          <div className="products-editor-grid">
            <label style={labelStyle}>
              Customer Product Name
              <input
                ref={nameInputRef}
                name="name"
                value={form.name}
                onChange={updateField}
                placeholder="Premium Trucker Hat"
                required
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Flat Customer Price
              <input
                type="number"
                min="0"
                step="0.01"
                name="flat_price"
                value={form.flat_price}
                onChange={updateField}
                placeholder="24.00"
                required
                style={fieldStyle}
              />
            </label>
          </div>

          <div className="products-editor-section">
            <SearchableLookupField
              label="Garment"
              value={form.garmentSearch}
              onChange={handleGarmentSearchChange}
              onSelect={handleGarmentSelect}
              options={libraryItems.filter((item) => item.active !== false)}
              placeholder="Search garment library"
              helperText="This links the storefront product to a reusable supplier garment."
              action={
                <Link className="products-inline-action-link" to="/admin/garments">
                  Open Garment Library
                </Link>
              }
              renderOptionLabel={(item) => buildGarmentLibraryLabel(item, brands, categories, garmentModels)}
              renderOptionMeta={(item) => {
                const variantCount = (item?.variants || []).filter((variant) => variant.active !== false).length;
                return `${variantCount} variants • ${(item?.sizes || []).length} sizes`;
              }}
              emptyState="No garments found. Add one in Garment Library first."
            />

            {selectedGarmentItem ? (
              <div className="products-summary-card">
                <span className="products-summary-label">Selected Garment</span>
                <strong>{selectedGarmentItem.title}</strong>
                <div className="products-summary-meta">
                  <span>{garmentBrand?.name || "No brand"}</span>
                  <span>{garmentCategory?.name || "No category"}</span>
                </div>
                <div className="products-summary-details">
                  <span>{selectedGarmentVariantCount} variants</span>
                  <span>
                    {isSelectedGarmentOneSize
                      ? "One size available"
                      : garmentSizes.join(", ") || "No sizes configured"}
                  </span>
                </div>
              </div>
            ) : editingProduct ? (
              <div className="products-legacy-note">
                This product predates the new garment library. Select a library garment to relink it.
              </div>
            ) : null}
          </div>

          {selectedGarmentItem ? (
            <div className="products-library-grid">
              {showVariantSelection ? (
                <MultiSelectLookupField
                  label="Visible Variants"
                  helperText="Choose which garment colorways customers can buy."
                  options={garmentVariants}
                  selectedValues={form.visibleVariants}
                  onToggle={toggleVariant}
                  createHelper="No garment variants available."
                  searchPlaceholder="Search variants or supplier SKU"
                />
              ) : null}

              {showSizeSelection ? (
                isSelectedGarmentOneSize ? (
                  <div className="products-summary-card products-one-size-card">
                    <span className="products-summary-label">Available Sizes</span>
                    <strong>One size available</strong>
                  </div>
                ) : (
                  <MultiSelectLookupField
                    label="Available Sizes"
                    helperText="Sizes load from the garment library and can be narrowed per product."
                    options={garmentSizeOptions}
                    selectedValues={form.sizes}
                    onToggle={toggleSize}
                    createHelper="No garment sizes available."
                  />
                )
              ) : null}
            </div>
          ) : null}

          <ProductImageUploader
            image={form.image}
            onImageChange={(image) => setForm((current) => ({ ...current, image }))}
          />

          <div className="products-editor-grid" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
            <label style={labelStyle}>
              Status
              <select name="status" value={form.status} onChange={updateField} style={fieldStyle}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </label>
          </div>

          <details className="products-editor-section products-advanced-section">
            <summary className="products-advanced-summary">
              <div>
                <strong>Advanced Settings</strong>
                <span>Placements, production methods, and operational pricing stay available without crowding the main flow.</span>
              </div>
            </summary>

            <div className="products-advanced-stack">
              <div className="products-advanced-subsection">
                <strong>Artwork Placements</strong>
                <div className="products-selection-chip-row">
                  {placementLibrary.map((placement) => {
                    const active = placementOptions.some(
                      (selectedPlacement) =>
                        normalizeTextKey(selectedPlacement) === normalizeTextKey(placement)
                    );

                    return (
                      <button
                        key={placement}
                        type="button"
                        className={`products-placement-chip ${active ? "is-active" : ""}`}
                        onClick={() => togglePlacement(placement)}
                      >
                        {placement}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "grid", gap: "10px" }}>
                  {placementOptions.map((placement) => (
                    <label key={placement} className="products-price-row">
                      <span style={{ fontWeight: 700 }}>{placement}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.placementPriceMap?.[placement] || ""}
                        onChange={(event) => updatePlacementPrice(placement, event.target.value)}
                        placeholder="0.00"
                        style={fieldStyle}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="products-advanced-subsection">
                <strong>Production Methods</strong>
                <div style={{ display: "grid", gap: "10px" }}>
                  {PRODUCTION_TYPES.map((method) => {
                    const checked = form.production_methods.includes(method);

                    return (
                      <label key={method} className="products-price-row products-price-row-wide">
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
                          value={form.production_method_prices?.[method] || ""}
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

              <label style={labelStyle}>
                Notes
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={updateField}
                  placeholder="Optional internal notes."
                  style={{ ...fieldStyle, minHeight: "96px", resize: "vertical" }}
                />
              </label>

              <div className="products-editor-grid">
                <label style={labelStyle}>
                  Garment Cost
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    name="cost_price"
                    value={form.cost_price}
                    onChange={updateField}
                    placeholder="0.00"
                    style={fieldStyle}
                  />
                </label>

                <label style={labelStyle}>
                  Markup %
                  <input
                    type="number"
                    min="0"
                    step="1"
                    name="markup_percentage"
                    value={form.markup_percentage}
                    onChange={updateField}
                    placeholder="0"
                    style={fieldStyle}
                  />
                </label>
              </div>
            </div>
          </details>

          <div style={{ display: "grid", gridTemplateColumns: editingProduct ? "1fr 1fr" : "1fr", gap: "10px" }}>
            <button type="submit" disabled={isSaving} className="products-primary-button">
              {isSaving ? "Saving..." : editingProduct ? "Update Product" : "Publish Product"}
            </button>

            {editingProduct ? (
              <button type="button" onClick={resetForm} className="products-secondary-button">
                Cancel Editing
              </button>
            ) : null}
          </div>
        </form>

        <section className="products-catalog-panel">
          <div className="products-catalog-header">
            <div>
              <p className="products-eyebrow">Published Catalog</p>
              <h2 style={{ margin: "6px 0 0" }}>Customer-facing products</h2>
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
                <span>Garments</span>
                <strong>{libraryItems.length}</strong>
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
                placeholder="Search product name or garment"
                style={fieldStyle}
              />
            </label>

            <label className="products-toolbar-field">
              <span>Status</span>
              <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} style={fieldStyle}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>

          <div className="products-results-meta">
            <span>
              Showing <strong>{filteredProducts.length}</strong> of <strong>{products.length}</strong> products
            </span>
          </div>

          <div className="products-list-scroll">
            <div className="products-list-grid">
              {filteredProducts.length ? (
                filteredProducts.map((product) => {
                  const linkedGarment = findLinkedGarmentLibraryItem(product, libraryItems);

                  return (
                    <article key={product.id} className={`products-card ${product.id === editingProductId ? "is-active" : ""}`}>
                      <div className="products-card-media">
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="products-card-image" />
                        ) : (
                          <div className="products-card-image-placeholder">No Image</div>
                        )}
                      </div>

                      <div className="products-card-body">
                        <div className="products-card-topline">
                          <div style={{ minWidth: 0 }}>
                            <div className="products-card-title-row">
                              <h3 style={{ margin: 0 }}>{product.name}</h3>
                            </div>
                            <p className="products-card-subtitle">
                              {linkedGarment?.title || product.brand_model || "Unlinked legacy garment"}
                            </p>
                          </div>

                          <strong className="products-card-price">{formatMoney(product?.base_garment_price)}</strong>
                        </div>

                        <div className="products-card-detail-grid">
                          <div className="products-card-detail">
                            <span>Variants</span>
                            <strong>{(product?.colors || []).length} enabled</strong>
                          </div>

                          <div className="products-card-detail">
                            <span>Sizes</span>
                            <strong>{(product?.sizes || []).join(", ") || "None"}</strong>
                          </div>

                          <div className="products-card-detail">
                            <span>Status</span>
                            <strong className={`products-status products-status-${normalizeStatusValue(product?.status) === "active" ? "active" : "archived"}`}>
                              {normalizeStatusValue(product?.status) === "active" ? "Active" : "Archived"}
                            </strong>
                          </div>

                          <div className="products-card-detail">
                            <span>Placements</span>
                            <strong>
                              {getProductPlacementConfig(product)
                                .map((placement) => placement.label)
                                .slice(0, 3)
                                .join(", ") || "None"}
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div className="products-card-actions">
                        <button type="button" onClick={() => handleEdit(product)} className="products-card-button">
                          Edit
                        </button>
                        <button type="button" onClick={() => handleDelete(product.id)} className="products-card-button products-card-button-danger">
                          Remove
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="products-empty-state">
                  <h3 style={{ margin: 0 }}>No products found</h3>
                  <p style={{ margin: 0, color: "#64748b" }}>
                    Publish your first storefront product from the garment library.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
