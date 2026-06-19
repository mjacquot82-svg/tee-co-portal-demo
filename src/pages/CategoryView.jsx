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
  getStorefrontProductCategoryLabel,
  getStorefrontProductsByCategory,
  resolveStorefrontProductImage,
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

function buildPreviewList(values = [], limit = 4) {
  const safeValues = Array.isArray(values) ? values.filter(Boolean) : [];
  return {
    visible: safeValues.slice(0, limit),
    remainingCount: Math.max(safeValues.length - limit, 0),
    totalCount: safeValues.length,
  };
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
          category: getStorefrontProductCategoryLabel(product, storefrontCategories),
          renderKey: renderIdentity.key,
          fallbackKeyUsed: renderIdentity.fallbackKeyUsed,
        };
      }),
    });
  }, [categoryId, categoryProducts, storefrontCategories, storedProducts.length]);

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
            margin: "0 0 10px",
            fontSize: "14px",
            color: "#78716c",
          }}
        >
          {category.description}
        </p>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: "34px",
            borderRadius: "999px",
            padding: "0 12px",
            background: "#f3f4f6",
            color: "#374151",
            fontSize: "12px",
            fontWeight: 800,
          }}
        >
          {category.productCountLabel}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "16px",
        }}
      >
        {categoryProducts.map((item, index) => {
          const productImage = resolveStorefrontProductImage(item, { size: "thumb" });
          const renderIdentity = buildCategoryProductRenderIdentity(item, index);
          const colorPreview = buildPreviewList(item?.colors, 4);
          const sizePreview = buildPreviewList(item?.sizes, 6);
          const categoryLabel = getStorefrontProductCategoryLabel(item, storefrontCategories);
          console.info("[CategoryView] Rendering category product card", {
            index,
            id: item?.id || null,
            name: item?.name || "",
            status: item?.status || "",
            category: categoryLabel,
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
                borderRadius: "20px",
                padding: "14px",
                border: "1px solid #e7e5e4",
                boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
                color: "#171717",
                display: "grid",
                gap: "12px",
              }}
            >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    background: "#fafaf9",
                    borderRadius: "14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "10px",
                    overflow: "hidden",
                  }}
                >
                  {productImage.src ? (
                    <img
                      src={productImage.src}
                      alt={productImage.alt}
                      width="320"
                      height="320"
                      loading="lazy"
                      decoding="async"
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

              <div style={{ display: "grid", gap: "5px" }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: 700,
                    lineHeight: 1.25,
                  }}
                >
                  {item.name}
                </h3>

                <p
                  style={{
                    margin: 0,
                    color: "#57534e",
                    fontSize: "13px",
                    lineHeight: 1.45,
                  }}
                >
                  {item.notes || `${categoryLabel} ready for custom orders.`}
                </p>
              </div>

              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    fontWeight: 700,
                  }}
                >
                  {formatBasePrice(resolveProductBasePrice(item))}
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: "999px",
                    padding: "6px 10px",
                    fontSize: "11px",
                    fontWeight: 800,
                    background: "#fff7ed",
                    color: "#9a3412",
                  }}
                >
                  {colorPreview.totalCount || 0} colors
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: "999px",
                    padding: "6px 10px",
                    fontSize: "11px",
                    fontWeight: 800,
                    background: "#f5f3ff",
                    color: "#5b21b6",
                  }}
                >
                  {sizePreview.totalCount || 0} sizes
                </span>
              </div>

              {colorPreview.totalCount ? (
                <div style={{ display: "grid", gap: "6px" }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "11px",
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "#78716c",
                    }}
                  >
                    Available Colors
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {colorPreview.visible.map((color) => (
                      <span
                        key={color}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          borderRadius: "999px",
                          padding: "5px 9px",
                          fontSize: "11px",
                          fontWeight: 700,
                          background: "#fafaf9",
                          border: "1px solid #e7e5e4",
                          color: "#292524",
                        }}
                      >
                        {color}
                      </span>
                    ))}
                    {colorPreview.remainingCount ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          borderRadius: "999px",
                          padding: "5px 9px",
                          fontSize: "11px",
                          fontWeight: 700,
                          background: "#f5f5f4",
                          color: "#57534e",
                        }}
                      >
                        +{colorPreview.remainingCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {sizePreview.totalCount ? (
                <div style={{ display: "grid", gap: "6px" }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "11px",
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "#78716c",
                    }}
                  >
                    Sizes
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {sizePreview.visible.map((size) => (
                      <span
                        key={size}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: "32px",
                          borderRadius: "999px",
                          padding: "5px 9px",
                          fontSize: "11px",
                          fontWeight: 700,
                          background: "#f8fafc",
                          border: "1px solid #dbe4ee",
                          color: "#0f172a",
                        }}
                      >
                        {size}
                      </span>
                    ))}
                    {sizePreview.remainingCount ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: "32px",
                          borderRadius: "999px",
                          padding: "5px 9px",
                          fontSize: "11px",
                          fontWeight: 700,
                          background: "#f1f5f9",
                          color: "#475569",
                        }}
                      >
                        +{sizePreview.remainingCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
