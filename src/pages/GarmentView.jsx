import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { garments } from "../data/garments";

const garmentPricing = {
  TSHIRT_GILDAN_64000: { single: "$14.50", bulkText: "Bulk pricing available" },
  TSHIRT_BELLA_3001: { single: "$18.00", bulkText: "Bulk pricing available" },
  HOODIE_GILDAN_18500: { single: "$32.00", bulkText: "Bulk pricing available" },
  HOODIE_IND_4000: { single: "$38.00", bulkText: "Bulk pricing available" },
  HAT_RICHARDSON_112: { single: "$24.00", bulkText: "Bulk pricing available" },
  HAT_FLEXFIT_6277: { single: "$26.00", bulkText: "Bulk pricing available" },
};

export default function GarmentView() {
  const { garmentId } = useParams();
  const garment = garments.find((g) => g.garment_id === garmentId);

  const [selectedColor, setSelectedColor] = useState(
    garment?.available_colors?.[0] || ""
  );
  const [orderType, setOrderType] = useState("Single Item");
  const [selectedSize, setSelectedSize] = useState(
    garment?.available_sizes?.[0] || ""
  );
  const [quantity, setQuantity] = useState(1);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 900);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!garment) {
    return (
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "16px 20px 24px",
          fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <h1 style={{ marginTop: 0 }}>Garment not found</h1>
        <Link to="/" style={{ color: "#171717" }}>
          Back to Home
        </Link>
      </div>
    );
  }

  const imageSrc = garment.image || "/garments/gildan-softstyle-tee.jpg";

  const pricing = garmentPricing[garment.garment_id] || {
    single: "$19.00",
    bulkText: "Bulk pricing available",
  };

  const decreaseQuantity = () => {
    setQuantity((prev) => Math.max(1, prev - 1));
  };

  const increaseQuantity = () => {
    setQuantity((prev) => prev + 1);
  };

  const categorySlug =
    garment.category?.toLowerCase().replace(/\s+/g, "-") || "catalog";

  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: isMobile ? "10px 14px 20px" : "12px 20px 24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          marginBottom: isMobile ? "10px" : "12px",
          fontSize: isMobile ? "12px" : "13px",
          color: "#78716c",
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Link
          to="/"
          style={{
            color: "#57534e",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Home
        </Link>
        <span>/</span>
        <Link
          to={`/category/${categorySlug}`}
          style={{
            color: "#57534e",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {garment.category}
        </Link>
        <span>/</span>
        <span style={{ color: "#171717", fontWeight: 700 }}>
          {garment.display_name}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "340px minmax(0, 1fr)",
          gap: isMobile ? "14px" : "18px",
          alignItems: "start",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: "18px",
            padding: isMobile ? "14px" : "16px",
            border: "1px solid #e7e5e4",
            boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: isMobile ? "static" : "sticky",
            top: isMobile ? "auto" : "16px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: isMobile ? "100%" : "280px",
              aspectRatio: "1 / 1",
              borderRadius: "16px",
              overflow: "hidden",
              background: "#fafaf9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={imageSrc}
              alt={garment.display_name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
              }}
            />
          </div>

          <div
            style={{
              width: "100%",
              marginTop: "12px",
              padding: "12px",
              borderRadius: "14px",
              background: "#fafaf9",
              border: "1px solid #e7e5e4",
            }}
          >
            <p
              style={{
                margin: "0 0 6px 0",
                fontWeight: "700",
                fontSize: "14px",
                color: "#171717",
              }}
            >
              Current Demo Selection
            </p>
            <p style={{ margin: "3px 0", color: "#57534e", fontSize: "14px" }}>
              Color: {selectedColor}
            </p>
            <p style={{ margin: "3px 0", color: "#57534e", fontSize: "14px" }}>
              Order Type: {orderType}
            </p>
            <p style={{ margin: "3px 0", color: "#57534e", fontSize: "14px" }}>
              Size: {selectedSize}
            </p>
            {orderType === "Single Item" && (
              <p
                style={{ margin: "3px 0", color: "#57534e", fontSize: "14px" }}
              >
                Quantity: {quantity}
              </p>
            )}
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: "18px",
            padding: isMobile ? "16px" : "20px",
            border: "1px solid #e7e5e4",
            boxShadow: "0 10px 24px rgba(0,0,0,0.05)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#78716c",
            }}
          >
            {garment.brand}
          </p>

          <h1
            style={{
              marginTop: "6px",
              marginBottom: "8px",
              fontSize: isMobile ? "20px" : "26px",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            {garment.display_name}
          </h1>

          <p
            style={{
              margin: "0 0 8px 0",
              color: "#57534e",
              lineHeight: 1.5,
              fontSize: isMobile ? "14px" : "15px",
            }}
          >
            {garment.description}
          </p>

          <div
            style={{
              marginTop: "10px",
              padding: "12px 14px",
              borderRadius: "14px",
              background: "#fafaf9",
              border: "1px solid #e7e5e4",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: isMobile ? "16px" : "18px",
                fontWeight: 800,
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
              {pricing.bulkText}
            </p>
          </div>

          <div style={{ marginTop: "18px" }}>
            <p
              style={{
                fontWeight: "700",
                margin: "0 0 8px 0",
                fontSize: "15px",
              }}
            >
              Choose Color
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              {garment.available_colors.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  style={{
                    padding: "9px 14px",
                    borderRadius: "999px",
                    border:
                      selectedColor === color
                        ? "2px solid #171717"
                        : "1px solid #d6d3d1",
                    background: selectedColor === color ? "#171717" : "#ffffff",
                    color: selectedColor === color ? "#ffffff" : "#171717",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  {color}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: "18px" }}>
            <p
              style={{
                fontWeight: "700",
                margin: "0 0 8px 0",
                fontSize: "15px",
              }}
            >
              Order Type
            </p>

            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              {["Single Item", "Bulk Order"].map((type) => (
                <button
                  key={type}
                  onClick={() => setOrderType(type)}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "12px",
                    border:
                      orderType === type
                        ? "2px solid #171717"
                        : "1px solid #d6d3d1",
                    background: orderType === type ? "#171717" : "#ffffff",
                    color: orderType === type ? "#ffffff" : "#171717",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: "18px" }}>
            <p
              style={{
                fontWeight: "700",
                margin: "0 0 8px 0",
                fontSize: "15px",
              }}
            >
              {orderType === "Single Item" ? "Choose Size" : "Available Sizes"}
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              {garment.available_sizes.map((size) => (
                <button
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  style={{
                    padding: "9px 12px",
                    borderRadius: "12px",
                    border:
                      selectedSize === size
                        ? "2px solid #171717"
                        : "1px solid #d6d3d1",
                    background: selectedSize === size ? "#171717" : "#ffffff",
                    color: selectedSize === size ? "#ffffff" : "#171717",
                    cursor: "pointer",
                    fontWeight: 600,
                    minWidth: "60px",
                    fontSize: "14px",
                  }}
                >
                  {size}
                </button>
              ))}
            </div>

            {orderType === "Bulk Order" && (
              <p
                style={{
                  marginTop: "10px",
                  color: "#78716c",
                  fontSize: "13px",
                }}
              >
                Bulk size quantity entry can be the next step in the demo flow.
              </p>
            )}
          </div>

          <div style={{ marginTop: "18px" }}>
            <p
              style={{
                fontWeight: "700",
                margin: "0 0 6px 0",
                fontSize: "15px",
              }}
            >
              Available Print Locations
            </p>

            <p
              style={{
                margin: "0 0 8px 0",
                fontSize: "13px",
                color: "#78716c",
                lineHeight: 1.4,
              }}
            >
              You’ll choose your final artwork placement on the next step.
            </p>

            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              {(garment.placements_allowed || []).map((placement) => (
                <span
                  key={placement}
                  style={{
                    fontSize: "12px",
                    padding: "7px 10px",
                    borderRadius: "999px",
                    background: "#fafaf9",
                    border: "1px solid #e7e5e4",
                    color: "#44403c",
                  }}
                >
                  {placement}
                </span>
              ))}
            </div>
          </div>

          {orderType === "Single Item" && (
            <div style={{ marginTop: "18px" }}>
              <p
                style={{
                  fontWeight: "700",
                  margin: "0 0 8px 0",
                  fontSize: "15px",
                }}
              >
                Choose Quantity
              </p>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px",
                  borderRadius: "14px",
                  border: "1px solid #e7e5e4",
                  background: "#fafaf9",
                }}
              >
                <button
                  onClick={decreaseQuantity}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    border: "1px solid #d6d3d1",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "18px",
                    color: "#171717",
                  }}
                >
                  -
                </button>

                <span
                  style={{
                    minWidth: "28px",
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: "15px",
                    color: "#171717",
                  }}
                >
                  {quantity}
                </span>

                <button
                  onClick={increaseQuantity}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    border: "1px solid #d6d3d1",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "18px",
                    color: "#171717",
                  }}
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div
            style={{
              marginTop: "20px",
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <Link
              to="/order-preview"
              state={{
                garmentId: garment.garment_id,
                garmentName: garment.display_name,
                brand: garment.brand,
                category: garment.category,
                description: garment.description,
                imageSrc,
                selectedColor,
                selectedSize,
                quantity,
                orderType,
              }}
              style={{
                background: "#171717",
                color: "#ffffff",
                padding: "12px 16px",
                borderRadius: "12px",
                textDecoration: "none",
                fontWeight: "700",
                boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
                fontSize: "14px",
              }}
            >
              Continue Order
            </Link>

            <Link
              to="/"
              style={{
                border: "1px solid #d6d3d1",
                color: "#171717",
                padding: "12px 16px",
                borderRadius: "12px",
                textDecoration: "none",
                background: "#ffffff",
                fontSize: "14px",
              }}
            >
              Back
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}