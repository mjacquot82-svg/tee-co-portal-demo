import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import PricingSummary from "../components/PricingSummary";
import OwnerNextActionCard from "../components/OwnerNextActionCard";
import { formatDateTime } from "../lib/dateFormatting";
import {
  getArtworkAssetUrl,
  getArtworkDisplayName,
  getOrderArtworkFiles,
  getOrderArtworkNames,
  isArtworkImage,
} from "../lib/orderArtwork";
import { updateStoredOrder, useStoredOrders } from "../lib/ordersStore";
import { getActiveStaffUser } from "../lib/staffUsersStore";
import { normalizeOrderFinancials } from "../orders/orderFinancials";
import {
  canAdvanceQuoteStatus,
  getNextQuoteStatus,
  isQuoteArchived,
  isQuoteCanceled,
  isQuoteReadyForProduction,
} from "../quotes/quoteWorkflow";
import {
  buildApprovalStatus,
  buildDepositStatus,
  buildProductionReadiness,
} from "../quotes/productionReadiness";
import { deriveOwnerQuoteNextAction } from "../orders/ownerWorkflowActions";
import {
  canManageArchivedQuotes,
  getAdminViewer,
  isStaffWorkspaceView,
} from "./adminRoleView";
import PaymentRequestForm from "./PaymentRequestForm";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatValue(value, fallback = "—") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function formatList(values = [], fallback = "—") {
  const items = Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
  return items.length ? items.join(", ") : fallback;
}

function cardStyle(background = "#ffffff", compact = false) {
  return {
    background,
    borderRadius: "20px",
    padding: compact ? "18px" : "22px",
    border: "1px solid #e2e8f0",
  };
}

function DetailItem({ label, value }) {
  return (
    <div>
      <p style={{ margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 800 }}>{label}</p>
      <strong style={{ display: "block", marginTop: "6px", color: "#171717" }}>{value || "—"}</strong>
    </div>
  );
}

function StatusPill({ children, tone = "default" }) {
  const tones = {
    default: { background: "#f8fafc", border: "#e2e8f0", color: "#0f172a" },
    warning: { background: "#fff7ed", border: "#fed7aa", color: "#9a3412" },
    success: { background: "#ecfdf5", border: "#bbf7d0", color: "#166534" },
    danger: { background: "#fef2f2", border: "#fecaca", color: "#b91c1c" },
  };
  const palette = tones[tone] || tones.default;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        padding: "8px 12px",
        background: palette.background,
        color: palette.color,
        border: `1px solid ${palette.border}`,
        fontWeight: 800,
        fontSize: "12px",
      }}
    >
      {children}
    </span>
  );
}

function buildTimelineEvents(order = {}) {
  return [...(order.activity_log || [])].sort((left, right) =>
    String(right?.created_at || "").localeCompare(String(left?.created_at || ""))
  );
}

function ReferenceTimeline({ events = [], compact = false, embedded = false }) {
  const content = (
    <>
      <div style={{ marginBottom: compact ? "12px" : "16px" }}>
        <p
          style={{
            margin: 0,
            color: "#78716c",
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Record History
        </p>
        <h2 style={{ margin: "6px 0 4px", color: "#292524", fontSize: compact ? "18px" : "20px" }}>Timeline</h2>
        <p style={{ margin: 0, color: "#57534e", lineHeight: 1.55, fontSize: compact ? "14px" : "16px" }}>
          Preserved request history for reference, including workflow changes and archival events.
        </p>
      </div>

      {!events.length ? (
        <p style={{ margin: 0, color: "#78716c" }}>No recorded activity for this request yet.</p>
      ) : (
        <div style={{ display: "grid", gap: compact ? "8px" : "10px" }}>
          {events.map((event, index) => (
            <article
              key={event.id || index}
              style={{
                borderLeft: event.type === "canceled" ? "3px solid #b91c1c" : "3px solid #d6d3d1",
                borderRadius: "14px",
                background: event.type === "canceled" ? "#fff5f5" : "#f5f5f4",
                padding: compact ? "12px 14px" : "14px 16px",
              }}
            >
              <strong style={{ color: "#1c1917", display: "block" }}>
                {event.type === "canceled" ? "Canceled: " : ""}
                {event.note || "Request activity recorded."}
              </strong>
              <span
                style={{
                  display: "block",
                  marginTop: "6px",
                  color: "#78716c",
                  fontSize: compact ? "12px" : "13px",
                  fontWeight: 700,
                }}
              >
                {event.staff_name || "Unknown Staff"}
                {event.staff_role ? ` (${event.staff_role})` : ""}
                {event.created_at ? ` • ${formatDateTime(event.created_at)}` : ""}
              </span>
            </article>
          ))}
        </div>
      )}
    </>
  );

  if (embedded) return content;

  return (
    <section
      className={compact ? "archived-quote-reference-card archived-quote-timeline-card" : undefined}
      style={{
        ...cardStyle("#fcfcfb", compact),
        border: "1px solid #d6d3d1",
      }}
    >
      {content}
    </section>
  );
}

function WorkspaceCard({ eyebrow, title, description, children, background = "#ffffff", compact = false, className, id }) {
  return (
    <section id={id} className={className} style={cardStyle(background, compact)}>
      <div style={{ marginBottom: compact ? "12px" : "16px" }}>
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </p>
        <h2 style={{ margin: "6px 0 4px", color: "#0f172a", fontSize: compact ? "18px" : "20px" }}>{title}</h2>
        {description ? (
          <p style={{ margin: 0, color: "#475569", lineHeight: 1.55, fontSize: compact ? "14px" : "16px" }}>
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ArchivedAccordionSection({
  sectionKey,
  expandedSections,
  onToggle,
  eyebrow,
  title,
  description,
  summary,
  children,
  background = "#fcfcfb",
  className,
  compact = false,
}) {
  const expanded = Boolean(expandedSections[sectionKey]);

  return (
    <section
      className={className}
      style={{
        ...cardStyle(background, compact),
        padding: 0,
        overflow: "hidden",
        border: "1px solid #e7e5e4",
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        aria-expanded={expanded}
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          padding: compact ? "16px 18px" : "18px 20px",
          display: "grid",
          gap: "10px",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                color: "#78716c",
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {eyebrow}
            </p>
            <h2 style={{ margin: "6px 0 0", color: "#292524", fontSize: compact ? "17px" : "19px" }}>
              {title}
            </h2>
          </div>

          <span
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              borderRadius: "999px",
              border: "1px solid #d6d3d1",
              background: "#ffffff",
              color: "#57534e",
              padding: "8px 12px",
              fontSize: "12px",
              fontWeight: 800,
            }}
          >
            {expanded ? "Collapse" : "Expand"}
            <span aria-hidden="true">{expanded ? "−" : "+"}</span>
          </span>
        </div>

        <p style={{ margin: 0, color: "#57534e", lineHeight: 1.55, fontSize: compact ? "13px" : "14px" }}>
          {expanded ? description : summary || description}
        </p>
      </button>

      {expanded ? (
        <div
          style={{
            padding: compact ? "0 18px 18px" : "0 20px 20px",
            borderTop: "1px solid #e7e5e4",
          }}
        >
          <div style={{ paddingTop: compact ? "14px" : "16px" }}>{children}</div>
        </div>
      ) : null}
    </section>
  );
}

function PrimaryActionButton({ children, onClick, tone = "default" }) {
  const tones = {
    default: { background: "#0f172a", border: "#0f172a", color: "#ffffff" },
    neutral: { background: "#ffffff", border: "#cbd5e1", color: "#0f172a" },
    warning: { background: "#fff7ed", border: "#fdba74", color: "#9a3412" },
    danger: { background: "#fff5f5", border: "#fecaca", color: "#b91c1c" },
    success: { background: "#ecfdf5", border: "#bbf7d0", color: "#166534" },
  };
  const palette = tones[tone] || tones.default;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        borderRadius: "12px",
        padding: "12px 14px",
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function DepositRequestModal({ order, totalAmount, onCancel, onConfirm }) {
  const [depositType, setDepositType] = useState("percentage");
  const [percentage, setPercentage] = useState("50");
  const [fixedAmount, setFixedAmount] = useState("");
  const [message, setMessage] = useState(
    `Please send your deposit by e-transfer to orders@teeandco.ca and include your order number ${order.order_number}.`
  );
  const normalizedTotal = roundCurrency(totalAmount);
  const parsedPercentage = Number(percentage);
  const parsedFixedAmount = Number(fixedAmount);
  const calculatedAmount =
    depositType === "percentage"
      ? roundCurrency(normalizedTotal * ((Number.isFinite(parsedPercentage) ? parsedPercentage : 0) / 100))
      : roundCurrency(Number.isFinite(parsedFixedAmount) ? parsedFixedAmount : 0);
  const remainingBalance = Math.max(roundCurrency(normalizedTotal - calculatedAmount), 0);
  const hasValidAmount =
    calculatedAmount > 0 &&
    normalizedTotal > 0 &&
    calculatedAmount <= normalizedTotal &&
    (depositType !== "percentage" || parsedPercentage > 0);

  function handleSubmit(event) {
    event.preventDefault();
    if (!hasValidAmount) return;

    onConfirm({
      amount: calculatedAmount,
      type: depositType,
      percentage: depositType === "percentage" ? parsedPercentage : null,
      message: String(message || "").trim(),
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-request-title"
      data-testid="deposit-request-modal"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(15, 23, 42, 0.48)",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "min(620px, 100%)",
          maxHeight: "calc(100vh - 48px)",
          overflow: "auto",
          borderRadius: "22px",
          background: "#ffffff",
          border: "1px solid #dbe4ee",
          boxShadow: "0 24px 70px rgba(15, 23, 42, 0.24)",
          padding: "22px",
          display: "grid",
          gap: "16px",
        }}
      >
        <div>
          <p style={{ margin: 0, color: "#9a3412", fontSize: "12px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Deposit Request
          </p>
          <h2 id="deposit-request-title" style={{ margin: "6px 0 0", color: "#0f172a" }}>
            Set deposit amount
          </h2>
          <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.6 }}>
            Choose the deposit amount before sending the request to the customer portal.
          </p>
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "10px" }}>
          <legend style={{ color: "#0f172a", fontWeight: 900, marginBottom: "8px" }}>
            Deposit Type
          </legend>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
            {[
              { value: "percentage", label: "Percentage" },
              { value: "fixed", label: "Fixed Amount" },
            ].map((option) => (
              <label
                key={option.value}
                style={{
                  border: depositType === option.value ? "1px solid #0f766e" : "1px solid #cbd5e1",
                  background: depositType === option.value ? "#f0fdfa" : "#ffffff",
                  borderRadius: "16px",
                  padding: "14px",
                  color: "#0f172a",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <input
                  type="radio"
                  name="deposit_type"
                  value={option.value}
                  checked={depositType === option.value}
                  onChange={() => setDepositType(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        {depositType === "percentage" ? (
          <label style={{ display: "grid", gap: "8px", color: "#0f172a", fontWeight: 800 }}>
            Percentage %
            <input
              data-testid="deposit-percentage-input"
              type="number"
              min="1"
              max="100"
              step="0.01"
              value={percentage}
              onChange={(event) => setPercentage(event.target.value)}
              style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px 12px", font: "inherit" }}
            />
          </label>
        ) : (
          <label style={{ display: "grid", gap: "8px", color: "#0f172a", fontWeight: 800 }}>
            Amount $
            <input
              data-testid="deposit-fixed-amount-input"
              type="number"
              min="0.01"
              step="0.01"
              value={fixedAmount}
              onChange={(event) => setFixedAmount(event.target.value)}
              style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px 12px", font: "inherit" }}
            />
          </label>
        )}

        <section
          data-testid="deposit-preview"
          style={{
            borderRadius: "18px",
            border: "1px solid #fed7aa",
            background: "#fff7ed",
            padding: "16px",
            display: "grid",
            gap: "10px",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
            <DetailItem label="Order Total" value={money(normalizedTotal)} />
            <DetailItem label="Deposit" value={money(calculatedAmount)} />
            <DetailItem label="Remaining" value={money(remainingBalance)} />
          </div>
          {!hasValidAmount ? (
            <p style={{ margin: 0, color: "#9a3412", fontWeight: 800 }}>
              Enter a deposit amount greater than $0.00 and no more than the order total.
            </p>
          ) : null}
        </section>

        <label style={{ display: "grid", gap: "8px", color: "#0f172a", fontWeight: 800 }}>
          Optional Message
          <textarea
            data-testid="deposit-message-input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px 12px", font: "inherit", resize: "vertical" }}
          />
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#0f172a",
              borderRadius: "12px",
              padding: "12px 14px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!hasValidAmount}
            style={{
              border: "1px solid #fdba74",
              background: hasValidAmount ? "#fff7ed" : "#f1f5f9",
              color: hasValidAmount ? "#9a3412" : "#64748b",
              borderRadius: "12px",
              padding: "12px 14px",
              fontWeight: 900,
              cursor: hasValidAmount ? "pointer" : "not-allowed",
            }}
          >
            Request Deposit
          </button>
        </div>
      </form>
    </div>
  );
}

function formatSizeBreakdown(sizeBreakdown = {}) {
  const entries = Object.entries(sizeBreakdown || {})
    .filter(([, quantity]) => Number(quantity) > 0)
    .map(([size, quantity]) => `${size}: ${quantity}`);

  return entries.length ? entries.join(", ") : "";
}

function resolveArtworkChoice(order = {}) {
  const requirement = String(order.artwork_requirement || "").trim();
  if (requirement) return requirement;
  if (Array.isArray(order.artwork_files) && order.artwork_files.length) return "Uploaded";
  if (order.customer_artwork_id) return "Uploaded";
  return "Upload Later";
}

function buildIntakeAttentionItems(order = {}, productionReadiness) {
  const items = [];
  const staffReview = String(order.staff_review_status || order.approval_status || "").trim();
  const artworkStatus = String(order.artwork_status || order.artwork_approval_status || "").trim();
  const depositStatus = String(order.deposit_workflow_status || "").trim();
  const requestStatus = String(order.request_status || "").trim();

  if (staffReview !== "Approved") {
    items.push("Staff Review Pending");
  }

  if (artworkStatus === "Missing") {
    items.push("Artwork Missing");
  } else if (!artworkStatus || artworkStatus === "Pending Review") {
    items.push("Artwork Pending Review");
  } else if (artworkStatus === "Needs Revision") {
    items.push("Customer Response Needed");
  }

  if (
    depositStatus === "Pending Decision" ||
    order.deposit_requirement_status === "Undecided" ||
    String(order.deposit_requirement || "").trim().toLowerCase() === "undecided"
  ) {
    items.push("Deposit Decision Needed");
  }

  if (order.quote_status === "Draft" || !productionReadiness?.ready) {
    items.push("Pricing Review Needed");
  }

  if (requestStatus === "Awaiting Customer Response") {
    items.push("Awaiting Customer Response");
  }

  return Array.from(new Set(items));
}

function IntakeReviewScreen({
  order,
  financials,
  productionReadiness,
  approvalStatus,
  depositStatus,
  historyEvents,
  canManageArchive,
  onApproveRequest,
  onRequestArtwork,
  onRequestChanges,
  onRequireDeposit,
  onMarkDepositNotRequired,
  onRejectRequest,
  onArchiveRequest,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const submittedAt = formatDateTime(order.created_at, " • ");
  const artworkFiles = getOrderArtworkFiles(order);
  const attentionItems = buildIntakeAttentionItems(order, productionReadiness);
  const sizeSummary =
    formatSizeBreakdown(order.size_breakdown) ||
    formatList([order.selected_size, order.size].filter(Boolean));
  const placementSummary = formatList(
    (Array.isArray(order.placements) ? order.placements : [])
      .map((entry) => entry?.placement)
      .filter(Boolean),
    order.placement || "—"
  );

  function handleOpenDepositModal() {
    setDepositModalOpen(true);
  }

  function handleConfirmDepositRequest(requestDetails) {
    setDepositModalOpen(false);
    onRequireDeposit(requestDetails);
  }

  return (
    <div
      data-testid="intake-review-screen"
      style={{ maxWidth: "1180px", margin: "0 auto", padding: "24px", display: "grid", gap: "18px" }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: "#0f766e",
              fontSize: "12px",
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Order Request Review
          </p>
          <h1 style={{ margin: "6px 0" }}>Order Request {order.order_number}</h1>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <StatusPill tone="warning">{order.request_status || "Pending Staff Review"}</StatusPill>
            <span style={{ color: "#64748b", fontWeight: 700 }}>{submittedAt}</span>
          </div>
        </div>

        <Link
          to="/admin/quotes"
          style={{
            background: "#ffffff",
            color: "#171717",
            border: "1px solid #d6dbe4",
            borderRadius: "12px",
            padding: "11px 14px",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Back to Requests
        </Link>
      </header>

      <section
        data-testid="intake-needs-attention"
        style={{
          ...cardStyle("#fff7ed"),
          border: "1px solid #fed7aa",
          display: "grid",
          gap: "14px",
        }}
      >
        <div>
          <p style={{ margin: 0, color: "#9a3412", fontSize: "12px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Needs Attention
          </p>
          <h2 style={{ margin: "6px 0 0", color: "#7c2d12" }}>
            {attentionItems.length ? "Resolve before production" : "Ready for final review"}
          </h2>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {(attentionItems.length ? attentionItems : ["No open review items"]).map((item) => (
            <StatusPill key={item} tone={attentionItems.length ? "warning" : "success"}>
              {item}
            </StatusPill>
          ))}
        </div>
      </section>

      <section data-testid="intake-primary-actions" style={cardStyle("#ffffff")}>
        <p style={{ margin: "0 0 12px", color: "#64748b", fontSize: "12px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Primary Actions
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <PrimaryActionButton onClick={onApproveRequest} tone="success">Approve Request</PrimaryActionButton>
          <PrimaryActionButton onClick={onRequestArtwork} tone="warning">Request Artwork</PrimaryActionButton>
          <PrimaryActionButton onClick={onRequestChanges} tone="neutral">Request Changes</PrimaryActionButton>
          <PrimaryActionButton onClick={handleOpenDepositModal} tone="warning">Require Deposit</PrimaryActionButton>
          <PrimaryActionButton onClick={onMarkDepositNotRequired} tone="neutral">Mark Deposit Not Required</PrimaryActionButton>
          <PrimaryActionButton onClick={onRejectRequest} tone="danger">Reject Request</PrimaryActionButton>
        </div>
      </section>

      {depositModalOpen ? (
        <DepositRequestModal
          order={order}
          totalAmount={financials?.total_amount || 0}
          onCancel={() => setDepositModalOpen(false)}
          onConfirm={handleConfirmDepositRequest}
        />
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(280px, 0.75fr)", gap: "18px", alignItems: "start" }}>
        <div style={{ display: "grid", gap: "18px" }}>
          <WorkspaceCard
            eyebrow="Customer"
            title="Submitted by"
            description="Contact details needed during intake review."
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
              <DetailItem label="Name" value={order.customer_name} />
              <DetailItem label="Email" value={order.customer_email} />
              <DetailItem label="Phone" value={order.customer_phone} />
              {order.customer_company ? <DetailItem label="Company" value={order.customer_company} /> : null}
            </div>
          </WorkspaceCard>

          <WorkspaceCard
            eyebrow="Order Details"
            title="What they want"
            description="Customer-selected garment, configuration, and notes."
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
              <DetailItem label="Garment" value={order.garment || order.item} />
              <DetailItem label="Color" value={order.selected_color || order.color} />
              <DetailItem label="Sizes" value={sizeSummary} />
              <DetailItem label="Quantity" value={formatValue(order.qty, "0")} />
              <DetailItem label="Decoration Type" value={order.decoration_type} />
              <DetailItem label="Placement" value={placementSummary} />
              <DetailItem label="Needed By" value={order.due_date} />
              <DetailItem label="Estimated Total" value={money(financials?.total_amount)} />
            </div>
            {order.customer_notes || order.request_details || order.notes ? (
              <div style={{ marginTop: "16px" }}>
                <p style={{ margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 800 }}>Customer Notes</p>
                <p style={{ margin: "6px 0 0", color: "#171717", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {order.customer_notes || order.request_details || order.notes}
                </p>
              </div>
            ) : null}
          </WorkspaceCard>

          <WorkspaceCard
            eyebrow="Artwork"
            title="Artwork status"
            description="What the customer selected and what staff still need to review."
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "14px" }}>
              <DetailItem label="Artwork Choice" value={resolveArtworkChoice(order)} />
              <DetailItem label="Artwork Status" value={order.artwork_status || order.artwork_approval_status || "Pending Review"} />
            </div>

            {artworkFiles.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                {artworkFiles.map((file, index) => {
                  const assetUrl = getArtworkAssetUrl(file);
                  const displayName = getArtworkDisplayName(file);
                  const imageFile = isArtworkImage(file) && Boolean(assetUrl);

                  return (
                    <article
                      key={file.id || displayName || index}
                      style={{
                        border: "1px solid #dbe2ea",
                        borderRadius: "14px",
                        padding: "12px",
                        background: "#f8fafc",
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      {imageFile ? (
                        <img
                          src={assetUrl}
                          alt={displayName}
                          style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: "10px" }}
                        />
                      ) : null}
                      <strong style={{ color: "#0f172a" }}>{displayName || "Artwork file"}</strong>
                      {file.notes ? (
                        <span style={{ color: "#64748b", fontSize: "13px", lineHeight: 1.5 }}>
                          {file.notes}
                        </span>
                      ) : null}
                      {file.revision ? (
                        <StatusPill tone="warning">Revision Upload</StatusPill>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>No artwork uploaded yet.</p>
            )}

            {order.artwork_help_message || order.customer_artwork_notes ? (
              <div style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
                {order.artwork_help_message ? (
                  <div
                    style={{
                      borderRadius: "14px",
                      border: "1px solid #bfdbfe",
                      background: "#eff6ff",
                      padding: "12px 14px",
                    }}
                  >
                    <p style={{ margin: 0, color: "#1e3a8a", fontSize: "12px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Artwork Help Request
                    </p>
                    <p style={{ margin: "6px 0 0", color: "#1e3a8a", lineHeight: 1.6 }}>
                      {order.artwork_help_message}
                    </p>
                  </div>
                ) : null}
                {order.customer_artwork_notes ? (
                  <div
                    style={{
                      borderRadius: "14px",
                      border: "1px solid #dbe2ea",
                      background: "#f8fafc",
                      padding: "12px 14px",
                    }}
                  >
                    <p style={{ margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Customer Artwork Notes
                    </p>
                    <p style={{ margin: "6px 0 0", color: "#0f172a", lineHeight: 1.6 }}>
                      {order.customer_artwork_notes}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </WorkspaceCard>
        </div>

        <aside style={{ display: "grid", gap: "18px" }}>
          <WorkspaceCard
            eyebrow="Financial"
            title="Review pricing"
            description="Detailed payment tools stay hidden until expanded or released."
          >
            <div style={{ display: "grid", gap: "14px" }}>
              <DetailItem label="Estimated Total" value={money(financials?.total_amount)} />
              <DetailItem label="Deposit Decision Status" value={depositStatus} />
            </div>
          </WorkspaceCard>

          <section style={{ ...cardStyle("#f8fafc"), padding: 0, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setAdvancedOpen((current) => !current)}
              aria-expanded={advancedOpen}
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                padding: "18px 20px",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <span>
                <span style={{ display: "block", color: "#64748b", fontSize: "11px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Advanced Details
                </span>
                <strong style={{ display: "block", marginTop: "6px", color: "#0f172a" }}>
                  Workflow, timeline, and raw state
                </strong>
              </span>
              <span style={{ fontWeight: 900 }}>{advancedOpen ? "−" : "+"}</span>
            </button>

            {advancedOpen ? (
              <div style={{ borderTop: "1px solid #e2e8f0", padding: "18px 20px", display: "grid", gap: "16px" }}>
                <div style={{ display: "grid", gap: "12px" }}>
                  <DetailItem label="Visibility" value="Active intake review" />
                  <DetailItem label="Review Status" value={order.quote_status} />
                  <DetailItem label="Operational Visible" value={order.operational_visible ? "Yes" : "No"} />
                  <DetailItem label="Production Ready" value={order.production_ready ? "Yes" : "No"} />
                  <DetailItem label="Internal Request Type" value={order.request_type} />
                  <DetailItem label="Order Number" value={order.order_number} />
                  <DetailItem label="Staff Review" value={approvalStatus} />
                  <DetailItem label="Readiness" value={`${productionReadiness.remainingRequirements} requirement${productionReadiness.remainingRequirements === 1 ? "" : "s"} remaining`} />
                </div>

                <div>
                  <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: "12px", fontWeight: 800 }}>Readiness Details</p>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {productionReadiness.checks.map((check) => (
                      <div
                        key={check.label}
                        style={{
                          borderRadius: "12px",
                          border: check.passed ? "1px solid #bbf7d0" : "1px solid #fed7aa",
                          background: check.passed ? "#ecfdf5" : "#fff7ed",
                          padding: "10px 12px",
                        }}
                      >
                        <strong>{check.label}</strong>
                        <span style={{ display: "block", marginTop: "4px", color: check.passed ? "#166534" : "#9a3412", fontWeight: 700 }}>
                          {check.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {financials ? (
                  <div>
                    <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: "12px", fontWeight: 800 }}>Full Payment State</p>
                    <div style={{ display: "grid", gap: "10px" }}>
                      <DetailItem label="Deposit Target" value={money(financials.deposit_amount)} />
                      <DetailItem label="Paid To Date" value={money(financials.total_paid)} />
                      <DetailItem label="Balance Owing" value={money(financials.balance_due)} />
                      <DetailItem label="Collection State" value={financials.payment_collection_state} />
                    </div>
                  </div>
                ) : null}

                <ReferenceTimeline events={historyEvents} compact embedded />

                {canManageArchive ? (
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <PrimaryActionButton onClick={onArchiveRequest} tone="neutral">Archive Request</PrimaryActionButton>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function QuoteDetail() {
  const { orderNumber } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const activeStaffUser = getActiveStaffUser();
  const viewer = getAdminViewer(activeStaffUser);
  const isStaffWorkspace = isStaffWorkspaceView(activeStaffUser);
  const canManageArchive = canManageArchivedQuotes(viewer);
  const orders = useStoredOrders();
  const savedOrder = location.state?.savedOrder || null;
  const order = useMemo(
    () =>
      orders.find((entry) => entry.order_number === orderNumber) ||
      (savedOrder?.order_number === orderNumber ? savedOrder : null),
    [orderNumber, orders, savedOrder]
  );
  const quoteSnapshot = order?.quote || null;
  const flashMessage = location.state?.flashMessage || "";
  const flashTone = location.state?.flashTone || "default";
  const financials = useMemo(
    () =>
      order
        ? normalizeOrderFinancials(order, {
            additionalSources: quoteSnapshot ? [{ label: "storedQuote", value: quoteSnapshot }] : [],
          })
        : null,
    [order, quoteSnapshot]
  );
  const depositStatus = useMemo(() => buildDepositStatus(order, financials), [order, financials]);
  const approvalStatus = useMemo(() => buildApprovalStatus(order), [order]);
  const productionReadiness = useMemo(
    () => buildProductionReadiness(order, financials),
    [order, financials]
  );
  const ownerNextAction = useMemo(
    () => (order ? deriveOwnerQuoteNextAction(financials || order, productionReadiness) : null),
    [financials, order, productionReadiness]
  );
  const quoteNextAction = ownerNextAction?.actionKey
    ? { ...ownerNextAction, href: "" }
    : ownerNextAction;
  const artworkNames = useMemo(() => getOrderArtworkNames(order), [order]);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archivedSections, setArchivedSections] = useState({
    quoteDetails: false,
    artworkApproval: false,
    pricing: false,
    context: false,
    timeline: false,
  });
  const archived = isQuoteArchived(order);
  const canceled = isQuoteCanceled(order);
  const isOrderRequestIntake =
    order?.request_type === "Order Request" && order?.operational_visible === false && !archived && !canceled;
  const archivedAt = archived ? formatDateTime(order.quote_archived_at, " • ") : "—";
  const canceledAt = canceled
    ? formatDateTime(order.canceled_at || order.quote_canceled_at || order.updated_at, " • ")
    : "—";
  const historyEvents = useMemo(
    () => financials?.connected_timeline || buildTimelineEvents(order),
    [financials, order]
  );
  const readinessSummary = productionReadiness.ready
    ? "Ready for production"
    : `${productionReadiness.remainingRequirements} requirement${productionReadiness.remainingRequirements === 1 ? "" : "s"} remaining`;
  const nextStep = archived
    ? "Archived from active workflow"
    : canceled
    ? "Workflow canceled"
    : canAdvanceQuoteStatus(order?.quote_status)
    ? `Mark ${getNextQuoteStatus(order.quote_status)}`
    : isQuoteReadyForProduction(order?.quote_status)
    ? "Release to Production"
    : "Await remaining request requirements";

  useEffect(() => {
    if (!archived || !isStaffWorkspace) return;

    navigate("/admin/quotes", {
      replace: true,
      state: {
        flashMessage: "Archived request records are available only in the owner/admin workspace.",
        flashTone: "default",
      },
    });
  }, [archived, isStaffWorkspace, navigate]);

  useEffect(() => {
    if (!order || order.request_type !== "Order Request" || order.operational_visible !== true) return;

    navigate(`/admin/orders/${order.order_number}`, { replace: true });
  }, [navigate, order]);

  if (!order) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px" }}>
        <h1>Request not found</h1>
        <Link to="/admin/quotes">Back to Order Requests</Link>
      </div>
    );
  }

  async function handleAdvanceQuote() {
    if (archived || canceled) return;
    if (!canAdvanceQuoteStatus(order.quote_status)) return;

    const nextQuoteStatus = getNextQuoteStatus(order.quote_status);
    await updateStoredOrder(order.order_number, {
      quote_status: nextQuoteStatus,
      activity_type: "quote_status",
      activity_note: `Quote status changed to ${nextQuoteStatus}.`,
    });
  }

  async function handleReleaseToProduction() {
    if (archived || canceled) return;
    if (!isQuoteReadyForProduction(order.quote_status)) return;

    await updateStoredOrder(order.order_number, {
      quote_status: "Ready For Production",
      status: "Awaiting Production",
      operational_visible: true,
      production_ready: true,
      activity_type: "release_to_production",
      activity_note: "Quote released into Production Orders.",
    });
  }

  async function handleOwnerNextAction(actionKey) {
    if (actionKey === "release_to_production") {
      await handleReleaseToProduction();
      return;
    }

    if (actionKey === "create_payment_request") {
      document.getElementById("quote-payment-request-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }

    if (actionKey === "open_artwork" || actionKey === "open_approval") {
      document.getElementById("quote-artwork-approval")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  async function handleArchiveQuote() {
    if (archived || canceled) return;

    await updateStoredOrder(order.order_number, {
      quote_archived: true,
      quote_archived_at: new Date().toISOString(),
      operational_visible: false,
      production_ready: false,
      activity_type: "quote_archive",
      activity_note: "Quote archived from active workflow.",
    });

    setShowArchiveConfirm(false);
    navigate("/admin/quotes/archived", {
      state: {
        flashMessage: `Quote ${order.order_number} was removed from active workflow.`,
        flashTone: "success",
      },
    });
  }

  async function handleRestoreQuote() {
    if (!archived) return;

    await updateStoredOrder(order.order_number, {
      quote_archived: false,
      quote_archived_at: null,
      activity_type: "quote_restore",
      activity_note: "Quote restored to active workflow.",
    });

    navigate(`/admin/quotes/${order.order_number}`, {
      replace: true,
      state: {
        flashMessage: `Quote ${order.order_number} was restored to active workflow.`,
        flashTone: "success",
      },
    });
  }

  async function handleCancelQuote() {
    if (archived || canceled) return;

    await updateStoredOrder(order.order_number, {
      status: "Canceled",
      quote_status: "Canceled",
      operational_visible: false,
      production_ready: false,
      canceled_at: new Date().toISOString(),
      activity_type: "canceled",
      activity_note: "Quote canceled while preserving operational and financial history.",
    });

    navigate(`/admin/quotes/${order.order_number}`, {
      replace: true,
      state: {
        flashMessage: `Quote ${order.order_number} was marked canceled.`,
        flashTone: "success",
      },
    });
  }

  async function handleApproveRequest() {
    if (archived || canceled) return;

    await updateStoredOrder(order.order_number, {
      request_status: "Approved - Pending Requirements",
      staff_review_status: "Approved",
      approval_status: "Approved",
      activity_type: "order_request_review",
      activity_note: `Order request approved by ${activeStaffUser?.name || "staff"}.`,
    });
  }

  async function handleRequestArtwork() {
    if (archived || canceled) return;

    await updateStoredOrder(order.order_number, {
      request_status: "Awaiting Artwork",
      artwork_status: "Missing",
      artwork_approval_required: true,
      artwork_approval_status: "Pending Review",
      quote_status: "Awaiting Artwork Approval",
      activity_type: "artwork_request",
      activity_note: `Artwork requested by ${activeStaffUser?.name || "staff"}.`,
    });
  }

  async function handleRequestChanges() {
    if (archived || canceled) return;

    await updateStoredOrder(order.order_number, {
      request_status: "Awaiting Customer Response",
      staff_review_status: "Changes Requested",
      approval_status: "Revision Requested",
      quote_status: "Awaiting Approval",
      activity_type: "order_request_changes",
      activity_note: `Changes requested by ${activeStaffUser?.name || "staff"}.`,
    });
  }

  async function handleRequireDeposit(requestDetails = {}) {
    if (archived || canceled) return;

    const now = new Date().toISOString();
    const depositAmount = roundCurrency(requestDetails.amount);
    const depositType = requestDetails.type === "fixed" ? "fixed" : "percentage";
    const depositPercentage =
      depositType === "percentage" ? Number(requestDetails.percentage || 0) : null;
    const depositMessage =
      String(requestDetails.message || "").trim() ||
      `Please send your deposit by e-transfer to orders@teeandco.ca and include your order number ${order.order_number}.`;

    if (depositAmount <= 0) return;

    await updateStoredOrder(order.order_number, {
      request_status: "Awaiting Deposit",
      deposit_required: true,
      deposit_requirement: "required",
      deposit_requirement_status: "Required",
      deposit_workflow_status: "Deposit Requested",
      deposit_amount: depositAmount,
      deposit_payment_instructions: depositMessage,
      deposit_request_message: depositMessage,
      deposit: {
        ...(order.deposit || {}),
        amount: depositAmount,
        type: depositType,
        percentage: depositPercentage,
        status: "pending",
        requested_at: now,
        updated_at: now,
        last_requested_message: depositMessage,
      },
      quote_status: "Awaiting Deposit",
      activity_type: "deposit_request",
      activity_note: `Deposit of ${money(depositAmount)} required by ${activeStaffUser?.name || "staff"}.`,
    });
  }

  async function handleMarkDepositNotRequired() {
    if (archived || canceled) return;

    await updateStoredOrder(order.order_number, {
      deposit_required: false,
      deposit_requirement: "not_required",
      deposit_requirement_status: "Not Required",
      deposit_workflow_status: "Deposit Not Required",
      activity_type: "deposit_workflow",
      activity_note: `Deposit marked not required by ${activeStaffUser?.name || "staff"}.`,
    });
  }

  async function handleRejectRequest() {
    if (archived || canceled) return;

    await updateStoredOrder(order.order_number, {
      request_status: "Rejected",
      staff_review_status: "Rejected",
      approval_status: "Rejected",
      status: "Canceled",
      quote_status: "Canceled",
      operational_visible: false,
      production_ready: false,
      canceled_at: new Date().toISOString(),
      activity_type: "order_request_rejected",
      activity_note: `Order request rejected by ${activeStaffUser?.name || "staff"}.`,
    });
  }

  function handleToggleArchivedSection(sectionKey) {
    setArchivedSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  }

  if (isOrderRequestIntake) {
    return (
      <IntakeReviewScreen
        order={order}
        financials={financials}
        productionReadiness={productionReadiness}
        approvalStatus={approvalStatus}
        depositStatus={depositStatus}
        historyEvents={historyEvents}
        canManageArchive={canManageArchive}
        onApproveRequest={handleApproveRequest}
        onRequestArtwork={handleRequestArtwork}
        onRequestChanges={handleRequestChanges}
        onRequireDeposit={handleRequireDeposit}
        onMarkDepositNotRequired={handleMarkDepositNotRequired}
        onRejectRequest={handleRejectRequest}
        onArchiveRequest={handleArchiveQuote}
      />
    );
  }

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px" }}>
      {flashMessage ? (
        <section
          aria-live="polite"
          style={{
            marginBottom: "20px",
            borderRadius: "16px",
            padding: "16px 18px",
            border: flashTone === "success" ? "1px solid #bbf7d0" : "1px solid #cbd5e1",
            background: flashTone === "success" ? "#ecfdf5" : "#f8fafc",
            color: flashTone === "success" ? "#166534" : "#334155",
            fontWeight: 700,
          }}
        >
          {flashMessage}
        </section>
      ) : null}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {archived
              ? "Archived Request Record"
              : canceled
              ? "Canceled Request Record"
              : "Request Review Workspace"}
          </p>
          <h1 style={{ margin: "6px 0" }}>Request {order.order_number}</h1>
          <p style={{ margin: 0, color: "#475569", maxWidth: "760px" }}>
            {archived
              ? "Historical request record for reference, context, and recovery back into the active request workflow."
              : canceled
              ? "Canceled request record with preserved operational and financial history for historical review."
              : "Focused operational workspace for approvals, readiness, pricing, artwork, and production release."}
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link
            to={archived ? "/admin/quotes/archived" : canceled ? "/admin/records/canceled" : "/admin/quotes"}
            style={{
              background: "#ffffff",
              color: "#171717",
              border: "1px solid #d6dbe4",
              borderRadius: "12px",
              padding: "11px 14px",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            {archived ? "Back to Archived Requests" : canceled ? "Back to Canceled Orders" : "Back to Order Requests"}
          </Link>
          {!archived && !canceled && canAdvanceQuoteStatus(order.quote_status) ? (
            <button
              type="button"
              data-testid="quote-detail-advance-status"
              onClick={handleAdvanceQuote}
              style={{
                border: "none",
                background: "#0f172a",
                color: "#ffffff",
                borderRadius: "12px",
                padding: "11px 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Mark {getNextQuoteStatus(order.quote_status)}
            </button>
          ) : null}
          {!archived && !canceled && isQuoteReadyForProduction(order.quote_status) ? (
            <button
              type="button"
              data-testid="quote-detail-release-to-production"
              onClick={handleReleaseToProduction}
              style={{
                border: "none",
                background: "#166534",
                color: "#ffffff",
                borderRadius: "12px",
                padding: "11px 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Release to Production
            </button>
          ) : null}
          {!archived && !canceled && canManageArchive ? (
            <button
              type="button"
              onClick={() => setShowArchiveConfirm((current) => !current)}
              style={{
                border: "1px solid #d6dbe4",
                background: "#f8fafc",
                color: "#0f172a",
                borderRadius: "12px",
                padding: "11px 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Archive Request
            </button>
          ) : null}
          {!archived && !canceled && canManageArchive ? (
            <Link
              to="/admin/quotes/archived"
              style={{
                background: "#ffffff",
                color: "#171717",
                border: "1px solid #d6dbe4",
                borderRadius: "12px",
                padding: "11px 14px",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Archived Requests
            </Link>
          ) : null}
          {!archived && !canceled && canManageArchive ? (
            <button
              type="button"
              onClick={handleCancelQuote}
              style={{
                border: "1px solid #fecaca",
                background: "#fff5f5",
                color: "#b91c1c",
                borderRadius: "12px",
                padding: "11px 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Cancel Request
            </button>
          ) : null}
          {archived && canManageArchive ? (
            <Link
              to="/admin/quotes"
              style={{
                background: "#ffffff",
                color: "#171717",
                border: "1px solid #d6dbe4",
                borderRadius: "12px",
                padding: "11px 14px",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Active Requests
            </Link>
          ) : null}
        </div>
      </div>

      {archived ? (
        <section
          aria-live="polite"
          style={{
            marginBottom: "20px",
            borderRadius: "18px",
            padding: "18px 20px",
            border: "1px solid #cbd5e1",
            background: "#f5f5f4",
            color: "#44403c",
            display: "grid",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <StatusPill>Archived</StatusPill>
            <strong style={{ color: "#292524" }}>This request is preserved as a historical record.</strong>
          </div>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            It no longer appears in the active request workflow and remains available here for historical reference.
          </p>
          <p style={{ margin: 0, color: "#78716c", fontSize: "14px" }}>Archived {archivedAt}</p>
          {canManageArchive ? (
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleRestoreQuote}
                style={{
                  border: "1px solid #d6d3d1",
                  background: "#ffffff",
                  color: "#292524",
                  borderRadius: "12px",
                  padding: "11px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Restore Request
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {canceled ? (
        <section
          aria-live="polite"
          style={{
            marginBottom: "20px",
            borderRadius: "18px",
            padding: "18px 20px",
            border: "1px solid #fecaca",
            background: "#fff5f5",
            color: "#7f1d1d",
            display: "grid",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <StatusPill tone="danger">Canceled</StatusPill>
            <strong style={{ color: "#7f1d1d" }}>
              This request was intentionally terminated and remains preserved for review.
            </strong>
          </div>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Operational work stopped on {canceledAt}. Payment history, payments, deposits, and timeline events are still available on this record.
          </p>
        </section>
      ) : null}

      {!archived && quoteNextAction ? (
        <div style={{ marginBottom: "20px" }}>
          <OwnerNextActionCard action={quoteNextAction} onAction={handleOwnerNextAction} />
        </div>
      ) : null}

      {archived ? (
        <div style={{ display: "grid", gap: "18px" }}>
          <WorkspaceCard
            eyebrow="Reference Summary"
            title="Archived request snapshot"
            description="Key request details remain visible here without the active release and movement controls."
            background="#fcfcfb"
          >
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
              <StatusPill>{order.quote_status || "Archived"}</StatusPill>
              <StatusPill>Archived</StatusPill>
              <StatusPill tone={approvalStatus === "Approved" ? "success" : "default"}>
                {approvalStatus}
              </StatusPill>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "14px",
              }}
            >
              <DetailItem label="Archived Date" value={archivedAt} />
              <DetailItem label="Customer" value={order.customer_name} />
              <DetailItem label="Company" value={order.customer_company} />
              <DetailItem label="Total" value={money(financials?.total_amount)} />
              <DetailItem label="Review Status" value={order.quote_status} />
              <DetailItem label="Archive Status" value="Archived historical record" />
              <DetailItem label="Source" value={order.source} />
              <DetailItem label="Due Date" value={order.due_date} />
              <DetailItem label="Quantity" value={formatValue(order.qty, "0")} />
              <DetailItem label="Garment" value={formatValue(order.garment, "Custom garment")} />
              <DetailItem label="Decoration Type" value={formatValue(order.decoration_type)} />
              <DetailItem
                label="Placements"
                value={formatList((order.placements || []).map((entry) => entry.placement))}
              />
            </div>
          </WorkspaceCard>

          <div className="archived-quote-layout">
            <div className="archived-quote-main-column">
              <ArchivedAccordionSection
                sectionKey="quoteDetails"
                expandedSections={archivedSections}
                onToggle={handleToggleArchivedSection}
                eyebrow="Original Request"
                title="Request details"
                description="Original customer and order context remain preserved for historical reference."
                summary={`${formatValue(order.customer_name, "Walk-in Customer")} • ${formatValue(order.garment, "Custom garment")} • ${formatValue(order.qty, "0")} pcs`}
                background="#fcfcfb"
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "14px",
                  }}
                >
                  <DetailItem label="Customer" value={formatValue(order.customer_name, "Walk-in Customer")} />
                  <DetailItem label="Company" value={formatValue(order.customer_company)} />
                  <DetailItem label="Source" value={formatValue(order.source)} />
                  <DetailItem label="Due Date" value={formatValue(order.due_date)} />
                  <DetailItem label="Quantity" value={formatValue(order.qty, "0")} />
                  <DetailItem label="Garment" value={formatValue(order.garment, "Custom garment")} />
                  <DetailItem label="Decoration Type" value={formatValue(order.decoration_type)} />
                  <DetailItem
                    label="Placements"
                    value={formatList((order.placements || []).map((entry) => entry.placement))}
                  />
                </div>

                {order.notes ? (
                  <div style={{ marginTop: "16px" }}>
                    <p style={{ margin: 0, color: "#78716c", fontSize: "12px", fontWeight: 800 }}>Notes</p>
                    <p style={{ margin: "6px 0 0", color: "#292524", lineHeight: 1.6 }}>{order.notes}</p>
                  </div>
                ) : null}
              </ArchivedAccordionSection>

              <ArchivedAccordionSection
                sectionKey="artworkApproval"
                expandedSections={archivedSections}
                onToggle={handleToggleArchivedSection}
                eyebrow="Artwork And Approval"
                title="Artwork and approval"
                description="Artwork files, approval state, and readiness remain available without keeping the whole workspace open."
                summary={`${approvalStatus} • ${artworkNames.length} artwork file${artworkNames.length === 1 ? "" : "s"} • ${productionReadiness.checks.find((check) => check.label === "Artwork")?.detail || "No artwork required"}`}
                background="#fcfcfb"
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "14px",
                  }}
                >
                  <DetailItem label="Staff Review" value={approvalStatus} />
                  <DetailItem
                    label="Artwork Files"
                    value={formatList(artworkNames, "No artwork uploaded")}
                  />
                  <DetailItem
                    label="Artwork Readiness"
                    value={
                      productionReadiness.checks.find((check) => check.label === "Artwork")?.detail ||
                      "No artwork required"
                    }
                  />
                  <DetailItem label="Deposit Status" value={depositStatus} />
                </div>
              </ArchivedAccordionSection>

              <ArchivedAccordionSection
                sectionKey="pricing"
                expandedSections={archivedSections}
                onToggle={handleToggleArchivedSection}
                eyebrow="Pricing"
                title="Pricing"
                description="Archived pricing stays available on demand so historical records remain easy to review without dominating the page."
                summary={`Total ${money(financials?.total_amount)} • ${depositStatus}`}
                background="#fcfcfb"
              >
                {quoteSnapshot ? (
                  <PricingSummary quote={quoteSnapshot} quantity={order.qty} />
                ) : (
                  <p style={{ margin: 0, color: "#78716c" }}>
                    Pricing snapshot will appear here once pricing data is available.
                  </p>
                )}
              </ArchivedAccordionSection>
            </div>

            <div className="archived-quote-reference-column">
              <ArchivedAccordionSection
                sectionKey="context"
                expandedSections={archivedSections}
                onToggle={handleToggleArchivedSection}
                eyebrow="Record State"
                title="Archived context"
                description="Reference-only context for how this request now sits outside the active workflow."
                summary="Reference-only workflow state, visibility, and release context."
                background="#f5f5f4"
                compact
                className="archived-quote-reference-card"
              >
                <div className="archived-quote-context-grid">
                  <DetailItem label="Visibility" value="Removed from active workflow" />
                  <DetailItem label="Ready for Production" value="Reference only while archived" />
                  <DetailItem label="Release" value="Hidden until request is restored" />
                  <DetailItem label="Deposit Actions" value="Hidden until request is restored" />
                </div>
              </ArchivedAccordionSection>

              <ArchivedAccordionSection
                sectionKey="timeline"
                expandedSections={archivedSections}
                onToggle={handleToggleArchivedSection}
                eyebrow="Record History"
                title="Timeline"
                description="Preserved request history, including workflow changes and archival events."
                summary={`${historyEvents.length} recorded event${historyEvents.length === 1 ? "" : "s"} in the archived history`}
                background="#fcfcfb"
                compact
                className="archived-quote-reference-card"
              >
                <ReferenceTimeline events={historyEvents} compact embedded />
              </ArchivedAccordionSection>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "18px" }}>
        <WorkspaceCard
          eyebrow="Workspace Focus"
          title={canceled ? "Canceled request record" : "Request review"}
          description={
            canceled
              ? "This record is preserved for review, but operational release actions are disabled because the workflow was intentionally terminated."
              : "This route keeps request review decisions visible at all times. It does not collapse like the list view."
          }
          background="#f8fafc"
        >
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
            <StatusPill tone={canceled ? "danger" : isQuoteReadyForProduction(order.quote_status) ? "success" : "default"}>
              {canceled ? "Canceled" : order.quote_status}
            </StatusPill>
            {archived ? <StatusPill>Archived</StatusPill> : null}
            {canceled ? <StatusPill tone="danger">Workflow stopped</StatusPill> : null}
            <StatusPill tone={depositStatus === "Deposit received" ? "success" : "warning"}>
              {depositStatus}
            </StatusPill>
            <StatusPill tone={approvalStatus === "Approved" ? "success" : "warning"}>
              {approvalStatus}
            </StatusPill>
            <StatusPill tone={productionReadiness.ready ? "success" : "warning"}>
              {readinessSummary}
            </StatusPill>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "14px",
            }}
          >
            <DetailItem label="Customer" value={order.customer_name} />
            <DetailItem label="Company" value={order.customer_company} />
            <DetailItem label="Review Status" value={order.quote_status} />
            <DetailItem label="Ready for Production" value={readinessSummary} />
            <DetailItem label="Staff Review" value={approvalStatus} />
            <DetailItem label="Deposit" value={depositStatus} />
            <DetailItem label="Source" value={order.source} />
            <DetailItem label="Due Date" value={order.due_date} />
            <DetailItem
              label="Visibility"
              value={
                archived
                  ? "Removed from active workflow"
                  : canceled
                  ? "Canceled workflow"
                  : "Active workflow"
              }
            />
            {archived ? <DetailItem label="Archived At" value={archivedAt} /> : null}
            {canceled ? <DetailItem label="Canceled At" value={canceledAt} /> : null}
            <DetailItem
              label="Artwork"
              value={productionReadiness.checks.find((check) => check.label === "Artwork")?.detail || "No artwork required"}
            />
            <DetailItem label="Next workflow step" value={nextStep} />
          </div>
        </WorkspaceCard>

        {canManageArchive ? (
          <WorkspaceCard
            eyebrow="Visibility"
            title={archived ? "Archived record" : canceled ? "Canceled record" : "Review Status"}
            description={
              archived
                ? "This record is preserved for reference, but it is no longer treated as active operational work."
                : canceled
                ? "This record was intentionally terminated. It remains preserved for review with no restore or archive action required."
                : "Archive and restore are owner and admin actions for managing active request visibility."
            }
            background={archived ? "#f8fafc" : "#ffffff"}
          >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.2fr) minmax(260px, 0.8fr)",
              gap: "16px",
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <StatusPill tone={archived || canceled ? "danger" : "default"}>
                  {archived ? "Archived" : canceled ? "Canceled" : "Active workflow"}
                </StatusPill>
                {!archived && !canceled ? <StatusPill tone="warning">Visible in active request queue</StatusPill> : null}
              </div>
              <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
                {archived
                  ? "Archived requests stay viewable here while remaining out of active workflow and operational queue views."
                  : canceled
                  ? "Canceled requests remain viewable here while their operational and financial history stays preserved."
                  : "Archiving removes this request from the active request workflow and operational queue visibility without changing the underlying record."}
              </p>
              {archived ? (
                <p style={{ margin: 0, color: "#64748b", fontWeight: 600 }}>Archived {archivedAt}</p>
              ) : canceled ? (
                <p style={{ margin: 0, color: "#64748b", fontWeight: 600 }}>Canceled {canceledAt}</p>
              ) : null}
            </div>

            {archived ? (
              <div
                style={{
                  borderRadius: "16px",
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                  padding: "16px",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <strong style={{ color: "#0f172a" }}>Removed from active work</strong>
                <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
                  This request is archived and no longer appears as active operational work.
                </p>
              </div>
            ) : canceled ? (
              <div
                style={{
                  borderRadius: "16px",
                  border: "1px solid #fecaca",
                  background: "#fff5f5",
                  padding: "16px",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <strong style={{ color: "#7f1d1d" }}>Workflow terminated</strong>
                <p style={{ margin: 0, color: "#7f1d1d", lineHeight: 1.6 }}>
                  This request is canceled, preserved, and excluded from active release actions.
                </p>
              </div>
            ) : (
              <div
                style={{
                  borderRadius: "16px",
                  border: `1px solid ${showArchiveConfirm ? "#cbd5e1" : "#e2e8f0"}`,
                  background: showArchiveConfirm ? "#f8fafc" : "#ffffff",
                  padding: "16px",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <strong style={{ color: "#0f172a" }}>Archive Request</strong>
                <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
                  Move this request out of active workflow while keeping the full record available.
                </p>
                {showArchiveConfirm ? (
                  <>
                    <div
                      style={{
                        borderRadius: "12px",
                        border: "1px solid #d6dbe4",
                        background: "#ffffff",
                        padding: "12px 14px",
                        color: "#334155",
                        fontWeight: 600,
                        lineHeight: 1.5,
                      }}
                    >
                      Archive this request from active workflow?
                    </div>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={handleArchiveQuote}
                        style={{
                          border: "none",
                          background: "#0f172a",
                          color: "#ffffff",
                          borderRadius: "12px",
                          padding: "11px 14px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Confirm Archive
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowArchiveConfirm(false)}
                        style={{
                          border: "1px solid #d6dbe4",
                          background: "#ffffff",
                          color: "#334155",
                          borderRadius: "12px",
                          padding: "11px 14px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Keep Active
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowArchiveConfirm(true)}
                    style={{
                      border: "1px solid #d6dbe4",
                      background: "#ffffff",
                      color: "#334155",
                      borderRadius: "12px",
                      padding: "11px 14px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Archive Request
                  </button>
                )}
              </div>
            )}
          </div>
          </WorkspaceCard>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, 0.9fr)",
            gap: "18px",
          }}
        >
          <WorkspaceCard
            eyebrow="Readiness"
            title="Requirements"
            description={
              productionReadiness.ready
                ? "All release requirements are satisfied."
                : "Resolve the remaining requirements below before moving this request into production."
            }
            background={productionReadiness.ready ? "#ecfdf5" : "#fff7ed"}
          >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: "14px",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  color: productionReadiness.ready ? "#166534" : "#9a3412",
                  fontSize: "12px",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Ready for Production
              </p>
              <p
                style={{
                  margin: "6px 0 0",
                  color: productionReadiness.ready ? "#166534" : "#7c2d12",
                  lineHeight: 1.6,
                  fontWeight: 700,
                }}
              >
                {productionReadiness.ready
                  ? "This request has everything needed to move into production."
                  : "This section shows what is still required before this request can move into production."}
              </p>
            </div>
            <StatusPill tone={productionReadiness.ready ? "success" : "warning"}>
              {readinessSummary}
            </StatusPill>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            {productionReadiness.checks.map((check) => (
              <div
                key={check.label}
                style={{
                  borderRadius: "14px",
                  padding: "14px",
                  border: `1px solid ${check.passed ? "#bbf7d0" : "#fed7aa"}`,
                  background: check.passed ? "#f0fdf4" : "#fffaf0",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    color: check.passed ? "#166534" : "#9a3412",
                    fontSize: "11px",
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  {check.label}
                </p>
                <strong
                  style={{
                    display: "block",
                    marginTop: "6px",
                    color: check.passed ? "#166534" : "#7c2d12",
                  }}
                >
                  {check.detail}
                </strong>
              </div>
            ))}
          </div>
          </WorkspaceCard>

          <WorkspaceCard
            eyebrow="Release"
            title="Move the request forward"
            description="Production release actions stay visible here instead of being hidden behind an accordion preview."
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "14px",
                marginBottom: "18px",
              }}
            >
              <DetailItem label="Approval status" value={approvalStatus} />
              <DetailItem label="Deposit status" value={depositStatus} />
              <DetailItem label="Next action" value={nextStep} />
              <DetailItem
                label="Release gate"
                value={productionReadiness.ready ? "Eligible for production release" : "Blocked by requirements"}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              {canAdvanceQuoteStatus(order.quote_status) ? (
                <button
                  type="button"
                  onClick={handleAdvanceQuote}
                  disabled={archived}
                  style={{
                    border: "none",
                    background: "#0f172a",
                    color: "#ffffff",
                    borderRadius: "12px",
                    padding: "11px 14px",
                    fontWeight: 700,
                    cursor: archived ? "not-allowed" : "pointer",
                    opacity: archived ? 0.55 : 1,
                  }}
                >
                  Mark {getNextQuoteStatus(order.quote_status)}
                </button>
              ) : null}
              {isQuoteReadyForProduction(order.quote_status) ? (
                <button
                  type="button"
                  onClick={handleReleaseToProduction}
                  disabled={archived}
                  style={{
                    border: "none",
                    background: "#166534",
                    color: "#ffffff",
                    borderRadius: "12px",
                    padding: "11px 14px",
                    fontWeight: 700,
                    cursor: archived ? "not-allowed" : "pointer",
                    opacity: archived ? 0.55 : 1,
                  }}
                >
                  Release to Production
                </button>
              ) : null}
              {archived ? (
                <StatusPill>Archived record</StatusPill>
              ) : (
                <span style={{ color: "#64748b", fontSize: "14px", fontWeight: 600 }}>
                  Archive control stays in Visibility so it remains deliberate and easy to find.
                </span>
              )}
            </div>
          </WorkspaceCard>
        </div>

        <WorkspaceCard
          id="quote-artwork-approval"
          eyebrow="Approvals And Artwork"
          title="Customer sign-off and art visibility"
          description="Artwork, placements, and customer-facing details remain visible while you manage the request."
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "14px",
            }}
          >
            <DetailItem label="Customer" value={formatValue(order.customer_name, "Walk-in Customer")} />
            <DetailItem label="Garment" value={formatValue(order.garment, "Custom garment")} />
            <DetailItem label="Decoration Type" value={formatValue(order.decoration_type)} />
            <DetailItem label="Quantity" value={formatValue(order.qty, "0")} />
            <DetailItem
              label="Placements"
              value={formatList((order.placements || []).map((entry) => entry.placement))}
            />
            <DetailItem
              label="Artwork files"
              value={formatList(artworkNames, "No artwork uploaded")}
            />
            <DetailItem label="Artwork approval" value={approvalStatus} />
            <DetailItem
              label="Artwork readiness"
              value={productionReadiness.checks.find((check) => check.label === "Artwork")?.detail || "No artwork required"}
            />
          </div>
          {order.notes ? (
            <div style={{ marginTop: "16px" }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 800 }}>Notes</p>
              <p style={{ margin: "6px 0 0", color: "#171717" }}>{order.notes}</p>
            </div>
          ) : null}
        </WorkspaceCard>

        <WorkspaceCard
          eyebrow="Pricing"
          title="Pricing and payment position"
          description="Payment visibility stays persistent in the detail workspace so request decisions are made with current pricing context."
        >
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "18px" }}>
            <StatusPill tone={financials?.invoice_status === "Paid" ? "success" : financials?.invoice_status === "Overdue" ? "warning" : "default"}>
              Invoice {formatValue(financials?.invoice_status)}
            </StatusPill>
            <StatusPill tone={financials?.payment_status === "Paid" ? "success" : financials?.payment_collection_state === "Awaiting Deposit" ? "warning" : "default"}>
              {formatValue(financials?.payment_status)}
            </StatusPill>
            <StatusPill tone={financials?.payment_collection_state === "Paid" ? "success" : "default"}>
              {formatValue(financials?.payment_collection_state)}
            </StatusPill>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "14px",
              marginBottom: "18px",
            }}
          >
            <DetailItem label="Total" value={money(financials?.total_amount)} />
            <DetailItem label="Deposit Target" value={money(financials?.deposit_amount)} />
            <DetailItem label="Deposit Applied" value={money(financials?.deposit_applied)} />
            <DetailItem label="Paid To Date" value={money(financials?.total_paid)} />
            <DetailItem label="Balance Owing" value={money(financials?.balance_due)} />
            <DetailItem label="Amount Due Now" value={money(financials?.amount_due_now)} />
            <DetailItem label="Collection Step" value={formatValue(financials?.payment_collection_state)} />
          </div>

          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "14px",
              background: "#f8fafc",
              marginBottom: "18px",
            }}
          >
            <p style={{ margin: 0, color: "#0f172a", fontWeight: 700 }}>
              {formatValue(financials?.deposit_credited_message)}
            </p>
            <p style={{ margin: "6px 0 0", color: "#64748b" }}>
              {formatValue(financials?.balance_summary)}
            </p>
          </div>

          <PaymentRequestForm
            id="quote-payment-request-form"
            title="Create Payment Request"
            description="Create a staff-managed payment request for this quote while the legacy deposit visibility remains unchanged."
            order={financials}
            defaultType={financials?.payment_collection_state === "Awaiting Deposit" ? "deposit" : "balance"}
          />

          {quoteSnapshot ? (
            <PricingSummary quote={quoteSnapshot} quantity={order.qty} />
          ) : (
            <p style={{ margin: 0, color: "#64748b" }}>
              Pricing snapshot will appear here once pricing data is available.
            </p>
          )}
        </WorkspaceCard>

        {canceled ? (
          <WorkspaceCard
            eyebrow="Record History"
            title="Canceled timeline"
            description="Cancellation events and preserved workflow history remain available for review on this record."
            background="#fff5f5"
          >
            <ReferenceTimeline events={historyEvents} compact embedded />
          </WorkspaceCard>
        ) : null}
        </div>
      )}
    </div>
  );
}
