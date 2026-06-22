import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { formatDateTime, formatShortDate } from "../lib/dateFormatting";
import { useStoredOrders } from "../lib/ordersStore";
import { normalizeOrderFinancials } from "../orders/orderFinancials";
import { buildApprovalStatus, buildDepositStatus } from "../quotes/productionReadiness";
import { isQuoteArchived, isQuoteCanceled } from "../quotes/quoteWorkflow";
import { getActiveStaffUser } from "../lib/staffUsersStore";
import {
  canManageCanceledOrders,
  getAdminViewer,
} from "./adminRoleView";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function buildCanceledTimestamp(order = {}) {
  return order.canceled_at || order.quote_canceled_at || order.updated_at || order.created_at || "";
}

function hasProductionLifecycleHistory(order = {}) {
  const activityTypes = new Set((order.activity_log || []).map((event) => event?.type));

  return Boolean(
    order.production_started_at ||
      order.completed_at ||
      order.picked_up_at ||
      order.assigned_to_staff_id ||
      order.assigned_at ||
      order.production_due_at ||
      activityTypes.has("release_to_production") ||
      activityTypes.has("assignment") ||
      activityTypes.has("status_change") ||
      activityTypes.has("pickup")
  );
}

function buildCanceledRecords(orders = []) {
  return orders
    .filter((order) => isQuoteCanceled(order) && !isQuoteArchived(order))
    .map((order) => {
      const financials = normalizeOrderFinancials(order);
      const canceledAt = buildCanceledTimestamp(order);
      const productionRecord = hasProductionLifecycleHistory(order);

      return {
        ...order,
        canceledAt,
        financials,
        total: financials.total_amount,
        balance: financials.balance_due,
        totalPaid: financials.total_paid,
        depositStatus: buildDepositStatus(order, financials),
        approvalStatus: buildApprovalStatus(order),
        recordContext: productionRecord ? "Production workflow" : "Request review",
        detailPath: productionRecord
          ? `/admin/orders/${order.order_number}`
          : `/admin/quotes/${order.order_number}`,
      };
    })
    .sort((left, right) => String(right.canceledAt || "").localeCompare(String(left.canceledAt || "")));
}

function SummaryCard({ label, value, tone = "default" }) {
  const tones = {
    default: { background: "#ffffff", border: "#e2e8f0", color: "#0f172a" },
    danger: { background: "#fff5f5", border: "#fecaca", color: "#7f1d1d" },
    neutral: { background: "#f8fafc", border: "#d8e1ea", color: "#334155" },
  };
  const palette = tones[tone] || tones.default;

  return (
    <article
      style={{
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: "18px",
        padding: "18px",
      }}
    >
      <p style={{ margin: 0, color: "#64748b", fontWeight: 800 }}>{label}</p>
      <h2 style={{ margin: "8px 0 0", color: palette.color }}>{value}</h2>
    </article>
  );
}

function StatusPill({ children, tone = "default" }) {
  const tones = {
    default: { background: "#f8fafc", border: "#e2e8f0", color: "#0f172a" },
    danger: { background: "#fef2f2", border: "#fecaca", color: "#b91c1c" },
    warning: { background: "#fff7ed", border: "#fed7aa", color: "#9a3412" },
    success: { background: "#ecfdf5", border: "#bbf7d0", color: "#166534" },
  };
  const palette = tones[tone] || tones.default;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        padding: "7px 11px",
        background: palette.background,
        color: palette.color,
        border: `1px solid ${palette.border}`,
        fontWeight: 800,
        fontSize: "12px",
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

export default function CanceledOrders() {
  const location = useLocation();
  const navigate = useNavigate();
  const viewer = getAdminViewer(getActiveStaffUser());
  const canViewCanceledOrders = canManageCanceledOrders(viewer);
  const orders = useStoredOrders();
  const canceledRecords = useMemo(() => buildCanceledRecords(orders), [orders]);
  const [flashMessage, setFlashMessage] = useState(() => location.state?.flashMessage || "");
  const [flashTone] = useState(() => location.state?.flashTone || "default");

  const productionCanceledRecords = useMemo(
    () => canceledRecords.filter((record) => record.recordContext === "Production workflow"),
    [canceledRecords]
  );
  const quoteCanceledRecords = useMemo(
    () => canceledRecords.filter((record) => record.recordContext === "Request review"),
    [canceledRecords]
  );
  const totalCanceledValue = useMemo(
    () => canceledRecords.reduce((sum, record) => sum + Number(record.total || 0), 0),
    [canceledRecords]
  );

  useEffect(() => {
    if (!location.state?.flashMessage) return;
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!flashMessage) return;

    const flashTimer = window.setTimeout(() => {
      setFlashMessage("");
    }, 5000);

    return () => window.clearTimeout(flashTimer);
  }, [flashMessage]);

  if (!canViewCanceledOrders) {
    return (
      <div style={{ maxWidth: "980px", margin: "0 auto", padding: "24px" }}>
        <h1>Canceled Orders</h1>
        <p style={{ color: "#475569", lineHeight: 1.6 }}>
          Canceled operational records are available only in the owner/admin workspace.
        </p>
        <Link to="/admin/quotes" style={{ color: "#0f172a", fontWeight: 700 }}>
          Return to Order Requests
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1220px", margin: "0 auto", padding: "24px" }}>
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
              color: "#991b1b",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Records Archive
          </p>
          <h1 style={{ margin: "8px 0 6px" }}>Canceled Orders</h1>
          <p style={{ margin: 0, color: "#475569", maxWidth: "780px", lineHeight: 1.6 }}>
            Intentionally terminated workflows live here as preserved operational records. Archived
            historical quotes remain separate so cancellation and archival stay distinct lifecycle states.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link
            to="/admin/quotes"
            style={{
              background: "#ffffff",
              color: "#171717",
              border: "1px solid #d6dbe4",
              borderRadius: "12px",
              padding: "12px 16px",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            View Active Requests
          </Link>
          <Link
            to="/admin/quotes/archived"
            style={{
              background: "#ffffff",
              color: "#171717",
              border: "1px solid #d6dbe4",
              borderRadius: "12px",
              padding: "12px 16px",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Archived Requests
          </Link>
        </div>
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <SummaryCard label="Canceled Records" value={canceledRecords.length} tone="danger" />
        <SummaryCard label="Canceled Production Records" value={productionCanceledRecords.length} tone="neutral" />
        <SummaryCard label="Canceled Request Records" value={quoteCanceledRecords.length} tone="neutral" />
        <SummaryCard label="Preserved Record Value" value={money(totalCanceledValue)} />
      </section>

      {flashMessage ? (
        <section
          aria-live="polite"
          style={{
            marginBottom: "20px",
            borderRadius: "18px",
            padding: "16px 18px",
            border: "1px solid #cbd5e1",
            background: flashTone === "success" ? "#ecfdf5" : "#f8fafc",
            color: flashTone === "success" ? "#166534" : "#334155",
            fontWeight: 700,
          }}
        >
          {flashMessage}
        </section>
      ) : null}

      <section
        style={{
          background: "#fff7f7",
          borderRadius: "20px",
          padding: "22px",
          border: "1px solid #fecaca",
        }}
      >
        <div style={{ marginBottom: "18px" }}>
          <p
            style={{
              margin: 0,
              color: "#b91c1c",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Terminated Workflow Records
          </p>
          <h2 style={{ margin: "6px 0 4px", color: "#7f1d1d" }}>Canceled workflow history</h2>
          <p style={{ margin: 0, color: "#7f1d1d", maxWidth: "820px", lineHeight: 1.6 }}>
            Each record keeps its financial state, deposits, payments, notes, and timeline history
            intact while remaining outside active workflow.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(120px, 1fr) minmax(180px, 1.4fr) minmax(140px, 1fr) minmax(120px, 1fr) minmax(180px, 1.1fr) minmax(180px, 1.1fr) auto",
            gap: "12px",
            padding: "0 4px 12px",
            borderBottom: "1px solid #fecaca",
            color: "#7f1d1d",
            fontSize: "12px",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <span>Order #</span>
          <span>Customer</span>
          <span>Canceled Date</span>
          <span>Total</span>
          <span>Operational State</span>
          <span>Financial State</span>
          <span>Record</span>
        </div>

        <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
          {canceledRecords.length ? (
            canceledRecords.map((record) => (
              <article
                key={record.order_number}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(120px, 1fr) minmax(180px, 1.4fr) minmax(140px, 1fr) minmax(120px, 1fr) minmax(180px, 1.1fr) minmax(180px, 1.1fr) auto",
                  gap: "12px",
                  alignItems: "center",
                  padding: "16px",
                  borderRadius: "16px",
                  border: "1px solid #fecaca",
                  background: "#ffffff",
                }}
              >
                <div style={{ display: "grid", gap: "6px" }}>
                  <strong style={{ color: "#7f1d1d" }}>{record.order_number || "—"}</strong>
                  <StatusPill tone="danger">Canceled</StatusPill>
                </div>

                <div style={{ display: "grid", gap: "4px" }}>
                  <strong style={{ color: "#0f172a" }}>
                    {record.customer_name || "Walk-in Customer"}
                  </strong>
                  <span style={{ color: "#475569" }}>{record.garment || "Custom garment"}</span>
                </div>

                <div style={{ display: "grid", gap: "4px" }}>
                  <strong style={{ color: "#334155" }}>{formatShortDate(record.canceledAt)}</strong>
                  <span style={{ color: "#64748b", fontSize: "13px" }}>
                    {formatDateTime(record.canceledAt)}
                  </span>
                </div>

                <strong style={{ color: "#0f172a" }}>{money(record.total)}</strong>

                <div style={{ display: "grid", gap: "6px" }}>
                  <StatusPill tone="danger">{record.recordContext}</StatusPill>
                  <span style={{ color: "#475569", fontSize: "13px", fontWeight: 700 }}>
                    {record.status || "Canceled"} workflow terminated
                  </span>
                </div>

                <div style={{ display: "grid", gap: "6px" }}>
                  <StatusPill tone={record.balance > 0 ? "warning" : "success"}>
                    {record.balance > 0 ? `Balance ${money(record.balance)}` : "Paid / settled"}
                  </StatusPill>
                  <span style={{ color: "#475569", fontSize: "13px", fontWeight: 700 }}>
                    {record.depositStatus} • {record.approvalStatus}
                  </span>
                  <span style={{ color: "#64748b", fontSize: "13px" }}>
                    Paid {money(record.totalPaid)}
                  </span>
                </div>

                <Link
                  to={record.detailPath}
                  style={{
                    color: "#7f1d1d",
                    textDecoration: "none",
                    fontWeight: 800,
                    justifySelf: "start",
                  }}
                >
                  View Record
                </Link>
              </article>
            ))
          ) : (
            <div
              style={{
                border: "1px dashed #fecaca",
                borderRadius: "18px",
                padding: "28px",
                color: "#7f1d1d",
                background: "#ffffff",
              }}
            >
              No canceled workflow records yet. Active workflow and archived records remain separate
              until a record is intentionally canceled or archived.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
