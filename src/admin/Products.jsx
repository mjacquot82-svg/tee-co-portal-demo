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

const PRODUCT_MODES = {
  APPAREL: "apparel",
  MANUAL: "manual",
};

const CREATE_STOREFRONT_CATEGORY_VALUE = "__create_storefront_category__";

const emptyProduct = {
  productMode: PRODUCT_MODES.APPAREL,
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
  category: "",
  storefront_category: "",
  category_lookup_id: "",
  storefront_category_lookup_id: "",
  brand_lookup_id: "",
  garment_model_lookup_id: "",
  product_type: "",
  brand_model: "",
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

function resolveStorefrontCategoryOption(
  storefrontCategories = [],
  storefrontCategoryLookupId = "",
  storefrontCategoryName = "",
  fallbackCategoryName = ""
) {
  const normalizedLookupId = normalizeText(storefrontCategoryLookupId);
  if (normalizedLookupId) {
    const matchedCategory = findLookupById(storefrontCategories, normalizedLookupId);
    if (matchedCategory) return matchedCategory;
  }

  const targetName = normalizeText(
    storefrontCategoryName || fallbackCategoryName || "Catalog"
  ).toLowerCase();

  if (!targetName) return null;

  return (
    storefrontCategories.find(
      (category) => normalizeText(category?.name).toLowerCase() === targetName
    ) || null
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
  storefrontCategories = []
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
    placementsText: defaultPlacements.join(", "),
    placementPriceMap: buildPlacementPriceMap(defaultPlacements, {}),
    production_methods: defaultProductionMethods,
    production_method_prices: buildMethodPriceMap(defaultProductionMethods, {}),
    category: category?.name || "",
    storefront_category:
      storefrontCategory?.name || category?.name || item?.storefront_category || "",
    category_lookup_id: item?.category_lookup_id || "",
    storefront_category_lookup_id: storefrontCategory?.id || "",
    brand_lookup_id: item?.brand_lookup_id || "",
    garment_model_lookup_id: item?.garment_model_lookup_id || "",
    product_type: resolveStructuredProductType(garmentModel, "", item?.title || ""),
    brand_model: buildLegacyBrandModelValue(brand, garmentModel, ""),
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
    ...product,
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
    storefront_category:
      storefrontCategory?.name || product?.storefront_category || product?.category || "",
    storefront_category_lookup_id: storefrontCategory?.id || "",
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
  const catalogPanelRef = useRef(null);
  const nameInputRef = useRef(null);
  const storefrontCategoryInputRef = useRef(null);
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
  const [selectedStorefrontCategory, setSelectedStorefrontCategory] = useState("all");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedProductType, setSelectedProductType] = useState("all");
  const [selectedProductMode, setSelectedProductMode] = useState("all");
  const [newStorefrontCategoryName, setNewStorefrontCategoryName] = useState("");
  const [categorySaveError, setCategorySaveError] = useState("");
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isCreatingStorefrontCategory, setIsCreatingStorefrontCategory] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [creationNotice, setCreationNotice] = useState("");
  const [highlightedProductIds, setHighlightedProductIds] = useState([]);

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
  const placementLibrary = useMemo(
    () => buildPlacementLibrary(products, libraryItems),
    [products, libraryItems]
  );
  const placementOptions = normalizeListInput(form.placementsText);
  const activeStorefrontCategories = useMemo(
    () => storefrontCategories.filter((category) => category?.active !== false),
    [storefrontCategories]
  );
  const productTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((product) => normalizeText(product?.product_type))
            .filter(Boolean)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [products]
  );
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
      const storefrontCategoryName = normalizeText(
        product?.storefront_category || product?.category
      );
      const productTypeName = normalizeText(product?.product_type);
      const brandName = normalizeText(product?.brand_model);
      const matchesStorefrontCategory =
        selectedStorefrontCategory === "all" ||
        normalizeText(product?.storefront_category_lookup_id) === selectedStorefrontCategory;
      const matchesBrand =
        selectedBrand === "all" || brandName.toLowerCase() === selectedBrand.toLowerCase();
      const matchesProductType =
        selectedProductType === "all" ||
        productTypeName.toLowerCase() === selectedProductType.toLowerCase();
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
          productTypeName,
          product?.notes,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      const matchesStatus =
        selectedStatus === "all" ||
        (selectedStatus === "active"
          ? normalizeStatusValue(product?.status) === "active"
          : normalizeStatusValue(product?.status) !== "active");
      return (
        matchesSearch &&
        matchesStatus &&
        matchesStorefrontCategory &&
        matchesBrand &&
        matchesProductType &&
        matchesProductMode
      );
    });
  }, [
    products,
    searchTerm,
    selectedStatus,
    selectedStorefrontCategory,
    selectedBrand,
    selectedProductType,
    selectedProductMode,
  ]);

  const activeCount = products.filter((product) => normalizeStatusValue(product?.status) === "active").length;
  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    selectedStorefrontCategory !== "all" ||
    selectedBrand !== "all" ||
    selectedProductType !== "all" ||
    selectedProductMode !== "all" ||
    selectedStatus !== "all";

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

      if (name === "storefront_category_lookup_id") {
        const selectedStorefrontCategory = findLookupById(storefrontCategories, value);
        nextForm.storefront_category = selectedStorefrontCategory?.name || "";
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
      return;
    }

    setIsCreatingStorefrontCategory(false);
    setCategorySaveError("");
    setForm((current) => {
      const selectedStorefrontCategory = findLookupById(storefrontCategories, value);
      return {
        ...current,
        storefront_category_lookup_id: value,
        storefront_category: selectedStorefrontCategory?.name || "",
      };
    });
  }

  function resetForm() {
    setForm(emptyProduct);
    setEditingProductId(null);
    setCreationNotice("");
    setHighlightedProductIds([]);
    setCategorySaveError("");
    setIsCreatingStorefrontCategory(false);
    setNewStorefrontCategoryName("");
    setSaveError("");
  }

  function handleProductModeChange(productMode) {
    setSaveError("");
    setCreationNotice("");
    setHighlightedProductIds([]);
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
          garment_model_lookup_id: "",
          product_type: current.product_type || "Manual Product",
        };
      }

      return {
        ...current,
        productMode,
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
        storefrontCategories
      );
      console.info("[Products] created fresh storefront draft from garment template", {
        garmentId: item?.id || null,
        garmentTitle: item?.title || "",
        nextDraft,
      });
      setForm(nextDraft);
      return;
    }

    const garmentModel = findLookupById(garmentModels, item.garment_model_lookup_id);
    const brand = findLookupById(brands, item.brand_lookup_id);
    const supplierCategory = findLookupById(categories, item.category_lookup_id);
    const storefrontCategory =
      resolveStorefrontCategoryOption(
        storefrontCategories,
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
      category: supplierCategory?.name || current.category || "",
      storefront_category:
        storefrontCategory?.name ||
        current.storefront_category ||
        supplierCategory?.name ||
        "",
      category_lookup_id: item.category_lookup_id || current.category_lookup_id || "",
      storefront_category_lookup_id:
        storefrontCategory?.id || current.storefront_category_lookup_id || "",
      brand_lookup_id: item.brand_lookup_id || current.brand_lookup_id || "",
      garment_model_lookup_id: item.garment_model_lookup_id || current.garment_model_lookup_id || "",
      product_type: resolveStructuredProductType(garmentModel, current.product_type, current.name || item.title),
      brand_model: buildLegacyBrandModelValue(brand, garmentModel, current.brand_model),
    }));
  }

  useEffect(() => {
    const createFromGarmentId = normalizeText(location.state?.createFromGarmentId);
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
      `Storefront product draft loaded from garment template ${matchedGarment.title}. Review storefront details and publish when ready.`
    );
    setForm(
      buildFormFromGarmentDraft(
        matchedGarment,
        sizes,
        brands,
        categories,
        garmentModels,
        storefrontCategories
      )
    );
    navigate(location.pathname, { replace: true, state: {} });

    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
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
    storefrontCategories,
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
    setForm(
      buildFormFromProduct(
        product,
        libraryItems,
        sizes,
        brands,
        categories,
        garmentModels,
        storefrontCategories
      )
    );
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  }

  async function handleCreateStorefrontCategory() {
    const nextName = normalizeText(newStorefrontCategoryName);
    if (!nextName) return;

    try {
      setIsSavingCategory(true);
      setCategorySaveError("");
      const createdCategory = await createCatalogLookup("storefront_categories", {
        name: nextName,
        active: true,
      });
      setNewStorefrontCategoryName("");
      setIsCreatingStorefrontCategory(false);
      setForm((current) => ({
        ...current,
        storefront_category_lookup_id: createdCategory.id,
        storefront_category: createdCategory.name,
      }));
    } catch (error) {
      console.error("Unable to create storefront category", error);
      setCategorySaveError("Unable to create storefront category right now.");
    } finally {
      setIsSavingCategory(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError("");

    if (!editingProductId && !isManualProductMode && !selectedGarmentItem) {
      setSaveError("Choose a garment from the Garment Library before creating a storefront product.");
      return;
    }

    if (!normalizeText(form.storefront_category_lookup_id) && !normalizeText(form.storefront_category)) {
      setSaveError("Assign a storefront category before publishing this product.");
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
    const storefrontCategory = findLookupById(
      storefrontCategories,
      form.storefront_category_lookup_id
    );
    const flatPrice = Number(form.flat_price || 0);
    const selectedSizes =
      !isManualProductMode && selectedGarmentItem && isOneSizeOnly(selectedGarmentItem.sizes || [])
        ? sortSizesByLookup(selectedGarmentItem.sizes || [], sizes)
        : isManualProductMode
          ? []
          : sortSizesByLookup(form.sizes, sizes);
    const resolvedProductType = isManualProductMode
      ? form.product_type || "Manual Product"
      : resolveStructuredProductType(garmentModel, form.product_type, form.name);

    const productPayload = {
      name: normalizeText(form.name),
      garment_library_item_id: isManualProductMode
        ? null
        : selectedGarmentItem?.id || form.selectedGarmentLibraryId || null,
      category: category?.name || form.category || "Catalog",
      storefront_category:
        storefrontCategory?.name || form.storefront_category || category?.name || "Catalog",
      category_lookup_id: category?.id || form.category_lookup_id || null,
      storefront_category_lookup_id:
        storefrontCategory?.id || form.storefront_category_lookup_id || null,
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
      <section className="products-page-hero">
        <div className="products-page-hero-copy">
          <p className="products-eyebrow">Customer Product Catalog</p>
          <h1 style={{ margin: 0 }}>Storefront Product Workspace</h1>
          <p style={{ margin: 0, color: "#64748b" }}>
            Edit products with the live catalog beside you.
          </p>
        </div>

        <div className="products-page-hero-actions">
          <button
            type="button"
            className="products-secondary-button"
            onClick={() => {
              editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              window.requestAnimationFrame(() => nameInputRef.current?.focus());
            }}
          >
            Focus Editor
          </button>
          <button
            type="button"
            className="products-secondary-button"
            onClick={() => catalogPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            Focus Catalog
          </button>
        </div>
      </section>

      <div className="products-workspace">
        <form
          ref={editorRef}
          onSubmit={handleSubmit}
          className={`products-editor ${editingProduct ? "is-editing" : ""}`}
        >
          <div className="products-editor-intro">
            <p className="products-eyebrow">Product Editor</p>
            <h2 style={{ margin: 0 }}>
              {editingProduct ? `Edit ${editingProduct.name}` : "Create Storefront Product"}
            </h2>
            <p style={{ margin: 0, color: "#64748b" }}>
              {editingProduct
                ? "Update the storefront details and review the live card preview on the right."
                : "Start with the customer-facing essentials, then open secondary settings only when needed."}
            </p>
            <div className="products-editor-topbar">
              <button
                type="button"
                className="products-secondary-button"
                onClick={() => catalogPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                View Published Catalog
              </button>
              {editingProduct ? (
                <button type="button" onClick={resetForm} className="products-secondary-button">
                  Cancel Editing
                </button>
              ) : null}
            </div>
            <div className="products-editor-utility-row">
              <span>Garment templates live in the <Link to="/admin/garments">Garment Library</Link>.</span>
              <span>Manual products can still be created here.</span>
            </div>
          </div>

          {saveError ? <div className="products-error-banner">{saveError}</div> : null}
          {creationNotice ? <div className="products-callout">{creationNotice}</div> : null}

          <section className="products-editor-section">
            <div className="products-section-header">
              <div>
                <p className="products-section-step">Core</p>
                <h2>Product Basics</h2>
              </div>
              <p>Set the product mode and core storefront details.</p>
            </div>

            <div className="garment-model-workflow-panel">
              <div className="garment-model-workflow-header">
                <strong>Product Type</strong>
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

            <div className="products-pricing-grid">
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
              Customer Sale Price
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
              <label style={labelStyle}>
                Storefront Category
                <select
                  name="storefront_category_lookup_id"
                  value={form.storefront_category_lookup_id}
                  onChange={handleStorefrontCategorySelect}
                  style={fieldStyle}
                >
                  <option value="">Select storefront category</option>
                  {activeStorefrontCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                  <option value={CREATE_STOREFRONT_CATEGORY_VALUE}>+ Create New Category</option>
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
                  <option value="">No brand</option>
                  {brandSelectOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="products-editor-grid">
              <label style={labelStyle}>
                Supplier Category
                <select
                  name="category_lookup_id"
                  value={form.category_lookup_id}
                  onChange={updateField}
                  style={fieldStyle}
                >
                  <option value="">Catalog</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={labelStyle}>
                Product Type
                <input
                  name="product_type"
                  value={form.product_type}
                  onChange={updateField}
                  placeholder={isManualProductMode ? "Tumbler" : "Pullover Hoodie"}
                  style={fieldStyle}
                />
              </label>
            </div>

            {isCreatingStorefrontCategory ? (
              <div className="products-inline-category-create">
                <label style={{ ...labelStyle, margin: 0 }}>
                  New Storefront Category
                  <input
                    ref={storefrontCategoryInputRef}
                    value={newStorefrontCategoryName}
                    onChange={(event) => setNewStorefrontCategoryName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleCreateStorefrontCategory();
                      }
                    }}
                    placeholder="Drinkware"
                    style={fieldStyle}
                  />
                </label>
                <div className="products-inline-category-create-actions">
                  <button
                    type="button"
                    className="products-inline-save"
                    onClick={handleCreateStorefrontCategory}
                    disabled={isSavingCategory || !normalizeText(newStorefrontCategoryName)}
                  >
                    {isSavingCategory ? "Saving..." : "Create Category"}
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
              </div>
            ) : null}

            {categorySaveError ? <div className="products-error-banner">{categorySaveError}</div> : null}

          </section>

          {!isManualProductMode ? (
          <section className="products-editor-section">
            <div className="products-section-header">
              <div>
                <p className="products-section-step">Link</p>
                <h2>Choose Garment Source</h2>
              </div>
              <p>Select the linked garment template, then narrow what customers can buy.</p>
            </div>

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
          </section>
          ) : null}

          {!isManualProductMode && selectedGarmentItem ? (
            <section className="products-editor-section">
              <div className="products-section-header">
                <div>
                  <p className="products-section-step">Variants</p>
                  <h2>Configure Variants</h2>
                </div>
                <p>Keep the catalog clean by enabling only the variants and sizes you want to sell.</p>
              </div>

              <div className="products-library-grid products-library-grid-wide">
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
            </section>
          ) : null}

          <section className="products-editor-section">
            <div className="products-section-header">
              <div>
                <p className="products-section-step">Preview</p>
                <h2>Merchandising</h2>
              </div>
              <p>Set the image, status, and publish-ready storefront presentation.</p>
            </div>

            <div className="products-config-grid">
              <ProductImageUploader
                image={form.image}
                onImageChange={(image) => setForm((current) => ({ ...current, image }))}
              />

              <div className="products-config-sidebar">
                <label style={labelStyle}>
                  Status
                  <select name="status" value={form.status} onChange={updateField} style={fieldStyle}>
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </label>

                <div className="products-summary-card">
                  <span className="products-summary-label">Catalog Readiness</span>
                  <strong>{form.flat_price ? formatMoney(form.flat_price) : "Add sale price"}</strong>
                  <div className="products-summary-details">
                    <span>
                      {isManualProductMode ? "Standalone manual product" : `${form.visibleVariants.length || 0} color variants`}
                    </span>
                    <span>
                      {isManualProductMode ? "No garment template required" : `${form.sizes.length || 0} sizes enabled`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <details className="products-editor-section products-advanced-section">
            <summary className="products-advanced-summary">
              <div>
                <strong>Advanced Settings</strong>
                <span>Placements, production methods, pricing, and description.</span>
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
                Description
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={updateField}
                  placeholder={
                    isManualProductMode
                      ? "Customer-facing description for this manual product."
                      : "Customer-facing description or internal merchandising notes."
                  }
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
                  {form.storefront_category
                    ? ` Storefront category: ${form.storefront_category}.`
                    : " Storefront category still needs to be assigned."}
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
                    ? "Update Storefront Product"
                    : "Create Storefront Product"}
              </button>
            </div>

            {editingProduct ? (
              <button type="button" onClick={resetForm} className="products-secondary-button">
                Cancel Editing
              </button>
            ) : null}
          </section>
        </form>

        <section ref={catalogPanelRef} className="products-catalog-panel">
          <div className="products-catalog-header">
            <div>
              <p className="products-eyebrow">Live Catalog</p>
              <h2 style={{ margin: "6px 0 0" }}>Customer-facing products</h2>
              <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                {editingProduct
                  ? "The product you are editing stays highlighted here."
                  : "Use this live catalog to review storefront results while editing."}
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

          <div className="products-catalog-controls">
            <div className="products-catalog-search-row">
              <label className="products-toolbar-field">
                <span>Search Products</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search product, category, brand, type"
                  style={fieldStyle}
                />
              </label>

              <button
                type="button"
                className="products-primary-button"
                onClick={() => {
                  resetForm();
                  editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  window.requestAnimationFrame(() => nameInputRef.current?.focus());
                }}
              >
                New Product
              </button>
            </div>

            <details className="products-filter-panel" open={hasActiveFilters}>
              <summary className="products-filter-summary">
                <strong>Filters</strong>
                <span>
                  {hasActiveFilters
                    ? "Refine the visible catalog list."
                    : "Open filters for category, brand, type, mode, and status."}
                </span>
              </summary>

              <div className="products-toolbar">
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
                  <span>Product Type</span>
                  <select
                    value={selectedProductType}
                    onChange={(event) => setSelectedProductType(event.target.value)}
                    style={fieldStyle}
                  >
                    <option value="all">All product types</option>
                    {productTypeOptions.map((productType) => (
                      <option key={productType} value={productType}>
                        {productType}
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
                  setSelectedStorefrontCategory("all");
                  setSelectedBrand("all");
                  setSelectedProductType("all");
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
                  const renderIdentity = buildProductRenderIdentity(product, index);
                  const isActiveCard =
                    product.id === editingProductId || highlightedProductIds.includes(product.id);
                  const statusIsActive = normalizeStatusValue(product?.status) === "active";

                  console.info("[Products] Rendering customer catalog product card", {
                    index,
                    id: product?.id || null,
                    name: product?.name || "",
                    status: product?.status || "",
                    category: product?.category || "",
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
                          <span className="products-card-category-pill">
                            {product.storefront_category || product.category || "Catalog"}
                          </span>
                          <strong className="products-card-price">{formatMoney(product?.base_garment_price)}</strong>
                        </div>

                        <div className="products-card-title-block">
                          <div className="products-card-title-row">
                            <h3 style={{ margin: 0 }}>
                              {product.name || product.product_type || "Catalog Product"}
                            </h3>
                            {isActiveCard ? (
                              <span className="products-card-editing-pill">
                                {product.id === editingProductId ? "Editing" : "Updated"}
                              </span>
                            ) : null}
                          </div>
                          <p className="products-card-subtitle">
                            {linkedGarment?.title ||
                              product.brand_model ||
                              (product?.garment_library_item_id
                                ? "Linked apparel product"
                                : "Manual catalog product")}
                          </p>
                          {product?.notes ? (
                            <p className="products-card-description">{product.notes}</p>
                          ) : null}
                        </div>

                        <div className="products-card-meta-row">
                          <span className="products-card-meta-pill">
                            {product?.product_type ||
                              (product?.garment_library_item_id ? "Apparel Product" : "Manual Product")}
                          </span>
                          <span className="products-card-meta-pill">
                            {product?.garment_library_item_id ? "Garment-linked" : "Manual"}
                          </span>
                          <span className={`products-status products-status-${statusIsActive ? "active" : "archived"}`}>
                            {statusIsActive ? "Active" : "Archived"}
                          </span>
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
                    Create your first storefront product from the garment library, or use the manual form if needed.
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
