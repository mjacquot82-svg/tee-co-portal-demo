import { useMemo, useRef, useState } from "react";
import "./Products.css";
import ProductImageUploader from "../components/ProductImageUploader";
import { PRODUCTION_TYPES } from "../constants/productionTypes";
import { createCatalogLookup, useCatalogLookups } from "../lib/catalogLookupsStore";
import {
  createGarmentLibraryItem,
  deleteGarmentLibraryItem,
  updateGarmentLibraryItem,
  useGarmentLibraryItems,
} from "../lib/garmentLibraryStore";
import { useStoredProducts } from "../lib/productsStore";
import {
  buildGarmentLibraryLabel,
  buildGarmentModelLabel,
  fieldStyle,
  findLookupById,
  labelStyle,
  MultiSelectLookupField,
  normalizeText,
  normalizeTextKey,
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

const emptyLibraryForm = {
  title: "",
  category_lookup_id: "",
  brand_lookup_id: "",
  garment_model_lookup_id: "",
  garmentSearch: "",
  image: "",
  sizes: [],
  variants: [],
  default_placements: [],
  default_production_methods: ["Screen Print"],
  notes: "",
  active: true,
};

function buildFormFromGarment(item, brands, categories, garmentModels, sizeLookups) {
  return {
    ...emptyLibraryForm,
    ...item,
    garmentSearch: buildGarmentLibraryLabel(item, brands, categories, garmentModels),
    sizes: sortSizesByLookup(item?.sizes || [], sizeLookups),
    default_production_methods:
      item?.default_production_methods?.length ? item.default_production_methods : ["Screen Print"],
  };
}

function buildVariantDraft() {
  return {
    name: "",
    supplier_sku: "",
  };
}

export default function GarmentLibrary() {
  const editorRef = useRef(null);
  const garments = useGarmentLibraryItems();
  const products = useStoredProducts();
  const lookups = useCatalogLookups();
  const categories = lookups.categories || [];
  const brands = lookups.brands || [];
  const sizes = lookups.sizes || [];
  const garmentModels = lookups.garment_models || [];
  const [form, setForm] = useState(emptyLibraryForm);
  const [editingId, setEditingId] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [variantSearch, setVariantSearch] = useState("");
  const [variantDraft, setVariantDraft] = useState(buildVariantDraft());
  const [brandDraft, setBrandDraft] = useState("");
  const [sizeDraft, setSizeDraft] = useState("");
  const [modelDraft, setModelDraft] = useState({
    brand_id: "",
    display_name: "",
    model_code: "",
  });

  const filteredModels = useMemo(
    () =>
      garmentModels.filter((model) => {
        if (form.category_lookup_id && model.category_id !== form.category_lookup_id) {
          return false;
        }

        if (form.brand_lookup_id && model.brand_id !== form.brand_lookup_id) {
          return false;
        }

        return true;
      }),
    [garmentModels, form.category_lookup_id, form.brand_lookup_id]
  );
  const filteredGarments = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return garments.filter((item) => {
      if (!normalizedSearch) return true;
      return [item.title, item.notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [garments, searchTerm]);
  const visibleVariants = useMemo(() => {
    const normalizedSearch = variantSearch.trim().toLowerCase();
    return form.variants.filter((variant) => {
      if (!normalizedSearch) return true;
      return [variant.name, variant.supplier_sku]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [form.variants, variantSearch]);

  function resetForm() {
    setForm(emptyLibraryForm);
    setEditingId(null);
    setSaveError("");
    setVariantDraft(buildVariantDraft());
  }

  function updateField(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleGarmentModelSearchChange(event) {
    const nextValue = event.target.value;
    setForm((current) => ({
      ...current,
      garment_model_lookup_id: "",
      garmentSearch: nextValue,
    }));
  }

  function handleGarmentModelSelect(model) {
    const brand = findLookupById(brands, model.brand_id);
    const category = findLookupById(categories, model.category_id);

    setForm((current) => ({
      ...current,
      title:
        current.title ||
        [brand?.name, model.model_code, model.display_name].filter(Boolean).join(" "),
      brand_lookup_id: brand?.id || current.brand_lookup_id,
      category_lookup_id: category?.id || current.category_lookup_id,
      garment_model_lookup_id: model.id,
      garmentSearch: buildGarmentModelLabel(model, brands, categories),
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
    setForm((current) => ({
      ...current,
      default_placements: current.default_placements.some(
        (placement) => normalizeTextKey(placement) === normalizeTextKey(placementName)
      )
        ? current.default_placements.filter(
            (placement) => normalizeTextKey(placement) !== normalizeTextKey(placementName)
          )
        : [...current.default_placements, placementName],
    }));
  }

  function toggleProductionMethod(method) {
    setForm((current) => {
      const exists = current.default_production_methods.includes(method);
      const nextMethods = exists
        ? current.default_production_methods.filter((item) => item !== method)
        : [...current.default_production_methods, method];

      return {
        ...current,
        default_production_methods: nextMethods.length ? nextMethods : ["Screen Print"],
      };
    });
  }

  function addVariant() {
    const name = normalizeText(variantDraft.name);
    if (!name) return;

    setForm((current) => ({
      ...current,
      variants: [
        ...current.variants,
        {
          id: `variant-${Date.now()}`,
          name,
          supplier_sku: normalizeText(variantDraft.supplier_sku),
          active: true,
        },
      ],
    }));
    setVariantDraft(buildVariantDraft());
  }

  function updateVariant(variantId, updates) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant) =>
        variant.id === variantId ? { ...variant, ...updates } : variant
      ),
    }));
  }

  function removeVariant(variantId) {
    setForm((current) => ({
      ...current,
      variants: current.variants.filter((variant) => variant.id !== variantId),
    }));
  }

  async function handleCreateBrand() {
    const nextName = normalizeText(brandDraft);
    if (!nextName) return;

    const created = await createCatalogLookup("brands", { name: nextName, active: true });
    setForm((current) => ({ ...current, brand_lookup_id: created.id }));
    setBrandDraft("");
  }

  async function handleCreateSize() {
    const nextName = normalizeText(sizeDraft);
    if (!nextName) return;

    const highestSortOrder = sizes.reduce(
      (highest, size) => Math.max(highest, Number(size?.sort_order || 0)),
      0
    );
    await createCatalogLookup("sizes", {
      name: nextName,
      sort_order: highestSortOrder + 10,
      active: true,
    });
    toggleSize(nextName);
    setSizeDraft("");
  }

  async function handleCreateModel() {
    const displayName = normalizeText(modelDraft.display_name);
    const modelCode = normalizeText(modelDraft.model_code);
    const brandId = modelDraft.brand_id || form.brand_lookup_id;
    const categoryId = form.category_lookup_id;

    if (!displayName || !brandId || !categoryId) {
      setSaveError("Select a brand and category before creating a garment model.");
      return;
    }

    const created = await createCatalogLookup("garment_models", {
      brand_id: brandId,
      model_code: modelCode,
      display_name: displayName,
      category_id: categoryId,
      active: true,
    });

    handleGarmentModelSelect(created);
    setModelDraft({ brand_id: brandId, display_name: "", model_code: "" });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError("");

    if (!form.garment_model_lookup_id) {
      setSaveError("Select a garment model for this library item.");
      return;
    }

    const payload = {
      title: normalizeText(form.title),
      category_lookup_id: form.category_lookup_id,
      brand_lookup_id: form.brand_lookup_id,
      garment_model_lookup_id: form.garment_model_lookup_id,
      image: form.image,
      sizes: sortSizesByLookup(uniqueList(form.sizes), sizes),
      variants: form.variants
        .map((variant) => ({
          ...variant,
          name: normalizeText(variant.name),
          supplier_sku: normalizeText(variant.supplier_sku),
        }))
        .filter((variant) => variant.name),
      default_placements: uniqueList(form.default_placements),
      default_production_methods: uniqueList(form.default_production_methods),
      notes: form.notes,
      active: form.active,
    };

    try {
      setIsSaving(true);

      if (editingId) {
        await updateGarmentLibraryItem(editingId, payload);
      } else {
        await createGarmentLibraryItem(payload);
      }

      resetForm();
    } catch (error) {
      console.error("Unable to save garment library item", error);
      setSaveError("Unable to save this garment right now. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="products-page">
      <div className="products-workspace">
        <form ref={editorRef} onSubmit={handleSubmit} className={`products-editor ${editingId ? "is-editing" : ""}`}>
          <div style={{ display: "grid", gap: "10px" }}>
            <p className="products-eyebrow">Garment Library</p>
            <h1 style={{ margin: 0 }}>{editingId ? "Edit Garment" : "Manage Supplier Garments"}</h1>
            <p style={{ margin: 0, color: "#64748b" }}>
              Build reusable supplier garments here, then publish simplified customer products from them.
            </p>
          </div>

          {saveError ? <div className="products-error-banner">{saveError}</div> : null}

          <label style={labelStyle}>
            Garment Title
            <input
              name="title"
              value={form.title}
              onChange={updateField}
              placeholder="Richardson 112 Trucker"
              required
              style={fieldStyle}
            />
          </label>

          <div className="products-editor-grid">
            <label style={labelStyle}>
              Category
              <select
                name="category_lookup_id"
                value={form.category_lookup_id}
                onChange={updateField}
                style={fieldStyle}
              >
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              Brand
              <select
                name="brand_lookup_id"
                value={form.brand_lookup_id}
                onChange={updateField}
                style={fieldStyle}
              >
                <option value="">Select brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="products-inline-create-panel">
            <input
              value={brandDraft}
              onChange={(event) => setBrandDraft(event.target.value)}
              placeholder="Create new brand"
              style={{ ...fieldStyle, flex: 1 }}
            />
            <button type="button" className="products-inline-save" onClick={handleCreateBrand}>
              Save Brand
            </button>
          </div>

          <SearchableLookupField
            label="Garment Model"
            value={form.garmentSearch}
            onChange={handleGarmentModelSearchChange}
            onSelect={handleGarmentModelSelect}
            options={filteredModels}
            placeholder="Search garment models"
            helperText="Models stay normalized and reusable across the garment library and customer catalog."
            renderOptionLabel={(model) => buildGarmentModelLabel(model, brands, categories)}
            renderOptionMeta={(model) => {
              const brand = findLookupById(brands, model.brand_id);
              return [brand?.name, model.model_code].filter(Boolean).join(" • ");
            }}
          />

          <div className="products-inline-model-panel">
            <div className="products-inline-model-grid">
              <input
                value={modelDraft.display_name}
                onChange={(event) =>
                  setModelDraft((current) => ({ ...current, display_name: event.target.value }))
                }
                placeholder="New model display name"
                style={fieldStyle}
              />
              <input
                value={modelDraft.model_code}
                onChange={(event) =>
                  setModelDraft((current) => ({ ...current, model_code: event.target.value }))
                }
                placeholder="Model code"
                style={fieldStyle}
              />
            </div>
            <button type="button" className="products-inline-save" onClick={handleCreateModel}>
              Create Garment Model
            </button>
          </div>

          <ProductImageUploader
            image={form.image}
            onImageChange={(image) => setForm((current) => ({ ...current, image }))}
          />

          <MultiSelectLookupField
            label="Available Sizes"
            helperText="This becomes the reusable size run for storefront products built from this garment."
            options={sizes.map((size) => ({ id: size.id, name: size.name }))}
            selectedValues={form.sizes}
            onToggle={toggleSize}
            createHelper="Add a size below if it does not exist yet."
          />

          <div className="products-inline-create-panel">
            <input
              value={sizeDraft}
              onChange={(event) => setSizeDraft(event.target.value)}
              placeholder="Create new size"
              style={{ ...fieldStyle, flex: 1 }}
            />
            <button type="button" className="products-inline-save" onClick={handleCreateSize}>
              Save Size
            </button>
          </div>

          <div className="products-editor-section">
            <div className="products-multiselect-header">
              <strong>Supplier Variants / Colors</strong>
              <p>Large variant lists and supplier SKUs belong here, not on the storefront publishing form.</p>
            </div>

            <div className="products-multiselect-toolbar">
              <input
                type="search"
                value={variantSearch}
                onChange={(event) => setVariantSearch(event.target.value)}
                placeholder="Search variants or supplier SKU"
                style={fieldStyle}
              />
            </div>

            <div className="products-inline-model-grid">
              <input
                value={variantDraft.name}
                onChange={(event) =>
                  setVariantDraft((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Variant name"
                style={fieldStyle}
              />
              <input
                value={variantDraft.supplier_sku}
                onChange={(event) =>
                  setVariantDraft((current) => ({ ...current, supplier_sku: event.target.value }))
                }
                placeholder="Supplier SKU"
                style={fieldStyle}
              />
            </div>
            <button type="button" className="products-inline-save" onClick={addVariant}>
              Add Variant
            </button>

            <div className="products-variant-list">
              {visibleVariants.length ? (
                visibleVariants.map((variant) => (
                  <div key={variant.id} className="products-variant-row">
                    <input
                      value={variant.name}
                      onChange={(event) => updateVariant(variant.id, { name: event.target.value })}
                      style={fieldStyle}
                    />
                    <input
                      value={variant.supplier_sku}
                      onChange={(event) =>
                        updateVariant(variant.id, { supplier_sku: event.target.value })
                      }
                      placeholder="Supplier SKU"
                      style={fieldStyle}
                    />
                    <label className="products-inline-toggle">
                      <input
                        type="checkbox"
                        checked={variant.active !== false}
                        onChange={(event) => updateVariant(variant.id, { active: event.target.checked })}
                      />
                      <span>Active</span>
                    </label>
                    <button
                      type="button"
                      className="products-inline-cancel"
                      onClick={() => removeVariant(variant.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              ) : (
                <div className="products-selection-empty">No variants added yet.</div>
              )}
            </div>
          </div>

          <details className="products-editor-section products-advanced-section" open>
            <summary className="products-advanced-summary">
              <div>
                <strong>Garment Defaults</strong>
                <span>Store reusable production defaults here so storefront products can inherit them.</span>
              </div>
            </summary>

            <div className="products-advanced-stack">
              <div className="products-advanced-subsection">
                <strong>Default Placements</strong>
                <div className="products-selection-chip-row">
                  {COMMON_PLACEMENT_OPTIONS.map((placement) => {
                    const active = form.default_placements.some(
                      (selected) => normalizeTextKey(selected) === normalizeTextKey(placement)
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
              </div>

              <div className="products-advanced-subsection">
                <strong>Default Production Methods</strong>
                <div className="products-selection-chip-row">
                  {PRODUCTION_TYPES.map((method) => {
                    const active = form.default_production_methods.includes(method);

                    return (
                      <button
                        key={method}
                        type="button"
                        className={`products-placement-chip ${active ? "is-active" : ""}`}
                        onClick={() => toggleProductionMethod(method)}
                      >
                        {method}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </details>

          <label style={labelStyle}>
            Notes
            <textarea
              name="notes"
              value={form.notes}
              onChange={updateField}
              placeholder="Supplier or garment setup notes."
              style={{ ...fieldStyle, minHeight: "96px", resize: "vertical" }}
            />
          </label>

          <label style={labelStyle}>
            Active
            <input type="checkbox" name="active" checked={form.active} onChange={updateField} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: editingId ? "1fr 1fr" : "1fr", gap: "10px" }}>
            <button type="submit" disabled={isSaving} className="products-primary-button">
              {isSaving ? "Saving..." : editingId ? "Update Garment" : "Save Garment"}
            </button>

            {editingId ? (
              <button type="button" onClick={resetForm} className="products-secondary-button">
                Cancel Editing
              </button>
            ) : null}
          </div>
        </form>

        <section className="products-catalog-panel">
          <div className="products-catalog-header">
            <div>
              <p className="products-eyebrow">Supplier Library</p>
              <h2 style={{ margin: "6px 0 0" }}>Reusable garments</h2>
            </div>

            <div className="products-stat-row">
              <div className="products-stat-card">
                <span>Total Garments</span>
                <strong>{garments.length}</strong>
              </div>
              <div className="products-stat-card">
                <span>Published Products</span>
                <strong>{products.length}</strong>
              </div>
            </div>
          </div>

          <div className="products-toolbar">
            <label className="products-toolbar-field">
              <span>Search Garments</span>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search garment title"
                style={fieldStyle}
              />
            </label>
          </div>

          <div className="products-list-scroll">
            <div className="products-list-grid">
              {filteredGarments.map((item) => {
                const linkedProductCount = products.filter(
                  (product) => product.garment_model_lookup_id === item.garment_model_lookup_id
                ).length;

                return (
                  <article key={item.id} className={`products-card ${editingId === item.id ? "is-active" : ""}`}>
                    <div className="products-card-media">
                      {item.image ? (
                        <img src={item.image} alt={item.title} className="products-card-image" />
                      ) : (
                        <div className="products-card-image-placeholder">No Image</div>
                      )}
                    </div>

                    <div className="products-card-body">
                      <div className="products-card-topline">
                        <div style={{ minWidth: 0 }}>
                          <h3 style={{ margin: 0 }}>{item.title}</h3>
                          <p className="products-card-subtitle">
                            {buildGarmentLibraryLabel(item, brands, categories, garmentModels)}
                          </p>
                        </div>
                      </div>

                      <div className="products-card-detail-grid">
                        <div className="products-card-detail">
                          <span>Variants</span>
                          <strong>{(item.variants || []).length}</strong>
                        </div>
                        <div className="products-card-detail">
                          <span>Sizes</span>
                          <strong>{(item.sizes || []).join(", ") || "None"}</strong>
                        </div>
                        <div className="products-card-detail">
                          <span>Defaults</span>
                          <strong>{(item.default_production_methods || []).join(", ") || "None"}</strong>
                        </div>
                        <div className="products-card-detail">
                          <span>Published</span>
                          <strong>{linkedProductCount} products</strong>
                        </div>
                      </div>
                    </div>

                    <div className="products-card-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setForm(buildFormFromGarment(item, brands, categories, garmentModels, sizes));
                          editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className="products-card-button"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteGarmentLibraryItem(item.id)}
                        className="products-card-button products-card-button-danger"
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
