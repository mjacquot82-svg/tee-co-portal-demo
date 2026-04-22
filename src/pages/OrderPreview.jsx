import { useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

const PLACEMENTS = [
  {
    value: "Full Front",
    description: "Centered large print on front of garment.",
  },
  {
    value: "Left Chest",
    description: "Small logo or artwork on upper left chest.",
  },
  {
    value: "Full Back",
    description: "Centered large print on back of garment.",
  },
  {
    value: "Sleeve",
    description: "Print placed on sleeve area.",
  },
  {
    value: "Other",
    description: "A custom location to be confirmed by the office team.",
  },
];

const fallbackImage = "/garments/gildan-softstyle-tee.jpg";

export default function OrderPreview() {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);

  const passedState = location.state || {};

  const garmentName = passedState.garmentName || "Selected Garment";
  const brand = passedState.brand || "Tee & Co";
  const category = passedState.category || "Apparel";
  const description =
    passedState.description ||
    "Review your garment details, artwork, and print placement before submitting.";
  const imageSrc = passedState.imageSrc || fallbackImage;
  const selectedColor = passedState.selectedColor || "Black";
  const selectedSize = passedState.selectedSize || "M";
  const quantity = passedState.quantity || 1;
  const orderType = passedState.orderType || "Single Item";

  const [placement, setPlacement] = useState("Full Front");
  const [notes, setNotes] = useState("");
  const [artwork, setArtwork] = useState(null);

  const selectedPlacement = useMemo(
    () => PLACEMENTS.find((item) => item.value === placement),
    [placement]
  );

  function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);

    setArtwork({
      file,
      name: file.name,
      previewUrl,
    });
  }

  function handleSubmit() {
    navigate("/order-submitted", {
      state: {
        garmentName,
        brand,
        category,
        description,
        imageSrc,
        selectedColor,
        selectedSize,
        quantity,
        orderType,
        placement,
        notes,
        artworkName: artwork?.name || "",
      },
    });
  }

  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "14px 20px 28px",
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
        <span style={{ color: "#171717", fontWeight: 700 }}>Order Preview</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.02fr 0.98fr",
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
          <div
            style={{
              display: "flex",
              gap: "16px",
              alignItems: "flex-start",
              flexWrap: "wrap",
              marginBottom: "16px",
            }}
          >
            <img
              src={imageSrc}
              alt={garmentName}
              style={{
                width: "160px",
                height: "160px",
                objectFit: "cover",
                borderRadius: "14px",
                border: "1px solid #e7e5e4",
                display: "block",
                flexShrink: 0,
              }}
            />

            <div style={{ flex: 1, minWidth: "220px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "11px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#78716c",
                }}
              >
                {brand} · {category}
              </p>

              <h1
                style={{
                  margin: "6px 0 8px 0",
                  fontSize: "26px",
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                  color: "#171717",
                }}
              >
                {garmentName}
              </h1>

              <p
                style={{
                  margin: 0,
                  color: "#57534e",
                  lineHeight: 1.5,
                  fontSize: "14px",
                }}
              >
                {description}
              </p>
            </div>
          </div>

          <div
            style={{
              padding: "14px",
              borderRadius: "14px",
              background: "#fafaf9",
              border: "1px solid #e7e5e4",
            }}
          >
            <p
              style={{
                margin: "0 0 8px 0",
                fontWeight: 700,
                fontSize: "14px",
                color: "#171717",
              }}
            >
              Order Summary
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "10px 16px",
              }}
            >
              <div>
                <p
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: "12px",
                    color: "#78716c",
                  }}
                >
                  Color
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>{selectedColor}</p>
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: "12px",
                    color: "#78716c",
                  }}
                >
                  Order Type
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>{orderType}</p>
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: "12px",
                    color: "#78716c",
                  }}
                >
                  Size
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>{selectedSize}</p>
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: "12px",
                    color: "#78716c",
                  }}
                >
                  Quantity
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>{quantity}</p>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: "18px",
              background: "#ffffff",
              borderRadius: "16px",
              padding: "16px",
              border: "1px solid #e7e5e4",
            }}
          >
            <p
              style={{
                margin: "0 0 10px 0",
                fontWeight: 700,
                fontSize: "15px",
                color: "#171717",
              }}
            >
              Artwork Upload
            </p>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: "11px 14px",
                borderRadius: "12px",
                border: "1px solid #d6d3d1",
                background: "#ffffff",
                color: "#171717",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "14px",
              }}
            >
              {artwork ? "Replace Artwork" : "Upload Artwork"}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.ai,.eps,.svg"
              onChange={handleUpload}
              style={{ display: "none" }}
            />

            {artwork ? (
              <div
                style={{
                  marginTop: "14px",
                  padding: "12px",
                  borderRadius: "12px",
                  background: "#fafaf9",
                  border: "1px solid #e7e5e4",
                }}
              >
                <p
                  style={{
                    margin: "0 0 8px 0",
                    fontSize: "13px",
                    color: "#57534e",
                  }}
                >
                  Uploaded file
                </p>
                <p
                  style={{
                    margin: 0,
                    fontWeight: 600,
                    color: "#171717",
                    wordBreak: "break-word",
                  }}
                >
                  {artwork.name}
                </p>

                {artwork.previewUrl && artwork.file?.type?.startsWith("image/") && (
                  <img
                    src={artwork.previewUrl}
                    alt={artwork.name}
                    style={{
                      width: "100%",
                      maxWidth: "260px",
                      height: "auto",
                      marginTop: "12px",
                      borderRadius: "12px",
                      border: "1px solid #e7e5e4",
                      display: "block",
                    }}
                  />
                )}
              </div>
            ) : (
              <p
                style={{
                  margin: "10px 0 0 0",
                  color: "#78716c",
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              >
                Upload artwork, logo, or design reference for this order request.
              </p>
            )}
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: "18px",
            padding: "20px",
            border: "1px solid #e7e5e4",
            boxShadow: "0 10px 24px rgba(0,0,0,0.05)",
          }}
        >
          <div>
            <p
              style={{
                fontWeight: "700",
                margin: "0 0 8px 0",
                fontSize: "15px",
              }}
            >
              Print Placement
            </p>

            <div
              style={{
                display: "grid",
                gap: "8px",
              }}
            >
              {PLACEMENTS.map((option) => {
                const active = placement === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPlacement(option.value)}
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: "14px",
                      border: active
                        ? "2px solid #171717"
                        : "1px solid #d6d3d1",
                      background: active ? "#171717" : "#ffffff",
                      color: active ? "#ffffff" : "#171717",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "14px" }}>
                      {option.value}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        marginTop: "4px",
                        color: active ? "#f5f5f4" : "#78716c",
                        lineHeight: 1.4,
                      }}
                    >
                      {option.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              marginTop: "18px",
              padding: "14px",
              borderRadius: "14px",
              background: "#fafaf9",
              border: "1px solid #e7e5e4",
            }}
          >
            <p
              style={{
                margin: "0 0 6px 0",
                fontWeight: 700,
                fontSize: "14px",
              }}
            >
              Selected Placement
            </p>
            <p style={{ margin: 0, color: "#57534e", fontSize: "14px" }}>
              {selectedPlacement?.description}
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
              Notes for Tee &amp; Co
            </p>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about placement, sizing, timing, or design preferences..."
              style={{
                width: "100%",
                minHeight: "120px",
                resize: "vertical",
                padding: "12px 14px",
                borderRadius: "14px",
                border: "1px solid #d6d3d1",
                background: "#ffffff",
                color: "#171717",
                fontSize: "14px",
                lineHeight: 1.5,
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div
            style={{
              marginTop: "20px",
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={handleSubmit}
              style={{
                background: "#171717",
                color: "#ffffff",
                padding: "12px 16px",
                borderRadius: "12px",
                border: "none",
                cursor: "pointer",
                fontWeight: "700",
                boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
                fontSize: "14px",
              }}
            >
              Submit Order Request
            </button>

            <Link
              to={-1}
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