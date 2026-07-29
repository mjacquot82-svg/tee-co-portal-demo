import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import WorkflowBadge from "../components/WorkflowBadge";
import { formatShortDate } from "../lib/dateFormatting";
import {
  updateStoredOrder,
  useStoredOrders,
  useStoredOrdersHydrationState,
} from "../lib/ordersStore";
import { buildWorkflowActionUpdates } from "../orders/buildWorkflowActionUpdates";
import { isOnHoldOperationalStatus, sortOrdersByOperationalStatus } from "../orders/orderWorkflow";
import {
  buildProductionReadinessSummary,
  buildWorkflowBlockDetails,
  buildWorkflowStatusBadges,
  formatWorkflowTimelineEvent,
} from "../orders/workflowPresentation";
import { useCustomerTimeline } from "../lib/customerTimelineStore";
import { getOperationalStaffUsers } from "../lib/staffUsersStore";
import { getArtworkAssetUrl, isArtworkImage } from "../lib/orderArtwork";
import {
  buildResultsLabel,
  getProductionStatusCounts,
  matchesDateFilter,
  matchesProductionMethod,
  matchesProductionStatus,
  matchesSearch,
  normalizeProductionOrder,
} from "../production/productionWorkspace";
import { sortQueueByPriority } from "../queue/buildQueuePriority";
import { matchesProductionEmployee } from "../production/productionEmployeeFilter";
import { getActiveStaffUser } from "../lib/staffUsersStore";
import {
  canSelfAssignOrder,
  getOperationalOrdersForStaff,
  isOwnerView,
  isStaffWorkspaceView,
} from "./adminRoleView";
import {
  createStaffNotification,
  STAFF_NOTIFICATION_TYPES,
} from "../lib/staffNotificationsStore";
import {
  buildProductionEmptyState,
  buildWorkflowActionConfirmation,
} from "./workflowCopy";
import { buildOwnerBlockedQueuePresentation } from "../production/ownerBlockedQueuePresentation";
import AdminDiagnosticsPanel from "../components/AdminDiagnosticsPanel";
import { isReleasedToFrontCounter } from "../front-counter/frontCounterWorkflow";

const ESCALATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DAILY_STATUS_FILTERS = [
  { key: "active", label: "All Active" },
  { key: "ready-for-production", label: "Ready to Start" },
  { key: "in-production", label: "In Progress" },
  { key: "qc-finishing", label: "QC / Finishing" },
  { key: "ready-for-pickup", label: "Ready for Pickup" },
];
const ATTENTION_FILTERS = [
  { key: "blocked", label: "Blocked", tone: "danger" },
  { key: "on-hold", label: "On Hold", tone: "danger" },
  { key: "urgent", label: "Due Soon / Overdue", tone: "warning" },
];

function FilterPill({ active, children, count, tone = "default", onClick, testId }) {
  const activeBackground =
    tone === "warning"
      ? "#9a3412"
      : tone === "success"
      ? "#166534"
      : tone === "danger"
      ? "#b91c1c"
      : "#111827";
  const inactiveBackground =
    tone === "warning" ? "#fff7ed" : tone === "danger" ? "#fef2f2" : "#ffffff";

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      style={{
        border: active ? `1px solid ${activeBackground}` : "1px solid #d6dbe4",
        background: active ? activeBackground : inactiveBackground,
        color: active ? "#ffffff" : "#111827",
        borderRadius: "999px",
        padding: "8px 11px",
        fontWeight: 700,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        whiteSpace: "nowrap",
      }}
    >
      <span>{children}</span>
      <span
        style={{
          minWidth: "20px",
          height: "20px",
          padding: "0 6px",
          borderRadius: "999px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "12px",
          background: active ? "rgba(255,255,255,0.16)" : "#f1f5f9",
          color: active ? "#ffffff" : "#475569",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function SummaryCard({ label, value, tone = "default" }) {
  const palette =
    tone === "warning"
      ? { background: "#fff7ed", border: "#fed7aa", value: "#9a3412", label: "#9a3412" }
      : tone === "danger"
      ? { background: "#fef2f2", border: "#fecaca", value: "#b91c1c", label: "#b91c1c" }
      : tone === "success"
      ? { background: "#ecfdf5", border: "#bbf7d0", value: "#166534", label: "#166534" }
      : { background: "#f8fafc", border: "#e2e8f0", value: "#0f172a", label: "#475569" };

  return (
    <article
      style={{
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: "16px",
        padding: "14px 16px",
        display: "grid",
        gap: "4px",
      }}
    >
      <span
        style={{
          color: palette.label,
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <strong style={{ color: palette.value, fontSize: "28px" }}>{value}</strong>
    </article>
  );
}

function QueueFlag({ label, tone = "default" }) {
  const palette =
    tone === "danger"
      ? { background: "#fef2f2", color: "#b91c1c", border: "#fecaca" }
      : tone === "warning"
      ? { background: "#fff7ed", color: "#9a3412", border: "#fed7aa" }
      : tone === "success"
      ? { background: "#ecfdf5", color: "#166534", border: "#bbf7d0" }
      : tone === "info"
      ? { background: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" }
      : { background: "#f8fafc", color: "#334155", border: "#e2e8f0" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        padding: "4px 8px",
        fontSize: "11px",
        fontWeight: 800,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

function QueueActionButton({ action, onClick, emphasis = "secondary" }) {
  const isHoldAction = action.targetStatus === "On Hold";
  const isPrimary = emphasis === "primary";
  const isBlocked = action.blocked === true;

  return (
    <button
      type="button"
      data-testid="production-workflow-action"
      data-action-key={action.key}
      data-target-status={action.targetStatus || ""}
      data-blocked={isBlocked ? "true" : "false"}
      onClick={onClick}
      style={{
        border: isBlocked
          ? "1px solid #fdba74"
          : isHoldAction
          ? "1px solid #fecdd3"
          : isPrimary
          ? "1px solid #171717"
          : "1px solid #cbd5e1",
        background: isBlocked ? "#fff7ed" : isHoldAction ? "#fff1f2" : isPrimary ? "#171717" : "#ffffff",
        color: isBlocked ? "#9a3412" : isHoldAction ? "#be123c" : isPrimary ? "#ffffff" : "#0f172a",
        borderRadius: "10px",
        padding: "8px 10px",
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
      title={isBlocked ? action.blockedReasons?.join(" ") : ""}
    >
      {action.label}
      {isBlocked ? " Blocked" : ""}
    </button>
  );
}

function QueueWorkflowIndicator({ order }) {
  const workflowState = String(order.workflow_state || order.status || "").trim().toLowerCase();
  const productionLabel =
    workflowState === "embroidery" || String(order.decoration_type || "").trim().toLowerCase() === "embroidery"
      ? "Embroidery"
      : "Printing";
  const stages = [
    { key: "ready", label: "Ready" },
    { key: "production", label: productionLabel },
    { key: "qc", label: "QC" },
    { key: "pickup", label: "Pickup" },
  ];
  const currentStageIndex =
    workflowState === "completed"
      ? stages.length
      : workflowState === "ready for pickup"
      ? 3
      : workflowState === "qc / finishing"
      ? 2
      : ["printing", "embroidery"].includes(workflowState)
      ? 1
      : 0;

  return (
    <div
      aria-label={`Workflow: ${stages.map((stage) => stage.label).join(", ")}`}
      data-testid="production-queue-workflow-indicator"
      style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}
    >
      {stages.map((stage, index) => {
        const complete = index < currentStageIndex;
        const active = index === currentStageIndex;
        return (
          <div key={stage.key} style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <span
              data-stage-state={active ? "active" : complete ? "complete" : "pending"}
              style={{
                border: active ? "2px solid #0f172a" : complete ? "1px solid #cbd5e1" : "1px solid #e2e8f0",
                background: active ? "#ffffff" : complete ? "#f1f5f9" : "#f8fafc",
                color: active ? "#0f172a" : complete ? "#334155" : "#94a3b8",
                borderRadius: "10px",
                padding: active ? "6px 11px" : "7px 11px",
                fontSize: "13px",
                fontWeight: active ? 900 : complete ? 800 : 700,
                boxShadow: active ? "0 0 0 2px rgba(15, 23, 42, 0.08)" : "none",
              }}
            >
              {complete ? "✓ " : ""}{stage.label}
            </span>
            {index < stages.length - 1 ? (
              <span aria-hidden="true" style={{ color: "#cbd5e1", fontSize: "14px", fontWeight: 800 }}>→</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function buildQueueDuePresentation(order, priority) {
  if (!order.due_date || priority.daysUntilDue === null) {
    return {
      label: "No due date",
      detail: "",
      tone: "quiet",
    };
  }

  if (priority.daysUntilDue < 0) {
    const overdueDays = Math.abs(priority.daysUntilDue);
    return {
      label: overdueDays === 1 ? "Overdue by 1 day" : `Overdue by ${overdueDays} days`,
      detail: formatShortDate(order.due_date),
      tone: "danger",
    };
  }

  if (priority.daysUntilDue === 0) {
    return { label: "Due Today", detail: formatShortDate(order.due_date), tone: "warning" };
  }

  if (priority.daysUntilDue === 1) {
    return { label: "Due Tomorrow", detail: formatShortDate(order.due_date), tone: "warning" };
  }

  return {
    label: `Due in ${priority.daysUntilDue} days`,
    detail: formatShortDate(order.due_date),
    tone: priority.dueSoon ? "warning" : "default",
  };
}

function QueueRow({ order, onRunAction, onOpenDetail, onOwnerBlockedAction, onEscalate, onClaim, currentStaffUser = null, actionFeedback = null }) {
  const primaryAction = (order.available_actions || []).find((action) => action.blocked !== true);
  const priority = order.queue_priority || {};
  const due = buildQueueDuePresentation(order, priority);
  const readiness = order.production_readiness || buildProductionReadinessSummary(order);
  const isOnHold = isOnHoldOperationalStatus(order.status);
  const isBlocked = readiness.blocked === true;
  const isOwner = isOwnerView(currentStaffUser);
  const ownerBlockedPresentation = isOwner && isBlocked
    ? buildOwnerBlockedQueuePresentation(readiness)
    : null;
  const isAssignedToMe =
    currentStaffUser?.id && order.assigned_to_staff_id === currentStaffUser.id;
  const isUnassigned =
    !order.assigned_to_staff_id &&
    (!order.assigned_to_staff_name ||
      String(order.assigned_to_staff_name).trim().toLowerCase() === "unassigned");
  const canClaim = currentStaffUser && canSelfAssignOrder(order, currentStaffUser);
  const cardAction = canClaim
    ? {
        key: "claim_job",
        label: "Claim Job",
      }
    : primaryAction;

  const rowStyle = isOnHold
    ? { background: "#fff7ed", border: "1px solid #fed7aa" }
    : isBlocked
    ? { background: "#fffbeb", border: "1px solid #fde68a" }
    : isUnassigned
    ? { background: "#fffbeb", border: "1px solid #fde68a" }
    : priority.overdue
    ? { background: "#fef2f2", border: "1px solid #fecaca" }
    : priority.dueSoon
    ? { background: "#fffbeb", border: "1px solid #fde68a" }
    : { background: "#ffffff", border: "1px solid #e2e8f0" };

  return (
    <article
      data-testid="production-queue-row"
      data-order-number={order.order_number || ""}
      data-workflow-state={order.workflow_state || order.status || ""}
      data-production-readiness={readiness.statusKey || ""}
      data-assigned-to-me={isAssignedToMe ? "true" : "false"}
      data-unassigned={isUnassigned ? "true" : "false"}
      style={{
        display: "grid",
        gap: "14px",
        ...rowStyle,
        borderRadius: "16px",
        padding: "16px 18px",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div style={{ display: "grid", gap: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, display: "grid", gap: "6px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" }}>
              <button
                type="button"
                data-testid="production-queue-open-detail"
                onClick={() => onOpenDetail(order)}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  color: "#0f172a",
                  fontSize: "18px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                {order.order_number}
              </button>
              <strong style={{ color: "#334155", fontSize: "16px" }}>{order.customer_name}</strong>
            </div>
            <span
              data-testid="production-queue-row-assignment"
              style={{ display: "inline-flex", alignItems: "baseline", gap: "6px", color: "#64748b", fontSize: "13px", fontWeight: 700 }}
            >
              Assigned To
              <strong style={{ color: isUnassigned ? "#9a3412" : "#334155", fontSize: "14px", fontWeight: 900 }}>
                {order.assigned_to_staff_name}
              </strong>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {order.rush_active && !priority.overdue && !priority.dueSoon ? <QueueFlag label="Rush" tone="warning" /> : null}
            {isBlocked ? <QueueFlag label="Blocked" tone="danger" /> : null}
            {isOnHold ? <QueueFlag label="On Hold" tone="warning" /> : null}
            {isUnassigned ? <QueueFlag label="Unassigned" tone="warning" /> : null}
            <span
              data-testid="production-queue-row-status"
              data-workflow-state={order.workflow_state || order.status || ""}
              style={{ display: "none" }}
              aria-hidden="true"
            >
              {order.workflow_state || order.status}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: "7px", padding: "2px 0" }}>
        <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>
          Workflow
        </span>
        <QueueWorkflowIndicator order={order} />
        <span data-testid="production-queue-row-owner" style={{ display: "none" }}>
          Owner: {order.production_owner_staff_name || "Unassigned"}
        </span>
        <span data-testid="production-queue-row-next-action" style={{ display: "none" }}>
          {readiness.nextRecommendedAction}
        </span>
      </div>

      {readiness.blocked ? (
          <div
            data-testid="production-queue-row-blockers"
            style={{
              display: "grid",
              gap: "4px",
              borderRadius: "12px",
              border: "1px solid #fecaca",
              background: "#fff5f5",
              color: "#991b1b",
              padding: "10px 12px",
              fontSize: "13px",
              lineHeight: 1.4,
            }}
          >
            <strong>Blocked: {readiness.detail}</strong>
            <span>Responsible: {ownerBlockedPresentation?.responsibleLabel || readiness.responsibleParty}</span>
            <span>
              Next action: {ownerBlockedPresentation?.actionLabel || readiness.nextRecommendedAction}
            </span>
            {ownerBlockedPresentation ? (
              <button
                type="button"
                data-testid="owner-blocked-action-button"
                data-blocker-key={readiness.blockers?.[0]?.key || "workflow"}
                onClick={() => onOwnerBlockedAction?.(order, ownerBlockedPresentation)}
                style={{
                  marginTop: "4px",
                  border: "1px solid #991b1b",
                  background: "#ffffff",
                  color: "#991b1b",
                  borderRadius: "8px",
                  padding: "7px 10px",
                  fontWeight: 800,
                  cursor: "pointer",
                  fontSize: "12px",
                  alignSelf: "start",
                  justifySelf: "start",
                }}
              >
                {ownerBlockedPresentation.actionLabel}
              </button>
            ) : onEscalate ? (
              <button
                type="button"
                data-testid="escalate-to-owner-button"
                data-order-number={order.order_number || ""}
                disabled={Boolean(order.last_escalated_at)}
                title={
                  order.last_escalated_at
                    ? `Already escalated to owner — duplicate escalations are blocked for 24 hours (escalated by ${order.escalated_by_staff_name || "staff"})`
                    : "Notify the owner that this order is blocked and needs attention"
                }
                onClick={() => onEscalate(order)}
                style={{
                  marginTop: "4px",
                  border: order.last_escalated_at ? "1px solid #cbd5e1" : "1px solid #991b1b",
                  background: order.last_escalated_at ? "#f8fafc" : "#ffffff",
                  color: order.last_escalated_at ? "#94a3b8" : "#991b1b",
                  borderRadius: "8px",
                  padding: "7px 10px",
                  fontWeight: 700,
                  cursor: order.last_escalated_at ? "not-allowed" : "pointer",
                  fontSize: "12px",
                  alignSelf: "start",
                  justifySelf: "start",
                }}
              >
                {order.last_escalated_at ? "Escalated to Owner" : "Escalate to Owner"}
              </button>
            ) : null}
          </div>
      ) : isOnHold && order.production_hold_reason ? (
        <div
          data-testid="production-queue-row-hold-reason"
          style={{
            borderRadius: "12px",
            border: "1px solid #fed7aa",
            background: "#fff7ed",
            color: "#9a3412",
            padding: "10px 12px",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          On Hold: {order.production_hold_reason}
          {order.production_hold_staff_name ? ` — ${order.production_hold_staff_name}` : ""}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: "12px" }}>
        <div style={{ display: "grid", gap: "6px", justifyItems: "start" }}>
          <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>
            Next Action
          </span>
          {cardAction ? (
            cardAction.key === "claim_job" ? (
              <button
                type="button"
                data-testid="claim-job-button"
                onClick={() => onClaim && onClaim(order)}
                style={{
                  border: "1px solid #171717",
                  background: "#171717",
                  color: "#ffffff",
                  borderRadius: "12px",
                  padding: "11px 16px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Claim Job
              </button>
            ) : (
              <QueueActionButton
                action={cardAction}
                emphasis="primary"
                onClick={() => onRunAction(order, cardAction)}
              />
            )
          ) : (
            <span style={{ color: "#64748b", fontWeight: 700 }}>
              No production action available
            </span>
          )}
        </div>
        <div
          style={{
            borderTop: "1px solid #e2e8f0",
            paddingTop: "10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 600 }}>
              {[order.garment, order.decoration_type].filter(Boolean).join(" · ")}
            </span>
            <span aria-hidden="true" style={{ color: "#cbd5e1" }}>·</span>
            <span
              style={{
                color: due.tone === "danger" ? "#b91c1c" : due.tone === "warning" ? "#9a3412" : due.tone === "quiet" ? "#94a3b8" : "#64748b",
                fontSize: "12px",
                fontWeight: due.tone === "danger" || due.tone === "warning" ? 800 : 700,
              }}
            >
              {due.label}{due.detail ? ` · ${due.detail}` : ""}
            </span>
          </div>
          <button
            type="button"
            data-testid="production-queue-row-details"
            onClick={() => onOpenDetail(order)}
            style={{
              border: "none",
              background: "transparent",
              color: "#64748b",
              padding: "4px 0",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Details →
          </button>
        </div>

        {actionFeedback ? (
          <div
            style={{
              maxWidth: "320px",
              borderRadius: "12px",
              border:
                actionFeedback.tone === "danger"
                  ? "1px solid #fecaca"
                  : "1px solid #bfdbfe",
              background:
                actionFeedback.tone === "danger" ? "#fff5f5" : "#eff6ff",
              color: actionFeedback.tone === "danger" ? "#991b1b" : "#1d4ed8",
              padding: "10px 12px",
              display: "grid",
              gap: "3px",
              justifySelf: "start",
            }}
          >
            <strong style={{ fontSize: "13px" }}>{actionFeedback.summary}</strong>
            {actionFeedback.detail ? <span style={{ fontSize: "12px" }}>{actionFeedback.detail}</span> : null}
            {actionFeedback.nextActionLabel ? (
              <span style={{ fontSize: "12px", fontWeight: 700 }}>
                Next action: {actionFeedback.nextActionLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ProductionDetailDrawer({
  order,
  onClose,
  onAssign,
  onClaim,
  onRunAction,
  staffUsers,
  currentStaffUser = null,
  actionFeedback = null,
}) {
  const [pendingHoldAction, setPendingHoldAction] = useState(null);
  const [holdReasonInput, setHoldReasonInput] = useState("");

  const customerTimeline = useCustomerTimeline(order?.customer_id);

  const orderTimeline = useMemo(() => {
    if (!order) return [];

    return customerTimeline.filter((event) => event.metadata?.orderNumber === order.order_number);
  }, [customerTimeline, order]);

  if (!order) return null;

  const artworkFiles = Array.isArray(order.artwork_files) ? order.artwork_files : [];
  const workflowBadges = buildWorkflowStatusBadges(order);
  const readiness = order.production_readiness || buildProductionReadinessSummary(order);
  const executableActions = (order.available_actions || []).filter((action) => action.blocked !== true);
  const isOnHold = isOnHoldOperationalStatus(order.status);
  const canClaim = currentStaffUser && canSelfAssignOrder(order, currentStaffUser);

  function handleActionClick(action) {
    if (action.key === "put_on_hold") {
      setPendingHoldAction(action);
      setHoldReasonInput("");
      return;
    }
    onRunAction(order, action);
  }

  function handleConfirmHold() {
    if (!holdReasonInput.trim()) return;
    onRunAction(order, { ...pendingHoldAction, holdReason: holdReasonInput.trim() });
    setPendingHoldAction(null);
    setHoldReasonInput("");
  }

  function handleCancelHold() {
    setPendingHoldAction(null);
    setHoldReasonInput("");
  }

  return (
    <aside
      data-testid="production-queue-detail-drawer"
      data-order-number={order.order_number || ""}
      data-workflow-state={order.workflow_state || order.status || ""}
      style={{
        position: "sticky",
        top: "24px",
        alignSelf: "start",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "20px",
        padding: "18px",
        display: "grid",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: "4px" }}>
          <strong style={{ fontSize: "18px" }}>{order.order_number}</strong>
          <span style={{ color: "#64748b" }}>{order.workflow_state}</span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <QueueFlag label={readiness.label} tone={readiness.tone === "danger" ? "danger" : readiness.tone === "success" ? "success" : "info"} />
            {workflowBadges.map((badge) => (
              <WorkflowBadge
                key={`${order.order_number}-drawer-${badge.label}`}
                label={badge.label}
                tone={badge.tone}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          data-testid="production-queue-detail-close"
          onClick={onClose}
          style={{
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            borderRadius: "10px",
            padding: "6px 10px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        <div style={{ display: "grid", gap: "4px" }}>
          <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>
            Production Readiness
          </span>
          <div
            data-testid="production-queue-detail-readiness"
            data-production-readiness={readiness.statusKey || ""}
            style={{
              border: readiness.blocked ? "1px solid #fecaca" : "1px solid #bbf7d0",
              background: readiness.blocked ? "#fff5f5" : "#ecfdf5",
              color: readiness.blocked ? "#991b1b" : "#166534",
              borderRadius: "14px",
              padding: "12px",
              display: "grid",
              gap: "6px",
              lineHeight: 1.45,
            }}
          >
            <strong>{readiness.label}</strong>
            <span>{readiness.detail}</span>
            <span style={{ fontWeight: 700 }}>
              Next recommended action: {readiness.nextRecommendedAction}
            </span>
            <span style={{ fontWeight: 700 }}>
              Responsible: {readiness.responsibleParty}
            </span>
          </div>
        </div>

        {readiness.blockers?.length ? (
          <div style={{ display: "grid", gap: "8px" }}>
            <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>
              Blocking Reasons
            </span>
            {readiness.blockers.map((blocker) => (
              <div
                key={blocker.key}
                data-testid="production-queue-detail-blocker"
                style={{
                  border: "1px solid #fecaca",
                  background: "#fff5f5",
                  color: "#991b1b",
                  borderRadius: "12px",
                  padding: "10px 12px",
                  display: "grid",
                  gap: "4px",
                }}
              >
                <strong>{blocker.reason}</strong>
                <span>Required action: {blocker.requiredAction}</span>
                <span>Responsible: {blocker.responsibleParty}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: "4px" }}>
          <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>
            Customer Reference
          </span>
          <strong>{order.customer_name}</strong>
          <span style={{ color: "#64748b", fontSize: "13px" }}>
            {order.customer_id ? `Customer ID ${order.customer_id}` : "No linked customer record"}
          </span>
        </div>

        <div style={{ display: "grid", gap: "4px" }}>
          <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>
            Assignment
          </span>
          {canClaim ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <div
                style={{
                  borderRadius: "10px",
                  border: "1px solid #fde68a",
                  background: "#fffbeb",
                  color: "#92400e",
                  padding: "8px 10px",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                Unassigned — you can claim this job.
              </div>
              <button
                type="button"
                data-testid="claim-job-button"
                onClick={() => onClaim && onClaim(order)}
                style={{
                  border: "1px solid #171717",
                  background: "#171717",
                  color: "#ffffff",
                  borderRadius: "10px",
                  padding: "8px 10px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Claim This Job
              </button>
            </div>
          ) : (
            <select
              data-testid="production-queue-detail-assignment-select"
              value={order.assigned_to_staff_id || ""}
              onChange={(event) => onAssign(order, event.target.value)}
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                padding: "10px 12px",
                background: "#ffffff",
              }}
            >
              <option value="">Unassigned</option>
              {staffUsers.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}
                  {staff.role ? ` (${staff.role})` : ""}
                </option>
              ))}
            </select>
          )}
          <span style={{ color: "#64748b", fontSize: "13px" }}>
            <span data-testid="production-queue-detail-owner">
            Owner: {order.production_owner_staff_name || "Unassigned"}
            </span>
          </span>
        </div>

        {isOnHold && order.production_hold_reason ? (
          <div
            data-testid="drawer-hold-reason"
            style={{
              borderRadius: "12px",
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#991b1b",
              padding: "10px 12px",
              display: "grid",
              gap: "4px",
            }}
          >
            <strong style={{ fontSize: "13px" }}>Hold Reason</strong>
            <span style={{ fontWeight: 700 }}>{order.production_hold_reason}</span>
            {order.production_hold_staff_name ? (
              <span style={{ fontSize: "12px" }}>Held by: {order.production_hold_staff_name}</span>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {executableActions.map((action, index) => (
            <QueueActionButton
              key={action.key}
              action={action}
              emphasis={index === 0 ? "primary" : "secondary"}
              onClick={() => handleActionClick(action)}
            />
          ))}
          {!executableActions.length ? (
            <span style={{ color: "#64748b", fontWeight: 700 }}>
              No production action is currently available.
            </span>
          ) : null}
        </div>

        {pendingHoldAction ? (
          <div
            data-testid="hold-reason-dialog"
            style={{
              padding: "14px",
              borderRadius: "12px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              display: "grid",
              gap: "10px",
            }}
          >
            <strong style={{ color: "#991b1b", fontSize: "13px" }}>Hold Reason Required</strong>
            <input
              type="text"
              data-testid="hold-reason-input"
              value={holdReasonInput}
              onChange={(e) => setHoldReasonInput(e.target.value)}
              placeholder="e.g. Waiting for customer approval..."
              style={{
                border: "1px solid #fecaca",
                borderRadius: "8px",
                padding: "8px 10px",
                fontSize: "13px",
              }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                data-testid="hold-reason-confirm"
                disabled={!holdReasonInput.trim()}
                onClick={handleConfirmHold}
                style={{
                  border: "1px solid #be123c",
                  background: holdReasonInput.trim() ? "#be123c" : "#f8fafc",
                  color: holdReasonInput.trim() ? "#ffffff" : "#94a3b8",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  fontWeight: 700,
                  cursor: holdReasonInput.trim() ? "pointer" : "not-allowed",
                  fontSize: "13px",
                }}
              >
                Confirm Hold
              </button>
              <button
                type="button"
                data-testid="hold-reason-cancel"
                onClick={handleCancelHold}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {actionFeedback ? (
          <div
            style={{
              borderRadius: "12px",
              border:
                actionFeedback.tone === "danger"
                  ? "1px solid #fecaca"
                  : "1px solid #bfdbfe",
              background:
                actionFeedback.tone === "danger" ? "#fff5f5" : "#eff6ff",
              color: actionFeedback.tone === "danger" ? "#991b1b" : "#1d4ed8",
              padding: "10px 12px",
              display: "grid",
              gap: "3px",
            }}
          >
            <strong style={{ fontSize: "13px" }}>{actionFeedback.summary}</strong>
            {actionFeedback.detail ? <span style={{ fontSize: "12px" }}>{actionFeedback.detail}</span> : null}
            {actionFeedback.nextActionLabel ? (
              <span style={{ fontSize: "12px", fontWeight: 700 }}>
                Next action: {actionFeedback.nextActionLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: "8px" }}>
        <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>
          Linked Artwork
        </span>
        {artworkFiles.length ? (
          artworkFiles.slice(0, 3).map((file) => {
            const assetUrl = getArtworkAssetUrl(file);
            return (
              <div
                key={file.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "56px minmax(0, 1fr)",
                  gap: "10px",
                  alignItems: "center",
                  border: "1px solid #e2e8f0",
                  borderRadius: "14px",
                  padding: "8px",
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    color: "#64748b",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  {assetUrl && isArtworkImage(file) ? (
                    <img
                      src={assetUrl}
                      alt={file.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    "File"
                  )}
                </div>
                <div style={{ minWidth: 0, display: "grid", gap: "2px" }}>
                  <strong style={{ fontSize: "13px" }}>{file.name}</strong>
                  <span style={{ color: "#64748b", fontSize: "12px" }}>
                    {file.type || "Artwork reference"}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ color: "#64748b", fontSize: "13px" }}>No linked artwork files on this order.</div>
        )}
      </div>

      <div style={{ display: "grid", gap: "8px" }}>
        <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>
          Production Notes
        </span>
        <div
          style={{
            border: "1px dashed #cbd5e1",
            borderRadius: "14px",
            padding: "12px",
            background: "#f8fafc",
            color: "#64748b",
            fontSize: "13px",
          }}
        >
          Placeholder for production notes. Keep this operational and job-specific when note capture is expanded.
        </div>
      </div>

      <div style={{ display: "grid", gap: "8px" }}>
        <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>
          Workflow History
        </span>
        <div style={{ display: "grid", gap: "8px", maxHeight: "180px", overflow: "auto" }}>
          {(order.activity_log || []).slice(0, 8).map((event) => {
            const formatted = formatWorkflowTimelineEvent(event);
            return (
              <article
                key={event.id}
                style={{
                  borderLeft: "3px solid #171717",
                  background: "#f8fafc",
                  borderRadius: "10px",
                  padding: "10px 12px",
                }}
              >
                <strong style={{ fontSize: "13px" }}>{formatted.title}</strong>
                <div style={{ marginTop: "3px", color: "#64748b", fontSize: "12px", fontWeight: 700 }}>
                  {event.staff_name || "Unknown Staff"} • {formatShortDate(event.created_at)}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gap: "8px" }}>
        <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>
          Timeline Events
        </span>
        <div style={{ display: "grid", gap: "8px", maxHeight: "180px", overflow: "auto" }}>
          {orderTimeline.length ? (
            orderTimeline.slice(0, 8).map((event) => (
              <article
                key={event.id}
                style={{
                  borderLeft: "3px solid #cbd5e1",
                  background: "#fcfcfd",
                  borderRadius: "10px",
                  padding: "10px 12px",
                }}
              >
                <strong style={{ fontSize: "13px" }}>{event.summary}</strong>
                <div style={{ marginTop: "3px", color: "#64748b", fontSize: "12px", fontWeight: 700 }}>
                  {event.eventType} • {formatShortDate(event.timestamp)}
                </div>
              </article>
            ))
          ) : (
            <div style={{ color: "#64748b", fontSize: "13px" }}>
              No customer timeline events linked to this order yet.
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <Link
          to={`/admin/orders/${order.order_number}`}
          data-testid="production-queue-detail-open-full-order"
          style={{
            textDecoration: "none",
            border: "1px solid #171717",
            background: "#171717",
            color: "#ffffff",
            borderRadius: "10px",
            padding: "10px 12px",
            fontWeight: 700,
          }}
        >
          Open Full Order
        </Link>
        {order.customer_id ? (
          <Link
            to={`/admin/customers/${order.customer_id}`}
            style={{
              textDecoration: "none",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#0f172a",
              borderRadius: "10px",
              padding: "10px 12px",
              fontWeight: 700,
            }}
          >
            Open Customer
          </Link>
        ) : null}
      </div>
    </aside>
  );
}

export default function Orders() {
  const navigate = useNavigate();
  const storedOrders = useStoredOrders();
  const ordersHydration = useStoredOrdersHydrationState();
  const staffUser = getActiveStaffUser();
  const [actionFeedbackByOrder, setActionFeedbackByOrder] = useState({});
  const [selectedOrderSnapshot, setSelectedOrderSnapshot] = useState(null);
  const isStaffWorkspace = isStaffWorkspaceView(staffUser);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedOrderNumber = searchParams.get("order") || "";
  const activeStatusFilter = searchParams.get("status") || "active";
  const activeMethodFilter = searchParams.get("workflow") || "all";
  const activeDateFilter = searchParams.get("date") || "all";
  const activeEmployeeFilter = searchParams.get("employee") || "all";
  const searchTerm = searchParams.get("q") || "";
  const customStart = searchParams.get("start") || "";
  const customEnd = searchParams.get("end") || "";

  const orders = useMemo(
    () => sortOrdersByOperationalStatus(storedOrders.map(normalizeProductionOrder)),
    [storedOrders]
  );
  const workspaceOrders = useMemo(
    () =>
      (isStaffWorkspace ? getOperationalOrdersForStaff(orders) : orders).filter(
        (order) => !isReleasedToFrontCounter(order)
      ),
    [isStaffWorkspace, orders]
  );
  const statusCounts = useMemo(() => getProductionStatusCounts(workspaceOrders), [workspaceOrders]);
  const hasAttentionItems = ATTENTION_FILTERS.some(
    (filter) => Number(statusCounts[filter.key] || 0) > 0
  );
  const staffUsers = useMemo(
    () => getOperationalStaffUsers().filter((staff) => staff.status !== "Inactive"),
    []
  );

  const filteredOrders = useMemo(
    () =>
      sortQueueByPriority(
        workspaceOrders.filter(
          (order) =>
            matchesProductionStatus(order, activeStatusFilter) &&
            matchesProductionMethod(order, activeMethodFilter) &&
            matchesProductionEmployee(order, activeEmployeeFilter, staffUsers) &&
            matchesDateFilter(order, activeDateFilter, customStart, customEnd) &&
            matchesSearch(order, searchTerm)
        )
      ),
    [
      workspaceOrders,
      activeStatusFilter,
      activeMethodFilter,
      activeEmployeeFilter,
      activeDateFilter,
      customStart,
      customEnd,
      searchTerm,
      staffUsers,
    ]
  );
  const selectedOrder = useMemo(
    () =>
      filteredOrders.find((order) => order.order_number === selectedOrderNumber) ||
      workspaceOrders.find((order) => order.order_number === selectedOrderNumber) ||
      (selectedOrderSnapshot?.order_number === selectedOrderNumber ? selectedOrderSnapshot : null) ||
      null,
    [filteredOrders, selectedOrderNumber, selectedOrderSnapshot, workspaceOrders]
  );

  if (ordersHydration.status !== "ready") {
    return (
      <AdminDiagnosticsPanel
        title="Loading production orders"
        message="The production workspace is synchronizing the current order collection before displaying queue results."
        staffUser={staffUser}
        pathname="/admin/orders"
        workspaceAccess="loading"
        error={ordersHydration.status === "error" ? ordersHydration.error?.message : null}
      />
    );
  }

  function updateFilters(nextValues) {
    const nextParams = new URLSearchParams(searchParams);

    Object.entries(nextValues).forEach(([key, value]) => {
      if (
        !value ||
        (key === "order" && !value) ||
        (key === "status" && value === "active") ||
        (key === "workflow" && value === "all") ||
        (key === "employee" && value === "all") ||
        (key === "date" && value === "all")
      ) {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });

    if (
      (nextValues.date && nextValues.date !== "custom") ||
      (activeDateFilter !== "custom" && !nextValues.date)
    ) {
      nextParams.delete("start");
      nextParams.delete("end");
    }

    setSearchParams(nextParams);
  }

  async function handleRunAction(order, action) {
    // Enrich resume_from_hold with who resumed
    const enrichedAction =
      action.key === "resume_from_hold"
        ? { ...action, resumeStaffName: staffUser?.name || "" }
        : action.key === "release_to_front_counter"
        ? {
            ...action,
            staffUserId: staffUser?.id || "",
            staffName: staffUser?.name || "",
          }
        : action;

    const gating = buildWorkflowBlockDetails(order, enrichedAction);
    if (gating.blocked) {
      await updateStoredOrder(order.order_number, {
        activity_type: "production_blocked",
        activity_note: `${enrichedAction.label} blocked. ${gating.blockingReasons.join(" ")}`,
        last_production_blocked_at: new Date().toISOString(),
        last_production_blocked_reasons: gating.blockingReasons,
      });
      setActionFeedbackByOrder((current) => ({
        ...current,
        [order.order_number]: {
          tone: "danger",
          summary: gating.summary,
          detail: gating.detail,
          nextActionLabel: gating.nextActionLabel,
        },
      }));
      return;
    }

    const updates = buildWorkflowActionUpdates(order, enrichedAction);
    if (!updates) return;
    setActionFeedbackByOrder((current) => ({
      ...current,
      [order.order_number]: {
        tone: "success",
        ...buildWorkflowActionConfirmation(order, enrichedAction),
        nextActionLabel: "",
      },
    }));
    await updateStoredOrder(order.order_number, updates);
  }

  function handleOpenDetail(order) {
    if (!order?.order_number) return;
    navigate(`/admin/orders/${encodeURIComponent(order.order_number)}`);
  }

  function handleOwnerBlockedAction(order, presentation) {
    if (!order?.order_number) return;
    const orderPath = `/admin/orders/${encodeURIComponent(order.order_number)}`;
    const workspace = presentation?.workspace;
    navigate(workspace && workspace !== "production" ? `${orderPath}?workspace=${workspace}` : orderPath);
  }

  async function handleAssign(order, staffId) {
    const selectedWorker = staffUsers.find((worker) => worker.id === staffId);
    const previousAssignment = order.assigned_to_staff_name || "";
    const nextAssignment = selectedWorker?.name || "";
    const activityNote = !previousAssignment && nextAssignment
      ? `Assigned to ${nextAssignment}.`
      : previousAssignment && !nextAssignment
      ? `Unassigned from ${previousAssignment}.`
      : previousAssignment && nextAssignment && previousAssignment !== nextAssignment
      ? `Reassigned from ${previousAssignment} to ${nextAssignment}.`
      : selectedWorker
      ? `Assignment confirmed for ${nextAssignment}.`
      : "Assignment cleared.";

    await updateStoredOrder(order.order_number, {
      assigned_to_staff_id: selectedWorker?.id || "",
      assigned_to_staff_name: selectedWorker?.name || "",
      assigned_to_staff_role: selectedWorker?.role || "",
      assigned_at: selectedWorker ? new Date().toISOString() : null,
      needs_assignment: !selectedWorker,
      activity_type: "assignment",
      activity_note: activityNote,
    });
  }

  async function handleClaim(order) {
    if (!staffUser?.id) return;
    // Staff may only claim unassigned work
    if (order.assigned_to_staff_id || order.assigned_to_staff_name) return;

    await updateStoredOrder(order.order_number, {
      assigned_to_staff_id: staffUser.id,
      assigned_to_staff_name: staffUser.name || "",
      assigned_to_staff_role: staffUser.role || "",
      assigned_at: new Date().toISOString(),
      needs_assignment: false,
      activity_type: "assignment",
      activity_note: `${staffUser.name || "Staff"} claimed this job.`,
    });
  }

  async function handleEscalate(order) {
    if (!order?.order_number) return;
    // Avoid duplicate escalations within 24 hours
    const lastEscalated = order.last_escalated_at ? new Date(order.last_escalated_at).getTime() : 0;
    if (Date.now() - lastEscalated < ESCALATION_COOLDOWN_MS) return;

    const now = new Date().toISOString();
    const escalatorName = staffUser?.name || "Staff";
    const readiness = order.production_readiness || buildProductionReadinessSummary(order);
    const blockDetail = readiness.detail || "Blocked order requires owner attention.";

    await updateStoredOrder(order.order_number, {
      last_escalated_at: now,
      escalated_by_staff_name: escalatorName,
      activity_type: "order_escalated",
      activity_note: `Escalated to owner by ${escalatorName}. ${blockDetail}`,
    });

    createStaffNotification({
      type: STAFF_NOTIFICATION_TYPES.orderEscalated,
      orderNumber: order.order_number,
      description: `${order.order_number} escalated by ${escalatorName}: ${blockDetail}`,
      linkTo: `/admin/orders/${order.order_number}`,
    });
  }

  return (
    <div data-testid="production-queue-page" style={{ maxWidth: "1240px", margin: "0 auto", padding: "18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: selectedOrder ? "minmax(0, 1.8fr) minmax(320px, 0.95fr)" : "minmax(0, 1fr)", gap: "18px", alignItems: "start" }}>
        <div
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "16px 18px",
            border: "1px solid #e8edf3",
            display: "grid",
            gap: "12px",
          }}
        >
          <section style={{ display: "grid", gap: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "end", flexWrap: "wrap" }}>
              <div>
                <p
                  style={{
                    margin: 0,
                    color: "#64748b",
                    fontSize: "12px",
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Production Queue
                </p>
                <h1 style={{ margin: "4px 0 0", fontSize: "34px", color: "#0f172a" }}>Production</h1>
              </div>
              <strong style={{ color: "#475569" }}>{buildResultsLabel(filteredOrders.length, activeStatusFilter)}</strong>
            </div>

            <input
              type="search"
              data-testid="production-queue-search"
              value={searchTerm}
              onChange={(event) => updateFilters({ q: event.target.value })}
              placeholder="Search active jobs"
              style={{
                border: "1px solid #d6dbe4",
                borderRadius: "10px",
                padding: "8px 10px",
                fontSize: "14px",
                width: "min(100%, 400px)",
                boxSizing: "border-box",
                color: "#475569",
              }}
            />

            <label style={{ display: "grid", gap: "6px", maxWidth: "320px", color: "#475569", fontSize: "12px", fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Assigned To
              <select
                data-testid="production-employee-filter"
                value={activeEmployeeFilter}
                onChange={(event) => updateFilters({ employee: event.target.value })}
                style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "11px 12px", background: "#ffffff", color: "#0f172a", fontSize: "15px", fontWeight: 800, textTransform: "none", letterSpacing: 0 }}
              >
                <option value="all">All Employees</option>
                <option value="unassigned">Unassigned</option>
                {staffUsers.map((staff) => (
                  <option key={staff.id} value={staff.id}>{staff.name}{staff.role ? ` (${staff.role})` : ""}</option>
                ))}
              </select>
            </label>

            <div style={{ display: "grid", gap: "7px" }}>
              <strong style={{ color: "#475569", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Production Status</strong>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                {DAILY_STATUS_FILTERS.map((filter) => (
                <FilterPill
                  key={filter.key}
                  testId={`production-status-filter-${filter.key}`}
                  active={activeStatusFilter === filter.key}
                  count={statusCounts[filter.key] || 0}
                  onClick={() => updateFilters({ status: filter.key })}
                >
                  {filter.label}
                </FilterPill>
                ))}
              </div>
            </div>
          </section>

          <section
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: hasAttentionItems ? "16px" : "12px",
              padding: hasAttentionItems ? "10px 12px" : "7px 10px",
              background: "#f8fafc",
              display: hasAttentionItems ? "grid" : "flex",
              gap: hasAttentionItems ? "8px" : "10px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <strong style={{ color: hasAttentionItems ? "#0f172a" : "#64748b", fontSize: hasAttentionItems ? "16px" : "12px" }}>Needs Attention</strong>
            </div>
            <div style={{ display: "flex", gap: hasAttentionItems ? "8px" : "6px", flexWrap: "wrap" }}>
              {ATTENTION_FILTERS.map((filter) => (
                <FilterPill
                  key={filter.key}
                  testId={`production-status-filter-${filter.key}`}
                  active={activeStatusFilter === filter.key}
                  count={statusCounts[filter.key] || 0}
                  tone={filter.tone}
                  onClick={() => updateFilters({ status: filter.key })}
                >
                  {filter.label}
                </FilterPill>
              ))}
            </div>
          </section>

          <section style={{ display: "grid", gap: "8px" }}>
            {filteredOrders.length ? (
              filteredOrders.map((order) => (
                <QueueRow
                  key={order.order_number}
                  order={order}
                  onRunAction={handleRunAction}
                  onOpenDetail={handleOpenDetail}
                  onOwnerBlockedAction={handleOwnerBlockedAction}
                  onEscalate={handleEscalate}
                  onClaim={handleClaim}
                  currentStaffUser={staffUser}
                  actionFeedback={actionFeedbackByOrder[order.order_number] || null}
                />
              ))
            ) : (
              <div
                style={{
                  borderRadius: "16px",
                  border: "1px dashed #cbd5e1",
                  background: "#f8fafc",
                  padding: "24px",
                  color: "#64748b",
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {buildProductionEmptyState(activeStatusFilter)}
              </div>
            )}
          </section>
        </div>

        {selectedOrder ? (
          <ProductionDetailDrawer
            order={selectedOrder}
            onClose={() => {
              setSelectedOrderSnapshot(null);
              updateFilters({ order: "" });
            }}
            onAssign={handleAssign}
            onClaim={handleClaim}
            onRunAction={handleRunAction}
            staffUsers={staffUsers}
            currentStaffUser={staffUser}
            actionFeedback={actionFeedbackByOrder[selectedOrder.order_number] || null}
          />
        ) : null}
      </div>
    </div>
  );
}
