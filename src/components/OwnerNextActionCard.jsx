import { Link } from "react-router-dom";

const TONES = {
  neutral: {
    border: "#cbd5e1",
    background: "#f8fafc",
    accent: "#334155",
    button: "#0f172a",
  },
  info: {
    border: "#bfdbfe",
    background: "#eff6ff",
    accent: "#1d4ed8",
    button: "#1d4ed8",
  },
  warning: {
    border: "#fdba74",
    background: "#fff7ed",
    accent: "#9a3412",
    button: "#9a3412",
  },
  danger: {
    border: "#fecaca",
    background: "#fef2f2",
    accent: "#b91c1c",
    button: "#b91c1c",
  },
  success: {
    border: "#bbf7d0",
    background: "#ecfdf5",
    accent: "#166534",
    button: "#166534",
  },
};

function ActionLink({ action, palette }) {
  if (!action?.href) return null;

  return (
    <Link
      to={action.href}
      style={{
        border: "none",
        borderRadius: "12px",
        background: palette.button,
        color: "#ffffff",
        padding: "10px 13px",
        fontWeight: 800,
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {action.actionLabel || action.label}
    </Link>
  );
}

function ActionButton({ action, palette, onAction }) {
  if (!action?.actionKey || action.href) return null;

  return (
    <button
      type="button"
      onClick={() => onAction?.(action.actionKey, action)}
      style={{
        border: "none",
        borderRadius: "12px",
        background: palette.button,
        color: "#ffffff",
        padding: "10px 13px",
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {action.actionLabel || action.label}
    </button>
  );
}

export default function OwnerNextActionCard({
  action,
  title = "Next Best Action",
  onAction,
  compact = false,
}) {
  if (!action) return null;

  const palette = TONES[action.tone] || TONES.info;

  return (
    <section
      data-testid="owner-next-action-card"
      style={{
        border: `1px solid ${palette.border}`,
        borderRadius: "16px",
        background: palette.background,
        padding: compact ? "14px" : "16px",
        display: "grid",
        gap: "12px",
      }}
    >
      <div>
        <p
          style={{
            margin: "0 0 5px",
            color: palette.accent,
            fontSize: "12px",
            fontWeight: 900,
            textTransform: "uppercase",
          }}
        >
          {title}
        </p>
        <h2 style={{ margin: 0, color: "#0f172a", fontSize: compact ? "17px" : "20px" }}>
          {action.label}
        </h2>
        {action.detail ? (
          <p style={{ margin: "6px 0 0", color: "#475569", lineHeight: 1.45 }}>
            {action.detail}
          </p>
        ) : null}
      </div>

      {action.blockers?.length ? (
        <div style={{ display: "grid", gap: "8px" }}>
          {action.blockers.map((blocker) => (
            <div
              key={`${blocker.label}-${blocker.status}`}
              style={{
                border: "1px solid rgba(15, 23, 42, 0.1)",
                borderRadius: "12px",
                padding: "10px 12px",
                background: "rgba(255, 255, 255, 0.68)",
              }}
            >
              <strong style={{ color: "#0f172a" }}>{blocker.label}</strong>
              <span style={{ color: "#64748b" }}> · {blocker.status}</span>
              {blocker.detail ? (
                <p style={{ margin: "4px 0 0", color: "#475569", fontSize: "13px" }}>
                  {blocker.detail}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <ActionLink action={action} palette={palette} />
        <ActionButton action={action} palette={palette} onAction={onAction} />
        {(action.secondary || []).map((item) =>
          item.href ? (
            <Link
              key={`${item.label}-${item.href}`}
              to={item.href}
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                background: "#ffffff",
                color: "#0f172a",
                padding: "9px 12px",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              {item.label}
            </Link>
          ) : (
            <button
              key={`${item.label}-${item.actionKey}`}
              type="button"
              onClick={() => onAction?.(item.actionKey, item)}
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                background: "#ffffff",
                color: "#0f172a",
                padding: "9px 12px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {item.label}
            </button>
          )
        )}
      </div>
    </section>
  );
}
