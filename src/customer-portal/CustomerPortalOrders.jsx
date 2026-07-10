import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  EmptyState,
  PortalPage,
  RecordList,
  SectionCard,
  resolveCustomerOrderStatus,
} from "./CustomerPortalShared";
import { useCustomerPortalData } from "./useCustomerPortalData";
import { getPaymentRequestsByOrder, usePaymentsSnapshot } from "../lib/paymentsStore";
import { resolvePortalOrderAttention } from "./portalOrderDetail";
import { PORTAL_REQUEST_ORDER_PATH } from "./customerPortalStartOrderRoute";

function formatOrderBalance(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? `$${amount.toFixed(2)}` : "";
}

function getPrimaryItemName(order = {}) {
  return (
    String(order.garment || "").trim() ||
    String(order.product_name || "").trim() ||
    String(order.category || "").trim() ||
    "Custom order"
  );
}

function getAttentionStyle(tone) {
  const styles = {
    warning: {
      background: "#fffbeb",
      border: "#fde68a",
      color: "#92400e",
      dot: "#f59e0b",
    },
    success: {
      background: "#ecfdf5",
      border: "#bbf7d0",
      color: "#166534",
      dot: "#22c55e",
    },
    info: {
      background: "#eff6ff",
      border: "#bfdbfe",
      color: "#1d4ed8",
      dot: "#3b82f6",
    },
    neutral: {
      background: "#f8fafc",
      border: "#dbe4ee",
      color: "#475569",
      dot: "#94a3b8",
    },
  };

  return styles[tone] || styles.neutral;
}

function CompactOrderCard({ order, expanded, onToggle }) {
  const orderNumber = order.order_number || order.id || "Portal order";
  const paymentRequests = getPaymentRequestsByOrder(order.order_number);
  const status = resolveCustomerOrderStatus(order);
  const attention = resolvePortalOrderAttention(order, paymentRequests);
  const attentionStyle = getAttentionStyle(attention.tone);
  const balance = formatOrderBalance(order.balance_due);
  const itemName = getPrimaryItemName(order);

  return (
    <article
      data-testid="portal-compact-order-card"
      style={{
        borderRadius: "22px",
        border: attention.requiresAction ? "1px solid #fde68a" : "1px solid #dbe4ee",
        background: "#ffffff",
        boxShadow: attention.requiresAction
          ? "0 18px 34px rgba(245, 158, 11, 0.12)"
          : "0 12px 28px rgba(15, 23, 42, 0.05)",
        overflow: "hidden",
      }}
    >
      <div
        className="portal-compact-order-summary"
        style={{
          padding: "18px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: "16px",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: "10px", minWidth: 0 }}>
          <div style={{ display: "grid", gap: "4px" }}>
            <strong style={{ color: "#0f172a", fontSize: "20px", lineHeight: 1.1 }}>
              {orderNumber}
            </strong>
            <p
              style={{
                margin: 0,
                color: "#334155",
                fontSize: "15px",
                lineHeight: 1.4,
                fontWeight: 700,
              }}
            >
              {itemName}
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                borderRadius: "999px",
                padding: "8px 11px",
                background: attentionStyle.background,
                border: `1px solid ${attentionStyle.border}`,
                color: attentionStyle.color,
                fontSize: "13px",
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "999px",
                  background: attentionStyle.dot,
                }}
              />
              {attention.requiresAction ? `Action Required: ${attention.label}` : attention.label}
            </span>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: "999px",
                padding: "8px 11px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                color: "#475569",
                fontSize: "13px",
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {status.label}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            justifyItems: "end",
            gap: "10px",
            minWidth: "136px",
          }}
        >
          {balance ? (
            <div style={{ textAlign: "right" }}>
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: 0,
                  fontWeight: 900,
                }}
              >
                Balance
              </p>
              <p style={{ margin: "3px 0 0", color: "#0f172a", fontSize: "18px", fontWeight: 900 }}>
                {balance}
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            style={{
              minHeight: "42px",
              borderRadius: "999px",
              border: "1px solid #cbd5e1",
              background: expanded ? "#0f172a" : "#ffffff",
              color: expanded ? "#ffffff" : "#0f172a",
              padding: "10px 15px",
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: expanded ? "0 12px 24px rgba(15, 23, 42, 0.14)" : "none",
            }}
          >
            {expanded ? "Hide Details" : "View Details"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div
          data-testid="portal-expanded-order-details"
          style={{
            borderTop: "1px solid #e2e8f0",
            background: "#f8fafc",
            padding: "16px",
          }}
        >
          <RecordList records={[order]} type="orders" />
        </div>
      ) : null}
    </article>
  );
}

export default function CustomerPortalOrders() {
  const { customerSession } = useOutletContext();
  const { orders, archivedOrders, summary } = useCustomerPortalData(customerSession);
  const paymentsSnapshot = usePaymentsSnapshot();
  const [expandedOrderIds, setExpandedOrderIds] = useState(() => new Set());
  const renderCountRef = useRef(0);
  const attentionCount = useMemo(
    () =>
      orders.filter((order) =>
        resolvePortalOrderAttention(order, getPaymentRequestsByOrder(order.order_number)).requiresAction
      ).length,
    [orders, paymentsSnapshot]
  );

  renderCountRef.current += 1;

  useEffect(() => {
    console.debug("[portal] CustomerPortalOrders render", {
      renderCount: renderCountRef.current,
      activeOrderCount: orders.length,
      archivedOrderCount: archivedOrders.length,
      summary,
      orderNumbers: orders.map((order) => order.order_number || order.id || "unknown"),
    });
  }, [archivedOrders, orders, summary]);

  return (
    <PortalPage
      eyebrow="My Orders"
      title="My Orders"
      description="Current orders, next steps, and balances."
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
        }}
      >
        <div
          style={{
            borderRadius: "18px",
            border: "1px solid #dbe4ee",
            background: "#ffffff",
            padding: "16px",
            display: "grid",
            gap: "4px",
          }}
        >
          <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 900 }}>Active Orders</span>
          <strong style={{ color: "#0f172a", fontSize: "28px", lineHeight: 1 }}>
            {summary.orderCount}
          </strong>
        </div>
        <div
          style={{
            borderRadius: "18px",
            border: attentionCount ? "1px solid #fde68a" : "1px solid #dbe4ee",
            background: attentionCount ? "#fffbeb" : "#ffffff",
            padding: "16px",
            display: "grid",
            gap: "4px",
          }}
        >
          <span style={{ color: attentionCount ? "#92400e" : "#64748b", fontSize: "12px", fontWeight: 900 }}>
            Need Attention
          </span>
          <strong style={{ color: attentionCount ? "#92400e" : "#0f172a", fontSize: "28px", lineHeight: 1 }}>
            {attentionCount}
          </strong>
        </div>
        <div
          style={{
            borderRadius: "18px",
            border: summary.outstandingBalance > 0 ? "1px solid #bfdbfe" : "1px solid #dbe4ee",
            background: "#ffffff",
            padding: "16px",
            display: "grid",
            gap: "4px",
          }}
        >
          <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 900 }}>Outstanding</span>
          <strong style={{ color: "#0f172a", fontSize: "28px", lineHeight: 1 }}>
            ${summary.outstandingBalance.toFixed(2)}
          </strong>
        </div>
      </div>

      <SectionCard
        title="Current Orders"
        subtitle="Next steps first."
      >
        {orders.length ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {orders.map((order) => {
              const orderId = order.order_number || order.id || "";
              const expanded = expandedOrderIds.has(orderId);
              return (
                <CompactOrderCard
                  key={orderId}
                  order={order}
                  expanded={expanded}
                  onToggle={() => {
                    setExpandedOrderIds((current) => {
                      const next = new Set(current);
                      if (next.has(orderId)) {
                        next.delete(orderId);
                      } else {
                        next.add(orderId);
                      }
                      return next;
                    });
                  }}
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No active orders right now"
            description="Start a new request whenever you are ready. Once Tee & Co opens it inside the workflow, it will appear here automatically."
            actionLabel="Start New Order"
            actionTo={PORTAL_REQUEST_ORDER_PATH}
          />
        )}
      </SectionCard>

      {archivedOrders.length ? (
        <SectionCard
          title="Order History"
          subtitle="Completed or canceled records are moved here so your main order view stays focused on current work."
        >
          <div style={{ display: "grid", gap: "12px" }}>
            {archivedOrders.map((order) => {
              const orderId = order.order_number || order.id || "";
              const expanded = expandedOrderIds.has(orderId);
              return (
                <CompactOrderCard
                  key={orderId}
                  order={order}
                  expanded={expanded}
                  onToggle={() => {
                    setExpandedOrderIds((current) => {
                      const next = new Set(current);
                      if (next.has(orderId)) {
                        next.delete(orderId);
                      } else {
                        next.add(orderId);
                      }
                      return next;
                    });
                  }}
                />
              );
            })}
          </div>
        </SectionCard>
      ) : null}

      <div>
        <Link
          to={PORTAL_REQUEST_ORDER_PATH}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "46px",
            borderRadius: "999px",
            background: "#0f766e",
            color: "#ffffff",
            padding: "12px 18px",
            fontWeight: 900,
            textDecoration: "none",
            boxShadow: "0 14px 28px rgba(15, 118, 110, 0.18)",
          }}
        >
          Start New Order
        </Link>
      </div>
    </PortalPage>
  );
}
