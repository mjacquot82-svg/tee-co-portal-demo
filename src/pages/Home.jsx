import { Link } from "react-router-dom";
import { categories, garments } from "../data/garments";

export default function Home() {
  function getCategoryImage(categoryName) {
    const firstGarment = garments.find((g) => g.category === categoryName);
    return firstGarment?.image || "/garments/gildan-softstyle-tee.jpg";
  }

  return (
    <div
      style={{
        maxWidth: "680px",
        margin: "0 auto",
        padding: "12px 14px 26px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "16px",
        }}
      >
        {categories.map((category) => (
          <Link
            key={category.id}
            to={`/category/${category.id}`}
            style={{
              textDecoration: "none",
              background: "#ffffff",
              borderRadius: "16px",
              padding: "14px",
              border: "1px solid #e7e5e4",
              boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
              color: "#171717",
              display: "block",
              transition: "transform 0.08s ease",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "120px",
                background: "#fafaf9",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "10px",
                padding: "10px",
              }}
            >
              <img
                src={getCategoryImage(category.name)}
                alt={category.name}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                }}
              />
            </div>

            <h3
              style={{
                margin: 0,
                fontSize: "15px",
                fontWeight: 700,
              }}
            >
              {category.name}
            </h3>

            <p
              style={{
                margin: "4px 0 0 0",
                fontSize: "13px",
                color: "#78716c",
                lineHeight: 1.35,
              }}
            >
              {category.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}