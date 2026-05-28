const TONES = {
  neutral: {
    background: "#f1f5f9",
    border: "#cbd5e1",
    color: "#334155",
  },
  info: {
    background: "#eff6ff",
    border: "#bfdbfe",
    color: "#1d4ed8",
  },
  warning: {
    background: "#fff7ed",
    border: "#fdba74",
    color: "#9a3412",
  },
  success: {
    background: "#ecfdf5",
    border: "#bbf7d0",
    color: "#166534",
  },
  danger: {
    background: "#fef2f2",
    border: "#fecaca",
    color: "#b91c1c",
  },
};

export default function WorkflowBadge({ label, tone = "neutral" }) {
  const palette = TONES[tone] || TONES.neutral;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        padding: "5px 9px",
        fontSize: "11px",
        fontWeight: 800,
        lineHeight: 1.2,
      }}
    >
      {label}
    </span>
  );
}
