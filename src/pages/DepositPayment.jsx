import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { recordOrderPayment, useOrders } from "../repositories/ordersRepository";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function DepositPayment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orders = useOrders();
  const [submissionError, setSubmissionError] = useState("");
  const orderNumber = String(searchParams.get("order") || "").trim();
  const order = orders.find((entry) => entry.order_number === orderNumber);
  const depositAmount = Number(order?.deposit_amount) || 0;
  const depositApplied = Number(order?.deposit_applied) || 0;
  const depositAlreadyReceived =
    order?.deposit_workflow_status === "Deposit Received" ||
    (depositAmount > 0 && depositApplied >= depositAmount);
  const canConfirmPayment = depositAmount > 0 && !depositAlreadyReceived;

  function handleConfirmPayment() {
    if (!order || !canConfirmPayment) return;

    setSubmissionError("");

    try {
      recordOrderPayment(order.order_number, {
        amount: depositAmount,
        method: "Customer Deposit Link",
        note: "Deposit received from customer payment page",
      });
    } catch (error) {
      setSubmissionError(error?.message || "Payment could not be verified.");
      return;
    }

    navigate(`/payment-confirmed?order=${encodeURIComponent(order.order_number)}`);
  }

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
            This deposit payment link is invalid or the order is no longer available.
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
            <strong>Deposit Amount:</strong> {money(depositAmount)}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Balance Due:</strong> {money(order.balance_due)}
          </p>
        </div>

        {depositAlreadyReceived ? (
          <p style={{ margin: "20px 0 0", color: "#166534", lineHeight: 1.6 }}>
            Deposit has already been received for this order.
          </p>
        ) : null}

        {!depositAlreadyReceived && !canConfirmPayment ? (
          <p style={{ margin: "20px 0 0", color: "#b45309", lineHeight: 1.6 }}>
            This order does not currently have a deposit amount available for payment.
          </p>
        ) : null}

        {submissionError ? (
          <p style={{ margin: "20px 0 0", color: "#b91c1c", lineHeight: 1.6 }}>
            {submissionError}
          </p>
        ) : null}

        <button
          onClick={handleConfirmPayment}
          disabled={!canConfirmPayment}
          style={{
            marginTop: "24px",
            background: canConfirmPayment ? "#0f172a" : "#94a3b8",
            color: "#fff",
            border: "none",
            borderRadius: "12px",
            padding: "14px 20px",
            fontWeight: "600",
            cursor: canConfirmPayment ? "pointer" : "not-allowed",
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
