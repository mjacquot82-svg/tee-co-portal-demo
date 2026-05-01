import { Link } from "react-router-dom";
import { demoOrders } from "../data/demoOrders";
import { getStoredOrders } from "../lib/ordersStore";
import StatusBadge from "../components/StatusBadge";

const queueStatuses = [
  "Approved",
  "In Production",
  "Printing",
  "Embroidery",
  "Ready for Pickup",
];

const waitingStatuses = [
  "Awaiting Artwork",
  "Mockup Sent",
  "Quote Sent",
  "Awaiting Approval",
  "Awaiting Deposit",
  "Deposit Requested",
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

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isShopReady(order) {
  const status = normalizeStatus(order.status);
  return (
    order.production_ready ||
    ["approved", "paid", "in production", "printing", "embroidery", "ready for pickup"].includes(status)
  );
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
      {highlightReady && (
        <span style={{ color: "#166534", fontSize: "13px", fontWeight: 800 }}>
          Ready for shop work • Deposit {order.deposit_status}
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
  const productionReadyOrders = orders.filter(isShopReady);
  const waitingOrders = orders.filter((order) =>
    waitingStatuses.map(normalizeStatus).includes(normalizeStatus(order.status))
  );

  const groupedOrders = queueStatuses.reduce((groups, status) => {
    const statusKey = normalizeStatus(status);
    groups[status] = orders.filter((order) => {
      const orderStatus = normalizeStatus(order.status);
      if (statusKey === "approved") return orderStatus === "approved" || orderStatus === "paid";
      return orderStatus === statusKey;
    });
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
            Shop Floor View
          </p>
          <h1 style={{ margin: "6px 0 8px", fontSize: "30px" }}>Production Queue</h1>
          <p style={{ margin: 0, color: "#64748b" }}>
            Focus on orders that are approved, paid enough, in production, or ready for pickup.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link
            to="/admin/orders"
            style={{
              background: "#ffffff",
              color: "#171717",
              textDecoration: "none",
              border: "1px solid #cbd5e1",
              borderRadius: "12px",
              padding: "12px 16px",
              fontWeight: 700,
            }}
          >
            Production Orders
          </Link>
          <Link
            to="/admin/orders/new"
            style={{
              background: "#ffffff",
              color: "#171717",
              textDecoration: "none",
              border: "1px solid #cbd5e1",
              borderRadius: "12px",
              padding: "12px 16px",
              fontWeight: 700,
            }}
          >
            + New Production Order
          </Link>
        </div>
      </div>

      {waitingOrders.length > 0 && (
        <section
          style={{
            background: "#fffbeb",
            borderRadius: "18px",
            border: "1px solid #fde68a",
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
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: "20px" }}>Waiting Before Production</h2>
              <p style={{ margin: "4px 0 0", color: "#92400e" }}>
                {waitingOrders.length} order{waitingOrders.length === 1 ? "" : "s"} still need artwork, approval, or deposit before the shop should start.
              </p>
            </div>
            <Link
              to="/admin/orders"
              style={{
                background: "#ffffff",
                color: "#92400e",
                textDecoration: "none",
                border: "1px solid #fbbf24",
                borderRadius: "12px",
                padding: "10px 14px",
                fontWeight: 800,
              }}
            >
              Review in Production Orders
            </Link>
          </div>
        </section>
      )}

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
            <h2 style={{ margin: 0, fontSize: "20px" }}>Ready for Shop Work</h2>
            <p style={{ margin: "4px 0 0", color: "#64748b" }}>
              Approved or paid orders that should now be visible to production staff.
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
            <p style={{ color: "#94a3b8", margin: "8px 0" }}>No jobs are ready for shop work yet.</p>
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
