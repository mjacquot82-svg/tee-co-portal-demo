import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { garments } from "../data/garments";

const garmentImages = {
  TSHIRT_GILDAN_64000: "/garments/gildan-softstyle-tee.jpg",
  TSHIRT_BELLA_3001: "/garments/bella-canvas-3001.jpg",
  HOODIE_GILDAN_18500: "/garments/gildan-softstyle-tee.jpg",
  HOODIE_IND_4000: "/garments/bella-canvas-3001.jpg",
  HAT_RICHARDSON_112: "/garments/gildan-softstyle-tee.jpg",
  HAT_FLEXFIT_6277: "/garments/bella-canvas-3001.jpg",
};

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

  const [selectedColor, setSelectedColor] = useState(
    garment.available_colors?.[0] || ""
  );
  const [orderType, setOrderType] = useState("Single Item");
  const [selectedSize, setSelectedSize] = useState(
    garment.available_sizes?.[0] || ""
  );
  const [quantity, setQuantity] = useState(1);

  const imageSrc =
    garmentImages[garment.garment_id] || "/garments/gildan-softstyle-tee.jpg";

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
        padding: "14px 20px 24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          marginBottom: "14px",
          fontSize: "13px",
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
          gridTemplateColumns: "1.05fr 0.95fr",
          gap: "20px",
          alignItems: "start",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: "18px",
            padding: "18px",
            border: "1px solid #e7e5e4",
            boxShadow: "0 10px 24px rgba(0,0,0,0.05)",
          }}
        >
          <img
            src={imageSrc}
            alt={garment.display_name}
            style={{
              width: "100%",
              height: "400px",
              objectFit: "cover",
              borderRadius: "14px",
              marginBottom: "14px",
              display: "block",
            }}
          />

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

        <div
          style={{
            background: "#ffffff",
            borderRadius: "18px",
            padding: "22px",
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
              fontSize: "26px",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            {garment.display_name}
          </h1>

          <p
            style={{
              margin: "0 0 6px 0",
              color: "#57534e",
              lineHeight: 1.5,
              fontSize: "15px",
            }}
          >
            {garment.description}
          </p>

          <div
            style={{
              marginTop: "12px",
              padding: "12px 14px",
              borderRadius: "14px",
              background: "#fafaf9",
              border: "1px solid #e7e5e4",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "18px",
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

          <div style={{ marginTop: "22px" }}>
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

          <div style={{ marginTop: "22px" }}>
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

          <div style={{ marginTop: "22px" }}>
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

          {orderType === "Single Item" && (
            <div style={{ marginTop: "22px" }}>
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
              marginTop: "22px",
              padding: "14px",
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

          <div
            style={{
              marginTop: "22px",
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