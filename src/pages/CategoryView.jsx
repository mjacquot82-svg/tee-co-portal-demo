import { Link, useParams } from "react-router-dom";
import { categories, garments } from "../data/garments";

const garmentPricing = {
  TSHIRT_GILDAN_64000: { single: "$14.50", bulk: "Bulk pricing available" },
  TSHIRT_BELLA_3001: { single: "$18.00", bulk: "Bulk pricing available" },
  HOODIE_GILDAN_18500: { single: "$32.00", bulk: "Bulk pricing available" },
  HOODIE_IND_4000: { single: "$38.00", bulk: "Bulk pricing available" },
  HAT_RICHARDSON_112: { single: "$24.00", bulk: "Bulk pricing available" },
  HAT_FLEXFIT_6277: { single: "$26.00", bulk: "Bulk pricing available" },
};

export default function CategoryView() {
  const { categoryId } = useParams();

  const category = categories.find((c) => c.id === categoryId);

  const categoryGarments = garments.filter(
    (g) => g.category === category?.name
  );

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
        {categoryGarments.map((item) => {
          const pricing = garmentPricing[item.garment_id] || {
            single: "$19.00",
            bulk: "Bulk pricing available",
          };

          return (
            <Link
              key={item.garment_id}
              to={`/garment/${item.garment_id}`}
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
              {/* Image container */}
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
                <img
                  src={
                    item.image ||
                    "/garments/gildan-softstyle-tee.jpg"
                  }
                  alt={item.display_name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              </div>

              <h3
                style={{
                  margin: 0,
                  fontSize: "15px",
                  fontWeight: 700,
                  lineHeight: 1.25,
                }}
              >
                {item.display_name}
              </h3>

              <p
                style={{
                  margin: "4px 0 0 0",
                  color: "#57534e",
                  fontSize: "13px",
                }}
              >
                {item.description}
              </p>

              <div style={{ marginTop: "8px" }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    fontWeight: 700,
                  }}
                >
                  From {pricing.single}
                </p>

                <p
                  style={{
                    margin: "2px 0 0 0",
                    fontSize: "11px",
                    color: "#78716c",
                  }}
                >
                  {pricing.bulk}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
