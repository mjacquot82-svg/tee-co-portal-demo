import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  useGarmentLibraryStatus,
} from "../lib/garmentLibraryStore";
import { buildGarmentUsageMap } from "../lib/productGarmentLinks";
import {
  useStoredProducts,
} from "../lib/productsStore";
import { parseTeeCoGarmentSpreadsheet } from "../lib/teeCoGarmentSpreadsheet";
import {
  buildLegacyBrandModelValue,
  buildGarmentLibraryLabel,
  fieldStyle,
  findLookupByName,
  findLookupById,
  labelStyle,
  normalizeText,
  normalizeTextKey,
  resolveStructuredProductType,
  SearchableLookupField,
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
  linkedProductIds: [],
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

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return `[unstringifiable: ${error?.message || "unknown_error"}]`;
  }
}

function summarizeVariantForDebug(variant = {}) {
  if (!variant || typeof variant !== "object") {
    return {
      variantType: typeof variant,
      variant,
    };
  }

  return {
    id: variant.id || null,
    name: variant.name || null,
    color: variant.color || null,
    colors: Array.isArray(variant.colors) ? variant.colors : variant.colors || null,
    size: variant.size || null,
    sizes: Array.isArray(variant.sizes) ? variant.sizes : variant.sizes || null,
    available_sizes: Array.isArray(variant.available_sizes)
      ? variant.available_sizes
      : variant.available_sizes || null,
    availableSizes: Array.isArray(variant.availableSizes)
      ? variant.availableSizes
      : variant.availableSizes || null,
    supplier_variant: variant.supplier_variant || variant.supplierVariant || null,
    supplier_sku: variant.supplier_sku || variant.supplierSku || variant.sku || null,
    auto_generated: variant.auto_generated === true,
    active: variant.active,
    keys: Object.keys(variant),
  };
}

function getGarmentModeLabel(itemTitle) {
  return normalizeText(itemTitle) || "Selected Garment";
}

function buildFormFromGarment(item, brands, categories, garmentModels, sizeLookups) {
  const normalizedVariants = Array.isArray(item?.variants)
    ? item.variants
        .map((variant) => normalizeVariantForEditor(variant, item?.sizes || []))
        .filter(Boolean)
    : [];
  const derivedSizes = deriveSharedGarmentSizes(item, EMPTY_LIST, sizeLookups);
  const hydratedForm = {
    ...emptyLibraryForm,
    ...item,
    variants: normalizedVariants,
    sizes: derivedSizes,
    default_production_methods:
      item?.default_production_methods?.length ? item.default_production_methods : ["Screen Print"],
  };

  console.info("[GarmentLibrary] hydrated garment form", {
    title: hydratedForm.title,
    sourceVariantCount: Array.isArray(item?.variants) ? item.variants.length : 0,
    hydratedVariantCount: hydratedForm.variants.length,
    sourceSizes: item?.sizes || [],
    hydratedSizes: hydratedForm.sizes,
    uiExpectedVariantSchema: {
      required: ["name"],
      normalized: ["id", "name", "color", "colors", "sizes", "size", "supplier_variant", "supplier_sku", "active"],
      acceptedAliases: {
        color: ["color", "color_name", "colorName", "variant_color"],
        colors: [
          "colors",
          "variant_colors",
          "supplier_variant",
          "supplierVariant",
          "variant_name",
          "name",
        ],
        sizes: [
          "sizes",
          "available_sizes",
          "availableSizes",
          "size",
          "size_name",
          "sizeName",
          "variant_size",
        ],
        supplierSku: ["supplier_sku", "supplierSku", "sku"],
      },
    },
    hydratedUiVariantStructure: normalizedVariants.map((variant) => summarizeVariantForDebug(variant)),
    sourceItemJson: safeStringify(item),
    hydratedFormJson: safeStringify({
      title: hydratedForm.title,
      sizes: hydratedForm.sizes,
      variants: hydratedForm.variants,
      default_production_methods: hydratedForm.default_production_methods,
    }),
  });

  return hydratedForm;
}

function buildVariantDraft() {
  return {
    name: "",
  };
}

function normalizeDelimitedTextList(value) {
  if (Array.isArray(value)) {
    return uniqueList(value.flatMap((item) => normalizeDelimitedTextList(item)));
  }

  const normalizedValue = normalizeText(value);
  if (!normalizedValue) return [];

  return uniqueList(
    normalizedValue
      .split(/[\n,;|/]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function splitCollapsedColorTokens(value) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue || /[\s,;|/]/.test(normalizedValue)) {
    return normalizedValue ? [normalizedValue] : [];
  }

  const segments = normalizedValue.match(/[A-Z][a-z]+|[A-Z]{2,}(?=[A-Z][a-z]|\b)/g);
  if (!Array.isArray(segments) || segments.length < 3) {
    return normalizedValue ? [normalizedValue] : [];
  }

  return segments.map((segment) => normalizeText(segment)).filter(Boolean);
}

function extractVariantColorNames(variant = {}) {
  const colorCandidates = [
    variant.color,
    variant.colors,
    variant.color_name,
    variant.colorName,
    variant.variant_color,
    variant.variant_colors,
    variant.supplier_variant,
    variant.supplierVariant,
    variant.variant_name,
    variant.name,
  ];

  const normalizedColors = uniqueList(
    colorCandidates.flatMap((candidate) => {
      const values = normalizeDelimitedTextList(candidate);
      if (values.length > 1) return values;
      return values.flatMap((value) => splitCollapsedColorTokens(value));
    })
  );

  return normalizedColors;
}

function resolveVariantSupplierSku(variant = {}) {
  return normalizeText(variant.supplier_sku || variant.supplierSku || variant.sku);
}

function resolveVariantColorName(variant = {}) {
  return extractVariantColorNames(variant)[0] || "";
}

function extractVariantSizeValues(variant = {}) {
  return uniqueList([
    ...normalizeDelimitedTextList(variant.sizes),
    ...normalizeDelimitedTextList(variant.available_sizes),
    ...normalizeDelimitedTextList(variant.availableSizes),
    ...normalizeDelimitedTextList(variant.size_run),
    ...normalizeDelimitedTextList(variant.sizeRun),
    ...normalizeDelimitedTextList(
      variant.size || variant.size_name || variant.sizeName || variant.variant_size
    ),
  ]);
}

function resolveVariantSizes(variant = {}) {
  return extractVariantSizeValues(variant);
}

function normalizeVariantForEditor(variant = {}, fallbackSizes = []) {
  const parsedSizesBeforeNormalization = uniqueList([
    ...extractVariantSizeValues(variant),
    ...normalizeDelimitedTextList(fallbackSizes),
  ]);
  const parsedVariantBeforeNormalization = summarizeVariantForDebug(variant);

  console.info("[GarmentLibrary] parsed variant before UI normalization", {
    parsedVariantBeforeNormalization,
    parsedSizesBeforeNormalization,
    rawVariantJson: safeStringify(variant),
  });

  const name = normalizeText(variant.name || resolveVariantColorName(variant));
  if (!name) {
    console.warn("[GarmentLibrary] rejected variant during UI normalization", {
      rejectionReason: "missing-name-after-ui-normalization",
      parsedVariantBeforeNormalization,
      parsedSizesBeforeNormalization,
      rawVariantJson: safeStringify(variant),
    });
    return null;
  }

  const color = resolveVariantColorName(variant) || name;
  const colorOptions = extractVariantColorNames(variant);
  const sizes = parsedSizesBeforeNormalization;
  const supplierSku = resolveVariantSupplierSku(variant);

  const normalizedVariant = {
    ...variant,
    id: variant.id || `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    color,
    colors: colorOptions,
    sizes,
    size: normalizeText(variant.size) || sizes[0] || "",
    supplier_variant:
      normalizeText(variant.supplier_variant || variant.supplierVariant) || color || name,
    supplier_sku: supplierSku,
    sku: supplierSku,
    active: variant.active !== false,
  };

  console.info("[GarmentLibrary] accepted variant after UI normalization", {
    parsedSizesBeforeNormalization,
    normalizedVariant: summarizeVariantForDebug(normalizedVariant),
    normalizedVariantJson: safeStringify(normalizedVariant),
  });

  return normalizedVariant;
}

function normalizeVariantForSave(variant = {}) {
  const normalizedVariant = normalizeVariantForEditor(variant);
  if (!normalizedVariant) {
    console.warn("[GarmentLibrary] rejected variant during save normalization", {
      rejectionReason: "normalizeVariantForEditor-returned-null",
      rawVariant: summarizeVariantForDebug(variant),
      rawVariantJson: safeStringify(variant),
    });
    return null;
  }

  const savedVariant = {
    ...normalizedVariant,
    name: normalizeText(normalizedVariant.name),
    color: resolveVariantColorName(normalizedVariant),
    colors: extractVariantColorNames(normalizedVariant),
    sizes: resolveVariantSizes(normalizedVariant),
    size: normalizeText(normalizedVariant.size) || resolveVariantSizes(normalizedVariant)[0] || "",
    supplier_variant:
      normalizeText(normalizedVariant.supplier_variant || normalizedVariant.supplierVariant) ||
      resolveVariantColorName(normalizedVariant) ||
      normalizedVariant.name,
    supplier_sku: resolveVariantSupplierSku(normalizedVariant),
    sku: resolveVariantSupplierSku(normalizedVariant),
  };

  console.info("[GarmentLibrary] final variant structure before save", {
    savedVariant: summarizeVariantForDebug(savedVariant),
    savedVariantJson: safeStringify(savedVariant),
  });

  return savedVariant;
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

function buildStorefrontProductPayloadFromGarment(item, context = {}) {
  const garmentModel = findLookupById(context.garmentModels, item?.garment_model_lookup_id);
  const brandId = resolveGarmentBrandId(item, context.garmentModelMap) || item?.brand_lookup_id || "";
  const brand = findLookupById(context.brands, brandId);
  const category = findLookupById(context.categories, item?.category_lookup_id);
  const activeVariants = Array.isArray(item?.variants)
    ? item.variants
        .map((variant) => normalizeVariantForEditor(variant))
        .filter((variant) => variant && variant.active !== false)
    : [];
  const colors = uniqueList(activeVariants.map((variant) => resolveVariantColorName(variant)).filter(Boolean));
  const derivedSizes = deriveSharedGarmentSizes(item, EMPTY_LIST, context.sizeLookups || []);
  const placements = uniqueList(item?.default_placements || []);
  const productionMethods = uniqueList(item?.default_production_methods || []);
  const storefrontProductDraft = {
    name: normalizeText(item?.title),
    garment_library_item_id: item?.id || null,
    category: category?.name || "Catalog",
    category_lookup_id: category?.id || item?.category_lookup_id || null,
    product_type: resolveStructuredProductType(garmentModel, "", item?.title || ""),
    brand_model: buildLegacyBrandModelValue(brand, garmentModel, ""),
    brand_lookup_id: brand?.id || brandId || null,
    garment_model_lookup_id: garmentModel?.id || item?.garment_model_lookup_id || null,
    image: item?.image || "",
    status: "Active",
    colors,
    sizes: derivedSizes,
    placements,
    placement_prices: placements.reduce((accumulator, placement) => {
      accumulator[placement] = null;
      return accumulator;
    }, {}),
    production_methods: productionMethods.length ? productionMethods : ["Screen Print"],
    decoration_types: productionMethods.length ? productionMethods : ["Screen Print"],
    production_method_prices: {},
    cost_price: 0,
    markup_percentage: 0,
    base_garment_price: null,
    unit_price: null,
    // Storefront products must start with their own blank notes instead of reusing garment template notes.
    notes: "",
  };

  console.info("[StorefrontCreateVerification] storefront payload cloned from garment template", {
    garmentId: item?.id || null,
    garmentNotes: item?.notes || "",
    productNotes: storefrontProductDraft.notes,
    sharedReferenceChecks: {
      colorsShared: storefrontProductDraft.colors === item?.colors,
      sizesShared: storefrontProductDraft.sizes === item?.sizes,
      placementsShared: storefrontProductDraft.placements === item?.default_placements,
      productionMethodsShared:
        storefrontProductDraft.production_methods === item?.default_production_methods,
    },
    storefrontProductDraft,
  });

  return storefrontProductDraft;
}

function buildImportedGarmentOptionLabel(item, model) {
  const modelCode = normalizeText(model?.model_code);
  const modelName = normalizeText(model?.display_name);
  const garmentTitle = normalizeText(item?.title);

  if (modelCode && modelName) {
    return `${modelName} - ${modelCode}`;
  }

  return modelName || modelCode || garmentTitle || "Untitled Garment";
}

function formatCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatPreviewList(values = [], previewCount = 5, moreLabel = "more") {
  const normalizedValues = uniqueList(values.map((value) => normalizeText(value)).filter(Boolean));
  return {
    visible: normalizedValues.slice(0, previewCount),
    remainingCount: Math.max(normalizedValues.length - previewCount, 0),
    remainingLabel: moreLabel,
    totalCount: normalizedValues.length,
  };
}

function summarizeGarmentCardData(item = {}, sizeLookups = []) {
  const variants = Array.isArray(item?.variants) ? item.variants : [];
  const sizes = sortSizesByLookup(Array.isArray(item?.sizes) ? item.sizes : [], sizeLookups);
  const activeVariants = variants.filter((variant) => variant?.active !== false);
  const inactiveVariants = Math.max(variants.length - activeVariants.length, 0);
  const colorNames = uniqueList(
    activeVariants
      .flatMap((variant) => extractVariantColorNames(variant))
      .filter(Boolean)
  );
  const supplierSkuCount = uniqueList(
    variants
      .map((variant) => resolveVariantSupplierSku(variant))
      .filter(Boolean)
  ).length;

  return {
    colorPreview: formatPreviewList(colorNames, 5, "more"),
    sizePreview: formatPreviewList(sizes, 5, ""),
    totalColors: colorNames.length,
    totalSizes: sizes.length,
    totalVariants: variants.length,
    activeVariants: activeVariants.length,
    inactiveVariants,
    supplierSkuCount,
    defaultProductionMethods: uniqueList(item?.default_production_methods || []),
    defaultPlacements: uniqueList(item?.default_placements || []),
  };
}

function renderPreviewChips(preview, emptyLabel, remainderPrefix = "+") {
  if (!preview.visible.length) {
    return <span className="garment-library-inline-empty">{emptyLabel}</span>;
  }

  return (
    <>
      {preview.visible.map((value) => (
        <span key={value} className="garment-library-preview-chip">
          {value}
        </span>
      ))}
      {preview.remainingCount ? (
        <span className="garment-library-preview-chip garment-library-preview-chip-muted">
          {remainderPrefix}
          {preview.remainingCount}
          {preview.remainingLabel ? ` ${preview.remainingLabel}` : ""}
        </span>
      ) : null}
    </>
  );
}

function buildUniqueSelectOptions(values = []) {
  const optionsByKey = new Map();

  values.forEach((value) => {
    const label = normalizeText(value);
    const key = normalizeTextKey(label);

    if (!label || !key || optionsByKey.has(key)) return;
    optionsByKey.set(key, { value: label, label });
  });

  return Array.from(optionsByKey.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function CompactCapabilitySelector({
  label,
  helperText,
  options,
  selectedValues,
  onToggle,
  searchPlaceholder,
  emptyState,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearch = normalizeTextKey(searchTerm);
  const selectedSet = new Set(selectedValues.map((value) => normalizeTextKey(value)).filter(Boolean));

  const filteredOptions = useMemo(() => {
    if (!normalizedSearch) return options;

    return options.filter((option) =>
      [option?.name, option?.meta]
        .filter(Boolean)
        .some((value) => normalizeTextKey(value).includes(normalizedSearch))
    );
  }, [options, normalizedSearch]);

  return (
    <div className="products-multiselect products-capability-selector">
      <div className="products-multiselect-header">
        <strong>{label}</strong>
        <p>{helperText}</p>
      </div>

      <div className="products-capability-toolbar">
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder={searchPlaceholder || `Search ${label.toLowerCase()}`}
          style={fieldStyle}
        />
        <span className="products-capability-count">
          {selectedValues.length} selected
        </span>
      </div>

      <div className="products-capability-grid" role="list" aria-label={label}>
        {filteredOptions.length ? (
          filteredOptions.map((option) => {
            const isSelected = selectedSet.has(normalizeTextKey(option?.name));

            return (
              <button
                key={option.id || option.name}
                type="button"
                className={`products-capability-chip ${isSelected ? "is-selected" : ""}`}
                onClick={() => onToggle(option.name)}
                role="listitem"
                aria-pressed={isSelected}
              >
                <strong>{option.name}</strong>
                {option.meta ? <span>{option.meta}</span> : null}
              </button>
            );
          })
        ) : (
          <div className="products-selection-empty">{emptyState}</div>
        )}
      </div>
    </div>
  );
}

function buildImportedCapabilityMatrix(variants = [], sizeValues = [], sizeLookups = []) {
  const fallbackSizes = sortSizesByLookup(uniqueList(sizeValues), sizeLookups);
  const capabilitiesByColor = new Map();

  (variants || [])
    .map((variant) => normalizeVariantForEditor(variant, fallbackSizes))
    .filter(Boolean)
    .forEach((variant) => {
      const colorNames = extractVariantColorNames(variant);
      const variantSizes = resolveVariantSizes(variant);
      const normalizedSizes = sortSizesByLookup(
        uniqueList(variantSizes.length ? variantSizes : fallbackSizes),
        sizeLookups
      );
      const supplierSku = resolveVariantSupplierSku(variant);

      colorNames.forEach((colorName) => {
        const colorKey = normalizeTextKey(colorName);
        if (!colorKey) return;

        const existingCapability = capabilitiesByColor.get(colorKey) || {
          id: colorKey,
          name: colorName,
          sizes: [],
          supplierSkus: [],
        };

        existingCapability.sizes = sortSizesByLookup(
          uniqueList([...existingCapability.sizes, ...normalizedSizes]),
          sizeLookups
        );
        existingCapability.supplierSkus = uniqueList(
          supplierSku ? [...existingCapability.supplierSkus, supplierSku] : existingCapability.supplierSkus
        );

        capabilitiesByColor.set(colorKey, existingCapability);
      });
    });

  return Array.from(capabilitiesByColor.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function deriveSharedGarmentSizes(item = {}, fallbackSizes = [], sizeLookups = []) {
  const explicitSharedSizes = sortSizesByLookup(
    uniqueList([
      ...(Array.isArray(item?.sizes) ? item.sizes : []),
      ...normalizeDelimitedTextList(item?.shared_sizes),
      ...normalizeDelimitedTextList(item?.sharedSizes),
      ...normalizeDelimitedTextList(item?.size_run),
      ...normalizeDelimitedTextList(item?.sizeRun),
    ]),
    sizeLookups
  );
  if (explicitSharedSizes.length) {
    return explicitSharedSizes;
  }

  const normalizedFallbackSizes = sortSizesByLookup(
    uniqueList(Array.isArray(fallbackSizes) ? fallbackSizes : normalizeDelimitedTextList(fallbackSizes)),
    sizeLookups
  );
  if (normalizedFallbackSizes.length) {
    return normalizedFallbackSizes;
  }

  const variantDerivedSizes = Array.isArray(item?.variants)
    ? item.variants.flatMap((variant) => extractVariantSizeValues(variant))
    : [];

  return sortSizesByLookup(uniqueList(variantDerivedSizes), sizeLookups);
}

function buildImportedSharedSizeOptions(sizeValues = [], sizeLookups = []) {
  return buildUniqueSelectOptions(sortSizesByLookup(uniqueList(sizeValues), sizeLookups)).map(
    (option) => ({
      id: option.value,
      name: option.label,
    })
  );
}

function buildImportedVariantsFromSelections(
  capabilities = [],
  selectedColors = [],
  selectedSizes = [],
  sizeLookups = []
) {
  const selectedColorKeys = new Set(selectedColors.map((value) => normalizeTextKey(value)).filter(Boolean));
  const normalizedSizes = sortSizesByLookup(
    uniqueList(selectedSizes),
    sizeLookups
  );

  return capabilities
    .filter((capability) => selectedColorKeys.has(normalizeTextKey(capability.name)))
    .map((capability) => ({
      id: `generated-${normalizeTextKey(capability.name)}`,
      name: capability.name,
      color: capability.name,
      colors: [capability.name],
      sizes: normalizedSizes,
      size: normalizedSizes[0] || "",
      supplier_variant: capability.name,
      supplier_sku: capability.supplierSkus[0] || "",
      sku: capability.supplierSkus[0] || "",
      active: true,
      auto_generated: true,
    }))
    .filter((variant) => variant.sizes.length > 0 || normalizedSizes.length === 0);
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

function summarizeCapabilitiesForDebug(capabilities = []) {
  return (Array.isArray(capabilities) ? capabilities : []).map((capability) => ({
    id: capability?.id || null,
    name: capability?.name || "",
    sizes: Array.isArray(capability?.sizes) ? capability.sizes : [],
    supplierSkus: Array.isArray(capability?.supplierSkus) ? capability.supplierSkus : [],
  }));
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
  selectedBrandId = "",
  selectedCategoryId = ""
) {
  const optionsByBrandName = new Map();
  const normalizedSelectedCategoryId = normalizeText(selectedCategoryId);
  const sourceEntries = normalizedSelectedCategoryId
    ? garmentBrowseItems.filter(
        (entry) => normalizeText(entry?.item?.category_lookup_id) === normalizedSelectedCategoryId
      )
    : visibleGarmentEntries;

  sourceEntries.forEach((entry) => {
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

function logGarmentRenderError(stage, error, context = {}) {
  console.error(`[GarmentLibrary] ${stage} render failed`, error);
  console.error(`[GarmentLibrary] ${stage} render stack`, error?.stack);
  console.error(`[GarmentLibrary] ${stage} render context`, context);
}

function buildGarmentDebugContext(item, usage, extraContext = {}) {
  return {
    garmentId: item?.id,
    garmentTitle: item?.title || item?.display_name,
    garmentBrand: item?.brand || item?.brandName || item?.brand_label || item?.brand_lookup_id || "",
    usage,
    item,
    ...extraContext,
  };
}

function buildGarmentFilterLogContext(entry, extraContext = {}) {
  return {
    garmentId: entry?.item?.id,
    garmentTitle: entry?.item?.title,
    garmentCategory: normalizeText(entry?.categoryName),
    garmentBrand: normalizeText(entry?.brandName),
    linkedProductCount: entry?.usage?.linkedProductCount ?? 0,
    ...extraContext,
  };
}

function summarizeGarmentBrowseItems(entries = []) {
  return entries.reduce(
    (summary, entry) => {
      if (!entry?.item) {
        summary.missingItem += 1;
        return summary;
      }

      if (entry.item.active === false) summary.inactive += 1;
      else summary.active += 1;

      if (!normalizeText(entry.item.title)) summary.missingTitle += 1;
      if (!normalizeText(entry.brandId)) summary.missingBrandId += 1;
      if (!normalizeText(entry.brandName)) summary.missingBrandName += 1;
      if (!normalizeText(entry.categoryName)) summary.missingCategoryName += 1;
      if (!normalizeText(entry.modelLabel) && !normalizeText(entry.modelCode)) summary.missingModelDetails += 1;
      if (!normalizeText(entry.searchIndex)) summary.emptySearchIndex += 1;

      return summary;
    },
    {
      active: 0,
      inactive: 0,
      missingItem: 0,
      missingTitle: 0,
      missingBrandId: 0,
      missingBrandName: 0,
      missingCategoryName: 0,
      missingModelDetails: 0,
      emptySearchIndex: 0,
    }
  );
}

const GarmentLibraryCard = memo(function GarmentLibraryCard({
  item,
  isSelected,
  isCreatingStorefrontProduct,
  subtitle,
  brandName,
  categoryName,
  modelLabel,
  usage,
  sizeLookups,
  onSelect,
  onCreateStorefrontProduct,
  onViewLinkedProducts,
  onRemove,
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const safeItem = item && typeof item === "object" ? item : {};
  const safeUsage = usage && typeof usage === "object" ? usage : EMPTY_GARMENT_USAGE;
  const garmentId = safeItem?.id;
  const garmentTitle = safeItem?.title || safeItem?.display_name;
  const garmentBrand =
    safeItem?.brand || safeItem?.brandName || safeItem?.brand_label || safeItem?.brand_lookup_id || "";

  function logCardFieldError(field, error, extraContext = {}) {
    logGarmentRenderError("GarmentLibraryCard field access", error, {
      field,
      garmentId,
      garmentTitle,
      garmentBrand,
      subtitle,
      isSelected,
      usage: safeUsage,
      item: safeItem,
      ...extraContext,
    });
  }

  function readCardField(field, reader, extraContext = {}) {
    try {
      return reader();
    } catch (error) {
      logCardFieldError(field, error, extraContext);
      throw error;
    }
  }

  useEffect(() => {
    setHasImageError(false);
  }, [safeItem?.image, safeItem?.imageSrc, garmentId, garmentTitle]);

  function handleKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  }

  try {
    const imageSrc = readCardField("item.image/item.imageSrc", () =>
      normalizeText(safeItem.image || safeItem.imageSrc)
    );
    const showUploadedImage = Boolean(imageSrc) && !hasImageError;
    const cardKey = readCardField("item.id/item.title", () => `${safeItem.id || safeItem.title}-${imageSrc}`);
    const altText = readCardField("item.title", () => safeItem.title || "Untitled Garment");
    const renderedTitle = readCardField("item.title", () => safeItem.title || "Untitled Garment");
    const renderedBrandName = readCardField("brandName", () => normalizeText(brandName) || "No brand");
    const renderedCategoryName = readCardField(
      "categoryName",
      () => normalizeText(categoryName) || "No category"
    );
    const renderedModelLabel = readCardField("modelLabel", () => normalizeText(modelLabel));
    const variants = readCardField("item.variants", () => {
      if (safeItem.variants == null) return [];
      if (!Array.isArray(safeItem.variants)) {
        throw new Error("Malformed variants array");
      }
      return safeItem.variants;
    });
    const variantCount = readCardField("item.variants.length", () => variants.length, {
      variantsType: typeof variants,
      variantsIsArray: Array.isArray(variants),
    });
    const sizes = readCardField("item.sizes", () => {
      if (safeItem.sizes == null) return [];
      if (!Array.isArray(safeItem.sizes)) {
        throw new Error("Malformed sizes array");
      }
      return safeItem.sizes;
    });
    const sizeCount = readCardField("item.sizes.length", () => sizes.length, {
      sizesType: typeof sizes,
      sizesIsArray: Array.isArray(sizes),
    });
    const defaultProductionMethods = readCardField(
      "item.default_production_methods",
      () => {
        if (safeItem.default_production_methods == null) return [];
        if (!Array.isArray(safeItem.default_production_methods)) {
          throw new Error("Malformed default_production_methods array");
        }
        return safeItem.default_production_methods;
      }
    );
    const defaultsLabel = readCardField(
      "item.default_production_methods.join",
      () => defaultProductionMethods.join(", ") || "None",
      {
        defaultProductionMethodsType: typeof defaultProductionMethods,
        defaultProductionMethodsIsArray: Array.isArray(defaultProductionMethods),
      }
    );
    const linkedProductCount = readCardField("usage.linkedProductCount", () => {
      const value = safeUsage.linkedProductCount;
      if (typeof value !== "number") {
        throw new Error("Invalid storefront usage rendering: usage.linkedProductCount is not a number");
      }
      return value;
    }, {
      usageType: typeof safeUsage,
      usageKeys: safeUsage && typeof safeUsage === "object" ? Object.keys(safeUsage) : [],
    });
    const summary = readCardField("garment-card-summary", () =>
      summarizeGarmentCardData(safeItem, sizeLookups)
    );

    return (
      <article
        className={`products-card garment-library-card ${isSelected ? "is-active" : ""}`}
        onClick={onSelect}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
      >
        <div className="products-card-media garment-library-card-media">
          {showUploadedImage ? (
            <img
              key={cardKey}
              src={imageSrc}
              alt={altText}
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
          <div className="garment-library-card-header">
            <div className="garment-library-card-title-block">
              <div className="products-card-title-row">
                <h3 style={{ margin: 0 }}>{renderedTitle}</h3>
                {isSelected ? <span className="products-card-editing-pill">Selected</span> : null}
              </div>
              <div className="garment-library-card-primary-meta">
                <span className="garment-library-card-primary-pill">{renderedCategoryName}</span>
                <span className="garment-library-card-primary-pill">{renderedBrandName}</span>
                {renderedModelLabel ? (
                  <span className="garment-library-card-primary-pill garment-library-card-primary-pill-subtle">
                    {renderedModelLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="garment-library-card-top-metrics">
            <span className="garment-library-metric-pill">{formatCountLabel(summary.totalColors, "color")}</span>
            <span className="garment-library-metric-pill">{formatCountLabel(summary.totalSizes, "size")}</span>
            <span className="garment-library-metric-pill">
              {formatCountLabel(summary.activeVariants, "variant")}
            </span>
            {linkedProductCount > 0 ? (
              <button
                type="button"
                className="garment-library-metric-pill garment-library-metric-pill-action"
                onClick={(event) => {
                  event.stopPropagation();
                  onViewLinkedProducts();
                }}
              >
                {formatCountLabel(linkedProductCount, "storefront use", "storefront uses")}
              </button>
            ) : (
              <span className="garment-library-metric-pill garment-library-metric-pill-muted">
                No storefront use
              </span>
            )}
          </div>

          <div className="garment-library-card-preview-grid">
            <div className="garment-library-card-preview-block">
              <span className="garment-library-card-preview-label">Colors</span>
              <div className="garment-library-card-preview-row">
                {renderPreviewChips(summary.colorPreview, "No colors")}
              </div>
            </div>

            <div className="garment-library-card-preview-block">
              <span className="garment-library-card-preview-label">Sizes</span>
              <div className="garment-library-card-preview-row">
                {renderPreviewChips(summary.sizePreview, "No sizes")}
              </div>
            </div>
          </div>

          <details
            className="garment-library-card-details"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <summary className="garment-library-card-details-summary">
              <span>More details</span>
              <span className="garment-library-card-details-summary-meta">
                {summary.supplierSkuCount || 0} SKUs
                {summary.inactiveVariants ? ` • ${summary.inactiveVariants} inactive` : ""}
              </span>
            </summary>
            <div className="garment-library-card-metadata">
              <span className="garment-library-metadata-chip">
                {formatCountLabel(variantCount, "supplier variant")}
              </span>
              <span className="garment-library-metadata-chip">
                {formatCountLabel(sizeCount, "size option")}
              </span>
              <span className="garment-library-metadata-chip">Methods: {defaultsLabel}</span>
              <span className="garment-library-metadata-chip">
                Placements: {summary.defaultPlacements.length ? summary.defaultPlacements.join(", ") : "None"}
              </span>
              {subtitle ? <span className="garment-library-metadata-chip">{subtitle}</span> : null}
            </div>
          </details>
        </div>

        <div className="products-card-actions">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCreateStorefrontProduct();
            }}
            className="products-card-button products-card-button-primary"
            disabled={isCreatingStorefrontProduct}
          >
            {isCreatingStorefrontProduct ? "Creating..." : "Create Storefront Product"}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
            }}
            className="products-card-button"
          >
            {isSelected ? "Template Settings" : "Edit Template"}
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
  } catch (error) {
    logGarmentRenderError("GarmentLibraryCard", error, {
      garmentId,
      garmentTitle,
      garmentBrand,
      subtitle,
      isSelected,
      hasImageError,
      usage: safeUsage,
      item: safeItem,
    });
    return (
      <article className="products-card" role="article">
        <div className="products-card-body">
          <div className="products-card-title-row">
            <h3 style={{ margin: 0 }}>{garmentTitle || "Garment render failed"}</h3>
          </div>
          <p className="products-card-subtitle">
            Unable to render this garment card. See console for garment id, brand, and failing field.
          </p>
        </div>
      </article>
    );
  }
});

export default function GarmentLibrary() {
  const navigate = useNavigate();
  const rawGarments = useGarmentLibraryItems();
  const liveGarments = Array.isArray(rawGarments) ? rawGarments : EMPTY_LIST;
  const garments = liveGarments;
  const { isLoading: isGarmentLibraryLoading, hasFinishedInitialLoad } = useGarmentLibraryStatus();
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
  const [isCreatingStorefrontProduct, setIsCreatingStorefrontProduct] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [variantSearch, setVariantSearch] = useState("");
  const [variantDraft, setVariantDraft] = useState(buildVariantDraft());
  const [brandDraft, setBrandDraft] = useState("");
  const [sizeDraft, setSizeDraft] = useState("");
  const [modelDraft, setModelDraft] = useState(buildModelDraftFromModel());
  const [, setCreateMode] = useState("imported");
  const [selectedReusableGarmentId, setSelectedReusableGarmentId] = useState("");
  const [reusableGarmentSearch, setReusableGarmentSearch] = useState("");
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
  const editingGarment = useMemo(
    () => garments.find((item) => item.id === editingId) || null,
    [editingId, garments]
  );

  console.log("[GarmentLibrary] render start", {
    garmentCount: Array.isArray(garments) ? garments.length : "non-array",
    productCount: Array.isArray(products) ? products.length : "non-array",
    categoryCount: categories.length,
    brandCount: brands.length,
    sizeCount: sizes.length,
    garmentModelCount: garmentModels.length,
    editingId,
    activeWorkspace,
    isEditMode,
    isEditorOpen,
    isImportOpen,
  });

  useEffect(() => {
    console.log("[GarmentLibrary] component mounted", {
      initialGarmentCount: Array.isArray(garments) ? garments.length : "non-array",
      initialProductCount: Array.isArray(products) ? products.length : "non-array",
      initialCategoryCount: categories.length,
      initialBrandCount: brands.length,
      initialGarmentModelCount: garmentModels.length,
    });
  }, []);
  useEffect(() => {
    console.debug("[GarmentLibrary] raw garments entering component", {
      rawGarmentsIsArray: Array.isArray(rawGarments),
      rawGarmentsType: typeof rawGarments,
      rawGarmentsLength:
        rawGarments && typeof rawGarments.length === "number" ? rawGarments.length : "no-length",
      rawGarmentsKeys:
        rawGarments && typeof rawGarments === "object" ? Object.keys(rawGarments) : EMPTY_LIST,
      rawGarmentsItemsIsArray: Array.isArray(rawGarments?.items),
      rawGarmentsItemsLength: Array.isArray(rawGarments?.items) ? rawGarments.items.length : "non-array",
      rawGarmentsGarmentsIsArray: Array.isArray(rawGarments?.garments),
      rawGarmentsGarmentsLength: Array.isArray(rawGarments?.garments)
        ? rawGarments.garments.length
        : "non-array",
      garmentCount: Array.isArray(garments) ? garments.length : "non-array",
      derivationConsumes: "rawGarments array directly",
      garments,
      rawGarments,
    });
  }, [garments, rawGarments]);
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
        console.log("[GarmentLibrary] entering garmentBrowseItems derivation", {
          rawGarmentsIsArray: Array.isArray(rawGarments),
          rawGarmentsItemsIsArray: Array.isArray(rawGarments?.items),
          rawGarmentsGarmentsIsArray: Array.isArray(rawGarments?.garments),
          derivationInputShape: "direct-array",
          garmentsIsArray: Array.isArray(garments),
          garmentCount: Array.isArray(garments) ? garments.length : "non-array",
        });
        console.debug("[GarmentLibrary] garmentBrowseItems derivation start", {
          rawGarmentsLength:
            rawGarments && typeof rawGarments.length === "number" ? rawGarments.length : "no-length",
          rawGarmentsKeys:
            rawGarments && typeof rawGarments === "object" ? Object.keys(rawGarments) : EMPTY_LIST,
          inputCount: Array.isArray(garments) ? garments.length : "non-array",
          garmentIds: Array.isArray(garments) ? garments.map((item) => item?.id) : [],
        });

        const normalizationWarnings = [];
        const mappedItems = garments.map((item, index) => {
          try {
            const resolvedBrandId = resolveGarmentBrandId(item, garmentModelMap);
            const brand = brandMap.get(resolvedBrandId);
            const model = garmentModelMap.get(item.garment_model_lookup_id);
            const usage = garmentUsageMap.get(item.id) || EMPTY_GARMENT_USAGE;
            const browseItem = {
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
            const warningReasons = [];

            if (item?.active === false) warningReasons.push("inactive-garment");
            if (!normalizeText(item?.title)) warningReasons.push("missing-title");
            if (!normalizeText(resolvedBrandId)) warningReasons.push("missing-brand-id");
            if (!normalizeText(browseItem.brandName)) warningReasons.push("missing-brand-name");
            if (!normalizeText(browseItem.categoryName)) warningReasons.push("missing-category-name");
            if (!normalizeText(browseItem.modelLabel) && !normalizeText(browseItem.modelCode)) {
              warningReasons.push("missing-model-details");
            }
            if (!normalizeText(browseItem.searchIndex)) warningReasons.push("empty-search-index");

            console.debug("[GarmentLibrary] garmentBrowseItems mapped garment", {
              index,
              garmentId: item?.id,
              title: item?.title,
              active: item?.active !== false,
              resolvedBrandId,
              resolvedBrandName: browseItem.brandName,
              resolvedCategoryName: browseItem.categoryName,
              modelCode: browseItem.modelCode,
              variantCount: browseItem.variantCount,
              sizeCount: Array.isArray(item.sizes) ? item.sizes.length : 0,
              linkedProductCount: usage.linkedProductCount,
              hasImage: Boolean(browseItem.imageSrc),
            });

            if (warningReasons.length > 0) {
              const warningPayload = {
                index,
                garmentId: item?.id,
                title: item?.title,
                warningReasons,
                normalizedSnapshot: {
                  active: item?.active !== false,
                  brandId: browseItem.brandId,
                  brandName: browseItem.brandName,
                  categoryName: browseItem.categoryName,
                  modelLabel: browseItem.modelLabel,
                  modelCode: browseItem.modelCode,
                  searchIndex: browseItem.searchIndex,
                },
              };
              normalizationWarnings.push(warningPayload);
              console.warn("[GarmentLibrary] garmentBrowseItems normalization warnings", warningPayload);
            }

            return browseItem;
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

        console.debug("[GarmentLibrary] garmentBrowseItems derivation complete", {
          inputCount: Array.isArray(garments) ? garments.length : 0,
          outputCount: mappedItems.length,
          discardedCount: Math.max((Array.isArray(garments) ? garments.length : 0) - mappedItems.length, 0),
          normalizationWarningCount: normalizationWarnings.length,
          outputSummary: summarizeGarmentBrowseItems(mappedItems),
        });
        console.log("[GarmentLibrary] leaving garmentBrowseItems derivation", {
          inputCount: Array.isArray(garments) ? garments.length : 0,
          outputCount: mappedItems.length,
          discardedCount: Math.max((Array.isArray(garments) ? garments.length : 0) - mappedItems.length, 0),
        });

        return mappedItems;
      } catch (error) {
        logGarmentDerivationError("garmentBrowseItems useMemo", error, {
          garments,
          garmentCount: garments.length,
        });
        return EMPTY_LIST;
      }
    },
    [brandMap, brands, categories, categoryMap, garmentModelMap, garmentModels, garmentUsageMap, garments, rawGarments]
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
      const discardReasonCounts = {};
      const activeFilters = {
        categoryFilter,
        brandFilter,
        storefrontUsageFilter,
        searchTerm: normalizedSearch,
        sortOption,
      };
      const normalizedCategoryFilter = normalizeTextKey(categoryFilter);
      const normalizedBrandFilter = normalizeTextKey(brandFilter);

      console.log("[GarmentLibrary] entering filteredGarments derivation", {
        inputCount: garmentBrowseItems.length,
        activeFilters,
      });
      console.debug("[GarmentLibrary] filteredGarments derivation start", {
        inputCount: garmentBrowseItems.length,
        activeFilters,
      });
      const nextItems = garmentBrowseItems
        .filter((entry, index) => {
          try {
            const include = Boolean(entry?.item) && entry.item.active !== false && Boolean(normalizeText(entry.item.title));
            const exclusionReason = include
              ? "included-in-base-set"
              : !entry
                ? "missing-entry"
                : !entry.item
                  ? "missing-item"
                  : entry.item.active === false
                    ? "inactive-garment"
                    : "missing-title";

            if (!include) {
              discardReasonCounts[exclusionReason] = (discardReasonCounts[exclusionReason] || 0) + 1;
            }

            console.debug("[GarmentLibrary] garment base filter decision", buildGarmentFilterLogContext(entry, {
              index,
              activeFilters,
              included: include,
              reason: exclusionReason,
            }));

            return include;
          } catch (error) {
            logGarmentDerivationError("visible garment base filtering", error, {
              index,
              activeFilters,
              entry,
            });
            return false;
          }
        })
        .filter((entry, index) => {
          const normalizedCategoryName = normalizeTextKey(entry?.categoryName);
          const include =
            categoryFilter === "all" || normalizedCategoryName === normalizedCategoryFilter;

          if (!include) {
            discardReasonCounts["category-mismatch"] = (discardReasonCounts["category-mismatch"] || 0) + 1;
          }

          console.debug("[GarmentLibrary] garment category filter decision", buildGarmentFilterLogContext(entry, {
            index,
            activeFilters,
            included: include,
            reason: include ? "category-match" : "category-mismatch",
          }));

          return include;
        })
        .filter((entry, index) => {
          const normalizedBrandName = normalizeTextKey(entry?.brandName);
          const include = brandFilter === "all" || normalizedBrandName === normalizedBrandFilter;

          if (!include) {
            discardReasonCounts["brand-mismatch"] = (discardReasonCounts["brand-mismatch"] || 0) + 1;
          }

          console.debug("[GarmentLibrary] garment brand filter decision", buildGarmentFilterLogContext(entry, {
            index,
            activeFilters,
            included: include,
            reason: include ? "brand-match" : "brand-mismatch",
          }));

          return include;
        })
        .filter((entry, index) => {
          const include = getGarmentStorefrontUsageMatch(storefrontUsageFilter, entry?.usage || EMPTY_GARMENT_USAGE);

          if (!include) {
            discardReasonCounts["storefront-usage-mismatch"] =
              (discardReasonCounts["storefront-usage-mismatch"] || 0) + 1;
          }

          console.debug("[GarmentLibrary] garment storefront usage filter decision", buildGarmentFilterLogContext(entry, {
            index,
            activeFilters,
            included: include,
            reason: include ? "storefront-usage-match" : "storefront-usage-mismatch",
          }));

          return include;
        })
        .filter((entry, index) => {
          const searchIndex = typeof entry?.searchIndex === "string" ? entry.searchIndex : "";
          const include = !normalizedSearch || searchIndex.includes(normalizedSearch);

          if (!include) {
            discardReasonCounts["search-mismatch"] = (discardReasonCounts["search-mismatch"] || 0) + 1;
          }

          console.debug("[GarmentLibrary] garment search filter decision", buildGarmentFilterLogContext(entry, {
            index,
            activeFilters,
            included: include,
            reason: include ? "search-match" : "search-mismatch",
          }));

          return include;
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

      console.debug("[GarmentLibrary] filteredGarments derivation complete", {
        inputCount: garmentBrowseItems.length,
        outputCount: nextItems.length,
        discardedCount: garmentBrowseItems.length - nextItems.length,
        discardReasonCounts,
        activeFilters,
        finalFilteredArrayCount: nextItems.length,
        finalFilteredGarmentIds: nextItems.map((entry) => entry?.item?.id).filter(Boolean),
      });
      console.log("[GarmentLibrary] leaving filteredGarments derivation", {
        inputCount: garmentBrowseItems.length,
        outputCount: nextItems.length,
        discardedCount: garmentBrowseItems.length - nextItems.length,
        discardReasonCounts,
        activeFilters,
        finalFilteredArrayCount: nextItems.length,
      });

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
  const activeGarmentEntries = useMemo(
    () => garmentBrowseItems.filter((entry) => entry?.item?.active !== false),
    [garmentBrowseItems]
  );
  const activeGarmentCount = activeGarmentEntries.length;
  const shouldShowLoadingState = isGarmentLibraryLoading && activeGarmentCount === 0;
  const shouldShowEmptyState = hasFinishedInitialLoad && activeGarmentCount === 0;
  const garmentEntriesForRender = filteredGarments;
  const filteredGarmentCount = garmentEntriesForRender.length;
  const brandSelectOptions = useMemo(
    () => {
      try {
        return buildBrandSelectOptionsFromVisibleGarments(
          garmentEntriesForRender,
          garmentBrowseItems,
          brands,
          form.brand_lookup_id,
          form.category_lookup_id
        );
      } catch (error) {
        logGarmentDerivationError("brand select options useMemo", error, {
          garmentEntriesForRender,
          garmentBrowseItems,
          brands,
          selectedCategoryId: form.category_lookup_id,
          selectedBrandId: form.brand_lookup_id,
        });
        return EMPTY_LIST;
      }
    },
    [brands, form.brand_lookup_id, form.category_lookup_id, garmentBrowseItems, garmentEntriesForRender]
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
    console.debug("[GarmentLibrary] filter option counts", {
      categoryFilterOptionsCount: categoryFilterOptions.length,
      brandFilterOptionsCount: brandFilterOptions.length,
      categoryFilterOptions,
      brandFilterOptions,
    });
  }, [brandFilterOptions, categoryFilterOptions]);
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
  const normalizedEditorVariants = useMemo(
    () => form.variants.map((variant) => normalizeVariantForEditor(variant)).filter(Boolean),
    [form.variants]
  );
  const customColorOptions = useMemo(
    () =>
      normalizedEditorVariants
        .map((variant) => ({
          id: variant.id,
          name: variant.name,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [normalizedEditorVariants]
  );
  const selectedCustomColorValues = useMemo(
    () =>
      uniqueList(
        normalizedEditorVariants
          .filter((variant) => variant.active !== false)
          .map((variant) => resolveVariantColorName(variant))
          .filter(Boolean)
      ),
    [normalizedEditorVariants]
  );
  const renderedGarmentCards = useMemo(() => {
    const renderMetrics = {
      attemptedCount: garmentEntriesForRender.length,
      renderedCount: 0,
      failedCount: 0,
      nullCount: 0,
    };

    try {
      console.log("[GarmentLibrary] entering renderedGarmentCards derivation", {
        garmentEntriesForRenderCount: garmentEntriesForRender.length,
        editingId,
        activeWorkspace,
      });

      const mappedCards = garmentEntriesForRender.map(
        ({ item, subtitle, usage, brandName, categoryName, modelLabel }, index) => {
        try {
          console.log("[GarmentLibrary] mapping garment card node", {
            index,
            garmentId: item?.id,
            title: item?.title,
          });
          return (
            <GarmentLibraryCard
              key={item.id}
              item={item}
              isSelected={editingId === item.id && activeWorkspace === "edit"}
              subtitle={subtitle}
              brandName={brandName}
              categoryName={categoryName}
              modelLabel={modelLabel}
              usage={usage}
              sizeLookups={sizes}
              isCreatingStorefrontProduct={isCreatingStorefrontProduct}
              onSelect={() => {
                startEditingGarment(item);
              }}
              onCreateStorefrontProduct={() => {
                openStorefrontProductDraft(item);
              }}
              onViewLinkedProducts={() => {
                startViewingLinkedStorefrontProducts(item, usage);
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
          renderMetrics.failedCount += 1;
          console.error("[GarmentLibrary] garment card render failure", {
            garment: item,
            error,
            index,
            subtitle,
            usage,
          });
          logGarmentDerivationError("garment card mapping", error, {
            index,
            garmentId: item?.id,
            garmentTitle: item?.title,
            item,
            usage,
          });

          return (
            <article
              key={item?.id || `garment-render-failure-${index}`}
              className="products-card"
              role="article"
            >
              <div className="products-card-body">
                <div className="products-card-title-row">
                  <h3 style={{ margin: 0 }}>{item?.title || "Garment render failed"}</h3>
                </div>
                <p className="products-card-subtitle">
                  This garment could not be rendered. See console for the failing garment payload.
                </p>
              </div>
            </article>
          );
          }
        }
      );

      renderMetrics.nullCount = mappedCards.filter((card) => card == null).length;
      renderMetrics.renderedCount = mappedCards.length - renderMetrics.nullCount;

      console.log("[GarmentLibrary] leaving renderedGarmentCards derivation", {
        garmentEntriesForRenderCount: garmentEntriesForRender.length,
        editingId,
        activeWorkspace,
        ...renderMetrics,
      });

      return mappedCards;
    } catch (error) {
      renderMetrics.failedCount = garmentEntriesForRender.length;
      logGarmentDerivationError("rendered garment cards useMemo", error, {
        garmentEntriesForRender,
        editingId,
        activeWorkspace,
      });
      console.log("[GarmentLibrary] leaving renderedGarmentCards derivation", {
        garmentEntriesForRenderCount: garmentEntriesForRender.length,
        editingId,
        activeWorkspace,
        ...renderMetrics,
        bailedOut: true,
      });
      return EMPTY_LIST;
    }
  }, [activeWorkspace, editingId, garmentEntriesForRender]);
  useEffect(() => {
    console.log("[GarmentLibrary] leaving renderedGarmentCards derivation", {
      filteredGarmentCount,
      renderedGarmentCardCount: renderedGarmentCards.length,
      garmentEntriesForRenderCount: garmentEntriesForRender.length,
    });
  }, [filteredGarmentCount, garmentEntriesForRender.length, renderedGarmentCards.length]);
  useEffect(() => {
    console.debug("[GarmentLibrary] final rendered garment card count", {
      renderedCardCount: renderedGarmentCards.length,
      garmentEntriesForRenderCount: garmentEntriesForRender.length,
      filteredGarmentCount,
    });
  }, [filteredGarmentCount, garmentEntriesForRender.length, renderedGarmentCards.length]);
  useEffect(() => {
    console.log("[GarmentLibrary] derivation chain snapshot", {
      liveGarmentsLength: liveGarments.length,
      liveGarmentsFirstItem: liveGarments[0] ?? null,
      garmentBrowseItemsLength: garmentBrowseItems.length,
      garmentBrowseItemsFirstItem: garmentBrowseItems[0] ?? null,
      filteredGarmentsLength: filteredGarments.length,
      filteredGarmentsFirstItem: filteredGarments[0] ?? null,
      renderedGarmentCardsLength: renderedGarmentCards.length,
      renderedGarmentCardsFirstItem:
        renderedGarmentCards[0] == null
          ? null
          : {
              key: renderedGarmentCards[0].key ?? null,
              type:
                typeof renderedGarmentCards[0].type === "string"
                  ? renderedGarmentCards[0].type
                  : renderedGarmentCards[0].type?.displayName ||
                    renderedGarmentCards[0].type?.name ||
                    typeof renderedGarmentCards[0].type,
            },
    });
  }, [filteredGarments, garmentBrowseItems, liveGarments, renderedGarmentCards]);
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
          item.active !== false &&
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
  const selectedReusableGarmentEntry = useMemo(
    () =>
      matchingImportedGarments.find((entry) => entry.item.id === selectedReusableGarmentId) || null,
    [matchingImportedGarments, selectedReusableGarmentId]
  );
  const importedCapabilitySourceItem = useMemo(() => {
    if (selectedReusableGarmentEntry?.item) {
      return selectedReusableGarmentEntry.item;
    }

    if (selectedReusableGarmentId && selectedGarment?.id === selectedReusableGarmentId) {
      return selectedGarment;
    }

    return null;
  }, [selectedGarment, selectedReusableGarmentEntry, selectedReusableGarmentId]);
  const importedCapabilitySourceVariants = importedCapabilitySourceItem?.variants || EMPTY_LIST;
  const importedCapabilityMatrix = useMemo(
    () =>
      buildImportedCapabilityMatrix(
        importedCapabilitySourceVariants.length
          ? importedCapabilitySourceVariants
          : form.variants || EMPTY_LIST,
        deriveSharedGarmentSizes(importedCapabilitySourceItem || selectedGarment || form, form.sizes, sizes),
        sizes
      ),
    [form, form.sizes, form.variants, importedCapabilitySourceItem, importedCapabilitySourceVariants, selectedGarment, sizes]
  );
  const selectedImportedColorValues = useMemo(
    () => uniqueList(form.variants.map((variant) => resolveVariantColorName(variant)).filter(Boolean)),
    [form.variants]
  );
  const derivedImportedColorOptions = useMemo(
    () =>
      importedCapabilityMatrix.map((capability) => ({
        id: capability.id,
        name: capability.name,
        meta: capability.supplierSkus.length ? `SKU ${capability.supplierSkus.join(", ")}` : "",
      })),
    [importedCapabilityMatrix]
  );
  const importedSharedSizeValues = useMemo(
    () => deriveSharedGarmentSizes(selectedGarment || importedCapabilitySourceItem || form, form.sizes, sizes),
    [form, form.sizes, importedCapabilitySourceItem, selectedGarment, sizes]
  );
  const derivedImportedSizeOptions = useMemo(
    () => buildImportedSharedSizeOptions(importedSharedSizeValues, sizes),
    [importedSharedSizeValues, sizes]
  );
  const visibleImportedCapabilities = useMemo(() => {
    const normalizedSearch = variantSearch.trim().toLowerCase();
    return importedCapabilityMatrix.filter((capability) => {
      if (!normalizedSearch) return true;
      return [capability.name, capability.supplierSkus.join(", "), capability.sizes.join(", ")]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [importedCapabilityMatrix, variantSearch]);
  const isImportedCapabilityMode = Boolean(selectedReusableGarmentEntry);
  const hasCategoryAndBrandSelected = Boolean(form.category_lookup_id && form.brand_lookup_id);
  const showReusableSelector = Boolean(isEditorOpen);
  const visibleImportedSuggestions = matchingImportedGarments.slice(0, 6);
  useEffect(() => {
    console.log("[GarmentLibrary] create garment selector derivation", {
      selectedCategory: categoryMap.get(form.category_lookup_id)?.name || "",
      selectedBrand: brandMap.get(form.brand_lookup_id)?.name || "",
      selectedGarmentModel: selectedReusableGarmentEntry?.optionLabel || "",
      derivedModelCount: matchingImportedGarments.length,
      derivedColorCount: derivedImportedColorOptions.length,
      derivedSizeCount: derivedImportedSizeOptions.length,
      importedSharedSizeValues,
      selectedColorCount: selectedImportedColorValues.length,
      selectedSizeCount: form.sizes.length,
    });
  }, [
    brandMap,
    categoryMap,
    derivedImportedColorOptions.length,
    derivedImportedSizeOptions.length,
    form.brand_lookup_id,
    form.category_lookup_id,
    form.sizes.length,
    importedSharedSizeValues,
    matchingImportedGarments.length,
    selectedImportedColorValues.length,
    selectedReusableGarmentEntry,
  ]);
  useEffect(() => {
    if (!isEditorOpen) return;

    console.info("[GarmentLibrary] imported capability runtime snapshot", {
      editingId,
      selectedReusableGarmentId,
      sourceGarmentId: importedCapabilitySourceItem?.id || null,
      sourceGarmentTitle: importedCapabilitySourceItem?.title || "",
      sharedSizesForMainUi: importedSharedSizeValues,
      selectedColors: selectedImportedColorValues,
      derivedAvailableSizes: derivedImportedSizeOptions.map((option) => option.name),
      importedCapabilityMatrix: summarizeCapabilitiesForDebug(importedCapabilityMatrix),
      sourceVariants: Array.isArray(importedCapabilitySourceItem?.variants)
        ? importedCapabilitySourceItem.variants.map((variant) => summarizeVariantForDebug(variant))
        : [],
      finalHydratedGarmentObject: {
        id: importedCapabilitySourceItem?.id || null,
        title: importedCapabilitySourceItem?.title || "",
        sizes: importedCapabilitySourceItem?.sizes || [],
        variants: Array.isArray(importedCapabilitySourceItem?.variants)
          ? importedCapabilitySourceItem.variants.map((variant) => summarizeVariantForDebug(variant))
          : [],
      },
      finalHydratedProductObject: buildStorefrontProductPayloadFromGarment(
        importedCapabilitySourceItem || form,
        {
          brands,
          categories,
          garmentModels,
          garmentModelMap,
          sizeLookups: sizes,
        }
      ),
    });
  }, [
    brands,
    categories,
    derivedImportedSizeOptions,
    editingId,
    form,
    garmentModels,
    garmentModelMap,
    importedCapabilityMatrix,
    importedCapabilitySourceItem,
    importedSharedSizeValues,
    isEditorOpen,
    selectedImportedColorValues,
    selectedReusableGarmentId,
    sizes,
  ]);
  const selectedGarmentLabel = getGarmentModeLabel(form.title || selectedGarment?.title);
  const selectedGarmentBrand = findLookupById(brands, form.brand_lookup_id || selectedGarment?.brand_lookup_id);
  const selectedGarmentCategory = findLookupById(
    categories,
    form.category_lookup_id || selectedGarment?.category_lookup_id
  );
  const selectedGarmentModel = findLookupById(
    garmentModels,
    form.garment_model_lookup_id || selectedGarment?.garment_model_lookup_id
  );
  const selectedGarmentUsage =
    (selectedGarment?.id && garmentUsageMap.get(selectedGarment.id)) || EMPTY_GARMENT_USAGE;
  const selectedGarmentSummary = summarizeGarmentCardData(selectedGarment || form, sizes);
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
  const storefrontLinkedGarments = useMemo(() => {
    try {
      return garmentBrowseItems.filter((entry, index) => {
        try {
          if (!entry || typeof entry !== "object") {
            throw new Error("Invalid garment browse entry");
          }
          if (!entry.usage || typeof entry.usage !== "object") {
            throw new Error("Missing storefront usage object");
          }
          if (typeof entry.usage.linkedProductCount !== "number") {
            throw new Error("Invalid storefront usage rendering: usage.linkedProductCount is not a number");
          }
          return entry.usage.linkedProductCount > 0;
        } catch (error) {
          logGarmentRenderError(
            "storefrontLinkedGarments derivation",
            error,
            buildGarmentDebugContext(entry?.item, entry?.usage, {
              index,
              suspectedFailureField:
                !entry || typeof entry !== "object"
                  ? "garmentBrowseItems[]"
                  : !entry?.usage || typeof entry.usage !== "object"
                    ? "entry.usage"
                    : "entry.usage.linkedProductCount",
              entry,
            })
          );
          return false;
        }
      }).length;
    } catch (error) {
      logGarmentRenderError("storefrontLinkedGarments useMemo", error, {
        garmentBrowseItemsCount: garmentBrowseItems.length,
      });
      return 0;
    }
  }, [garmentBrowseItems]);
  const totalVariantCount = useMemo(() => {
    try {
      return garments.reduce((total, garment, index) => {
        try {
          if (!garment || typeof garment !== "object") {
            throw new Error("Invalid garment object");
          }
          if (garment.variants != null && !Array.isArray(garment.variants)) {
            throw new Error("Malformed variants array");
          }
          return total + (Array.isArray(garment.variants) ? garment.variants.length : 0);
        } catch (error) {
          logGarmentRenderError(
            "totalVariantCount derivation",
            error,
            buildGarmentDebugContext(garment, null, {
              index,
              suspectedFailureField:
                !garment || typeof garment !== "object" ? "garments[]" : "garment.variants",
            })
          );
          return total;
        }
      }, 0);
    } catch (error) {
      logGarmentRenderError("totalVariantCount useMemo", error, {
        garmentCount: garments.length,
      });
      return 0;
    }
  }, [garments]);
  function resetForm() {
    setForm(emptyLibraryForm);
    setEditingId(null);
    setHasCustomizedPlacements(false);
    setSaveError("");
    setVariantDraft(buildVariantDraft());
    setBrandDraft("");
    setSizeDraft("");
    setModelDraft(buildModelDraftFromModel());
    setCreateMode("custom");
    setSelectedReusableGarmentId("");
    setReusableGarmentSearch("");
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
    setReusableGarmentSearch("");
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

  function openStorefrontProductDraft(item) {
    if (!item?.id || isCreatingStorefrontProduct) return;

    setIsCreatingStorefrontProduct(true);
    navigate("/admin/products", {
      state: {
        createFromGarmentId: item.id,
        creationNotice: item.title
          ? `Storefront product draft opened from ${item.title}. Finish pricing, visibility, category, and copy in the product editor.`
          : "Storefront product draft opened from the garment library. Finish pricing, visibility, category, and copy in the product editor.",
      },
    });
  }

  function startViewingLinkedStorefrontProducts(item, usage) {
    const linkedProductIds = Array.isArray(usage?.linkedProductIds)
      ? usage.linkedProductIds.filter(Boolean)
      : [];
    if (!linkedProductIds.length) return;

    navigate("/admin/products", {
      state: {
        highlightProductIds: linkedProductIds,
        highlightedGarmentTitle: item?.title || "",
        creationNotice: item?.title
          ? `Highlighted storefront products linked to ${item.title}.`
          : "Highlighted linked storefront products.",
      },
    });
  }

  function handleReusableGarmentSelect(garmentId) {
    if (!garmentId) {
      setSelectedReusableGarmentId("");
      setReusableGarmentSearch("");
      return;
    }

    const matchedEntry = matchingImportedGarments.find((entry) => entry.item.id === garmentId);
    if (!matchedEntry) return;
    const importedCapabilities = buildImportedCapabilityMatrix(
      matchedEntry.item?.variants || EMPTY_LIST,
      matchedEntry.item?.sizes || EMPTY_LIST,
      sizes
    );
    const sharedSizes = deriveSharedGarmentSizes(matchedEntry.item, EMPTY_LIST, sizes);
    const nextSelectedColors = importedCapabilities.map((capability) => capability.name);
    const nextSelectedSizes = sharedSizes;
    const nextSuggestedPlacements = getSuggestedGarmentPlacements({
      categoryName: categoryMap.get(matchedEntry.item.category_lookup_id)?.name || "",
      garmentType: matchedEntry.model?.display_name || "",
      displayName: matchedEntry.item.title || matchedEntry.model?.model_code || "",
    });
    console.info("[GarmentLibrary] handleReusableGarmentSelect runtime snapshot", {
      selectedGarmentId: matchedEntry.item?.id || null,
      selectedGarmentTitle: matchedEntry.item?.title || "",
      sharedSizesForMainUi: sharedSizes,
      importedCapabilityMatrix: summarizeCapabilitiesForDebug(importedCapabilities),
      selectedColors: nextSelectedColors,
      derivedAvailableSizes: nextSelectedSizes,
      finalHydratedGarmentObject: {
        id: matchedEntry.item?.id || null,
        title: matchedEntry.item?.title || "",
        sizes: matchedEntry.item?.sizes || [],
        variants: Array.isArray(matchedEntry.item?.variants)
          ? matchedEntry.item.variants.map((variant) => summarizeVariantForDebug(variant))
          : [],
      },
    });

    setCreateMode("imported");
    setSelectedReusableGarmentId(matchedEntry.item.id);
    setReusableGarmentSearch(matchedEntry.optionLabel);
    setEditingId(matchedEntry.item.id);
    setForm({
      ...buildFormFromGarment(matchedEntry.item, brands, categories, garmentModels, sizes),
      sizes: nextSelectedSizes,
      variants: buildImportedVariantsFromSelections(
        importedCapabilities,
        nextSelectedColors,
        nextSelectedSizes,
        sizes
      ),
    });
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

  function clearImportedGarmentSelection() {
    setSelectedReusableGarmentId("");
    setReusableGarmentSearch("");
    if (!editingId) {
      setCreateMode("custom");
    }
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
      const nextForm = {
        ...current,
        [name]: nextValue,
      };

      if (name === "category_lookup_id") {
        nextForm.brand_lookup_id = "";
      }

      return nextForm;
    });

    if (name === "brand_lookup_id") {
      setModelDraft((current) => ({ ...current, brand_id: value }));
    }

    if (name === "category_lookup_id") {
      setModelDraft((current) => ({ ...current, brand_id: "" }));
    }

    if (
      !editingId &&
      (name === "category_lookup_id" || name === "brand_lookup_id")
    ) {
      if (selectedReusableGarmentId) {
        setSelectedReusableGarmentId("");
      }
      setReusableGarmentSearch("");
    }
  }

  function applyImportedCapabilitySelections(selectedColors, selectedSizes, sourceItem = selectedReusableGarmentEntry?.item) {
    const capabilities = buildImportedCapabilityMatrix(
      sourceItem?.variants || EMPTY_LIST,
      sourceItem?.sizes || EMPTY_LIST,
      sizes
    );
    const sharedSizes = deriveSharedGarmentSizes(sourceItem, form.sizes, sizes);
    const normalizedSelectedColors = uniqueList(selectedColors);
    const availableSizeKeys = new Set(
      uniqueList(sharedSizes)
        .map((value) => normalizeTextKey(value))
        .filter(Boolean)
    );
    const normalizedSelectedSizes = sortSizesByLookup(
      uniqueList(selectedSizes).filter(
        (value) => availableSizeKeys.size === 0 || availableSizeKeys.has(normalizeTextKey(value))
      ),
      sizes
    );
    console.info("[GarmentLibrary] applyImportedCapabilitySelections runtime snapshot", {
      sourceGarmentId: sourceItem?.id || null,
      sourceGarmentTitle: sourceItem?.title || "",
      sharedSizesForMainUi: sharedSizes,
      importedCapabilityMatrix: summarizeCapabilitiesForDebug(capabilities),
      selectedColors: normalizedSelectedColors,
      derivedAvailableSizes: sharedSizes,
      selectedSizes: normalizedSelectedSizes,
    });

    setForm((current) => ({
      ...current,
      sizes: normalizedSelectedSizes,
      variants: buildImportedVariantsFromSelections(
        capabilities,
        normalizedSelectedColors,
        normalizedSelectedSizes,
        sizes
      ),
    }));
  }

  function toggleImportedColor(colorName) {
    const nextSelectedColors = selectedImportedColorValues.some(
      (value) => normalizeTextKey(value) === normalizeTextKey(colorName)
    )
      ? selectedImportedColorValues.filter(
          (value) => normalizeTextKey(value) !== normalizeTextKey(colorName)
        )
      : [...selectedImportedColorValues, colorName];

    applyImportedCapabilitySelections(nextSelectedColors, form.sizes);
  }

  function toggleImportedSize(sizeName) {
    const nextSelectedSizes = form.sizes.some(
      (value) => normalizeTextKey(value) === normalizeTextKey(sizeName)
    )
      ? form.sizes.filter((value) => normalizeTextKey(value) !== normalizeTextKey(sizeName))
      : [...form.sizes, sizeName];

    applyImportedCapabilitySelections(selectedImportedColorValues, nextSelectedSizes);
  }

  function toggleCustomColor(colorName) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant) =>
        normalizeTextKey(resolveVariantColorName(variant) || variant.name) === normalizeTextKey(colorName)
          ? { ...variant, active: variant.active === false }
          : variant
      ),
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

    setForm((current) => {
      const existingVariantIndex = current.variants.findIndex(
        (variant) => normalizeTextKey(resolveVariantColorName(variant) || variant.name) === normalizeTextKey(name)
      );

      if (existingVariantIndex >= 0) {
        return {
          ...current,
          variants: current.variants.map((variant, index) =>
            index === existingVariantIndex
              ? {
                  ...variant,
                  name,
                  color: name,
                  colors: [name],
                  supplier_variant: name,
                  active: true,
                }
              : variant
          ),
        };
      }

      return {
        ...current,
        variants: [
          ...current.variants,
          {
            id: `variant-${Date.now()}`,
            name,
            color: name,
            colors: [name],
            supplier_variant: name,
            supplier_sku: normalizeText(variantDraft.supplier_sku),
            active: true,
          },
        ],
      };
    });
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
        variants: form.variants.map((variant) => normalizeVariantForSave(variant)).filter(Boolean),
        default_placements: uniqueList(form.default_placements),
        default_production_methods: uniqueList(form.default_production_methods),
        notes: form.notes,
        active: form.active,
      };

      console.info("[GarmentLibrary] submitting garment payload", {
        mode: editingId ? "update" : "create",
        editingId,
        formVariantCount: Array.isArray(form.variants) ? form.variants.length : 0,
        formVariantsBeforeSaveNormalization: (form.variants || []).map((variant) =>
          summarizeVariantForDebug(variant)
        ),
        formSizesBeforeSaveNormalization: form.sizes || [],
        persistedVariantStructure: (payload.variants || []).map((variant) => summarizeVariantForDebug(variant)),
        payloadJson: safeStringify(payload),
      });

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
      const previewPayload = {
        fileName: file.name,
        garments: parsed.garments.map((group) => ({ ...group, skip: false })),
        garmentCount: parsed.garmentCount,
        rowCount: parsed.rowCount,
        validRowCount: parsed.validRowCount,
        skippedEmptyRowCount: parsed.skippedEmptyRowCount,
        skippedMalformedRowCount: parsed.skippedMalformedRowCount,
        warningCount: parsed.warningCount,
      };

      console.info("[GarmentLibrary] normalized import preview payload", {
        fileName: file.name,
        parserMode: "csv_text_only",
        garmentCount: parsed.garmentCount,
        warningCount: parsed.warningCount,
        garmentsJson: safeStringify(parsed.garments),
        previewPayloadJson: safeStringify(previewPayload),
      });

      setImportPreview(previewPayload);
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

        const nextVariants = [...(existingGarment?.variants || [])];
        const nextSizes = sortSizesByLookup(
          uniqueList([...(existingGarment?.sizes || []), ...(previewGroup.sizes || [])]),
          sizes
        );

        console.info("[GarmentLibrary] importing parsed garment group", {
          title: previewGroup.title,
          parsedColors: previewGroup.variants.map((variant) => variant?.name).filter(Boolean),
          parsedSizes: previewGroup.sizes || [],
          generatedVariantCount: previewGroup.variants.length,
          parsedVariantArrayBeforeNormalization: previewGroup.variants.map((variant) =>
            summarizeVariantForDebug(variant)
          ),
          previewGroupJson: safeStringify(previewGroup),
          existingGarmentJson: safeStringify(existingGarment),
        });

        previewGroup.variants.forEach((variant) => {
          const variantKey = normalizeTextKey(variant.name);
          const existingVariantIndex = nextVariants.findIndex(
            (existingVariant) => normalizeTextKey(existingVariant?.name) === variantKey
          );

          if (existingVariantIndex >= 0) {
            const existingVariant = normalizeVariantForSave(nextVariants[existingVariantIndex]);
            const mergedSizes = sortSizesByLookup(
              uniqueList([...(existingVariant?.sizes || []), ...(variant.sizes || [])]),
              sizes
            );

            console.info("[GarmentLibrary] merged imported variant into existing variant", {
              garmentTitle: previewGroup.title,
              variantKey,
              existingVariantIndex,
              incomingVariant: summarizeVariantForDebug(variant),
              existingVariant: summarizeVariantForDebug(existingVariant),
              mergedSizes,
            });

            nextVariants[existingVariantIndex] = {
              ...existingVariant,
              sizes: mergedSizes,
              size: mergedSizes[0] || "",
            };
            skippedVariants += 1;
            return;
          }

          const nextVariantSizes = sortSizesByLookup(uniqueList(variant.sizes || []), sizes);
          const nextVariant = {
            id: `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: variant.name,
            color: variant.name,
            colors: [variant.name],
            sizes: nextVariantSizes,
            size: nextVariantSizes[0] || "",
            supplier_variant: variant.name,
            supplier_sku: variant.supplierSku,
            active: true,
          };
          console.info("[GarmentLibrary] accepted imported variant for persistence", {
            garmentTitle: previewGroup.title,
            variantKey,
            persistedVariant: summarizeVariantForDebug(nextVariant),
            persistedVariantJson: safeStringify(nextVariant),
          });
          nextVariants.push(nextVariant);
          addedVariants += 1;
        });

        if (nextVariants.length === 0) {
          console.warn("[GarmentLibrary] nextVariants resolved empty before persistence", {
            garmentTitle: previewGroup.title,
            existingGarmentId: existingGarment?.id || null,
            previewGroupVariantCount: previewGroup.variants.length,
            previewGroupVariants: previewGroup.variants.map((variant) => summarizeVariantForDebug(variant)),
          });
        }

        if (existingGarment) {
          const existingSizes = sortSizesByLookup(uniqueList(existingGarment.sizes || []), sizes);
          const shouldUpdate =
            nextVariants.length !== (existingGarment.variants || []).length ||
            JSON.stringify(nextSizes) !== JSON.stringify(existingSizes) ||
            existingGarment.category_lookup_id !== category.id ||
            existingGarment.brand_lookup_id !== brand.id ||
            existingGarment.garment_model_lookup_id !== garmentModelId;

          if (shouldUpdate) {
            console.info("[GarmentLibrary] persisted garment update payload", {
              title: previewGroup.title,
              nextSizes,
              nextVariantCount: nextVariants.length,
              finalPersistedVariantStructure: nextVariants.map((variant) => summarizeVariantForDebug(variant)),
              nextVariantsJson: safeStringify(nextVariants),
            });
            await updateGarmentLibraryItem(existingGarment.id, {
              category_lookup_id: category.id,
              brand_lookup_id: brand.id,
              garment_model_lookup_id: garmentModelId,
              sizes: nextSizes,
              variants: nextVariants,
            });
            updatedGarments += 1;
          }
          continue;
        }

        console.info("[GarmentLibrary] persisted garment create payload", {
          title: previewGroup.title,
          nextSizes,
          nextVariantCount: nextVariants.length,
          finalPersistedVariantStructure: nextVariants.map((variant) => summarizeVariantForDebug(variant)),
          nextVariantsJson: safeStringify(nextVariants),
        });
        await createGarmentLibraryItem({
          title: previewGroup.title,
          category_lookup_id: category.id,
          brand_lookup_id: brand.id,
          garment_model_lookup_id: garmentModelId,
          image: "",
          variants: nextVariants,
          sizes: nextSizes,
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

  console.log("[GarmentLibrary] before main render branches", {
    garmentCount: garments.length,
    isGarmentLibraryLoading,
    shouldShowLoadingState,
    shouldShowEmptyState,
    activeGarmentCount,
    hasFinishedInitialLoad,
    garmentBrowseItemCount: garmentBrowseItems.length,
    filteredGarmentCount,
    renderedGarmentCardCount: renderedGarmentCards.length,
    hasActiveGarmentFilters,
    brandFilterOptionsCount: brandFilterOptions.length,
    brandSelectOptionsCount: brandSelectOptions.length,
    importNoticePresent: Boolean(importNotice),
    saveErrorPresent: Boolean(saveError),
    importErrorPresent: Boolean(importError),
    isEditorOpen,
    isImportOpen,
  });

  return (
    <div className="products-page garment-library-page">
      <div className="garment-library-shell">
        <section className="products-catalog-panel garment-library-browser">
          <div className="garment-library-hero">
            <div className="garment-library-hero-copy">
              <p className="products-eyebrow">Garment Library</p>
              <h1 className="garment-library-title">Browse and manage reusable garment templates</h1>
              <p className="garment-library-description">
                Garment templates store supplier-facing setup. Create storefront products from them separately when
                you are ready to build a customer-facing draft.
              </p>
            </div>

            <div className="garment-library-hero-actions">
              <button type="button" className="products-primary-button" onClick={startCreatingGarment}>
                + New Garment Template
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
              <span>Visible Results</span>
              <strong>{filteredGarmentCount}</strong>
              <p>Garments matching the current search and filter state.</p>
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
              {shouldShowLoadingState
                ? "Loading garment library..."
                : `${renderedGarmentCards.length} garment${renderedGarmentCards.length === 1 ? "" : "s"} shown`}
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
            <div className="products-list-grid garment-library-grid">
              {(() => {
                try {
                  console.log("[GarmentLibrary] evaluating garment list branch", {
                    isGarmentLibraryLoading,
                    shouldShowLoadingState,
                    shouldShowEmptyState,
                    garmentCount: garments.length,
                    activeGarmentCount,
                    filteredGarmentCount,
                    renderedGarmentCardCount: renderedGarmentCards.length,
                    hasActiveGarmentFilters,
                    hasFinishedInitialLoad,
                  });

                  if (shouldShowLoadingState) {
                    console.log("[GarmentLibrary] taking loading-state branch");
                    return (
                      <div className="products-empty-state">
                        <strong>Loading garment library...</strong>
                        <span>Fetching reusable garments from the remote catalog.</span>
                      </div>
                    );
                  }

                  console.log("[GarmentLibrary] before renderedGarmentCards.length branch", {
                    renderedGarmentCardCount: renderedGarmentCards.length,
                    renderedGarmentCardPreview: renderedGarmentCards.slice(0, 3).map((card, index) => ({
                      index,
                      key: card?.key,
                      type:
                        typeof card?.type === "string"
                          ? card.type
                          : card?.type?.displayName || card?.type?.name || typeof card?.type,
                    })),
                  });

                  if (renderedGarmentCards.length > 0) {
                    console.log("[GarmentLibrary] taking garment list branch", {
                      renderedGarmentCardCount: renderedGarmentCards.length,
                    });
                    return renderedGarmentCards;
                  }

                  console.log("[GarmentLibrary] taking empty-state branch", {
                    hasActiveGarmentFilters,
                    hasFinishedInitialLoad,
                    activeGarmentCount,
                  });
                  return (
                    <div className="products-empty-state">
                      <strong>
                        {shouldShowEmptyState
                          ? "No garments are available yet."
                          : hasActiveGarmentFilters
                          ? "No garments match the current filters."
                          : "No garments are available to render right now."}
                      </strong>
                      <span>
                        {shouldShowEmptyState
                          ? "Create a garment or import the supplier spreadsheet to populate the library."
                          : hasActiveGarmentFilters
                          ? "Clear or adjust the search, category, brand, or storefront filters."
                          : "Live garments exist, but no renderable cards were produced from the filtered list."}
                      </span>
                    </div>
                  );
                } catch (error) {
                  const suspectedGarment = filteredGarments.find(({ item, usage }) => {
                    if (!item || typeof item !== "object") return true;
                    if (!Array.isArray(item.variants)) return true;
                    if (!Array.isArray(item.sizes)) return true;
                    if (!Array.isArray(item.default_production_methods)) return true;
                    if (!usage || typeof usage !== "object") return true;
                    if (typeof usage.linkedProductCount !== "number") return true;
                    return false;
                  });
                  logGarmentRenderError("main garment list branch", error, {
                    isGarmentLibraryLoading,
                    shouldShowLoadingState,
                    shouldShowEmptyState,
                    garmentCount: garments.length,
                    activeGarmentCount,
                    filteredGarmentCount,
                    renderedGarmentCardCount: renderedGarmentCards.length,
                    hasActiveGarmentFilters,
                    hasFinishedInitialLoad,
                    suspectedGarmentId: suspectedGarment?.item?.id,
                    suspectedGarmentTitle: suspectedGarment?.item?.title,
                    suspectedFailureField: !suspectedGarment
                      ? "unknown"
                      : !suspectedGarment?.item
                        ? "filteredGarments[].item"
                        : !Array.isArray(suspectedGarment.item.variants)
                          ? "item.variants"
                          : !Array.isArray(suspectedGarment.item.sizes)
                            ? "item.sizes"
                            : !Array.isArray(suspectedGarment.item.default_production_methods)
                              ? "item.default_production_methods"
                              : !suspectedGarment?.usage || typeof suspectedGarment.usage !== "object"
                                ? "usage"
                                : typeof suspectedGarment.usage.linkedProductCount !== "number"
                                  ? "usage.linkedProductCount"
                                  : "unknown",
                    suspectedGarment,
                    filteredGarmentSample: filteredGarments.slice(0, 3).map(({ item, subtitle, usage }, index) => ({
                      index,
                      garmentId: item?.id,
                      garmentTitle: item?.title,
                      subtitle,
                      hasImage: Boolean(item?.image || item?.imageSrc),
                      variantsIsArray: Array.isArray(item?.variants),
                      sizesIsArray: Array.isArray(item?.sizes),
                      defaultProductionMethodsIsArray: Array.isArray(item?.default_production_methods),
                      linkedProductCount: usage?.linkedProductCount,
                    })),
                  });
                  throw error;
                }
              })()}
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
                      Required columns: Category, Brand, Supplier SKU, Product Name, Variant/Color. Optional size columns such as Sizes are parsed, colors split on newlines, and size lists split on commas.
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
                                      {group.category} • {formatCountLabel(group.variantCount, "variant")} • {formatCountLabel(group.sizeCount || group.sizes?.length || 0, "size")} detected
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
                    <p className="products-eyebrow">{isEditMode ? "Garment Template Detail" : "Garment Template Setup"}</p>
                    <h2 style={{ margin: "6px 0 0" }}>{isEditMode ? selectedGarmentLabel : "New Garment Template"}</h2>
                    <p className="garment-library-panel-copy">
                      {isEditMode
                        ? "Browse this garment like reusable inventory first. Template editing stays available below when you need to maintain supplier data."
                        : "Build the garment template manually or start from an imported supplier model, then save it to the library for reuse."}
                    </p>
                  </div>
                  <button type="button" className="products-secondary-button" onClick={closeWorkspace}>
                    Close
                  </button>
                </div>

                {saveError ? <div className="products-error-banner">{saveError}</div> : null}

                {isEditMode ? (
                  <section className="products-editor-section garment-library-detail-hero">
                    <div className="garment-library-detail-media">
                      {selectedGarment?.image ? (
                        <img
                          src={selectedGarment.image}
                          alt={selectedGarment.title || "Garment template"}
                          className="garment-library-detail-image"
                        />
                      ) : (
                        <NoImagePlaceholder className="garment-library-detail-image garment-library-detail-placeholder" />
                      )}
                    </div>

                    <div className="garment-library-detail-content">
                      <div className="garment-library-detail-title-row">
                        <div className="garment-library-detail-title-block">
                          <span className="products-summary-label">Reusable Garment Template</span>
                          <h2 className="garment-library-detail-title">{selectedGarmentLabel}</h2>
                          <p className="garment-library-detail-subtitle">
                            Browse the garment first, then create storefront products from this reusable template when
                            you are ready.
                          </p>
                        </div>
                        <span className="garment-library-detail-status">
                          {selectedGarment?.active === false ? "Inactive" : "Active"}
                        </span>
                      </div>

                      <div className="garment-library-detail-pill-row">
                        <span className="garment-library-card-primary-pill">
                          {selectedGarmentCategory?.name || "No category"}
                        </span>
                        <span className="garment-library-card-primary-pill">
                          {selectedGarmentBrand?.name || "No brand"}
                        </span>
                        {selectedGarmentModel?.display_name || selectedGarmentModel?.model_code ? (
                          <span className="garment-library-card-primary-pill garment-library-card-primary-pill-subtle">
                            {selectedGarmentModel?.display_name || selectedGarmentModel?.model_code}
                          </span>
                        ) : null}
                      </div>

                      <div className="garment-library-detail-action-row">
                        <button
                          type="button"
                          className="products-primary-button products-primary-button-large"
                          onClick={() => openStorefrontProductDraft(editingGarment)}
                          disabled={isCreatingStorefrontProduct}
                        >
                          {isCreatingStorefrontProduct ? "Opening..." : "Create Storefront Product"}
                        </button>
                        <button type="submit" disabled={isSaving} className="products-secondary-button">
                          {isSaving ? "Saving..." : "Edit Template"}
                        </button>
                      </div>

                      <div className="garment-library-detail-summary-card">
                        <span className="products-summary-label">Quick Summary</span>
                        <p>
                          This template exposes {formatCountLabel(selectedGarmentSummary.activeVariants || 0, "active variant")} across{" "}
                          {formatCountLabel(selectedGarmentSummary.totalColors || 0, "color")} and{" "}
                          {formatCountLabel(selectedGarmentSummary.totalSizes || 0, "size")}. Use it to spin up storefront products
                          without reopening full supplier setup.
                        </p>
                      </div>

                      <div className="garment-library-detail-glance-grid">
                        <div className="garment-library-detail-stat">
                          <span className="products-summary-label">Colors</span>
                          <strong>{selectedGarmentSummary.totalColors || 0}</strong>
                          <div className="garment-library-detail-stat-copy">
                            {renderPreviewChips(selectedGarmentSummary.colorPreview, "No colors")}
                          </div>
                        </div>

                        <div className="garment-library-detail-stat">
                          <span className="products-summary-label">Sizes</span>
                          <strong>{selectedGarmentSummary.totalSizes || 0}</strong>
                          <div className="garment-library-detail-stat-copy">
                            {renderPreviewChips(selectedGarmentSummary.sizePreview, "No sizes")}
                          </div>
                        </div>

                        <div className="garment-library-detail-stat">
                          <span className="products-summary-label">Storefront Usage</span>
                          <strong>{selectedGarmentUsage.linkedProductCount || 0}</strong>
                          <div className="garment-library-detail-stat-copy">
                            <span>
                              {(selectedGarmentUsage.linkedProductCount || 0) === 1
                                ? "linked product"
                                : "linked products"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}

                <details className="products-editor-section garment-library-template-editing-shell" open={!isEditMode}>
                  <summary className="products-advanced-summary">
                    <div>
                      <p className="products-section-step">{isEditMode ? "Secondary" : "Template Setup"}</p>
                      <strong>{isEditMode ? "Template Editing" : "Build Template Details"}</strong>
                      <span>
                        {isEditMode
                          ? "Expand only when you need to adjust garment template data, imported model mapping, or supplier-facing defaults."
                          : "Fill in the reusable garment template details here."}
                      </span>
                    </div>
                  </summary>

                  <div className="garment-library-template-editing-stack">
                <section className="products-editor-section">
                  <div className="products-section-header">
                    <div>
                      <p className="products-section-step">Section 1</p>
                      <h2>Basic Garment Info</h2>
                    </div>
                    <p>
                      Start from an existing supplier garment or create your own. Imported models
                      can preload colors, sizes, variants, and defaults without blocking manual setup.
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
                      {hasCategoryAndBrandSelected && matchingImportedGarments.length ? (
                        <div style={{ display: "grid", gap: "12px" }}>
                          <div className="products-imported-suggestion-header">
                            <strong>Suggested Imported Models</strong>
                            <p>Pick one to load supplier data into the form, or keep building manually.</p>
                          </div>

                          <div className="products-imported-suggestion-grid" role="list" aria-label="Suggested imported garment models">
                            {visibleImportedSuggestions.map((entry) => {
                              const item = entry?.item;
                              const activeVariantCount = (item?.variants || []).filter(
                                (variant) => variant?.active !== false
                              ).length;
                              const sizeCount = (item?.sizes || []).length;
                              const isSelected = selectedReusableGarmentId === item?.id;

                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  className={`products-imported-suggestion-card ${isSelected ? "is-selected" : ""}`}
                                  onClick={() => handleReusableGarmentSelect(item.id)}
                                  role="listitem"
                                >
                                  <strong>{entry.optionLabel}</strong>
                                  <span>{normalizeText(item?.title) || "Imported supplier garment"}</span>
                                  <small>
                                    {activeVariantCount} active variant{activeVariantCount === 1 ? "" : "s"} •{" "}
                                    {sizeCount} size{sizeCount === 1 ? "" : "s"}
                                  </small>
                                </button>
                              );
                            })}
                          </div>

                          <SearchableLookupField
                            label="Search Imported Models"
                            value={reusableGarmentSearch}
                            onChange={(event) => {
                              setReusableGarmentSearch(event.target.value);
                              if (selectedReusableGarmentId) {
                                clearImportedGarmentSelection();
                              }
                            }}
                            onSelect={(entry) => handleReusableGarmentSelect(entry.item.id)}
                            options={matchingImportedGarments}
                            placeholder="Search imported garment models"
                            helperText={
                              selectedReusableGarmentEntry
                                ? "Selected models hydrate the form immediately. You can keep editing any imported values."
                                : "Select a supplier garment to auto-populate the form, or continue without one."
                            }
                            action={
                              selectedReusableGarmentId ? (
                                <button
                                  type="button"
                                  className="products-inline-cancel"
                                  onClick={clearImportedGarmentSelection}
                                >
                                  Clear Imported Selection
                                </button>
                              ) : null
                            }
                            renderOptionLabel={(entry) => entry.optionLabel}
                            renderOptionMeta={(entry) => {
                              const item = entry?.item;
                              const activeVariantCount = (item?.variants || []).filter(
                                (variant) => variant?.active !== false
                              ).length;
                              const sizeCount = (item?.sizes || []).length;
                              const title = normalizeText(item?.title);
                              return `${title} • ${activeVariantCount} active variants • ${sizeCount} sizes`;
                            }}
                            emptyState="No imported garments match this category and brand."
                          />

                          <div className="products-field-footer">
                            <span>
                              {selectedReusableGarmentEntry
                                ? "Imported supplier data is loaded. Use colors and sizes below to decide what this garment should expose."
                                : "Use a model as a shortcut, or keep filling out the garment form manually."}
                            </span>
                          </div>
                        </div>
                      ) : hasCategoryAndBrandSelected ? (
                        <div className="products-field-footer">
                          <span>
                            No imported garments match this category and brand yet. Continue building
                            this garment manually.
                          </span>
                        </div>
                      ) : (
                        <div className="products-selection-empty">
                          Select a category and brand to see suggested imported garment models, or
                          continue creating the garment manually.
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

                  <div className="products-inline-model-grid">
                    <label style={labelStyle}>
                      Garment Model Name
                      <input
                        value={modelDraft.display_name}
                        onChange={(event) =>
                          setModelDraft((current) => ({ ...current, display_name: event.target.value }))
                        }
                        placeholder="Women's Heavy Cotton T-Shirt"
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
                        placeholder="5000L"
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
                      placeholder="Gildan Women's Heavy Cotton T-Shirt - 5000L"
                      style={fieldStyle}
                    />
                  </label>

                  <ProductImageUploader
                    image={form.image}
                    onImageChange={(image) => setForm((current) => ({ ...current, image }))}
                  />
                </section>

                <section className="products-editor-section">
                  <div className="products-section-header">
                    <div>
                      <p className="products-section-step">Section 2</p>
                      <h2>Available Colors</h2>
                    </div>
                    <p>
                      {isImportedCapabilityMode
                        ? "Enable the supplier colors this garment should expose."
                        : "Build a lightweight storefront-facing color set for this garment."}
                    </p>
                  </div>

                  {isImportedCapabilityMode ? (
                    <CompactCapabilitySelector
                      label="Available Colors"
                      helperText="Search and toggle the colors customers should see."
                      options={derivedImportedColorOptions}
                      selectedValues={selectedImportedColorValues}
                      onToggle={toggleImportedColor}
                      searchPlaceholder="Search colors"
                      emptyState="No supplier colors were derived from this imported garment."
                    />
                  ) : (
                    <>
                      <CompactCapabilitySelector
                        label="Available Colors"
                        helperText="Add colors below, then click them here to enable or disable them."
                        options={customColorOptions}
                        selectedValues={selectedCustomColorValues}
                        onToggle={toggleCustomColor}
                        searchPlaceholder="Search colors"
                        emptyState="No colors added yet."
                      />

                      <div className="products-variant-create-row">
                        <input
                          value={variantDraft.name}
                          onChange={(event) =>
                            setVariantDraft((current) => ({ ...current, name: event.target.value }))
                          }
                          placeholder="Add color"
                          style={fieldStyle}
                          aria-label="Add color variant"
                        />
                        <button type="button" className="products-inline-save" onClick={addVariant}>
                          Add Color
                        </button>
                      </div>
                    </>
                  )}
                </section>

                <section className="products-editor-section">
                  <div className="products-section-header">
                    <div>
                      <p className="products-section-step">Section 3</p>
                      <h2>Available Sizes</h2>
                    </div>
                    <p>
                      {isImportedCapabilityMode
                        ? "Sizes come from the imported garment's shared size run and do not change by color."
                        : "Select the size run this garment should support."}
                    </p>
                  </div>

                  <CompactCapabilitySelector
                    label="Available Sizes"
                    helperText={
                      isImportedCapabilityMode
                        ? "Search and toggle garment-level sizes. Color selections do not change this list."
                        : "Choose the reusable size run for storefront products built from this garment."
                    }
                    options={
                      isImportedCapabilityMode
                        ? derivedImportedSizeOptions
                        : sizes.map((size) => ({ id: size.id, name: size.name }))
                    }
                    selectedValues={form.sizes}
                    onToggle={isImportedCapabilityMode ? toggleImportedSize : toggleSize}
                    searchPlaceholder="Search sizes"
                    emptyState={
                      isImportedCapabilityMode
                        ? "No garment-level sizes are available yet."
                        : "No sizes available yet."
                    }
                  />

                  {!isImportedCapabilityMode ? (
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
                  ) : null}
                </section>

                <details className="products-editor-section products-advanced-section">
            <summary className="products-advanced-summary">
              <div>
                <p className="products-section-step">Optional</p>
                <strong>Advanced Supplier Data</strong>
                <span>
                  Hidden by default so supplier SKUs and internal variant structure do not crowd the main flow.
                </span>
              </div>
            </summary>

            <div className="products-advanced-stack">
              <div className="products-multiselect-toolbar">
                <input
                  type="search"
                  value={variantSearch}
                  onChange={(event) => setVariantSearch(event.target.value)}
                  placeholder="Search colors, sizes, or supplier SKU"
                  style={fieldStyle}
                />
              </div>

              {isImportedCapabilityMode ? (
                <div className="products-supplier-data-grid">
                  {visibleImportedCapabilities.length ? (
                    visibleImportedCapabilities.map((capability) => {
                      const isEnabled = selectedImportedColorValues.some(
                        (value) => normalizeTextKey(value) === normalizeTextKey(capability.name)
                      );

                      return (
                        <article key={capability.id} className="products-supplier-data-card">
                          <div className="products-supplier-data-header">
                            <strong>{capability.name}</strong>
                            <span>{isEnabled ? "Enabled" : "Hidden"}</span>
                          </div>
                          <p>
                            SKUs: {capability.supplierSkus.length ? capability.supplierSkus.join(", ") : "None"}
                          </p>
                          <p>
                            Sizes: {capability.sizes.length ? capability.sizes.join(", ") : "None"}
                          </p>
                        </article>
                      );
                    })
                  ) : (
                    <div className="products-selection-empty">
                      {variantSearch.trim() ? "No supplier data matches that search." : "No supplier data available."}
                    </div>
                  )}
                </div>
              ) : (
                <div className="products-variant-catalog" role="list" aria-label="Advanced color management">
                  {visibleVariants.length ? (
                    visibleVariants.map((variant) => (
                      <div key={variant.id} className="products-variant-card" role="listitem">
                        <input
                          value={variant.name}
                          onChange={(event) => updateVariant(variant.id, { name: event.target.value })}
                          style={fieldStyle}
                          className="products-variant-name"
                          aria-label={`Color name for ${variant.name || "variant"}`}
                        />
                        <input
                          value={variant.supplier_sku || ""}
                          onChange={(event) => updateVariant(variant.id, { supplier_sku: event.target.value })}
                          style={fieldStyle}
                          placeholder="Supplier SKU"
                          aria-label={`Supplier SKU for ${variant.name || "variant"}`}
                        />
                        <div className="products-variant-card-actions">
                          <label className="products-inline-toggle">
                            <input
                              type="checkbox"
                              checked={variant.active !== false}
                              onChange={(event) => updateVariant(variant.id, { active: event.target.checked })}
                              aria-label={`Set ${variant.name || "variant"} active`}
                            />
                            <span>Enabled</span>
                          </label>
                          <button
                            type="button"
                            className="products-inline-cancel"
                            onClick={() => removeVariant(variant.id)}
                            aria-label={`Remove ${variant.name || "variant"}`}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="products-selection-empty">
                      {variantSearch.trim() ? "No colors match that search." : "No colors added yet."}
                    </div>
                  )}
                </div>
              )}
            </div>
          </details>

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
                  </div>
                </details>

          {isEditMode && editingGarment ? (
            <section className="products-editor-section garment-library-completion-card">
              <div className="products-section-header">
                <div>
                  <p className="products-section-step">Storefront Publishing</p>
                  <h2>Create Storefront Draft</h2>
                </div>
                <p>
                  Keep garment maintenance separate from storefront publishing. Open the storefront editor
                  immediately with this garment preloaded, then finish customer-facing setup in context.
                </p>
              </div>

              <div className="garment-library-completion-grid">
                <div className="products-summary-card garment-library-completion-summary">
                  <span className="products-summary-label">Publishing Flow</span>
                  <strong>{normalizeText(form.title) || "Named garment template"}</strong>
                  <div className="products-summary-details">
                    <span>Template saved separately</span>
                    <span>Storefront draft opens with setup applied</span>
                  </div>
                </div>
              </div>

              <div className="garment-library-completion-actions">
                <div className="garment-library-completion-copy">
                  <strong>Guided handoff</strong>
                  <p>
                    Start from the garment template, then set pricing, visibility, category, brand, and copy
                    directly in the storefront product editor.
                  </p>
                </div>

                <button
                  type="button"
                  className="products-primary-button products-primary-button-large"
                  onClick={() => openStorefrontProductDraft(editingGarment)}
                  disabled={isCreatingStorefrontProduct}
                >
                  {isCreatingStorefrontProduct ? "Opening..." : "Create Storefront Product"}
                </button>
              </div>
            </section>
          ) : null}

          <details className="products-editor-section products-advanced-section garment-library-admin-actions">
            <summary className="products-advanced-summary">
              <div>
                <strong>Template Admin Actions</strong>
                <span>
                  Supplier-template maintenance stays available here without competing with storefront creation.
                </span>
              </div>
            </summary>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: editingId ? "1fr 1fr" : "1fr",
                gap: "10px",
              }}
            >
              <button type="submit" disabled={isSaving} className="products-secondary-button">
                {isSaving ? "Saving..." : isEditMode ? "Save Template Changes" : "Create Garment Template"}
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
          </details>
              </form>
            )}
          </aside>
        ) : null}
      </div>

    </div>
  );
}
