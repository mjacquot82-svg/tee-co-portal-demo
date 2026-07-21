import { useParams, Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import "./OrderDetail.css";
import { recordStoredOrderPayment, updateStoredOrder, useStoredOrders } from "../lib/ordersStore";
import { useStoredProducts } from "../lib/productsStore";
import {
  getActiveStaffUser,
  getOperationalStaffUsers,
  subscribeToStaffUsers,
} from "../lib/staffUsersStore";
import { generateOrderQuoteSnapshot } from "../lib/quoteEngine";
import { getOrderLineItems, getOrderTotalQuantity } from "../lib/orderLineItems";
import { printProductionSheet } from "../lib/printProductionSheet";
import PricingSummary from "../components/PricingSummary";
import StatusBadge from "../components/StatusBadge";
import ProductionProgressTracker from "../order-detail/ProductionProgressTracker";
import AssignmentPanel from "../order-detail/AssignmentPanel";
import AssignmentOnlyPanel from "../order-detail/AssignmentOnlyPanel";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const storedOrders = useStoredOrders();
  const storedProducts = useStoredProducts();
  const paymentsSnapshot = usePaymentsSnapshot();
  const [staffUsers, setStaffUsers] = useState(() =>
    getOperationalStaffUsers().filter((staffUser) => staffUser.status !== "Inactive")
  );
  const [workflowFeedback, setWorkflowFeedback] = useState(null);
  const [processProjection, setProcessProjection] = useState(null);
  const [processProjectionResolved, setProcessProjectionResolved] = useState(false);
  const order = useMemo(
    () => storedOrders.find((entry) => entry.order_number === orderNumber) || null,
    [orderNumber, storedOrders]
  );
  const activeStaffUser = getActiveStaffUser();
  const isStaffWorkspace = isStaffWorkspaceView(activeStaffUser);
  const canManageAssignments = isAdminWorkspaceView(activeStaffUser);
  const selfAssignAllowed = order ? canSelfAssignOrder(order, activeStaffUser) : false;
  const hasProcessAuthority = Boolean(processProjection);
  const showLegacyProduction = processProjectionResolved && !hasProcessAuthority;
  const requestedWorkspace = searchParams.get("workspace");
  const activeWorkspace = ["financial", "details"].includes(requestedWorkspace)
    ? requestedWorkspace
    : "production";

  const quoteSnapshot = useMemo(() => {
    if (!order) return null;
    return generateOrderQuoteSnapshot(order, storedProducts);
  }, [order, storedProducts]);
  const normalizedOrder = useMemo(() => {
    if (!order) return null;

    return normalizeOrderFinancials(order, {
      additionalSources: quoteSnapshot
        ? [{ label: "generatedQuoteSnapshot", value: quoteSnapshot }]
        : [],
    });
  }, [order, paymentsSnapshot, quoteSnapshot]);
  const workflowActions = useMemo(
    () => (order && showLegacyProduction ? getAvailableProductionActions(order) : []),
    [order, showLegacyProduction]
  );
  const productionGating = useMemo(
    () => (order && showLegacyProduction ? buildProductionGatingState(order, { targetStatus: "Ready For Production" }) : null),
    [order, showLegacyProduction]
  );
  const workflowBadges = useMemo(
    () => (order && showLegacyProduction ? buildWorkflowStatusBadges(order) : []),
    [order, showLegacyProduction]
  );
  const ownerNextAction = useMemo(
    () => (normalizedOrder && showLegacyProduction ? deriveOwnerOrderNextAction(normalizedOrder) : null),
    [normalizedOrder, showLegacyProduction]
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
      setProcessProjectionResolved(false);
      setProcessProjection(null);

      if (!order) {
        setProcessProjectionResolved(true);
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
      } finally {
        if (active) setProcessProjectionResolved(true);
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
  const orderLineItems = getOrderLineItems(order);
  const sizeBreakdownEntries = buildSizeBreakdownEntries(order.size_breakdown);
  const printOrder = normalizedOrder || order;
  const assignmentPanel = hasProcessAuthority ? (
    <AssignmentOnlyPanel
      order={order}
      staffUsers={staffUsers}
      onAssign={handleAssign}
      canManageAssignments={canManageAssignments}
      canSelfAssign={selfAssignAllowed}
      onSelfAssign={handleSelfAssign}
      canceled={isCanceledOperationalStatus(order.status)}
    />
  ) : (
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

  function selectWorkspace(workspace) {
    const nextParams = new URLSearchParams(searchParams);
    if (workspace === "production") nextParams.delete("workspace");
    else nextParams.set("workspace", workspace);
    setSearchParams(nextParams, { replace: true });
  }

  return (
    <div
      className="order-detail-page"
      data-testid="order-detail-page"
      data-order-number={order.order_number || orderNumber}
      data-workflow-state={showLegacyProduction ? order.status || "" : ""}
      style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px" }}
    >
      <div
        data-testid="production-job-identity"
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
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "14px",
              marginTop: "16px",
              padding: "16px",
              borderRadius: "16px",
              border: "1px solid #dbeafe",
              background: "#f8fafc",
              maxWidth: "820px",
            }}
          >
            <div data-testid="job-identity-customer">
              <p style={sectionLabelStyle}>Customer</p>
              <p style={sectionValueStyle}>{order.customer_name || "Walk-in Customer"}</p>
            </div>
            <div data-testid="job-identity-garment" style={{ gridColumn: "span 2" }}>
              <p style={sectionLabelStyle}>Garment</p>
              <p style={{ ...sectionValueStyle, fontSize: "18px" }}>{orderLineItems.map((item) => item.garment).join(", ") || order.garment || order.item || "Custom garment"}</p>
            </div>
            <div data-testid="job-identity-decoration-method">
              <p style={sectionLabelStyle}>Decoration Method</p>
              <p style={sectionValueStyle}>{order.decoration_type || order.production_type || "Not specified"}</p>
            </div>
            <div data-testid="job-identity-quantity">
              <p style={sectionLabelStyle}>Quantity</p>
              <p style={{ ...sectionValueStyle, fontSize: "20px" }}>{order.qty || 0}</p>
            </div>
            <div data-testid="job-identity-sizes" style={{ gridColumn: "1 / -1" }}>
              <p style={sectionLabelStyle}>Sizes</p>
              <p style={sectionValueStyle}>
                {sizeBreakdownEntries.length
                  ? sizeBreakdownEntries.map(([size, quantity]) => `${size}: ${quantity}`).join(" · ")
                  : "No size breakdown recorded"}
              </p>
            </div>
            {orderLineItems.length > 1 ? (
              <div data-testid="job-identity-line-items" style={{ gridColumn: "1 / -1" }}>
                <p style={sectionLabelStyle}>Garment Line Items</p>
                {orderLineItems.map((item) => (
                  <p key={item.id} style={sectionValueStyle}>
                    {item.garment} · {item.quantity} · {Object.entries(item.size_breakdown).map(([size, quantity]) => `${size}: ${quantity}`).join(" · ") || "No sizes recorded"} · {item.decoration_type || "Decoration not specified"} · {item.placement || "Placement not specified"}
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          <div data-testid="order-detail-status-summary" style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "12px" }}>
            {showLegacyProduction ? (
              <span data-testid="order-detail-current-status" data-workflow-state={order.status || ""}>
                <StatusBadge status={order.status} />
              </span>
            ) : null}
            <span style={{ color: urgency.color, fontWeight: 800 }}>{urgency.label}</span>
          </div>

          {showLegacyProduction && workflowBadges.length ? (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
              {workflowBadges.map((badge) => <WorkflowBadge key={badge.label} label={badge.label} tone={badge.tone} />)}
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

        </div>
      </div>

      <nav
        role="tablist"
        data-testid="order-workspace-tabs"
        aria-label="Order workspaces"
        style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "18px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}
      >
        {[
          { key: "production", label: "Production" },
          { key: "financial", label: "Financial" },
          { key: "details", label: "Details" },
        ].map((workspace) => {
          const selected = activeWorkspace === workspace.key;
          return (
            <button
              key={workspace.key}
              type="button"
              role="tab"
              aria-selected={selected}
              data-testid={`order-workspace-tab-${workspace.key}`}
              onClick={() => selectWorkspace(workspace.key)}
              style={{
                border: selected ? "1px solid #0f172a" : "1px solid #cbd5e1",
                background: selected ? "#0f172a" : "#ffffff",
                color: selected ? "#ffffff" : "#334155",
                borderRadius: "12px",
                padding: "10px 14px",
                fontWeight: 800,
              }}
            >
              {workspace.label}
            </button>
          );
        })}
      </nav>

      {activeWorkspace === "production" ? (
        <div data-testid="order-workspace-production" style={{ display: "grid", gap: "18px" }}>
          <div>
            <button
              type="button"
              onClick={handlePrintTicket}
              style={{ background: "#171717", color: "#ffffff", border: "none", borderRadius: "12px", padding: "11px 14px", fontWeight: 700 }}
            >
              Print Production Sheet
            </button>
          </div>

          {hasProcessAuthority ? (
            <>
              <ProductionProgressTracker order={order} processProjection={processProjection} />
              <div className="production-workspace-controls">{assignmentPanel}</div>
            </>
          ) : showLegacyProduction ? (
            <>
              <ProductionProgressTracker order={order} />
              {isStaffWorkspace || !orderNextAction ? null : (
                <OwnerNextActionCard action={orderNextAction} onAction={handleOwnerNextAction} />
              )}
              {assignmentPanel}
            </>
          ) : (
            <section
              data-testid="production-authority-loading"
              style={{ border: "1px solid #e2e8f0", borderRadius: "20px", padding: "18px", color: "#64748b", fontWeight: 700 }}
            >
              Resolving production authority…
            </section>
          )}

          <div className="order-detail-main-grid">
            <section style={cardStyle}>
              <h2 style={{ margin: "0 0 4px" }}>Production Reference</h2>
              <p style={{ margin: "0 0 18px", color: "#64748b" }}>Placement and size details needed while producing this job.</p>
              <div style={{ marginBottom: "18px" }}>
                <p style={sectionLabelStyle}>Placements</p>
                <p style={sectionValueStyle}>
                  {Array.isArray(order.placements) && order.placements.length
                    ? order.placements.map((placement) => placement?.placement).filter(Boolean).join(", ")
                    : order.placement || "—"}
                </p>
              </div>
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "18px", display: "grid", gap: "12px" }}>
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: "16px" }}>Size Breakdown</h3>
                  <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>Recorded quantities for the production team.</p>
                </div>
                {sizeBreakdownEntries.length ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))", gap: "10px" }}>
                    {sizeBreakdownEntries.map(([size, quantity]) => (
                      <div key={size} style={{ border: "1px solid #e2e8f0", borderRadius: "14px", padding: "12px", background: "#f8fafc" }}>
                        <p style={sectionLabelStyle}>{size}</p>
                        <p style={{ ...sectionValueStyle, fontSize: "18px" }}>{quantity}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: "#94a3b8" }}>No size breakdown recorded for this order yet.</p>
                )}
              </div>
            </section>
            <ProductionInstructionsPanel order={order} showInternalNotes={false} />
          </div>
        </div>
      ) : null}

      {activeWorkspace === "financial" ? (
        <div data-testid="order-workspace-financial" style={{ display: "grid", gap: "18px" }}>
          {isStaffWorkspace ? (
            <section style={cardStyle}>Financial workspace access is limited to owners.</section>
          ) : (
            <>
              <FinancialSummaryPanel
                order={normalizedOrder}
                onRecordPayment={handleRecordPayment}
                onMarkPickedUp={handleMarkPickedUp}
                onSendDepositRequest={handleSendDepositRequest}
              />
              {!normalizedOrder || normalizedOrder.balance_due <= 0 || isCanceledOperationalStatus(order.status) ? null : (
                <PaymentRequestForm
                  id="owner-payment-request-form"
                  title="Create Payment Request"
                  description="Create a staff-managed payment request tied to this order without changing the existing deposit workflow."
                  order={normalizedOrder}
                  defaultType={normalizedOrder.payment_collection_state === "Awaiting Deposit" ? "deposit" : "balance"}
                />
              )}
              <section style={cardStyle}>
                <details data-testid="quote-snapshot-disclosure">
                  <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: "18px", color: "#0f172a" }}>Quote Snapshot</summary>
                  <div style={{ marginTop: "16px" }}>
                    {quoteSnapshot ? (
                      <PricingSummary quote={quoteSnapshot} quantity={quoteSnapshot.quantity || order.qty || 0} compact />
                    ) : (
                      <p style={{ color: "#94a3b8" }}>Quote snapshot unavailable.</p>
                    )}
                  </div>
                </details>
              </section>
            </>
          )}
        </div>
      ) : null}

      {activeWorkspace === "details" ? (
        <div data-testid="order-workspace-details" style={{ display: "grid", gap: "18px" }}>
          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Order Reference</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
              <div><p style={sectionLabelStyle}>Placed</p><p style={sectionValueStyle}>{placedAt.date} at {placedAt.time}</p></div>
              <div><p style={sectionLabelStyle}>Last Updated</p><p style={sectionValueStyle}>{updatedAt.date} at {updatedAt.time}</p></div>
              <div><p style={sectionLabelStyle}>Source</p><p style={sectionValueStyle}>{order.source || "Operational intake"}</p></div>
              {showLegacyProduction ? (
                <div><p style={sectionLabelStyle}>Legacy Order Status</p><p style={sectionValueStyle}>{order.status || "—"}</p></div>
              ) : null}
            </div>
            <div style={{ borderTop: "1px solid #e2e8f0", marginTop: "18px", paddingTop: "18px" }}>
              <p style={sectionLabelStyle}>Internal Notes</p>
              <p style={{ ...sectionValueStyle, whiteSpace: "pre-wrap" }}>{order.internal_note || "No internal notes recorded."}</p>
            </div>
          </section>

          {canManageAssignments && !isCanceledOperationalStatus(order.status) ? (
            <div>
              <button
                type="button"
                onClick={handleCancelProductionOrder}
                style={{ border: "1px solid #fecaca", background: "#fff5f5", color: "#b91c1c", borderRadius: "12px", padding: "11px 14px", fontWeight: 700 }}
              >
                Cancel Production Order
              </button>
            </div>
          ) : null}

          <ActivityTimeline
            events={normalizedOrder?.connected_timeline || order.activity_log || []}
            compact
            collapsedByDefault
          />
        </div>
      ) : null}
    </div>
  );
}
