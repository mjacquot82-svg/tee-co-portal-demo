import { useMemo, useState } from "react";
import { normalizeGarmentText } from "../lib/garmentTextNormalization";

export const fieldStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "15px",
  width: "100%",
  boxSizing: "border-box",
  background: "#ffffff",
};

export const labelStyle = {
  display: "grid",
  gap: "8px",
  fontWeight: 700,
  color: "#292524",
};

export function normalizeText(value) {
  return normalizeGarmentText(value);
}

export function normalizeTextKey(value) {
  return normalizeText(value).toLowerCase();
}

export function normalizeListInput(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function uniqueList(values = []) {
  const seen = new Set();

  return values.filter((value) => {
    const key = normalizeTextKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function formatMoney(value, fallback = "Not set") {
  if (value === null || value === undefined || value === "") return fallback;

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return fallback;

  return `$${parsedValue.toFixed(2)}`;
}

export function parseOptionalPrice(value) {
  if (value === null || value === undefined || value === "") return null;

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return null;

  return Number(parsedValue.toFixed(2));
}

export function buildPlacementPriceMap(placements, existing = {}) {
  return placements.reduce((accumulator, placement) => {
    accumulator[placement] =
      existing?.[placement] === null || existing?.[placement] === undefined
        ? ""
        : String(existing[placement]);
    return accumulator;
  }, {});
}

export function buildMethodPriceMap(methods, existing = {}) {
  return methods.reduce((accumulator, method) => {
    accumulator[method] =
      existing?.[method] === null || existing?.[method] === undefined
        ? ""
        : String(existing[method]);
    return accumulator;
  }, {});
}

export function findLookupByName(options = [], value = "") {
  const normalizedValue = normalizeTextKey(value);
  if (!normalizedValue) return null;
  return options.find((option) => normalizeTextKey(option?.name) === normalizedValue) || null;
}

export function findLookupById(options = [], value = "") {
  return options.find((option) => option.id === value) || null;
}

export function buildGarmentModelLabel(model, brands = [], categories = []) {
  if (!model) return "";

  const brand = findLookupById(brands, model.brand_id);
  const category = findLookupById(categories, model.category_id);
  const parts = [brand?.name, model?.model_code, model?.display_name, category?.name].filter(Boolean);
  return parts.join(" · ");
}

export function buildLegacyBrandModelValue(brand, model, fallbackValue = "") {
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

export function resolveStructuredProductType(model, fallbackValue = "", nameFallback = "") {
  return model?.display_name || fallbackValue || nameFallback || "";
}

export function sortSizesByLookup(values = [], sizeLookups = []) {
  return [...uniqueList(values)].sort((left, right) => {
    const leftLookup = findLookupByName(sizeLookups, left);
    const rightLookup = findLookupByName(sizeLookups, right);
    return Number(leftLookup?.sort_order || 999) - Number(rightLookup?.sort_order || 999);
  });
}

export function buildGarmentLibraryLabel(item, brands = [], categories = [], garmentModels = []) {
  if (!item) return "";

  const model = findLookupById(garmentModels, item.garment_model_lookup_id);
  const brand = findLookupById(brands, item.brand_lookup_id || model?.brand_id);
  const category = findLookupById(categories, item.category_lookup_id);

  return [
    item.title,
    brand?.name,
    model?.model_code,
    category?.name,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function SearchableLookupField({
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
      return options.slice(0, 12);
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

export function MultiSelectLookupField({
  label,
  helperText,
  options,
  selectedValues,
  onToggle,
  onCreate,
  createLabel,
  createHelper,
  showColorSwatch = false,
  searchPlaceholder,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearch = normalizeTextKey(searchTerm);
  const selectedSet = new Set(selectedValues.map((value) => normalizeTextKey(value)));

  const filteredOptions = useMemo(() => {
    if (!normalizedSearch) return options;

    return options.filter((option) => {
      const labelValue = option?.name || "";
      const metaValue = option?.meta || "";
      return `${labelValue} ${metaValue}`.toLowerCase().includes(normalizedSearch);
    });
  }, [options, normalizedSearch]);

  const hasExactMatch = options.some(
    (option) => normalizeTextKey(option?.name) === normalizedSearch
  );

  return (
    <div className="products-multiselect">
      <div className="products-multiselect-header">
        <strong>{label}</strong>
        <p>{helperText}</p>
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
                className={`products-selection-chip ${matchedOption ? "" : "is-legacy"}`}
                onClick={() => onToggle(value)}
              >
                {showColorSwatch ? (
                  <span
                    className="products-selection-swatch"
                    style={{ background: matchedOption?.hex_code || matchedOption?.swatch || "#cbd5e1" }}
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
          placeholder={searchPlaceholder || `Search ${label.toLowerCase()}`}
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
                    style={{ background: option.hex_code || option.swatch || "#cbd5e1" }}
                  />
                ) : null}
                <span>{option.name}</span>
                {option.meta ? <small>{option.meta}</small> : null}
              </label>
            );
          })
        ) : (
          <div className="products-selection-empty">{createHelper}</div>
        )}
      </div>
    </div>
  );
}
