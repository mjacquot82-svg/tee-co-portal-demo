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

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatBasePrice(value) {
  return Number.isFinite(value) && Number(value) > 0
    ? `${money(value)} each`
    : "Price unavailable";
}

export default function GarmentView() {
  const { garmentId } = useParams();
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 900 : false
  );
  const catalogProducts = useStoredProducts();
  const productsReady = areStoredProductsReady();
  const lookups = useCatalogLookups();
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
  const availableColors =
    garment?.available_colors?.length
      ? garment.available_colors
      : selectedProduct?.colors?.length
      ? selectedProduct.colors
      : ["Black"];
  const availableSizes =
    garment?.available_sizes?.length
      ? garment.available_sizes
      : selectedProduct?.sizes?.length
      ? selectedProduct.sizes
      : ["One Size"];
  const currentSelectedColor = availableColors.includes(selectedColor)
    ? selectedColor
    : availableColors[0] || "";
  const currentSelectedSize = availableSizes.includes(selectedSize)
    ? selectedSize
    : availableSizes[0] || "";

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 900);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!availableColors.length) {
      setSelectedColor("");
      return;
    }

    if (!availableColors.includes(selectedColor)) {
      setSelectedColor(availableColors[0]);
    }
  }, [availableColors, selectedColor]);

  useEffect(() => {
    if (!availableSizes.length) {
      setSelectedSize("");
      return;
    }

    if (!availableSizes.includes(selectedSize)) {
      setSelectedSize(availableSizes[0]);
    }
  }, [availableSizes, selectedSize]);

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
        <Link to="/" style={{ color: "#171717" }}>
          Back to Home
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

  const decreaseQuantity = () => {
    setQuantity((prev) => Math.max(1, prev - 1));
  };

  const increaseQuantity = () => {
    setQuantity((prev) => prev + 1);
  };

  const categorySlug = storefrontCategory?.id || normalizeCategorySlug(detailCategory) || "catalog";
  const orderTotal = Number.isFinite(startingPrice) && startingPrice > 0 ? startingPrice * quantity : null;

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
            <p style={{ margin: "0 0 6px 0", color: "#57534e", fontSize: "14px" }}>
              Size: {currentSelectedSize}
            </p>
            <p style={{ margin: "0 0 6px 0", color: "#57534e", fontSize: "14px" }}>
              Quantity: {quantity}
            </p>
            <p style={{ margin: 0, color: "#57534e", fontSize: "14px" }}>
              Custom decoration included
            </p>
          </div>

          <div
            style={{
              width: "100%",
              borderRadius: "22px",
              background: "#171717",
              color: "#ffffff",
              padding: "20px",
              display: "grid",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "13px", opacity: 0.76 }}>Order Total</span>
            <strong style={{ fontSize: isMobile ? "30px" : "36px", lineHeight: 1 }}>
              {orderTotal !== null ? money(orderTotal) : "Price unavailable"}
            </strong>
            <span style={{ fontSize: "13px", opacity: 0.76 }}>
              Final decorated catalog pricing
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
                margin: "0 0 8px 0",
                fontSize: "15px",
              }}
            >
              Choose Color
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              {availableColors.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  style={{
                    padding: "9px 14px",
                    borderRadius: "999px",
                    border:
                      currentSelectedColor === color
                        ? "2px solid #171717"
                        : "1px solid #d6d3d1",
                    background:
                      currentSelectedColor === color ? "#171717" : "#ffffff",
                    color:
                      currentSelectedColor === color ? "#ffffff" : "#171717",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  {color}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: "18px" }}>
            <p
              style={{
                fontWeight: "700",
                margin: "0 0 8px 0",
                fontSize: "15px",
              }}
            >
              Choose Size
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              {availableSizes.map((size) => (
                <button
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  style={{
                    padding: "9px 12px",
                    borderRadius: "12px",
                    border:
                      currentSelectedSize === size
                        ? "2px solid #171717"
                        : "1px solid #d6d3d1",
                    background:
                      currentSelectedSize === size ? "#171717" : "#ffffff",
                    color:
                      currentSelectedSize === size ? "#ffffff" : "#171717",
                    cursor: "pointer",
                    fontWeight: 600,
                    minWidth: "60px",
                    fontSize: "14px",
                  }}
                >
                  {size}
                </button>
              ))}
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

          <div style={{ marginTop: "18px" }}>
            <p
              style={{
                fontWeight: "700",
                margin: "0 0 8px 0",
                fontSize: "15px",
              }}
            >
              Choose Quantity
            </p>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px",
                borderRadius: "14px",
                border: "1px solid #e7e5e4",
                background: "#fafaf9",
              }}
            >
              <button
                onClick={decreaseQuantity}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  border: "1px solid #d6d3d1",
                  background: "#ffffff",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "18px",
                  color: "#171717",
                }}
              >
                -
              </button>

              <span
                style={{
                  minWidth: "28px",
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: "15px",
                  color: "#171717",
                }}
              >
                {quantity}
              </span>

              <button
                onClick={increaseQuantity}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  border: "1px solid #d6d3d1",
                  background: "#ffffff",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "18px",
                  color: "#171717",
                }}
              >
                +
              </button>
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
                selectedSize: currentSelectedSize,
                quantity,
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
              Continue Order
            </Link>

            <Link
              to="/"
              style={{
                border: "1px solid #d6d3d1",
                color: "#171717",
                padding: "12px 16px",
                borderRadius: "12px",
                textDecoration: "none",
                background: "#ffffff",
                fontSize: "14px",
              }}
            >
              Back
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
