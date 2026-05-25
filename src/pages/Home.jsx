import { Link } from "react-router-dom";
import { useMemo } from "react";
import NoImagePlaceholder from "../components/NoImagePlaceholder";
import { useCatalogLookups } from "../lib/catalogLookupsStore";
import {
  buildStorefrontCategories,
  getStorefrontProductCategoryLabel,
  getStorefrontProductImage,
  getStorefrontProducts,
} from "../lib/storefrontCatalog";
import { areStoredProductsReady, useStoredProducts } from "../lib/productsStore";

function buildStorefrontRenderIdentity(product, index) {
  const normalizedId = String(product?.id || "").trim();
  const normalizedName = String(product?.name || "").trim() || "catalog-product";
  const normalizedCategory = String(product?.storefront_category || "").trim() || "featured";

  return {
    id: normalizedId || null,
    key: normalizedId || `${normalizedName}-${normalizedCategory}-${index}`,
  };
}

function getHeroTitle(categoryCount) {
  if (!categoryCount) return "Start with featured picks";
  if (categoryCount === 1) return "Browse the storefront by collection";
  return "Browse the storefront by collection";
}

function getHeroCopy(primaryCollection) {
  if (primaryCollection) {
    return `Discover ${primaryCollection.name.toLowerCase()}, seasonal favorites, and storefront-ready merch organized for easy browsing.`;
  }

  return "Discover curated storefront favorites, seasonal highlights, and easy starting points for custom merch.";
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
    () => storefrontProducts.slice(0, 8),
    [storefrontProducts]
  );

  const primaryCollection = storefrontCategories[0] || null;
  const heroLink = primaryCollection
    ? `/category/${primaryCollection.id}`
    : storefrontProducts[0]
      ? `/garment/${storefrontProducts[0].id}`
      : "/";

  return (
    <div className="storefront-home">
      <section className="storefront-hero">
        <div className="storefront-hero-copy">
          <p className="storefront-eyebrow">Curated Storefront</p>
          <h1 className="storefront-hero-title">{getHeroTitle(storefrontCategories.length)}</h1>
          <p className="storefront-hero-body">{getHeroCopy(primaryCollection)}</p>

          <div className="storefront-hero-actions">
            <Link to={heroLink} className="storefront-hero-primary-link">
              {primaryCollection ? `Shop ${primaryCollection.name}` : "Shop featured picks"}
            </Link>

            {storefrontCategories.slice(0, 4).map((category) => (
              <Link key={category.id} to={`/category/${category.id}`} className="storefront-chip-link">
                {category.name}
              </Link>
            ))}
          </div>
        </div>

        <div className="storefront-hero-spotlight">
          <p className="storefront-spotlight-label">Featured Collection</p>
          <strong className="storefront-spotlight-title">
            {primaryCollection?.name || "Featured"}
          </strong>
          <p className="storefront-spotlight-copy">
            {primaryCollection?.description || "A storefront-first mix of current highlights and easy-entry favorites."}
          </p>
          <div className="storefront-spotlight-meta">
            <span>{primaryCollection?.productCountLabel || "Curated picks"}</span>
            <span>Storefront-first browsing</span>
          </div>
        </div>
      </section>

      <section className="storefront-section">
        <div className="storefront-section-header">
          <div>
            <p className="storefront-section-kicker">Browse Collections</p>
            <h2 className="storefront-section-title">Start with a category tile</h2>
          </div>
          <p className="storefront-section-note">Compact, visual entry points designed for browsing.</p>
        </div>

        <div className="storefront-collection-grid">
          {storefrontCategories.map((category) => (
            <Link key={category.id} to={`/category/${category.id}`} className="storefront-collection-card">
              <div className="storefront-collection-cover">
                {category.image ? (
                  <img
                    src={category.image}
                    alt={category.name}
                    className="storefront-collection-image"
                  />
                ) : (
                  <NoImagePlaceholder
                    style={{ borderRadius: "20px", width: "100%", height: "100%" }}
                    titleStyle={{ fontSize: "14px" }}
                    subtitleStyle={{ fontSize: "11px" }}
                  />
                )}
              </div>

              <div className="storefront-collection-meta">
                <div className="storefront-collection-heading">
                  <h3 className="storefront-collection-title">{category.name}</h3>
                  <span className="storefront-collection-count">{category.productCountLabel}</span>
                </div>
                <p className="storefront-collection-description">{category.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="storefront-section">
        <div className="storefront-section-header">
          <div>
            <p className="storefront-section-kicker">Featured Products</p>
            <h2 className="storefront-section-title">Current highlights</h2>
          </div>
          <p className="storefront-section-note">A tighter product rail beneath the category browse.</p>
        </div>

        <div className="storefront-featured-grid">
          {featuredProducts.map((product, index) => {
            const renderIdentity = buildStorefrontRenderIdentity(product, index);
            const imageSrc = getStorefrontProductImage(product);
            const categoryLabel = getStorefrontProductCategoryLabel(product, storefrontCategoryLookups);

            return (
              <Link
                key={renderIdentity.key}
                to={`/garment/${product.id}`}
                className="storefront-featured-card"
              >
                <div className="storefront-featured-image-shell">
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt={product?.name || "Catalog product"}
                      className="storefront-featured-image"
                    />
                  ) : (
                    <NoImagePlaceholder
                      style={{ borderRadius: "16px", width: "100%", height: "100%" }}
                      titleStyle={{ fontSize: "13px" }}
                      subtitleStyle={{ fontSize: "11px" }}
                    />
                  )}
                </div>

                <div className="storefront-featured-copy">
                  <span className="storefront-featured-category">{categoryLabel}</span>
                  <h3 className="storefront-featured-title">
                    {product?.name || "Catalog Product"}
                  </h3>
                  <p className="storefront-featured-description">
                    {product?.notes || "Available for custom orders."}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        {!productsReady && !featuredProducts.length ? (
          <p className="storefront-loading-copy">Loading storefront products...</p>
        ) : null}
      </section>
    </div>
  );
}
