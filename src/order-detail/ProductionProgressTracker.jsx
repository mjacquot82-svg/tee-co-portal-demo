import {
  getOperationalProgressStageIndex,
  isOnHoldOperationalStatus,
  OPERATIONAL_STATUS_PROGRESS_STAGES,
} from "../orders/orderWorkflow";
import WorkflowBadge from "../components/WorkflowBadge";
import WorkflowProgressSteps from "../components/WorkflowProgressSteps";
import {
  buildProductionReadinessSummary,
  buildWorkflowBlockDetails,
  buildWorkflowStatusBadges,
} from "../orders/workflowPresentation";
import ProcessInstanceSummary from "./ProcessInstanceSummary";

export default function ProductionProgressTracker({ order, processProjection = null }) {
  const currentStage = Math.max(0, getOperationalProgressStageIndex(order.status));
  const isOnHold = isOnHoldOperationalStatus(order.status);
  const gating = buildWorkflowBlockDetails(order, { targetStatus: "Ready For Production" });
  const workflowBadges = buildWorkflowStatusBadges(order);
  const readiness = buildProductionReadinessSummary(order);

  return (
    <section
      data-testid="production-progress-tracker"
      data-workflow-state={order.status || ""}
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "20px",
        padding: "18px",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Production Workflow</h2>

      <ProcessInstanceSummary projection={processProjection} />

      <div style={{ marginBottom: "12px" }}>
        <WorkflowProgressSteps order={order} />
      </div>

      {workflowBadges.length ? (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
          {workflowBadges.map((badge) => (
            <WorkflowBadge key={badge.label} label={badge.label} tone={badge.tone} />
          ))}
        </div>
      ) : null}

      <div
        data-testid="production-readiness-indicator"
        data-production-readiness={readiness.statusKey || ""}
        style={{
          marginBottom: "12px",
          borderRadius: "14px",
          border: readiness.blocked ? "1px solid #fecaca" : "1px solid #bfdbfe",
          background: readiness.blocked ? "#fff5f5" : "#eff6ff",
          color: readiness.blocked ? "#991b1b" : "#1d4ed8",
          padding: "12px 14px",
          display: "grid",
          gap: "4px",
          lineHeight: 1.45,
        }}
      >
        <strong>Production Readiness: {readiness.label}</strong>
        <span style={{ fontWeight: 700 }}>{readiness.detail}</span>
        <span style={{ fontSize: "13px", fontWeight: 700 }}>
          Next recommended action: {readiness.nextRecommendedAction}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "10px",
        }}
      >
        {OPERATIONAL_STATUS_PROGRESS_STAGES.map((stage, index) => {
          const complete = index < currentStage;
          const active = index === currentStage;

          return (
            <div
              key={stage}
              data-testid="production-progress-stage"
              data-stage={stage}
              data-stage-state={active ? "active" : complete ? "complete" : "pending"}
              style={{
                border: active
                  ? isOnHold
                    ? "1px solid #b91c1c"
                    : "1px solid #171717"
                  : complete
                  ? "1px solid #86efac"
                  : "1px solid #e2e8f0",
                background: active
                  ? isOnHold
                    ? "#b91c1c"
                    : "#171717"
                  : complete
                  ? "#ecfdf5"
                  : "#f8fafc",
                color: active
                  ? "#ffffff"
                  : complete
                  ? "#166534"
                  : "#64748b",
                borderRadius: "14px",
                padding: "12px",
                textAlign: "center",
                fontWeight: 800,
              }}
            >
              {stage}
            </div>
          );
        })}
      </div>

      {isOnHold ? (
        <div
          data-testid="production-hold-indicator"
          style={{
            marginTop: "12px",
            borderRadius: "14px",
            border: "1px solid #fecaca",
            background: "#fef2f2",
            padding: "12px 14px",
            color: "#991b1b",
            fontWeight: 700,
            display: "grid",
            gap: "4px",
          }}
        >
          <span>This order is currently on hold. Resume it from the workflow actions when production can continue.</span>
          {order.production_hold_reason ? (
            <span data-testid="production-hold-reason" style={{ fontSize: "13px" }}>
              Reason: {order.production_hold_reason}
              {order.production_hold_staff_name ? ` — ${order.production_hold_staff_name}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      {gating.blocked ? (
        <div
          style={{
            marginTop: "12px",
            borderRadius: "14px",
            border: "1px solid #fdba74",
            background: "#fff7ed",
            padding: "12px 14px",
            color: "#9a3412",
            display: "grid",
            gap: "4px",
          }}
        >
          <strong>{gating.summary}</strong>
          <span style={{ fontWeight: 700 }}>{gating.detail}</span>
          {(gating.blockers || []).map((blocker) => (
            <span key={blocker.key} style={{ fontSize: "13px", fontWeight: 700 }}>
              Required action: {blocker.requiredAction} Responsible: {blocker.responsibleParty}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
