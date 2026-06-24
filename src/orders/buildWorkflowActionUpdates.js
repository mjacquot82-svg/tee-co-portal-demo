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
    updates.production_hold_reason = action.holdReason || "";
    updates.production_hold_staff_name = action.holdStaffName || "";
    updates.production_hold_at = now;
    if (action.holdReason) {
      updates.activity_note = `Placed on hold. Reason: ${action.holdReason}.`;
    }
  }

  if (action.key === "resume_from_hold") {
    const prevReason = String(order.production_hold_reason || "").trim();
    updates.production_hold_previous_status = "";
    updates.production_resume_staff_name = action.resumeStaffName || "";
    updates.production_resume_at = now;
    if (prevReason) {
      const resumerSuffix = action.resumeStaffName ? ` Resumed by ${action.resumeStaffName}.` : "";
      updates.activity_note = `Resumed from hold. Previous hold reason: ${prevReason}.${resumerSuffix}`;
    }
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
