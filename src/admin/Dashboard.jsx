import { Link } from "react-router-dom";
import { useOrders } from "../repositories/ordersRepository";
import { getActiveStaffUser } from "../lib/staffUsersStore";
import { formatDateTime, formatShortDate } from "../lib/dateFormatting";
import { buildOperationalMetrics } from "../operations/buildOperationalMetrics";
import {
  isActiveQuoteWorkflowOrder,
  normalizeQuoteStatus,
} from "../quotes/quoteWorkflow";
import {
  isCanceledOperationalStatus,
  isCompletedOperationalStatus,
  normalizeOperationalStatus,
} from "../orders/orderWorkflow";
import {
  getAssignedOrdersForStaff,
  isStaffWorkspaceView,
  resolveOperationalRole,
} from "./adminRoleView";
import { buildProductionReadiness } from "../quotes/productionReadiness";
import StaffHomeWorkspace from "./StaffHomeWorkspace";
import AdminDiagnosticsPanel from "../components/AdminDiagnosticsPanel";
import { useOperationalEvents } from "../lib/operationalEventsStore";

function Section({ title, children, description, className = "" }) {
  return (
    <section
      className={`owner-dashboard-section ${className}`.trim()}
      style={{
        background: "#ffffff",
        borderRadius: "20px",
        padding: "16px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 10px 26px rgba(15, 23, 42, 0.035)",
      }}
    >
      <div style={{ marginBottom: "12px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", lineHeight: 1.15 }}>{title}</h2>
        {description ? (
          <p style={{ margin: "5px 0 0", color: "#64748b", maxWidth: "700px", lineHeight: 1.45, fontSize: "13px" }}>
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SummaryCard({ label, value, tone = "default", detail }) {
  const tones = {
    default: { background: "#f8fafc", border: "#e2e8f0", value: "#0f172a", label: "#475569" },
    warning: { background: "#fff7ed", border: "#fed7aa", value: "#9a3412", label: "#9a3412" },
    success: { background: "#ecfdf5", border: "#bbf7d0", value: "#166534", label: "#166534" },
    danger: { background: "#fef2f2", border: "#fecaca", value: "#b91c1c", label: "#b91c1c" },
  };
  const palette = tones[tone] || tones.default;

  return (
    <article
      style={{
        background: palette.background,
        borderRadius: "16px",
        padding: "16px",
        border: `1px solid ${palette.border}`,
      }}
    >
      <p style={{ margin: 0, color: palette.label, fontSize: "12px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </p>
      <h2 style={{ margin: "10px 0 0", color: palette.value, fontSize: "30px" }}>{value}</h2>
      {detail ? (
        <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: "13px", lineHeight: 1.4 }}>
          {detail}
        </p>
      ) : null}
    </article>
  );
}

function buildWorkflowSnapshotCards(orders = []) {
  const snapshot = {
    awaitingApproval: 0,
    awaitingDeposit: 0,
    artworkNeeded: 0,
    readyForProduction: 0,
    blockedJobs: 0,
  };

  orders.forEach((order) => {
    const quoteStatus = normalizeQuoteStatus(order.quote_status);

    if (isActiveQuoteWorkflowOrder(order)) {
      const readiness = buildProductionReadiness(order, order);
      const unmetChecks = readiness.checks.filter((check) => !check.passed);

      if (quoteStatus === "Awaiting Approval") {
        snapshot.awaitingApproval += 1;
      }

      if (quoteStatus === "Awaiting Deposit" || unmetChecks.some((check) => check.label === "Deposit")) {
        snapshot.awaitingDeposit += 1;
      }

      if (quoteStatus === "Awaiting Artwork Approval" || unmetChecks.some((check) => check.label === "Artwork")) {
        snapshot.artworkNeeded += 1;
      }

      if (readiness.ready || quoteStatus === "Ready For Production") {
        snapshot.readyForProduction += 1;
      }

      return;
    }

    const operationalStatus = normalizeOperationalStatus(order.status);
    const isBlockedByAssignment = order.needs_assignment || !order.assigned_to_staff_name;
    const isBlockedAtIntake = operationalStatus === "New";

    if (
      !isCompletedOperationalStatus(operationalStatus) &&
      !isCanceledOperationalStatus(operationalStatus) &&
      (isBlockedByAssignment || isBlockedAtIntake)
    ) {
      snapshot.blockedJobs += 1;
    }
  });

  return [
    { label: "Awaiting Approval", value: snapshot.awaitingApproval, tone: "warning" },
    { label: "Awaiting Deposit", value: snapshot.awaitingDeposit, tone: "warning" },
    { label: "Artwork Needed", value: snapshot.artworkNeeded, tone: "warning" },
    { label: "Ready For Production", value: snapshot.readyForProduction, tone: "success" },
    { label: "Blocked Jobs", value: snapshot.blockedJobs, tone: "default" },
  ];
}

function WorkspaceCountLink({ label, count, description, to, tone = "default" }) {
  const tones = {
    default: { background: "#f8fafc", border: "#e2e8f0", count: "#0f172a", label: "#0f172a" },
    warning: { background: "#fff7ed", border: "#fed7aa", count: "#9a3412", label: "#7c2d12" },
    success: { background: "#ecfdf5", border: "#bbf7d0", count: "#166534", label: "#166534" },
    danger: { background: "#fef2f2", border: "#fecaca", count: "#b91c1c", label: "#991b1b" },
  };
  const palette = tones[tone] || tones.default;

  return (
    <Link
      to={to}
      className="owner-dashboard-count-link"
      style={{
        display: "grid",
        gap: "8px",
        alignItems: "start",
        borderRadius: "14px",
        padding: "13px 14px",
        background: palette.background,
        border: `1px solid ${palette.border}`,
        color: "#171717",
        textDecoration: "none",
      }}
      >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 900, fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: palette.label }}>
            {label}
          </p>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "12px", lineHeight: 1.35 }}>
            {description}
          </p>
        </div>
        <strong style={{ fontSize: "28px", lineHeight: 1, color: palette.count }}>{count}</strong>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
        <span style={{ color: "#475569", fontWeight: 700, fontSize: "12px" }}>Open dedicated workspace</span>
        <span style={{ color: "#64748b", fontWeight: 800, fontSize: "12px", whiteSpace: "nowrap" }}>View</span>
      </div>
    </Link>
  );
}

function buildOwnerAttentionItems(orders = []) {
  const snapshot = buildWorkflowSnapshotCards(orders);
  const lookup = Object.fromEntries(snapshot.map((card) => [card.label, card.value]));
  const metrics = buildOperationalMetrics(orders);
  const activeOrders = orders.filter((order) => {
    const status = normalizeOperationalStatus(order.status);
    return !isCompletedOperationalStatus(status) && !isCanceledOperationalStatus(status);
  });
  const readyForPickup = activeOrders.filter(
    (order) => normalizeOperationalStatus(order.status) === "Ready For Pickup"
  ).length;

  return [
    {
      label: "Overdue Production",
      count: metrics.overdue,
      description: "Jobs past due date need immediate review in Shop Production.",
      to: "/admin/orders",
      tone: "danger",
    },
    {
      label: "Awaiting Approval",
      count: lookup["Awaiting Approval"] || 0,
      description: "Quotes still waiting on customer approval before production can move.",
      to: "/admin/quotes?queue=awaiting-approval",
      tone: "warning",
    },
    {
      label: "Awaiting Deposit",
      count: lookup["Awaiting Deposit"] || 0,
      description: "Quote work is blocked until deposit collection is complete.",
      to: "/admin/quotes?queue=awaiting-deposit",
      tone: "warning",
    },
    {
      label: "Needs Assignment",
      count: metrics.needsAssignment,
      description: "Operational work still needs dispatch before the floor can absorb it.",
      to: "/admin/assignments",
      tone: "default",
    },
    {
      label: "Ready For Pickup",
      count: readyForPickup,
      description: "Completed work is waiting for customer handoff at the counter.",
      to: "/admin/orders?status=ready-for-pickup",
      tone: "success",
    },
  ]
    .filter((item) => item.count > 0)
    .slice(0, 3);
}

function UpcomingOrderCard({ order }) {
  return (
    <Link
      to={`/admin/orders/${order.orderNumber}`}
      className="owner-dashboard-upcoming-card"
      style={{
        display: "grid",
        gap: "7px",
        borderRadius: "14px",
        padding: "12px 14px",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        textDecoration: "none",
        color: "#171717",
      }}
      >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <strong>{order.orderNumber}</strong>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{order.customerName}</p>
        </div>
        <strong style={{ color: "#0f172a", whiteSpace: "nowrap" }}>{order.dueLabel}</strong>
      </div>
      <div>
        <p style={{ margin: 0, color: "#475569", fontWeight: 700, fontSize: "13px" }}>{order.status}</p>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13px", lineHeight: 1.4 }}>{order.garment}</p>
      </div>
    </Link>
  );
}

function EmptyAttentionState() {
  return (
    <div
      className="owner-dashboard-empty-state"
      style={{
        padding: "16px",
        borderRadius: "16px",
        border: "1px dashed #cbd5e1",
        background: "#f8fafc",
      }}
    >
      <p style={{ margin: 0, fontWeight: 800, color: "#0f172a" }}>No immediate owner escalations.</p>
      <p style={{ margin: "6px 0 0", color: "#64748b", lineHeight: 1.5, fontSize: "13px" }}>
        The highest-priority queues are clear right now. Use the workspace links to move into quotes, production, counter, or financial detail only when needed.
      </p>
    </div>
  );
}

function eventTone(eventType) {
  if (["order_canceled"].includes(eventType)) {
    return {
      border: "#fecaca",
      background: "#fef2f2",
      badgeBackground: "#fee2e2",
      badgeColor: "#b91c1c",
    };
  }

  if (["deposit_recorded", "final_payment_recorded", "pickup_completed", "assignment_completed"].includes(eventType)) {
    return {
      border: "#bbf7d0",
      background: "#f0fdf4",
      badgeBackground: "#dcfce7",
      badgeColor: "#166534",
    };
  }

  if (["ready_for_pickup", "order_ready_for_pickup", "deposit_request_sent"].includes(eventType)) {
    return {
      border: "#bfdbfe",
      background: "#eff6ff",
      badgeBackground: "#dbeafe",
      badgeColor: "#1d4ed8",
    };
  }

  return {
    border: "#e2e8f0",
    background: "#f8fafc",
    badgeBackground: "#e2e8f0",
    badgeColor: "#334155",
  };
}

function formatEventTypeLabel(eventType = "") {
  return String(eventType || "operational_update")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function OperationalEventCard({ event }) {
  const tone = eventTone(event.event_type);
  const destination = event.reference_path || "/admin";

  return (
    <Link
      to={destination}
      className="owner-dashboard-event-card"
      style={{
        display: "grid",
        gap: "7px",
        textDecoration: "none",
        color: "#0f172a",
        borderRadius: "14px",
        border: `1px solid ${tone.border}`,
        background: tone.background,
        padding: "11px 13px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: "999px",
            padding: "5px 9px",
            background: tone.badgeBackground,
            color: tone.badgeColor,
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {formatEventTypeLabel(event.event_type)}
        </span>
        <strong style={{ color: "#475569", fontSize: "13px" }}>
          {formatDateTime(event.created_at)}
        </strong>
      </div>

      <div>
        <strong style={{ display: "block", lineHeight: 1.5 }}>{event.summary}</strong>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13px", lineHeight: 1.4 }}>
          {event.reference_label}
          {event.workflow_label ? ` • ${event.workflow_label}` : ""}
          {event.staff_name ? ` • ${event.staff_name}` : ""}
        </p>
      </div>
    </Link>
  );
}

function buildUpcomingOperationalOrders(orders = []) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return orders
    .filter((order) => {
      const status = normalizeOperationalStatus(order.status);
      return (
        !isCompletedOperationalStatus(status) &&
        !isCanceledOperationalStatus(status) &&
        order.due_date
      );
    })
    .sort((left, right) => {
      const leftDate = new Date(`${left.due_date}T00:00:00`).getTime();
      const rightDate = new Date(`${right.due_date}T00:00:00`).getTime();
      return leftDate - rightDate;
    })
    .slice(0, 6)
    .map((order) => {
      const dueDate = new Date(`${order.due_date}T00:00:00`);
      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      let dueLabel = `Due ${formatShortDate(order.due_date)}`;
      if (diffDays < 0) {
        dueLabel = `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} overdue`;
      } else if (diffDays === 0) {
        dueLabel = "Due today";
      } else if (diffDays === 1) {
        dueLabel = "Due tomorrow";
      }

      return {
        orderNumber: order.order_number,
        customerName: order.customer_name || "Walk-in Customer",
        garment: order.garment || order.item || "Custom garment",
        status: normalizeOperationalStatus(order.status),
        dueLabel,
      };
    });
}

function OwnerDashboard({ orders, operationalEvents }) {
  const attentionItems = buildOwnerAttentionItems(orders);
  const upcomingOrders = buildUpcomingOperationalOrders(orders);
  const recentOperationalEvents = operationalEvents.slice(0, 6);

  return (
    <div
      className="owner-dashboard-page"
      style={{ width: "100%", boxSizing: "border-box", padding: "18px 16px 24px" }}
    >
      <div className="owner-dashboard-hero" style={{ marginBottom: "14px" }}>
        <p style={{ margin: 0, color: "#78716c", fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Owner Operations</p>
        <h1 style={{ margin: "4px 0 6px", fontSize: "32px", lineHeight: 1.02 }}>Dashboard</h1>
        <p style={{ margin: 0, color: "#64748b", maxWidth: "680px", lineHeight: 1.45, fontSize: "14px" }}>Urgent owner attention, recent operational activity, and direct paths into the workspace that owns the work.</p>
      </div>

      <div
        className="owner-dashboard-layout"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
          gap: "14px",
          alignItems: "start",
        }}
      >
        <div className="owner-dashboard-primary-column" style={{ display: "grid", gap: "14px", alignContent: "start" }}>
          <Section
            className="owner-dashboard-section-primary"
            title="Owner Attention"
            description="Only the highest-priority items stay here. Detailed queue management remains in Quotes, Shop Production, Front Counter, Assignments, and Financial."
          >
            {attentionItems.length ? (
              <div className="owner-dashboard-attention-grid" style={{ display: "grid", gap: "12px" }}>
                {attentionItems.map((queue) => (
                  <WorkspaceCountLink
                    key={queue.label}
                    label={queue.label}
                    count={queue.count}
                    description={queue.description}
                    to={queue.to}
                    tone={queue.tone}
                  />
                ))}
              </div>
            ) : (
              <EmptyAttentionState />
            )}
          </Section>

          <Section
            className="owner-dashboard-section-primary"
            title="Upcoming Deadlines"
            description="A short operational cut of the next due jobs so the owner overview stays useful without becoming another production board."
          >
            {upcomingOrders.length ? (
              <div className="owner-dashboard-deadlines-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                {upcomingOrders.slice(0, 6).map((order) => (
                  <UpcomingOrderCard key={order.orderNumber} order={order} />
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>
                No active jobs with due dates are in the operational queue.
              </p>
            )}
          </Section>
        </div>

        <div
          className="owner-dashboard-secondary-column"
          style={{ display: "grid", gap: "14px", alignContent: "start", maxWidth: "420px" }}
        >
          <Section
            className="owner-dashboard-section-secondary"
            title="Recent Operational Activity"
            description="Important workflow actions performed by staff. This stays lightweight and owner-facing so operational awareness improves without turning into a notification center."
          >
            {recentOperationalEvents.length ? (
              <div className="owner-dashboard-events-list" style={{ display: "grid", gap: "9px" }}>
                {recentOperationalEvents.map((event) => (
                  <OperationalEventCard key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>
                Important operational events will appear here as staff complete workflow actions.
              </p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const orders = useOrders();
  const operationalEvents = useOperationalEvents();
  const staffUser = getActiveStaffUser();
  const resolvedRole = resolveOperationalRole(staffUser);

  if (!resolvedRole) {
    return (
      <AdminDiagnosticsPanel
        title="Dashboard role unresolved"
        message="The dashboard loaded before the operational role could be determined, so rendering has been paused with diagnostics."
        staffUser={staffUser}
        pathname="/admin"
        workspaceAccess="blocked"
      />
    );
  }

  if (isStaffWorkspaceView(staffUser)) {
    return (
      <StaffHomeWorkspace
        orders={getAssignedOrdersForStaff(orders, staffUser)}
        staffUser={staffUser}
      />
    );
  }

  return <OwnerDashboard orders={orders} operationalEvents={operationalEvents} />;
}
