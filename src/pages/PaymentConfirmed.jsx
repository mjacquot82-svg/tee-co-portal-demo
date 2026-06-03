import { Link, useSearchParams } from "react-router-dom";
import { useOrders } from "../repositories/ordersRepository";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function PaymentConfirmed() {
  const [searchParams] = useSearchParams();
  const orders = useOrders();
  const orderNumber = String(searchParams.get("order") || "").trim();
  const order = orders.find((entry) => entry.order_number === orderNumber);
  const depositAmount = Number(order?.deposit_amount) || 0;
  const depositApplied = Number(order?.deposit_applied) || 0;
  const depositVerified =
    order?.deposit_workflow_status === "Deposit Received" ||
    (depositAmount > 0 && depositApplied >= depositAmount);
  const statusLabel = order?.deposit_workflow_status || order?.payment_status || "Updated";

  if (!order) {
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
          <h1 style={{ marginTop: 0 }}>Order not found</h1>

          <p style={{ color: "#475569", lineHeight: 1.6 }}>
            We could not load the order tied to this payment confirmation.
          </p>

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
          {depositVerified
            ? `Your deposit has been received for order ${order.order_number}. Tee & Co has been notified and your order record has been updated.`
            : "Payment could not be verified."}
        </p>

        <div
          style={{
            background: "#f8fafc",
            borderRadius: "16px",
            padding: "18px",
            marginTop: "24px",
            textAlign: "left",
            display: "grid",
            gap: "6px",
          }}
        >
          <p style={{ margin: 0 }}>
            <strong>Customer:</strong> {order.customer_name || "Customer"}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Order:</strong> {order.order_number}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Deposit Paid:</strong> {money(order.deposit_amount)}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Remaining Balance:</strong> {money(order.balance_due)}
          </p>
        </div>

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
            Status Updated: {statusLabel}
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
