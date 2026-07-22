export default function ProcessCurrentActionPanel({ projection, onPrint }) {
  const task = projection?.primaryCurrentTask;
  const taskLabel = /^start (printing|embroidery)$/i.test(task?.name || "") ? "Start Production" : task?.name;
  return (
    <section data-testid="production-current-action" style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)", color: "#ffffff", borderRadius: "20px", padding: "22px", display: "grid", gap: "12px" }}>
      <p style={{ margin: 0, color: "#93c5fd", fontSize: "12px", fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>Next Action · Process Engine</p>
      <h2 style={{ margin: 0, fontSize: "30px" }}>{taskLabel || "No current production task"}</h2>
      <p style={{ margin: 0, color: "#cbd5e1", fontWeight: 700 }}>{task?.reason || "The Process Engine has not exposed an available task."}</p>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ borderRadius: "999px", background: "#334155", padding: "8px 11px", fontWeight: 800 }}>Task state: {task?.state || "Unavailable"}</span>
        <button type="button" onClick={onPrint} style={{ border: "1px solid #64748b", background: "transparent", color: "#ffffff", borderRadius: "10px", padding: "9px 12px", fontWeight: 800 }}>Print Production Sheet</button>
      </div>
    </section>
  );
}
