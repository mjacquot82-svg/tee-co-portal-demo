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
import { parseTeeCoGarmentSpreadsheet } from "../lib/teeCoGarmentSpreadsheet";
import {
  buildGarmentLibraryLabel,
  buildGarmentModelLabel,
  fieldStyle,
  findLookupByName,
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

const EMPTY_LIST = [];

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
  const garmentModel = findLookupById(garmentModels, item?.garment_model_lookup_id);

  return {
    ...emptyLibraryForm,
    ...item,
    garmentSearch: buildGarmentModelLabel(garmentModel, brands, categories),
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

function buildModelDraftFromModel(model, fallbackBrandId = "") {
  return {
    brand_id: model?.brand_id || fallbackBrandId || "",
    display_name: model?.display_name || "",
    model_code: model?.model_code || "",
  };
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Unable to read file: ${file?.name || "spreadsheet"}`));
    reader.readAsText(file);
  });
}

function buildLookupNameMap(options = []) {
  return options.reduce((accumulator, option) => {
    const key = normalizeTextKey(option?.name);
    if (key) {
      accumulator.set(key, option);
    }
    return accumulator;
  }, new Map());
}

function buildGarmentModelMap(options = []) {
  return options.reduce((accumulator, option) => {
    const key = [
      option?.brand_id || "",
      option?.category_id || "",
      normalizeTextKey(option?.display_name),
      normalizeTextKey(option?.model_code),
    ].join("::");
    accumulator.set(key, option);
    return accumulator;
  }, new Map());
}

function buildGarmentMap(items = []) {
  return items.reduce((accumulator, item) => {
    const key = [item?.brand_lookup_id || "", normalizeTextKey(item?.title)].join("::");
    accumulator.set(key, item);
    return accumulator;
  }, new Map());
}

export default function GarmentLibrary() {
  const editorRef = useRef(null);
  const garments = useGarmentLibraryItems();
  const products = useStoredProducts();
  const lookups = useCatalogLookups();
  const categories = lookups.categories ?? EMPTY_LIST;
  const brands = lookups.brands ?? EMPTY_LIST;
  const sizes = lookups.sizes ?? EMPTY_LIST;
  const garmentModels = lookups.garment_models ?? EMPTY_LIST;
  const [form, setForm] = useState(emptyLibraryForm);
  const [editingId, setEditingId] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [variantSearch, setVariantSearch] = useState("");
  const [variantDraft, setVariantDraft] = useState(buildVariantDraft());
  const [brandDraft, setBrandDraft] = useState("");
  const [sizeDraft, setSizeDraft] = useState("");
  const [modelDraft, setModelDraft] = useState(buildModelDraftFromModel());
  const [importError, setImportError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [isPreparingImport, setIsPreparingImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);

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
  const garmentPreviewMap = useMemo(() => buildGarmentMap(garments), [garments]);
  const previewGarments = useMemo(() => {
    if (!importPreview) return [];

    return importPreview.garments.map((group) => {
      const brandLookup = findLookupByName(brands, group.brand);
      const existingGarment =
        brandLookup &&
        garmentPreviewMap.get([brandLookup.id, normalizeTextKey(group.title)].join("::"));
      const existingVariantNames = new Set(
        (existingGarment?.variants || []).map((variant) => normalizeTextKey(variant?.name))
      );
      const missingVariants = group.variants.filter(
        (variant) => !existingVariantNames.has(normalizeTextKey(variant.name))
      );

      return {
        ...group,
        existingGarment,
        existingVariantCount: group.variants.length - missingVariants.length,
        missingVariants,
      };
    });
  }, [brands, garmentPreviewMap, importPreview]);
  const importablePreviewCount = previewGarments.filter((group) => group.skip !== true).length;

  function resetForm() {
    setForm(emptyLibraryForm);
    setEditingId(null);
    setSaveError("");
    setVariantDraft(buildVariantDraft());
    setBrandDraft("");
    setSizeDraft("");
    setModelDraft(buildModelDraftFromModel());
    setVariantSearch("");
  }

  function clearImportPreview() {
    setImportPreview(null);
    setImportError("");
    setImportNotice("");
  }

  function updateField(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => {
      const nextValue = type === "checkbox" ? checked : value;
      const nextForm = {
        ...current,
        [name]: nextValue,
      };

      if ((name === "brand_lookup_id" || name === "category_lookup_id") && current.garment_model_lookup_id) {
        const selectedModel = garmentModels.find((model) => model.id === current.garment_model_lookup_id);
        const nextBrandId = name === "brand_lookup_id" ? nextValue : nextForm.brand_lookup_id;
        const nextCategoryId = name === "category_lookup_id" ? nextValue : nextForm.category_lookup_id;

        if (
          selectedModel &&
          (selectedModel.brand_id !== nextBrandId || selectedModel.category_id !== nextCategoryId)
        ) {
          nextForm.garment_model_lookup_id = "";
          nextForm.garmentSearch = "";
        }
      }

      return nextForm;
    });

    if (name === "brand_lookup_id") {
      setModelDraft((current) => ({ ...current, brand_id: value }));
    }
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
    setModelDraft(buildModelDraftFromModel(model, brand?.id || ""));
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
    setModelDraft((current) => ({ ...current, brand_id: created.id }));
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

  async function resolveGarmentModelForSave() {
    const displayName = normalizeText(modelDraft.display_name);
    const modelCode = normalizeText(modelDraft.model_code);
    const brandId = form.brand_lookup_id || modelDraft.brand_id;
    const categoryId = form.category_lookup_id;
    const selectedModel = garmentModels.find((model) => model.id === form.garment_model_lookup_id);

    if (!displayName || !brandId || !categoryId) {
      throw new Error("Choose a category, brand, and garment model details before saving.");
    }

    const selectedStillMatches =
      selectedModel &&
      selectedModel.brand_id === brandId &&
      selectedModel.category_id === categoryId &&
      normalizeTextKey(selectedModel.display_name) === normalizeTextKey(displayName) &&
      normalizeTextKey(selectedModel.model_code) === normalizeTextKey(modelCode);

    if (selectedStillMatches) {
      return selectedModel;
    }

    const matchingModel = garmentModels.find(
      (model) =>
        model.brand_id === brandId &&
        model.category_id === categoryId &&
        normalizeTextKey(model.display_name) === normalizeTextKey(displayName) &&
        normalizeTextKey(model.model_code) === normalizeTextKey(modelCode)
    );

    if (matchingModel) {
      return matchingModel;
    }

    return createCatalogLookup("garment_models", {
      brand_id: brandId,
      model_code: modelCode,
      display_name: displayName,
      category_id: categoryId,
      active: true,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError("");

    try {
      setIsSaving(true);
      const garmentModel = await resolveGarmentModelForSave();
      const brand = findLookupById(brands, garmentModel.brand_id);
      const fallbackTitle = [brand?.name, garmentModel.model_code, garmentModel.display_name]
        .filter(Boolean)
        .join(" ");
      const payload = {
        title: normalizeText(form.title) || fallbackTitle,
        category_lookup_id: form.category_lookup_id,
        brand_lookup_id: form.brand_lookup_id,
        garment_model_lookup_id: garmentModel.id,
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

      if (editingId) {
        await updateGarmentLibraryItem(editingId, payload);
      } else {
        await createGarmentLibraryItem(payload);
      }

      resetForm();
    } catch (error) {
      console.error("Unable to save garment library item", error);
      setSaveError(error?.message || "Unable to save this garment right now. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleImportFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportError("");
    setImportNotice("");
    setIsPreparingImport(true);

    try {
      if (!String(file.name || "").toLowerCase().endsWith(".csv")) {
        throw new Error("Only the Tee & Co CSV spreadsheet format is supported.");
      }

      const fileContents = await readFileAsText(file);
      const parsed = parseTeeCoGarmentSpreadsheet(fileContents);

      setImportPreview({
        fileName: file.name,
        garments: parsed.garments.map((group) => ({ ...group, skip: false })),
        garmentCount: parsed.garmentCount,
        rowCount: parsed.rowCount,
      });
    } catch (error) {
      setImportPreview(null);
      setImportError(error?.message || "Unable to prepare this spreadsheet.");
    } finally {
      setIsPreparingImport(false);
    }
  }

  function toggleImportSkip(groupId) {
    setImportPreview((current) => {
      if (!current) return current;

      return {
        ...current,
        garments: current.garments.map((group) =>
          group.id === groupId ? { ...group, skip: !group.skip } : group
        ),
      };
    });
  }

  async function handleConfirmImport() {
    if (!importPreview) return;

    setImportError("");
    setImportNotice("");
    setIsImporting(true);

    try {
      const categoryMap = buildLookupNameMap(categories);
      const brandMap = buildLookupNameMap(brands);
      const garmentModelMap = buildGarmentModelMap(garmentModels);
      const garmentMap = buildGarmentMap(garments);

      let createdGarments = 0;
      let updatedGarments = 0;
      let addedVariants = 0;
      let skippedVariants = 0;

      for (const previewGroup of importPreview.garments) {
        if (previewGroup.skip) continue;

        let category = categoryMap.get(normalizeTextKey(previewGroup.category));
        if (!category) {
          category = await createCatalogLookup("categories", {
            name: previewGroup.category,
            active: true,
          });
          categoryMap.set(normalizeTextKey(category.name), category);
        }

        let brand = brandMap.get(normalizeTextKey(previewGroup.brand));
        if (!brand) {
          brand = await createCatalogLookup("brands", {
            name: previewGroup.brand,
            active: true,
          });
          brandMap.set(normalizeTextKey(brand.name), brand);
        }

        const garmentKey = [brand.id, normalizeTextKey(previewGroup.title)].join("::");
        const existingGarment = garmentMap.get(garmentKey) || null;
        let garmentModelId = existingGarment?.garment_model_lookup_id || "";

        if (!garmentModelId) {
          const modelKey = [brand.id, category.id, normalizeTextKey(previewGroup.productName), ""].join("::");
          let garmentModel = garmentModelMap.get(modelKey);

          if (!garmentModel) {
            garmentModel = await createCatalogLookup("garment_models", {
              brand_id: brand.id,
              model_code: "",
              display_name: previewGroup.productName,
              category_id: category.id,
              active: true,
            });
            garmentModelMap.set(modelKey, garmentModel);
          }

          garmentModelId = garmentModel.id;
        }

        const existingVariantNames = new Set(
          (existingGarment?.variants || []).map((variant) => normalizeTextKey(variant?.name))
        );
        const nextVariants = [...(existingGarment?.variants || [])];

        previewGroup.variants.forEach((variant) => {
          const variantKey = normalizeTextKey(variant.name);
          if (existingVariantNames.has(variantKey)) {
            skippedVariants += 1;
            return;
          }

          existingVariantNames.add(variantKey);
          nextVariants.push({
            id: `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: variant.name,
            supplier_sku: variant.supplierSku,
            active: true,
          });
          addedVariants += 1;
        });

        if (existingGarment) {
          const shouldUpdate =
            nextVariants.length !== (existingGarment.variants || []).length ||
            !existingGarment.category_lookup_id ||
            !existingGarment.brand_lookup_id ||
            existingGarment.garment_model_lookup_id !== garmentModelId;

          if (shouldUpdate) {
            await updateGarmentLibraryItem(existingGarment.id, {
              category_lookup_id: existingGarment.category_lookup_id || category.id,
              brand_lookup_id: existingGarment.brand_lookup_id || brand.id,
              garment_model_lookup_id: garmentModelId,
              variants: nextVariants,
            });
            updatedGarments += 1;
          }
          continue;
        }

        await createGarmentLibraryItem({
          title: previewGroup.title,
          category_lookup_id: category.id,
          brand_lookup_id: brand.id,
          garment_model_lookup_id: garmentModelId,
          image: "",
          variants: nextVariants,
          sizes: [],
          default_placements: [],
          default_production_methods: [],
          notes: "",
          active: true,
        });
        createdGarments += 1;
      }

      setImportNotice(
        `Import complete. ${createdGarments} garments created, ${updatedGarments} garments updated, ${addedVariants} variants added, ${skippedVariants} duplicate variants skipped.`
      );
      setImportPreview(null);
    } catch (error) {
      setImportError(error?.message || "Import failed before completion.");
    } finally {
      setIsImporting(false);
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
          {importError ? <div className="products-error-banner">{importError}</div> : null}
          {importNotice ? <div className="products-callout">{importNotice}</div> : null}

          <section className="products-editor-section">
            <div className="products-section-header">
              <div>
                <p className="products-section-step">Import</p>
                <h2>Tee &amp; Co Spreadsheet Importer</h2>
              </div>
              <p>
                Upload the current Tee &amp; Co supplier CSV, review garments grouped by brand and product name,
                then confirm what should import into the Garment Library.
              </p>
            </div>

            <div className="products-import-shell">
              <label style={labelStyle}>
                Upload Tee &amp; Co CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleImportFileChange}
                  style={fieldStyle}
                  disabled={isPreparingImport || isImporting}
                />
              </label>

              <p className="products-selection-empty">
                Required columns: Category, Brand, Supplier SKU, Product Name, Variant/Color. Extra
                columns after these are ignored.
              </p>

              {isPreparingImport ? <div className="products-summary-card">Preparing import preview...</div> : null}

              {importPreview ? (
                <div className="products-import-preview">
                  <div className="products-status-row">
                    <span>
                      {importPreview.fileName} • {importPreview.garmentCount} garments • {importPreview.rowCount} rows
                    </span>
                    <span>{importablePreviewCount} garments selected</span>
                  </div>

                  <div className="products-import-group-list">
                    {previewGarments.map((group) => (
                      <article
                        key={group.id}
                        className={`products-import-group-card ${group.skip ? "is-skipped" : ""}`}
                      >
                        <div className="products-import-group-header">
                          <div style={{ minWidth: 0 }}>
                            <h3 style={{ margin: 0 }}>{group.title}</h3>
                            <p className="products-card-subtitle">
                              {group.category} • {group.variantCount} variants detected
                              {group.duplicateRowCount ? ` • ${group.duplicateRowCount} duplicate rows ignored` : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="products-inline-cancel"
                            onClick={() => toggleImportSkip(group.id)}
                          >
                            {group.skip ? "Import Garment" : "Skip Garment"}
                          </button>
                        </div>

                        <div className="products-summary-meta">
                          <span>
                            {group.existingGarment
                              ? `Existing garment found • ${group.existingVariantCount} duplicate variants • ${group.missingVariants.length} variants to add`
                              : "New garment will be created"}
                          </span>
                        </div>

                        <div className="products-import-variant-list">
                          {group.variants.map((variant) => {
                            const isExistingVariant =
                              !!group.existingGarment &&
                              !group.missingVariants.some(
                                (item) => normalizeTextKey(item.name) === normalizeTextKey(variant.name)
                              );

                            return (
                              <div key={`${group.id}-${variant.name}`} className="products-import-variant-row">
                                <strong>{variant.name}</strong>
                                <span>{variant.supplierSku}</span>
                                <span>{isExistingVariant ? "Duplicate variant" : "New variant"}</span>
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="products-import-actions">
                    <button
                      type="button"
                      className="products-primary-button"
                      onClick={handleConfirmImport}
                      disabled={isImporting || !importablePreviewCount}
                    >
                      {isImporting ? "Importing..." : "Confirm Import"}
                    </button>
                    <button type="button" className="products-secondary-button" onClick={clearImportPreview}>
                      Cancel Import
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="products-editor-section">
            <div className="products-section-header">
              <div>
                <p className="products-section-step">Section 1</p>
                <h2>Basic Garment Info</h2>
              </div>
              <p>Set the core garment details first, then finish the rest of the setup before saving.</p>
            </div>

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

            <details className="products-helper-details">
              <summary className="products-helper-summary">Add a new brand</summary>
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
            </details>

            <div className="products-inline-model-grid">
              <label style={labelStyle}>
                Garment Model Name
                <input
                  value={modelDraft.display_name}
                  onChange={(event) =>
                    setModelDraft((current) => ({ ...current, display_name: event.target.value }))
                  }
                  placeholder="Unisex Jersey Tee"
                  style={fieldStyle}
                />
              </label>
              <label style={labelStyle}>
                Garment Model Code
                <input
                  value={modelDraft.model_code}
                  onChange={(event) =>
                    setModelDraft((current) => ({ ...current, model_code: event.target.value }))
                  }
                  placeholder="3001"
                  style={fieldStyle}
                />
              </label>
            </div>

            <label style={labelStyle}>
              Garment Display Name
              <input
                name="title"
                value={form.title}
                onChange={updateField}
                placeholder="Richardson 112 Trucker"
                style={fieldStyle}
              />
            </label>

            <SearchableLookupField
              label="Use Existing Garment Model (Optional)"
              value={form.garmentSearch}
              onChange={handleGarmentModelSearchChange}
              onSelect={handleGarmentModelSelect}
              options={filteredModels}
              placeholder="Search existing garment models"
              helperText="If you pick an existing model, Save Garment will reuse it. If not, the model name and code above will be saved as a new garment model."
              renderOptionLabel={(model) => buildGarmentModelLabel(model, brands, categories)}
              renderOptionMeta={(model) => {
                const brand = findLookupById(brands, model.brand_id);
                return [brand?.name, model.model_code].filter(Boolean).join(" • ");
              }}
            />

            <ProductImageUploader
              image={form.image}
              onImageChange={(image) => setForm((current) => ({ ...current, image }))}
            />
          </section>

          <section className="products-editor-section">
            <div className="products-section-header">
              <div>
                <p className="products-section-step">Section 2</p>
                <h2>Available Sizes</h2>
              </div>
              <p>Select the size run this garment should support.</p>
            </div>

            <MultiSelectLookupField
              label="Available Sizes"
              helperText="This becomes the reusable size run for storefront products built from this garment."
              options={sizes.map((size) => ({ id: size.id, name: size.name }))}
              selectedValues={form.sizes}
              onToggle={toggleSize}
              createHelper="Add a size below if it does not exist yet."
            />

            <details className="products-helper-details">
              <summary className="products-helper-summary">Add a new size</summary>
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
            </details>
          </section>

          <section className="products-editor-section">
            <div className="products-section-header">
              <div>
                <p className="products-section-step">Section 3</p>
                <h2>Supplier Variants / Colors</h2>
              </div>
              <p>Capture supplier-facing colors and SKUs without interrupting the main setup flow.</p>
            </div>

            <div className="products-multiselect-header">
              <strong>Variant List</strong>
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
          </section>

          <details className="products-editor-section products-advanced-section" open>
            <summary className="products-advanced-summary">
              <div>
                <p className="products-section-step">Section 4</p>
                <strong>Garment Defaults</strong>
                <span>Store reusable placements and production defaults here so storefront products can inherit them.</span>
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

          <section className="products-editor-section">
            <div className="products-section-header">
              <div>
                <p className="products-section-step">Section 5</p>
                <h2>Notes / Active Status</h2>
              </div>
              <p>Leave internal setup notes here and control whether this garment stays active.</p>
            </div>

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

            <label className="products-status-row">
              <span>Active Garment</span>
              <input type="checkbox" name="active" checked={form.active} onChange={updateField} />
            </label>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: editingId ? "1fr 1fr" : "1fr", gap: "10px" }}>
            <button type="submit" disabled={isSaving} className="products-primary-button">
              {isSaving ? "Saving..." : "Save Garment"}
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
                          setModelDraft(
                            buildModelDraftFromModel(
                              findLookupById(garmentModels, item.garment_model_lookup_id),
                              item.brand_lookup_id
                            )
                          );
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
