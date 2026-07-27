const sectionStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "20px",
  padding: "18px",
};

export default function ProductionInstructionsPanel({ order = {}, showInternalNotes = true }) {
  const productionNotes = order.production_notes || "";
  const manufacturingInstructions = order.manufacturing_instructions || "";
  const hasUrgentOrderNote = /urgent|warning|caution|rush/i.test(`${productionNotes} ${manufacturingInstructions}`);

  return (
      <section data-testid="production-notes" style={{ ...sectionStyle, border: hasUrgentOrderNote ? "2px solid #f59e0b" : sectionStyle.border }}>
        <details open={hasUrgentOrderNote || undefined}>
          <summary style={{ cursor: "pointer", fontWeight: 900, color: "#0f172a" }}>
            Production Notes
            {hasUrgentOrderNote ? <strong data-testid="production-notes-warning" style={{ marginLeft: "10px", color: "#92400e", background: "#fffbeb", borderRadius: "999px", padding: "4px 8px", fontSize: "11px" }}>Attention required</strong> : null}
          </summary>
          <p style={{ margin: "10px 0 0", color: "#171717", fontSize: "14px", fontWeight: 700, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
            {productionNotes || "No production notes recorded."}
          </p>
          {manufacturingInstructions ? (
            <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: 0, fontSize: "14px" }}>Manufacturing Instructions</h3>
              <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", fontWeight: 700 }}>{manufacturingInstructions}</p>
            </div>
          ) : null}
          {showInternalNotes ? (
            <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: 0, fontSize: "14px" }}>Internal Notes</h3>
              <p style={{ margin: "6px 0 0", color: "#171717", fontSize: "14px", fontWeight: 700, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {order.internal_note || "No internal notes recorded."}
              </p>
            </div>
          ) : null}
        </details>
      </section>
  );
}
