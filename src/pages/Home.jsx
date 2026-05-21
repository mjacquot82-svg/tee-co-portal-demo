import { Link } from "react-router-dom";
import { useMemo } from "react";
import {
  getStorefrontProductImage,
  getStorefrontProducts,
} from "../lib/storefrontCatalog";
import { useStoredProducts } from "../lib/productsStore";

export default function Home() {
  const storedProducts = useStoredProducts();
  const storefrontProducts = useMemo(
    () => getStorefrontProducts(storedProducts),
    [storedProducts]
  );
  const previewCardStyle = {
    textDecoration: "none",
    background: "#ffffff",
    borderRadius: "16px",
    padding: "14px",
    border: "1px solid #e7e5e4",
    boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
    color: "#171717",
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
  };

  const previewBoxStyle = {
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
    minHeight: "220px",
    maxHeight: "220px",
  };

  const previewImageStyle = {
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
    objectFit: "contain",
    display: "block",
  };

  const storefrontCards = useMemo(
    () =>
      storefrontProducts.map((product) => ({
        id: product?.id || product?.name || product?.product_type || "catalog-product",
        title: product?.name || product?.product_type || "Catalog Product",
        subtitle:
          product?.notes || product?.category || "Available for custom orders.",
        image: getStorefrontProductImage(product),
        to: `/garment/${product.id}`,
      })),
    [storefrontProducts]
  );

  const primaryProductLink = storefrontProducts[0]
    ? `/garment/${storefrontProducts[0].id}`
    : "/";

  function renderPreviewCard({ key, to, image, title, description }) {
    return (
      <Link key={key} to={to} style={previewCardStyle}>
        <div style={previewBoxStyle}>
          <img src={image} alt={title} width="220" height="220" loading="eager" decoding="async" style={previewImageStyle} />
        </div>
        <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>{title}</h3>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#78716c" }}>{description}</p>
      </Link>
    );
  }

  return (
    <div style={{ margin: "0 auto", padding: "12px 14px 26px", maxWidth: "1360px", fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ background: "#ffffff", borderRadius: "16px", padding: "18px", border: "1px solid #e7e5e4", boxShadow: "0 8px 18px rgba(0,0,0,0.05)", marginBottom: "18px" }}>
        <p style={{ margin: "0 0 6px", fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", color: "#78716c", textTransform: "uppercase" }}>Custom Apparel Made Simple</p>
        <h2 style={{ margin: "0 0 6px", fontSize: "24px" }}>Start Your Custom Order</h2>
        <p style={{ margin: "0 0 14px", fontSize: "14px", color: "#78716c" }}>Upload artwork, choose garments, and request a quote in minutes.</p>
        <Link to={primaryProductLink} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "42px", padding: "0 16px", borderRadius: "12px", background: "#171717", color: "#ffffff", textDecoration: "none", fontSize: "14px", fontWeight: 700 }}>Start Order</Link>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ marginBottom: "12px" }}>Shop Products</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "14px" }}>
          {storefrontCards.map((item) => renderPreviewCard({
            key: item.id,
            to: item.to,
            image: item.image,
            title: item.title,
            description: item.subtitle,
          }))}
        </div>
      </div>

      <div style={{ background: "#ffffff", borderRadius: "16px", padding: "18px", border: "1px solid #e7e5e4", boxShadow: "0 8px 18px rgba(0,0,0,0.05)" }}>
        <h2 style={{ marginTop: 0 }}>Need help choosing garments?</h2>
        <p style={{ color: "#78716c" }}>Contact us and we&apos;ll help you select the best option for your order.</p>
        <Link to="/login" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "42px", padding: "0 16px", borderRadius: "12px", background: "#171717", color: "#ffffff", textDecoration: "none", fontSize: "14px", fontWeight: 700 }}>Contact Us</Link>
      </div>
    </div>
  );
}
