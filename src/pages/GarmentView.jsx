import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import NoImagePlaceholder from "../components/NoImagePlaceholder";
import { garments } from "../data/garments";
import { findProductForGarment } from "../lib/orderConfiguration";
import {
  areStoredProductsReady,
  resolveProductBasePrice,
  useStoredProducts,
} from "../lib/productsStore";
import { useCatalogLookups } from "../lib/catalogLookupsStore";
import {
  getStorefrontCategoryById,
  getStorefrontProductCategoryLabel,
  normalizeCategorySlug,
  resolveStorefrontProductImage,
} from "../lib/storefrontCatalog";
import {
  resolveProductDisplayColors,
  useGarmentModelColors,
} from "../lib/garmentModelColorsStore";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatBasePrice(value) {
  return Number.isFinite(value) && Number(value) > 0
    ? `${money(value)} each`
    : "Price unavailable";
}

function normalizeText(value) {
  return String(value || "").trim();
}

const FALLBACK_SWATCH_COLORS = Object.freeze({
  black: "#111111",
  white: "#ffffff",
  navy: "#1f2a44",
  royal: "#1d4ed8",
  red: "#dc2626",
  maroon: "#7f1d1d",
  "forest green": "#166534",
  "kelly green": "#16a34a",
  orange: "#f97316",
  gold: "#fbbf24",
  purple: "#7e22ce",
  charcoal: "#374151",
  "sport grey": "#9ca3af",
  "athletic grey heather": "#a3a3a3",
  "heather grey": "#9ca3af",
  sand: "#d6c7a1",
  ivory: "#fffff0",
  sapphire: "#0ea5e9",
  "carolina blue": "#7dd3fc",
  "light blue": "#bfdbfe",
  "safety green": "#84cc16",
  "safety orange": "#fb923c",
  "safety pink": "#f9a8d4",
});

function isValidHexColor(value) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalizeText(value));
}

function resolveSwatchDisplayColor(colorRecord = {}) {
  if (isValidHexColor(colorRecord.hex_value)) {
    return normalizeText(colorRecord.hex_value);
  }

  const colorNameKey = normalizeText(colorRecord.color_name).toLowerCase();
  return FALLBACK_SWATCH_COLORS[colorNameKey] || null;
}

function buildFallbackColorRecords(colorNames = [], keyPrefix = "fallback") {
  return colorNames
    .map((colorName, index) => {
      const normalizedColorName = normalizeText(colorName);
      if (!normalizedColorName) return null;

      return {
        id: `${keyPrefix}-${index}-${normalizedColorName}`,
        color_name: normalizedColorName,
        hex_value: null,
      };
    })
    .filter(Boolean);
}

export default function GarmentView() {
  const { garmentId } = useParams();
  const [selectedColor, setSelectedColor] = useState("");
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 900 : false
  );
  const catalogProducts = useStoredProducts();
  const productsReady = areStoredProductsReady();
  const lookups = useCatalogLookups();
  const colorsByGarmentModel = useGarmentModelColors();
  const storefrontCategories = useMemo(
    () => lookups.storefront_categories || [],
    [lookups.storefront_categories]
  );
  const productById = useMemo(
    () => catalogProducts.find((product) => product.id === garmentId) || null,
    [catalogProducts, garmentId]
  );
  const garment = useMemo(
    () => garments.find((g) => g.garment_id === garmentId) || null,
    [garmentId]
  );
  const selectedProduct = useMemo(
    () => productById || findProductForGarment(catalogProducts, garment),
    [catalogProducts, garment, productById]
  );
  const storefrontCategory = useMemo(
    () =>
      getStorefrontCategoryById(
        catalogProducts,
        normalizeCategorySlug(
          getStorefrontProductCategoryLabel(selectedProduct, storefrontCategories) || garment?.category
        ),
        storefrontCategories
      ),
    [catalogProducts, garment?.category, selectedProduct, storefrontCategories]
  );
  const detailTitle =
    garment?.display_name || selectedProduct?.name || "Catalog Product";
  const detailBrand =
    garment?.brand || selectedProduct?.brand_model || "Tee & Co";
  const detailDescription =
    garment?.description ||
    selectedProduct?.notes ||
    "Custom garment configuration";
  const storefrontCategoryLabel = getStorefrontProductCategoryLabel(
    selectedProduct,
    storefrontCategories
  );
  const detailCategory =
    storefrontCategory?.name ||
    storefrontCategoryLabel ||
    garment?.category ||
    "Uncategorized";
  const displayColorDetails = useMemo(() => {
    const productColors = selectedProduct
      ? resolveProductDisplayColors(selectedProduct, colorsByGarmentModel)
      : { colors: [], colorNames: [] };

    if (productColors.colorNames.length) {
      return productColors;
    }

    const garmentColorRecords = buildFallbackColorRecords(
      garment?.available_colors || [],
      garment?.garment_id || "garment"
    );

    if (garmentColorRecords.length) {
      return {
        source: "garments.available_colors",
        colors: garmentColorRecords,
        colorNames: garmentColorRecords.map((color) => color.color_name),
      };
    }

    const defaultColorRecords = buildFallbackColorRecords(["Black"], "default");
    return {
      source: "default",
      colors: defaultColorRecords,
      colorNames: defaultColorRecords.map((color) => color.color_name),
    };
  }, [colorsByGarmentModel, garment, selectedProduct]);
  const availableColorRecords = displayColorDetails.colors;
  const availableColors = displayColorDetails.colorNames;
  const availableSizes = useMemo(
    () =>
      garment?.available_sizes?.length
        ? garment.available_sizes
        : selectedProduct?.sizes?.length
        ? selectedProduct.sizes
        : ["One Size"],
    [garment, selectedProduct]
  );
  const currentSelectedColor = availableColors.includes(selectedColor)
    ? selectedColor
    : availableColors[0] || "";

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 900);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!productsReady && !garment) {
    return (
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "16px 20px 24px",
          fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <p style={{ margin: 0, color: "#57534e", fontSize: "14px" }}>
          Loading product details...
        </p>
      </div>
    );
  }

  if (!garment && !selectedProduct) {
    return (
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "16px 20px 24px",
          fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <h1 style={{ marginTop: 0 }}>Garment not found</h1>
        <Link to="/" className="storefront-back-link">
          ← Back to Home
        </Link>
      </div>
    );
  }

  const productImage = resolveStorefrontProductImage(selectedProduct, {
    alt: detailTitle,
    size: "medium",
  });
  const imageSrc = garment?.image || productImage.src;
  const startingPrice = resolveProductBasePrice(selectedProduct);
  const availablePlacements =
    selectedProduct?.placement_config?.length
      ? selectedProduct.placement_config
      : (garment?.placements_allowed || []).map((label) => ({ id: label, label }));

  const categorySlug = storefrontCategory?.id || normalizeCategorySlug(detailCategory) || "catalog";

  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: isMobile ? "10px 14px 20px" : "12px 20px 24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ marginBottom: isMobile ? "12px" : "14px" }}>
        <Link to={`/category/${categorySlug}`} className="storefront-back-link">
          ← Back to {detailCategory}
        </Link>
      </div>

      <div
        style={{
          marginBottom: isMobile ? "10px" : "12px",
          fontSize: isMobile ? "12px" : "13px",
          color: "#78716c",
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Link
          to="/"
          style={{
            color: "#57534e",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Home
        </Link>
        <span>/</span>
        <Link
          to={`/category/${categorySlug}`}
          style={{
            color: "#57534e",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {detailCategory}
        </Link>
        <span>/</span>
        <span style={{ color: "#171717", fontWeight: 700 }}>
          {detailTitle}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "420px minmax(0, 1fr)",
          gap: isMobile ? "18px" : "28px",
          alignItems: "start",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: "26px",
            padding: isMobile ? "18px" : "24px",
            border: "1px solid #ece7e1",
            boxShadow: "0 18px 40px rgba(28, 25, 23, 0.06)",
            display: "flex",
            flexDirection: "column",
            position: isMobile ? "static" : "sticky",
            top: isMobile ? "auto" : "16px",
            gap: "18px",
          }}
        >
          <div
            style={{
              width: "100%",
              aspectRatio: "1 / 1",
              borderRadius: "24px",
              overflow: "hidden",
              background: "linear-gradient(180deg, #fbf7f2 0%, #f5efe7 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #f0e7dd",
            }}
          >
            {imageSrc ? (
              <img
                src={imageSrc}
                alt={garment?.image ? detailTitle : productImage.alt}
                width="800"
                height="800"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            ) : (
              <NoImagePlaceholder
                style={{ borderRadius: "24px" }}
                titleStyle={{ fontSize: isMobile ? "16px" : "18px" }}
                subtitleStyle={{ fontSize: isMobile ? "12px" : "13px" }}
              />
            )}
          </div>

          <div
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "18px",
              borderRadius: "20px",
              background: "#fcfaf7",
              border: "1px solid #eee7df",
            }}
          >
            <p
              style={{
                margin: "0 0 6px 0",
                fontWeight: "700",
                fontSize: "14px",
                color: "#171717",
              }}
            >
              Order Summary
            </p>
            <p style={{ margin: "0 0 6px 0", color: "#57534e", fontSize: "14px" }}>
              Color: {currentSelectedColor}
            </p>
            <p style={{ margin: 0, color: "#57534e", fontSize: "14px" }}>
              Sizes, quantities, decoration, artwork, and notes are configured next.
            </p>
          </div>

          <div
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: "22px",
              background: "#171717",
              color: "#ffffff",
              padding: "20px",
              display: "grid",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "13px", opacity: 0.76 }}>Starting Price</span>
            <strong style={{ fontSize: isMobile ? "30px" : "36px", lineHeight: 1 }}>
              {formatBasePrice(startingPrice)}
            </strong>
            <span style={{ fontSize: "13px", opacity: 0.76 }}>
              Per garment; quantities are configured next
            </span>
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: "26px",
            padding: isMobile ? "20px" : "28px",
            border: "1px solid #ece7e1",
            boxShadow: "0 18px 40px rgba(28, 25, 23, 0.06)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#78716c",
            }}
          >
            {detailBrand}
          </p>

          <h1
            style={{
              marginTop: "6px",
              marginBottom: "8px",
              fontSize: isMobile ? "20px" : "26px",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            {detailTitle}
          </h1>

          <p
            style={{
              margin: "0 0 8px 0",
              color: "#57534e",
              lineHeight: 1.5,
              fontSize: isMobile ? "14px" : "15px",
            }}
          >
            {detailDescription}
          </p>

          <div
            style={{
              marginTop: "18px",
              padding: "18px 20px",
              borderRadius: "20px",
              background: "#fcfaf7",
              border: "1px solid #eee7df",
              display: "grid",
              gap: "4px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: "#78716c",
              }}
            >
              Decorated Price
            </p>
            <p
              style={{
                margin: 0,
                fontSize: isMobile ? "24px" : "28px",
                fontWeight: 800,
                color: "#171717",
                letterSpacing: "-0.03em",
              }}
            >
              {formatBasePrice(startingPrice)}
            </p>
            <p style={{ margin: 0, color: "#78716c", fontSize: "13px" }}>
              Final customer pricing with custom decoration included.
            </p>
          </div>

          <div style={{ marginTop: "18px" }}>
            <p
              style={{
                fontWeight: "700",
                margin: "0 0 6px 0",
                fontSize: "15px",
              }}
            >
              Choose Color
            </p>

            <p
              style={{
                margin: "0 0 10px 0",
                fontSize: "13px",
                color: "#57534e",
                fontWeight: 600,
              }}
            >
              Selected: {currentSelectedColor}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
                gap: isMobile ? "10px" : "8px",
                alignItems: "stretch",
              }}
            >
              {availableColorRecords.map((colorRecord) => {
                const colorName = colorRecord.color_name;
                const isSelected = currentSelectedColor === colorName;
                const displayColor = resolveSwatchDisplayColor(colorRecord);
                const hasDisplayColor = Boolean(displayColor);

                return (
                  <button
                    key={colorRecord.id || colorName}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedColor(colorName)}
                    style={{
                      minHeight: isMobile ? "48px" : "44px",
                      padding: "8px 10px",
                      borderRadius: "14px",
                      border: isSelected ? "2px solid #171717" : "1px solid #d6d3d1",
                      background: isSelected ? "#171717" : "#ffffff",
                      color: isSelected ? "#ffffff" : "#171717",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: "13px",
                      lineHeight: 1.2,
                      display: "flex",
                      alignItems: "center",
                      gap: "9px",
                      textAlign: "left",
                      boxShadow: isSelected
                        ? "0 8px 18px rgba(23, 23, 23, 0.16)"
                        : "0 1px 2px rgba(23, 23, 23, 0.04)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: "24px",
                        height: "24px",
                        flex: "0 0 24px",
                        borderRadius: "999px",
                        background: hasDisplayColor ? displayColor : "#f5f5f4",
                        border: hasDisplayColor ? "1px solid #a8a29e" : "1px solid #d6d3d1",
                        boxShadow: isSelected ? "0 0 0 2px rgba(255,255,255,0.68)" : "none",
                      }}
                    />
                    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                      {colorName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: "18px" }}>
            <p
              style={{
                fontWeight: "700",
                margin: "0 0 6px 0",
                fontSize: "15px",
              }}
            >
              Decoration Options
            </p>

            <p
              style={{
                margin: "0 0 8px 0",
              fontSize: "13px",
              color: "#78716c",
              lineHeight: 1.4,
            }}
          >
              Decoration details are handled with your order. Pricing does not change by location.
            </p>

            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              {availablePlacements.map((placement) => (
                <span
                  key={placement.id || placement.label}
                  style={{
                    fontSize: "12px",
                    padding: "7px 10px",
                    borderRadius: "999px",
                    background: "#fafaf9",
                    border: "1px solid #e7e5e4",
                    color: "#44403c",
                  }}
                >
                  {placement.label}
                </span>
              ))}
              {!availablePlacements.length ? (
                <span
                  style={{
                    fontSize: "12px",
                    padding: "7px 10px",
                    borderRadius: "999px",
                    background: "#fafaf9",
                    border: "1px solid #e7e5e4",
                    color: "#78716c",
                  }}
                >
                  Decoration details available during order review
                </span>
              ) : null}
            </div>
          </div>

          <div
            style={{
              marginTop: "20px",
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <Link
              to="/order-preview"
              state={{
                garmentId: garment?.garment_id || "",
                productId: selectedProduct?.id || garment?.product_id || "",
                garmentName: detailTitle,
                brand: detailBrand,
                category: detailCategory,
                description: detailDescription,
                imageSrc,
                selectedColor: currentSelectedColor,
                availableSizes,
              }}
              style={{
                background: "#171717",
                color: "#ffffff",
                padding: "12px 16px",
                borderRadius: "12px",
                textDecoration: "none",
                fontWeight: "700",
                boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
                fontSize: "14px",
              }}
            >
              Continue to Configure Garment
            </Link>

            <Link
              to="/"
              className="storefront-back-link"
            >
              ← Back
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
