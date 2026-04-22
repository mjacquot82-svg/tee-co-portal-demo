import { Link, useNavigate } from "react-router-dom";

export default function DepositPayment() {
  const navigate = useNavigate();

  function handleConfirmPayment() {
    navigate("/payment-confirmed");
  }

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
        <h1 style={{ marginTop: 0 }}>Deposit Payment</h1>

        <p style={{ color: "#475569" }}>
          This demo simulates a deposit payment request sent by Tee &amp; Co.
        </p>

        <div
          style={{
            background: "#f8fafc",
            borderRadius: "16px",
            padding: "20px",
            marginTop: "20px",
          }}
        >
          <p style={{ margin: 0 }}>Order: TC-1002</p>
          <p style={{ margin: "6px 0 0 0" }}>Deposit Amount: $120</p>
        </div>

        <button
          onClick={handleConfirmPayment}
          style={{
            marginTop: "24px",
            background: "#0f172a",
            color: "#fff",
            border: "none",
            borderRadius: "12px",
            padding: "14px 20px",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          Confirm Payment
        </button>

        <div style={{ marginTop: "24px" }}>
          <Link
            to="/my-orders"
            style={{
              textDecoration: "none",
              color: "#0f172a",
              fontWeight: "600",
            }}
          >
            Back to My Orders
          </Link>
        </div>
      </div>
    </div>
  );
}