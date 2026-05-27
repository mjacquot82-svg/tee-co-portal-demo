import { useParams, Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import "./OrderDetail.css";
import { recordStoredOrderPayment, updateStoredOrder, useStoredOrders } from "../lib/ordersStore";
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
import { buildWorkflowActionUpdates } from "../orders/buildWorkflowActionUpdates";
import { normalizeOrderFinancials } from "../orders/orderFinancials";
import { formatDateTimeParts } from "../lib/dateFormatting";
import {
  getAvailableProductionActions,
  isCanceledOperationalStatus,
  normalizeOperationalStatus,
} from "../orders/orderWorkflow";
import { isAdminWorkspaceView, isStaffWorkspaceView } from "./adminRoleView";
import { markAssignmentAttentionSeen } from "../lib/staffAssignmentAttentionStore";

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

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function buildSizeBreakdownEntries(sizeBreakdown = {}) {
  return Object.entries(sizeBreakdown).filter(([, quantity]) => Number(quantity) > 0);
}

export default function OrderDetail() {
  const { orderNumber } = useParams();
  const storedOrders = useStoredOrders();
  const storedProducts = useStoredProducts();
  const [staffUsers, setStaffUsers] = useState(() =>
    getOperationalStaffUsers().filter((staffUser) => staffUser.status !== "Inactive")
  );
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

  function saveOrderUpdates(updates) {
    const updated = updateStoredOrder(orderNumber, {
      updated_by_staff_name: activeStaffUser?.name || "Unknown Staff",
      updated_by_staff_role: activeStaffUser?.role || "",
      ...updates,
    });

    return updated;
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

    saveOrderUpdates({
      assigned_to_staff_id: worker?.id || "",
      assigned_to_staff_name: worker?.name || "",
      assigned_to_staff_role: worker?.role || "",
      assigned_at: worker ? new Date().toISOString() : null,
      needs_assignment: !worker,
      activity_type: "assignment",
      activity_note: activityNote,
    });
  }

  function handleWorkflowAction(action) {
    if (isCanceledOperationalStatus(order.status)) return;

    const updates = buildWorkflowActionUpdates(order, action);
    if (!updates) return;
    saveOrderUpdates(updates);
  }

  function handlePrintTicket() {
    printProductionSheet(printOrder, {
      title: `Production Sheet ${order.order_number || orderNumber}`,
    });
  }

  function handleRecordPayment(paymentInput) {
    return recordStoredOrderPayment(orderNumber, paymentInput, {
      financialOptions: {
        additionalSources: quoteSnapshot
          ? [{ label: "generatedQuoteSnapshot", value: quoteSnapshot }]
          : [],
      },
    });
  }

  function handleMarkPickedUp() {
    if (isCanceledOperationalStatus(order.status)) return;

    const now = new Date().toISOString();
    const balanceNote =
      normalizedOrder.balance_due > 0
        ? ` Outstanding balance: ${money(normalizedOrder.balance_due)}.`
        : "";

    saveOrderUpdates({
      pickup_status: "Picked Up",
      picked_up_at: order.picked_up_at || now,
      status:
        normalizeOperationalStatus(order.status) === "Ready For Pickup"
          ? "Completed"
          : order.status,
      activity_type: "pickup",
      activity_note: `Order marked as picked up.${balanceNote}`,
    });
  }

  function handleSendDepositRequest(requestDetails = {}) {
    if (isCanceledOperationalStatus(order.status)) return;

    const now = new Date().toISOString();

    saveOrderUpdates({
      deposit: {
        ...(order.deposit || {}),
        amount: normalizedOrder.deposit_amount,
        status: "pending",
        requested_at: now,
        updated_at: now,
        request_channel: requestDetails.channel || "",
        last_requested_subject: requestDetails.subject || "",
        last_requested_message: requestDetails.body || "",
      },
      activity_type: "deposit_request",
      activity_note: `Deposit request prepared via ${requestDetails.channel || "manual workflow"}.`,
    });
  }

  function handleCancelProductionOrder() {
    if (isCanceledOperationalStatus(order.status)) return;

    updateStoredOrder(orderNumber, {
      status: "Canceled",
      quote_status: "Canceled",
      operational_visible: false,
      production_ready: false,
      canceled_at: new Date().toISOString(),
      activity_type: "canceled",
      activity_note: "Production order canceled while preserving operational and financial history.",
    });
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
        />

        <ActivityTimeline
          events={normalizedOrder?.connected_timeline || order.activity_log || []}
          compact
        />
      </div>
    </div>
  );
}
