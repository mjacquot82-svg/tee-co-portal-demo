import { useState } from "react";

function isHoldAction(action) {
  return action?.key === "put_on_hold";
}

function getWorkstationActionLabel(action) {
  return ["start_printing", "start_embroidery"].includes(action?.key)
    ? "Start Production"
    : action?.label;
}

export default function ProductionActionPanel({
  order,
  actions = [],
  onRunAction,
  feedback = null,
  onPrint,
}) {
  const [pendingHoldAction, setPendingHoldAction] = useState(null);
  const [holdReason, setHoldReason] = useState("");
  const availableActions = actions.filter((action) => !action.blocked);
  const primaryAction = availableActions.find((action) => !isHoldAction(action)) || null;
  const secondaryActions = availableActions.filter((action) => action !== primaryAction && isHoldAction(action));
  const primaryActionLabel = getWorkstationActionLabel(primaryAction);

  function runAction(action) {
    if (isHoldAction(action)) {
      setPendingHoldAction(action);
      setHoldReason("");
      return;
    }
    onRunAction?.(action, order);
  }

  function confirmHold() {
    if (!holdReason.trim() || !pendingHoldAction) return;
    onRunAction?.({ ...pendingHoldAction, holdReason: holdReason.trim() }, order);
    setPendingHoldAction(null);
    setHoldReason("");
  }

  return (
    <section
      data-testid="production-current-action"
      className="production-console-action-banner"
    >
      <div className="production-console-action-copy">
        <span>What to do next</span>
        <strong>
          {primaryActionLabel || (order.status === "Completed" ? "Production complete" : "No production action available")}
        </strong>
        <p>{primaryAction ? "Continue this job through its active production stage." : `Current status: ${order.status || "—"}`}</p>
      </div>

      {feedback ? (
        <div style={{ marginBottom: "12px", borderRadius: "12px", padding: "10px 12px", background: "#eff6ff", color: "#1d4ed8", fontWeight: 700 }}>
          {feedback.summary}{feedback.detail ? ` ${feedback.detail}` : ""}
        </div>
      ) : null}

      <div className="production-console-action-buttons">
        {primaryAction ? (
          <button
            type="button"
            data-testid="workflow-action-button"
            data-action-key={primaryAction.key}
            data-target-status={primaryAction.targetStatus || ""}
            onClick={() => runAction(primaryAction)}
            style={{ border: "1px solid #ffffff", background: "#ffffff", color: "#0f172a", borderRadius: "12px", padding: "12px 18px", fontWeight: 900, fontSize: "16px" }}
          >
            {primaryActionLabel}
          </button>
        ) : null}
        {secondaryActions.map((action) => (
          <button
            key={action.key}
            type="button"
            data-testid="workflow-action-button"
            data-action-key={action.key}
            data-target-status={action.targetStatus || ""}
            onClick={() => runAction(action)}
            style={{ border: "1px solid #fda4af", background: "transparent", color: "#fecdd3", borderRadius: "12px", padding: "10px 14px", fontWeight: 800 }}
          >
            {action.label}
          </button>
        ))}
        <button type="button" onClick={onPrint} style={{ border: "1px solid #64748b", background: "transparent", color: "#ffffff", borderRadius: "12px", padding: "10px 14px", fontWeight: 800 }}>Print Production Sheet</button>
      </div>

      {pendingHoldAction ? (
        <div data-testid="hold-reason-dialog" style={{ marginTop: "14px", border: "1px solid #fecaca", background: "#fff5f5", borderRadius: "14px", padding: "14px", display: "grid", gap: "10px" }}>
          <label style={{ display: "grid", gap: "6px", fontWeight: 800 }}>
            Hold reason
            <textarea value={holdReason} onChange={(event) => setHoldReason(event.target.value)} rows={3} style={{ border: "1px solid #fca5a5", borderRadius: "10px", padding: "10px" }} />
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" data-testid="hold-reason-confirm" onClick={confirmHold} disabled={!holdReason.trim()} style={{ border: 0, background: "#b91c1c", color: "#ffffff", borderRadius: "10px", padding: "9px 12px", fontWeight: 800 }}>Confirm Hold</button>
            <button type="button" data-testid="hold-reason-cancel" onClick={() => setPendingHoldAction(null)} style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "9px 12px", fontWeight: 800 }}>Cancel</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
