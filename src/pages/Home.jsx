import { Link } from "react-router-dom";
import { categories, garments } from "../data/garments";

const garmentImages = {
  TSHIRT_GILDAN_64000: "/garments/gildan-softstyle-tee.jpg",
  TSHIRT_BELLA_3001: "/garments/bella-canvas-3001.jpg",
  HOODIE_GILDAN_18500: "/garments/gildan-softstyle-tee.jpg",
  HOODIE_IND_4000: "/garments/bella-canvas-3001.jpg",
  HAT_RICHARDSON_112: "/garments/gildan-softstyle-tee.jpg",
  HAT_FLEXFIT_6277: "/garments/bella-canvas-3001.jpg",
};

const garmentPricing = {
  TSHIRT_GILDAN_64000: { single: "$14.50", bulk: "Bulk pricing available" },
  TSHIRT_BELLA_3001: { single: "$18.00", bulk: "Bulk pricing available" },
  HOODIE_GILDAN_18500: { single: "$32.00", bulk: "Bulk pricing available" },
  HOODIE_IND_4000: { single: "$38.00", bulk: "Bulk pricing available" },
  HAT_RICHARDSON_112: { single: "$24.00", bulk: "Bulk pricing available" },
  HAT_FLEXFIT_6277: { single: "$26.00", bulk: "Bulk pricing available" },
};

export default function Home() {
  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "14px 20px 24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {categories.map((category) => {
        const categoryGarments = garments.filter(
          (g) => g.category === category.name
        );

        return (
          <section key={category.id} style={{ marginBottom: "32px" }}>
            <h2
              style={{
                fontSize: "24px",
                margin: "0 0 10px 0",
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
              }}
            >
              {category.name}
            </h2>

            <p
              style={{
                margin: "0 0 18px 0",
                color: "#57534e",
                fontSize: "15px",
                lineHeight: 1.5,
                maxWidth: "760px",
              }}
            >
              {category.description}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "18px",
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
                      padding: "18px",
                      border: "1px solid #e7e5e4",
                      boxShadow: "0 10px 24px rgba(0,0,0,0.05)",
                      color: "#171717",
                      display: "block",
                      transition: "transform 0.18s ease, box-shadow 0.18s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-3px)";
                      e.currentTarget.style.boxShadow =
                        "0 14px 28px rgba(0,0,0,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow =
                        "0 10px 24px rgba(0,0,0,0.05)";
                    }}
                  >
                    <img
                      src={
                        garmentImages[item.garment_id] ||
                        "/garments/gildan-softstyle-tee.jpg"
                      }
                      alt={item.display_name}
                      style={{
                        width: "100%",
                        height: "150px",
                        objectFit: "cover",
                        borderRadius: "12px",
                        marginBottom: "12px",
                        display: "block",
                      }}
                    />

                    <h3
                      style={{
                        margin: 0,
                        fontSize: "17px",
                        fontWeight: 700,
                        lineHeight: 1.2,
                      }}
                    >
                      {item.display_name}
                    </h3>

                    <p
                      style={{
                        margin: "8px 0 0 0",
                        color: "#57534e",
                        fontSize: "14px",
                        lineHeight: 1.45,
                      }}
                    >
                      {item.description}
                    </p>

                    <div style={{ marginTop: "12px" }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "15px",
                          fontWeight: 700,
                          color: "#171717",
                        }}
                      >
                        From {pricing.single} each
                      </p>
                      <p
                        style={{
                          margin: "4px 0 0 0",
                          fontSize: "13px",
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
          </section>
        );
      })}
    </div>
  );
}