import { Link, useParams } from "react-router-dom";
import { categories, garments } from "../data/garments";

export default function CategoryView() {
  const { categoryId } = useParams();
  const category = categories.find((c) => c.id === categoryId);

  const filtered = garments.filter(
    (g) =>
      g.category.toLowerCase().replace(/[^a-z]/g, "") ===
      categoryId.replace(/[^a-z]/g, "")
  );

  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ margin: 0, fontSize: "32px" }}>
          {category?.name || "Category"}
        </h1>
        <p style={{ marginTop: "10px", color: "#57534e" }}>
          Choose a garment to begin your order.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "24px",
        }}
      >
        {filtered.map((garment) => (
          <Link
            key={garment.garment_id}
            to={`/garment/${garment.garment_id}`}
            style={{
              textDecoration: "none",
              background: "#ffffff",
              borderRadius: "20px",
              padding: "20px",
              border: "1px solid #e7e5e4",
              boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
              color: "#171717",
            }}
          >
            <div
              style={{
                height: "180px",
                borderRadius: "14px",
                background: "#e7e5e4",
                marginBottom: "16px",
              }}
            />

            <h3
              style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: "700",
              }}
            >
              {garment.display_name}
            </h3>

            <p
              style={{
                marginTop: "8px",
                marginBottom: "14px",
                color: "#57534e",
                fontSize: "14px",
                lineHeight: 1.5,
              }}
            >
              {garment.description}
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              {garment.available_colors.slice(0, 3).map((color) => (
                <span
                  key={color}
                  style={{
                    fontSize: "12px",
                    padding: "6px 10px",
                    borderRadius: "999px",
                    background: "#f5f5f4",
                    border: "1px solid #e7e5e4",
                    color: "#44403c",
                  }}
                >
                  {color}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}