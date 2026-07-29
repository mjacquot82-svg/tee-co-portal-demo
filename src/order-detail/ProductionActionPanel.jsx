import { useState } from "react";
import { hasFrontCounterOwnership } from "../orders/orderWorkflow";

function isHoldAction(action) {
  return action?.key === "put_on_hold";
}

function getWorkstationActionLabel(action) {
  return ["start_printing", "start_embroidery"].includes(action?.key)
    ? "Start Production"
    : action?.label;
}

function getActiveActionLabel(action) {
  const key = String(action?.key || "");
  if (["start_printing", "start_embroidery", "start_production"].includes(key)) return "Starting Production...";
  if (key.includes("quality")) return "Completing Quality Check...";
  if (key.includes("ready")) return "Marking Ready for Pickup...";
  if (key.includes("complete")) return "Completing Order...";
  if (key.includes("release")) return "Releasing to Production...";
  if (key === "put_on_hold") return "Putting Order on Hold...";
  return `${getWorkstationActionLabel(action) || "Updating"}...`;
}

function ActionSpinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: "15px",
        height: "15px",
        border: "2px solid rgba(15, 23, 42, 0.3)",
        borderTopColor: "#0f172a",
        borderRadius: "50%",
        animation: "tee-co-action-spin 0.7s linear infinite",
      }}
    />
  );
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
  const [pendingActionKey, setPendingActionKey] = useState("");
  const [actionError, setActionError] = useState("");
  const handedOff = hasFrontCounterOwnership(order);
  const availableActions = actions.filter((action) => !action.blocked);
  const primaryAction = availableActions.find((action) => !isHoldAction(action)) || null;
  const secondaryActions = availableActions.filter((action) => action !== primaryAction && isHoldAction(action));
  const primaryActionLabel = getWorkstationActionLabel(primaryAction);

  async function runAction(action) {
    if (pendingActionKey) return;
    if (isHoldAction(action)) {
      setPendingHoldAction(action);
      setHoldReason("");
      return;
    }
    setPendingActionKey(action.key);
    setActionError("");
    try {
      await onRunAction?.(action, order);
    } catch (error) {
      setActionError(error instanceof Error && error.message
        ? error.message
        : "The workflow action could not be completed. Try again.");
    } finally {
      setPendingActionKey("");
    }
  }

  async function confirmHold() {
    if (!holdReason.trim() || !pendingHoldAction || pendingActionKey) return;
    const action = { ...pendingHoldAction, holdReason: holdReason.trim() };
    setPendingActionKey(action.key);
    setActionError("");
    try {
      await onRunAction?.(action, order);
      setPendingHoldAction(null);
      setHoldReason("");
    } catch (error) {
      setActionError(error instanceof Error && error.message
        ? error.message
        : "The workflow action could not be completed. Try again.");
    } finally {
      setPendingActionKey("");
    }
  }

  return (
    <section
      data-testid="production-current-action"
      className="production-console-action-banner"
    >
      <div className="production-console-action-copy">
        <span>What to do next</span>
        <strong>
          {handedOff
            ? "Handed off to Front Counter"
            : primaryActionLabel || (order.status === "Completed" ? "Production complete" : "No production action available")}
        </strong>
        <p>
          {handedOff
            ? "Production work is complete. Front Counter now owns payment collection, customer pickup, and final completion."
            : primaryAction
            ? "Continue this job through its active production stage."
            : `Current status: ${order.status || "—"}`}
        </p>
      </div>

      {feedback ? (
        <div style={{ marginBottom: "12px", borderRadius: "12px", padding: "10px 12px", background: "#eff6ff", color: "#1d4ed8", fontWeight: 700 }}>
          {feedback.summary}{feedback.detail ? ` ${feedback.detail}` : ""}
        </div>
      ) : null}
      {actionError ? (
        <div role="alert" style={{ marginBottom: "12px", borderRadius: "12px", padding: "10px 12px", background: "#fef2f2", color: "#b91c1c", fontWeight: 700 }}>
          {actionError}
        </div>
      ) : null}

      <div className="production-console-action-buttons">
        {!handedOff && primaryAction ? (
          <button
            type="button"
            data-testid="workflow-action-button"
            data-action-key={primaryAction.key}
            data-target-status={primaryAction.targetStatus || ""}
            onClick={() => runAction(primaryAction)}
            disabled={Boolean(pendingActionKey)}
            aria-busy={pendingActionKey === primaryAction.key}
            style={{ border: "1px solid #ffffff", background: "#ffffff", color: "#0f172a", borderRadius: "12px", padding: "12px 18px", fontWeight: 900, fontSize: "16px" }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
              {pendingActionKey === primaryAction.key ? <ActionSpinner /> : null}
              {pendingActionKey === primaryAction.key ? getActiveActionLabel(primaryAction) : primaryActionLabel}
            </span>
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
            disabled={Boolean(pendingActionKey)}
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
            <button type="button" data-testid="hold-reason-confirm" onClick={confirmHold} disabled={!holdReason.trim() || Boolean(pendingActionKey)} aria-busy={pendingActionKey === pendingHoldAction.key} style={{ border: 0, background: "#b91c1c", color: "#ffffff", borderRadius: "10px", padding: "9px 12px", fontWeight: 800 }}>
              {pendingActionKey === pendingHoldAction.key ? getActiveActionLabel(pendingHoldAction) : "Confirm Hold"}
            </button>
            <button type="button" data-testid="hold-reason-cancel" disabled={Boolean(pendingActionKey)} onClick={() => setPendingHoldAction(null)} style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "9px 12px", fontWeight: 800 }}>Cancel</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
