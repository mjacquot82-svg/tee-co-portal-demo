function SummaryList({ items, emptyLabel }) {
  if (!items.length) {
    return <p style={{ margin: 0, color: "#64748b" }}>{emptyLabel}</p>;
  }

  return (
    <ul style={{ margin: 0, paddingLeft: "20px", color: "#334155", lineHeight: 1.6 }}>
      {items.map((item) => <li key={item.id || item.key || item.label}>{item.name || item.label}</li>)}
    </ul>
  );
}

export default function ProcessInstanceSummary({ projection }) {
  if (!projection) return null;

  const detailStyle = {
    border: "1px solid #dbeafe",
    borderRadius: "12px",
    padding: "12px",
    background: "#ffffff",
  };
  const labelStyle = {
    margin: 0,
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };
  const valueStyle = { margin: "4px 0 0", color: "#0f172a", fontWeight: 800 };

  return (
    <div
      data-testid="process-instance-summary"
      style={{
        marginBottom: "12px",
        padding: "14px",
        border: "1px solid #bfdbfe",
        borderRadius: "14px",
        background: "#eff6ff",
        display: "grid",
        gap: "12px",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
        <div style={detailStyle}>
          <p style={labelStyle}>Process</p>
          <p style={valueStyle}>{projection.processName}</p>
        </div>
        <div style={detailStyle}>
          <p style={labelStyle}>Template Version</p>
          <p style={valueStyle}>Version {projection.templateVersion}</p>
        </div>
        <div style={detailStyle}>
          <p style={labelStyle}>Process State</p>
          <p style={valueStyle}>{projection.processState}</p>
        </div>
        <div style={detailStyle}>
          <p style={labelStyle}>Current Task</p>
          <p style={valueStyle}>{projection.primaryCurrentTask?.name || "No current task"}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
        <div style={detailStyle}>
          <p style={{ ...labelStyle, marginBottom: "6px" }}>Available Tasks</p>
          <SummaryList items={projection.availableTasks} emptyLabel="No tasks available" />
        </div>
        <div style={detailStyle}>
          <p style={{ ...labelStyle, marginBottom: "6px" }}>Blocked Tasks</p>
          <SummaryList items={projection.blockedTasks} emptyLabel="No blocked tasks" />
        </div>
        <div style={detailStyle}>
          <p style={{ ...labelStyle, marginBottom: "6px" }}>History</p>
          <SummaryList items={projection.historySummary} emptyLabel="No process history" />
        </div>
      </div>
    </div>
  );
}
