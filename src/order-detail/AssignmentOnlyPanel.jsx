export default function AssignmentOnlyPanel({
  order,
  staffUsers = [],
  onAssign,
  canManageAssignments = true,
  canSelfAssign = false,
  onSelfAssign,
  canceled = false,
}) {
  const assignedWorker = order.assigned_to_staff_name || "Unassigned";

  return (
    <section
      data-testid="order-assignment-panel"
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "20px",
        padding: "20px",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Production Assignment</h2>
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
                border: order.assigned_to_staff_id ? "1px solid #bbf7d0" : "1px solid #fdba74",
              }}
            >
              {assignedWorker}
            </span>
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
                border: order.production_owner_staff_id ? "1px solid #bfdbfe" : "1px solid #e2e8f0",
              }}
            >
              {order.production_owner_staff_name || "Unassigned"}
            </span>
          </div>
        </div>

        {canManageAssignments && !canceled ? (
          <label style={{ display: "grid", gap: "6px" }}>
            Assign, Reassign, or Clear
            <select
              data-testid="assignment-select"
              value={order.assigned_to_staff_id || ""}
              onChange={(event) => onAssign(event.target.value)}
              style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "10px" }}
            >
              <option value="">Unassigned</option>
              {staffUsers.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}{staff.role ? ` (${staff.role})` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : canSelfAssign && !canceled ? (
          <button
            type="button"
            data-testid="claim-job-button"
            onClick={onSelfAssign}
            style={{
              justifySelf: "start",
              border: "1px solid #171717",
              background: "#171717",
              color: "#ffffff",
              borderRadius: "12px",
              padding: "10px 14px",
              fontWeight: 700,
            }}
          >
            Claim This Job
          </button>
        ) : null}
      </div>
    </section>
  );
}
