import { Link } from "react-router-dom";
import { demoOrders } from "../data/demoOrders";
import { getStoredOrders } from "../lib/ordersStore";
import StatusBadge from "../components/StatusBadge";

const queueStatuses = [
  "Awaiting Artwork",
  "Mockup Sent",
  "Approved",
  "In Production",
  "Ready for Pickup",
  "Completed",
];

const fallbackStatus = "Awaiting Artwork";

function normalizeOrder(order) {
  return {
    ...order,
    customer_name: order.customer_name || "Walk-in Customer",
    garment: order.garment || order.item || "Custom garment",
    status: order.status || fallbackStatus,
    due_date: order.due_date || "",
    production_ready: Boolean(order.production_ready),
    deposit_status: order.deposit?.status || "not set",
  };
}

function OrderCard({ order, highlightReady = false }) {
  return (
    <Link
      to={`/admin/orders/${order.order_number}`}
      style={{
        display: "grid",
        gap: "7px",
        textDecoration: "none",
        color: "#0f172a",
        background: highlightReady ? "#f0fdf4" : "#f8fafc",
        border: highlightReady ? "1px solid #86efac" : "1px solid #e2e8f0",
        borderRadius: "14px",
        padding: "12px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "8px",
          alignItems: "center",
        }}
      >
        <strong>{order.order_number}</strong>
        <StatusBadge status={order.status} />
      </div>
      <span style={{ color: "#334155", fontWeight: 600 }}>{order.customer_name}</span>
      <span style={{ color: "#64748b", fontSize: "14px" }}>{order.garment}</span>
      {order.due_date && (
        <span style={{ color: "#92400e", fontSize: "13px", fontWeight: 700 }}>
          Due: {order.due_date}
        </span>
      )}
      {order.production_ready && (
        <span style={{ color: "#166534", fontSize: "13px", fontWeight: 800 }}>
          Production Ready • Deposit {order.deposit_status}
        </span>
      )}
    </Link>
  );
}

export default function Queue() {
  const storedOrders = getStoredOrders().map(normalizeOrder);
  const demoQueueOrders = demoOrders.map((order, index) =>
    normalizeOrder({
      ...order,
      customer_name: order.customer_name || ["ABC Construction", "City Hockey", "Fire Dept"][index] || "Demo Customer",
      due_date: order.due_date || "",
      status: order.status === "Submitted" || order.status === "Paid" ? "Approved" : order.status,
    })
  );

  const orders = storedOrders.length ? storedOrders : demoQueueOrders;
  const productionReadyOrders = orders.filter((order) => order.production_ready);

  const groupedOrders = queueStatuses.reduce((groups, status) => {
    groups[status] = orders.filter((order) => order.status === status);
    return groups;
  }, {});

  return (
    <div
      style={{
        maxWidth: "1360px",
        margin: "0 auto",
        padding: "24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "14px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: "#78716c",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Production Pipeline
          </p>
          <h1 style={{ margin: "6px 0 8px", fontSize: "30px" }}>Production Queue</h1>
          <p style={{ margin: 0, color: "#64748b" }}>
            Track jobs by production stage, deposit readiness, and shop production priority.
          </p>
        </div>

        <Link
          to="/admin/orders/new"
          style={{
            background: "#171717",
            color: "#ffffff",
            textDecoration: "none",
            borderRadius: "12px",
            padding: "12px 16px",
            fontWeight: 700,
          }}
        >
          New Order
        </Link>
      </div>

      <section
        style={{
          background: "#ffffff",
          borderRadius: "18px",
          border: "1px solid #bbf7d0",
          padding: "16px",
          marginBottom: "18px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "10px",
            marginBottom: "12px",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "20px" }}>Ready to Stitch</h2>
            <p style={{ margin: "4px 0 0", color: "#64748b" }}>
              Jobs with approval and payment/deposit complete enough to begin production.
            </p>
          </div>
          <span
            style={{
              background: "#dcfce7",
              borderRadius: "999px",
              padding: "5px 10px",
              color: "#166534",
              fontWeight: 800,
              fontSize: "13px",
            }}
          >
            {productionReadyOrders.length}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
          {productionReadyOrders.length ? (
            productionReadyOrders.map((order) => (
              <OrderCard key={`ready-${order.order_number}`} order={order} highlightReady />
            ))
          ) : (
            <p style={{ color: "#94a3b8", margin: "8px 0" }}>No jobs are production-ready yet.</p>
          )}
        </div>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "14px",
          alignItems: "start",
        }}
      >
        {queueStatuses.map((status) => (
          <section
            key={status}
            style={{
              background: "#ffffff",
              borderRadius: "18px",
              border: "1px solid #e2e8f0",
              padding: "14px",
              minHeight: "220px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "10px",
                marginBottom: "12px",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "17px" }}>{status}</h2>
              <span
                style={{
                  background: "#f1f5f9",
                  borderRadius: "999px",
                  padding: "4px 9px",
                  color: "#475569",
                  fontWeight: 700,
                  fontSize: "12px",
                }}
              >
                {groupedOrders[status]?.length || 0}
              </span>
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              {groupedOrders[status]?.length ? (
                groupedOrders[status].map((order) => (
                  <OrderCard key={order.order_number} order={order} />
                ))
              ) : (
                <p style={{ color: "#94a3b8", margin: "12px 0" }}>No jobs in this stage.</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
