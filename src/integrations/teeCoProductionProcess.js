import { normalizeProductionType } from "../constants/productionTypes";
import { buildProductionGatingState } from "../orders/workflowGating";
import { ensureProcessInstance } from "../process-engine/processStore";
import { teeCoDtfProductionTemplate } from "../process-templates/teeCoDtfProduction";

const APPLICATION_KEY = "tee-and-co";
const SUBJECT_TYPE = "order";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function isTeeCoDtfProcessEligible(order = {}) {
  const requestApproved =
    normalize(order.staff_review_status) === "approved" ||
    normalize(order.approval_status) === "approved";
  const readyForProduction = normalize(order.status) === "ready for production";
  const isDtf = normalizeProductionType(
    order.decoration_type || order.production_type || ""
  ) === "DTF";
  const gating = buildProductionGatingState(order, {
    targetStatus: "Ready For Production",
  });

  return requestApproved && readyForProduction && isDtf && !gating.blocked;
}

export async function ensureTeeCoProductionProcess(order = {}) {
  if (!isTeeCoDtfProcessEligible(order)) {
    return { created: false, processInstance: null };
  }

  return ensureProcessInstance({
    template: teeCoDtfProductionTemplate,
    applicationKey: APPLICATION_KEY,
    subjectType: SUBJECT_TYPE,
    subjectId: String(order.id || order.order_number || "").trim(),
  });
}
