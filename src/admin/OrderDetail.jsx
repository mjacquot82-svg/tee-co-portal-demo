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
import { buildProductionGatingState } from "../orders/workflowGating";
import { isAdminWorkspaceView, isStaffWorkspaceView, canSelfAssignOrder } from "./adminRoleView";
import { markAssignmentAttentionSeen } from "../lib/staffAssignmentAttentionStore";
import WorkflowBadge from "../components/WorkflowBadge";
import OwnerNextActionCard from "../components/OwnerNextActionCard";
import {
  buildWorkflowBlockDetails,
  buildWorkflowStatusBadges,
} from "../orders/workflowPresentation";
import { deriveOwnerOrderNextAction } from "../orders/ownerWorkflowActions";
import {
  buildDepositRequestContent,
  createAndSendDepositPaymentRequestForOrder,
} from "../orders/depositRequests";
import PaymentRequestForm from "./PaymentRequestForm";
import { usePaymentsSnapshot } from "../lib/paymentsStore";
import {
  buildDepositRequestConfirmation,
  buildWorkflowActionConfirmation,
} from "./workflowCopy";
import { ensureTeeCoProductionProcess } from "../integrations/teeCoProductionProcess";
import { buildProcessInstanceProjection } from "../process-engine/processProjection";

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
  const paymentsSnapshot = usePaymentsSnapshot();
  const [staffUsers, setStaffUsers] = useState(() =>
    getOperationalStaffUsers().filter((staffUser) => staffUser.status !== "Inactive")
  );
  const [workflowFeedback, setWorkflowFeedback] = useState(null);
  const [processProjection, setProcessProjection] = useState(null);
  const order = useMemo(
    () => storedOrders.find((entry) => entry.order_number === orderNumber) || null,
    [orderNumber, storedOrders]
  );
  const activeStaffUser = getActiveStaffUser();
  const isStaffWorkspace = isStaffWorkspaceView(activeStaffUser);
  const canManageAssignments = isAdminWorkspaceView(activeStaffUser);
  const selfAssignAllowed = order ? canSelfAssignOrder(order, activeStaffUser) : false;

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
  }, [order, paymentsSnapshot, quoteSnapshot]);
  const workflowActions = useMemo(
    () => (order ? getAvailableProductionActions(order) : []),
    [order]
  );
  const productionGating = useMemo(
    () => (order ? buildProductionGatingState(order, { targetStatus: "Ready For Production" }) : null),
    [order]
  );
  const workflowBadges = useMemo(() => (order ? buildWorkflowStatusBadges(order) : []), [order]);
  const ownerNextAction = useMemo(
    () => (normalizedOrder ? deriveOwnerOrderNextAction(normalizedOrder) : null),
    [normalizedOrder]
  );
  const orderNextAction = ownerNextAction?.actionKey
    ? { ...ownerNextAction, href: "" }
    : ownerNextAction;

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

  useEffect(() => {
    let active = true;

    async function loadProcessProjection() {
      if (!order) {
        setProcessProjection(null);
        return;
      }

      try {
        const result = await ensureTeeCoProductionProcess(order);
        if (active) {
          setProcessProjection(buildProcessInstanceProjection(result.processInstance));
        }
      } catch (error) {
        console.error("Unable to load production process instance", {
          orderNumber: order.order_number,
          error,
        });
        if (active) setProcessProjection(null);
      }
    }

    void loadProcessProjection();
    return () => {
      active = false;
    };
  }, [order]);

  if (!order) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px" }}>
        <h1>Order not found</h1>
        <Link to="/admin/orders">Back to Production Orders</Link>
      </div>
    );
  }

  const urgency = buildOrderUrgency(order);

  async function saveOrderUpdates(updates) {
    const updated = await updateStoredOrder(orderNumber, {
      updated_by_staff_name: activeStaffUser?.name || "Unknown Staff",
      updated_by_staff_role: activeStaffUser?.role || "",
      ...updates,
    });

    return updated;
  }

  async function handleAssign(staffId) {
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

    await saveOrderUpdates({
      assigned_to_staff_id: worker?.id || "",
      assigned_to_staff_name: worker?.name || "",
      assigned_to_staff_role: worker?.role || "",
      assigned_at: worker ? new Date().toISOString() : null,
      needs_assignment: !worker,
      activity_type: "assignment",
      activity_note: activityNote,
    });
  }

  async function handleSelfAssign() {
    if (!activeStaffUser?.id || isCanceledOperationalStatus(order.status)) return;
    // Staff may only claim unassigned work
    if (order.assigned_to_staff_id || order.assigned_to_staff_name) return;

    await saveOrderUpdates({
      assigned_to_staff_id: activeStaffUser.id,
      assigned_to_staff_name: activeStaffUser.name || "",
      assigned_to_staff_role: activeStaffUser.role || "",
      assigned_at: new Date().toISOString(),
      needs_assignment: false,
      activity_type: "assignment",
      activity_note: `${activeStaffUser.name || "Staff"} claimed this job.`,
    });
  }

  async function handleWorkflowAction(action) {
    if (isCanceledOperationalStatus(order.status)) return;

    // Enrich resume_from_hold with who resumed
    const enrichedAction =
      action.key === "resume_from_hold"
        ? { ...action, resumeStaffName: activeStaffUser?.name || "" }
        : action;

    const gating = buildWorkflowBlockDetails(order, enrichedAction);
    if (gating.blocked) {
      await saveOrderUpdates({
        activity_type: "production_blocked",
        activity_note: `${enrichedAction.label} blocked. ${gating.blockingReasons.join(" ")}`,
        last_production_blocked_at: new Date().toISOString(),
        last_production_blocked_reasons: gating.blockingReasons,
      });
      setWorkflowFeedback({
        tone: "danger",
        summary: gating.summary,
        detail: gating.detail,
        nextActionLabel: gating.nextActionLabel,
      });
      return;
    }

    const updates = buildWorkflowActionUpdates(order, enrichedAction);
    if (!updates) return;
    setWorkflowFeedback({
      tone: "success",
      ...buildWorkflowActionConfirmation(order, enrichedAction),
      nextActionLabel: "",
    });
    await saveOrderUpdates(updates);
  }

  async function handleArtworkApprovalChange(nextStatus) {
    if (isCanceledOperationalStatus(order.status)) return;

    const normalizedStatus = String(nextStatus || "").trim();
    const now = new Date().toISOString();
    const artworkSatisfied =
      normalizedStatus === "Approved" || normalizedStatus === "Not Required";
    const depositStatus = String(order.deposit_workflow_status || "").trim();
    const depositResolved =
      depositStatus === "Deposit Not Required" || depositStatus === "Deposit Received";
    await saveOrderUpdates({
      artwork_approval_status: normalizedStatus,
      artwork_status: normalizedStatus,
      staff_review_status: artworkSatisfied
        ? "Approved"
        : normalizedStatus === "Needs Revision"
        ? "Changes Requested"
        : "Pending Review",
      approval_status:
        normalizedStatus === "Approved"
          ? "Approved"
          : normalizedStatus === "Not Required"
          ? "Approved"
          : normalizedStatus === "Needs Revision"
          ? "Revision Requested"
          : "Pending Review",
      quote_status:
        order.operational_visible === false
          ? artworkSatisfied
            ? !depositResolved
              ? order.quote_status
              : order.deposit_required
              ? "Awaiting Deposit"
              : "Approved"
            : "Awaiting Artwork Approval"
          : order.quote_status,
      customer_approved_at: normalizedStatus === "Approved" ? order.customer_approved_at || now : null,
      customer_revision_requested_at:
        normalizedStatus === "Needs Revision"
          ? order.customer_revision_requested_at || now
          : null,
      activity_type: "artwork_approval",
      activity_note:
        normalizedStatus === "Approved"
          ? `Artwork approved by ${activeStaffUser?.name || "staff"}.`
          : normalizedStatus === "Not Required"
          ? `Artwork marked not required by ${activeStaffUser?.name || "staff"}.`
          : normalizedStatus === "Needs Revision"
          ? `Artwork revision requested by ${activeStaffUser?.name || "staff"}.`
          : "Artwork moved to pending review.",
    });
    setWorkflowFeedback(null);
  }

  async function handleGatingOverride(overrideKey) {
    if (!canManageAssignments || isCanceledOperationalStatus(order.status)) return;

    const now = new Date().toISOString();
    const overrideLabels = {
      forceProduction: "Force Move To Production",
      depositRequirement: "Override Deposit Requirement",
      artworkApprovalRequirement: "Override Artwork Approval Requirement",
    };

    await saveOrderUpdates({
      workflow_overrides: {
        ...order.workflow_overrides,
        [overrideKey]: {
          active: true,
          usedAt: now,
          usedByName: activeStaffUser?.name || "Unknown Staff",
          usedByRole: activeStaffUser?.role || "",
        },
      },
      activity_type: "gating_override_used",
      activity_note: `${overrideLabels[overrideKey] || "Workflow gating override"} used.`,
    });
    setWorkflowFeedback({
      tone: "info",
      summary: "Override applied.",
      detail: "This requirement remains visible in the workflow history.",
      nextActionLabel: "",
    });
  }

  async function handleForceMoveToProduction() {
    await handleGatingOverride("forceProduction");

    const updates = buildWorkflowActionUpdates(order, {
      key: "move_to_production",
      label: "Move To Production",
      targetStatus: "Ready For Production",
    });
    if (!updates) return;

    await saveOrderUpdates({
      ...updates,
      activity_note: "Move To Production forced with operational override.",
    });
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

  async function handleMarkPickedUp() {
    if (isCanceledOperationalStatus(order.status)) return;

    const now = new Date().toISOString();
    const balanceNote =
      normalizedOrder.balance_due > 0
        ? ` Outstanding balance: ${money(normalizedOrder.balance_due)}.`
        : "";

    await saveOrderUpdates({
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

  async function handleSendDepositRequest(requestDetails = {}) {
    if (isCanceledOperationalStatus(order.status)) return null;

    const now = new Date().toISOString();
    const result = await createAndSendDepositPaymentRequestForOrder(
      {
        ...order,
        ...normalizedOrder,
      },
      requestDetails,
      {
        staffUserId: activeStaffUser?.id || "",
      }
    );
    const checkoutUrl =
      result.paymentRequest?.provider_checkout_url ||
      result.providerLink?.provider_checkout_url ||
      "";
    const depositRequestContent = buildDepositRequestContent(normalizedOrder, { checkoutUrl });

    await saveOrderUpdates({
      deposit_workflow_status: "Deposit Requested",
      deposit_required: true,
      deposit_requirement: "required",
      deposit_requirement_status: "Required",
      deposit: {
        ...(order.deposit || {}),
        amount: normalizedOrder.deposit_amount,
        status: "pending",
        requested_at: now,
        updated_at: now,
        request_channel: requestDetails.channel || "",
        last_requested_subject: depositRequestContent.subject || requestDetails.subject || "",
        last_requested_message: depositRequestContent.body || requestDetails.body || "",
        payment_request_id: result.paymentRequest?.id || "",
        provider_checkout_url: checkoutUrl,
      },
      activity_type: "deposit_request",
      activity_note: buildDepositRequestConfirmation(normalizedOrder, {
        amount: normalizedOrder.deposit_amount,
      }),
    });

    return {
      ...result,
      checkoutUrl,
      depositRequestContent,
    };
  }

  function handleOwnerNextAction(actionKey) {
    if (actionKey === "create_payment_request") {
      document.getElementById("owner-payment-request-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }

    if (actionKey === "move_to_production") {
      const action = workflowActions.find((entry) => entry.key === "move_to_production");
      if (action) handleWorkflowAction(action);
      return;
    }

    if (actionKey === "view_blocking_reason") {
      document.querySelector("[data-testid='production-gating-alert']")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }

  async function handleCancelProductionOrder() {
    if (isCanceledOperationalStatus(order.status)) return;

    await updateStoredOrder(orderNumber, {
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
  const assignmentPanel = (
    <AssignmentPanel
      order={order}
      staffUsers={staffUsers}
      onAssign={handleAssign}
      workflowActions={workflowActions}
      onRunWorkflowAction={handleWorkflowAction}
      canManageAssignments={canManageAssignments}
      canSelfAssign={selfAssignAllowed}
      onSelfAssign={handleSelfAssign}
      productionGating={productionGating}
      onArtworkApprovalChange={handleArtworkApprovalChange}
      onGatingOverride={handleGatingOverride}
      onForceMoveToProduction={handleForceMoveToProduction}
      workflowFeedback={workflowFeedback}
    />
  );
  return (
    <div
      className="order-detail-page"
      data-testid="order-detail-page"
      data-order-number={order.order_number || orderNumber}
      data-workflow-state={order.status || ""}
      style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px" }}
    >
      {processProjection ? (
        <>
          <div style={{ marginBottom: "18px" }}>
            <ProductionProgressTracker order={order} processProjection={processProjection} />
          </div>
          <div className="production-workspace-controls" style={{ marginBottom: "28px" }}>
            <p style={{ ...sectionLabelStyle, marginBottom: "10px" }}>Production Controls & Assignment</p>
            {assignmentPanel}
          </div>
          <div
            data-testid="supporting-order-information"
            style={{ borderTop: "1px solid #cbd5e1", paddingTop: "24px", marginBottom: "18px" }}
          >
            <p style={{ ...sectionLabelStyle, color: "#475569" }}>Supporting Order Information</p>
            <p style={{ margin: "6px 0 0", color: "#64748b" }}>
              Customer, artwork, financial, order, and activity context for the production process.
            </p>
          </div>
        </>
      ) : null}

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
            {isStaffWorkspace ? "Production Work Order" : "Production Order"}
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

      {processProjection ? null : (
        <div style={{ marginBottom: "18px" }}>
          <ProductionProgressTracker order={order} />
        </div>
      )}

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
          {isStaffWorkspace || !orderNextAction ? null : (
            <OwnerNextActionCard action={orderNextAction} onAction={handleOwnerNextAction} />
          )}

          {isStaffWorkspace ? null : (
            <FinancialSummaryPanel
              order={normalizedOrder}
              onRecordPayment={handleRecordPayment}
              onMarkPickedUp={handleMarkPickedUp}
              onSendDepositRequest={handleSendDepositRequest}
            />
          )}

          {isStaffWorkspace || !normalizedOrder ? null : (
            <PaymentRequestForm
              id="owner-payment-request-form"
              title="Create Payment Request"
              description="Create a staff-managed payment request tied to this order without changing the existing deposit workflow."
              order={normalizedOrder}
              defaultType={
                normalizedOrder.payment_collection_state === "Awaiting Deposit"
                  ? "deposit"
                  : "balance"
              }
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

      <div className={processProjection ? "order-detail-activity-section" : "order-detail-operational-grid"}>
        {processProjection ? null : assignmentPanel}

        <ActivityTimeline
          events={normalizedOrder?.connected_timeline || order.activity_log || []}
          compact
        />
      </div>
    </div>
  );
}
