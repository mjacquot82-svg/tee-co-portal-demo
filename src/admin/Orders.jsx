import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { demoOrders } from "../data/demoOrders";
import { getStoredOrders } from "../lib/ordersStore";
import StatusBadge from "../components/StatusBadge";

function isDueSoon(dateValue) {
  if (!dateValue) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(`${dateValue}T00:00:00`);
  const fiveDaysFromNow = new Date(today);
  fiveDaysFromNow.setDate(today.getDate() + 5);

  return dueDate >= today && dueDate <= fiveDaysFromNow;
}

const statusTabs = [
  {
    key: "all",
    label: "All Production Orders",
    statuses: [],
    description: "Every custom or decorated order in the system.",
  },
  {
    key: "quote",
    label: "Quotes / Approval",
    statuses: ["Submitted", "Awaiting Artwork", "Quote Sent", "Mockup Sent", "Awaiting Approval", "Awaiting Customer Approval"],
    description: "Orders that still need artwork, quote review, or customer approval.",
  },
  {
    key: "deposit",
    label: "Awaiting Deposit",
    statuses: ["Approved", "Awaiting Deposit", "Deposit Requested"],
    description: "Approved orders that should not move forward until deposit payment is handled.",
    match: (order) => ["approved", "awaiting deposit", "deposit requested"].includes(normalizeStatus(order.status)) && order.deposit?.status !== "paid",
  },
  {
    key: "production",
    label: "In Production",
    statuses: ["Approved", "Paid", "Deposit Paid", "Ready for Production", "In Production", "Printing", "Embroidery", "Production"],
    description: "Orders currently ready for or actively moving through shop work.",
    match: (order) => ["approved", "paid", "deposit paid", "ready for production", "in production", "printing", "embroidery", "production"].includes(normalizeStatus(order.status)) || order.production_ready,
  },
  {
    key: "due-soon",
    label: "Due Soon",
    statuses: [],
    description: "Open orders needed within the next 5 days.",
    match: (order) => isDueSoon(order.due_date) && !["completed", "cancelled"].includes(normalizeStatus(order.status)),
  },
  {
    key: "pickup",
    label: "Ready for Pickup",
    statuses: ["Ready", "Ready for Pickup", "Pickup Ready", "Completed"],
    description: "Finished orders waiting for customer pickup or delivery.",
  },
];

const filterToTab = {
  approval: "quote",
  "deposit-required": "deposit",
  "due-soon": "due-soon",
  "pickup-ready": "pickup",
};

function normalizeOrder(order, index = 0) {
  return {
    ...order,
    customer_name: order.customer_name || ["ABC Construction", "City Hockey", "Fire Dept"][index] || "Walk-in Customer",
    garment: order.garment || order.item || "Custom garment",
    status:
      order.status === "Submitted" || order.status === "Paid"
        ? "Approved"
        : order.status || "Awaiting Artwork",
    qty: order.qty || 0,
    placement: order.placement || "—",
    date: order.date || "—",
    due_date: order.due_date || "",
  };
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function tabMatchesOrder(order, tab) {
  if (tab.key === "all") return true;
  if (tab.match) return tab.match(order);
  const allowedStatuses = tab.statuses.map(normalizeStatus);
  return allowedStatuses.includes(normalizeStatus(order.status));
}

function countOrdersForTab(orders, tab) {
  return orders.filter((order) => tabMatchesOrder(order, tab)).length;
}

export default function Orders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParam = searchParams.get("filter");
  const initialTabKey = filterToTab[filterParam] || "all";
  const [activeTabKey, setActiveTabKey] = useState(initialTabKey);
  const storedOrders = getStoredOrders().map(normalizeOrder);
  const demoQueueOrders = demoOrders.map(normalizeOrder);
  const orders = storedOrders.length ? storedOrders : demoQueueOrders;

  const activeTab = statusTabs.find((tab) => tab.key === activeTabKey) || statusTabs[0];

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => tabMatchesOrder(order, activeTab));
  }, [activeTab, orders]);

  function selectTab(tabKey) {
    setActiveTabKey(tabKey);
    setSearchParams(tabKey === "all" ? {} : { filter: tabKey });
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
            <p style={{ margin: 0, color: "#78716c", fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Production Control
            </p>
            <h1 style={{ margin: "6px 0 8px", fontSize: "30px" }}>Production Orders</h1>
            <p style={{ margin: 0, color: "#475569" }}>
              Track custom apparel jobs by quote, deposit, production, and pickup status.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link
              to="/admin/queue"
              style={{
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#0f172a",
                borderRadius: "12px",
                padding: "12px 16px",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Production Queue
            </Link>

            <Link
              to="/admin/orders/new"
              style={{
                border: "1px solid #171717",
                background: "#171717",
                color: "#ffffff",
                borderRadius: "12px",
                padding: "12px 16px",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              New Production Order
            </Link>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            overflowX: "auto",
            paddingBottom: "10px",
            marginBottom: "14px",
          }}
        >
          {statusTabs.map((tab) => {
            const active = activeTab.key === tab.key;
            const count = countOrdersForTab(orders, tab);

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => selectTab(tab.key)}
                style={{
                  whiteSpace: "nowrap",
                  border: active ? "1px solid #171717" : "1px solid #d6d3d1",
                  background: active ? "#171717" : "#ffffff",
                  color: active ? "#ffffff" : "#171717",
                  borderRadius: "999px",
                  padding: "9px 13px",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "13px",
                }}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "14px",
            padding: "12px 14px",
            marginBottom: "16px",
            color: "#475569",
          }}
        >
          <strong style={{ color: "#292524" }}>{activeTab.label}:</strong> {activeTab.description}
        </div>

        {filteredOrders.length ? (
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
                  <th style={{ padding: "12px 8px" }}>Due</th>
                  <th style={{ padding: "12px 8px" }}>Created</th>
                </tr>
              </thead>

              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.order_number} style={{ borderBottom: "1px solid #e2e8f0" }}>
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
                    <td style={{ padding: "14px 8px", color: "#92400e", fontWeight: 700 }}>
                      {order.due_date || "—"}
                    </td>
                    <td style={{ padding: "14px 8px", color: "#475569" }}>{order.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              border: "1px dashed #cbd5e1",
              borderRadius: "16px",
              padding: "28px",
              textAlign: "center",
              color: "#64748b",
            }}
          >
            <h2 style={{ margin: "0 0 8px", color: "#292524" }}>No orders in this section</h2>
            <p style={{ margin: "0 0 16px" }}>
              Orders will appear here once their status matches this workflow stage.
            </p>
            <Link
              to="/admin/orders/new"
              style={{
                display: "inline-block",
                border: "1px solid #171717",
                background: "#171717",
                color: "#ffffff",
                borderRadius: "12px",
                padding: "12px 16px",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Create Production Order
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
