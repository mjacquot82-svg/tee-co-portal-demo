import { Link, useParams } from "react-router-dom";
import { useMemo } from "react";
import NoImagePlaceholder from "../components/NoImagePlaceholder";
import {
  areStoredProductsReady,
  resolveProductBasePrice,
  useStoredProducts,
} from "../lib/productsStore";
import {
  getStorefrontCategoryById,
  getStorefrontProductImage,
  getStorefrontProductsByCategory,
} from "../lib/storefrontCatalog";

function formatBasePrice(value) {
  return Number.isFinite(value) && Number(value) > 0
    ? `From $${Number(value).toFixed(2)}`
    : "Price unavailable";
}

export default function CategoryView() {
  const { categoryId } = useParams();
  const storedProducts = useStoredProducts();
  const productsReady = areStoredProductsReady();
  const category = useMemo(
    () => getStorefrontCategoryById(storedProducts, categoryId),
    [categoryId, storedProducts]
  );
  const categoryProducts = useMemo(
    () => getStorefrontProductsByCategory(storedProducts, categoryId),
    [categoryId, storedProducts]
  );

  if (!productsReady) {
    return (
      <div
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          padding: "12px 14px 24px",
          fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      />
    );
  }

  if (!category) {
    return (
      <div
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          padding: "12px 14px 24px",
          fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <h1 style={{ marginTop: 0 }}>Category not found</h1>

        <Link to="/" style={{ color: "#171717" }}>
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding: "12px 14px 26px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ marginBottom: "14px" }}>
        <Link
          to="/"
          style={{
            color: "#57534e",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          ← Back to categories
        </Link>
      </div>

      <div style={{ marginBottom: "18px" }}>
        <h1
          style={{
            margin: "0 0 6px 0",
            fontSize: "24px",
            letterSpacing: "-0.02em",
          }}
        >
          {category.name}
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: "14px",
            color: "#78716c",
          }}
        >
          {category.description}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "16px",
        }}
      >
        {categoryProducts.map((item) => {
          const imageSrc = getStorefrontProductImage(item);
          return (
            <Link
              key={item.id}
              to={`/garment/${item.id}`}
              style={{
                textDecoration: "none",
                background: "#ffffff",
                borderRadius: "16px",
                padding: "14px",
                border: "1px solid #e7e5e4",
                boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
                color: "#171717",
                display: "block",
              }}
              >
                <div
                  style={{
                    width: "100%",
                  aspectRatio: "1 / 1",
                  background: "#fafaf9",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "10px",
                  padding: "10px",
                  overflow: "hidden",
                }}
                >
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt={item.name}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  ) : (
                    <NoImagePlaceholder
                      style={{ borderRadius: "12px" }}
                      titleStyle={{ fontSize: "13px" }}
                      subtitleStyle={{ fontSize: "11px" }}
                    />
                  )}
                </div>

              <h3
                style={{
                  margin: 0,
                  fontSize: "15px",
                  fontWeight: 700,
                  lineHeight: 1.25,
                }}
              >
                  {item.name}
                </h3>

              <p
                style={{
                  margin: "4px 0 0 0",
                  color: "#57534e",
                  fontSize: "13px",
                }}
              >
                  {item.notes || item.product_type || item.category}
                </p>

              <div style={{ marginTop: "8px" }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    fontWeight: 700,
                  }}
                >
                  {formatBasePrice(resolveProductBasePrice(item))}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
