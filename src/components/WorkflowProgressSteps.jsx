import { buildWorkflowProgressStages } from "../orders/workflowPresentation";

const toneByState = {
  complete: {
    symbol: "✓",
    color: "#166534",
    background: "#ecfdf5",
    border: "#bbf7d0",
  },
  active: {
    symbol: "○",
    color: "#1d4ed8",
    background: "#eff6ff",
    border: "#bfdbfe",
  },
  pending: {
    symbol: "○",
    color: "#64748b",
    background: "#f8fafc",
    border: "#e2e8f0",
  },
};

export default function WorkflowProgressSteps({ order = {}, compact = false }) {
  const stages = buildWorkflowProgressStages(order);

  return (
    <div
      data-testid="workflow-progress-steps"
      style={{
        display: "grid",
        gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(145px, 1fr))",
        gap: "8px",
      }}
    >
      {stages.map((stage) => {
        const tone = toneByState[stage.state] || toneByState.pending;

        return (
          <div
            key={stage.key}
            data-testid="workflow-progress-step"
            data-stage-key={stage.key}
            data-stage-state={stage.state}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              border: `1px solid ${tone.border}`,
              background: tone.background,
              color: tone.color,
              borderRadius: "12px",
              padding: compact ? "8px 10px" : "10px 12px",
              fontSize: compact ? "12px" : "13px",
              fontWeight: 850,
              minHeight: compact ? "34px" : "42px",
            }}
          >
            <span aria-hidden="true" style={{ fontWeight: 900 }}>{tone.symbol}</span>
            <span>{stage.label}</span>
          </div>
        );
      })}
    </div>
  );
}
