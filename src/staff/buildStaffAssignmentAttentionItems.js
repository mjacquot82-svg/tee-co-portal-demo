import { formatShortDate } from "../lib/dateFormatting";
import { hasActiveAssignmentAttention } from "../lib/staffAssignmentAttentionStore";

function isRushAssignment(order) {
  if (!order?.due_date) return false;

  const dueTimestamp = new Date(`${order.due_date}T00:00:00`).getTime();
  if (Number.isNaN(dueTimestamp)) return false;

  return dueTimestamp <= Date.now() + 2 * 24 * 60 * 60 * 1000;
}

function buildAssignmentAttentionLabel(order) {
  const latestAssignmentEvent = (order.activity_log || []).find(
    (event) => event?.type === "assignment"
  );
  const assignmentNote = String(latestAssignmentEvent?.note || "").toLowerCase();

  if (assignmentNote.startsWith("reassigned")) {
    return "Reassigned Job";
  }

  if (isRushAssignment(order)) {
    return "Rush Assignment";
  }

  return "New Assignment";
}

export function buildStaffAssignmentAttentionItems({
  assignedOrders = [],
  staffUser,
  attentionState = {},
}) {
  if (!staffUser?.id) return [];

  return assignedOrders
    .filter((order) =>
      hasActiveAssignmentAttention(
        {
          staffId: staffUser.id,
          orderNumber: order.order_number,
          assignedAt: order.assigned_at,
        },
        attentionState
      )
    )
    .map((order) => {
      const dueDateLabel = order.due_date
        ? `Due ${formatShortDate(order.due_date)}`
        : "Due date pending";
      const label = buildAssignmentAttentionLabel(order);
      const latestAssignmentEvent = (order.activity_log || []).find(
        (event) => event?.type === "assignment"
      );

      return {
        key: `assignment-${order.order_number}`,
        label,
        detail:
          latestAssignmentEvent?.note ||
          `${order.order_number} assigned to ${staffUser.name || "staff"}.`,
        supportingDetail: `${order.order_number} • ${order.customer_name || "Customer identity unavailable"} • ${dueDateLabel}`,
        to: `/admin/orders/${order.order_number}`,
        orderNumber: order.order_number,
        assignedAt: order.assigned_at,
        timestamp: order.assigned_at,
        tone: label === "Rush Assignment" ? "warning" : "default",
      };
    })
    .sort(
      (left, right) =>
        new Date(right.timestamp || 0).getTime() -
        new Date(left.timestamp || 0).getTime()
    );
}
