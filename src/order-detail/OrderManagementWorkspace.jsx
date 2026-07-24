import { Link } from "react-router-dom";
import {
  getArtworkAssetUrl,
  getArtworkDisplayName,
  getOrderArtworkFiles,
  isArtworkImage,
} from "../lib/orderArtwork";
import ActivityTimeline from "./ActivityTimeline";

const cardStyle = {
  background: "#ffffff",
  borderRadius: "20px",
  padding: "24px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

const labelStyle = {
  margin: 0,
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const valueStyle = {
  margin: "4px 0 0",
  color: "#171717",
  fontWeight: 700,
  lineHeight: 1.45,
};

function ManagementSection({ eyebrow, title, description, children, testId }) {
  return (
    <section data-testid={testId} style={cardStyle}>
      <p style={labelStyle}>{eyebrow}</p>
      <h2 style={{ margin: "5px 0 0", color: "#0f172a" }}>{title}</h2>
      {description ? (
        <p style={{ margin: "8px 0 18px", color: "#64748b", lineHeight: 1.5 }}>
          {description}
        </p>
      ) : null}
      {children}
    </section>
  );
}

function Decision({ label, value }) {
  return (
    <div>
      <p style={labelStyle}>{label}</p>
      <p style={valueStyle}>{value || "—"}</p>
    </div>
  );
}

export default function OrderManagementWorkspace({
  order,
  normalizedOrder,
  readiness,
  placedAt,
  updatedAt,
  canCancelOrder,
  onCancelOrder,
  onOpenFinancial,
}) {
  const artworkFiles = getOrderArtworkFiles(order);
  const prerequisiteChecks = readiness?.gating?.checks || [];
  const timelineEvents = normalizedOrder?.connected_timeline || order.activity_log || [];

  return (
    <div
      data-testid="order-workspace-order-management"
      data-reference-role="secondary"
      style={{ display: "grid", gap: "18px" }}
    >
      <header>
        <p style={labelStyle}>Owner Workspace</p>
        <h2 style={{ margin: "5px 0 0", fontSize: "28px", color: "#0f172a" }}>
          Manage this order
        </h2>
        <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.5 }}>
          Coordinate customer decisions and clear requirements before production begins.
        </p>
      </header>

      <ManagementSection
        eyebrow="1 · Production Prerequisites"
        title={readiness?.blocked ? "Requirements need attention" : "Production requirements"}
        description={readiness?.detail}
        testId="order-management-prerequisites"
      >
        <div style={{ display: "grid", gap: "10px" }}>
          {prerequisiteChecks.map((check) => (
            <article
              key={check.key}
              data-testid="order-management-prerequisite"
              data-prerequisite-key={check.key}
              data-satisfied={check.satisfied ? "true" : "false"}
              style={{
                border: check.satisfied ? "1px solid #bbf7d0" : "1px solid #fed7aa",
                background: check.satisfied ? "#f0fdf4" : "#fff7ed",
                color: check.satisfied ? "#166534" : "#9a3412",
                borderRadius: "14px",
                padding: "12px 14px",
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <strong>{check.label}</strong>
              <span>{check.satisfied ? "Satisfied" : check.statusLabel}</span>
            </article>
          ))}
          {!prerequisiteChecks.length ? (
            <p style={{ margin: 0, color: "#64748b" }}>No production prerequisites are recorded.</p>
          ) : null}
        </div>
        {prerequisiteChecks.some(
          (check) => check.key === "depositRequirement" && !check.satisfied
        ) ? (
          <button
            type="button"
            onClick={onOpenFinancial}
            style={{ marginTop: "14px", border: "1px solid #0f172a", background: "#ffffff", color: "#0f172a", borderRadius: "10px", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}
          >
            Open Payment Review
          </button>
        ) : null}
      </ManagementSection>

      <ManagementSection
        eyebrow="2 · Artwork Approval"
        title="Review the customer's artwork"
        description="Artwork decisions belong with order management. Production uses only the approved files needed to make the job."
        testId="order-management-artwork"
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
          {artworkFiles.length ? artworkFiles.map((file) => {
            const artworkUrl = getArtworkAssetUrl(file);
            return (
              <article key={file.id || getArtworkDisplayName(file)} style={{ border: "1px solid #e2e8f0", borderRadius: "14px", overflow: "hidden" }}>
                <div style={{ minHeight: "180px", display: "grid", placeItems: "center", background: "#f8fafc" }}>
                  {artworkUrl && isArtworkImage(file) ? (
                    <img src={artworkUrl} alt={getArtworkDisplayName(file)} style={{ width: "100%", height: "220px", objectFit: "contain", background: "#ffffff" }} />
                  ) : (
                    <span style={{ padding: "18px", color: "#64748b", fontWeight: 700 }}>Preview unavailable</span>
                  )}
                </div>
                <div style={{ padding: "12px" }}>
                  <strong>{getArtworkDisplayName(file)}</strong>
                  {artworkUrl ? <div style={{ marginTop: "8px" }}><a href={artworkUrl} target="_blank" rel="noreferrer">Open artwork</a></div> : null}
                </div>
              </article>
            );
          }) : (
            <div style={{ border: "1px dashed #cbd5e1", borderRadius: "14px", padding: "18px", color: "#64748b" }}>
              No customer artwork is attached to this order.
            </div>
          )}
        </div>
        <div style={{ marginTop: "16px" }}>
          <Decision label="Artwork Approval Status" value={order.artwork_status || order.artwork_approval_status} />
        </div>
      </ManagementSection>

      <ManagementSection
        eyebrow="3 · Customer Communication"
        title="Coordinate with the customer"
        description="Keep artwork questions and revision follow-up connected to the order they affect."
        testId="order-management-customer"
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
          <Decision label="Customer" value={order.customer_name || "Customer identity unavailable"} />
          <Decision label="Email" value={order.customer_email || order.email} />
          <Decision label="Phone" value={order.customer_phone || order.phone} />
          <Decision label="Customer Status" value={order.customer_status_message || order.customer_order_status} />
        </div>
        {order.customer_id ? (
          <Link to={`/admin/customers/${order.customer_id}`} style={{ display: "inline-block", marginTop: "16px", fontWeight: 800 }}>
            Open Customer Record
          </Link>
        ) : null}
      </ManagementSection>

      <ManagementSection
        eyebrow="4 · Approval Decisions"
        title="Order decision record"
        description="A single reference for the decisions that determine whether this order may proceed."
        testId="order-management-decisions"
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
          <Decision label="Request Approval" value={order.staff_review_status || order.approval_status} />
          <Decision label="Artwork Approval" value={order.artwork_status || order.artwork_approval_status} />
          <Decision label="Deposit Decision" value={order.deposit_workflow_status || order.deposit_requirement_status} />
        </div>
      </ManagementSection>

      <ManagementSection eyebrow="5 · Internal Notes" title="Owner and order notes" testId="order-management-notes">
        <p style={{ ...valueStyle, whiteSpace: "pre-wrap" }}>
          {order.internal_note || "No internal notes recorded."}
        </p>
      </ManagementSection>

      <ActivityTimeline events={timelineEvents} compact collapsedByDefault />

      <ManagementSection
        eyebrow="7 · Order Administration"
        title="Order record"
        description="Reference information and deliberate administrative actions for this order."
        testId="order-management-administration"
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
          <Decision label="Placed" value={`${placedAt.date} at ${placedAt.time}`} />
          <Decision label="Last Updated" value={`${updatedAt.date} at ${updatedAt.time}`} />
          <Decision label="Source" value={order.source || "Operational intake"} />
        </div>
        {canCancelOrder ? (
          <button
            type="button"
            onClick={onCancelOrder}
            style={{ marginTop: "18px", border: "1px solid #fecaca", background: "#fff5f5", color: "#b91c1c", borderRadius: "12px", padding: "11px 14px", fontWeight: 700 }}
          >
            Cancel Production Order
          </button>
        ) : null}
      </ManagementSection>
    </div>
  );
}
