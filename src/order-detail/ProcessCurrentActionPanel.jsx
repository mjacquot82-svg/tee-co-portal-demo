export default function ProcessCurrentActionPanel({ projection, onPrint }) {
  const task = projection?.primaryCurrentTask;
  const taskLabel = /^start (printing|embroidery)$/i.test(task?.name || "") ? "Start Production" : task?.name;
  return (
    <section data-testid="production-current-action" className="production-console-action-banner">
      <div className="production-console-action-copy">
        <span>What to do next</span>
        <strong>{taskLabel || "No current production task"}</strong>
        <p>{task?.reason || "The Process Engine has not exposed an available task."}</p>
      </div>
      <div className="production-console-action-buttons">
        <span style={{ borderRadius: "999px", background: "#334155", padding: "8px 11px", fontWeight: 800 }}>Task state: {task?.state || "Unavailable"}</span>
        <button type="button" onClick={onPrint} style={{ border: "1px solid #64748b", background: "transparent", color: "#ffffff", borderRadius: "10px", padding: "9px 12px", fontWeight: 800 }}>Print Production Sheet</button>
      </div>
    </section>
  );
}
