import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ArtworkFilesSummary from "../components/ArtworkFilesSummary";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import StatusBadge from "../components/StatusBadge";
import ActivityTimeline from "../order-detail/ActivityTimeline";
import { demoOrders as seededDemoOrders } from "../data/demoOrders";
import { formatDateTime, formatShortDate } from "../lib/dateFormatting";
import { normalizeOperationalStatus } from "../orders/orderWorkflow";
import { useStoredOrders } from "../lib/ordersStore";
import {
  getArtworkAssetUrl,
  getArtworkDisplayName,
  getOrderArtworkFiles,
  isArtworkImage,
} from "../lib/orderArtwork";
import { normalizeOrderFinancials } from "../orders/orderFinancials";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function sortOrdersByRecentActivity(orders = []) {
  return [...orders].sort(
    (left, right) =>
      new Date(right.updated_at || right.created_at || 0).getTime() -
      new Date(left.updated_at || left.created_at || 0).getTime()
  );
}

function buildSubmittedOrderPreview(orderState = {}) {
  if (!orderState || typeof orderState !== "object" || !Object.keys(orderState).length) {
    return null;
  }

  const createdAt = orderState.created_at || new Date().toISOString();
  const placementList = Array.isArray(orderState.placements)
    ? orderState.placements
    : orderState.placement
    ? [orderState.placement]
    : [];
  const quote = orderState.quote || {};

  return normalizeOrderFinancials({
    order_number: orderState.orderNumber || "TEE-1042",
    status: "New",
    garment: orderState.garmentName || "Selected Garment",
    brand: orderState.brand || "Tee & Co",
    category: orderState.category || "Custom Order",
    color: orderState.selectedColor || "Black",
    size: orderState.selectedSize || "M",
    qty: Number(orderState.quantity || 1),
    placement: placementList[0] || "",
    placements: placementList.map((placement) => ({
      placement,
      artwork_name: orderState.artworkName || "",
      decoration_type: orderState.decorationType || "",
    })),
    customer_artwork_name: orderState.artworkName || "",
    notes: orderState.notes || "",
    subtotal: quote.subtotal,
    tax_amount: quote.taxAmount,
    total_amount: quote.totalAmount,
    created_at: createdAt,
    updated_at: createdAt,
    due_date: orderState.dueDate || "",
    pickup_status: "Pending",
    activity_log: [
      {
        id: "customer-order-submitted",
        type: "created",
        note: "Order request submitted and queued for Tee & Co review.",
        created_at: createdAt,
        staff_name: "Customer Portal",
        staff_role: "Portal",
      },
    ],
  });
}

function buildPortalOrders(storedOrders = [], latestOrder = null) {
  if (storedOrders.length) {
    return sortOrdersByRecentActivity(storedOrders);
  }

  const previewOrder = buildSubmittedOrderPreview(latestOrder);
  const fallbackOrders = seededDemoOrders.map((order) => normalizeOrderFinancials(order));

  if (!previewOrder) {
    return sortOrdersByRecentActivity(fallbackOrders);
  }

  const dedupedFallbackOrders = fallbackOrders.filter(
    (order) => order.order_number !== previewOrder.order_number
  );

  return sortOrdersByRecentActivity([previewOrder, ...dedupedFallbackOrders]);
}

function buildSummaryPills(order) {
  return [
    order.color ? `Color: ${order.color}` : null,
    order.size ? `Size: ${order.size}` : null,
    Number(order.qty || order.quantity || 0) > 0
      ? `Qty: ${Number(order.qty || order.quantity || 0)}`
      : null,
    order.placement ? `Placement: ${order.placement}` : null,
  ].filter(Boolean);
}

function buildDetailRows(order) {
  const quantity = Number(order.qty || order.quantity || 0);

  return [
    {
      label: "Garment",
      value: order.garment || order.garmentName || "Custom garment",
    },
    { label: "Color", value: order.color || "To be confirmed" },
    { label: "Size", value: order.size || "Mixed sizing" },
    { label: "Quantity", value: quantity > 0 ? String(quantity) : "To be confirmed" },
    {
      label: "Placements",
      value:
        Array.isArray(order.placements) && order.placements.length
          ? order.placements.map((placement) => placement.placement).filter(Boolean).join(", ")
          : order.placement || "Not specified yet",
    },
    {
      label: "Due date",
      value: order.due_date ? formatShortDate(order.due_date) : "Scheduling in progress",
    },
  ];
}

function renderReadinessMessage(order) {
  const operationalStatus = normalizeOperationalStatus(order.status);

  if (order.pickup_status === "Picked Up") {
    return "This order has already been released to you.";
  }

  if (order.pickup_status === "Ready for Pickup" && Number(order.balance_due || 0) > 0) {
    return `Order is ready for pickup. ${money(order.balance_due)} is still due before release.`;
  }

  if (order.pickup_status === "Ready for Pickup") {
    return "Order is complete and ready for pickup.";
  }

  if (Number(order.amount_due_now || 0) > 0) {
    return `${money(order.amount_due_now)} is due next to keep this order moving.`;
  }

  if (["Printing", "Embroidery", "QC / Finishing", "Ready For Production"].includes(operationalStatus)) {
    return "Production is underway. Timeline updates will appear below as work progresses.";
  }

  return "Tee & Co is actively managing this order. Open the timeline below for the latest operational context.";
}

function DetailTile({ label, value }) {
  return (
    <div
      style={{
        borderRadius: "16px",
        border: "1px solid #e7e5e4",
        background: "#fafaf9",
        padding: "14px 15px",
      }}
    >
      <p
        style={{
          margin: "0 0 4px 0",
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#78716c",
        }}
      >
        {label}
      </p>
      <p style={{ margin: 0, color: "#1c1917", fontWeight: 700, lineHeight: 1.4 }}>{value}</p>
    </div>
  );
}

function SummaryPill({ children }) {
  return (
    <span
      style={{
        borderRadius: "999px",
        padding: "8px 12px",
        background: "#f5f5f4",
        border: "1px solid #e7e5e4",
        color: "#44403c",
        fontSize: "13px",
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function ArtworkPreview({ artworkFiles = [] }) {
  const previewFile = artworkFiles.find((file) => isArtworkImage(file) && getArtworkAssetUrl(file));
  if (!previewFile) return null;

  return (
    <section
      style={{
        borderRadius: "20px",
        overflow: "hidden",
        border: "1px solid #d6d3d1",
        background: "#fafaf9",
      }}
    >
      <img
        src={getArtworkAssetUrl(previewFile)}
        alt={getArtworkDisplayName(previewFile)}
        style={{
          display: "block",
          width: "100%",
          maxHeight: "220px",
          objectFit: "cover",
          background: "#e7e5e4",
        }}
      />
      <div style={{ padding: "12px 14px" }}>
        <p style={{ margin: "0 0 4px 0", fontSize: "12px", color: "#78716c" }}>Artwork Preview</p>
        <p style={{ margin: 0, fontWeight: 700, color: "#1c1917" }}>
          {getArtworkDisplayName(previewFile)}
        </p>
      </div>
    </section>
  );
}

function CustomerOrderCard({ order, expanded, onToggle }) {
  const artworkFiles = getOrderArtworkFiles(order);
  const timeline = order.connected_timeline || order.activity_log || [];
  const summaryPills = buildSummaryPills(order);
  const detailRows = buildDetailRows(order);
  const quantity = Number(order.qty || order.quantity || 0);

  return (
    <article
      style={{
        background: "#ffffff",
        borderRadius: "22px",
        padding: "20px",
        border: expanded ? "1px solid #d6d3d1" : "1px solid #e7e5e4",
        boxShadow: expanded
          ? "0 16px 40px rgba(28,25,23,0.1)"
          : "0 10px 24px rgba(0,0,0,0.05)",
        transition: "box-shadow 180ms ease, border-color 180ms ease",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "16px",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: "8px", flex: "1 1 320px" }}>
          <div>
            <p
              style={{
                margin: "0 0 4px 0",
                fontSize: "12px",
                color: "#78716c",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Order #{order.order_number || order.id}
            </p>

            <h2
              style={{
                margin: 0,
                fontSize: "24px",
                lineHeight: 1.15,
                color: "#171717",
              }}
            >
              {order.garment || order.garmentName || "Custom garment"}
            </h2>

            <p
              style={{
                margin: "6px 0 0 0",
                color: "#78716c",
                fontSize: "14px",
                lineHeight: 1.5,
              }}
            >
              Placed {formatDateTime(order.created_at)}
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatusBadge status={order.status} />
            <PaymentStatusBadge status={order.payment_status || "Draft"} />
            {order.pickup_status ? <SummaryPill>{order.pickup_status}</SummaryPill> : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          style={{
            border: "none",
            borderRadius: "14px",
            padding: "12px 14px",
            background: expanded ? "#292524" : "#171717",
            color: "#ffffff",
            fontWeight: 800,
            fontSize: "13px",
            cursor: "pointer",
            minWidth: "132px",
          }}
        >
          {expanded ? "Minimize Order" : "Open Details"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginTop: "16px",
        }}
      >
        {summaryPills.map((pill) => (
          <SummaryPill key={pill}>{pill}</SummaryPill>
        ))}
        <SummaryPill>
          Artwork:{" "}
          {artworkFiles.length
            ? `${artworkFiles.length} file${artworkFiles.length === 1 ? "" : "s"}`
            : "None attached"}
        </SummaryPill>
      </div>

      {!expanded ? null : (
        <div style={{ display: "grid", gap: "18px", marginTop: "18px" }}>
          <section
            style={{
              borderRadius: "18px",
              padding: "16px 18px",
              border: "1px solid #e7e5e4",
              background: "linear-gradient(135deg, #fafaf9 0%, #f5f5f4 100%)",
            }}
          >
            <p
              style={{
                margin: "0 0 6px 0",
                fontSize: "12px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#78716c",
              }}
            >
              Status Message
            </p>
            <p style={{ margin: 0, color: "#1c1917", fontSize: "15px", lineHeight: 1.6 }}>
              {renderReadinessMessage(order)}
            </p>
          </section>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "12px",
            }}
          >
            {detailRows.map((item) => (
              <DetailTile key={item.label} label={item.label} value={item.value} />
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "16px",
            }}
          >
            <section
              style={{
                borderRadius: "20px",
                padding: "18px",
                border: "1px solid #e7e5e4",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: "0 0 4px 0", color: "#171717" }}>Payment & Deposit</h3>
                  <p style={{ margin: 0, color: "#78716c", fontSize: "13px" }}>
                    Customer-facing payment visibility for this order.
                  </p>
                </div>
                <PaymentStatusBadge status={order.payment_status || "Draft"} />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "12px",
                  marginTop: "14px",
                }}
              >
                <DetailTile label="Order total" value={money(order.total_amount)} />
                <DetailTile label="Paid to date" value={money(order.total_paid)} />
                <DetailTile label="Deposit requested" value={money(order.deposit_amount)} />
                <DetailTile
                  label={Number(order.balance_due || 0) > 0 ? "Balance remaining" : "Balance"}
                  value={money(order.balance_due)}
                />
              </div>

              <p style={{ margin: "14px 0 0 0", color: "#57534e", lineHeight: 1.55 }}>
                {order.deposit_credited_message || "No deposit has been requested for this order."}
              </p>
            </section>

            <section
              style={{
                borderRadius: "20px",
                padding: "18px",
                border: "1px solid #e7e5e4",
                background: "#ffffff",
              }}
            >
              <h3 style={{ margin: "0 0 4px 0", color: "#171717" }}>Operational Snapshot</h3>
              <p style={{ margin: "0 0 14px 0", color: "#78716c", fontSize: "13px" }}>
                The key production and handoff details visible to the customer.
              </p>

              <div style={{ display: "grid", gap: "10px" }}>
                <DetailTile label="Production status" value={order.status || "New"} />
                <DetailTile label="Pickup readiness" value={order.pickup_status || "Pending"} />
                <DetailTile
                  label="Approval"
                  value={order.approval_status || "Review in progress"}
                />
                <DetailTile
                  label="Order configuration"
                  value={`${quantity || "TBD"} piece${quantity === 1 ? "" : "s"}${
                    order.decoration_type ? ` • ${order.decoration_type}` : ""
                  }`}
                />
              </div>
            </section>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "16px",
              alignItems: "start",
            }}
          >
            <ArtworkFilesSummary
              artwork={artworkFiles}
              compact
              subtitle="Artwork remains linked to this order only."
            />
            <ArtworkPreview artworkFiles={artworkFiles} />
          </div>

          {order.notes ? (
            <section
              style={{
                borderRadius: "20px",
                padding: "18px",
                border: "1px solid #e7e5e4",
                background: "#ffffff",
              }}
            >
              <h3 style={{ margin: "0 0 6px 0", color: "#171717" }}>Notes</h3>
              <p style={{ margin: 0, color: "#57534e", lineHeight: 1.65 }}>{order.notes}</p>
            </section>
          ) : null}

          <ActivityTimeline events={timeline} compact />
        </div>
      )}
    </article>
  );
}

export default function MyOrders() {
  const location = useLocation();
  const storedOrders = useStoredOrders();
  const [expandedOrders, setExpandedOrders] = useState({});

  const orders = useMemo(
    () => buildPortalOrders(storedOrders, location.state || null),
    [location.state, storedOrders]
  );

  function toggleExpanded(orderNumber) {
    setExpandedOrders((current) => ({
      ...current,
      [orderNumber]: !current[orderNumber],
    }));
  }

  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "16px 20px 28px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ marginBottom: "18px" }}>
        <p
          style={{
            margin: "0 0 4px 0",
            fontSize: "12px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#78716c",
          }}
        >
          Customer Portal
        </p>

        <h1
          style={{
            margin: 0,
            fontSize: "30px",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: "#171717",
          }}
        >
          My Orders
        </h1>

        <p
          style={{
            margin: "8px 0 0 0",
            color: "#57534e",
            fontSize: "15px",
            lineHeight: 1.5,
            maxWidth: "720px",
          }}
        >
          Scan your active orders quickly, then open any card for artwork, payment,
          production, and pickup details when you need more context.
        </p>
      </div>

      <div style={{ display: "grid", gap: "16px" }}>
        {orders.map((order) => {
          const orderNumber = order.order_number || order.id;
          return (
            <CustomerOrderCard
              key={orderNumber}
              order={order}
              expanded={Boolean(expandedOrders[orderNumber])}
              onToggle={() => toggleExpanded(orderNumber)}
            />
          );
        })}
      </div>

      <div
        style={{
          marginTop: "18px",
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <Link
          to="/"
          style={{
            background: "#171717",
            color: "#ffffff",
            padding: "12px 16px",
            borderRadius: "12px",
            textDecoration: "none",
            fontWeight: "700",
            fontSize: "14px",
            boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
          }}
        >
          Start New Order
        </Link>
      </div>
    </div>
  );
}
