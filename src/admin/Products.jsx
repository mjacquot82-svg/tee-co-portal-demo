import { useMemo, useRef, useState } from "react";
import "./Products.css";
import ProductPricingFields from "../components/ProductPricingFields";
import { PRODUCTION_TYPES } from "../constants/productionTypes";
import { garments } from "../data/garments";
import {
  createCatalogLookup,
  useCatalogLookups,
} from "../lib/catalogLookupsStore";
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
  category: "T-Shirts",
  product_type: "",
  brand_model: "",
  selectedGarmentModelId: "",
  selectedBrandId: "",
  garmentModelSearch: "",
  image: "",
  cost_price: "0",
  markup_percentage: "0",
  status: "Active",
  colors: ["Black", "White"],
  sizes: ["S", "M", "L", "XL"],
  placementsText: "Left Chest, Full Front, Full Back",
  placementPriceMap: {},
  production_methods: ["Screen Print"],
  production_method_prices: {},
  notes: "",
};

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

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTextKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeListInput(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueList(values = []) {
  const seen = new Set();

  return values.filter((value) => {
    const key = normalizeTextKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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

function findLookupByName(options = [], value = "") {
  const normalizedValue = normalizeTextKey(value);
  if (!normalizedValue) return null;
  return options.find((option) => normalizeTextKey(option?.name) === normalizedValue) || null;
}

function findBrandById(brands = [], brandId = "") {
  return brands.find((brand) => brand.id === brandId) || null;
}

function findCategoryById(categories = [], categoryId = "") {
  return categories.find((category) => category.id === categoryId) || null;
}

function buildGarmentModelLabel(model, brands = [], categories = []) {
  if (!model) return "";

  const brand = findBrandById(brands, model.brand_id);
  const category = findCategoryById(categories, model.category_id);
  const parts = [
    brand?.name,
    model?.model_code,
    model?.display_name,
    category?.name,
  ].filter(Boolean);

  return parts.join(" · ");
}

function buildLegacyBrandModelValue(brand, model, fallbackValue = "") {
  if (brand && model?.model_code) {
    return `${brand.name} ${model.model_code}`;
  }

  if (brand && model?.display_name) {
    return `${brand.name} ${model.display_name}`;
  }

  if (brand) {
    return brand.name;
  }

  return fallbackValue;
}

function resolveStructuredProductType(model, fallbackValue = "", nameFallback = "") {
  return model?.display_name || fallbackValue || nameFallback || "";
}

function buildPlacementLibrary(products = []) {
  const seen = new Set();
  const placementNames = [];

  [...COMMON_PLACEMENT_OPTIONS,
    ...garments.flatMap((garment) => garment?.placements_allowed || []),
    ...products.flatMap((product) => getProductPlacementConfig(product).map((item) => item.label)),
  ]
    .map((placement) => normalizeText(placement))
    .filter(Boolean)
    .forEach((placement) => {
      const key = normalizeTextKey(placement);
      if (seen.has(key)) return;
      seen.add(key);
      placementNames.push(placement);
    });

  return placementNames;
}

function buildFormFromProduct(product, brands = [], garmentModels = []) {
  const safeProduct = product && typeof product === "object" ? product : {};
  const placements = getProductPlacementConfig(safeProduct).map(
    (placement) => placement.label
  );
  const productionMethods = safeProduct?.production_methods?.length
    ? safeProduct.production_methods
    : safeProduct?.decoration_types?.length
      ? safeProduct.decoration_types
      : ["Screen Print"];
  const inferredBrand =
    brands.find((brand) =>
      normalizeTextKey(safeProduct?.brand_model).startsWith(
        normalizeTextKey(brand?.name)
      )
    ) || null;
  const inferredModel =
    garmentModels.find((model) =>
      safeProduct?.brand_model &&
      normalizeTextKey(safeProduct.brand_model).includes(
        normalizeTextKey(model?.model_code)
      )
    ) || null;

  return {
    ...emptyProduct,
    ...safeProduct,
    brand_model: safeProduct?.brand_model || "",
    selectedBrandId: inferredBrand?.id || inferredModel?.brand_id || "",
    selectedGarmentModelId: inferredModel?.id || "",
    garmentModelSearch: inferredModel
      ? buildGarmentModelLabel(inferredModel, brands, [])
      : safeProduct?.brand_model || "",
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
    colors: Array.isArray(safeProduct?.colors)
      ? uniqueList(safeProduct.colors)
      : normalizeListInput(safeProduct?.colors),
    sizes: Array.isArray(safeProduct?.sizes)
      ? uniqueList(safeProduct.sizes)
      : normalizeListInput(safeProduct?.sizes),
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

function SelectLookupField({
  label,
  value,
  onChange,
  options,
  placeholder,
  helperText,
  action,
}) {
  const hasMatchingOption = options.some(
    (option) => normalizeTextKey(option?.name) === normalizeTextKey(value)
  );

  return (
    <label style={labelStyle}>
      {label}
      <select value={value} onChange={onChange} style={fieldStyle}>
        <option value="">{placeholder}</option>
        {value && !hasMatchingOption ? (
          <option value={value}>{value} (Legacy)</option>
        ) : null}
        {options.map((option) => (
          <option key={option.id || option.name} value={option.name}>
            {option.name}
          </option>
        ))}
      </select>
      <div className="products-field-footer">
        <span>{helperText}</span>
        {action}
      </div>
    </label>
  );
}

function SearchableLookupField({
  label,
  value,
  onChange,
  onSelect,
  options,
  placeholder,
  helperText,
  action,
  renderOptionLabel = (option) => option?.name || "",
  renderOptionMeta,
  emptyState = "No matches found.",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const normalizedSearch = normalizeTextKey(value);

  const filteredOptions = useMemo(() => {
    if (!normalizedSearch) {
      return options.slice(0, 10);
    }

    return options.filter((option) => {
      const labelValue = renderOptionLabel(option);
      const metaValue = renderOptionMeta ? renderOptionMeta(option) : "";
      return `${labelValue} ${metaValue}`.toLowerCase().includes(normalizedSearch);
    });
  }, [normalizedSearch, options, renderOptionLabel, renderOptionMeta]);

  return (
    <label style={labelStyle}>
      {label}
      <div className="products-searchable-field">
        <input
          value={value}
          onChange={(event) => {
            onChange(event);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 120);
          }}
          placeholder={placeholder}
          style={fieldStyle}
        />

        {isOpen ? (
          <div className="products-searchable-panel">
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const optionLabel = renderOptionLabel(option);
                const optionMeta = renderOptionMeta ? renderOptionMeta(option) : "";
                return (
                  <button
                    key={option.id || optionLabel}
                    type="button"
                    className="products-searchable-option"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onSelect(option);
                      setIsOpen(false);
                    }}
                  >
                    <strong>{optionLabel}</strong>
                    {optionMeta ? <span>{optionMeta}</span> : null}
                  </button>
                );
              })
            ) : (
              <div className="products-selection-empty">{emptyState}</div>
            )}
          </div>
        ) : null}
      </div>
      <div className="products-field-footer">
        <span>{helperText}</span>
        {action}
      </div>
    </label>
  );
}

function MultiSelectLookupField({
  label,
  helperText,
  options,
  selectedValues,
  onToggle,
  onCreate,
  createLabel,
  createHelper,
  showColorSwatch = false,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearch = normalizeTextKey(searchTerm);
  const selectedSet = new Set(selectedValues.map((value) => normalizeTextKey(value)));

  const filteredOptions = useMemo(() => {
    if (!normalizedSearch) return options;

    return options.filter((option) =>
      normalizeTextKey(option?.name).includes(normalizedSearch)
    );
  }, [options, normalizedSearch]);

  const hasExactMatch = options.some(
    (option) => normalizeTextKey(option?.name) === normalizedSearch
  );
  const legacySelections = selectedValues.filter(
    (value) =>
      !options.some((option) => normalizeTextKey(option?.name) === normalizeTextKey(value))
  );

  return (
    <div className="products-multiselect">
      <div className="products-multiselect-header">
        <div>
          <strong>{label}</strong>
          <p>{helperText}</p>
        </div>
      </div>

      <div className="products-selection-chip-row">
        {selectedValues.length ? (
          selectedValues.map((value) => {
            const matchedOption =
              options.find(
                (option) => normalizeTextKey(option?.name) === normalizeTextKey(value)
              ) || null;

            return (
              <button
                key={value}
                type="button"
                className={`products-selection-chip ${
                  matchedOption ? "" : "is-legacy"
                }`}
                onClick={() => onToggle(value)}
              >
                {showColorSwatch ? (
                  <span
                    className="products-selection-swatch"
                    style={{ background: matchedOption?.hex_code || "#cbd5e1" }}
                  />
                ) : null}
                <span>{value}</span>
                <strong>×</strong>
              </button>
            );
          })
        ) : (
          <div className="products-selection-empty">No selections yet.</div>
        )}
      </div>

      <div className="products-multiselect-toolbar">
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder={`Search ${label.toLowerCase()}`}
          style={fieldStyle}
        />
        {onCreate ? (
          <button
            type="button"
            className="products-inline-action"
            onClick={() => onCreate(searchTerm)}
            disabled={!normalizeText(searchTerm) || hasExactMatch}
          >
            {createLabel}
          </button>
        ) : null}
      </div>

      <div className="products-multiselect-panel">
        {filteredOptions.length ? (
          filteredOptions.map((option) => {
            const isSelected = selectedSet.has(normalizeTextKey(option?.name));

            return (
              <label key={option.id || option.name} className="products-option-row">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(option.name)}
                />
                {showColorSwatch ? (
                  <span
                    className="products-option-swatch"
                    style={{ background: option.hex_code || "#cbd5e1" }}
                  />
                ) : null}
                <span>{option.name}</span>
              </label>
            );
          })
        ) : (
          <div className="products-selection-empty">{createHelper}</div>
        )}
      </div>

      {legacySelections.length ? (
        <div className="products-legacy-note">
          Existing legacy values are preserved until you replace them with library options.
        </div>
      ) : null}
    </div>
  );
}

export default function Products() {
  const pageRef = useRef(null);
  const editorRef = useRef(null);
  const nameInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const products = useStoredProducts();
  const lookups = useCatalogLookups();
  const categories = lookups.categories || [];
  const brands = lookups.brands || [];
  const colors = lookups.colors || [];
  const sizes = lookups.sizes || [];
  const garmentModels = lookups.garment_models || [];
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
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isCreatingModel, setIsCreatingModel] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [modelDraft, setModelDraft] = useState({
    brand_id: "",
    display_name: "",
    model_code: "",
  });

  const placementLibrary = useMemo(() => buildPlacementLibrary(products), [products]);
  const placementOptions = normalizeListInput(form.placementsText);
  const editingProduct = editingProductId
    ? products.find((product) => product.id === editingProductId) || null
    : null;
  const editorTitle = editingProduct
    ? `Editing: ${editingProduct.name || form.name || "Product"}`
    : "Create Product";
  const editorDescription = editingProduct
    ? "Update garment settings, pricing, and workflow options for this catalog item."
    : "Build apparel products from a reusable garment library instead of retyping the same catalog data.";

  const selectedCategoryRecord = findLookupByName(categories, form.category) || null;
  const availableGarmentModels = useMemo(() => {
    return garmentModels.filter((model) => {
      if (selectedCategoryRecord?.id && model.category_id !== selectedCategoryRecord.id) {
        return false;
      }

      return true;
    });
  }, [garmentModels, selectedCategoryRecord]);
  const selectedGarmentModel =
    garmentModels.find((model) => model.id === form.selectedGarmentModelId) || null;
  const selectedBrand = findBrandById(
    brands,
    selectedGarmentModel?.brand_id || form.selectedBrandId
  );
  const selectedGarmentModelLabel =
    selectedGarmentModel
      ? buildGarmentModelLabel(selectedGarmentModel, brands, categories)
      : form.garmentModelSearch;
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

  function handleCategoryChange(event) {
    const nextCategory = event.target.value;

    setForm((current) => {
      const currentModel =
        garmentModels.find((model) => model.id === current.selectedGarmentModelId) || null;
      const categoryRecord = findLookupByName(categories, nextCategory);
      const shouldClearModel =
        currentModel &&
        categoryRecord?.id &&
        currentModel.category_id !== categoryRecord.id;

      return {
        ...current,
        category: nextCategory,
        ...(shouldClearModel
          ? {
              selectedGarmentModelId: "",
              selectedBrandId: "",
              garmentModelSearch: "",
            }
          : {}),
      };
    });
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

  function toggleColor(colorName) {
    setForm((current) => ({
      ...current,
      colors: current.colors.some(
        (color) => normalizeTextKey(color) === normalizeTextKey(colorName)
      )
        ? current.colors.filter(
            (color) => normalizeTextKey(color) !== normalizeTextKey(colorName)
          )
        : uniqueList([...current.colors, colorName]),
    }));
  }

  function toggleSize(sizeName) {
    setForm((current) => {
      const nextSizes = current.sizes.some(
        (size) => normalizeTextKey(size) === normalizeTextKey(sizeName)
      )
        ? current.sizes.filter(
            (size) => normalizeTextKey(size) !== normalizeTextKey(sizeName)
          )
        : uniqueList([...current.sizes, sizeName]);
      const ordered = [...nextSizes].sort((left, right) => {
        const leftRecord = findLookupByName(sizes, left);
        const rightRecord = findLookupByName(sizes, right);
        return Number(leftRecord?.sort_order || 999) - Number(rightRecord?.sort_order || 999);
      });

      return {
        ...current,
        sizes: ordered,
      };
    });
  }

  function resetCreatePanels() {
    setIsCreatingCategory(false);
    setIsCreatingModel(false);
    setCategoryDraft("");
    setModelDraft({ brand_id: "", display_name: "", model_code: "" });
  }

  function resetForm() {
    setForm(emptyProduct);
    setEditingProductId(null);
    setSelectedFileName("");
    resetCreatePanels();

    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  }

  function handleEdit(product) {
    setEditingProductId(product.id);
    setSelectedFileName("");
    setForm(buildFormFromProduct(product, brands, garmentModels));
    resetCreatePanels();
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  }

  function handleGarmentModelSearchChange(event) {
    const nextValue = event.target.value;
    setForm((current) => ({
      ...current,
      selectedGarmentModelId: "",
      garmentModelSearch: nextValue,
    }));
  }

  function handleGarmentModelSelect(model) {
    const brand = findBrandById(brands, model.brand_id);
    const category = findCategoryById(categories, model.category_id);

    setForm((current) => ({
      ...current,
      selectedBrandId: brand?.id || "",
      category: category?.name || current.category,
      product_type: resolveStructuredProductType(model, current.product_type, current.name),
      brand_model: buildLegacyBrandModelValue(brand, model, current.brand_model),
      selectedGarmentModelId: model.id,
      garmentModelSearch: buildGarmentModelLabel(model, brands, categories),
    }));
  }

  async function handleCreateCategory() {
    const nextName = normalizeText(categoryDraft || form.category);
    if (!nextName) return;

    const created = await createCatalogLookup("categories", { name: nextName, active: true });
    setForm((current) => ({
      ...current,
      category: created.name,
    }));
    setCategoryDraft("");
    setIsCreatingCategory(false);
  }

  async function handleCreateModel() {
    const nextDisplayName = normalizeText(modelDraft.display_name);
    const nextModelCode = normalizeText(modelDraft.model_code);
    const resolvedBrand = findBrandById(brands, modelDraft.brand_id || form.selectedBrandId);
    const resolvedCategory = findLookupByName(categories, form.category);

    if (!nextDisplayName || !resolvedBrand?.id || !resolvedCategory?.id) {
      setSaveError("Select or create a brand and category before adding a garment model.");
      return;
    }

    const created = await createCatalogLookup("garment_models", {
      brand_id: resolvedBrand.id,
      model_code: nextModelCode,
      display_name: nextDisplayName,
      category_id: resolvedCategory.id,
      active: true,
    });

    setForm((current) => ({
      ...current,
      selectedGarmentModelId: created.id,
      garmentModelSearch: buildGarmentModelLabel(created, brands, categories),
      category: resolvedCategory.name,
      selectedBrandId: resolvedBrand.id,
      product_type: resolveStructuredProductType(created, current.product_type, current.name),
      brand_model: buildLegacyBrandModelValue(resolvedBrand, created, current.brand_model),
    }));
    setModelDraft({ brand_id: resolvedBrand.id, display_name: "", model_code: "" });
    setIsCreatingModel(false);
  }

  async function handleCreateColor(searchValue) {
    const nextName = normalizeText(searchValue);
    if (!nextName) return;

    const created = await createCatalogLookup("colors", { name: nextName, active: true });
    toggleColor(created.name);
  }

  async function handleCreateSize(searchValue) {
    const nextName = normalizeText(searchValue);
    if (!nextName) return;

    const highestSortOrder = sizes.reduce(
      (highest, size) => Math.max(highest, Number(size?.sort_order || 0)),
      0
    );
    const created = await createCatalogLookup("sizes", {
      name: nextName,
      sort_order: highestSortOrder + 10,
      active: true,
    });
    toggleSize(created.name);
  }

  function togglePlacement(placementName) {
    setForm((current) => {
      const nextPlacements = current.placementsText
        ? normalizeListInput(current.placementsText)
        : [];
      const exists = nextPlacements.some(
        (placement) => normalizeTextKey(placement) === normalizeTextKey(placementName)
      );
      const placements = exists
        ? nextPlacements.filter(
            (placement) => normalizeTextKey(placement) !== normalizeTextKey(placementName)
          )
        : [...nextPlacements, placementName];
      const placementsText = placements.join(", ");

      return {
        ...current,
        placementsText,
        placementPriceMap: buildPlacementPriceMap(placements, current.placementPriceMap),
      };
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
    const resolvedModel =
      garmentModels.find((model) => model.id === form.selectedGarmentModelId) || null;
    const resolvedBrand = findBrandById(
      brands,
      resolvedModel?.brand_id || form.selectedBrandId
    );
    const productPayload = {
      name: form.name,
      category: form.category,
      product_type: resolveStructuredProductType(
        resolvedModel,
        form.product_type,
        form.name
      ),
      brand_model: buildLegacyBrandModelValue(
        resolvedBrand,
        resolvedModel,
        form.brand_model
      ),
      image: form.image,
      cost_price: Number(form.cost_price || 0),
      markup_percentage: Number(form.markup_percentage || 0),
      status: form.status,
      colors: uniqueList(form.colors),
      sizes: uniqueList(form.sizes),
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
                Legacy product records stay compatible. Structured selections simply write cleaner catalog values back into the current product fields.
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
                placeholder="Softstyle Tee"
                required
                style={fieldStyle}
              />
            </label>

            <div className="products-derived-field">
              <span>Derived Product Type</span>
              <strong>
                {resolveStructuredProductType(selectedGarmentModel, form.product_type, form.name) ||
                  "Select a garment model to derive the display type."}
              </strong>
              <p>
                `product_type` is now derived from the structured garment model to avoid redundant manual entry.
              </p>
            </div>
          </div>

          <div className="products-editor-section">
            <div>
              <strong style={{ display: "block", marginBottom: "4px" }}>
                Structured Apparel Library
              </strong>
              <span style={{ color: "#64748b", fontSize: "13px" }}>
                Pick from reusable category, brand, garment model, color, and size data. Existing storefront rendering still uses the same product fields after save.
              </span>
            </div>

            <div className="products-editor-grid">
              <SelectLookupField
                label="Category"
                value={form.category}
                onChange={handleCategoryChange}
                options={categories}
                placeholder="Select category"
                helperText="Structured apparel categories from the normalized lookup table."
                action={
                  <button
                    type="button"
                    className="products-inline-action"
                    onClick={() => {
                      setCategoryDraft(form.category);
                      setIsCreatingCategory((current) => !current);
                    }}
                  >
                    + Create New Category
                  </button>
                }
              />
            </div>

            {isCreatingCategory ? (
              <div className="products-inline-create-panel">
                <input
                  value={categoryDraft}
                  onChange={(event) => setCategoryDraft(event.target.value)}
                  placeholder="New category name"
                  style={fieldStyle}
                />
                <button type="button" className="products-inline-save" onClick={handleCreateCategory}>
                  Save Category
                </button>
                <button
                  type="button"
                  className="products-inline-cancel"
                  onClick={() => setIsCreatingCategory(false)}
                >
                  Cancel
                </button>
              </div>
            ) : null}

            <SearchableLookupField
              label="Brand / Model"
              value={selectedGarmentModelLabel}
              onChange={handleGarmentModelSearchChange}
              onSelect={handleGarmentModelSelect}
              options={availableGarmentModels}
              placeholder="Search brand, model code, or garment name"
              helperText={
                selectedCategoryRecord?.name
                  ? `Showing ${selectedCategoryRecord.name} models from the normalized garment library.`
                  : "Search across the normalized garment model library."
              }
              action={
                <button
                  type="button"
                  className="products-inline-action"
                  onClick={() => {
                    setModelDraft({
                      brand_id: selectedBrand?.id || form.selectedBrandId || "",
                      display_name: resolveStructuredProductType(
                        selectedGarmentModel,
                        form.product_type,
                        form.name
                      ),
                      model_code: "",
                    });
                    setIsCreatingModel((current) => !current);
                  }}
                >
                  + Create New Garment Model
                </button>
              }
              renderOptionLabel={(option) => buildGarmentModelLabel(option, brands, categories)}
              renderOptionMeta={(option) => {
                const brand = findBrandById(brands, option.brand_id);
                return [brand?.name, option.model_code].filter(Boolean).join(" • ");
              }}
              emptyState="No garment models match this search."
            />

            {isCreatingModel ? (
              <div className="products-inline-model-panel">
                <div className="products-inline-model-grid">
                  <select
                    value={modelDraft.brand_id}
                    onChange={(event) =>
                      setModelDraft((current) => ({
                        ...current,
                        brand_id: event.target.value,
                      }))
                    }
                    style={fieldStyle}
                  >
                    <option value="">Select brand</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={modelDraft.display_name}
                    onChange={(event) =>
                      setModelDraft((current) => ({
                        ...current,
                        display_name: event.target.value,
                      }))
                    }
                    placeholder="Garment display name"
                    style={fieldStyle}
                  />
                  <input
                    value={modelDraft.model_code}
                    onChange={(event) =>
                      setModelDraft((current) => ({
                        ...current,
                        model_code: event.target.value,
                      }))
                    }
                    placeholder="Model code"
                    style={fieldStyle}
                  />
                </div>
                <div className="products-inline-meta">
                  <span>
                    Brand:{" "}
                    <strong>
                      {findBrandById(brands, modelDraft.brand_id)?.name || "Select a brand first"}
                    </strong>
                  </span>
                  <span>
                    Category: <strong>{selectedCategoryRecord?.name || "Select a category first"}</strong>
                  </span>
                </div>
                <div className="products-inline-create-panel">
                  <button type="button" className="products-inline-save" onClick={handleCreateModel}>
                    Save Garment Model
                  </button>
                  <button
                    type="button"
                    className="products-inline-cancel"
                    onClick={() => setIsCreatingModel(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <div className="products-compatibility-card">
              <span>Compatibility Mapping</span>
              <strong>{form.brand_model || "Brand/model value will be generated from the structured selections."}</strong>
              <p>
                This preview shows the legacy `brand_model` field that still feeds the current storefront and order flows.
              </p>
            </div>
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
                Colors And Sizes
              </strong>
              <span style={{ color: "#64748b", fontSize: "13px" }}>
                Search, select, and remove color and size options without managing giant comma-separated strings.
              </span>
            </div>

            <div className="products-library-grid">
              <MultiSelectLookupField
                label="Colors"
                helperText="Large color lists stay manageable and are ready for future swatches and supplier data."
                options={colors}
                selectedValues={form.colors}
                onToggle={toggleColor}
                onCreate={handleCreateColor}
                createLabel="+ Create New Color"
                createHelper="No matching colors yet. Create one from the search box."
                showColorSwatch
              />

              <MultiSelectLookupField
                label="Sizes"
                helperText="Selected sizes keep lookup ordering for cleaner staff and customer workflows."
                options={sizes}
                selectedValues={form.sizes}
                onToggle={toggleSize}
                onCreate={handleCreateSize}
                createLabel="+ Create New Size"
                createHelper="No matching sizes yet. Create one from the search box."
              />
            </div>
          </div>

          <details className="products-editor-section products-advanced-section">
            <summary className="products-advanced-summary">
              <div>
                <strong>Advanced Production Settings</strong>
                <span>
                  Keep compatibility with existing production method and surcharge data without giving it primary form emphasis.
                </span>
              </div>
            </summary>

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
          </details>

          <div className="products-editor-section">
            <div>
              <strong style={{ display: "block", marginBottom: "4px" }}>
                Placements And Pricing
              </strong>
              <span style={{ color: "#64748b", fontSize: "13px" }}>
                Select structured decoration zones instead of typing comma-separated placement lists.
              </span>
            </div>

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

            <div className="products-selection-chip-row">
              {placementOptions.length ? (
                placementOptions.map((placement) => {
                  const isLegacy = !placementLibrary.some(
                    (option) => normalizeTextKey(option) === normalizeTextKey(placement)
                  );

                  return (
                    <button
                      key={placement}
                      type="button"
                      className={`products-selection-chip ${isLegacy ? "is-legacy" : ""}`}
                      onClick={() => togglePlacement(placement)}
                    >
                      <span>{placement}</span>
                      <strong>×</strong>
                    </button>
                  );
                })
              ) : (
                <div className="products-selection-empty">No placements selected yet.</div>
              )}
            </div>

            {placementOptions.some(
              (placement) =>
                !placementLibrary.some(
                  (option) => normalizeTextKey(option) === normalizeTextKey(placement)
                )
            ) ? (
              <div className="products-legacy-note">
                Legacy placement values are preserved on existing products until you remove them.
              </div>
            ) : null}

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
            {searchTerm ||
            selectedCategory !== "all" ||
            selectedMethod !== "all" ||
            selectedStatus !== "all" ? (
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
                            <span>Brand / Model</span>
                            <strong>{product?.brand_model || "Not mapped yet"}</strong>
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
                            <span>Production</span>
                            <strong>
                              {product?.production_methods?.join(", ") || "None"}
                            </strong>
                          </div>

                          <div className="products-card-detail">
                            <span>Colors / Sizes</span>
                            <strong>
                              {(product?.colors?.length || 0)} colors • {(product?.sizes?.length || 0)} sizes
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
                  <h3 style={{ margin: 0 }}>No products found</h3>
                  <p style={{ margin: 0, color: "#64748b" }}>
                    Adjust your filters or create a new garment in the structured catalog editor.
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
