import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import PricingSummary from "../components/PricingSummary";
import { formatDateTime } from "../lib/dateFormatting";
import { getOrderArtworkNames } from "../lib/orderArtwork";
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
import {
  canManageArchivedQuotes,
  getAdminViewer,
  isStaffWorkspaceView,
} from "./adminRoleView";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
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
          Preserved quote history for reference, including workflow changes and archival events.
        </p>
      </div>

      {!events.length ? (
        <p style={{ margin: 0, color: "#78716c" }}>No recorded activity for this quote yet.</p>
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
                {event.note || "Quote activity recorded."}
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

function WorkspaceCard({ eyebrow, title, description, children, background = "#ffffff", compact = false, className }) {
  return (
    <section className={className} style={cardStyle(background, compact)}>
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
    : "Await remaining quote requirements";

  useEffect(() => {
    if (!archived || !isStaffWorkspace) return;

    navigate("/admin/quotes", {
      replace: true,
      state: {
        flashMessage: "Archived quote records are available only in the owner/admin workspace.",
        flashTone: "default",
      },
    });
  }, [archived, isStaffWorkspace, navigate]);

  if (!order) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px" }}>
        <h1>Quote not found</h1>
        <Link to="/admin/quotes">Back to Quotes</Link>
      </div>
    );
  }

  function handleAdvanceQuote() {
    if (archived || canceled) return;
    if (!canAdvanceQuoteStatus(order.quote_status)) return;

    const nextQuoteStatus = getNextQuoteStatus(order.quote_status);
    updateStoredOrder(order.order_number, {
      quote_status: nextQuoteStatus,
      activity_type: "quote_status",
      activity_note: `Quote status changed to ${nextQuoteStatus}.`,
    });
  }

  function handleReleaseToProduction() {
    if (archived || canceled) return;
    if (!isQuoteReadyForProduction(order.quote_status)) return;

    updateStoredOrder(order.order_number, {
      quote_status: "Ready For Production",
      status: "Awaiting Production",
      operational_visible: true,
      production_ready: true,
      activity_type: "release_to_production",
      activity_note: "Quote released into Production Orders.",
    });
  }

  function handleArchiveQuote() {
    if (archived || canceled) return;

    updateStoredOrder(order.order_number, {
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

  function handleRestoreQuote() {
    if (!archived) return;

    updateStoredOrder(order.order_number, {
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

  function handleCancelQuote() {
    if (archived || canceled) return;

    updateStoredOrder(order.order_number, {
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

  function handleToggleArchivedSection(sectionKey) {
    setArchivedSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
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
              ? "Archived Quote Record"
              : canceled
              ? "Canceled Quote Record"
              : "Quote Detail Workspace"}
          </p>
          <h1 style={{ margin: "6px 0" }}>Quote {order.order_number}</h1>
          <p style={{ margin: 0, color: "#475569", maxWidth: "760px" }}>
            {archived
              ? "Historical quote record for reference, context, and recovery back into the active quote workflow."
              : canceled
              ? "Canceled quote record with preserved operational and financial history for historical review."
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
            {archived ? "Back to Archived Quotes" : canceled ? "Back to Canceled Orders" : "Back to Quotes"}
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
              Archive Quote
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
              Archived Quotes
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
              Cancel Quote
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
              Active Quotes
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
            <strong style={{ color: "#292524" }}>This quote is preserved as a historical record.</strong>
          </div>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            It no longer appears in the active quote workflow and remains available here for historical reference.
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
                Restore Quote
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
              This quote was intentionally terminated and remains preserved for review.
            </strong>
          </div>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Operational work stopped on {canceledAt}. Financial history, payments, deposits, and timeline events are still available on this record.
          </p>
        </section>
      ) : null}

      {archived ? (
        <div style={{ display: "grid", gap: "18px" }}>
          <WorkspaceCard
            eyebrow="Reference Summary"
            title="Archived quote snapshot"
            description="Key quote details remain visible here without the active release and movement controls."
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
              <DetailItem label="Quote Total" value={money(financials?.total_amount)} />
              <DetailItem label="Quote Status" value={order.quote_status} />
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
                eyebrow="Original Quote"
                title="Quote details"
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
                  <DetailItem label="Customer Approval" value={approvalStatus} />
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
                    Quote pricing snapshot will appear here once pricing data is available.
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
                description="Reference-only context for how this quote now sits outside the active workflow."
                summary="Reference-only workflow state, visibility, and release context."
                background="#f5f5f4"
                compact
                className="archived-quote-reference-card"
              >
                <div className="archived-quote-context-grid">
                  <DetailItem label="Workflow Visibility" value="Removed from active workflow" />
                  <DetailItem label="Production Readiness" value="Reference only while archived" />
                  <DetailItem label="Release Workflow" value="Hidden until quote is restored" />
                  <DetailItem label="Deposit Actions" value="Hidden until quote is restored" />
                </div>
              </ArchivedAccordionSection>

              <ArchivedAccordionSection
                sectionKey="timeline"
                expandedSections={archivedSections}
                onToggle={handleToggleArchivedSection}
                eyebrow="Record History"
                title="Timeline"
                description="Preserved quote history, including workflow changes and archival events."
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
          title={canceled ? "Canceled quote record" : "Operational quote management"}
          description={
            canceled
              ? "This record is preserved for review, but operational release actions are disabled because the workflow was intentionally terminated."
              : "This route keeps quote-critical decisions visible at all times. It does not collapse like the list view."
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
            <DetailItem label="Quote Status" value={order.quote_status} />
            <DetailItem label="Production Readiness" value={readinessSummary} />
            <DetailItem label="Customer Approval" value={approvalStatus} />
            <DetailItem label="Deposit" value={depositStatus} />
            <DetailItem label="Source" value={order.source} />
            <DetailItem label="Due Date" value={order.due_date} />
            <DetailItem
              label="Workflow Visibility"
              value={
                archived
                  ? "Removed from active workflow"
                  : canceled
                  ? "Canceled operational workflow"
                  : "Active operational workflow"
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
            eyebrow="Workflow Visibility"
            title={archived ? "Archived record" : canceled ? "Canceled record" : "Quote lifecycle management"}
            description={
              archived
                ? "This record is preserved for reference, but it is no longer treated as active operational work."
                : canceled
                ? "This record was intentionally terminated. It remains preserved for review with no restore or archive action required."
                : "Archive and restore are normal operational lifecycle actions for owner and admin workflow management."
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
                {!archived && !canceled ? <StatusPill tone="warning">Visible in active quote queue</StatusPill> : null}
              </div>
              <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
                {archived
                  ? "Archived quotes stay viewable here while remaining out of active workflow and operational queue views."
                  : canceled
                  ? "Canceled quotes remain viewable here while their operational and financial history stays preserved."
                  : "Archiving removes this quote from the active quote workflow and operational queue visibility without changing the underlying record."}
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
                  This quote is archived and no longer appears as active operational work.
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
                  This quote is canceled, preserved, and excluded from active release actions.
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
                <strong style={{ color: "#0f172a" }}>Archive Quote</strong>
                <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
                  Move this quote out of active operational workflow while keeping the full record available.
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
                      Archive this quote from active workflow?
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
                    Archive Quote
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
            title="Production release requirements"
            description={
              productionReadiness.ready
                ? "All release requirements are satisfied."
                : "Resolve the remaining requirements below before moving this quote into production."
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
                Production Readiness
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
                  ? "This quote has everything needed to move into production."
                  : "This section shows what is still required before this quote can move into production."}
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
            eyebrow="Release Workflow"
            title="Move the quote forward"
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
                  Archive control stays in Workflow Visibility so it remains deliberate and easy to find.
                </span>
              )}
            </div>
          </WorkspaceCard>
        </div>

        <WorkspaceCard
          eyebrow="Approvals And Artwork"
          title="Customer sign-off and art visibility"
          description="Artwork, placements, and customer-facing details remain visible while you manage the quote."
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
          description="Financial visibility stays persistent in the detail workspace so quote decisions are made with current pricing context."
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
            <DetailItem label="Quote Total" value={money(financials?.total_amount)} />
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

          {quoteSnapshot ? (
            <PricingSummary quote={quoteSnapshot} quantity={order.qty} />
          ) : (
            <p style={{ margin: 0, color: "#64748b" }}>
              Quote pricing snapshot will appear here once pricing data is available.
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
