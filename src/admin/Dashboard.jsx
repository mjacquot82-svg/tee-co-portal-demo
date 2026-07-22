import { Link } from "react-router-dom";
import { useStoredOrders } from "../lib/ordersStore";
import { getActiveStaffUser } from "../lib/staffUsersStore";
import { formatDateTime } from "../lib/dateFormatting";
import { buildOperationalMetrics } from "../operations/buildOperationalMetrics";
import { buildOwnerWorkflowSnapshot } from "../dashboard/ownerDashboardQueues";
import {
  isCanceledOperationalStatus,
  isCompletedOperationalStatus,
  normalizeOperationalStatus,
} from "../orders/orderWorkflow";
import {
  isActiveQuoteWorkflowOrder,
  normalizeQuoteStatus,
} from "../quotes/quoteWorkflow";
import {
  getArtworkApprovalRequirement,
  normalizeArtworkApprovalStatus,
  normalizeDepositWorkflowStatus,
} from "../orders/workflowGating";
import {
  getAssignedOrdersForStaff,
  isStaffWorkspaceView,
  resolveOperationalRole,
} from "./adminRoleView";
import StaffHomeWorkspace from "./StaffHomeWorkspace";
import AdminDiagnosticsPanel from "../components/AdminDiagnosticsPanel";
import { useOperationalEvents } from "../lib/operationalEventsStore";

const pageShellStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "26px 18px 34px",
  background: "#fbfaf7",
  minHeight: "100%",
};

const workspaceStyle = {
  display: "grid",
  gap: "34px",
  maxWidth: "1420px",
  margin: "0 auto",
};

const sectionHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "18px",
  alignItems: "flex-end",
  flexWrap: "wrap",
};

const eyebrowStyle = {
  margin: 0,
  color: "#817568",
  fontSize: "12px",
  fontWeight: 850,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const sectionTitleStyle = {
  margin: "4px 0 0",
  color: "#1f1d1b",
  fontSize: "28px",
  lineHeight: 1.08,
};

const sectionDescriptionStyle = {
  margin: "6px 0 0",
  color: "#6f665f",
  fontSize: "14px",
  lineHeight: 1.45,
  maxWidth: "680px",
};

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function hasCustomerArtwork(order = {}) {
  return (
    (Array.isArray(order.artwork_files) && order.artwork_files.length > 0) ||
    Boolean(String(order.customer_artwork_id || "").trim())
  );
}

function isCurrentMonth(dateValue) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function buildOwnerWorkspaceModel(orders = [], operationalEvents = []) {
  const snapshot = buildOwnerWorkflowSnapshot(orders);
  const metrics = buildOperationalMetrics(orders);

  let quotesToPrepare = 0;
  let artworkToReview = 0;
  let artworkUploads = 0;
  let depositRequestsToSend = 0;
  let activeOrders = 0;
  let outstandingBalance = 0;
  let revenueThisMonth = 0;

  orders.forEach((order) => {
    const quoteStatus = normalizeQuoteStatus(order.quote_status);

    if (isActiveQuoteWorkflowOrder(order)) {
      const artworkRequired = getArtworkApprovalRequirement(order);
      const artworkStatus = normalizeArtworkApprovalStatus(order.artwork_approval_status, {
        required: artworkRequired,
      });
      const depositStatus = normalizeDepositWorkflowStatus(order.deposit_workflow_status, order);
      const depositAmount = Number(order.deposit_amount || order.deposit?.amount || 0) || 0;
      const depositRequired =
        order.deposit_required === true ||
        depositAmount > 0 ||
        String(order.deposit_requirement || "").trim().toLowerCase() === "required";

      if (quoteStatus === "Sent") {
        quotesToPrepare += 1;
      }

      if (artworkRequired && artworkStatus === "Pending Review" && hasCustomerArtwork(order)) {
        artworkToReview += 1;
      }

      if (
        quoteStatus === "Awaiting Artwork Approval" &&
        (!hasCustomerArtwork(order) || artworkStatus === "Needs Revision")
      ) {
        artworkUploads += 1;
      }

      if (depositRequired && ["Pending Decision", "Deposit Not Requested"].includes(depositStatus)) {
        depositRequestsToSend += 1;
      }

      return;
    }

    const status = normalizeOperationalStatus(order.status);
    if (!isCompletedOperationalStatus(status) && !isCanceledOperationalStatus(status)) {
      activeOrders += 1;
    }
  });

  orders.forEach((order) => {
    const status = normalizeOperationalStatus(order.status);
    const isCanceled = isCanceledOperationalStatus(status);
    const balanceDue = Number(order.balance_due || order.balance || 0) || 0;

    if (!isCanceled) {
      outstandingBalance += Math.max(0, balanceDue);
    }

    if (isCurrentMonth(order.completed_at || order.paid_at || order.updated_at || order.created_at)) {
      const paid = Number(order.total_paid || order.amount_paid || 0) || 0;
      const total = Number(order.total_amount || order.order_total || order.quote_total || 0) || 0;
      revenueThisMonth += Math.max(paid, balanceDue <= 0 && !isCanceled ? total : 0);
    }
  });

  const attentionItems = [
    {
      key: "new-order-requests",
      label: "New Order Requests",
      count: snapshot.newOrderRequests,
      detail: "Review incoming customer requests and decide the next step.",
      action: "Open Requests",
      to: "/admin/quotes",
      tone: "attention",
    },
    {
      key: "quotes-to-prepare",
      label: "Quotes to Prepare",
      count: quotesToPrepare,
      detail: "Requests are in intake and need pricing or quote review.",
      action: "Prepare Quotes",
      to: "/admin/quotes",
      tone: "attention",
    },
    {
      key: "artwork-to-review",
      label: "Artwork to Review",
      count: artworkToReview,
      detail: "Customer files are in and need Teresa's approval decision.",
      action: "Review Artwork",
      to: "/admin/quotes?queue=awaiting-artwork",
      tone: "attention",
    },
    {
      key: "deposit-requests-to-send",
      label: "Deposit Requests to Send",
      count: depositRequestsToSend,
      detail: "Deposit requirements exist but the request has not been sent.",
      action: "Send Requests",
      to: "/admin/quotes?queue=awaiting-deposit",
      tone: "attention",
    },
  ];

  const waitingItems = [
    {
      key: "quotes-awaiting-approval",
      label: "Quotes Awaiting Approval",
      count: snapshot.awaitingCustomerApproval,
      to: "/admin/quotes?queue=awaiting-approval",
    },
    {
      key: "deposits-awaiting-payment",
      label: "Deposits Awaiting Payment",
      count: snapshot.awaitingDeposit,
      to: "/admin/quotes?queue=awaiting-deposit",
    },
    {
      key: "artwork-uploads",
      label: "Artwork Uploads",
      count: artworkUploads,
      to: "/admin/quotes?queue=awaiting-artwork",
    },
  ];

  const readyItems = [
    {
      key: "ready-for-production",
      label: "Ready for Production",
      count: snapshot.readyForProduction,
      detail: "Approved work can move into production now.",
      to: "/admin/quotes?queue=ready",
    },
    {
      key: "ready-for-pickup",
      label: "Ready for Pickup",
      count: snapshot.readyForPickup,
      detail: "Finished jobs are ready for handoff.",
      to: "/admin/orders?status=ready-for-pickup",
    },
  ];

  const snapshotItems = [
    { label: "Active Orders", value: activeOrders },
    { label: "Production", value: metrics.activeProduction },
    { label: "Outstanding Balance", value: money(outstandingBalance) },
    { label: "Revenue This Month", value: money(revenueThisMonth) },
  ];

  return {
    attentionItems,
    waitingItems,
    readyItems,
    snapshotItems,
    recentEvents: operationalEvents.slice(0, 7),
  };
}

function WorkspaceSection({ eyebrow, title, description, children, action }) {
  return (
    <section style={{ display: "grid", gap: "14px" }}>
      <div style={sectionHeaderStyle}>
        <div>
          {eyebrow ? <p style={eyebrowStyle}>{eyebrow}</p> : null}
          <h2 style={sectionTitleStyle}>{title}</h2>
          {description ? <p style={sectionDescriptionStyle}>{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function AttentionCard({ item, priority = "secondary" }) {
  const hasWork = item.count > 0;

  return (
    <Link
      className={`owner-attention-card owner-attention-card--${priority} ${
        hasWork ? "owner-attention-card--active" : "owner-attention-card--empty"
      }`}
      to={item.to}
      style={{ color: "#201a17", textDecoration: "none" }}
    >
      <div className="owner-attention-card__body">
        <div style={{ minWidth: 0 }}>
          {priority === "primary" && hasWork ? (
            <p className="owner-attention-card__kicker">Start here</p>
          ) : null}
          <h3 className="owner-attention-card__title">{item.label}</h3>
          <p className="owner-attention-card__detail">
            {item.detail}
          </p>
        </div>
        <strong className="owner-attention-card__count">
          {item.count}
        </strong>
      </div>
      <span className="owner-attention-card__action">
        {item.action}
      </span>
    </Link>
  );
}

function WaitingItem({ item }) {
  return (
    <Link
      to={item.to}
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "16px",
        alignItems: "center",
        padding: "16px 0",
        color: "#27211d",
        textDecoration: "none",
        borderTop: "1px solid #e8e0d6",
      }}
    >
      <span style={{ fontWeight: 850, fontSize: "17px" }}>{item.label}</span>
      <strong style={{ fontSize: "28px", color: "#8a4b12" }}>{item.count}</strong>
    </Link>
  );
}

function ReadyWorkCard({ item }) {
  return (
    <Link
      to={item.to}
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "18px",
        alignItems: "center",
        padding: "20px",
        borderRadius: "8px",
        background: "#eef7f0",
        color: "#173321",
        textDecoration: "none",
        border: "1px solid #d5ead9",
      }}
    >
      <strong style={{ fontSize: "48px", lineHeight: 1 }}>{item.count}</strong>
      <span>
        <strong style={{ display: "block", fontSize: "19px" }}>{item.label}</strong>
        <span style={{ display: "block", marginTop: "5px", color: "#52685a", lineHeight: 1.4, fontSize: "14px" }}>
          {item.detail}
        </span>
      </span>
    </Link>
  );
}

function ActivityRow({ event }) {
  const destination = event.reference_path || "/admin";

  return (
    <Link
      className="owner-activity-row"
      to={destination}
      style={{ color: "#29231f", textDecoration: "none" }}
    >
      <time className="owner-activity-row__time">
        {formatDateTime(event.created_at)}
      </time>
      <span className="owner-activity-row__content">
        <span className="owner-activity-row__dot" aria-hidden="true" />
        <strong className="owner-activity-row__summary">{event.summary}</strong>
        <span className="owner-activity-row__meta">
          {event.reference_label}
          {event.workflow_label ? ` / ${event.workflow_label}` : ""}
          {event.staff_name ? ` / ${event.staff_name}` : ""}
        </span>
      </span>
    </Link>
  );
}

function EmptyNote({ children }) {
  return (
    <p
      style={{
        margin: 0,
        padding: "18px 0",
        color: "#7a7067",
        fontWeight: 750,
        borderTop: "1px solid #e8e0d6",
      }}
    >
      {children}
    </p>
  );
}

function OwnerDashboard({ orders, operationalEvents }) {
  const workspace = buildOwnerWorkspaceModel(orders, operationalEvents);
  const attentionTotal = workspace.attentionItems.reduce((sum, item) => sum + item.count, 0);
  const primaryAttentionKey =
    workspace.attentionItems.find((item) => item.count > 0)?.key || workspace.attentionItems[0]?.key;
  const orderedAttentionItems = [
    ...workspace.attentionItems.filter((item) => item.key === primaryAttentionKey),
    ...workspace.attentionItems.filter((item) => item.key !== primaryAttentionKey),
  ];

  return (
    <main className="owner-workspace-page" style={pageShellStyle}>
      <div style={workspaceStyle}>
        <header style={{ display: "grid", gap: "10px" }}>
          <p style={eyebrowStyle}>Tee & Co Morning Workspace</p>
          <h1 style={{ margin: 0, color: "#1f1d1b", fontSize: "40px", lineHeight: 1.02 }}>
            What should Teresa work on right now?
          </h1>
          <p style={{ margin: 0, color: "#6f665f", maxWidth: "720px", lineHeight: 1.5, fontSize: "15px" }}>
            Start with work that needs an owner decision, then check customer-blocked jobs and staff-ready queues.
          </p>
        </header>

        <WorkspaceSection
          eyebrow="Your Attention"
          title="Actionable work"
          description="These are the places where Teresa can move an order forward this morning."
          action={
            <strong style={{ color: attentionTotal ? "#7c3f10" : "#817568", fontSize: "14px" }}>
              {attentionTotal} open
            </strong>
          }
        >
          <div
            className="owner-attention-grid"
            style={{
              display: "grid",
              gap: "16px",
            }}
          >
            {orderedAttentionItems.map((item) => {
              const priority =
                item.key === primaryAttentionKey
                  ? "primary"
                  : item.count > 0
                    ? "secondary"
                    : "quiet";

              return <AttentionCard key={item.key} item={item} priority={priority} />;
            })}
          </div>
        </WorkspaceSection>

        <WorkspaceSection
          eyebrow="Waiting on Customers"
          title="Blocked until the customer responds"
          description="No owner action is expected here unless Teresa wants to follow up."
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              padding: "4px 0 0",
            }}
          >
            {workspace.waitingItems.map((item) => (
              <WaitingItem key={item.key} item={item} />
            ))}
          </div>
        </WorkspaceSection>

        <WorkspaceSection
          eyebrow="Ready to Work"
          title="Staff queues"
          description="These jobs are no longer waiting on customer decisions and can be picked up by the team."
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
              gap: "12px",
            }}
          >
            {workspace.readyItems.map((item) => (
              <ReadyWorkCard key={item.key} item={item} />
            ))}
          </div>
        </WorkspaceSection>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
            gap: "28px",
            alignItems: "start",
          }}
        >
          <WorkspaceSection
            eyebrow="Recent Activity"
            title="What changed"
            description="A short chronological feed for context after the morning queues are clear."
          >
            {workspace.recentEvents.length ? (
              <div className="owner-activity-timeline">
                {workspace.recentEvents.map((event) => (
                  <ActivityRow key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <EmptyNote>Recent operational updates will appear here.</EmptyNote>
            )}
          </WorkspaceSection>

          <WorkspaceSection
            eyebrow="Business Snapshot"
            title="Business overview"
            description="Reference only. These should not compete with today's work."
          >
            <div style={{ display: "grid", gap: "10px", paddingTop: "4px" }}>
              {workspace.snapshotItems.map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "16px",
                    alignItems: "baseline",
                    padding: "10px 0",
                    borderTop: "1px solid #ebe5dd",
                  }}
                >
                  <span style={{ color: "#6f665f", fontSize: "13px", fontWeight: 800 }}>{item.label}</span>
                  <strong style={{ color: "#29231f", fontSize: "18px" }}>{item.value}</strong>
                </div>
              ))}
            </div>
          </WorkspaceSection>
        </div>
      </div>
    </main>
  );
}

export default function Dashboard() {
  const orders = useStoredOrders();
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
