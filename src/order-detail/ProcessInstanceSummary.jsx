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

export default function ProcessInstanceSummary({ projection, availabilityReasons = [] }) {
  if (!projection) return null;

  const currentTask = projection.primaryCurrentTask;
  const upcomingTasks = projection.blockedTasks || [];
  const remainingTasks = [
    ...(currentTask ? [currentTask] : []),
    ...(projection.availableTasks || []),
    ...upcomingTasks,
  ].filter((task, index, tasks) => tasks.findIndex((candidate) => candidate.id === task.id) === index);
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
          <p style={labelStyle}>Process Engine</p>
          <h2 style={{ margin: "5px 0 0", color: "#0f172a" }}>{projection.processName}</h2>
        </div>
        <span style={{ borderRadius: "999px", padding: "7px 11px", background: "#ecfdf5", color: "#166534", fontWeight: 800 }}>
          Process Status: {projection.processState}
        </span>
      </div>

      <section data-testid="process-current-task" style={{ ...cardStyle, border: "2px solid #2563eb", boxShadow: "0 8px 24px rgba(37, 99, 235, 0.10)" }}>
        <p style={{ ...labelStyle, color: "#1d4ed8" }}>What should Teresa do next?</p>
        <div style={{ marginTop: "10px" }}>
          <div>
            <p style={{ ...labelStyle, marginBottom: "6px" }}>Current Task</p>
            <h3 style={{ margin: 0, color: "#0f172a", fontSize: "28px" }}>
              {currentTask?.name || "No current task"}
            </h3>
            <p style={{ margin: "8px 0 0", color: "#475569", fontWeight: 700 }}>
              Task State: {currentTask?.state || "Unavailable"}
            </p>
            <div style={{ marginTop: "14px" }}>
              <p style={{ ...labelStyle, marginBottom: "6px" }}>Why this task is available</p>
              {availabilityReasons.length ? (
                <ul style={{ margin: 0, paddingLeft: "20px", color: "#334155", lineHeight: 1.6 }}>
                  {availabilityReasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              ) : (
                <p style={{ margin: 0, color: "#334155" }}>{currentTask?.reason || "No production task is currently available."}</p>
              )}
            </div>
            {currentTask?.state === "Blocked" ? (
              <div style={{ marginTop: "14px" }}>
                <p style={{ ...labelStyle, marginBottom: "6px" }}>Blocked Reason</p>
                <p style={{ margin: 0, color: "#991b1b", fontWeight: 700 }}>{currentTask.reason}</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "12px" }}>
        <section style={cardStyle}>
          <p style={{ ...labelStyle, marginBottom: "9px" }}>Upcoming Tasks</p>
          <TaskList items={upcomingTasks} emptyLabel="No upcoming tasks" />
        </section>
        <section style={cardStyle}>
          <p style={{ ...labelStyle, marginBottom: "9px" }}>Remaining Tasks</p>
          <TaskList items={remainingTasks} emptyLabel="No remaining tasks" />
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
