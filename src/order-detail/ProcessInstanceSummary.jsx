function TaskList({ items, emptyLabel, showReason = false }) {
  if (!items.length) {
    return <p style={{ margin: 0, color: "#64748b" }}>{emptyLabel}</p>;
  }

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      {items.map((item) => (
        <div key={item.id || item.key} style={{ display: "grid", gap: "2px" }}>
          <strong style={{ color: "#0f172a" }}>{item.name}</strong>
          {showReason && item.reason ? (
            <span style={{ color: "#64748b", fontSize: "13px" }}>{item.reason}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function HistoryList({ items }) {
  if (!items.length) {
    return <p style={{ margin: 0, color: "#64748b" }}>No process history</p>;
  }

  return (
    <ul style={{ margin: 0, paddingLeft: "20px", color: "#334155", lineHeight: 1.7 }}>
      {items.map((item) => <li key={item.id || item.label}>{item.label}</li>)}
    </ul>
  );
}

export default function ProcessInstanceSummary({ projection }) {
  if (!projection) return null;

  const currentTask = projection.primaryCurrentTask;
  const primaryActionVerb = currentTask?.state === "In Progress" ? "Complete" : "Start";
  const completed = projection.progress?.completed || 0;
  const total = projection.progress?.total || 0;
  const progressPercentage = total ? Math.round((completed / total) * 100) : 0;
  const cardStyle = {
    border: "1px solid #dbeafe",
    borderRadius: "14px",
    padding: "14px",
    background: "#ffffff",
  };
  const labelStyle = {
    margin: 0,
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
  };

  return (
    <div
      data-testid="process-instance-summary"
      style={{
        marginBottom: "16px",
        padding: "20px",
        border: "1px solid #93c5fd",
        borderRadius: "18px",
        background: "linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)",
        display: "grid",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <p style={labelStyle}>JDS Process Engine</p>
          <h2 style={{ margin: "5px 0 0", color: "#0f172a" }}>{projection.processName}</h2>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ borderRadius: "999px", padding: "7px 11px", background: "#dbeafe", color: "#1d4ed8", fontWeight: 800 }}>
            Template Version {projection.templateVersion}
          </span>
          <span style={{ borderRadius: "999px", padding: "7px 11px", background: "#ecfdf5", color: "#166534", fontWeight: 800 }}>
            Process State: {projection.processState}
          </span>
        </div>
      </div>

      <section data-testid="process-current-task" style={{ ...cardStyle, border: "2px solid #2563eb", boxShadow: "0 8px 24px rgba(37, 99, 235, 0.10)" }}>
        <p style={{ ...labelStyle, color: "#1d4ed8" }}>What should I do right now?</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "18px", alignItems: "center", marginTop: "10px" }}>
          <div style={{ flex: "1 1 320px" }}>
            <p style={{ ...labelStyle, marginBottom: "6px" }}>Current Task</p>
            <h3 style={{ margin: 0, color: "#0f172a", fontSize: "28px" }}>
              {currentTask?.name || "No current task"}
            </h3>
            <p style={{ margin: "8px 0 0", color: "#475569", fontWeight: 700 }}>
              Task Status: {currentTask?.state || "Unavailable"}
            </p>
            <p style={{ margin: "8px 0 0", color: "#334155", lineHeight: 1.5 }}>
              {currentTask?.reason || "No production task is currently available."}
            </p>
          </div>
          <div style={{ display: "grid", gap: "6px", minWidth: "180px", flex: "0 1 240px" }}>
            <p style={labelStyle}>Primary Action</p>
            <button
              type="button"
              disabled
              title="Task execution is not enabled in this read-only workspace."
              style={{
                border: "1px solid #94a3b8",
                borderRadius: "12px",
                padding: "12px 16px",
                background: "#e2e8f0",
                color: "#475569",
                fontWeight: 900,
                cursor: "not-allowed",
              }}
            >
              {currentTask ? `${primaryActionVerb} ${currentTask.name}` : "No action available"}
            </button>
            <span style={{ color: "#64748b", fontSize: "12px" }}>Read-only process validation</span>
          </div>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "12px" }}>
        <section style={cardStyle}>
          <p style={{ ...labelStyle, marginBottom: "9px" }}>Available Tasks</p>
          <TaskList items={projection.availableTasks} emptyLabel="No tasks available" />
        </section>
        <section style={cardStyle}>
          <p style={{ ...labelStyle, marginBottom: "9px" }}>What comes next?</p>
          <TaskList items={projection.upcomingTasks || []} emptyLabel="No upcoming task" showReason />
        </section>
        <section style={cardStyle}>
          <p style={{ ...labelStyle, marginBottom: "9px" }}>Blocked Tasks</p>
          <TaskList items={projection.blockedTasks} emptyLabel="No blocked tasks" showReason />
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "12px" }}>
        <section style={cardStyle}>
          <p style={{ ...labelStyle, marginBottom: "9px" }}>Progress</p>
          <strong style={{ display: "block", color: "#0f172a", marginBottom: "8px" }}>{completed} of {total} tasks complete</strong>
          <div style={{ height: "9px", borderRadius: "999px", background: "#e2e8f0", overflow: "hidden" }}>
            <div style={{ width: `${progressPercentage}%`, height: "100%", background: "#2563eb" }} />
          </div>
          <div style={{ marginTop: "12px" }}>
            <p style={{ ...labelStyle, marginBottom: "9px" }}>Completed Tasks</p>
            <TaskList items={projection.completedTasks || []} emptyLabel="No tasks completed yet" />
          </div>
        </section>
        <section style={cardStyle}>
          <p style={{ ...labelStyle, marginBottom: "9px" }}>Process History</p>
          <HistoryList items={projection.historySummary} />
        </section>
      </div>
    </div>
  );
}
