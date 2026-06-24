import { useMemo, useState } from "react";
import { createPaymentRequest } from "../lib/paymentsStore";
import { getActiveStaffUser } from "../lib/staffUsersStore";
import { normalizeOrderFinancials } from "../orders/orderFinancials";

const requestTypes = [
  { value: "deposit", label: "Deposit" },
  { value: "balance", label: "Balance" },
  { value: "full_payment", label: "Full Payment" },
  { value: "custom_amount", label: "Custom Amount" },
];

const fieldStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "11px 12px",
  fontSize: "14px",
  width: "100%",
  boxSizing: "border-box",
  background: "#ffffff",
};

const labelStyle = {
  display: "grid",
  gap: "7px",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 800,
};

function moneyValue(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100) / 100);
}

function getCustomerName(customer = {}, order = {}) {
  return customer.name || customer.company || order.customer_name || "Customer";
}

function deriveRequestAmount(requestType, financials, customAmount) {
  if (requestType === "deposit") {
    return moneyValue(
      Number(financials.deposit_amount || 0) - Number(financials.deposit_applied || financials.deposit_paid_amount || 0)
    );
  }
  if (requestType === "balance") return moneyValue(financials.balance_due);
  if (requestType === "full_payment") return moneyValue(financials.total_amount || financials.balance_due);
  return moneyValue(customAmount);
}

export default function PaymentRequestForm({
  id,
  title = "Create Payment Request",
  description = "Create an internal payment request record for staff follow-up. This does not send a payment link.",
  customer = null,
  order = null,
  orders = [],
  defaultType = "deposit",
  onCreated,
}) {
  const normalizedOrders = useMemo(
    () => orders.map((entry) => normalizeOrderFinancials(entry)),
    [orders]
  );
  const initialOrderNumber = order?.order_number || normalizedOrders[0]?.order_number || "";
  const [selectedOrderNumber, setSelectedOrderNumber] = useState(initialOrderNumber);
  const selectedOrder = useMemo(
    () =>
      order ||
      normalizedOrders.find((entry) => entry.order_number === selectedOrderNumber) ||
      null,
    [normalizedOrders, order, selectedOrderNumber]
  );
  const financials = useMemo(
    () => (selectedOrder ? normalizeOrderFinancials(selectedOrder) : {}),
    [selectedOrder]
  );
  const [requestType, setRequestType] = useState(defaultType);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");

  const amountRequested = deriveRequestAmount(requestType, financials, customAmount);
  const canSubmit = amountRequested > 0;

  function handleSubmit(event) {
    event.preventDefault();
    const activeStaffUser = getActiveStaffUser();
    const request = createPaymentRequest({
      customer_id: customer?.id || selectedOrder?.customer_id || "",
      order_id: selectedOrder?.id || "",
      order_number: selectedOrder?.order_number || "",
      quote_id: selectedOrder?.operational_visible === false ? selectedOrder?.id || selectedOrder?.order_number || "" : "",
      request_type: requestType,
      status: "open",
      amount_requested: amountRequested,
      amount_paid: 0,
      currency: "CAD",
      description: `${requestTypes.find((type) => type.value === requestType)?.label || "Payment"} request`,
      customer_message: message,
      payment_provider: "manual",
      created_by_staff_user_id: activeStaffUser?.id || "",
      metadata: {
        source: "admin_payments_module",
        customer_name: getCustomerName(customer || {}, selectedOrder || {}),
      },
    });

    setFeedback(`Created ${request.request_number} for $${request.amount_requested.toFixed(2)}.`);
    setMessage("");
    if (requestType === "custom_amount") setCustomAmount("");
    onCreated?.(request);
  }

  return (
    <section
      id={id}
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "18px",
        padding: "18px",
        background: "#ffffff",
        display: "grid",
        gap: "14px",
      }}
    >
      <div>
        <h2 style={{ margin: "0 0 6px", fontSize: "20px" }}>{title}</h2>
        <p style={{ margin: 0, color: "#64748b" }}>{description}</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
          }}
        >
          {order ? null : (
            <label style={labelStyle}>
              Related Order
              <select
                value={selectedOrderNumber}
                onChange={(event) => setSelectedOrderNumber(event.target.value)}
                style={fieldStyle}
              >
                <option value="">No related order</option>
                {normalizedOrders.map((entry) => (
                  <option key={entry.order_number} value={entry.order_number}>
                    {entry.order_number} - {entry.customer_name || getCustomerName(customer || {}, entry)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label style={labelStyle}>
            Request Type
            <select
              value={requestType}
              onChange={(event) => setRequestType(event.target.value)}
              style={fieldStyle}
            >
              {requestTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>

          {requestType === "custom_amount" ? (
            <label style={labelStyle}>
              Custom Amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
                style={fieldStyle}
              />
            </label>
          ) : (
            <div style={labelStyle}>
              Amount
              <div
                style={{
                  ...fieldStyle,
                  fontWeight: 900,
                  color: amountRequested > 0 ? "#0f172a" : "#b91c1c",
                }}
              >
                ${amountRequested.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        <label style={labelStyle}>
          Staff Note
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            style={{ ...fieldStyle, resize: "vertical" }}
            placeholder="Optional internal context for this request"
          />
        </label>

        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              border: "none",
              borderRadius: "12px",
              background: canSubmit ? "#0f172a" : "#cbd5e1",
              color: "#ffffff",
              padding: "11px 14px",
              fontWeight: 800,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            Create Request
          </button>
          {feedback ? <span style={{ color: "#166534", fontWeight: 700 }}>{feedback}</span> : null}
        </div>
      </form>
    </section>
  );
}
