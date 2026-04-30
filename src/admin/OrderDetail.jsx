import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { findStoredOrder, updateStoredOrder } from "../lib/ordersStore";

const statusOptions = [
  "Awaiting Artwork",
  "Mockup Sent",
  "Approved",
  "In Production",
  "Ready for Pickup",
  "Completed",
  "On Hold",
  "Cancelled",
];

export default function OrderDetail() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState("Awaiting Artwork");

  useEffect(() => {
    const stored = findStoredOrder(orderNumber);
    if (stored) {
      setOrder(stored);
      setStatus(stored.status || "Awaiting Artwork");
    }
  }, [orderNumber]);

  function handleStatusChange(event) {
    const nextStatus = event.target.value;
    setStatus(nextStatus);

    const updated = updateStoredOrder(orderNumber, {
      status: nextStatus,
    });

    if (updated) {
      setOrder(updated);
    }
  }

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
      <h1>Order {orderNumber}</h1>

      <div
        style={{
          marginBottom: "20px",
          display: "grid",
          gap: "8px",
          maxWidth: "280px",
        }}
      >
        <label style={{ fontWeight: 600 }}>Order Status</label>
        <select
          value={status}
          onChange={handleStatusChange}
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: "12px",
            padding: "12px",
            fontSize: "15px",
          }}
        >
          {statusOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>

      {order ? (
        <div
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <p>
            <strong>Customer:</strong> {order.customer_name}
          </p>
          <p>
            <strong>Garment:</strong> {order.garment}
          </p>
          <p>
            <strong>Placement:</strong> {order.placement}
          </p>
          <p>
            <strong>Decoration:</strong> {order.decoration_type}
          </p>
          <p>
            <strong>Qty:</strong> {order.qty}
          </p>
        </div>
      ) : (
        <p style={{ color: "#94a3b8" }}>Order not found.</p>
      )}
    </div>
  );
}
