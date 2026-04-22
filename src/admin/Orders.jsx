import { Link } from "react-router-dom";
import { demoOrders } from "../data/demoOrders";
import StatusBadge from "../components/StatusBadge";

export default function Orders() {
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
          background: "#ffffff",
          borderRadius: "20px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "30px" }}>Orders</h1>
            <p style={{ marginTop: "8px", color: "#475569" }}>
              Review incoming requests, payment status, and production readiness.
            </p>
          </div>

          <button
            style={{
              border: "1px solid #cbd5e1",
              background: "#fff",
              borderRadius: "12px",
              padding: "12px 16px",
              cursor: "pointer",
            }}
          >
            Filter
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "12px 8px" }}>Order</th>
                <th style={{ padding: "12px 8px" }}>Customer</th>
                <th style={{ padding: "12px 8px" }}>Item</th>
                <th style={{ padding: "12px 8px" }}>Qty</th>
                <th style={{ padding: "12px 8px" }}>Placement</th>
                <th style={{ padding: "12px 8px" }}>Status</th>
                <th style={{ padding: "12px 8px" }}>Date</th>
              </tr>
            </thead>

            <tbody>
              {demoOrders.map((order) => (
                <tr
                  key={order.order_number}
                  style={{ borderBottom: "1px solid #e2e8f0" }}
                >
                  <td style={{ padding: "14px 8px" }}>
                    <Link
                      to={`/admin/orders/${order.order_number}`}
                      style={{
                        color: "#0f172a",
                        fontWeight: "600",
                        textDecoration: "none",
                      }}
                    >
                      {order.order_number}
                    </Link>
                  </td>
                  <td style={{ padding: "14px 8px" }}>{order.customer_name}</td>
                  <td style={{ padding: "14px 8px" }}>{order.garment}</td>
                  <td style={{ padding: "14px 8px" }}>{order.qty}</td>
                  <td style={{ padding: "14px 8px" }}>{order.placement}</td>
                  <td style={{ padding: "14px 8px" }}>
                    <StatusBadge status={order.status} />
                  </td>
                  <td style={{ padding: "14px 8px", color: "#475569" }}>
                    {order.date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}