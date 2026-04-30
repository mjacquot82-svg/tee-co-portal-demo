import { useParams } from "react-router-dom";
import { findStoredOrder, updateStoredOrder } from "../lib/ordersStore";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function QuoteView() {
  const { orderNumber } = useParams();

  const order = findStoredOrder(orderNumber);
  const quote = order?.quote;

  function approveQuote() {
    updateStoredOrder(orderNumber, {
      approval_status: "Approved",
      approved_at: new Date().toISOString(),
    });

    alert("Quote approved successfully.");
  }

  function requestChanges() {
    updateStoredOrder(orderNumber, {
      approval_status: "Revision Requested",
      revision_requested_at: new Date().toISOString(),
    });

    alert("Revision request sent.");
  }

  if (!order || !quote) {
    return (
      <div style={{ padding: "40px", fontFamily: "Inter, sans-serif" }}>
        <h2>Quote not available</h2>
        <p>This quote link is invalid or has expired.</p>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "700px",
        margin: "0 auto",
        padding: "40px 20px",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <h1>Quote Preview</h1>

      <p><strong>Customer:</strong> {quote.customer_name}</p>
      <p><strong>Garment:</strong> {quote.garment}</p>
      <p><strong>Quantity:</strong> {quote.quantity}</p>

      <table style={{ width: "100%", marginTop: "20px" }}>
        <thead>
          <tr>
            <th align="left">Placement</th>
            <th align="left">Decoration</th>
            <th align="right">Line Total</th>
          </tr>
        </thead>
        <tbody>
          {quote.placement_lines.map((line, index) => (
            <tr key={index}>
              <td>{line.placement}</td>
              <td>{line.decoration_type}</td>
              <td align="right">{money(line.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: "20px" }}>Total: {money(quote.total)}</h2>

      <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
        <button
          onClick={approveQuote}
          style={{
            background: "#166534",
            color: "white",
            border: "none",
            padding: "12px 18px",
            borderRadius: "10px",
            cursor: "pointer",
            fontWeight: "600",
          }}
        >
          Approve Quote
        </button>

        <button
          onClick={requestChanges}
          style={{
            background: "#fff7ed",
            color: "#9a3412",
            border: "1px solid #fed7aa",
            padding: "12px 18px",
            borderRadius: "10px",
            cursor: "pointer",
            fontWeight: "600",
          }}
        >
          Request Changes
        </button>
      </div>
    </div>
  );
}
