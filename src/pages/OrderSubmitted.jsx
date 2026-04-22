import { Link, useLocation } from "react-router-dom";

export default function OrderSubmitted() {
  const location = useLocation();
  const state = location.state || {};

  const garmentName = state.garmentName || "Selected Garment";
  const brand = state.brand || "Tee & Co";
  const category = state.category || "Apparel";
  const selectedColor = state.selectedColor || "Black";
  const selectedSize = state.selectedSize || "M";
  const quantity = state.quantity || 1;
  const orderType = state.orderType || "Single Item";
  const placement = state.placement || "Full Front";
  const artworkName = state.artworkName || "No artwork uploaded";
  const notes = state.notes || "";

  return (
    <div
      style={{
        maxWidth: "860px",
        margin: "0 auto",
        padding: "16px 20px 28px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "22px",
          padding: "28px",
          border: "1px solid #e7e5e4",
          boxShadow: "0 14px 32px rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            marginBottom: "14px",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              width: "54px",
              height: "54px",
              borderRadius: "16px",
              background: "#171717",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
              flexShrink: 0,
            }}
          >
            ✓
          </div>

          <div>
            <p
              style={{
                margin: "0 0 4px 0",
                fontSize: "12px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#78716c",
              }}
            >
              Order Request Sent
            </p>
            <h1
              style={{
                margin: 0,
                fontSize: "30px",
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                color: "#171717",
              }}
            >
              Order submitted successfully
            </h1>
          </div>
        </div>

        <p
          style={{
            marginTop: 0,
            marginBottom: "22px",
            color: "#57534e",
            fontSize: "15px",
            lineHeight: 1.6,
            maxWidth: "720px",
          }}
        >
          Your garment selection, artwork details, and placement request have
          been sent to Tee &amp; Co. The shop can now review the order before
          approval and production.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "18px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              background: "#fafaf9",
              borderRadius: "16px",
              padding: "18px",
              border: "1px solid #e7e5e4",
            }}
          >
            <p
              style={{
                margin: "0 0 10px 0",
                fontWeight: "700",
                fontSize: "15px",
                color: "#171717",
              }}
            >
              Order Summary
            </p>

            <div style={{ display: "grid", gap: "10px" }}>
              <div>
                <p
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: "12px",
                    color: "#78716c",
                  }}
                >
                  Garment
                </p>
                <p style={{ margin: 0, fontWeight: 600, color: "#171717" }}>
                  {garmentName}
                </p>
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: "12px",
                    color: "#78716c",
                  }}
                >
                  Brand / Category
                </p>
                <p style={{ margin: 0, fontWeight: 600, color: "#171717" }}>
                  {brand} · {category}
                </p>
              </div>

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
                <p style={{ margin: 0, fontWeight: 600, color: "#171717" }}>
                  {selectedColor}
                </p>
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
                <p style={{ margin: 0, fontWeight: 600, color: "#171717" }}>
                  {orderType}
                </p>
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
                <p style={{ margin: 0, fontWeight: 600, color: "#171717" }}>
                  {selectedSize}
                </p>
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
                <p style={{ margin: 0, fontWeight: 600, color: "#171717" }}>
                  {quantity}
                </p>
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: "12px",
                    color: "#78716c",
                  }}
                >
                  Placement
                </p>
                <p style={{ margin: 0, fontWeight: 600, color: "#171717" }}>
                  {placement}
                </p>
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: "12px",
                    color: "#78716c",
                  }}
                >
                  Artwork File
                </p>
                <p
                  style={{
                    margin: 0,
                    fontWeight: 600,
                    color: "#171717",
                    wordBreak: "break-word",
                  }}
                >
                  {artworkName}
                </p>
              </div>
            </div>
          </div>

          <div
            style={{
              background: "#fafaf9",
              borderRadius: "16px",
              padding: "18px",
              border: "1px solid #e7e5e4",
            }}
          >
            <p
              style={{
                margin: "0 0 10px 0",
                fontWeight: "700",
                fontSize: "15px",
                color: "#171717",
              }}
            >
              What Happens Next?
            </p>

            <ul
              style={{
                margin: 0,
                paddingLeft: "18px",
                color: "#57534e",
                lineHeight: 1.7,
                fontSize: "14px",
              }}
            >
              <li>The shop reviews your garment, artwork, and placement</li>
              <li>You may receive approval feedback or a proof preview</li>
              <li>A deposit request may be sent before production begins</li>
              <li>Production starts after approval and payment confirmation</li>
            </ul>

            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                borderRadius: "12px",
                background: "#ffffff",
                border: "1px solid #e7e5e4",
              }}
            >
              <p
                style={{
                  margin: "0 0 6px 0",
                  fontWeight: "700",
                  fontSize: "13px",
                  color: "#171717",
                }}
              >
                Customer Notes
              </p>
              <p
                style={{
                  margin: 0,
                  color: notes ? "#57534e" : "#a8a29e",
                  fontSize: "14px",
                  lineHeight: 1.5,
                }}
              >
                {notes || "No additional notes were included with this order."}
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <Link
            to="/my-orders"
            style={{
              background: "#171717",
              color: "#ffffff",
              padding: "13px 18px",
              borderRadius: "12px",
              textDecoration: "none",
              fontWeight: "700",
              boxShadow: "0 10px 20px rgba(0,0,0,0.10)",
              fontSize: "14px",
            }}
          >
            View My Orders
          </Link>

          <Link
            to="/"
            style={{
              border: "1px solid #d6d3d1",
              color: "#171717",
              padding: "13px 18px",
              borderRadius: "12px",
              textDecoration: "none",
              background: "#ffffff",
              fontSize: "14px",
            }}
          >
            Start Another Order
          </Link>
        </div>
      </div>
    </div>
  );
}