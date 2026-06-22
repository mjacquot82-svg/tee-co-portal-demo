import { isCanceledOperationalStatus } from "../orders/orderWorkflow";
import WorkflowBadge from "../components/WorkflowBadge";
import {
  buildWorkflowBlockDetails,
  buildCustomerWorkflowMessage,
  buildWorkflowStatusBadges,
  formatOverrideMeta,
} from "../orders/workflowPresentation";

function formatAssignedAt(value) {
  if (!value) return "Not assigned yet";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function QuickActionButton({
  actionKey = "",
  label,
  onClick,
  tone = "neutral",
  disabled = false,
}) {
  const tones = {
    neutral: { background: "#ffffff", border: "#cbd5e1", color: "#0f172a" },
    success: { background: "#ecfdf5", border: "#bbf7d0", color: "#166534" },
    warning: { background: "#fff7ed", border: "#fdba74", color: "#9a3412" },
    dark: { background: "#0f172a", border: "#0f172a", color: "#ffffff" },
  };
  const palette = tones[tone] || tones.neutral;

  return (
    <button
      type="button"
      data-testid="workflow-quick-action"
      data-action-key={actionKey}
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        borderRadius: "999px",
        padding: "8px 11px",
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}

export default function AssignmentPanel({
  order,
  staffUsers = [],
  onAssign,
  workflowActions = [],
  onRunWorkflowAction,
  canManageAssignments = true,
  productionGating = null,
  onArtworkApprovalChange,
  onDepositWorkflowChange,
  onGatingOverride,
  onForceMoveToProduction,
  workflowFeedback = null,
}) {
  const assignedWorker = order.assigned_to_staff_name || "Unassigned";
  const canceled = isCanceledOperationalStatus(order.status);
  const activeOverrides = Array.isArray(productionGating?.activeOverrides)
    ? productionGating.activeOverrides
    : [];
  const workflowBadges = buildWorkflowStatusBadges(order);
  const blockDetails = buildWorkflowBlockDetails(order, { targetStatus: "Ready For Production" });
  const customerWorkflowMessage = buildCustomerWorkflowMessage(order);

  return (
    <section
      data-testid="order-assignment-panel"
      data-workflow-state={order.status || ""}
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "20px",
        padding: "20px",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Assign Work</h2>

      <div style={{ display: "grid", gap: "12px" }}>
        {workflowBadges.length ? (
          <div data-testid="workflow-badges" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {workflowBadges.map((badge) => (
              <span
                key={badge.label}
                data-testid="workflow-badge"
                data-badge-label={badge.label}
                data-badge-tone={badge.tone}
              >
                <WorkflowBadge label={badge.label} tone={badge.tone} />
              </span>
            ))}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: "6px" }}>
          <strong>Customer Status Message</strong>
          <span data-testid="customer-workflow-message" style={{ color: "#475569", fontWeight: 700 }}>
            {customerWorkflowMessage}
          </span>
        </div>

        <div>
          <strong>Assigned Staff</strong>
          <div style={{ marginTop: "8px" }}>
            <span
              data-testid="assigned-staff-value"
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: "999px",
                padding: "7px 11px",
                fontWeight: 800,
                background: order.assigned_to_staff_id ? "#ecfdf5" : "#fff7ed",
                color: order.assigned_to_staff_id ? "#166534" : "#c2410c",
                border: order.assigned_to_staff_id
                  ? "1px solid #bbf7d0"
                  : "1px solid #fdba74",
              }}
            >
              {assignedWorker}
            </span>
          </div>
        </div>

        <div>
          <strong>Assigned At</strong>
          <div style={{ marginTop: "6px" }}>
            {formatAssignedAt(order.assigned_at)}
          </div>
        </div>

        <div>
          <strong>Production Owner</strong>
          <div style={{ marginTop: "8px" }}>
            <span
              data-testid="production-owner-value"
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: "999px",
                padding: "7px 11px",
                fontWeight: 800,
                background: order.production_owner_staff_id ? "#eff6ff" : "#f8fafc",
                color: order.production_owner_staff_id ? "#1d4ed8" : "#64748b",
                border: order.production_owner_staff_id
                  ? "1px solid #bfdbfe"
                  : "1px solid #e2e8f0",
              }}
            >
              {order.production_owner_staff_name || "Unassigned"}
            </span>
          </div>
        </div>

        {canManageAssignments && !canceled ? (
          <label style={{ display: "grid", gap: "6px" }}>
            Assign or Reassign
            <select
              data-testid="assignment-select"
              value={order.assigned_to_staff_id || ""}
              onChange={(event) => onAssign(event.target.value)}
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                padding: "10px",
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
          </label>
        ) : canceled ? (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "14px",
              background: "#fff5f5",
              border: "1px solid #fecaca",
              color: "#7f1d1d",
              fontWeight: 700,
            }}
          >
            Assignment changes are disabled on canceled records.
          </div>
        ) : (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "14px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              color: "#475569",
              fontWeight: 700,
            }}
          >
            Assignment changes are hidden in the staff workspace. Use this panel to track status movement for the job.
          </div>
        )}

        <div
          style={{
            display: "grid",
            gap: "12px",
            padding: "12px 14px",
            borderRadius: "14px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ display: "grid", gap: "10px" }}>
            <div>
              <strong>Requirements</strong>
              <div style={{ marginTop: "8px", display: "grid", gap: "8px" }}>
                {(productionGating?.checks || []).map((check) => (
                  <div
                    key={check.key}
                    data-testid="workflow-gate"
                    data-gate-key={check.key}
                    data-required={check.required ? "true" : "false"}
                    data-satisfied={check.satisfied ? "true" : "false"}
                    data-overridden={check.overridden ? "true" : "false"}
                    data-status-label={check.statusLabel}
                    style={{
                      borderRadius: "12px",
                      border: check.satisfied ? "1px solid #bbf7d0" : "1px solid #fed7aa",
                      background: check.satisfied ? "#ecfdf5" : "#fff7ed",
                      padding: "10px 12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "10px",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <strong>{check.label}</strong>
                      <span
                        data-testid="workflow-gate-status"
                        style={{ color: check.satisfied ? "#166534" : "#9a3412", fontWeight: 800 }}
                      >
                        {check.statusLabel}
                      </span>
                    </div>
                    {check.overridden ? (
                      <div
                        data-testid="workflow-gate-override-indicator"
                        style={{ marginTop: "4px", color: "#1d4ed8", fontSize: "12px", fontWeight: 700 }}
                      >
                        Override active
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "grid", gap: "6px" }}>
                <strong style={{ fontSize: "13px" }}>Artwork Review</strong>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <QuickActionButton
                    actionKey="approve_artwork"
                    label="Approve Artwork"
                    tone="success"
                    disabled={canceled}
                    onClick={() => onArtworkApprovalChange?.("Approved")}
                  />
                  <QuickActionButton
                    actionKey="request_revision"
                    label="Request Revision"
                    tone="warning"
                    disabled={canceled}
                    onClick={() => onArtworkApprovalChange?.("Needs Revision")}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gap: "6px" }}>
                <strong style={{ fontSize: "13px" }}>Deposit Review</strong>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <QuickActionButton
                    actionKey="request_deposit"
                    label="Request Deposit"
                    tone="warning"
                    disabled={canceled}
                    onClick={() => onDepositWorkflowChange?.("Deposit Requested")}
                  />
                  <QuickActionButton
                    actionKey="mark_deposit_received"
                    label="Mark Deposit Received"
                    tone="success"
                    disabled={canceled}
                    onClick={() => onDepositWorkflowChange?.("Deposit Received")}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
              <label style={{ display: "grid", gap: "6px", fontSize: "13px", fontWeight: 700 }}>
                Artwork Approval
                <select
                  data-testid="artwork-approval-select"
                  value={order.artwork_approval_status || "Pending Review"}
                  onChange={(event) => onArtworkApprovalChange?.(event.target.value)}
                  disabled={canceled}
                  style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "10px" }}
                >
                  <option value="Pending Review">Pending Review</option>
                  <option value="Approved">Approved</option>
                  <option value="Not Required">Not Required</option>
                  <option value="Needs Revision">Needs Revision</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: "6px", fontSize: "13px", fontWeight: 700 }}>
                Deposit Status
                <select
                  data-testid="deposit-workflow-select"
                  value={order.deposit_workflow_status || "Awaiting Deposit"}
                  onChange={(event) => onDepositWorkflowChange?.(event.target.value)}
                  disabled={canceled}
                  style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "10px" }}
                >
                  <option value="Deposit Not Required">Deposit Not Required</option>
                  <option value="Deposit Requested">Deposit Requested</option>
                  <option value="Awaiting Deposit">Awaiting Deposit</option>
                  <option value="Deposit Received">Deposit Received</option>
                </select>
              </label>
            </div>
            </div>

            {blockDetails.blocked ? (
              <div
                data-testid="production-gating-alert"
                style={{
                  borderRadius: "12px",
                  border: "1px solid #fecaca",
                  background: "#fff5f5",
                  padding: "12px 14px",
                  color: "#991b1b",
                  lineHeight: 1.5,
                  display: "grid",
                  gap: "4px",
                }}
              >
                <strong>{blockDetails.summary}</strong>
                <span style={{ fontWeight: 700 }}>{blockDetails.detail}</span>
                <span style={{ fontSize: "13px" }}>Next action: {blockDetails.nextActionLabel}</span>
              </div>
            ) : null}

            {workflowFeedback ? (
              <div
                style={{
                  borderRadius: "12px",
                  border:
                    workflowFeedback.tone === "danger"
                      ? "1px solid #fecaca"
                      : "1px solid #bfdbfe",
                  background:
                    workflowFeedback.tone === "danger" ? "#fff5f5" : "#eff6ff",
                  padding: "12px 14px",
                  color: workflowFeedback.tone === "danger" ? "#991b1b" : "#1d4ed8",
                  lineHeight: 1.5,
                  display: "grid",
                  gap: "4px",
                }}
              >
                <strong>{workflowFeedback.summary}</strong>
                {workflowFeedback.detail ? <span>{workflowFeedback.detail}</span> : null}
                {workflowFeedback.nextActionLabel ? (
                  <span style={{ fontSize: "13px" }}>
                    Next action: {workflowFeedback.nextActionLabel}
                  </span>
                ) : null}
              </div>
            ) : null}

            {activeOverrides.length ? (
              <div style={{ display: "grid", gap: "6px" }}>
                <strong>Active Overrides</strong>
                {activeOverrides.map((override) => (
                  <div
                    key={override.key}
                    data-testid="workflow-active-override"
                    data-override-key={override.key}
                    style={{
                      borderRadius: "12px",
                      border: "1px solid #bfdbfe",
                      background: "#eff6ff",
                      padding: "10px 12px",
                      color: "#1d4ed8",
                      fontWeight: 700,
                    }}
                  >
                    {formatOverrideMeta(override)}
                  </div>
                ))}
              </div>
            ) : null}

            {canManageAssignments && !canceled ? (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {blockDetails.blocked ? (
                  <QuickActionButton
                    actionKey="force_move_to_production"
                    label="Override and Continue"
                    tone="dark"
                    onClick={onForceMoveToProduction}
                  />
                ) : null}
                <button
                  type="button"
                  data-testid="workflow-override-button"
                  data-override-key="artworkApprovalRequirement"
                  onClick={() => onGatingOverride?.("artworkApprovalRequirement")}
                  style={{
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    borderRadius: "12px",
                    padding: "10px 14px",
                    fontWeight: 700,
                  }}
                >
                  Override Artwork Approval
                </button>
                <button
                  type="button"
                  data-testid="workflow-override-button"
                  data-override-key="depositRequirement"
                  onClick={() => onGatingOverride?.("depositRequirement")}
                  style={{
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    borderRadius: "12px",
                    padding: "10px 14px",
                    fontWeight: 700,
                  }}
                >
                  Override Deposit Requirement
                </button>
              </div>
            ) : null}
          </div>

          <div>
            <strong>Current Status</strong>
            <div style={{ marginTop: "4px", color: "#475569" }}>{order.status}</div>
          </div>

          {!canceled && workflowActions.length ? (
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {workflowActions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  data-testid="workflow-action-button"
                  data-action-key={action.key}
                  data-target-status={action.targetStatus || ""}
                  data-blocked={action.blocked ? "true" : "false"}
                  onClick={() => onRunWorkflowAction?.(action, order)}
                  style={{
                    background: action.blocked
                      ? "#fff7ed"
                      : action.targetStatus === "On Hold"
                      ? "#fff1f2"
                      : "#171717",
                    color: action.blocked
                      ? "#9a3412"
                      : action.targetStatus === "On Hold"
                      ? "#be123c"
                      : "#ffffff",
                    border:
                      action.blocked
                        ? "1px solid #fdba74"
                        : action.targetStatus === "On Hold"
                        ? "1px solid #fecdd3"
                        : "1px solid #171717",
                    borderRadius: "12px",
                    padding: "10px 14px",
                    fontWeight: 700,
                  }}
                  title={action.blocked ? action.blockedReasons.join(" ") : ""}
                >
                  {action.label}
                  {action.blocked ? " Blocked" : ""}
                </button>
              ))}
            </div>
          ) : (
            <span style={{ color: "#64748b", fontWeight: 700 }}>
              {canceled ? "Actions disabled on canceled records." : "Final status reached"}
            </span>
          )}
        </div>

        {canManageAssignments && !canceled ? (
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => onAssign("")}
              disabled={!order.assigned_to_staff_id}
              style={{
                border: "1px solid #cbd5e1",
                background: order.assigned_to_staff_id ? "#ffffff" : "#f8fafc",
                color: order.assigned_to_staff_id ? "#171717" : "#94a3b8",
                borderRadius: "12px",
                padding: "10px 14px",
                fontWeight: 700,
              }}
            >
              Clear Assignment
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
