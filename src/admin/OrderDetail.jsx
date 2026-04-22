import { useParams } from "react-router-dom";
import { useState } from "react";

export default function OrderDetail() {
  const { orderNumber } = useParams();
  const [status, setStatus] = useState("Submitted");

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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "24px",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <h1 style={{ marginTop: 0, fontSize: "30px" }}>Order {orderNumber}</h1>

          <p style={{ color: "#475569" }}>
            Current Status: <strong>{status}</strong>
          </p>

          <p style={{ color: "#475569" }}>
            Review artwork, garment details, and order notes before approving.
          </p>

          <div
            style={{
              marginTop: "24px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
            }}
          >
            <div
              style={{
                background: "#f8fafc",
                borderRadius: "16px",
                padding: "18px",
                border: "1px solid #e2e8f0",
              }}
            >
              <p style={{ marginTop: 0, fontWeight: "600" }}>Artwork Preview</p>
              <div
                style={{
                  height: "240px",
                  borderRadius: "14px",
                  background: "#e2e8f0",
                }}
              />
            </div>

            <div
              style={{
                background: "#f8fafc",
                borderRadius: "16px",
                padding: "18px",
                border: "1px solid #e2e8f0",
              }}
            >
              <p style={{ marginTop: 0, fontWeight: "600" }}>Order Details</p>
              <p style={{ color: "#475569" }}>Garment: Gildan Heavy Blend Hoodie</p>
              <p style={{ color: "#475569" }}>Color: Black</p>
              <p style={{ color: "#475569" }}>Placement: Left Chest</p>
              <p style={{ color: "#475569" }}>Quantity: 24</p>
              <p style={{ color: "#475569" }}>Sizes: S:4 M:8 L:6 XL:4 2XL:2</p>
            </div>
          </div>

          <div
            style={{
              marginTop: "24px",
              background: "#f8fafc",
              borderRadius: "16px",
              padding: "18px",
              border: "1px solid #e2e8f0",
            }}
          >
            <p style={{ marginTop: 0, fontWeight: "600" }}>Customer Notes</p>
            <p style={{ color: "#475569", marginBottom: 0 }}>
              Need before tournament May 12.
            </p>
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            height: "fit-content",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Actions</h2>

          <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
            <button
              onClick={() => setStatus("Approved")}
              style={{
                background: "#0f172a",
                color: "#fff",
                border: "none",
                borderRadius: "12px",
                padding: "14px 16px",
                cursor: "pointer",
                fontWeight: "600",
              }}
            >
              Approve Order
            </button>

            <button
              style={{
                background: "#fff",
                color: "#0f172a",
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                padding: "14px 16px",
                cursor: "pointer",
              }}
            >
              Request Changes
            </button>

            <input
              placeholder="Deposit Amount (e.g. 120)"
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                padding: "14px 16px",
                fontSize: "15px",
              }}
            />

            <button
              onClick={() => setStatus("Deposit Requested")}
              style={{
                background: "#fff",
                color: "#0f172a",
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                padding: "14px 16px",
                cursor: "pointer",
              }}
            >
              Send Payment Request
            </button>

            <button
              onClick={() => setStatus("Paid")}
              style={{
                background: "#fff",
                color: "#0f172a",
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                padding: "14px 16px",
                cursor: "pointer",
              }}
            >
              Confirm Payment Received
            </button>

            <button
              onClick={() => setStatus("In Production")}
              style={{
                background: "#fff",
                color: "#0f172a",
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                padding: "14px 16px",
                cursor: "pointer",
              }}
            >
              Move to Production
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}