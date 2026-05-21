import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { garments } from "../data/garments";
import { findProductForGarment } from "../lib/orderConfiguration";
import { resolveProductBasePrice, useStoredProducts } from "../lib/productsStore";
import {
  getStorefrontCategoryById,
  getStorefrontProductImage,
  normalizeCategorySlug,
} from "../lib/storefrontCatalog";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatBasePrice(value) {
  return Number.isFinite(value) && Number(value) > 0
    ? `From ${money(value)} each`
    : "Price unavailable";
}

export default function GarmentView() {
  const { garmentId } = useParams();
  const catalogProducts = useStoredProducts();
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
        normalizeCategorySlug(selectedProduct?.category || garment?.category)
      ),
    [catalogProducts, garment?.category, selectedProduct?.category]
  );
  const detailTitle =
    garment?.display_name || selectedProduct?.name || "Catalog Product";
  const detailBrand =
    garment?.brand || selectedProduct?.brand_model || "Tee & Co";
  const detailDescription =
    garment?.description ||
    selectedProduct?.notes ||
    selectedProduct?.product_type ||
    "Custom garment configuration";
  const detailCategory =
    garment?.category || selectedProduct?.category || "Catalog";
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

  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 900);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  const imageSrc = garment?.image || getStorefrontProductImage(selectedProduct);
  const startingPrice = resolveProductBasePrice(selectedProduct);

  const decreaseQuantity = () => {
    setQuantity((prev) => Math.max(1, prev - 1));
  };

  const increaseQuantity = () => {
    setQuantity((prev) => prev + 1);
  };

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
          gridTemplateColumns: isMobile ? "1fr" : "340px minmax(0, 1fr)",
          gap: isMobile ? "14px" : "18px",
          alignItems: "start",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: "18px",
            padding: isMobile ? "14px" : "16px",
            border: "1px solid #e7e5e4",
            boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: isMobile ? "static" : "sticky",
            top: isMobile ? "auto" : "16px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: isMobile ? "100%" : "280px",
              aspectRatio: "1 / 1",
              borderRadius: "16px",
              overflow: "hidden",
              background: "#fafaf9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={imageSrc}
              alt={detailTitle}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
              }}
            />
          </div>

          <div
            style={{
              width: "100%",
              marginTop: "12px",
              padding: "12px",
              borderRadius: "14px",
              background: "#fafaf9",
              border: "1px solid #e7e5e4",
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
              Current Selection
            </p>
            <p style={{ margin: "3px 0", color: "#57534e", fontSize: "14px" }}>
              Color: {currentSelectedColor}
            </p>
            <p style={{ margin: "3px 0", color: "#57534e", fontSize: "14px" }}>
              Size: {currentSelectedSize}
            </p>
            <p style={{ margin: "3px 0", color: "#57534e", fontSize: "14px" }}>
              Quantity: {quantity}
            </p>
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: "18px",
            padding: isMobile ? "16px" : "20px",
            border: "1px solid #e7e5e4",
            boxShadow: "0 10px 24px rgba(0,0,0,0.05)",
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
              marginTop: "10px",
              padding: "12px 14px",
              borderRadius: "14px",
              background: "#fafaf9",
              border: "1px solid #e7e5e4",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: isMobile ? "16px" : "18px",
                fontWeight: 800,
                color: "#171717",
              }}
            >
              {formatBasePrice(startingPrice)}
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
              Available Print Locations
            </p>

            <p
              style={{
                margin: "0 0 8px 0",
              fontSize: "13px",
              color: "#78716c",
              lineHeight: 1.4,
            }}
          >
              These placements follow the garment's catalog configuration.
            </p>

            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              {(selectedProduct?.placement_config || []).map((placement) => (
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
