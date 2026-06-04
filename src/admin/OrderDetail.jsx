import { useParams, Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import "./OrderDetail.css";
import { recordOrderPayment, updateOrderWorkflow, useOrders } from "../repositories/ordersRepository";
import { useStoredProducts } from "../lib/productsStore";
import {
  getActiveStaffUser,
  getOperationalStaffUsers,
  subscribeToStaffUsers,
} from "../lib/staffUsersStore";
import { generateQuoteSnapshot } from "../lib/quoteEngine";
import { printProductionSheet } from "../lib/printProductionSheet";
import PricingSummary from "../components/PricingSummary";
import StatusBadge from "../components/StatusBadge";
import ProductionProgressTracker from "../order-detail/ProductionProgressTracker";
import AssignmentPanel from "../order-detail/AssignmentPanel";
import ActivityTimeline from "../order-detail/ActivityTimeline";
import ProductionInstructionsPanel from "../order-detail/ProductionInstructionsPanel";
import FinancialSummaryPanel from "../order-detail/FinancialSummaryPanel";
import { buildOrderUrgency } from "../order-detail/buildOrderUrgency";
import { normalizeOrderFinancials } from "../orders/orderFinancials";
import { formatDateTimeParts } from "../lib/dateFormatting";
import {
  getAvailableProductionActions,
  isCanceledOperationalStatus,
} from "../orders/orderWorkflow";
import { buildProductionGatingState } from "../orders/workflowGating";
import { isAdminWorkspaceView, isStaffWorkspaceView } from "./adminRoleView";
import { markAssignmentAttentionSeen } from "../lib/staffAssignmentAttentionStore";
import WorkflowBadge from "../components/WorkflowBadge";
import {
  buildWorkflowBlockDetails,
  buildWorkflowStatusBadges,
} from "../orders/workflowPresentation";

const cardStyle = {
  background: "#ffffff",
  borderRadius: "20px",
  padding: "24px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

const sectionLabelStyle = {
  margin: 0,
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const sectionValueStyle = {
  margin: "4px 0 0",
  color: "#171717",
  fontWeight: 700,
  lineHeight: 1.45,
};

function buildSizeBreakdownEntries(sizeBreakdown = {}) {
  return Object.entries(sizeBreakdown).filter(([, quantity]) => Number(quantity) > 0);
}

export default function OrderDetail() {
  const { orderNumber } = useParams();
  const storedOrders = useOrders();
  const storedProducts = useStoredProducts();
  const [staffUsers, setStaffUsers] = useState(() =>
    getOperationalStaffUsers().filter((staffUser) => staffUser.status !== "Inactive")
  );
  const [workflowFeedback, setWorkflowFeedback] = useState(null);
  const order = useMemo(
    () => storedOrders.find((entry) => entry.order_number === orderNumber) || null,
    [orderNumber, storedOrders]
  );
  const activeStaffUser = getActiveStaffUser();
  const isStaffWorkspace = isStaffWorkspaceView(activeStaffUser);
  const canManageAssignments = isAdminWorkspaceView(activeStaffUser);

  const selectedProduct = useMemo(() => {
    if (!order) return null;

    return storedProducts.find(
      (product) =>
        product.id === order.product_id ||
        product.name === order.garment
    );
  }, [order, storedProducts]);

  const quoteSnapshot = useMemo(() => {
    if (!order) return null;
    return generateQuoteSnapshot(order, selectedProduct);
  }, [order, selectedProduct]);
  const normalizedOrder = useMemo(() => {
    if (!order) return null;

    return normalizeOrderFinancials(order, {
      additionalSources: quoteSnapshot
        ? [{ label: "generatedQuoteSnapshot", value: quoteSnapshot }]
        : [],
    });
  }, [order, quoteSnapshot]);
  const workflowActions = useMemo(
    () => (order ? getAvailableProductionActions(order) : []),
    [order]
  );
  const productionGating = useMemo(
    () => (order ? buildProductionGatingState(order, { targetStatus: "Ready For Production" }) : null),
    [order]
  );
  const workflowBadges = useMemo(() => (order ? buildWorkflowStatusBadges(order) : []), [order]);

  useEffect(() => {
    return subscribeToStaffUsers((nextUsers) => {
      setStaffUsers(nextUsers.filter((staffUser) => staffUser.status !== "Inactive"));
    });
  }, []);

  useEffect(() => {
    if (!order || !isStaffWorkspace || !activeStaffUser?.id) return;
    if (order.assigned_to_staff_id !== activeStaffUser.id) return;
    if (!order.assigned_at) return;

    markAssignmentAttentionSeen({
      staffId: activeStaffUser.id,
      orderNumber: order.order_number,
      assignedAt: order.assigned_at,
    });
  }, [
    activeStaffUser?.id,
    isStaffWorkspace,
    order,
  ]);

  if (!order) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px" }}>
        <h1>Order not found</h1>
        <Link to="/admin/orders">Back to Production Orders</Link>
      </div>
    );
  }

  const urgency = buildOrderUrgency(order);

  function saveWorkflowUpdate(workflowInput, options = {}) {
    return updateOrderWorkflow(orderNumber, workflowInput, {
      staffUser: activeStaffUser,
      ...options,
    });
  }

  function handleAssign(staffId) {
    if (isCanceledOperationalStatus(order.status)) return;

    const worker = staffUsers.find((staff) => staff.id === staffId);
    const previousAssignment = order.assigned_to_staff_name || "";
    const nextAssignment = worker?.name || "";

    let activityNote = "Assignment unchanged.";
    if (!previousAssignment && nextAssignment) {
      activityNote = `Assigned to ${nextAssignment}.`;
    } else if (previousAssignment && !nextAssignment) {
      activityNote = `Unassigned from ${previousAssignment}.`;
    } else if (previousAssignment && nextAssignment && previousAssignment !== nextAssignment) {
      activityNote = `Reassigned from ${previousAssignment} to ${nextAssignment}.`;
    }

    saveWorkflowUpdate(
      {
        type: "assign_staff",
        assignee: worker,
        activity_note: activityNote,
      },
      { now: new Date().toISOString() }
    );
  }

  function handleWorkflowAction(action) {
    if (isCanceledOperationalStatus(order.status)) return;

    const gating = buildWorkflowBlockDetails(order, action);
    if (gating.blocked) {
      saveWorkflowUpdate(
        {
          type: "record_production_blocked",
          action,
          blockingReasons: gating.blockingReasons,
        },
        { now: new Date().toISOString() }
      );
      setWorkflowFeedback({
        tone: "danger",
        summary: gating.summary,
        detail: gating.detail,
        nextActionLabel: gating.nextActionLabel,
      });
      return;
    }

    if (!action?.targetStatus) return;
    setWorkflowFeedback({
      tone: "info",
      summary: `${action.label} completed.`,
      detail: "",
      nextActionLabel: "",
    });
    saveWorkflowUpdate({
      type: "run_production_action",
      action,
    });
  }

  function handleArtworkApprovalChange(nextStatus) {
    if (isCanceledOperationalStatus(order.status)) return;

    const normalizedStatus = String(nextStatus || "").trim();
    const now = new Date().toISOString();
    saveWorkflowUpdate(
      {
        type: "set_artwork_approval",
        status: normalizedStatus,
      },
      { now }
    );
    setWorkflowFeedback(null);
  }

  function handleDepositWorkflowChange(nextStatus) {
    if (isCanceledOperationalStatus(order.status)) return;

    const normalizedStatus = String(nextStatus || "").trim();
    const now = new Date().toISOString();
    saveWorkflowUpdate(
      {
        type: "set_deposit_workflow",
        status: normalizedStatus,
      },
      {
        now,
        financialOptions: {
          additionalSources: quoteSnapshot
            ? [{ label: "generatedQuoteSnapshot", value: quoteSnapshot }]
            : [],
        },
      }
    );
    setWorkflowFeedback(null);
  }

  function handleGatingOverride(overrideKey) {
    if (!canManageAssignments || isCanceledOperationalStatus(order.status)) return;

    saveWorkflowUpdate(
      {
        type: "apply_gating_override",
        overrideKey,
      },
      { now: new Date().toISOString() }
    );
    setWorkflowFeedback({
      tone: "info",
      summary: "Override applied.",
      detail: "This requirement remains visible in the workflow history.",
      nextActionLabel: "",
    });
  }

  function handleForceMoveToProduction() {
    handleGatingOverride("forceProduction");

    saveWorkflowUpdate({
      type: "force_move_to_production",
    });
  }

  function handlePrintTicket() {
    printProductionSheet(printOrder, {
      title: `Production Sheet ${order.order_number || orderNumber}`,
    });
  }

  function handleRecordPayment(paymentInput) {
    return recordOrderPayment(orderNumber, paymentInput, {
      financialOptions: {
        additionalSources: quoteSnapshot
          ? [{ label: "generatedQuoteSnapshot", value: quoteSnapshot }]
          : [],
      },
    });
  }

  function handleMarkPickedUp() {
    if (isCanceledOperationalStatus(order.status)) return;

    saveWorkflowUpdate(
      {
        type: "mark_picked_up",
        balance_due: normalizedOrder.balance_due,
      },
      { now: new Date().toISOString() }
    );
  }

  function handleSendDepositRequest(requestDetails = {}) {
    if (isCanceledOperationalStatus(order.status)) return;

    const now = new Date().toISOString();

    saveWorkflowUpdate(
      {
        type: "send_deposit_request",
        channel: requestDetails.channel || "",
        subject: requestDetails.subject || "",
        body: requestDetails.body || "",
      },
      {
        now,
        financialOptions: {
          additionalSources: quoteSnapshot
            ? [{ label: "generatedQuoteSnapshot", value: quoteSnapshot }]
            : [],
        },
      }
    );
  }

  function handleCancelProductionOrder() {
    if (isCanceledOperationalStatus(order.status)) return;

    saveWorkflowUpdate(
      {
        type: "cancel_order",
      },
      { now: new Date().toISOString() }
    );
  }

  const placedAt = formatDateTimeParts(order.created_at);
  const updatedAt = formatDateTimeParts(order.updated_at);
  const sizeBreakdownEntries = buildSizeBreakdownEntries(order.size_breakdown);
  const printOrder = normalizedOrder || order;
  return (
    <div
      className="order-detail-page"
      data-testid="order-detail-page"
      data-order-number={order.order_number || orderNumber}
      data-workflow-state={order.status || ""}
      style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "18px",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: "#78716c",
              fontSize: "12px",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {isStaffWorkspace ? "Production Work Order" : "Production Command Center"}
          </p>

          <h1 style={{ margin: "6px 0" }}>
            Order {order.order_number || orderNumber}
          </h1>

          <div
            data-testid="order-detail-status-summary"
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span data-testid="order-detail-current-status" data-workflow-state={order.status || ""}>
              <StatusBadge status={order.status} />
            </span>

            <span
              style={{
                color: urgency.color,
                fontWeight: 800,
              }}
            >
              {urgency.label}
            </span>
          </div>

          {workflowBadges.length ? (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
              {workflowBadges.map((badge) => (
                <WorkflowBadge key={badge.label} label={badge.label} tone={badge.tone} />
              ))}
            </div>
          ) : null}

          {isCanceledOperationalStatus(order.status) ? (
            <div
              style={{
                marginTop: "14px",
                maxWidth: "520px",
                borderRadius: "16px",
                padding: "14px 16px",
                border: "1px solid #fecaca",
                background: "#fff5f5",
                color: "#7f1d1d",
              }}
            >
              <strong style={{ display: "block", marginBottom: "6px" }}>Canceled workflow</strong>
              <span style={{ lineHeight: 1.6 }}>
                This production order was intentionally terminated and remains available with its production, payment, and timeline history intact.
              </span>
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gap: "8px",
              marginTop: "14px",
              padding: "14px 16px",
              borderRadius: "16px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              maxWidth: "420px",
            }}
          >
            <div>
              <p style={{ margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Placed
              </p>
              <p style={{ margin: "4px 0 0", color: "#171717", fontWeight: 700 }}>
                {placedAt.date} — {placedAt.time}
              </p>
            </div>

            <div>
              <p style={{ margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Last Updated
              </p>
              <p style={{ margin: "4px 0 0", color: "#171717", fontWeight: 700 }}>
                {updatedAt.date} — {updatedAt.time}
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link
            to={
              canManageAssignments && isCanceledOperationalStatus(order.status)
                ? "/admin/records/canceled"
                : "/admin/orders"
            }
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: "12px",
              padding: "11px 14px",
              textDecoration: "none",
              color: "#171717",
              fontWeight: 700,
            }}
          >
            {canManageAssignments && isCanceledOperationalStatus(order.status)
              ? "Canceled Orders"
              : isStaffWorkspace
              ? "Production Queue"
              : "Orders"}
          </Link>

          <button
            type="button"
            onClick={handlePrintTicket}
            style={{
              background: "#171717",
              color: "#ffffff",
              border: "none",
              borderRadius: "12px",
              padding: "11px 14px",
              fontWeight: 700,
            }}
          >
            Print Production Sheet
          </button>
          {canManageAssignments && !isCanceledOperationalStatus(order.status) ? (
            <button
              type="button"
              onClick={handleCancelProductionOrder}
              style={{
                border: "1px solid #fecaca",
                background: "#fff5f5",
                color: "#b91c1c",
                borderRadius: "12px",
                padding: "11px 14px",
                fontWeight: 700,
              }}
            >
              Cancel Production Order
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ marginBottom: "18px" }}>
        <ProductionProgressTracker order={order} />
      </div>

      <div className="order-detail-main-grid">
        <div style={{ display: "grid", gap: "18px" }}>
          <section style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "14px",
                flexWrap: "wrap",
                marginBottom: "18px",
              }}
            >
              <div>
                <h2 style={{ margin: "0 0 4px" }}>Customer & Order Items</h2>
                <p style={{ margin: 0, color: "#64748b" }}>
                  Core intake details for production and fulfillment.
                </p>
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "999px",
                  padding: "8px 12px",
                  background: "#f1f5f9",
                  color: "#0f172a",
                  fontWeight: 800,
                  fontSize: "13px",
                }}
              >
                Qty {order.qty || 0}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "16px",
                marginBottom: "18px",
              }}
            >
              <div>
                <p style={sectionLabelStyle}>Customer</p>
                <p style={sectionValueStyle}>{order.customer_name || "Walk-in Customer"}</p>
              </div>

              <div>
                <p style={sectionLabelStyle}>Garment</p>
                <p style={sectionValueStyle}>{order.garment || order.item || "Custom garment"}</p>
              </div>

              <div>
                <p style={sectionLabelStyle}>Placements</p>
                <p style={sectionValueStyle}>
                  {Array.isArray(order.placements) && order.placements.length
                    ? order.placements
                        .map((placement) => placement?.placement)
                        .filter(Boolean)
                        .join(", ")
                    : order.placement || "—"}
                </p>
              </div>

              <div>
                <p style={sectionLabelStyle}>Assigned</p>
                <p style={sectionValueStyle}>{order.assigned_to_staff_name || "Unassigned"}</p>
              </div>
            </div>

            <div
              style={{
                borderTop: "1px solid #e2e8f0",
                paddingTop: "18px",
                display: "grid",
                gap: "12px",
              }}
            >
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: "16px" }}>Size Breakdown</h3>
                <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
                  Recorded quantities for the production team.
                </p>
              </div>

              {sizeBreakdownEntries.length ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))",
                    gap: "10px",
                  }}
                >
                  {sizeBreakdownEntries.map(([size, quantity]) => (
                    <div
                      key={size}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "14px",
                        padding: "12px",
                        background: "#f8fafc",
                      }}
                    >
                      <p style={sectionLabelStyle}>{size}</p>
                      <p style={{ ...sectionValueStyle, fontSize: "18px" }}>{quantity}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, color: "#94a3b8" }}>
                  No size breakdown recorded for this order yet.
                </p>
              )}
            </div>
          </section>

          <ProductionInstructionsPanel order={order} />
        </div>

        <aside style={{ display: "grid", gap: "18px" }}>
          {isStaffWorkspace ? null : (
            <FinancialSummaryPanel
              order={normalizedOrder}
              onRecordPayment={handleRecordPayment}
              onMarkPickedUp={handleMarkPickedUp}
              onSendDepositRequest={handleSendDepositRequest}
            />
          )}

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>
              {isStaffWorkspace ? "Production Snapshot" : "Quote Snapshot"}
            </h2>

            {quoteSnapshot && !isStaffWorkspace ? (
              <PricingSummary
                quote={quoteSnapshot}
                quantity={quoteSnapshot.quantity || order.qty || 0}
                compact
              />
            ) : isStaffWorkspace ? (
              <div style={{ display: "grid", gap: "14px" }}>
                <div>
                  <p style={sectionLabelStyle}>Production Type</p>
                  <p style={sectionValueStyle}>{order.decoration_type || "Production"}</p>
                </div>
                <div>
                  <p style={sectionLabelStyle}>Due Date</p>
                  <p style={sectionValueStyle}>{order.due_date || "Not set"}</p>
                </div>
                <div>
                  <p style={sectionLabelStyle}>Source</p>
                  <p style={sectionValueStyle}>{order.source || "Operational intake"}</p>
                </div>
              </div>
            ) : (
              <p style={{ color: "#94a3b8" }}>
                Quote snapshot unavailable.
              </p>
            )}
          </section>
        </aside>
      </div>

      <div className="order-detail-operational-grid">
        <AssignmentPanel
          order={order}
          staffUsers={staffUsers}
          onAssign={handleAssign}
          workflowActions={workflowActions}
          onRunWorkflowAction={handleWorkflowAction}
          canManageAssignments={canManageAssignments}
          productionGating={productionGating}
          onArtworkApprovalChange={handleArtworkApprovalChange}
          onDepositWorkflowChange={handleDepositWorkflowChange}
          onGatingOverride={handleGatingOverride}
          onForceMoveToProduction={handleForceMoveToProduction}
          workflowFeedback={workflowFeedback}
        />

        <ActivityTimeline
          events={normalizedOrder?.connected_timeline || order.activity_log || []}
          compact
        />
      </div>
    </div>
  );
}
