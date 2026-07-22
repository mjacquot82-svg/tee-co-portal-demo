export default function AssignmentOnlyPanel({
  order,
  staffUsers = [],
  onAssign,
  canManageAssignments = true,
  canSelfAssign = false,
  onSelfAssign,
  canceled = false,
  compact = false,
  currentStaffUser = null,
}) {
  const assignedWorker = order.assigned_to_staff_name || "Unassigned";

  if (compact) {
    return (
      <div data-testid="production-header-assignment" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px", gridColumn: "1 / -1", borderTop: "1px solid #cbd5e1", paddingTop: "14px" }}>
        <div>
          <p style={{ margin: 0, color: "#64748b", fontSize: "11px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>Assigned Employee</p>
          <strong style={{ display: "block", marginTop: "5px", color: order.assigned_to_staff_id ? "#0f172a" : "#c2410c", fontSize: "17px" }}>{assignedWorker}</strong>
        </div>
        <div>
          <p style={{ margin: 0, color: "#64748b", fontSize: "11px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>Production Owner</p>
          <span style={{ display: "block", marginTop: "5px", color: "#64748b", fontWeight: 700 }}>{order.production_owner_staff_name || "Unassigned"}</span>
        </div>
        {canManageAssignments && !canceled ? (
          <div style={{ display: "flex", alignItems: "end", gap: "8px", flexWrap: "wrap" }}>
            {!order.assigned_to_staff_id && currentStaffUser?.id ? <button type="button" data-testid="assign-to-me-button" onClick={() => onAssign(currentStaffUser.id)} style={{ border: "1px solid #0f172a", background: "#0f172a", color: "#ffffff", borderRadius: "10px", padding: "9px 13px", fontWeight: 800 }}>Assign to Me</button> : null}
            <label style={{ display: "grid", gap: "5px", color: "#475569", fontSize: "12px", fontWeight: 800, minWidth: "190px" }}>
              Assign Employee
              <select data-testid="assignment-select" value={order.assigned_to_staff_id || ""} onChange={(event) => onAssign(event.target.value)} style={{ border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px", background: "#ffffff", fontWeight: 700 }}>
              <option value="">{order.assigned_to_staff_id ? "Clear assignment" : "Select employee…"}</option>
              {staffUsers.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}{staff.role ? ` (${staff.role})` : ""}</option>)}
              </select>
            </label>
          </div>
        ) : canSelfAssign && !canceled ? (
          <button type="button" data-testid="claim-job-button" onClick={onSelfAssign} style={{ alignSelf: "end", justifySelf: "start", border: "1px solid #171717", background: "#171717", color: "#ffffff", borderRadius: "10px", padding: "9px 13px", fontWeight: 800 }}>Claim Job</button>
        ) : null}
      </div>
    );
  }

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
