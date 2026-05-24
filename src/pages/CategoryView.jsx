import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo } from "react";
import NoImagePlaceholder from "../components/NoImagePlaceholder";
import {
  areStoredProductsReady,
  resolveProductBasePrice,
  useStoredProducts,
} from "../lib/productsStore";
import { useCatalogLookups } from "../lib/catalogLookupsStore";
import {
  getStorefrontCategoryById,
  getStorefrontProductImage,
  getStorefrontProductsByCategory,
} from "../lib/storefrontCatalog";

function buildCategoryProductRenderIdentity(product, index) {
  const normalizedId = String(product?.id || "").trim();
  const normalizedName = String(product?.name || "").trim() || "catalog-product";
  const normalizedCategory = String(product?.category || "").trim() || "catalog";

  return {
    id: normalizedId || null,
    key: normalizedId || `${normalizedName}-${normalizedCategory}-${index}`,
    fallbackKeyUsed: !normalizedId,
  };
}

function formatBasePrice(value) {
  return Number.isFinite(value) && Number(value) > 0
    ? `From $${Number(value).toFixed(2)}`
    : "Price unavailable";
}

export default function CategoryView() {
  const { categoryId } = useParams();
  const storedProducts = useStoredProducts();
  const productsReady = areStoredProductsReady();
  const lookups = useCatalogLookups();
  const storefrontCategories = useMemo(
    () => lookups.storefront_categories || [],
    [lookups.storefront_categories]
  );
  const category = useMemo(
    () => getStorefrontCategoryById(storedProducts, categoryId, storefrontCategories),
    [categoryId, storedProducts, storefrontCategories]
  );
  const categoryProducts = useMemo(
    () => getStorefrontProductsByCategory(storedProducts, categoryId, storefrontCategories),
    [categoryId, storedProducts, storefrontCategories]
  );

  useEffect(() => {
    const duplicateCategoryIds = categoryProducts.reduce((summary, product, index) => {
      const normalizedId = String(product?.id || "").trim();
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

    console.info("[CategoryView] Category product render source", {
      categoryId,
      rawProductsArrayLength: storedProducts.length,
      filteredProductsArrayLength: categoryProducts.length,
      renderedProductCardCount: categoryProducts.length,
      duplicateCategoryIds: duplicateCategoryIds.duplicates,
      missingCategoryIds: duplicateCategoryIds.missingIds,
      productsBeforeRender: categoryProducts.map((product, index) => {
        const renderIdentity = buildCategoryProductRenderIdentity(product, index);
        return {
          index,
          id: product?.id || null,
          name: product?.name || "",
          status: product?.status || "",
          category: product?.storefront_category || product?.category || "",
          renderKey: renderIdentity.key,
          fallbackKeyUsed: renderIdentity.fallbackKeyUsed,
        };
      }),
    });
  }, [categoryId, categoryProducts, storedProducts.length]);

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
        maxWidth: "1240px",
        margin: "0 auto",
        padding: "18px 14px 32px",
        fontFamily:
          '"Avenir Next", "Segoe UI", sans-serif',
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

      <div
        style={{
          marginBottom: "18px",
          borderRadius: "24px",
          padding: "22px",
          background:
            "linear-gradient(180deg, rgba(248,250,252,0.96) 0%, rgba(255,255,255,0.98) 100%)",
          border: "1px solid #e5e7eb",
        }}
      >
        <h1
          style={{
            margin: "0 0 6px 0",
            fontSize: "32px",
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
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "16px",
        }}
      >
        {categoryProducts.map((item, index) => {
          const imageSrc = getStorefrontProductImage(item);
          const renderIdentity = buildCategoryProductRenderIdentity(item, index);
          console.info("[CategoryView] Rendering category product card", {
            index,
            id: item?.id || null,
            name: item?.name || "",
            status: item?.status || "",
            category: item?.storefront_category || item?.category || "",
            renderKey: renderIdentity.key,
            fallbackKeyUsed: renderIdentity.fallbackKeyUsed,
          });
          return (
            <Link
              key={renderIdentity.key}
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
