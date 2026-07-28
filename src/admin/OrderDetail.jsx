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
import { printProductionSheet } from "../lib/printProductionSheet";
import PricingSummary from "../components/PricingSummary";
import StatusBadge from "../components/StatusBadge";
import AssignmentOnlyPanel from "../order-detail/AssignmentOnlyPanel";
import ProductionActionPanel from "../order-detail/ProductionActionPanel";
import ProcessCurrentActionPanel from "../order-detail/ProcessCurrentActionPanel";
import ProductionInstructionsPanel from "../order-detail/ProductionInstructionsPanel";
import GarmentProductionCards from "../order-detail/GarmentProductionCards";
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
import { isAdminWorkspaceView, isStaffWorkspaceView, canSelfAssignOrder } from "./adminRoleView";
import { markAssignmentAttentionSeen } from "../lib/staffAssignmentAttentionStore";
import {
  buildProductionReadinessSummary,
  buildWorkflowBlockDetails,
} from "../orders/workflowPresentation";
import {
  buildDepositRequestContent,
  createAndSendDepositPaymentRequestForOrder,
} from "../orders/depositRequests";
import PaymentRequestForm from "./PaymentRequestForm";
import {
  buildDepositRequestConfirmation,
  buildWorkflowActionConfirmation,
} from "./workflowCopy";
import { ensureTeeCoProductionProcess } from "../integrations/teeCoProductionProcess";
import { buildProcessInstanceProjection } from "../process-engine/processProjection";
import OrderManagementWorkspace from "../order-detail/OrderManagementWorkspace";
import ProductionWorkspaceConsole from "../order-detail/ProductionWorkspaceConsole";

const cardStyle = {
  background: "#ffffff",
  borderRadius: "20px",
  padding: "24px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function OrderDetail() {
  const { orderNumber } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const storedOrders = useStoredOrders();
  const storedProducts = useStoredProducts();
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
  const activeWorkspace =
    requestedWorkspace === "details"
      ? "order-management"
      : ["financial", "order-management"].includes(requestedWorkspace)
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
  }, [order, quoteSnapshot]);

  useEffect(() => {
    if (
      activeWorkspace !== "financial" ||
      window.location.hash !== "#owner-payment-request-form" ||
      !normalizedOrder
    ) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      document
        .getElementById("owner-payment-request-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeWorkspace, normalizedOrder]);
  const productionReadiness = useMemo(
    () => (order ? buildProductionReadinessSummary(order) : null),
    [order]
  );
  const workflowActions = useMemo(
    () => (order && showLegacyProduction ? getAvailableProductionActions(order) : []),
    [order, showLegacyProduction]
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
    await saveOrderUpdates(updates);
    setWorkflowFeedback({
      tone: "success",
      ...buildWorkflowActionConfirmation(order, enrichedAction),
      nextActionLabel: "",
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
  const printOrder = normalizedOrder || order;
  const assignmentPanel = (
    <AssignmentOnlyPanel
      order={order}
      staffUsers={staffUsers}
      onAssign={handleAssign}
      canManageAssignments={canManageAssignments}
      canSelfAssign={selfAssignAllowed}
      onSelfAssign={handleSelfAssign}
      canceled={isCanceledOperationalStatus(order.status)}
      compact
      currentStaffUser={activeStaffUser}
    />
  );

  function selectWorkspace(workspace) {
    const nextParams = new URLSearchParams(searchParams);
    if (workspace === "production") nextParams.delete("workspace");
    else nextParams.set("workspace", workspace);
    setSearchParams(nextParams, { replace: true });
  }

  const workspaceNavigation = (
    <nav
      role="tablist"
      data-testid="order-workspace-tabs"
      aria-label="Secondary order reference"
      style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "18px", marginBottom: "18px", borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}
    >
      {[
        { key: "production", label: "Production" },
        { key: "financial", label: "Financial" },
        { key: "order-management", label: "Order Management" },
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
              borderRadius: "10px",
              padding: "8px 12px",
              fontWeight: 800,
            }}
          >
            {workspace.label}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div
      className="order-detail-page"
      data-testid="order-detail-page"
      data-order-number={order.order_number || orderNumber}
      data-workflow-state={showLegacyProduction ? order.status || "" : ""}
      style={{ width: "100%", boxSizing: "border-box", margin: "0 auto", padding: "14px 18px 24px" }}
    >
      <div
        data-testid="production-job-identity"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "10px",
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
            Current Job
          </p>

          <h1 style={{ margin: "3px 0", fontSize: "30px", letterSpacing: "-0.02em" }}>
            Order {order.order_number || orderNumber}
          </h1>

          <div data-testid="production-job-header" className="order-detail-title-meta">
            <div data-testid="order-detail-current-status" data-workflow-state={order.status || ""}>
              <StatusBadge status={order.status} />
            </div>
            <span>Needed {order.due_date || "—"}</span>
            <span style={{ color: urgency.color }}>{urgency.label}</span>
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

      {workspaceNavigation}

      {activeWorkspace === "production" ? (
        <div data-testid="order-workspace-production">
          <ProductionWorkspaceConsole
            order={order}
            normalizedOrder={normalizedOrder}
            readiness={productionReadiness}
            placedAt={placedAt}
            assignment={
              <div data-testid="production-assignment">
                {assignmentPanel}
              </div>
            }
            action={
              <div id="production-handoff" className="order-detail-action-panel" style={{ scrollMarginTop: "16px" }}>
            {hasProcessAuthority ? (
              <ProcessCurrentActionPanel projection={processProjection} onPrint={handlePrintTicket} />
            ) : showLegacyProduction ? (
              <ProductionActionPanel order={order} actions={workflowActions} onRunAction={handleWorkflowAction} feedback={workflowFeedback} onPrint={handlePrintTicket} />
            ) : (
              <section
                data-testid="production-authority-loading"
                className="order-detail-compact-panel"
                style={{ color: "#64748b", fontWeight: 700 }}
              >
                Resolving production authority…
              </section>
            )}
              </div>
            }
            garments={<GarmentProductionCards order={order} />}
            notes={<ProductionInstructionsPanel order={order} showInternalNotes={false} />}
          />
        </div>
      ) : null}

      {activeWorkspace === "financial" ? (
        <div data-testid="order-workspace-financial" data-reference-role="secondary" style={{ display: "grid", gap: "18px" }}>
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

      {activeWorkspace === "order-management" ? (
        <OrderManagementWorkspace
          order={order}
          normalizedOrder={normalizedOrder}
          readiness={productionReadiness}
          placedAt={placedAt}
          updatedAt={updatedAt}
          canCancelOrder={canManageAssignments && !isCanceledOperationalStatus(order.status)}
          onCancelOrder={handleCancelProductionOrder}
          onOpenFinancial={() => selectWorkspace("financial")}
        />
      ) : null}
    </div>
  );
}
