import { Link } from "react-router-dom";
import { useMemo } from "react";
import NoImagePlaceholder from "../components/NoImagePlaceholder";
import { useCatalogLookups } from "../lib/catalogLookupsStore";
import {
  buildStorefrontCategories,
  getFeaturedStorefrontProducts,
  getHeroStorefrontProduct,
  getStorefrontProductCategoryLabel,
  getStorefrontProductImage,
  getStorefrontProducts,
} from "../lib/storefrontCatalog";
import { areStoredProductsReady, useStoredProducts } from "../lib/productsStore";

function buildStorefrontRenderIdentity(product, index) {
  const normalizedId = String(product?.id || "").trim();
  const normalizedName = String(product?.name || "").trim() || "catalog-product";
  const normalizedCategory =
    String(product?.storefront_category || product?.category || "").trim() || "uncategorized";

  return {
    id: normalizedId || null,
    key: normalizedId || `${normalizedName}-${normalizedCategory}-${index}`,
  };
}

function buildHeroTitle(hasHeroProduct, categoryCount) {
  if (hasHeroProduct) return "Curated merch, spotlighted intentionally";
  if (categoryCount > 1) return "Browse collections built for real storefront shopping";
  return "Browse the storefront by collection";
}

function buildHeroCopy(hasHeroProduct, heroCollection) {
  if (hasHeroProduct && heroCollection?.name) {
    return `Start with hand-picked highlights, then move through ${heroCollection.name.toLowerCase()} and the rest of the storefront collections.`;
  }

  if (heroCollection?.name) {
    return `Explore ${heroCollection.name.toLowerCase()}, seasonal drops, and storefront-ready merch organized for easy browsing.`;
  }

  return "Explore curated storefront favorites, seasonal highlights, and collection-led browsing paths.";
}

function buildFeaturedSectionNote(featuredCount) {
  if (featuredCount > 0) {
    return "Manual featured picks for rails, grids, promotions, and curated discovery. Hero spotlighting stays separate.";
  }

  return "Featured product slots stay reserved for owner-curated picks. Browse the live collections below in the meantime.";
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
    () => getFeaturedStorefrontProducts(storedProducts, 8),
    [storedProducts]
  );
  const heroFeaturedProduct = useMemo(
    () => getHeroStorefrontProduct(storedProducts),
    [storedProducts]
  );
  const collectionHighlights = useMemo(
    () => storefrontCategories.filter((category) => category?.productCount > 0).slice(0, 3),
    [storefrontCategories]
  );
  const merchandisingRows = useMemo(
    () =>
      storefrontCategories
        .filter((category) => category?.productCount > 0)
        .slice(0, 4)
        .map((category) => ({
          ...category,
          previewProducts: category.products.slice(0, 4),
        })),
    [storefrontCategories]
  );

  const primaryCollection = collectionHighlights[0] || null;
  const heroProduct =
    heroFeaturedProduct || primaryCollection?.products?.[0] || storefrontProducts[0] || null;
  const heroCollection =
    collectionHighlights.find((category) =>
      category.products.some((product) => product?.id && product.id === heroProduct?.id)
    ) || primaryCollection;
  const heroProductCategoryLabel = heroProduct
    ? getStorefrontProductCategoryLabel(heroProduct, storefrontCategoryLookups)
    : heroCollection?.name || "Uncategorized";
  const heroLink = heroProduct
    ? `/garment/${heroProduct.id}`
    : heroCollection
      ? `/category/${heroCollection.id}`
      : "/";

  return (
    <div className="storefront-home">
      <div className="storefront-shell">
        <aside className="storefront-rail" aria-label="Storefront category navigation">
          <div className="storefront-rail-card">
            <p className="storefront-rail-kicker">Browse</p>
            <h2 className="storefront-rail-title">Collections</h2>
            <p className="storefront-rail-copy">
              Start with a category, then move into curated homepage highlights and featured storefront picks.
            </p>
          </div>

          <nav className="storefront-rail-card storefront-rail-nav">
            <a href="#storefront-featured" className="storefront-rail-link">
              <span>Featured</span>
              <span className="storefront-rail-count">{featuredProducts.length || "New"}</span>
            </a>

            {storefrontCategories.map((category) => (
              <Link
                key={category.id}
                to={`/category/${category.id}`}
                className="storefront-rail-link"
              >
                <span>{category.name}</span>
                <span className="storefront-rail-count">{category.productCount}</span>
              </Link>
            ))}
          </nav>

          <div className="storefront-rail-card storefront-rail-promo">
            <p className="storefront-rail-kicker">Storefront</p>
            <strong>{storefrontCategories.length || 0} live collections</strong>
            <span>{featuredProducts.length || 0} featured picks</span>
          </div>
        </aside>

        <main className="storefront-merch">
          <section className="storefront-merch-hero">
            <div className="storefront-merch-hero-copy">
              <p className="storefront-eyebrow">Curated Storefront</p>
              <h1 className="storefront-merch-hero-title">
                {buildHeroTitle(Boolean(heroFeaturedProduct), storefrontCategories.length)}
              </h1>
              <p className="storefront-merch-hero-body">
                {buildHeroCopy(Boolean(heroFeaturedProduct), heroCollection)}
              </p>

              <div className="storefront-merch-hero-actions">
                <Link to={heroLink} className="storefront-merch-primary-link">
                  {heroProduct ? `Shop ${heroProduct.name}` : "Browse collections"}
                </Link>

                {collectionHighlights.slice(0, 3).map((category) => (
                  <Link
                    key={category.id}
                    to={`/category/${category.id}`}
                    className="storefront-chip-link"
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>

            <Link to={heroLink} className="storefront-merch-hero-product">
              <div className="storefront-merch-hero-visual">
                {heroProduct && getStorefrontProductImage(heroProduct) ? (
                  <img
                    src={getStorefrontProductImage(heroProduct)}
                    alt={heroProduct?.name || "Featured product"}
                    className="storefront-merch-hero-image"
                  />
                ) : (
                  <NoImagePlaceholder
                    style={{ borderRadius: "26px", width: "100%", height: "100%" }}
                    titleStyle={{ fontSize: "15px" }}
                    subtitleStyle={{ fontSize: "11px" }}
                  />
                )}
              </div>

              <div className="storefront-merch-hero-meta">
                <span className="storefront-featured-category">{heroProductCategoryLabel}</span>
                <h2 className="storefront-merch-hero-product-title">
                  {heroProduct?.name || heroCollection?.name || "Storefront highlight"}
                </h2>
                <p className="storefront-merch-hero-product-copy">
                  {heroProduct?.notes ||
                    heroCollection?.description ||
                    "Browse this collection for current highlights and storefront-ready merch."}
                </p>
                <div className="storefront-merch-hero-tags">
                  <span>{heroCollection?.productCountLabel || "Curated picks"}</span>
                  <span>
                    {heroFeaturedProduct
                      ? "Hero feature by owner"
                      : featuredProducts.length > 0
                        ? "Featured by owner"
                        : "Collection-led browse"}
                  </span>
                </div>
              </div>
            </Link>
          </section>

          <section
            className="storefront-mobile-category-nav"
            aria-labelledby="storefront-mobile-category-nav-title"
          >
            <div className="storefront-mobile-category-nav-header">
              <div>
                <p className="storefront-section-kicker">All Collections</p>
                <h2
                  id="storefront-mobile-category-nav-title"
                  className="storefront-mobile-category-nav-title"
                >
                  Browse every category
                </h2>
              </div>
              <span className="storefront-mobile-category-nav-count">
                {storefrontCategories.length || 0} collections
              </span>
            </div>

            <nav className="storefront-mobile-category-nav-links" aria-label="All storefront categories">
              {storefrontCategories.map((category) => (
                <Link
                  key={category.id}
                  to={`/category/${category.id}`}
                  className="storefront-mobile-category-link"
                >
                  <span>{category.name}</span>
                  <span className="storefront-mobile-category-count">{category.productCount}</span>
                </Link>
              ))}
            </nav>
          </section>

          <section className="storefront-section" id="storefront-featured">
            <div className="storefront-section-header">
              <div>
                <p className="storefront-section-kicker">Featured Products</p>
                <h2 className="storefront-section-title">Homepage merchandising picks</h2>
              </div>
              <p className="storefront-section-note">
                {buildFeaturedSectionNote(featuredProducts.length)}
              </p>
            </div>

            {featuredProducts.length ? (
              <div className="storefront-featured-grid storefront-featured-grid-wide">
                {featuredProducts.map((product, index) => {
                  const renderIdentity = buildStorefrontRenderIdentity(product, index);
                  const imageSrc = getStorefrontProductImage(product);
                  const categoryLabel = getStorefrontProductCategoryLabel(
                    product,
                    storefrontCategoryLookups
                  );

                  return (
                    <Link
                      key={renderIdentity.key}
                      to={`/garment/${product.id}`}
                      className="storefront-featured-card storefront-featured-card-vertical"
                    >
                      <div className="storefront-featured-image-shell storefront-featured-image-shell-large">
                        {imageSrc ? (
                          <img
                            src={imageSrc}
                            alt={product?.name || "Catalog product"}
                            className="storefront-featured-image"
                          />
                        ) : (
                          <NoImagePlaceholder
                            style={{ borderRadius: "18px", width: "100%", height: "100%" }}
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
            ) : (
              <div className="storefront-empty-merch-state">
                <strong>Curated product highlights will land here.</strong>
                <p>For now, shop the collection-led browse below.</p>
              </div>
            )}
          </section>

          <section className="storefront-section">
            <div className="storefront-section-header">
              <div>
                <p className="storefront-section-kicker">Featured Collections</p>
                <h2 className="storefront-section-title">Start with a collection</h2>
              </div>
              <p className="storefront-section-note">
                Category-first entry points keep the storefront easy to browse as the catalog grows.
              </p>
            </div>

            <div className="storefront-collection-grid storefront-collection-grid-highlighted">
              {collectionHighlights.map((category) => (
                <Link
                  key={category.id}
                  to={`/category/${category.id}`}
                  className="storefront-collection-card storefront-collection-card-highlighted"
                >
                  <div className="storefront-collection-cover storefront-collection-cover-highlighted">
                    {category.image ? (
                      <img
                        src={category.image}
                        alt={category.name}
                        className="storefront-collection-image"
                      />
                    ) : (
                      <NoImagePlaceholder
                        style={{ borderRadius: "22px", width: "100%", height: "100%" }}
                        titleStyle={{ fontSize: "14px" }}
                        subtitleStyle={{ fontSize: "11px" }}
                      />
                    )}
                  </div>

                  <div className="storefront-collection-meta">
                    <div className="storefront-collection-heading">
                      <h3 className="storefront-collection-title">{category.name}</h3>
                      <span className="storefront-collection-count">
                        {category.productCountLabel}
                      </span>
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
                <p className="storefront-section-kicker">Shop by Category</p>
                <h2 className="storefront-section-title">Collection browse rails</h2>
              </div>
              <p className="storefront-section-note">
                Compact product previews keep browsing visual without falling back to a generic grid.
              </p>
            </div>

            <div className="storefront-category-rows">
              {merchandisingRows.map((category) => (
                <section
                  key={category.id}
                  className="storefront-category-row"
                  aria-labelledby={`collection-row-${category.id}`}
                >
                  <div className="storefront-category-row-header">
                    <div>
                      <h3
                        id={`collection-row-${category.id}`}
                        className="storefront-category-row-title"
                      >
                        {category.name}
                      </h3>
                      <p className="storefront-category-row-copy">{category.description}</p>
                    </div>
                    <Link
                      to={`/category/${category.id}`}
                      className="storefront-category-row-link"
                    >
                      Shop collection
                    </Link>
                  </div>

                  <div className="storefront-category-row-grid">
                    {category.previewProducts.map((product, index) => {
                      const renderIdentity = buildStorefrontRenderIdentity(product, index);
                      const imageSrc = getStorefrontProductImage(product);

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
                            <span className="storefront-featured-category">{category.name}</span>
                            <h4 className="storefront-featured-title">
                              {product?.name || "Catalog Product"}
                            </h4>
                            <p className="storefront-featured-description">
                              {product?.notes || "Available for custom orders."}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            {!productsReady && !storefrontProducts.length ? (
              <p className="storefront-loading-copy">Loading storefront products...</p>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}
