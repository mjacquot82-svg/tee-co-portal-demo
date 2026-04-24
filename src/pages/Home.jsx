import { Link } from "react-router-dom";
import { categories, garments } from "../data/garments";

export default function Home() {
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
  };

  const previewImageStyle = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  };

  const previewTitleStyle = {
    margin: 0,
    fontSize: "15px",
    fontWeight: 700,
    lineHeight: 1.3,
  };

  const previewDescriptionStyle = {
    margin: "4px 0 0 0",
    fontSize: "13px",
    color: "#78716c",
    lineHeight: 1.4,
  };

  const popularGarments = [
    {
      title: "Gildan Softstyle T-Shirt",
      subtitle: "Best for everyday team, brand, and event orders.",
      image: "/garments/gildan-softstyle-tee.jpg",
      to: "/category/tshirts",
    },
    {
      title: "Heavy Blend Hoodie",
      subtitle: "A reliable fleece option for staff, schools, and merch drops.",
      image: "/garments/hoodies.PNG",
      to: "/category/hoodies",
    },
    {
      title: "Richardson 112 Hat",
      subtitle: "Structured trucker style that works well for embroidery.",
      image: "/garments/hat.PNG",
      to: "/category/hats",
    },
  ];

  const orderingSteps = [
    "Upload your artwork",
    "Approve your mockup",
    "Production begins",
    "Pickup or delivery",
  ];

  const reassuranceItems = [
    "No minimums available",
    "Bulk discounts offered",
    "Local production turnaround",
    "Mockups included before printing",
  ];

  const decorationTypes = [
    "Screen Printing",
    "Embroidery",
    "DTF Transfers",
    "Heat Press Vinyl",
  ];

  function getCategoryImage(categoryName) {
    const firstGarment = garments.find((g) => g.category === categoryName);
    return firstGarment?.image || "/garments/gildan-softstyle-tee.jpg";
  }

  function renderPreviewCard({ key, to, image, title, description }) {
    return (
      <Link key={key} to={to} className="home-preview-card" style={previewCardStyle}>
        <div className="home-preview-box" style={previewBoxStyle}>
          <img
            className="home-preview-image"
            src={image}
            alt={title}
            style={previewImageStyle}
          />
        </div>

        <div className="home-preview-copy">
          <h3 className="home-preview-title" style={previewTitleStyle}>
            {title}
          </h3>

          <p className="home-preview-description" style={previewDescriptionStyle}>
            {description}
          </p>
        </div>
      </Link>
    );
  }

  return (
    <div
      className="home-page"
      style={{
        margin: "0 auto",
        padding: "12px 14px 26px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        className="home-main-content"
        style={{
          maxWidth: "1360px",
          margin: "0 auto",
        }}
      >
        <div
          className="home-top-cta"
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            padding: "18px",
            border: "1px solid #e7e5e4",
            boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
          }}
        >
          <p
            style={{
              margin: "0 0 6px 0",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#78716c",
              textTransform: "uppercase",
            }}
          >
            Custom Apparel Made Simple
          </p>

          <h2
            style={{
              margin: "0 0 6px 0",
              fontSize: "24px",
              letterSpacing: "-0.02em",
            }}
          >
            Start Your Custom Order
          </h2>

          <p
            style={{
              margin: "0 0 14px 0",
              fontSize: "14px",
              color: "#78716c",
              lineHeight: 1.45,
            }}
          >
            Upload artwork, choose garments, and request a quote in minutes.
          </p>

          <Link
            to="/category/tshirts"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "42px",
              padding: "0 16px",
              borderRadius: "12px",
              background: "#171717",
              color: "#ffffff",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 700,
            }}
        >
          Start Order
        </Link>
      </div>

        <div className="home-section home-card-row-shell home-category-row-shell">
          <div className="home-section-header">
            <h2 className="home-section-title">Shop by Category</h2>

            <p className="home-section-copy">
              Choose a garment type to start your order.
            </p>
          </div>

          <div className="home-category-grid">
            {categories.map((category) =>
              renderPreviewCard({
                key: category.id,
                to: `/category/${category.id}`,
                image: getCategoryImage(category.name),
                title: category.name,
                description: category.description,
              }),
            )}
          </div>
        </div>

        <div className="home-feature-frame">
          <div className="home-section home-side-panel">
            <div className="home-section-header">
              <h2 className="home-section-title">
                How Ordering Works
              </h2>

              <p className="home-section-copy">
                A straightforward process from artwork to finished apparel.
              </p>
            </div>

            <div className="home-steps-grid">
              {orderingSteps.map((step, index) => (
                <div
                  key={step}
                  style={{
                    background: "#ffffff",
                    borderRadius: "16px",
                    padding: "14px",
                    border: "1px solid #e7e5e4",
                    boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
                  }}
                >
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "999px",
                      background: "#f5f5f4",
                      color: "#57534e",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "13px",
                      fontWeight: 700,
                      marginBottom: "10px",
                    }}
                  >
                    {index + 1}
                  </div>

                  <p
                    style={{
                      margin: 0,
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#171717",
                      lineHeight: 1.4,
                    }}
                  >
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="home-section home-popular-column">
            <div className="home-section-header home-popular-header">
              <h2 className="home-section-title">
                Popular Garments
              </h2>

              <p className="home-section-copy">
                Common picks for schools, teams, events, and business merch.
              </p>
            </div>

            <div className="home-popular-grid-shell">
              <div className="home-three-card-grid">
                {popularGarments.map((item) =>
                  renderPreviewCard({
                    key: item.title,
                    to: item.to,
                    image: item.image,
                    title: item.title,
                    description: item.subtitle,
                  }),
                )}
              </div>
            </div>
          </div>

          <div className="home-section home-side-panel">
            <div className="home-section-header">
              <h2 className="home-section-title">
                Decoration Types Available
              </h2>
            </div>

            <div className="home-decoration-grid">
              {decorationTypes.map((type) => (
                <div
                  key={type}
                  style={{
                    background: "#ffffff",
                    borderRadius: "16px",
                    padding: "14px",
                    border: "1px solid #e7e5e4",
                    boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#171717",
                  }}
                >
                  {type}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className="home-trust-strip"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            padding: "14px",
            background: "#fafaf9",
            borderRadius: "16px",
            border: "1px solid #e7e5e4",
          }}
        >
          {reassuranceItems.map((item) => (
            <div
              key={item}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 10px",
                borderRadius: "999px",
                background: "#ffffff",
                border: "1px solid #e7e5e4",
                color: "#57534e",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "999px",
                  background: "#a8a29e",
                  display: "inline-block",
                }}
              />
              {item}
            </div>
          ))}
        </div>

        <div
          className="home-support-card"
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            padding: "18px",
            border: "1px solid #e7e5e4",
            boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
          }}
        >
          <h2
            style={{
              margin: "0 0 6px 0",
              fontSize: "20px",
              letterSpacing: "-0.02em",
            }}
          >
            Need help choosing garments?
          </h2>

          <p
            style={{
              margin: "0 0 14px 0",
              fontSize: "14px",
              color: "#78716c",
              lineHeight: 1.45,
            }}
          >
            Contact us and we&apos;ll help you select the best option for your
            order.
          </p>

          <Link
            to="/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "42px",
              padding: "0 16px",
              borderRadius: "12px",
              background: "#ffffff",
              color: "#171717",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 700,
              border: "1px solid #d6d3d1",
            }}
          >
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  );
}
