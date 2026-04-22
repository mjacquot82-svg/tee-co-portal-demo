import { Link } from "react-router-dom";

export default function PaymentConfirmed() {
  return (
    <div
      style={{
        maxWidth: "700px",
        margin: "0 auto",
        padding: "24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "20px",
          padding: "32px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Payment Confirmed</h1>

        <p style={{ color: "#475569", lineHeight: 1.6 }}>
          Your deposit has been received for order TC-1002. Tee &amp; Co can now
          move your order into production.
        </p>

        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #86efac",
            borderRadius: "16px",
            padding: "18px",
            marginTop: "24px",
          }}
        >
          <p style={{ margin: 0, fontWeight: "600", color: "#166534" }}>
            Status Updated: Paid
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: "28px",
          }}
        >
          <Link
            to="/my-orders"
            style={{
              background: "#0f172a",
              color: "#fff",
              padding: "14px 18px",
              borderRadius: "12px",
              textDecoration: "none",
              fontWeight: "600",
            }}
          >
            Back to My Orders
          </Link>

          <Link
            to="/"
            style={{
              border: "1px solid #cbd5e1",
              color: "#0f172a",
              padding: "14px 18px",
              borderRadius: "12px",
              textDecoration: "none",
              background: "#fff",
            }}
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}