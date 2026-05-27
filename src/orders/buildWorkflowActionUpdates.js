import {
  getProductionWorkflowAction,
  normalizeOperationalStatus,
} from "./orderWorkflow";

export function buildWorkflowActionUpdates(order, actionInput) {
  const action =
    typeof actionInput === "string" ? getProductionWorkflowAction(actionInput) : actionInput;

  if (!order || !action?.targetStatus) {
    return null;
  }

  const now = new Date().toISOString();
  const targetStatus = normalizeOperationalStatus(action.targetStatus);
  const updates = {
    status: targetStatus,
    activity_type: action.key,
    activity_note: `${action.label}.`,
  };

  if (action.key === "put_on_hold") {
    updates.production_hold_previous_status = normalizeOperationalStatus(order.status);
  }

  if (action.key === "resume_from_hold") {
    updates.production_hold_previous_status = "";
  }

  if (targetStatus === "Ready For Production") {
    updates.production_ready = true;
  }

  if (["Printing", "Embroidery"].includes(targetStatus)) {
    updates.production_started_at = order.production_started_at || now;
    updates.production_ready = true;
  }

  if (targetStatus === "Completed") {
    updates.completed_at = order.completed_at || now;
  }

  return updates;
}
