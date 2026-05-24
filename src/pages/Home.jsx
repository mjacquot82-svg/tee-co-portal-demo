import { Link } from "react-router-dom";
import { useMemo } from "react";
import NoImagePlaceholder from "../components/NoImagePlaceholder";
import { useCatalogLookups } from "../lib/catalogLookupsStore";
import {
  buildStorefrontCategories,
  getStorefrontProductImage,
  getStorefrontProducts,
} from "../lib/storefrontCatalog";
import { areStoredProductsReady, useStoredProducts } from "../lib/productsStore";

function buildStorefrontRenderIdentity(product, index) {
  const normalizedId = String(product?.id || "").trim();
  const normalizedName = String(product?.name || "").trim() || "catalog-product";
  const normalizedCategory =
    String(product?.storefront_category || product?.category || "").trim() || "catalog";

  return {
    id: normalizedId || null,
    key: normalizedId || `${normalizedName}-${normalizedCategory}-${index}`,
  };
}

function getCategoryHeroCopy(categoryCount) {
  if (!categoryCount) return "Start with a featured product";
  if (categoryCount === 1) return "Shop 1 category";
  return `Shop ${categoryCount} categories`;
}

export default function Home() {
  const storedProducts = useStoredProducts();
  const productsReady = areStoredProductsReady();
  const lookups = useCatalogLookups();
  const storefrontCategoryLookups = useMemo(
    () => lookups.storefront_categories || [],
    [lookups.storefront_categories]
  );
  const storefrontProducts = useMemo(
    () => getStorefrontProducts(storedProducts),
    [storedProducts]
  );
  const storefrontCategories = useMemo(
    () => buildStorefrontCategories(storedProducts, storefrontCategoryLookups),
    [storedProducts, storefrontCategoryLookups]
  );
  const featuredProducts = useMemo(
    () => storefrontProducts.slice(0, 6),
    [storefrontProducts]
  );

  const heroLink = storefrontCategories[0]
    ? `/category/${storefrontCategories[0].id}`
    : storefrontProducts[0]
      ? `/garment/${storefrontProducts[0].id}`
      : "/";

  return (
    <div
      style={{
        margin: "0 auto",
        padding: "18px 14px 36px",
        maxWidth: "1360px",
        fontFamily: '"Avenir Next", "Segoe UI", sans-serif',
        color: "#1f2937",
      }}
    >
      <section
        style={{
          marginBottom: "20px",
          borderRadius: "28px",
          padding: "20px 22px",
          background:
            "radial-gradient(circle at top left, rgba(241, 245, 249, 0.96) 0%, rgba(255, 255, 255, 0.98) 46%, rgba(254, 243, 199, 0.9) 100%)",
          border: "1px solid #e5e7eb",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.07)",
          display: "grid",
          gap: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "14px",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: "8px", maxWidth: "560px" }}>
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#92400e",
              }}
            >
              Tee & Co Storefront
            </p>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
                lineHeight: 1.02,
                letterSpacing: "-0.05em",
              }}
            >
              Shop the collection
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                lineHeight: 1.6,
                color: "#4b5563",
              }}
            >
              Browse curated categories, featured products, and easy starting points for custom merch.
            </p>
          </div>

          <div style={{ display: "grid", gap: "8px", minWidth: "220px" }}>
            <span style={{ color: "#6b7280", fontSize: "13px", fontWeight: 700 }}>
              {productsReady ? `${storefrontProducts.length} active products live` : "Loading catalog"}
            </span>
            <span style={{ color: "#6b7280", fontSize: "13px" }}>
              {storefrontCategories.length} collections
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <Link
            to={heroLink}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "46px",
              padding: "0 18px",
              borderRadius: "999px",
              background: "#111827",
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            {getCategoryHeroCopy(storefrontCategories.length)}
          </Link>
          {storefrontCategories.slice(0, 3).map((category) => (
            <Link
              key={category.id}
              to={`/category/${category.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: "42px",
                padding: "0 14px",
                borderRadius: "999px",
                textDecoration: "none",
                background: "rgba(255, 255, 255, 0.86)",
                border: "1px solid #e5e7eb",
                color: "#1f2937",
                fontWeight: 700,
              }}
            >
              {category.name}
            </Link>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: "28px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "14px",
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 4px",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#6b7280",
              }}
            >
              Browse Categories
            </p>
            <h2 style={{ margin: 0, fontSize: "28px", letterSpacing: "-0.04em" }}>
              Start with a collection
            </h2>
          </div>
          <span style={{ color: "#6b7280", fontSize: "14px" }}>
            Category-first storefront browsing
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
          }}
        >
          {storefrontCategories.map((category) => (
            <Link
              key={category.id}
              to={`/category/${category.id}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                borderRadius: "24px",
                padding: "18px",
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                boxShadow: "0 16px 36px rgba(15, 23, 42, 0.05)",
                display: "grid",
                gap: "14px",
                minHeight: "100%",
              }}
            >
              <div
                style={{
                  aspectRatio: "1 / 1",
                  borderRadius: "18px",
                  background: "linear-gradient(180deg, #f8fafc 0%, #f3f4f6 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {category.image ? (
                  <img
                    src={category.image}
                    alt={category.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <NoImagePlaceholder
                    style={{ borderRadius: "18px", width: "100%", height: "100%" }}
                    titleStyle={{ fontSize: "14px" }}
                    subtitleStyle={{ fontSize: "11px" }}
                  />
                )}
              </div>
              <div style={{ display: "grid", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <h3 style={{ margin: 0, fontSize: "18px" }}>{category.name}</h3>
                  <span style={{ color: "#92400e", fontWeight: 800, fontSize: "13px" }}>
                    {category.productCount}
                  </span>
                </div>
                <p style={{ margin: 0, color: "#6b7280", fontSize: "14px", lineHeight: 1.5 }}>
                  {category.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "14px",
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 4px",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#6b7280",
              }}
            >
              Featured Products
            </p>
            <h2 style={{ margin: 0, fontSize: "28px", letterSpacing: "-0.04em" }}>
              Product highlights
            </h2>
          </div>
          <span style={{ color: "#6b7280", fontSize: "14px" }}>
            A smaller curated grid under the category browse
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
          }}
        >
          {featuredProducts.map((product, index) => {
            const renderIdentity = buildStorefrontRenderIdentity(product, index);
            const imageSrc = getStorefrontProductImage(product);
            return (
              <Link
                key={renderIdentity.key}
                to={`/garment/${product.id}`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  borderRadius: "22px",
                  padding: "16px",
                  background: "#ffffff",
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 14px 28px rgba(15, 23, 42, 0.05)",
                  display: "grid",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    aspectRatio: "1 / 1",
                    borderRadius: "16px",
                    background: "#f8fafc",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt={product?.name || "Catalog product"}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  ) : (
                    <NoImagePlaceholder
                      style={{ borderRadius: "16px", width: "100%", height: "100%" }}
                      titleStyle={{ fontSize: "13px" }}
                      subtitleStyle={{ fontSize: "11px" }}
                    />
                  )}
                </div>
                <div style={{ display: "grid", gap: "5px" }}>
                  <span
                    style={{
                      color: "#92400e",
                      fontSize: "11px",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    {product?.storefront_category || product?.category || "Catalog"}
                  </span>
                  <h3 style={{ margin: 0, fontSize: "16px", lineHeight: 1.3 }}>
                    {product?.name || product?.product_type || "Catalog Product"}
                  </h3>
                  <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.5, color: "#6b7280" }}>
                    {product?.notes || product?.product_type || "Available for custom orders."}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
