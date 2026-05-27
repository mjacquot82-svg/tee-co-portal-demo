import { isCanceledOperationalStatus } from "../orders/orderWorkflow";

function formatAssignedAt(value) {
  if (!value) return "Not assigned yet";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

export default function AssignmentPanel({
  order,
  staffUsers = [],
  onAssign,
  workflowActions = [],
  onRunWorkflowAction,
  canManageAssignments = true,
}) {
  const assignedWorker = order.assigned_to_staff_name || "Unassigned";
  const canceled = isCanceledOperationalStatus(order.status);

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
      <h2 style={{ marginTop: 0 }}>Assignment & Workflow</h2>

      <div style={{ display: "grid", gap: "12px" }}>
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
                  onClick={() => onRunWorkflowAction?.(action, order)}
                  style={{
                    background: action.targetStatus === "On Hold" ? "#fff1f2" : "#171717",
                    color: action.targetStatus === "On Hold" ? "#be123c" : "#ffffff",
                    border:
                      action.targetStatus === "On Hold"
                        ? "1px solid #fecdd3"
                        : "1px solid #171717",
                    borderRadius: "12px",
                    padding: "10px 14px",
                    fontWeight: 700,
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : (
            <span style={{ color: "#64748b", fontWeight: 700 }}>
              {canceled ? "Workflow actions disabled on canceled records." : "Final status reached"}
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
