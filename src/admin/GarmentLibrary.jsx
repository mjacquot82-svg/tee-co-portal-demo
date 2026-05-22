import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import "./Products.css";
import NoImagePlaceholder from "../components/NoImagePlaceholder";
import ProductImageUploader from "../components/ProductImageUploader";
import { PRODUCTION_TYPES } from "../constants/productionTypes";
import { createCatalogLookup, useCatalogLookups } from "../lib/catalogLookupsStore";
import {
  arePlacementListsEqual,
  getPlacementOptionsForGarment,
  getSuggestedGarmentPlacements,
} from "../lib/garmentPlacementDefaults";
import {
  createGarmentLibraryItem,
  deleteGarmentLibraryItem,
  updateGarmentLibraryItem,
  useGarmentLibraryItems,
} from "../lib/garmentLibraryStore";
import { buildGarmentUsageMap } from "../lib/productGarmentLinks";
import { useStoredProducts } from "../lib/productsStore";
import { parseTeeCoGarmentSpreadsheet } from "../lib/teeCoGarmentSpreadsheet";
import {
  buildGarmentLibraryLabel,
  fieldStyle,
  findLookupByName,
  findLookupById,
  labelStyle,
  MultiSelectLookupField,
  normalizeText,
  normalizeTextKey,
  sortSizesByLookup,
  uniqueList,
} from "./catalogShared";

const EMPTY_LIST = [];
const GARMENT_SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "alphabetical", label: "Alphabetical" },
  { value: "most-variants", label: "Most Variants" },
  { value: "least-variants", label: "Least Variants" },
  { value: "most-storefront", label: "Most Used In Storefront" },
];

const EMPTY_GARMENT_USAGE = Object.freeze({
  linkedProductCount: 0,
});
const emptyLibraryForm = {
  title: "",
  category_lookup_id: "",
  brand_lookup_id: "",
  garment_model_lookup_id: "",
  image: "",
  sizes: [],
  variants: [],
  default_placements: [],
  default_production_methods: ["Screen Print"],
  notes: "",
  active: true,
};

function getGarmentModeLabel(itemTitle) {
  return normalizeText(itemTitle) || "Selected Garment";
}

function buildFormFromGarment(item, brands, categories, garmentModels, sizeLookups) {
  return {
    ...emptyLibraryForm,
    ...item,
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

function buildGarmentDisplayName(model, brand) {
  if (!model) return "";

  const brandName = normalizeText(brand?.name);
  const modelName = normalizeText(model?.display_name);
  const modelCode = normalizeText(model?.model_code);
  const baseLabel = [brandName, modelName].filter(Boolean).join(" ");

  return modelCode ? `${baseLabel} - ${modelCode}` : baseLabel;
}

function buildImportedGarmentOptionLabel(item, model) {
  const modelCode = normalizeText(model?.model_code);
  const modelName = normalizeText(model?.display_name);
  const garmentTitle = normalizeText(item?.title);

  if (modelCode && modelName) {
    return `${modelCode} - ${modelName}`;
  }

  return modelCode || modelName || garmentTitle || "Untitled Garment";
}

function inferImportedGarmentBrandName(item, model) {
  const title = normalizeText(item?.title);
  const modelName = normalizeText(model?.display_name);

  if (!title || !modelName) {
    return "";
  }

  const normalizedTitle = normalizeTextKey(title);
  const normalizedModelName = normalizeTextKey(modelName);

  if (!normalizedTitle.endsWith(normalizedModelName)) {
    return "";
  }

  return normalizeText(title.slice(0, title.length - modelName.length));
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

function resolveGarmentBrandId(garment, garmentModelMap) {
  const directBrandId = normalizeText(garment?.brand_lookup_id);
  if (directBrandId) {
    return directBrandId;
  }

  const garmentModel = garmentModelMap.get(garment?.garment_model_lookup_id);
  return normalizeText(garmentModel?.brand_id);
}

function buildActiveLibraryBrandIds(garments = [], garmentModelMap = new Map()) {
  const brandIds = new Set();

  garments.forEach((garment) => {
    if (garment?.active === false) return;

    const resolvedBrandId = resolveGarmentBrandId(garment, garmentModelMap);
    if (resolvedBrandId) {
      brandIds.add(resolvedBrandId);
    }
  });

  return brandIds;
}

function buildBrandSelectOptionsFromVisibleGarments(
  visibleGarmentEntries = [],
  garmentBrowseItems = [],
  brands = [],
  selectedBrandId = ""
) {
  const optionsByBrandName = new Map();

  visibleGarmentEntries.forEach((entry) => {
    if (entry?.item?.active === false) return;

    const label = normalizeText(entry?.brandName);
    if (!label) return;

    const labelKey = normalizeTextKey(label);
    if (optionsByBrandName.has(labelKey)) return;

    optionsByBrandName.set(labelKey, {
      value: normalizeText(entry?.brandId) || label,
      label,
    });
  });

  if (selectedBrandId) {
    const selectedBrand = brands.find((brand) => brand.id === selectedBrandId);
    const selectedLabel =
      normalizeText(selectedBrand?.name) ||
      normalizeText(
        garmentBrowseItems.find((entry) => normalizeText(entry?.brandId) === selectedBrandId)?.brandName
      );
    const selectedKey = normalizeTextKey(selectedLabel);

    if (selectedLabel && selectedKey && !optionsByBrandName.has(selectedKey)) {
      optionsByBrandName.set(selectedKey, {
        value: selectedBrandId,
        label: selectedLabel,
      });
    }
  }

  return Array.from(optionsByBrandName.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function buildImportWarningSummary(warnings = []) {
  const summary = {
    total: warnings.length,
    missingCategory: 0,
    missingBrand: 0,
    missingSupplierSku: 0,
    missingProductName: 0,
    missingVariant: 0,
    categoryMismatch: 0,
    conflictingSku: 0,
    other: 0,
  };

  warnings.forEach((warning) => {
    if (warning.includes("Category is required")) {
      summary.missingCategory += 1;
      return;
    }
    if (warning.includes("Brand is required")) {
      summary.missingBrand += 1;
      return;
    }
    if (warning.includes("Supplier SKU is required")) {
      summary.missingSupplierSku += 1;
      return;
    }
    if (warning.includes("Product Name is required")) {
      summary.missingProductName += 1;
      return;
    }
    if (warning.includes("Variant/Color is required")) {
      summary.missingVariant += 1;
      return;
    }
    if (warning.includes("Category does not match other rows")) {
      summary.categoryMismatch += 1;
      return;
    }
    if (warning.includes("conflicting Supplier SKU values")) {
      summary.conflictingSku += 1;
      return;
    }
    summary.other += 1;
  });

  return Object.entries(summary)
    .filter(([key, value]) => key === "total" || value > 0)
    .map(([key, value]) => ({
      key,
      value,
      label:
        {
          total: "total warnings",
          missingCategory: "missing Category",
          missingBrand: "missing Brand",
          missingSupplierSku: "missing Supplier SKU",
          missingProductName: "missing Product Name",
          missingVariant: "missing Variant/Color",
          categoryMismatch: "category mismatches",
          conflictingSku: "conflicting SKU rows",
          other: "other issues",
        }[key] || key,
    }));
}

function buildLookupOptionMap(options = []) {
  return options.reduce((accumulator, option) => {
    if (option?.id) {
      accumulator.set(option.id, option);
    }
    return accumulator;
  }, new Map());
}

function getGarmentStorefrontUsageMatch(filterValue, usage) {
  if (filterValue === "used") {
    return usage.linkedProductCount > 0;
  }

  if (filterValue === "unused") {
    return usage.linkedProductCount === 0;
  }

  return true;
}

function logGarmentDerivationError(stage, error, context = {}) {
  console.error(`[GarmentLibrary] ${stage} failed`, error);
  console.error(`[GarmentLibrary] ${stage} stack`, error?.stack);
  console.error(`[GarmentLibrary] ${stage} context`, context);
}

const GarmentLibraryCard = memo(function GarmentLibraryCard({
  item,
  isSelected,
  subtitle,
  usage,
  onSelect,
  onRemove,
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const imageSrc = normalizeText(item.imageSrc);
  const showUploadedImage = Boolean(imageSrc) && !hasImageError;

  useEffect(() => {
    setHasImageError(false);
  }, [imageSrc, item.id, item.title]);

  function handleKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  }

  return (
    <article
      className={`products-card ${isSelected ? "is-active" : ""}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
    >
      <div className="products-card-media garment-library-card-media">
        {showUploadedImage ? (
          <img
            key={`${item.id || item.title}-${imageSrc}`}
            src={imageSrc}
            alt={item.title}
            className="products-card-image"
            onError={() => {
              setHasImageError(true);
            }}
          />
        ) : (
          <NoImagePlaceholder className="products-card-image-placeholder garment-library-card-image-placeholder" />
        )}
      </div>

      <div className="products-card-body">
        <div className="products-card-topline">
          <div style={{ minWidth: 0 }}>
            <div className="products-card-title-row">
              <h3 style={{ margin: 0 }}>{item.title}</h3>
              {isSelected ? <span className="products-card-editing-pill">Selected</span> : null}
            </div>
            <p className="products-card-subtitle">{subtitle}</p>
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
            <span>Storefront Usage</span>
            <strong>{usage.linkedProductCount} linked product{usage.linkedProductCount === 1 ? "" : "s"}</strong>
          </div>
        </div>
      </div>

      <div className="products-card-actions">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          className="products-card-button"
        >
          {isSelected ? "Editing" : "Edit"}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="products-card-button products-card-button-danger"
        >
          Remove
        </button>
      </div>
    </article>
  );
});

export default function GarmentLibrary() {
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
  const [createMode, setCreateMode] = useState("imported");
  const [selectedReusableGarmentId, setSelectedReusableGarmentId] = useState("");
  const [importError, setImportError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [importWarnings, setImportWarnings] = useState([]);
  const [isPreparingImport, setIsPreparingImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [expandedImportGroups, setExpandedImportGroups] = useState({});
  const [showImportWarningDetails, setShowImportWarningDetails] = useState(false);
  const [importPreviewSearch, setImportPreviewSearch] = useState("");
  const [importPreviewCategoryFilter, setImportPreviewCategoryFilter] = useState("all");
  const [importPreviewStatusFilter, setImportPreviewStatusFilter] = useState("all");
  const [hasCustomizedPlacements, setHasCustomizedPlacements] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [storefrontUsageFilter, setStorefrontUsageFilter] = useState("all");
  const [sortOption, setSortOption] = useState("newest");
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const repairingBrandIdsRef = useRef(new Set());
  const brandSelectRef = useRef(null);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const isEditMode = Boolean(editingId);
  const isEditorOpen = activeWorkspace === "create" || activeWorkspace === "edit";
  const isImportOpen = activeWorkspace === "import";

  const categoryMap = useMemo(() => {
    try {
      return buildLookupOptionMap(categories);
    } catch (error) {
      logGarmentDerivationError("categoryMap useMemo", error, { categories });
      return new Map();
    }
  }, [categories]);
  const brandMap = useMemo(() => {
    try {
      return buildLookupOptionMap(brands);
    } catch (error) {
      logGarmentDerivationError("brandMap useMemo", error, { brands });
      return new Map();
    }
  }, [brands]);
  const garmentModelMap = useMemo(() => {
    try {
      return buildLookupOptionMap(garmentModels);
    } catch (error) {
      logGarmentDerivationError("garmentModelMap useMemo", error, { garmentModels });
      return new Map();
    }
  }, [garmentModels]);
  const activeLibraryBrandIds = useMemo(
    () => {
      try {
        return buildActiveLibraryBrandIds(garments, garmentModelMap);
      } catch (error) {
        logGarmentDerivationError("active brand derivation useMemo", error, {
          garments,
          garmentModelMapSize: garmentModelMap.size,
        });
        return new Set();
      }
    },
    [garmentModelMap, garments]
  );
  const garmentUsageMap = useMemo(() => {
    try {
      return buildGarmentUsageMap(products, garments);
    } catch (error) {
      logGarmentDerivationError("garment usage map useMemo", error, { products, garments });
      return new Map();
    }
  }, [garments, products]);
  const garmentBrowseItems = useMemo(
    () => {
      try {
        return garments.map((item, index) => {
          try {
            const resolvedBrandId = resolveGarmentBrandId(item, garmentModelMap);
            const brand = brandMap.get(resolvedBrandId);
            const model = garmentModelMap.get(item.garment_model_lookup_id);
            const usage = garmentUsageMap.get(item.id) || EMPTY_GARMENT_USAGE;

            return {
              item,
              usage,
              brandId: resolvedBrandId,
              sortTitle: normalizeTextKey(item.title),
              createdAt: Date.parse(item.created_at || item.updated_at || 0) || 0,
              variantCount: Array.isArray(item.variants) ? item.variants.length : 0,
              brandName: normalizeText(brand?.name),
              categoryName: normalizeText(categoryMap.get(item.category_lookup_id)?.name),
              modelLabel: normalizeText(model?.display_name),
              modelCode: normalizeText(model?.model_code),
              imageSrc: normalizeText(item?.image),
              subtitle: buildGarmentLibraryLabel(item, brands, categories, garmentModels),
              searchIndex: [
                item.title,
                brand?.name,
                model?.display_name,
                model?.model_code,
                ...((item.variants || []).map((variant) => variant?.name) || []),
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase(),
            };
          } catch (error) {
            logGarmentDerivationError("garmentBrowseItems normalized mapping", error, {
              index,
              garmentId: item?.id,
              garmentTitle: item?.title,
              item,
            });
            return null;
          }
        }).filter(Boolean);
      } catch (error) {
        logGarmentDerivationError("garmentBrowseItems useMemo", error, {
          garments,
          garmentCount: garments.length,
        });
        return EMPTY_LIST;
      }
    },
    [brandMap, brands, categories, categoryMap, garmentModelMap, garmentModels, garmentUsageMap, garments]
  );
  const categoryFilterOptions = useMemo(
    () => {
      try {
        return Array.from(new Set(garmentBrowseItems.map((entry) => entry.categoryName).filter(Boolean))).sort(
          (left, right) => left.localeCompare(right)
        );
      } catch (error) {
        logGarmentDerivationError("category filter options useMemo", error, { garmentBrowseItems });
        return EMPTY_LIST;
      }
    },
    [garmentBrowseItems]
  );
  const brandFilterOptions = useMemo(
    () => {
      try {
        return Array.from(new Set(garmentBrowseItems.map((entry) => entry.brandName).filter(Boolean))).sort(
          (left, right) => left.localeCompare(right)
        );
      } catch (error) {
        logGarmentDerivationError("brand filter options useMemo", error, { garmentBrowseItems });
        return EMPTY_LIST;
      }
    },
    [garmentBrowseItems]
  );
  const filteredGarments = useMemo(() => {
    try {
      const normalizedSearch = deferredSearchTerm.trim().toLowerCase();
      const nextItems = garmentBrowseItems.filter((entry, index) => {
        try {
          if (categoryFilter !== "all" && normalizeTextKey(entry.categoryName) !== normalizeTextKey(categoryFilter)) {
            return false;
          }

          if (brandFilter !== "all" && normalizeTextKey(entry.brandName) !== normalizeTextKey(brandFilter)) {
            return false;
          }

          if (!getGarmentStorefrontUsageMatch(storefrontUsageFilter, entry.usage)) {
            return false;
          }

          if (!normalizedSearch) return true;
          return entry.searchIndex.includes(normalizedSearch);
        } catch (error) {
          logGarmentDerivationError("visible garment filtering", error, {
            index,
            categoryFilter,
            brandFilter,
            storefrontUsageFilter,
            normalizedSearch,
            entry,
          });
          return false;
        }
      });

      try {
        nextItems.sort((left, right) => {
          if (sortOption === "alphabetical") {
            return left.sortTitle.localeCompare(right.sortTitle);
          }

          if (sortOption === "most-variants") {
            return right.variantCount - left.variantCount || left.sortTitle.localeCompare(right.sortTitle);
          }

          if (sortOption === "least-variants") {
            return left.variantCount - right.variantCount || left.sortTitle.localeCompare(right.sortTitle);
          }

          if (sortOption === "most-storefront") {
            return (
              right.usage.linkedProductCount - left.usage.linkedProductCount ||
              left.sortTitle.localeCompare(right.sortTitle)
            );
          }

          return right.createdAt - left.createdAt || left.sortTitle.localeCompare(right.sortTitle);
        });
      } catch (error) {
        logGarmentDerivationError("filtered garments sorting", error, {
          sortOption,
          nextItems,
        });
      }

      return nextItems;
    } catch (error) {
      logGarmentDerivationError("filtered garments useMemo", error, {
        brandFilter,
        categoryFilter,
        deferredSearchTerm,
        garmentBrowseItems,
        storefrontUsageFilter,
        sortOption,
      });
      return EMPTY_LIST;
    }
  }, [brandFilter, categoryFilter, deferredSearchTerm, garmentBrowseItems, storefrontUsageFilter, sortOption]);
  const hasActiveGarmentFilters = Boolean(
    searchTerm.trim() || categoryFilter !== "all" || brandFilter !== "all" || storefrontUsageFilter !== "all"
  );
  const filteredGarmentCount = filteredGarments.length;
  const brandSelectOptions = useMemo(
    () => {
      try {
        return buildBrandSelectOptionsFromVisibleGarments(
          filteredGarments,
          garmentBrowseItems,
          brands,
          form.brand_lookup_id
        );
      } catch (error) {
        logGarmentDerivationError("brand select options useMemo", error, {
          filteredGarments,
          garmentBrowseItems,
          brands,
          selectedBrandId: form.brand_lookup_id,
        });
        return EMPTY_LIST;
      }
    },
    [brands, filteredGarments, form.brand_lookup_id, garmentBrowseItems]
  );
  useEffect(() => {
    try {
      const activeGarments = garments.filter((garment) => garment?.active !== false);

      console.debug("[GarmentLibrary] active garment filtering results", {
        totalGarments: garments.length,
        activeGarmentCount: activeGarments.length,
        inactiveGarmentCount: garments.length - activeGarments.length,
        activeGarments,
        activeLibraryBrandIds: Array.from(activeLibraryBrandIds),
      });
    } catch (error) {
      logGarmentDerivationError("active filtering effect", error, {
        garments,
        activeLibraryBrandIds,
      });
    }
  }, [activeLibraryBrandIds, garments]);
  useEffect(() => {
    console.debug("[GarmentLibrary] final garmentBrowseItems array", {
      garmentBrowseItemCount: garmentBrowseItems.length,
      garmentBrowseItems,
    });
  }, [garmentBrowseItems]);
  useEffect(() => {
    console.debug("[GarmentLibrary] final visible garments array", {
      filteredGarmentCount: filteredGarments.length,
      filters: {
        searchTerm,
        deferredSearchTerm,
        categoryFilter,
        brandFilter,
        storefrontUsageFilter,
        sortOption,
      },
      filteredGarments,
    });
  }, [
    brandFilter,
    categoryFilter,
    deferredSearchTerm,
    filteredGarments,
    searchTerm,
    sortOption,
    storefrontUsageFilter,
  ]);
  useEffect(() => {
    if (!brandSelectRef.current) return;

    const renderedOptions = Array.from(brandSelectRef.current.options).map((option) => ({
      value: option.value,
      label: option.textContent,
      disabled: option.disabled,
    }));

    console.debug("[GarmentLibrary] rendered brand select options", renderedOptions);
  }, [brandSelectOptions]);
  useEffect(() => {
    console.debug("[GarmentLibrary] create brand dropdown debug", {
      normalizedBrandSelectOptions: brandSelectOptions,
      isBrandOptionsArrayEmpty: brandSelectOptions.length === 0,
      brandsLookupCount: brands.length,
      garmentCount: garments.length,
      activeGarmentCount: garments.filter((garment) => garment?.active !== false).length,
      activeLibraryBrandIds: Array.from(activeLibraryBrandIds),
      visibleActiveGarmentBrands: Array.from(
        new Set(
          filteredGarments
            .filter((entry) => entry?.item?.active !== false)
            .map((entry) => normalizeText(entry?.brandName))
            .filter(Boolean)
        )
      ),
      garmentBrowseBrandIds: Array.from(
        new Set(
          garmentBrowseItems
            .filter((entry) => entry?.item?.active !== false)
            .map((entry) => entry?.brandId)
            .filter(Boolean)
        )
      ),
      garmentBrowseBrandNames: brandFilterOptions,
      selectedBrandId: form.brand_lookup_id,
    });
  }, [
    activeLibraryBrandIds,
    brandFilterOptions,
    brandSelectOptions,
    brands,
    filteredGarments,
    form.brand_lookup_id,
    garmentBrowseItems,
    garments,
  ]);
  const visibleVariants = useMemo(() => {
    const normalizedSearch = variantSearch.trim().toLowerCase();
    return form.variants.filter((variant) => {
      if (!normalizedSearch) return true;
      return [variant.name, variant.supplier_sku]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [form.variants, variantSearch]);
  const garmentCardNodes = useMemo(() => {
    try {
      return filteredGarments.map(({ item, subtitle, usage }, index) => {
        try {
          return (
            <GarmentLibraryCard
              key={item.id}
              item={item}
              isSelected={editingId === item.id && activeWorkspace === "edit"}
              subtitle={subtitle}
              usage={usage}
              onSelect={() => {
                startEditingGarment(item);
              }}
              onRemove={() => {
                if (editingId === item.id) {
                  resetForm();
                  if (activeWorkspace === "edit") {
                    closeWorkspace();
                  }
                }
                deleteGarmentLibraryItem(item.id);
              }}
            />
          );
        } catch (error) {
          logGarmentDerivationError("garment card mapping", error, {
            index,
            garmentId: item?.id,
            garmentTitle: item?.title,
            item,
            usage,
          });
          return null;
        }
      });
    } catch (error) {
      logGarmentDerivationError("garment card mapping useMemo", error, {
        filteredGarments,
        editingId,
        activeWorkspace,
      });
      return EMPTY_LIST;
    }
  }, [activeWorkspace, editingId, filteredGarments]);
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
      const existingVariantCount = group.variants.length - missingVariants.length;

      return {
        ...group,
        existingGarment,
        existingVariantCount,
        missingVariants,
        garmentWarnings: [
          group.duplicateRowCount
            ? `${group.duplicateRowCount} duplicate supplier row${
                group.duplicateRowCount === 1 ? "" : "s"
              } merged into this garment preview.`
            : null,
          existingGarment && existingVariantCount
            ? `${existingVariantCount} variant${
                existingVariantCount === 1 ? "" : "s"
              } already exist and will be skipped during import.`
            : null,
        ].filter(Boolean),
      };
    });
  }, [brands, garmentPreviewMap, importPreview]);
  const importPreviewCategoryOptions = useMemo(
    () =>
      Array.from(new Set(previewGarments.map((group) => normalizeText(group.category)).filter(Boolean))).sort(
        (left, right) => left.localeCompare(right)
      ),
    [previewGarments]
  );
  const filteredPreviewGarments = useMemo(() => {
    const normalizedSearch = normalizeTextKey(importPreviewSearch);

    return previewGarments.filter((group) => {
      if (
        importPreviewCategoryFilter !== "all" &&
        normalizeTextKey(group.category) !== normalizeTextKey(importPreviewCategoryFilter)
      ) {
        return false;
      }

      if (importPreviewStatusFilter === "new" && group.existingGarment) {
        return false;
      }

      if (importPreviewStatusFilter === "existing" && !group.existingGarment) {
        return false;
      }

      if (importPreviewStatusFilter === "warnings" && !group.garmentWarnings.length) {
        return false;
      }

      if (importPreviewStatusFilter === "skipped" && !group.skip) {
        return false;
      }

      if (!normalizedSearch) return true;

      return [
        group.brand,
        group.productName,
        group.title,
        ...group.variants.map((variant) => variant?.name),
      ]
        .filter(Boolean)
        .some((value) => normalizeTextKey(value).includes(normalizedSearch));
    });
  }, [
    importPreviewCategoryFilter,
    importPreviewSearch,
    importPreviewStatusFilter,
    previewGarments,
  ]);
  const importablePreviewCount = previewGarments.filter((group) => group.skip !== true).length;
  const importPreviewSummary = useMemo(() => {
    if (!importPreview) return null;

    const selectedGarments = previewGarments.filter((group) => group.skip !== true);
    const skippedGarments = previewGarments.length - selectedGarments.length;
    const totalVariantsDetected = previewGarments.reduce(
      (total, group) => total + group.variantCount,
      0
    );
    const selectedVariants = selectedGarments.reduce(
      (total, group) => total + group.missingVariants.length,
      0
    );

    return {
      garmentsDetected: importPreview.garmentCount,
      garmentsSkipped: skippedGarments,
      totalVariantsDetected,
      variantsSelectedForImport: selectedVariants,
      malformedRowsSkipped: importPreview.skippedMalformedRowCount,
      emptyRowsSkipped: importPreview.skippedEmptyRowCount,
    };
  }, [importPreview, previewGarments]);
  const importWarningSummary = useMemo(
    () => buildImportWarningSummary(importWarnings),
    [importWarnings]
  );
  const selectedGarment = useMemo(
    () => garments.find((item) => item.id === editingId) || null,
    [editingId, garments]
  );
  const matchingImportedGarments = useMemo(() => {
    if (!form.category_lookup_id || !form.brand_lookup_id) return [];

    return garments
      .filter(
        (item) =>
          item.category_lookup_id === form.category_lookup_id &&
          resolveGarmentBrandId(item, garmentModelMap) === form.brand_lookup_id
      )
      .map((item) => {
        const model = garmentModelMap.get(item.garment_model_lookup_id);
        return {
          item,
          model,
          optionLabel: buildImportedGarmentOptionLabel(item, model),
          sortKey: [
            normalizeTextKey(model?.model_code),
            normalizeTextKey(model?.display_name),
            normalizeTextKey(item?.title),
          ].join("::"),
        };
      })
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  }, [form.brand_lookup_id, form.category_lookup_id, garmentModelMap, garments]);
  const isImportedSelectionLocked = Boolean(
    selectedReusableGarmentId && editingId === selectedReusableGarmentId
  );
  const hasCategoryAndBrandSelected = Boolean(form.category_lookup_id && form.brand_lookup_id);
  const showReusableSelector = Boolean(
    hasCategoryAndBrandSelected && (activeWorkspace === "create" || isImportedSelectionLocked)
  );
  const shouldPromptForReusableSelection = Boolean(
    activeWorkspace === "create" &&
      !editingId &&
      createMode !== "custom" &&
      hasCategoryAndBrandSelected &&
      matchingImportedGarments.length
  );
  const canEditGarmentDetails = Boolean(
    isEditMode ||
      createMode === "custom" ||
      (hasCategoryAndBrandSelected && matchingImportedGarments.length === 0)
  );
  const selectedGarmentLabel = getGarmentModeLabel(form.title || selectedGarment?.title);
  const placementSuggestionContext = useMemo(() => {
    const selectedCategory = categoryMap.get(form.category_lookup_id);

    return {
      categoryName: selectedCategory?.name || "",
      garmentType: modelDraft.display_name || "",
      displayName: form.title || modelDraft.model_code || "",
    };
  }, [categoryMap, form.category_lookup_id, form.title, modelDraft.display_name, modelDraft.model_code]);
  const suggestedPlacements = useMemo(
    () => getSuggestedGarmentPlacements(placementSuggestionContext),
    [placementSuggestionContext]
  );
  const placementOptions = useMemo(
    () => getPlacementOptionsForGarment(placementSuggestionContext),
    [placementSuggestionContext]
  );
  const storefrontLinkedGarments = useMemo(
    () => garmentBrowseItems.filter((entry) => entry.usage.linkedProductCount > 0).length,
    [garmentBrowseItems]
  );
  const totalVariantCount = useMemo(
    () => garments.reduce((total, garment) => total + (Array.isArray(garment.variants) ? garment.variants.length : 0), 0),
    [garments]
  );

  function resetForm() {
    setForm(emptyLibraryForm);
    setEditingId(null);
    setHasCustomizedPlacements(false);
    setSaveError("");
    setVariantDraft(buildVariantDraft());
    setBrandDraft("");
    setSizeDraft("");
    setModelDraft(buildModelDraftFromModel());
    setCreateMode("imported");
    setSelectedReusableGarmentId("");
    setVariantSearch("");
  }

  function closeWorkspace() {
    setActiveWorkspace(null);
    setSaveError("");
    setImportError("");
  }

  function startCreatingGarment() {
    resetForm();
    setImportError("");
    setSaveError("");
    setActiveWorkspace("create");
  }

  function startEditingGarment(item) {
    const category = findLookupById(categories, item.category_lookup_id);
    const model = findLookupById(garmentModels, item.garment_model_lookup_id);
    const nextSuggestedPlacements = getSuggestedGarmentPlacements({
      categoryName: category?.name || "",
      garmentType: model?.display_name || "",
      displayName: item.title || model?.model_code || "",
    });

    setCreateMode("custom");
    setSelectedReusableGarmentId("");
    setEditingId(item.id);
    setForm(buildFormFromGarment(item, brands, categories, garmentModels, sizes));
    setHasCustomizedPlacements(
      Array.isArray(item?.default_placements) &&
        item.default_placements.length > 0 &&
        !arePlacementListsEqual(item.default_placements, nextSuggestedPlacements)
    );
    setModelDraft(
      buildModelDraftFromModel(
        findLookupById(garmentModels, item.garment_model_lookup_id),
        item.brand_lookup_id
      )
    );
    setSaveError("");
    setImportError("");
    setVariantSearch("");
    setActiveWorkspace("edit");
  }

  function handleReusableGarmentSelect(garmentId) {
    if (!garmentId) {
      setSelectedReusableGarmentId("");
      return;
    }

    const matchedEntry = matchingImportedGarments.find((entry) => entry.item.id === garmentId);
    if (!matchedEntry) return;
    const nextSuggestedPlacements = getSuggestedGarmentPlacements({
      categoryName: categoryMap.get(matchedEntry.item.category_lookup_id)?.name || "",
      garmentType: matchedEntry.model?.display_name || "",
      displayName: matchedEntry.item.title || matchedEntry.model?.model_code || "",
    });

    setCreateMode("imported");
    setSelectedReusableGarmentId(matchedEntry.item.id);
    setEditingId(matchedEntry.item.id);
    setForm(buildFormFromGarment(matchedEntry.item, brands, categories, garmentModels, sizes));
    setHasCustomizedPlacements(
      Array.isArray(matchedEntry.item?.default_placements) &&
        matchedEntry.item.default_placements.length > 0 &&
        !arePlacementListsEqual(matchedEntry.item.default_placements, nextSuggestedPlacements)
    );
    setModelDraft(
      buildModelDraftFromModel(
        findLookupById(garmentModels, matchedEntry.item.garment_model_lookup_id),
        matchedEntry.item.brand_lookup_id
      )
    );
    setSaveError("");
    setImportError("");
    setVariantSearch("");
    setActiveWorkspace("edit");
  }

  function switchToCustomGarmentFlow() {
    const preservedCategoryId = form.category_lookup_id;
    const preservedBrandId = form.brand_lookup_id;

    setForm({
      ...emptyLibraryForm,
      category_lookup_id: preservedCategoryId,
      brand_lookup_id: preservedBrandId,
    });
    setEditingId(null);
    setHasCustomizedPlacements(false);
    setSaveError("");
    setVariantDraft(buildVariantDraft());
    setBrandDraft("");
    setSizeDraft("");
    setModelDraft(buildModelDraftFromModel(null, preservedBrandId));
    setCreateMode("custom");
    setSelectedReusableGarmentId("");
    setVariantSearch("");
    setActiveWorkspace("create");
  }

  function clearImportPreview() {
    setImportPreview(null);
    setImportError("");
    setImportNotice("");
    setImportWarnings([]);
    setExpandedImportGroups({});
    setShowImportWarningDetails(false);
    setImportPreviewSearch("");
    setImportPreviewCategoryFilter("all");
    setImportPreviewStatusFilter("all");
  }

  function toggleImportGroupExpanded(groupId) {
    setExpandedImportGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }

  function setImportGroupExpansionForVisibleGroups(isExpanded) {
    setExpandedImportGroups((current) => {
      const next = { ...current };
      filteredPreviewGarments.forEach((group) => {
        next[group.id] = isExpanded;
      });
      return next;
    });
  }

  function updateField(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => {
      const nextValue = type === "checkbox" ? checked : value;
      return {
        ...current,
        [name]: nextValue,
      };
    });

    if (name === "brand_lookup_id") {
      setModelDraft((current) => ({ ...current, brand_id: value }));
    }

    if (
      !editingId &&
      (name === "category_lookup_id" || name === "brand_lookup_id") &&
      selectedReusableGarmentId
    ) {
      setSelectedReusableGarmentId("");
    }
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
    setHasCustomizedPlacements(true);
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

    if (!displayName || !brandId || !categoryId) {
      throw new Error("Choose a category, brand, and garment model details before saving.");
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
      const fallbackTitle = buildGarmentDisplayName(garmentModel, brand);
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
        const updated = await updateGarmentLibraryItem(editingId, payload);
        if (updated) {
          startEditingGarment(updated);
        }
      } else {
        const created = await createGarmentLibraryItem(payload);
        if (created) {
          startEditingGarment(created);
        } else {
          resetForm();
        }
      }
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

    setImportPreview(null);
    setImportError("");
    setImportNotice("");
    setImportWarnings([]);
    setIsPreparingImport(true);
    setExpandedImportGroups({});
    setShowImportWarningDetails(false);
    setImportPreviewSearch("");
    setImportPreviewCategoryFilter("all");
    setImportPreviewStatusFilter("all");

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
        validRowCount: parsed.validRowCount,
        skippedEmptyRowCount: parsed.skippedEmptyRowCount,
        skippedMalformedRowCount: parsed.skippedMalformedRowCount,
        warningCount: parsed.warningCount,
      });
      setImportWarnings(parsed.warnings || []);
      setImportNotice(
        `Preview ready. Detected ${parsed.garmentCount} garments from ${parsed.validRowCount} valid rows.`
      );
    } catch (error) {
      setImportPreview(null);
      setImportWarnings([]);
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
            existingGarment.category_lookup_id !== category.id ||
            existingGarment.brand_lookup_id !== brand.id ||
            existingGarment.garment_model_lookup_id !== garmentModelId;

          if (shouldUpdate) {
            await updateGarmentLibraryItem(existingGarment.id, {
              category_lookup_id: category.id,
              brand_lookup_id: brand.id,
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
          default_placements: getSuggestedGarmentPlacements({
            categoryName: category.name,
            garmentType: previewGroup.productName,
            displayName: previewGroup.title,
          }),
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
      setImportWarnings([]);
    } catch (error) {
      setImportError(error?.message || "Import failed before completion.");
    } finally {
      setIsImporting(false);
    }
  }

  useEffect(() => {
    if (!isEditorOpen || hasCustomizedPlacements) return;

    setForm((current) => {
      if (arePlacementListsEqual(current.default_placements, suggestedPlacements)) {
        return current;
      }

      return {
        ...current,
        default_placements: suggestedPlacements,
      };
    });
  }, [hasCustomizedPlacements, isEditorOpen, suggestedPlacements]);

  useEffect(() => {
    let isCancelled = false;

    async function repairImportedBrandLookups() {
      for (const garment of garments) {
        if (!garment?.id || repairingBrandIdsRef.current.has(garment.id)) {
          continue;
        }

        const garmentModel = findLookupById(garmentModels, garment.garment_model_lookup_id);
        const resolvedModelBrandId = normalizeText(garmentModel?.brand_id);
        const currentBrand = findLookupById(brands, garment.brand_lookup_id);
        const currentBrandId = normalizeText(garment.brand_lookup_id);

        if (currentBrand && (!resolvedModelBrandId || currentBrandId === resolvedModelBrandId)) {
          continue;
        }

        repairingBrandIdsRef.current.add(garment.id);

        try {
          let resolvedBrandId = resolvedModelBrandId;

          if (!resolvedBrandId) {
            const inferredBrandName = inferImportedGarmentBrandName(garment, garmentModel);
            if (!inferredBrandName) {
              continue;
            }

            const brand = await createCatalogLookup("brands", {
              name: inferredBrandName,
              active: true,
            });

            resolvedBrandId = brand.id;
          }

          if (isCancelled) {
            return;
          }

          if (resolvedBrandId && garment.brand_lookup_id !== resolvedBrandId) {
            await updateGarmentLibraryItem(garment.id, {
              brand_lookup_id: resolvedBrandId,
            });
          }
        } catch (error) {
          console.error("Unable to repair garment brand lookup", {
            garmentId: garment.id,
            title: garment.title,
            error,
          });
        } finally {
          repairingBrandIdsRef.current.delete(garment.id);
        }
      }
    }

    repairImportedBrandLookups();

    return () => {
      isCancelled = true;
    };
  }, [brands, garmentModels, garments]);

  return (
    <div className="products-page garment-library-page">
      <div className="garment-library-shell">
        <section className="products-catalog-panel garment-library-browser">
          <div className="garment-library-hero">
            <div className="garment-library-hero-copy">
              <p className="products-eyebrow">Garment Library</p>
              <h1 className="garment-library-title">Browse and manage reusable garments</h1>
              <p className="garment-library-description">
                Search the supplier library, filter the list, then open a garment only when you need to edit it.
              </p>
            </div>

            <div className="garment-library-hero-actions">
              <button type="button" className="products-primary-button" onClick={startCreatingGarment}>
                + New Garment
              </button>
              <button
                type="button"
                className="products-secondary-button"
                onClick={() => setActiveWorkspace("import")}
              >
                Import Spreadsheet
              </button>
            </div>
          </div>

          {importNotice ? <div className="products-callout">{importNotice}</div> : null}
          {saveError && !isEditorOpen ? <div className="products-error-banner">{saveError}</div> : null}
          {importError && !isImportOpen ? (
            <div className="products-error-banner" role="alert">
              {importError}
            </div>
          ) : null}

          <div className="garment-library-summary-grid">
            <div className="products-stat-card garment-library-summary-card">
              <span>Total Garments</span>
              <strong>{garments.length}</strong>
              <p>Reusable supplier garments in the library.</p>
            </div>
            <div className="products-stat-card garment-library-summary-card">
              <span>Used In Storefront</span>
              <strong>{storefrontLinkedGarments}</strong>
              <p>Garments currently linked to customer-facing products.</p>
            </div>
            <div className="products-stat-card garment-library-summary-card">
              <span>Total Variants</span>
              <strong>{totalVariantCount}</strong>
              <p>Supplier colorways and SKUs tracked across the library.</p>
            </div>
            <div className="products-stat-card garment-library-summary-card">
              <span>Current View</span>
              <strong>{filteredGarmentCount}</strong>
              <p>{hasActiveGarmentFilters ? "Garments matching current filters." : "Garments visible right now."}</p>
            </div>
          </div>

          <div className="products-toolbar garment-library-toolbar">
            <label className="products-toolbar-field">
              <span>Search Garments</span>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search title, brand, model, or variant"
                style={fieldStyle}
              />
            </label>

            <label className="products-toolbar-field">
              <span>Category</span>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} style={fieldStyle}>
                <option value="all">All Categories</option>
                {categoryFilterOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="products-toolbar-field">
              <span>Brand</span>
              <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} style={fieldStyle}>
                <option value="all">All Brands</option>
                {brandFilterOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="products-toolbar-field">
              <span>Storefront Usage</span>
              <select
                value={storefrontUsageFilter}
                onChange={(event) => setStorefrontUsageFilter(event.target.value)}
                style={fieldStyle}
              >
                <option value="all">All Garments</option>
                <option value="used">Used In Storefront</option>
                <option value="unused">Not Used In Storefront</option>
              </select>
            </label>

            <label className="products-toolbar-field">
              <span>Sort</span>
              <select value={sortOption} onChange={(event) => setSortOption(event.target.value)} style={fieldStyle}>
                {GARMENT_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="products-results-meta">
            <span>
              {hasActiveGarmentFilters
                ? `Showing ${filteredGarmentCount} of ${garments.length} garments`
                : `Showing ${garments.length} garments`}
            </span>
            <button
              type="button"
              className="products-clear-filters"
              onClick={() => {
                setSearchTerm("");
                setCategoryFilter("all");
                setBrandFilter("all");
                setStorefrontUsageFilter("all");
                setSortOption("newest");
              }}
              disabled={!hasActiveGarmentFilters && sortOption === "newest"}
            >
              Clear Filters
            </button>
          </div>

          <div className="products-list-scroll garment-library-list-scroll">
            <div className="products-list-grid">
              {filteredGarments.length ? (
                garmentCardNodes
              ) : (
                <div className="products-empty-state">
                  <strong>No garments match current filters.</strong>
                  <span>Adjust search, category, brand, or storefront usage filters to broaden the library view.</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {(isEditorOpen || isImportOpen) ? (
          <aside className="garment-library-panel" aria-live="polite">
            {isImportOpen ? (
              <div className="garment-library-panel-card">
                <div className="garment-library-panel-header">
                  <div>
                    <p className="products-eyebrow">Import Workflow</p>
                    <h2 style={{ margin: "6px 0 0" }}>Import garments from spreadsheet</h2>
                    <p className="garment-library-panel-copy">
                      Upload the Tee &amp; Co supplier CSV, review the grouped garments, then confirm the import.
                    </p>
                  </div>
                  <button type="button" className="products-secondary-button" onClick={closeWorkspace}>
                    Close
                  </button>
                </div>

                {importError ? (
                  <div className="products-error-banner" role="alert">
                    {importError}
                  </div>
                ) : null}

                <section className="products-editor-section">
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
                      Required columns: Category, Brand, Supplier SKU, Product Name, Variant/Color. Extra columns after these are ignored.
                    </p>

                    {isPreparingImport ? (
                      <div className="products-summary-card" role="status" aria-live="polite">
                        Preparing import preview...
                      </div>
                    ) : null}

                    {importWarnings.length ? (
                      <div className="products-import-warning-panel" role="status" aria-live="polite">
                        <div className="products-import-warning-header">
                          <strong>
                            {importWarnings.length} parsing warning{importWarnings.length === 1 ? "" : "s"}
                          </strong>
                          <button
                            type="button"
                            className="products-inline-cancel"
                            onClick={() => setShowImportWarningDetails((current) => !current)}
                          >
                            {showImportWarningDetails ? "Hide Details" : "Show Details"}
                          </button>
                        </div>
                        <div className="products-import-warning-summary">
                          {importWarningSummary.map((item) => (
                            <span key={item.key} className="products-import-warning-chip">
                              {item.value} {item.label}
                            </span>
                          ))}
                        </div>
                        {showImportWarningDetails ? (
                          <div className="products-import-warning-list">
                            {importWarnings.map((warning) => (
                              <div key={warning} className="products-import-warning-item">
                                {warning}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {importPreview ? (
                      <div className="products-import-preview" role="region" aria-label="Garment import preview">
                        <div className="products-status-row">
                          <span>
                            {importPreview.fileName} • {importPreview.garmentCount} garments detected • {importPreview.validRowCount} valid rows
                          </span>
                          <span>{importablePreviewCount} garments selected</span>
                        </div>

                        {importPreviewSummary ? (
                          <div className="products-import-summary-bar">
                            <div className="products-import-summary-stat">
                              <strong>{importPreviewSummary.garmentsDetected}</strong>
                              <span>garments detected</span>
                            </div>
                            <div className="products-import-summary-stat">
                              <strong>{importPreviewSummary.totalVariantsDetected}</strong>
                              <span>variants detected</span>
                            </div>
                            <div className="products-import-summary-stat">
                              <strong>{importPreviewSummary.malformedRowsSkipped}</strong>
                              <span>malformed rows skipped</span>
                            </div>
                            <div className="products-import-summary-stat">
                              <strong>{importPreviewSummary.emptyRowsSkipped}</strong>
                              <span>empty rows skipped</span>
                            </div>
                            <div className="products-import-summary-stat">
                              <strong>{importPreviewSummary.garmentsSkipped}</strong>
                              <span>garments skipped</span>
                            </div>
                            <div className="products-import-summary-stat">
                              <strong>{importPreviewSummary.variantsSelectedForImport}</strong>
                              <span>new variants selected</span>
                            </div>
                          </div>
                        ) : null}

                        <div className="products-summary-meta">
                          <span>{importPreview.rowCount} grouped row references included in preview</span>
                        </div>

                        <div className="products-import-toolbar">
                          <label style={labelStyle}>
                            Search garments
                            <input
                              type="search"
                              value={importPreviewSearch}
                              onChange={(event) => setImportPreviewSearch(event.target.value)}
                              placeholder="Search garments..."
                              style={fieldStyle}
                            />
                          </label>

                          <label style={labelStyle}>
                            Category
                            <select
                              value={importPreviewCategoryFilter}
                              onChange={(event) => setImportPreviewCategoryFilter(event.target.value)}
                              style={fieldStyle}
                            >
                              <option value="all">All Categories</option>
                              {importPreviewCategoryOptions.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label style={labelStyle}>
                            Import status
                            <select
                              value={importPreviewStatusFilter}
                              onChange={(event) => setImportPreviewStatusFilter(event.target.value)}
                              style={fieldStyle}
                            >
                              <option value="all">All Import Status</option>
                              <option value="new">New Garments</option>
                              <option value="existing">Existing Garments</option>
                              <option value="warnings">Contains Warnings</option>
                              <option value="skipped">Skipped</option>
                            </select>
                          </label>

                          <div className="products-import-toolbar-actions">
                            <button
                              type="button"
                              className="products-secondary-button"
                              onClick={() => setImportGroupExpansionForVisibleGroups(true)}
                              disabled={!filteredPreviewGarments.length}
                            >
                              Expand All
                            </button>
                            <button
                              type="button"
                              className="products-secondary-button"
                              onClick={() => setImportGroupExpansionForVisibleGroups(false)}
                              disabled={!filteredPreviewGarments.length}
                            >
                              Collapse All
                            </button>
                          </div>
                        </div>

                        <div className="products-summary-meta">
                          <span>
                            Showing {filteredPreviewGarments.length} of {previewGarments.length} garments
                          </span>
                        </div>

                        <div className="products-import-group-list">
                          {filteredPreviewGarments.length ? (
                            filteredPreviewGarments.map((group) => (
                              <article
                                key={group.id}
                                className={`products-import-group-card ${group.skip ? "is-skipped" : ""}`}
                              >
                                <div className="products-import-group-header">
                                  <div style={{ minWidth: 0 }}>
                                    <h3 style={{ margin: 0 }}>{group.title}</h3>
                                    <p className="products-card-subtitle">
                                      {group.category} • {group.variantCount} variants detected
                                    </p>
                                  </div>
                                  <div className="products-import-group-actions">
                                    <button
                                      type="button"
                                      className="products-secondary-button"
                                      onClick={() => toggleImportGroupExpanded(group.id)}
                                    >
                                      {expandedImportGroups[group.id] ? "Collapse" : "Expand"}
                                    </button>
                                    <button
                                      type="button"
                                      className="products-inline-cancel"
                                      onClick={() => toggleImportSkip(group.id)}
                                    >
                                      {group.skip ? "Import Garment" : "Skip Garment"}
                                    </button>
                                  </div>
                                </div>

                                <div className="products-import-group-meta">
                                  <span className="products-import-status-badge">
                                    {group.skip
                                      ? "Skipped"
                                      : group.existingGarment
                                        ? "Existing garment"
                                        : "New garment"}
                                  </span>
                                  <span className="products-import-meta-pill">
                                    {group.missingVariants.length} new variant
                                    {group.missingVariants.length === 1 ? "" : "s"}
                                  </span>
                                  {group.existingGarment ? (
                                    <span className="products-import-meta-pill">
                                      {group.existingVariantCount} duplicate variant
                                      {group.existingVariantCount === 1 ? "" : "s"}
                                    </span>
                                  ) : null}
                                  {group.garmentWarnings.length ? (
                                    <span className="products-import-warning-pill">
                                      {group.garmentWarnings.length} warning
                                      {group.garmentWarnings.length === 1 ? "" : "s"}
                                    </span>
                                  ) : null}
                                </div>

                                {expandedImportGroups[group.id] ? (
                                  <div className="products-import-group-body">
                                    {group.garmentWarnings.length ? (
                                      <div className="products-import-garment-warning-box">
                                        <strong>Warnings for this garment</strong>
                                        <div className="products-import-garment-warning-list">
                                          {group.garmentWarnings.map((warning) => (
                                            <div key={`${group.id}-${warning}`} className="products-import-warning-item">
                                              {warning}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}

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
                                  </div>
                                ) : null}
                              </article>
                            ))
                          ) : (
                            <div className="products-import-empty-state">No garments match current filters.</div>
                          )}
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
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={`products-editor garment-library-panel-card ${editingId ? "is-editing" : ""}`}>
                <div className="garment-library-panel-header">
                  <div>
                    <p className="products-eyebrow">{isEditMode ? "Edit Garment" : "Create Garment"}</p>
                    <h2 style={{ margin: "6px 0 0" }}>{isEditMode ? selectedGarmentLabel : "New Garment"}</h2>
                    <p className="garment-library-panel-copy">
                      {isEditMode
                        ? "You are editing an existing garment. Update the details below, then save your changes."
                        : "You are creating a new reusable garment. Complete the setup, then save it to the library."}
                    </p>
                  </div>
                  <button type="button" className="products-secondary-button" onClick={closeWorkspace}>
                    Close
                  </button>
                </div>

                {saveError ? <div className="products-error-banner">{saveError}</div> : null}

                <section className="products-editor-section">
                  <div className="products-section-header">
                    <div>
                      <p className="products-section-step">Section 1</p>
                      <h2>Basic Garment Info</h2>
                    </div>
                    <p>
                      Select an imported supplier garment first when one already exists. Use custom
                      creation only when you need a garment that is not already in the library.
                    </p>
                  </div>

                  <div className="products-editor-grid">
                    <label style={labelStyle}>
                      Category
                      <select
                        name="category_lookup_id"
                        value={form.category_lookup_id}
                        onChange={updateField}
                        style={fieldStyle}
                        disabled={isImportedSelectionLocked}
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
                        ref={brandSelectRef}
                        name="brand_lookup_id"
                        value={form.brand_lookup_id}
                        onChange={updateField}
                        style={fieldStyle}
                        disabled={isImportedSelectionLocked}
                      >
                        <option value="">Select brand</option>
                        {brandSelectOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {showReusableSelector ? (
                    <div className="products-summary-card">
                      {matchingImportedGarments.length ? (
                        <div style={{ display: "grid", gap: "12px" }}>
                          <label style={labelStyle}>
                            Available Imported Garments
                            <select
                              value={selectedReusableGarmentId}
                              onChange={(event) => handleReusableGarmentSelect(event.target.value)}
                              style={fieldStyle}
                              disabled={isImportedSelectionLocked}
                            >
                              <option value="">
                                Select an imported garment for this brand and category
                              </option>
                              {matchingImportedGarments.map(({ item, optionLabel }) => (
                                <option key={item.id} value={item.id}>
                                  {optionLabel}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="products-field-footer">
                            <span>
                              {matchingImportedGarments.length} imported garment
                              {matchingImportedGarments.length === 1 ? "" : "s"} found for this
                              selection.
                            </span>
                            <button
                              type="button"
                              className="products-inline-cancel"
                              onClick={switchToCustomGarmentFlow}
                            >
                              Create Custom Garment Instead
                            </button>
                          </div>

                          {isImportedSelectionLocked ? (
                            <div className="products-callout">
                              This garment is being reused from the import library. Category, brand,
                              model, and display name are derived from that supplier record.
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="products-field-footer">
                          <span>
                            No imported garments match this category and brand yet. Continue with a
                            custom garment.
                          </span>
                          {createMode !== "custom" ? (
                            <button
                              type="button"
                              className="products-inline-cancel"
                              onClick={switchToCustomGarmentFlow}
                            >
                              Create Custom Garment
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : null}

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

                  {canEditGarmentDetails ? (
                    <>
                      <div className="products-inline-model-grid">
                        <label style={labelStyle}>
                          Garment Model Name
                          <input
                            value={modelDraft.display_name}
                            onChange={(event) =>
                              setModelDraft((current) => ({ ...current, display_name: event.target.value }))
                            }
                            placeholder="Women's Heavy Cotton T-Shirt"
                            style={{
                              ...fieldStyle,
                              background: isImportedSelectionLocked ? "#f8fafc" : fieldStyle.background,
                            }}
                            readOnly={isImportedSelectionLocked}
                          />
                        </label>

                        <label style={labelStyle}>
                          Garment Model Code
                          <input
                            value={modelDraft.model_code}
                            onChange={(event) =>
                              setModelDraft((current) => ({ ...current, model_code: event.target.value }))
                            }
                            placeholder="5000L"
                            style={{
                              ...fieldStyle,
                              background: isImportedSelectionLocked ? "#f8fafc" : fieldStyle.background,
                            }}
                            readOnly={isImportedSelectionLocked}
                          />
                        </label>
                      </div>

                      <label style={labelStyle}>
                        Garment Display Name
                        <input
                          name="title"
                          value={form.title}
                          onChange={updateField}
                          placeholder="Gildan Women's Heavy Cotton T-Shirt - 5000L"
                          style={{
                            ...fieldStyle,
                            background: isImportedSelectionLocked ? "#f8fafc" : fieldStyle.background,
                          }}
                          readOnly={isImportedSelectionLocked}
                        />
                      </label>

                      <ProductImageUploader
                        image={form.image}
                        onImageChange={(image) => setForm((current) => ({ ...current, image }))}
                      />
                    </>
                  ) : shouldPromptForReusableSelection ? (
                    <div className="products-selection-empty">
                      Select an imported garment above to reuse its supplier data, or switch to a
                      custom garment.
                    </div>
                  ) : null}
                </section>

          {canEditGarmentDetails ? (
          <>
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
                <p className="products-field-hint">
                  Suggestions adapt to the selected garment category and model until you customize them.
                </p>
                <div className="products-selection-chip-row">
                  {placementOptions.map((placement) => {
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
          </>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: editingId ? "1fr 1fr" : "1fr", gap: "10px" }}>
            <button type="submit" disabled={isSaving || !canEditGarmentDetails} className="products-primary-button">
              {isSaving ? "Saving..." : isEditMode ? "Save Changes" : "Create Garment"}
            </button>

            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  closeWorkspace();
                }}
                className="products-secondary-button"
              >
                Cancel Editing
              </button>
            ) : null}
          </div>
              </form>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
