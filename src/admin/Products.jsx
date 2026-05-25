import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Products.css";
import NoImagePlaceholder from "../components/NoImagePlaceholder";
import ProductImageUploader from "../components/ProductImageUploader";
import { PRODUCTION_TYPES } from "../constants/productionTypes";
import {
  createCatalogLookup,
  useCatalogLookups,
} from "../lib/catalogLookupsStore";
import { useGarmentLibraryItems } from "../lib/garmentLibraryStore";
import { findLinkedGarmentLibraryItem } from "../lib/productGarmentLinks";
import {
  buildPlacementConfig,
  areStoredProductsReady,
  createStoredProduct,
  deleteStoredProduct,
  getProductPlacementConfig,
  refreshStoredProducts,
  updateStoredProduct,
  useStoredProducts,
} from "../lib/productsStore";
import {
  buildStorefrontCategoryRegistry,
  buildStorefrontCategorySelectionValue,
  findStorefrontCategoryBySelectionValue,
  resolveStorefrontCategoryAssignment,
} from "../lib/storefrontCatalog";
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
import {
  getProductCharacteristics,
  summarizeCharacteristics,
} from "../products/productCharacteristics";

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

const PRODUCT_MODES = {
  APPAREL: "apparel",
  MANUAL: "manual",
};

const CREATE_STOREFRONT_CATEGORY_VALUE = "__create_storefront_category__";
const CREATE_BRAND_VALUE = "__create_brand__";

const emptyProduct = {
  productMode: PRODUCT_MODES.APPAREL,
  name: "",
  selectedGarmentLibraryId: "",
  garmentSearch: "",
  flat_price: "",
  image: "",
  visibleVariants: [],
  sizes: [],
  characteristics: [],
  notes: "",
  status: "Active",
  is_featured: false,
  placementsText: "",
  placementPriceMap: {},
  production_methods: ["Screen Print"],
  production_method_prices: {},
  cost_price: "",
  markup_percentage: "",
  category: "",
  category_lookup_id: "",
  storefront_category_lookup_id: "",
  brand_lookup_id: "",
  garment_model_lookup_id: "",
  product_type: "",
  brand_model: "",
};

function createEmptyCharacteristic() {
  return {
    name: "",
    values: [],
  };
}

function getCharacteristicValueInputKey(index) {
  return `characteristic-${index}`;
}

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

function resolveStorefrontCategoryOption(
  storefrontCategories = [],
  storefrontCategoryLookupId = "",
  storefrontCategoryName = "",
  fallbackCategoryName = ""
) {
  const registry = buildStorefrontCategoryRegistry(
    [
      {
        storefront_category_lookup_id: storefrontCategoryLookupId,
        storefront_category: storefrontCategoryName || fallbackCategoryName,
        category: fallbackCategoryName,
      },
    ],
    storefrontCategories
  );
  const normalizedLookupId = normalizeText(storefrontCategoryLookupId);
  if (normalizedLookupId) {
    const matchedCategory = findStorefrontCategoryBySelectionValue(
      registry,
      normalizedLookupId
    );
    if (matchedCategory) return matchedCategory;
  }

  const targetName = normalizeText(storefrontCategoryName || fallbackCategoryName).toLowerCase();
  if (!targetName) return null;

  return registry.find(
    (category) => normalizeText(category?.name).toLowerCase() === targetName
  ) || null;
}

function mergeStorefrontCategorySources(...sources) {
  return buildStorefrontCategoryRegistry(
    [],
    sources.flatMap((source) => (Array.isArray(source) ? source : []))
  );
}

function resolveProductMode(product = {}, matchedItem = null) {
  return matchedItem || product?.garment_library_item_id
    ? PRODUCT_MODES.APPAREL
    : PRODUCT_MODES.MANUAL;
}

function buildCategoryScopedBrandOptions(
  libraryItems = [],
  brands = [],
  selectedCategoryId = "",
  selectedBrandId = ""
) {
  const normalizedCategoryId = normalizeText(selectedCategoryId);
  const scopedItems = normalizedCategoryId
    ? libraryItems.filter(
        (item) =>
          item?.active !== false &&
          normalizeText(item?.category_lookup_id) === normalizedCategoryId
      )
    : libraryItems.filter((item) => item?.active !== false);
  const optionsById = new Map();

  scopedItems.forEach((item) => {
    const brandId = normalizeText(item?.brand_lookup_id);
    if (!brandId || optionsById.has(brandId)) return;

    const brand = brands.find((entry) => entry.id === brandId);
    const label = normalizeText(brand?.name);
    if (!label) return;

    optionsById.set(brandId, {
      value: brandId,
      label,
    });
  });

  if (selectedBrandId && !optionsById.has(selectedBrandId)) {
    const selectedBrand = brands.find((brand) => brand.id === selectedBrandId);
    const selectedLabel = normalizeText(selectedBrand?.name);
    if (selectedLabel) {
      optionsById.set(selectedBrandId, {
        value: selectedBrandId,
        label: selectedLabel,
      });
    }
  }

  return Array.from(optionsById.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function buildFormFromGarmentDraft(
  item,
  sizeLookups,
  brands,
  categories,
  garmentModels,
  storefrontCategories = [],
  prefilledStorefrontSetup = {}
) {
  const garmentModel = findLookupById(garmentModels, item?.garment_model_lookup_id);
  const brand = findLookupById(brands, item?.brand_lookup_id);
  const category = findLookupById(categories, item?.category_lookup_id);
  const storefrontCategory =
    resolveStorefrontCategoryOption(
      storefrontCategories,
      item?.storefront_category_lookup_id,
      item?.storefront_category,
      category?.name || item?.category
    ) || null;
  const prefilledStorefrontCategory =
    resolveStorefrontCategoryOption(
      storefrontCategories,
      prefilledStorefrontSetup?.storefront_category_lookup_id,
      prefilledStorefrontSetup?.storefront_category,
      storefrontCategory?.name || category?.name || item?.category
    ) || null;
  const defaultProductionMethods =
    Array.isArray(item?.default_production_methods) && item.default_production_methods.length
      ? item.default_production_methods
      : ["Screen Print"];
  const defaultPlacements = Array.isArray(item?.default_placements)
    ? item.default_placements
    : [];

  return {
    ...emptyProduct,
    productMode: PRODUCT_MODES.APPAREL,
    name: item?.title || "",
    selectedGarmentLibraryId: item?.id || "",
    garmentSearch: buildGarmentLibraryLabel(item, brands, categories, garmentModels),
    image: item?.image || "",
    visibleVariants: getVariantOptions(item).map((variant) => variant.name),
    sizes: sortSizesByLookup(item?.sizes || [], sizeLookups),
    characteristics: [],
    flat_price: normalizeText(prefilledStorefrontSetup?.flat_price),
    placementsText: defaultPlacements.join(", "),
    placementPriceMap: buildPlacementPriceMap(defaultPlacements, {}),
    production_methods: defaultProductionMethods,
    production_method_prices: buildMethodPriceMap(defaultProductionMethods, {}),
    category: category?.name || "",
    category_lookup_id: item?.category_lookup_id || "",
    storefront_category_lookup_id:
      (prefilledStorefrontCategory
        ? buildStorefrontCategorySelectionValue(prefilledStorefrontCategory)
        : "") ||
      normalizeText(prefilledStorefrontSetup?.storefront_category_lookup_id) ||
      (storefrontCategory
        ? buildStorefrontCategorySelectionValue(storefrontCategory)
        : "") ||
      "",
    brand_lookup_id: item?.brand_lookup_id || "",
    garment_model_lookup_id: item?.garment_model_lookup_id || "",
    product_type: resolveStructuredProductType(garmentModel, "", item?.title || ""),
    brand_model: buildLegacyBrandModelValue(brand, garmentModel, ""),
    status: normalizeText(prefilledStorefrontSetup?.status) || "Active",
    is_featured: Boolean(prefilledStorefrontSetup?.is_featured),
    notes: "",
  };
}

function buildFormFromProduct(
  product,
  libraryItems,
  sizeLookups,
  brands,
  categories,
  garmentModels,
  storefrontCategories = []
) {
  const { storefront_category: _storefrontCategory, ...productFields } = product || {};
  const matchedItem = findLinkedGarmentLibraryItem(product, libraryItems);
  const storefrontCategory =
    resolveStorefrontCategoryOption(
      storefrontCategories,
      product?.storefront_category_lookup_id,
      product?.storefront_category,
      product?.category
    ) || null;
  const placements = getProductPlacementConfig(product).map((placement) => placement.label);
  const productionMethods = Array.isArray(product?.production_methods) && product.production_methods.length
    ? product.production_methods
    : matchedItem?.default_production_methods?.length
      ? matchedItem.default_production_methods
      : ["Screen Print"];

  return {
    ...emptyProduct,
    ...productFields,
    productMode: resolveProductMode(product, matchedItem),
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
    characteristics: getProductCharacteristics(product),
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
    is_featured: Boolean(product?.is_featured),
    storefront_category_lookup_id:
      (storefrontCategory
        ? buildStorefrontCategorySelectionValue(storefrontCategory)
        : "") || normalizeText(product?.storefront_category_lookup_id) || "",
  };
}

function normalizeStatusValue(value) {
  return String(value || "Active").trim().toLowerCase();
}

function buildProductRenderIdentity(product, index) {
  const normalizedId = normalizeText(product?.id);
  const normalizedName = normalizeText(product?.name) || "unnamed-product";
  const normalizedCategory =
    normalizeText(product?.storefront_category || product?.category) || "uncategorized";
  const fallbackId = `${normalizedName}-${normalizedCategory}-${index}`;

  return {
    id: normalizedId || null,
    key: normalizedId || fallbackId,
    fallbackKeyUsed: !normalizedId,
  };
}

export default function Products() {
  const pageRef = useRef(null);
  const editorRef = useRef(null);
  const removeDialogRef = useRef(null);
  const removeDialogCancelRef = useRef(null);
  const removeDialogConfirmRef = useRef(null);
  const removeDialogTriggerRef = useRef(null);
  const catalogPanelRef = useRef(null);
  const nameInputRef = useRef(null);
  const storefrontCategoryInputRef = useRef(null);
  const brandInputRef = useRef(null);
  const productCardRefs = useRef(new Map());
  const prefilledLocationKeyRef = useRef("");
  const location = useLocation();
  const navigate = useNavigate();
  const products = useStoredProducts();
  const productsReady = areStoredProductsReady();
  const libraryItems = useGarmentLibraryItems();
  const lookups = useCatalogLookups();
  const categories = useMemo(() => lookups.categories || [], [lookups.categories]);
  const storefrontCategories = useMemo(
    () => lookups.storefront_categories || [],
    [lookups.storefront_categories]
  );
  const brands = useMemo(() => lookups.brands || [], [lookups.brands]);
  const sizes = useMemo(() => lookups.sizes || [], [lookups.sizes]);
  const garmentModels = useMemo(() => lookups.garment_models || [], [lookups.garment_models]);
  const [form, setForm] = useState(emptyProduct);
  const [editingProductId, setEditingProductId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedFeaturedState, setSelectedFeaturedState] = useState("all");
  const [selectedStorefrontCategory, setSelectedStorefrontCategory] = useState("all");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedProductMode, setSelectedProductMode] = useState("all");
  const [newStorefrontCategoryName, setNewStorefrontCategoryName] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [categorySaveError, setCategorySaveError] = useState("");
  const [brandSaveError, setBrandSaveError] = useState("");
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isSavingBrand, setIsSavingBrand] = useState(false);
  const [isCreatingStorefrontCategory, setIsCreatingStorefrontCategory] = useState(false);
  const [isCreatingBrand, setIsCreatingBrand] = useState(false);
  const [localStorefrontCategories, setLocalStorefrontCategories] = useState([]);
  const [characteristicValueDrafts, setCharacteristicValueDrafts] = useState({});
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [creationNotice, setCreationNotice] = useState("");
  const [highlightedProductIds, setHighlightedProductIds] = useState([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [productPendingRemoval, setProductPendingRemoval] = useState(null);
  const [isRemovingProduct, setIsRemovingProduct] = useState(false);
  const [isGarmentPickerOpen, setIsGarmentPickerOpen] = useState(false);
  const [featuredToggleProductIds, setFeaturedToggleProductIds] = useState([]);

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
  const isManualProductMode = form.productMode === PRODUCT_MODES.MANUAL;
  const brandSelectOptions = useMemo(
    () =>
      buildCategoryScopedBrandOptions(
        libraryItems,
        brands,
        form.category_lookup_id,
        form.brand_lookup_id
      ),
    [brands, form.brand_lookup_id, form.category_lookup_id, libraryItems]
  );
  const selectedGarmentVariantCount = garmentVariants.length;
  const showVariantSelection = Boolean(selectedGarmentItem) && selectedGarmentVariantCount > 0;
  const showSizeSelection = Boolean(selectedGarmentItem) && garmentSizeOptions.length > 0;
  const isSelectedGarmentOneSize = isOneSizeOnly(garmentSizes);
  const inheritedBrandLabel = isManualProductMode
    ? normalizeText(findLookupById(brands, form.brand_lookup_id)?.name || form.brand_model)
    : normalizeText(garmentBrand?.name || findLookupById(brands, form.brand_lookup_id)?.name || form.brand_model);
  const inheritedCategoryLabel = isManualProductMode
    ? "Manual product"
    : normalizeText(garmentCategory?.name || form.category || "Catalog");
  const placementLibrary = useMemo(
    () => buildPlacementLibrary(products, libraryItems),
    [products, libraryItems]
  );
  const placementOptions = normalizeListInput(form.placementsText);
  const storefrontCategorySource = useMemo(
    () => mergeStorefrontCategorySources(storefrontCategories, localStorefrontCategories),
    [localStorefrontCategories, storefrontCategories]
  );
  const activeStorefrontCategories = useMemo(
    () => buildStorefrontCategoryRegistry(products, storefrontCategorySource),
    [products, storefrontCategorySource]
  );
  const activeStorefrontCategory = useMemo(
    () =>
      findStorefrontCategoryBySelectionValue(
        activeStorefrontCategories,
        form.storefront_category_lookup_id
      ) || null,
    [activeStorefrontCategories, form.storefront_category_lookup_id]
  );
  const resolvedEditorStorefrontCategory = useMemo(
    () =>
      activeStorefrontCategory ||
      resolveStorefrontCategoryOption(
        storefrontCategorySource,
        form.storefront_category_lookup_id,
        editingProduct?.storefront_category,
        editingProduct?.category || form.category
      ) ||
      null,
    [
      activeStorefrontCategory,
      editingProduct?.category,
      editingProduct?.storefront_category,
      form.category,
      form.storefront_category_lookup_id,
      storefrontCategorySource,
    ]
  );
  const storefrontCategoryOptions = useMemo(
    () =>
      mergeStorefrontCategorySources(
        activeStorefrontCategories,
        resolvedEditorStorefrontCategory ? [resolvedEditorStorefrontCategory] : []
      ),
    [activeStorefrontCategories, resolvedEditorStorefrontCategory]
  );
  const activeStorefrontCategoryLabel = resolvedEditorStorefrontCategory?.name || "";
  const brandFilterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((product) => normalizeText(product?.brand_model))
            .filter(Boolean)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return products.filter((product) => {
      const storefrontCategory = resolveStorefrontCategoryAssignment(
        product,
        storefrontCategorySource
      );
      const storefrontCategoryName = normalizeText(storefrontCategory?.name);
      const brandName = normalizeText(product?.brand_model);
      const matchesStorefrontCategory =
        selectedStorefrontCategory === "all" ||
        normalizeText(storefrontCategory?.id) === selectedStorefrontCategory;
      const matchesBrand =
        selectedBrand === "all" || brandName.toLowerCase() === selectedBrand.toLowerCase();
      const matchesProductMode =
        selectedProductMode === "all" ||
        (selectedProductMode === "apparel"
          ? Boolean(product?.garment_library_item_id)
          : !product?.garment_library_item_id);
      const matchesSearch =
        !normalizedSearch ||
        [
          product?.name,
          brandName,
          storefrontCategoryName,
          product?.category,
          product?.notes,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      const matchesStatus =
        selectedStatus === "all" ||
        (selectedStatus === "active"
          ? normalizeStatusValue(product?.status) === "active"
          : normalizeStatusValue(product?.status) !== "active");
      const matchesFeaturedState =
        selectedFeaturedState === "all" ||
        (selectedFeaturedState === "featured"
          ? Boolean(product?.is_featured)
          : !product?.is_featured);
      return (
        matchesSearch &&
        matchesStatus &&
        matchesFeaturedState &&
        matchesStorefrontCategory &&
        matchesBrand &&
        matchesProductMode
      );
    });
  }, [
    products,
    searchTerm,
    selectedStatus,
    selectedFeaturedState,
    selectedStorefrontCategory,
    selectedBrand,
    storefrontCategorySource,
    selectedProductMode,
  ]);

  const activeCount = products.filter((product) => normalizeStatusValue(product?.status) === "active").length;
  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    selectedFeaturedState !== "all" ||
    selectedStorefrontCategory !== "all" ||
    selectedBrand !== "all" ||
    selectedProductMode !== "all" ||
    selectedStatus !== "all";
  const isRemoveDialogOpen = Boolean(productPendingRemoval);
  const storefrontVisibilityLabel =
    normalizeStatusValue(form.status) === "active"
      ? "Visible on storefront"
      : "Hidden from storefront";

  useEffect(() => {
    const duplicateProductIds = products.reduce((summary, product, index) => {
      const normalizedId = normalizeText(product?.id);
      if (!normalizedId) {
        summary.missingIds.push({
          index,
          name: product?.name || "",
          status: product?.status || "",
        });
        return summary;
      }

      if (!summary.seenIds.has(normalizedId)) {
        summary.seenIds.add(normalizedId);
        return summary;
      }

      summary.duplicates.push({
        index,
        id: normalizedId,
        name: product?.name || "",
        status: product?.status || "",
      });
      return summary;
    }, {
      seenIds: new Set(),
      duplicates: [],
      missingIds: [],
    });

    const exclusionDiagnostics = products.reduce(
      (summary, product) => {
        const normalizedStatus = normalizeStatusValue(product?.status);

        if (selectedStatus === "active" && normalizedStatus !== "active") {
          summary.statusFilteredOut.push({
            id: product?.id || null,
            name: product?.name || "",
            status: product?.status || "",
            reason: "status-not-active",
          });
        }

        if (
          searchTerm.trim() &&
          ![product?.name, product?.brand_model, product?.category, product?.notes]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(searchTerm.trim().toLowerCase()))
        ) {
          summary.searchFilteredOut.push({
            id: product?.id || null,
            name: product?.name || "",
            reason: "search-miss",
          });
        }

        return summary;
      },
      {
        statusFilteredOut: [],
        searchFilteredOut: [],
      }
    );

    console.info("[Products] Customer catalog rendering source", {
      productsReady,
      currentProductCountInsideRender: products.length,
      activeProducts: activeCount,
      filteredProducts: filteredProducts.length,
      selectedStatus,
      searchTerm,
      highlightedProductIds,
      products: products.map((product) => ({
        id: product?.id || null,
        name: product?.name || "",
        status: product?.status || "",
        category: product?.category || "",
        garment_library_item_id: product?.garment_library_item_id || null,
        colors: Array.isArray(product?.colors) ? product.colors : [],
        sizes: Array.isArray(product?.sizes) ? product.sizes : [],
      })),
      duplicateProductIds: duplicateProductIds.duplicates,
      missingProductIds: duplicateProductIds.missingIds,
      exclusionDiagnostics,
    });
  }, [activeCount, filteredProducts.length, highlightedProductIds, products, productsReady, searchTerm, selectedStatus]);

  useEffect(() => {
    const renderedCardNodes = Array.from(productCardRefs.current.entries()).map(([key, node]) => ({
      key,
      mounted: Boolean(node),
    }));

    console.info("[Products] Customer catalog rendered card count", {
      rawProductsArrayLength: products.length,
      filteredProductsArrayLength: filteredProducts.length,
      renderedProductCardCount: renderedCardNodes.length,
      renderedProductCards: renderedCardNodes,
      productsBeforeRender: filteredProducts.map((product, index) => {
        const renderIdentity = buildProductRenderIdentity(product, index);
        return {
          index,
          id: product?.id || null,
          name: product?.name || "",
          status: product?.status || "",
          category: product?.category || "",
          renderKey: renderIdentity.key,
          fallbackKeyUsed: renderIdentity.fallbackKeyUsed,
        };
      }),
    });
  }, [filteredProducts, products.length]);

  useEffect(() => {
    if (!isCreatingStorefrontCategory) return;

    window.requestAnimationFrame(() => {
      storefrontCategoryInputRef.current?.focus();
      storefrontCategoryInputRef.current?.select();
    });
  }, [isCreatingStorefrontCategory]);

  useEffect(() => {
    if (!isCreatingBrand) return;

    window.requestAnimationFrame(() => {
      brandInputRef.current?.focus();
      brandInputRef.current?.select();
    });
  }, [isCreatingBrand]);

  useEffect(() => {
    if (!isRemoveDialogOpen) return undefined;

    window.requestAnimationFrame(() => {
      removeDialogCancelRef.current?.focus();
    });

    function handleRemoveDialogKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isRemovingProduct) {
          closeRemoveDialog();
        }
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = [
        removeDialogCancelRef.current,
        removeDialogConfirmRef.current,
      ].filter(Boolean);

      if (!focusableElements.length) return;

      const currentIndex = focusableElements.indexOf(document.activeElement);
      const nextIndex = event.shiftKey
        ? currentIndex <= 0
          ? focusableElements.length - 1
          : currentIndex - 1
        : currentIndex === -1 || currentIndex === focusableElements.length - 1
          ? 0
          : currentIndex + 1;

      event.preventDefault();
      focusableElements[nextIndex]?.focus();
    }

    document.addEventListener("keydown", handleRemoveDialogKeyDown);
    return () => {
      document.removeEventListener("keydown", handleRemoveDialogKeyDown);
    };
  }, [isRemoveDialogOpen, isRemovingProduct]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => {
      const nextForm = { ...current, [name]: value };

      if (name === "category_lookup_id") {
        const selectedCategory = findLookupById(categories, value);
        const nextBrandOptions = buildCategoryScopedBrandOptions(
          libraryItems,
          brands,
          value,
          current.brand_lookup_id
        );
        const brandStillValid = nextBrandOptions.some(
          (option) => option.value === current.brand_lookup_id
        );
        nextForm.category = selectedCategory?.name || "";
        if (!brandStillValid) {
          nextForm.brand_lookup_id = "";
          nextForm.brand_model = "";
        }
      }

      if (name === "brand_lookup_id") {
        const selectedBrand = findLookupById(brands, value);
        nextForm.brand_model = selectedBrand?.name || "";
      }

      return nextForm;
    });
  }

  function handleStorefrontCategorySelect(event) {
    const { value } = event.target;

    if (value === CREATE_STOREFRONT_CATEGORY_VALUE) {
      setIsCreatingStorefrontCategory(true);
      setCategorySaveError("");
      setNewStorefrontCategoryName("");
      return;
    }

    setIsCreatingStorefrontCategory(false);
    setNewStorefrontCategoryName("");
    setCategorySaveError("");
    setForm((current) => {
      return {
        ...current,
        storefront_category_lookup_id: value,
      };
    });
  }

  function handleBrandSelect(event) {
    const { value } = event.target;

    if (value === CREATE_BRAND_VALUE) {
      setIsCreatingBrand(true);
      setBrandSaveError("");
      return;
    }

    setIsCreatingBrand(false);
    setBrandSaveError("");
    setForm((current) => {
      const selectedBrand = findLookupById(brands, value);
      return {
        ...current,
        brand_lookup_id: value,
        brand_model: selectedBrand?.name || "",
      };
    });
  }

  function resetForm() {
    setForm(emptyProduct);
    setCharacteristicValueDrafts({});
    setEditingProductId(null);
    setCreationNotice("");
    setHighlightedProductIds([]);
    setCategorySaveError("");
    setIsCreatingStorefrontCategory(false);
    setNewStorefrontCategoryName("");
    setBrandSaveError("");
    setIsCreatingBrand(false);
    setNewBrandName("");
    setSaveError("");
    setIsEditorOpen(false);
    setProductPendingRemoval(null);
    setIsGarmentPickerOpen(false);
  }

  function focusEditorNameField() {
    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  }

  function openFreshEditor(productMode = PRODUCT_MODES.APPAREL) {
    setForm({
      ...emptyProduct,
      productMode,
      product_type: productMode === PRODUCT_MODES.MANUAL ? "Manual Product" : "",
    });
    setCharacteristicValueDrafts({});
    setEditingProductId(null);
    setCreationNotice("");
    setHighlightedProductIds([]);
    setCategorySaveError("");
    setIsCreatingStorefrontCategory(false);
    setNewStorefrontCategoryName("");
    setBrandSaveError("");
    setIsCreatingBrand(false);
    setNewBrandName("");
    setSaveError("");
    setIsEditorOpen(true);
    setIsGarmentPickerOpen(productMode === PRODUCT_MODES.APPAREL);
    focusEditorNameField();
  }

  function closeEditor() {
    resetForm();
  }

  function openRemoveDialog(product, triggerNode = null) {
    if (!product || isRemovingProduct) return;

    removeDialogTriggerRef.current = triggerNode;
    setSaveError("");
    setProductPendingRemoval(product);
  }

  function closeRemoveDialog() {
    if (isRemovingProduct) return;

    setProductPendingRemoval(null);
    window.requestAnimationFrame(() => {
      removeDialogTriggerRef.current?.focus?.();
    });
  }

  function handleProductModeChange(productMode) {
    setSaveError("");
    setCreationNotice("");
    setHighlightedProductIds([]);
    setCharacteristicValueDrafts({});
    setIsGarmentPickerOpen(productMode === PRODUCT_MODES.APPAREL && !form.selectedGarmentLibraryId);
    setForm((current) => {
      if (productMode === current.productMode) {
        return current;
      }

      if (productMode === PRODUCT_MODES.MANUAL) {
        return {
          ...current,
          productMode,
          selectedGarmentLibraryId: "",
          garmentSearch: "",
          visibleVariants: [],
          sizes: [],
          characteristics: current.characteristics?.length ? current.characteristics : [],
          garment_model_lookup_id: "",
          category_lookup_id: "",
          category: "Manual",
          product_type: current.product_type || "Manual Product",
          brand_lookup_id: current.brand_lookup_id,
          brand_model: current.brand_model,
        };
      }

      return {
        ...current,
        productMode,
        characteristics: [],
        category: current.category === "Manual" ? "" : current.category,
        product_type: current.product_type === "Manual Product" ? "" : current.product_type,
      };
    });
  }

  function handleGarmentSelect(item) {
    setCreationNotice("");
    setHighlightedProductIds([]);

    if (!editingProductId) {
      const nextDraft = buildFormFromGarmentDraft(
        item,
        sizes,
        brands,
        categories,
        garmentModels,
        storefrontCategorySource
      );
      console.info("[Products] created fresh storefront draft from garment template", {
        garmentId: item?.id || null,
        garmentTitle: item?.title || "",
        nextDraft,
      });
      setIsGarmentPickerOpen(false);
      setForm(nextDraft);
      return;
    }

    const garmentModel = findLookupById(garmentModels, item.garment_model_lookup_id);
    const brand = findLookupById(brands, item.brand_lookup_id);
    const supplierCategory = findLookupById(categories, item.category_lookup_id);
    const storefrontCategory =
      resolveStorefrontCategoryOption(
        storefrontCategorySource,
        item?.storefront_category_lookup_id,
        item?.storefront_category,
        supplierCategory?.name || item?.category
      ) || null;
    setForm((current) => ({
      ...current,
      selectedGarmentLibraryId: item.id,
      garmentSearch: buildGarmentLibraryLabel(item, brands, categories, garmentModels),
      image: current.image || item.image || "",
      visibleVariants: getVariantOptions(item).map((variant) => variant.name),
      sizes: sortSizesByLookup(item.sizes || [], sizes),
      characteristics: [],
      category: supplierCategory?.name || current.category || "",
      category_lookup_id: item.category_lookup_id || current.category_lookup_id || "",
      storefront_category_lookup_id:
        (storefrontCategory
          ? buildStorefrontCategorySelectionValue(storefrontCategory)
          : "") || current.storefront_category_lookup_id || "",
      brand_lookup_id: item.brand_lookup_id || current.brand_lookup_id || "",
      garment_model_lookup_id: item.garment_model_lookup_id || current.garment_model_lookup_id || "",
      product_type: resolveStructuredProductType(garmentModel, current.product_type, current.name || item.title),
      brand_model: buildLegacyBrandModelValue(brand, garmentModel, current.brand_model),
    }));
    setIsGarmentPickerOpen(false);
  }

  useEffect(() => {
    const createFromGarmentId = normalizeText(location.state?.createFromGarmentId);
    const storefrontSetup = location.state?.storefrontSetup || {};
    if (!createFromGarmentId || !libraryItems.length) {
      return;
    }

    const locationStateKey = `${location.key}:${createFromGarmentId}`;
    if (prefilledLocationKeyRef.current === locationStateKey) {
      return;
    }

    const matchedGarment = libraryItems.find((item) => item.id === createFromGarmentId);
    if (!matchedGarment) {
      return;
    }

    prefilledLocationKeyRef.current = locationStateKey;
    setEditingProductId(null);
    setSaveError("");
    setSearchTerm("");
    setSelectedStatus("all");
    setCreationNotice(
      normalizeText(location.state?.creationNotice) ||
        `Storefront product draft loaded from garment template ${matchedGarment.title}. Review storefront details and publish when ready.`
    );
    setForm(
      buildFormFromGarmentDraft(
        matchedGarment,
        sizes,
        brands,
        categories,
        garmentModels,
        storefrontCategorySource,
        storefrontSetup
      )
    );
    setIsEditorOpen(true);
    setIsGarmentPickerOpen(false);
    navigate(location.pathname, { replace: true, state: {} });
    focusEditorNameField();
  }, [
    brands,
    categories,
    garmentModels,
    libraryItems,
    location.key,
    location.pathname,
    location.state,
    navigate,
    sizes,
    storefrontCategorySource,
  ]);

  useEffect(() => {
    const highlightProductIds = Array.isArray(location.state?.highlightProductIds)
      ? location.state.highlightProductIds.map((value) => normalizeText(value)).filter(Boolean)
      : [];
    const productsRefreshToken = location.state?.productsRefreshToken;
    const creationNoticeFromLocation = normalizeText(location.state?.creationNotice);
    const highlightedGarmentTitle = normalizeText(location.state?.highlightedGarmentTitle);

    if (!highlightProductIds.length && !productsRefreshToken && !creationNoticeFromLocation) {
      return;
    }

    setEditingProductId(null);
    setHighlightedProductIds(highlightProductIds);
    setSaveError("");
    setSearchTerm("");
    setSelectedStatus("all");
    setCreationNotice(
      creationNoticeFromLocation ||
        (highlightedGarmentTitle
          ? `Storefront products updated for ${highlightedGarmentTitle}.`
          : "Storefront products updated.")
    );
    if (productsRefreshToken) {
      refreshStoredProducts().catch((error) => {
        console.warn("[Products] storefront refresh after navigation failed", error);
      });
    }
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!highlightedProductIds.length) return;

    const highlightedProductIdSet = new Set(highlightedProductIds);
    const firstVisibleHighlightedProduct = filteredProducts.find((product) =>
      highlightedProductIdSet.has(normalizeText(product?.id))
    );
    const focusedCard = firstVisibleHighlightedProduct
      ? productCardRefs.current.get(firstVisibleHighlightedProduct.id)
      : null;

    window.requestAnimationFrame(() => {
      if (focusedCard) {
        focusedCard.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      catalogPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [filteredProducts, highlightedProductIds]);

  function handleGarmentSearchChange(event) {
    const nextValue = event.target.value;
    setHighlightedProductIds([]);
    setIsGarmentPickerOpen(true);
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

  function addCharacteristic() {
    setForm((current) => ({
      ...current,
      characteristics: [...(Array.isArray(current.characteristics) ? current.characteristics : []), createEmptyCharacteristic()],
    }));
  }

  function updateCharacteristicName(index, value) {
    setForm((current) => ({
      ...current,
      characteristics: (current.characteristics || []).map((characteristic, characteristicIndex) =>
        characteristicIndex === index
          ? {
              ...characteristic,
              name: value,
            }
          : characteristic
      ),
    }));
  }

  function removeCharacteristic(index) {
    setForm((current) => ({
      ...current,
      characteristics: (current.characteristics || []).filter(
        (_, characteristicIndex) => characteristicIndex !== index
      ),
    }));
    setCharacteristicValueDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[getCharacteristicValueInputKey(index)];
      return nextDrafts;
    });
  }

  function updateCharacteristicValueDraft(index, value) {
    setCharacteristicValueDrafts((current) => ({
      ...current,
      [getCharacteristicValueInputKey(index)]: value,
    }));
  }

  function addCharacteristicValue(index, rawValue) {
    const normalizedValue = normalizeText(rawValue);
    if (!normalizedValue) return;

    setForm((current) => ({
      ...current,
      characteristics: (current.characteristics || []).map((characteristic, characteristicIndex) =>
        characteristicIndex === index
          ? {
              ...characteristic,
              values: uniqueList([...(characteristic.values || []), normalizedValue]),
            }
          : characteristic
      ),
    }));
    updateCharacteristicValueDraft(index, "");
  }

  function removeCharacteristicValue(index, value) {
    setForm((current) => ({
      ...current,
      characteristics: (current.characteristics || []).map((characteristic, characteristicIndex) =>
        characteristicIndex === index
          ? {
              ...characteristic,
              values: (characteristic.values || []).filter(
                (existingValue) => normalizeTextKey(existingValue) !== normalizeTextKey(value)
              ),
            }
          : characteristic
      ),
    }));
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
    setIsEditorOpen(true);
    setIsGarmentPickerOpen(!product?.garment_library_item_id);
    setCharacteristicValueDrafts({});
    setForm(
      buildFormFromProduct(
        product,
        libraryItems,
        sizes,
        brands,
        categories,
        garmentModels,
        storefrontCategorySource
      )
    );
    focusEditorNameField();
  }

  async function handleToggleFeatured(product) {
    const productId = product?.id || null;
    if (!productId) return;

    const nextFeaturedState = !Boolean(product?.is_featured);
    setSaveError("");
    setFeaturedToggleProductIds((current) =>
      current.includes(productId) ? current : [...current, productId]
    );

    if (editingProductId === productId) {
      setForm((current) => ({
        ...current,
        is_featured: nextFeaturedState,
      }));
    }

    try {
      await updateStoredProduct(productId, {
        is_featured: nextFeaturedState,
      });
    } catch (error) {
      console.error("Unable to update featured state", error);
      if (editingProductId === productId) {
        setForm((current) => ({
          ...current,
          is_featured: Boolean(product?.is_featured),
        }));
      }
      setSaveError("Unable to update featured state right now. Please try again.");
    } finally {
      setFeaturedToggleProductIds((current) =>
        current.filter((currentProductId) => currentProductId !== productId)
      );
    }
  }

  async function handleCreateStorefrontCategory() {
    const nextName = normalizeText(newStorefrontCategoryName);
    if (!nextName) return;

    const existingCategory = storefrontCategorySource.find(
      (category) => normalizeText(category?.name).toLowerCase() === nextName.toLowerCase()
    );

    if (existingCategory) {
      setForm((current) => ({
        ...current,
        storefront_category_lookup_id: buildStorefrontCategorySelectionValue(existingCategory),
      }));
      setNewStorefrontCategoryName("");
      setIsCreatingStorefrontCategory(false);
      setCategorySaveError("");
      return;
    }

    try {
      setIsSavingCategory(true);
      setCategorySaveError("");
      const createdCategory = await createCatalogLookup("storefront_categories", {
        name: nextName,
        active: true,
      });
      setLocalStorefrontCategories((current) =>
        mergeStorefrontCategorySources(current, [createdCategory])
      );
      setNewStorefrontCategoryName("");
      setIsCreatingStorefrontCategory(false);
      setForm((current) => ({
        ...current,
        storefront_category_lookup_id: buildStorefrontCategorySelectionValue(createdCategory),
      }));
    } catch (error) {
      console.error("Unable to create storefront category", error);
      setCategorySaveError("Unable to create storefront category right now.");
    } finally {
      setIsSavingCategory(false);
    }
  }

  async function handleCreateBrand() {
    const nextName = normalizeText(newBrandName);
    if (!nextName) return;

    try {
      setIsSavingBrand(true);
      setBrandSaveError("");
      const createdBrand = await createCatalogLookup("brands", {
        name: nextName,
        active: true,
      });
      setNewBrandName("");
      setIsCreatingBrand(false);
      setForm((current) => ({
        ...current,
        brand_lookup_id: createdBrand.id,
        brand_model: createdBrand.name,
      }));
    } catch (error) {
      console.error("Unable to create brand", error);
      setBrandSaveError("Unable to create brand right now.");
    } finally {
      setIsSavingBrand(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError("");

    if (!editingProductId && !isManualProductMode && !selectedGarmentItem) {
      setSaveError("Choose a garment from the Garment Library before creating a storefront product.");
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
    const storefrontCategory = findStorefrontCategoryBySelectionValue(
      activeStorefrontCategories,
      form.storefront_category_lookup_id
    ) ||
      resolveStorefrontCategoryOption(
        storefrontCategorySource,
        form.storefront_category_lookup_id,
        editingProduct?.storefront_category,
        editingProduct?.category || form.category
      );
    const flatPrice = Number(form.flat_price || 0);
    const selectedSizes =
      !isManualProductMode && selectedGarmentItem && isOneSizeOnly(selectedGarmentItem.sizes || [])
        ? sortSizesByLookup(selectedGarmentItem.sizes || [], sizes)
        : isManualProductMode
          ? []
          : sortSizesByLookup(form.sizes, sizes);
    const resolvedProductType = isManualProductMode
      ? "Manual Product"
      : resolveStructuredProductType(garmentModel, form.product_type, form.name);
    const resolvedSupplierCategoryName = isManualProductMode
      ? "Manual"
      : category?.name || form.category || "Catalog";
    const resolvedStorefrontCategoryName = storefrontCategory?.name || "";

    const productPayload = {
      name: normalizeText(form.name),
      garment_library_item_id: isManualProductMode
        ? null
        : selectedGarmentItem?.id || form.selectedGarmentLibraryId || null,
      category: resolvedSupplierCategoryName,
      storefront_category: resolvedStorefrontCategoryName || null,
      category_lookup_id: isManualProductMode ? null : category?.id || form.category_lookup_id || null,
      storefront_category_lookup_id: storefrontCategory?.lookupId || null,
      product_type: resolvedProductType,
      brand_model: isManualProductMode
        ? buildLegacyBrandModelValue(brand, null, form.brand_model)
        : buildLegacyBrandModelValue(brand, garmentModel, form.brand_model),
      brand_lookup_id: brand?.id || form.brand_lookup_id || null,
      garment_model_lookup_id: isManualProductMode
        ? null
        : garmentModel?.id || form.garment_model_lookup_id || null,
      image: form.image,
      status: form.status,
      is_featured: Boolean(form.is_featured),
      characteristics: isManualProductMode ? getProductCharacteristics(form) : [],
      colors: isManualProductMode ? [] : uniqueList(form.visibleVariants),
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
      compare_at_price: null,
      unit_price: flatPrice,
      notes: form.notes,
    };
    console.info("[Products] Publish storefront product submit", {
      editingProductId,
      productPayload,
      currentProductCountBeforeSubmit: products.length,
      currentProductsBeforeSubmit: products.map((product) => ({
        id: product?.id || null,
        name: product?.name || "",
        status: product?.status || "",
      })),
    });

    try {
      setIsSaving(true);

      if (editingProductId) {
        const updatedProduct = await updateStoredProduct(editingProductId, productPayload);
        console.info("[Products] updateStoredProduct resolved", {
          editingProductId,
          updatedProduct,
          currentProductCountAfterSubmit: products.length,
        });
      } else {
        const createdProduct = await createStoredProduct(productPayload);
        console.info("[Products] createStoredProduct resolved", {
          createdProduct,
          currentProductCountAfterSubmit: products.length,
          createdProductPresentInCurrentProductsArray: products.some(
            (product) => product?.id && product.id === createdProduct?.id
          ),
        });
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
      if (!productId) return;

      setIsRemovingProduct(true);
      await deleteStoredProduct(productId);
      if (editingProductId === productId) {
        resetForm();
      } else {
        setProductPendingRemoval(null);
      }
    } catch (error) {
      console.error("Unable to delete product", error);
      setSaveError("Unable to delete this product right now. Please try again.");
    } finally {
      setIsRemovingProduct(false);
      window.requestAnimationFrame(() => {
        removeDialogTriggerRef.current?.focus?.();
      });
    }
  }

  return (
    <div ref={pageRef} className="products-page">
      <section className="products-page-hero">
        <div className="products-page-hero-copy">
          <p className="products-eyebrow">Customer Product Catalog</p>
          <h1 style={{ margin: 0 }}>Storefront Product Catalog</h1>
          <p style={{ margin: 0, color: "#64748b" }}>
            Browse and manage published storefront products here. Garment creation starts in the
            Garment Library, while manual items stay lightweight.
          </p>
        </div>

        <div className="products-page-hero-actions">
          <button
            type="button"
            className="products-primary-button"
            onClick={() => openFreshEditor(PRODUCT_MODES.APPAREL)}
          >
            New Storefront Product
          </button>
          <button
            type="button"
            className="products-secondary-button"
            onClick={() => openFreshEditor(PRODUCT_MODES.MANUAL)}
          >
            Quick Manual Product
          </button>
          <Link className="products-inline-action-link" to="/admin/garments">
            Open Garment Library
          </Link>
        </div>
      </section>

      <div className="products-workspace products-workspace-catalog-only">
        <section ref={catalogPanelRef} className="products-catalog-panel">
          <div className="products-catalog-header">
            <div>
              <p className="products-eyebrow">Live Catalog</p>
              <h2 style={{ margin: "6px 0 0" }}>Customer-facing products</h2>
              <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                Browse storefront inventory, filter it quickly, and open products for editing when needed.
              </p>
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
              <div className="products-stat-card">
                <span>Categories</span>
                <strong>{activeStorefrontCategories.length}</strong>
              </div>
            </div>
          </div>

          {creationNotice ? <div className="products-callout">{creationNotice}</div> : null}
          {saveError && !isEditorOpen ? <div className="products-error-banner">{saveError}</div> : null}

          <div className="products-catalog-controls">
            <div className="products-catalog-search-row">
              <label className="products-toolbar-field">
                <span>Search Products</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search product, category, or brand"
                  style={fieldStyle}
                />
              </label>

              <div className="products-catalog-action-row">
                <button
                  type="button"
                  className="products-primary-button"
                  onClick={() => openFreshEditor(PRODUCT_MODES.APPAREL)}
                >
                  New Product
                </button>
                <button
                  type="button"
                  className="products-secondary-button"
                  onClick={() => openFreshEditor(PRODUCT_MODES.MANUAL)}
                >
                  Manual Product
                </button>
              </div>
            </div>

            <details className="products-filter-panel" open={hasActiveFilters}>
              <summary className="products-filter-summary">
                <strong>Filters</strong>
                <span>
                  {hasActiveFilters
                    ? "Refine the visible catalog list."
                    : "Open filters for category, featured state, brand, mode, and status."}
                </span>
              </summary>

              <div className="products-toolbar">
                <label className="products-toolbar-field">
                  <span>Merchandising</span>
                  <select
                    value={selectedFeaturedState}
                    onChange={(event) => setSelectedFeaturedState(event.target.value)}
                    style={fieldStyle}
                  >
                    <option value="all">All Products</option>
                    <option value="featured">Featured Only</option>
                    <option value="non-featured">Non-Featured</option>
                  </select>
                </label>

                <label className="products-toolbar-field">
                  <span>Storefront Category</span>
                  <select
                    value={selectedStorefrontCategory}
                    onChange={(event) => setSelectedStorefrontCategory(event.target.value)}
                    style={fieldStyle}
                  >
                    <option value="all">All categories</option>
                    {activeStorefrontCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="products-toolbar-field">
                  <span>Brand</span>
                  <select
                    value={selectedBrand}
                    onChange={(event) => setSelectedBrand(event.target.value)}
                    style={fieldStyle}
                  >
                    <option value="all">All brands</option>
                    {brandFilterOptions.map((brand) => (
                      <option key={brand} value={brand}>
                        {brand}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="products-toolbar-field">
                  <span>Mode</span>
                  <select
                    value={selectedProductMode}
                    onChange={(event) => setSelectedProductMode(event.target.value)}
                    style={fieldStyle}
                  >
                    <option value="all">All products</option>
                    <option value="apparel">Garment-linked</option>
                    <option value="manual">Manual products</option>
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
                    <option value="archived">Inactive</option>
                  </select>
                </label>
              </div>
            </details>
          </div>

          <div className="products-results-meta">
            <span>
              Showing <strong>{filteredProducts.length}</strong> of <strong>{products.length}</strong> products
            </span>
            {hasActiveFilters ? (
              <button
                type="button"
                className="products-clear-filters"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedFeaturedState("all");
                  setSelectedStorefrontCategory("all");
                  setSelectedBrand("all");
                  setSelectedProductMode("all");
                  setSelectedStatus("all");
                }}
              >
                Clear Filters
              </button>
            ) : null}
            {highlightedProductIds.length ? <span>Newest storefront product highlighted below.</span> : null}
          </div>

          <div className="products-list-scroll">
            <div className="products-list-grid">
              {filteredProducts.length ? (
                filteredProducts.map((product, index) => {
                  const linkedGarment = findLinkedGarmentLibraryItem(product, libraryItems);
                  const storefrontCategory = resolveStorefrontCategoryAssignment(
                    product,
                    storefrontCategorySource
                  );
                  const renderIdentity = buildProductRenderIdentity(product, index);
                  const isActiveCard =
                    product.id === editingProductId || highlightedProductIds.includes(product.id);
                  const statusIsActive = normalizeStatusValue(product?.status) === "active";
                  const colorCount = Array.isArray(product?.colors) ? product.colors.length : 0;
                  const sizeCount = Array.isArray(product?.sizes) ? product.sizes.length : 0;
                  const characteristicSummary = summarizeCharacteristics(
                    getProductCharacteristics(product)
                  );
                  const categoryLabel = normalizeText(storefrontCategory?.name) || "Uncategorized";
                  const variantSummaryParts = [];

                  if (!product?.garment_library_item_id && characteristicSummary.length) {
                    variantSummaryParts.push(
                      `${characteristicSummary.length} characteristic${
                        characteristicSummary.length === 1 ? "" : "s"
                      }`
                    );
                  }

                  if (product?.garment_library_item_id && colorCount) {
                    variantSummaryParts.push(`${colorCount} color${colorCount === 1 ? "" : "s"}`);
                  }

                  if (product?.garment_library_item_id && sizeCount) {
                    variantSummaryParts.push(`${sizeCount} size${sizeCount === 1 ? "" : "s"}`);
                  }

                  const variantSummary = variantSummaryParts.length
                    ? variantSummaryParts.join(" · ")
                    : product?.garment_library_item_id
                      ? "Variants inherited from garment template"
                      : "Single configuration";
                  const isFeaturedTogglePending = featuredToggleProductIds.includes(product.id);

                  console.info("[Products] Rendering customer catalog product card", {
                    index,
                    id: product?.id || null,
                    name: product?.name || "",
                    status: product?.status || "",
                    category: categoryLabel,
                    renderKey: renderIdentity.key,
                    fallbackKeyUsed: renderIdentity.fallbackKeyUsed,
                    linkedGarmentTitle: linkedGarment?.title || "",
                  });

                  return (
                    <article
                      key={renderIdentity.key}
                      ref={(node) => {
                        if (node) {
                          productCardRefs.current.set(renderIdentity.key, node);
                        } else {
                          productCardRefs.current.delete(renderIdentity.key);
                        }
                      }}
                      className={`products-card ${isActiveCard ? "is-active" : ""}`}
                    >
                      <div className="products-card-media">
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="products-card-image" />
                        ) : (
                          <NoImagePlaceholder className="products-card-image-placeholder" />
                        )}
                      </div>

                      <div className="products-card-body">
                        <div className="products-card-topline">
                          <div className="products-card-meta-group">
                            <span className="products-card-category-pill">
                              {categoryLabel}
                            </span>
                            <button
                              type="button"
                              className={`products-card-featured-toggle ${
                                product?.is_featured ? "is-featured" : ""
                              }`}
                              onClick={() => handleToggleFeatured(product)}
                              aria-pressed={Boolean(product?.is_featured)}
                              aria-label={
                                product?.is_featured
                                  ? `Remove ${product?.name || "product"} from featured`
                                  : `Feature ${product?.name || "product"}`
                              }
                              aria-busy={isFeaturedTogglePending}
                              disabled={isFeaturedTogglePending}
                            >
                              <span aria-hidden="true">
                                {product?.is_featured ? "★" : "☆"}
                              </span>
                              <span>
                                {product?.is_featured ? "Featured" : "Feature"}
                              </span>
                            </button>
                            {!statusIsActive ? (
                              <span className="products-card-meta-pill">Hidden</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="products-card-title-block">
                          <div className="products-card-title-row">
                            <h3 className="products-card-title">
                              {product.name || product.product_type || "Catalog Product"}
                            </h3>
                            {isActiveCard ? (
                              <span className="products-card-editing-pill">
                                {product.id === editingProductId ? "Editing" : "Updated"}
                              </span>
                            ) : null}
                          </div>
                          <strong className="products-card-price">
                            {formatMoney(product?.base_garment_price)}
                          </strong>
                          <p className="products-card-subtitle">
                            {variantSummary}
                          </p>
                          {!product?.garment_library_item_id && characteristicSummary.length ? (
                            <div className="products-card-characteristics">
                              {characteristicSummary.map((summary) => (
                                <span key={summary} className="products-card-characteristic-pill">
                                  {summary}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {product?.notes ? (
                            <p className="products-card-description">{product.notes}</p>
                          ) : null}
                        </div>

                        {linkedGarment?.title ? (
                          <div className="products-card-meta-row">
                            <span className="products-card-meta-pill">
                              Template: {linkedGarment.title}
                            </span>
                          </div>
                        ) : null}
                      </div>

                      <div className="products-card-actions">
                        <button type="button" onClick={() => handleEdit(product)} className="products-card-button">
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(event) => openRemoveDialog(product, event.currentTarget)}
                          className="products-card-button products-card-button-danger"
                        >
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
                    Create your first storefront product from the garment library, or use the manual form if needed.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {isEditorOpen ? (
        <div
          className="products-editor-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeEditor();
            }
          }}
        >
          <form
            ref={editorRef}
            onSubmit={handleSubmit}
            className={`products-editor products-editor-sheet ${editingProduct ? "is-editing" : ""}`}
          >
            <div className="products-editor-intro">
              <p className="products-eyebrow">Storefront Composer</p>
              <h2 style={{ margin: 0 }}>
                {editingProduct ? `Edit ${editingProduct.name}` : "Storefront Product"}
              </h2>
              <p style={{ margin: 0, color: "#64748b" }}>
                {editingProduct
                  ? "Update what shoppers see here without leaving the catalog."
                  : "Keep setup focused on the essentials first. Open extra controls only when you need them."}
              </p>
              <div className="products-editor-topbar">
                <button
                  type="button"
                  className="products-secondary-button"
                  onClick={() => catalogPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  View Catalog
                </button>
                <button type="button" onClick={closeEditor} className="products-secondary-button">
                  Close
                </button>
              </div>
              <div className="products-editor-utility-row">
                <span>Start from a <Link to="/admin/garments">Garment Library</Link> template when you want reusable product setup.</span>
                <span>Manual products still work here too.</span>
              </div>
            </div>

            {saveError ? <div className="products-error-banner">{saveError}</div> : null}
            {creationNotice ? <div className="products-callout">{creationNotice}</div> : null}

            <section className="products-editor-section">
              <div className="products-section-header">
                <div>
                  <p className="products-section-step">Storefront</p>
                  <h2>Product Header</h2>
                </div>
                <p>Focus on what shoppers see first: image, name, category, price, and visibility.</p>
              </div>

              <div className="products-storefront-header">
                <ProductImageUploader
                  image={form.image}
                  onImageChange={(image) => setForm((current) => ({ ...current, image }))}
                />

                <div className="products-storefront-header-main">
                  <div className="products-storefront-header-topline">
                    <span className="products-summary-label">
                      {isManualProductMode ? "Manual product" : "Template-backed product"}
                    </span>
                    <div className="products-storefront-status-group">
                      <div className="products-segmented-toggle" role="group" aria-label="Storefront status">
                        <button
                          type="button"
                          className={`products-segmented-toggle-button ${
                            normalizeStatusValue(form.status) === "active" ? "is-active" : ""
                          }`}
                          onClick={() => setForm((current) => ({ ...current, status: "Active" }))}
                        >
                          Active
                        </button>
                        <button
                          type="button"
                          className={`products-segmented-toggle-button ${
                            normalizeStatusValue(form.status) !== "active" ? "is-active" : ""
                          }`}
                          onClick={() => setForm((current) => ({ ...current, status: "Inactive" }))}
                        >
                          Inactive
                        </button>
                      </div>
                      <span
                        className={`products-status products-status-${
                          normalizeStatusValue(form.status) === "active" ? "active" : "archived"
                        }`}
                      >
                        {storefrontVisibilityLabel}
                      </span>
                    </div>
                  </div>

                  <div className="products-title-price-grid">
                    <label style={labelStyle} className="products-header-name-field">
                      Product Name
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

                    <label style={labelStyle} className="products-header-price-field">
                      Price
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

                  <div className="products-editor-grid">
                    <div
                      className={`products-inline-field-stack ${
                        isManualProductMode ? "" : "products-inline-field-stack-wide"
                      }`}
                    >
                      <button
                        type="button"
                        className={`products-storefront-feature-toggle ${
                          form.is_featured ? "is-active" : ""
                        }`}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            is_featured: !current.is_featured,
                          }))
                        }
                        aria-pressed={form.is_featured}
                      >
                        <span className="products-storefront-feature-toggle-copy">
                          <strong>★ Featured Product</strong>
                          <span>
                            Manually place this item into curated storefront highlights. This stays fully manual.
                          </span>
                        </span>
                        <span className="products-storefront-feature-toggle-state">
                          {form.is_featured ? "ON" : "OFF"}
                        </span>
                      </button>

                      <label style={labelStyle}>
                        Storefront Category
                        <select
                          name="storefront_category_lookup_id"
                          value={form.storefront_category_lookup_id}
                          onChange={handleStorefrontCategorySelect}
                          style={fieldStyle}
                        >
                          <option value="">Uncategorized for now</option>
                          {storefrontCategoryOptions.map((category) => (
                            <option
                              key={category.lookupId || category.id}
                              value={buildStorefrontCategorySelectionValue(category)}
                            >
                              {category.name}
                            </option>
                          ))}
                          <option value={CREATE_STOREFRONT_CATEGORY_VALUE}>+ Create New Category</option>
                        </select>
                      </label>

                      {isCreatingStorefrontCategory ? (
                        <div className="products-inline-create-panel">
                          <input
                            ref={storefrontCategoryInputRef}
                            value={newStorefrontCategoryName}
                            onChange={(event) => setNewStorefrontCategoryName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                handleCreateStorefrontCategory();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                setIsCreatingStorefrontCategory(false);
                                setNewStorefrontCategoryName("");
                                setCategorySaveError("");
                              }
                            }}
                            placeholder="Create a storefront category"
                            style={fieldStyle}
                            className="products-inline-create-input"
                            aria-label="New storefront category"
                          />
                          <button
                            type="button"
                            className="products-inline-save"
                            onClick={handleCreateStorefrontCategory}
                            disabled={isSavingCategory || !normalizeText(newStorefrontCategoryName)}
                          >
                            {isSavingCategory ? "Creating..." : "Add"}
                          </button>
                          <button
                            type="button"
                            className="products-inline-cancel"
                            onClick={() => {
                              setIsCreatingStorefrontCategory(false);
                              setNewStorefrontCategoryName("");
                              setCategorySaveError("");
                            }}
                            disabled={isSavingCategory}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}

                      <div className="products-field-footer">
                        <span>
                          {activeStorefrontCategoryLabel
                            ? `Selected: ${activeStorefrontCategoryLabel}`
                            : "Choose a storefront category to group this product in the shop."}
                        </span>
                      </div>

                      {categorySaveError ? <div className="products-error-banner">{categorySaveError}</div> : null}
                    </div>

                    {isManualProductMode ? (
                      <div className="products-inline-field-stack">
                        <label style={labelStyle}>
                          Brand
                          <select
                            name="brand_lookup_id"
                            value={form.brand_lookup_id}
                            onChange={handleBrandSelect}
                            style={fieldStyle}
                          >
                            <option value="">No brand</option>
                            {brandSelectOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                            <option value={CREATE_BRAND_VALUE}>+ Create New Brand</option>
                          </select>
                        </label>

                        {isCreatingBrand ? (
                          <div className="products-inline-create-panel">
                            <input
                              ref={brandInputRef}
                              value={newBrandName}
                              onChange={(event) => setNewBrandName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  handleCreateBrand();
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  setIsCreatingBrand(false);
                                  setNewBrandName("");
                                  setBrandSaveError("");
                                }
                              }}
                              placeholder="Create a brand"
                              style={fieldStyle}
                              className="products-inline-create-input"
                              aria-label="New brand"
                            />
                            <button
                              type="button"
                              className="products-inline-save"
                              onClick={handleCreateBrand}
                              disabled={isSavingBrand || !normalizeText(newBrandName)}
                            >
                              {isSavingBrand ? "Creating..." : "Add"}
                            </button>
                            <button
                              type="button"
                              className="products-inline-cancel"
                              onClick={() => {
                                setIsCreatingBrand(false);
                                setNewBrandName("");
                                setBrandSaveError("");
                              }}
                              disabled={isSavingBrand}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : null}

                        {brandSaveError ? <div className="products-error-banner">{brandSaveError}</div> : null}
                      </div>
                    ) : null}
                  </div>

                  {!isManualProductMode ? (
                    <div className="products-inherited-strip">
                      <div className="products-inherited-strip-copy">
                        <span className="products-summary-label">Garment Template</span>
                        <strong>
                          {selectedGarmentItem?.title || "Choose the garment behind this storefront product"}
                        </strong>
                        <div className="products-summary-details">
                          <span>{inheritedBrandLabel || "No brand"}</span>
                          <span>{inheritedCategoryLabel}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="products-inline-action"
                        onClick={() => setIsGarmentPickerOpen((current) => !current)}
                      >
                        {selectedGarmentItem ? "Change Template" : "Choose Template"}
                      </button>
                    </div>
                  ) : null}

                  {!isManualProductMode && (isGarmentPickerOpen || !selectedGarmentItem) ? (
                    <SearchableLookupField
                      label="Garment Template"
                      value={form.garmentSearch}
                      onChange={handleGarmentSearchChange}
                      onSelect={handleGarmentSelect}
                      options={libraryItems.filter((item) => item.active !== false)}
                      placeholder="Search garment library"
                      helperText="The template fills in brand, category, colors, sizes, and production defaults."
                      action={
                        <Link className="products-inline-action-link" to="/admin/garments">
                          Open Garment Library
                        </Link>
                      }
                      renderOptionLabel={(item) =>
                        buildGarmentLibraryLabel(item, brands, categories, garmentModels)
                      }
                      renderOptionMeta={(item) => {
                        const variantCount = (item?.variants || []).filter(
                          (variant) => variant.active !== false
                        ).length;
                        return `${variantCount} variants • ${(item?.sizes || []).length} sizes`;
                      }}
                      emptyState="No garments found. Add one in Garment Library first."
                    />
                  ) : null}
                </div>
              </div>

              <div className="garment-model-workflow-panel">
                <div className="garment-model-workflow-header">
                  <strong>Creation Flow</strong>
                  <p>Choose whether this item stays linked to a garment template.</p>
                </div>
                <div className="garment-model-workflow-options">
                  <button
                    type="button"
                    className={`garment-model-workflow-option ${
                      !isManualProductMode ? "is-active" : ""
                    }`}
                    onClick={() => handleProductModeChange(PRODUCT_MODES.APPAREL)}
                  >
                    <span className="garment-model-workflow-radio" aria-hidden="true" />
                    <div>
                      <strong>Apparel Product</strong>
                      <p>Uses a garment template, imported variants, sizes, and production defaults.</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`garment-model-workflow-option ${
                      isManualProductMode ? "is-active" : ""
                    }`}
                    onClick={() => handleProductModeChange(PRODUCT_MODES.MANUAL)}
                  >
                    <span className="garment-model-workflow-radio" aria-hidden="true" />
                    <div>
                      <strong>Manual Product</strong>
                      <p>Creates a standalone storefront item for mugs, tumblers, stickers, bundles, and more.</p>
                    </div>
                  </button>
                </div>
              </div>

            </section>

          {!isManualProductMode && selectedGarmentItem ? (
            <section className="products-editor-section">
              <div className="products-section-header">
                <div>
                  <p className="products-section-step">Variants</p>
                  <h2>Available Options</h2>
                </div>
                <p>Use this as the single source of truth for the colors and sizes customers can buy.</p>
              </div>
              <div className="products-library-grid products-library-grid-wide">
                {showVariantSelection ? (
                  <MultiSelectLookupField
                    label="Colors"
                    helperText={`${form.visibleVariants.length || 0} of ${selectedGarmentVariantCount} template colorways enabled.`}
                    options={garmentVariants}
                    selectedValues={form.visibleVariants}
                    onToggle={toggleVariant}
                    createHelper="No garment variants available."
                    searchPlaceholder="Search variants or supplier SKU"
                  />
                ) : null}

                {showSizeSelection ? (
                  isSelectedGarmentOneSize ? (
                    <div className="products-derived-field">
                      <span>Sizes</span>
                      <strong>One size available</strong>
                      <p>This product inherits its single size directly from the garment template.</p>
                    </div>
                  ) : (
                    <MultiSelectLookupField
                      label="Sizes"
                      helperText={`${form.sizes.length || 0} of ${garmentSizes.length || 0} garment sizes enabled.`}
                      options={garmentSizeOptions}
                      selectedValues={form.sizes}
                      onToggle={toggleSize}
                      createHelper="No garment sizes available."
                    />
                  )
                ) : null}
              </div>
            </section>
          ) : null}

          {isManualProductMode ? (
            <section className="products-editor-section">
              <div className="products-section-header">
                <div>
                  <p className="products-section-step">Options</p>
                  <h2>Characteristics</h2>
                </div>
                <p>Add shopper-friendly choices like flavor, scent, finish, size, or capacity only when this product needs them.</p>
              </div>

              <div className="products-characteristics-panel">
                {form.characteristics.length ? (
                  form.characteristics.map((characteristic, index) => {
                    const draftKey = getCharacteristicValueInputKey(index);
                    const draftValue = characteristicValueDrafts[draftKey] || "";

                    return (
                      <div key={draftKey} className="products-characteristic-card">
                        <div className="products-characteristic-header">
                          <label style={labelStyle} className="products-characteristic-name-field">
                            Characteristic Name
                            <input
                              value={characteristic.name}
                              onChange={(event) => updateCharacteristicName(index, event.target.value)}
                              placeholder="Flavor"
                              style={fieldStyle}
                            />
                          </label>
                          <button
                            type="button"
                            className="products-inline-action"
                            onClick={() => removeCharacteristic(index)}
                          >
                            Remove
                          </button>
                        </div>

                        <div className="products-characteristic-values">
                          {(characteristic.values || []).length ? (
                            <div className="products-characteristic-chip-row">
                              {characteristic.values.map((value) => (
                                <button
                                  key={`${draftKey}-${value}`}
                                  type="button"
                                  className="products-characteristic-chip"
                                  onClick={() => removeCharacteristicValue(index, value)}
                                  title={`Remove ${value}`}
                                >
                                  <span>{value}</span>
                                  <strong aria-hidden="true">×</strong>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="products-field-hint">
                              No values yet. Add tags below for the choices shoppers can pick from.
                            </p>
                          )}

                          <div className="products-characteristic-input-row">
                            <input
                              value={draftValue}
                              onChange={(event) => updateCharacteristicValueDraft(index, event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === ",") {
                                  event.preventDefault();
                                  addCharacteristicValue(index, draftValue);
                                }
                              }}
                              placeholder="Add a value like Orange or 32 oz"
                              style={fieldStyle}
                            />
                            <button
                              type="button"
                              className="products-inline-save"
                              onClick={() => addCharacteristicValue(index, draftValue)}
                              disabled={!normalizeText(draftValue)}
                            >
                              Add Value
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="products-characteristics-empty-state">
                    <strong>No characteristics added</strong>
                    <p>This manual product can stay simple, or you can add shopper choices like scent, finish, flavor, or bottle size.</p>
                  </div>
                )}

                <div className="products-characteristics-footer">
                  <button
                    type="button"
                    className="products-secondary-button"
                    onClick={addCharacteristic}
                  >
                    Add Characteristic
                  </button>
                  <span>Optional. Manual products can have zero, one, or many characteristics.</span>
                </div>
              </div>
            </section>
          ) : null}

          <section className="products-editor-section">
            <div className="products-section-header">
              <div>
                <p className="products-section-step">Description</p>
                <h2>Storefront Copy</h2>
              </div>
              <p>Keep the customer-facing description short, useful, and product-focused.</p>
            </div>

            <div className="products-config-grid">
              <div className="products-config-sidebar">
                <label style={labelStyle}>
                  Storefront Description
                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={updateField}
                    rows={5}
                    placeholder="Describe the fit, finish, feel, or why this product belongs in the storefront."
                    style={{ ...fieldStyle, resize: "vertical", minHeight: "132px" }}
                  />
                </label>
              </div>
            </div>
          </section>

          <details className="products-editor-section products-advanced-section">
            <summary className="products-advanced-summary">
              <div>
                <strong>Advanced Settings</strong>
                <span>Placements, production methods, and pricing rules.</span>
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

          <section className="products-editor-section products-completion-panel">
            <div className="products-section-header">
              <div>
                <p className="products-section-step">Publish</p>
                <h2>{editingProduct ? "Update Storefront Product" : "Create Storefront Product"}</h2>
              </div>
              <p>Review the essentials, then publish.</p>
            </div>

            <div className="products-completion-row">
              <div className="products-completion-copy">
                <strong>{form.name || "Customer product name pending"}</strong>
                <p>
                  Customer price: {form.flat_price ? formatMoney(form.flat_price) : "not set"}.
                  {activeStorefrontCategoryLabel
                    ? ` Storefront category: ${activeStorefrontCategoryLabel}.`
                    : " Storefront category: uncategorized for now."}
                  {isManualProductMode
                    ? " Manual product mode does not require a garment template."
                    : ` Garment link: ${selectedGarmentItem?.title || "required before create"}.`}
                </p>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="products-primary-button products-primary-button-large"
              >
                {isSaving
                  ? "Saving..."
                  : editingProduct
                    ? "Save Product"
                    : "Create Product"}
              </button>
            </div>

            {editingProduct ? (
              <button type="button" onClick={closeEditor} className="products-secondary-button">
                Cancel Editing
              </button>
            ) : null}
            </section>
          </form>
        </div>
      ) : null}

      {isRemoveDialogOpen ? (
        <div
          className="products-confirmation-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeRemoveDialog();
            }
          }}
        >
          <div
            ref={removeDialogRef}
            className="products-confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-product-dialog-title"
            aria-describedby="remove-product-dialog-description"
          >
            <div className="products-confirmation-copy">
              <p className="products-confirmation-kicker">Storefront Catalog</p>
              <h2 id="remove-product-dialog-title">Remove Product?</h2>
              <p id="remove-product-dialog-description">
                Are you sure you want to remove this product from the customer catalog?
              </p>
              <p className="products-confirmation-secondary">
                This will remove the storefront product but will NOT delete the original garment
                template.
              </p>
            </div>

            <div className="products-confirmation-actions">
              <button
                ref={removeDialogCancelRef}
                type="button"
                className="products-secondary-button products-confirmation-cancel"
                onClick={closeRemoveDialog}
                disabled={isRemovingProduct}
              >
                Cancel
              </button>
              <button
                ref={removeDialogConfirmRef}
                type="button"
                className="products-confirmation-remove"
                onClick={() => handleDelete(productPendingRemoval?.id)}
                disabled={isRemovingProduct}
              >
                {isRemovingProduct ? "Removing..." : "Remove Product"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
