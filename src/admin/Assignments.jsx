import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { seedStoredOrders } from "../lib/ordersStore";
import { updateOrderWorkflow, useOrders } from "../repositories/ordersRepository";
import {
  getActiveStaffUser,
  getOperationalStaffUsers,
  subscribeToStaffUsers,
} from "../lib/staffUsersStore";
import AssignmentDispatchBoard from "../assignments/AssignmentDispatchBoard";
import {
  normalizeOperationalStatus,
  sortOrdersByOperationalStatus,
} from "../orders/orderWorkflow";
import {
  isStaffWorkspaceView,
} from "./adminRoleView";

function normalizeOrder(order, index = 0) {
  return {
    ...order,
    customer_name: order.customer_name || ["ABC Construction", "City Hockey", "Local Customer"][index] || "Walk-in Customer",
    garment: order.garment || order.item || "Custom garment",
    status: normalizeOperationalStatus(order.status || "New"),
    qty: Number(order.qty || 0),
    due_date: order.due_date || "",
    assigned_to_staff_id: order.assigned_to_staff_id || "",
    assigned_to_staff_name: order.assigned_to_staff_name || "",
    operational_visible: order.operational_visible !== false,
  };
}

function formatWorkerName(worker) {
  return `${worker.name}${worker.role ? ` (${worker.role})` : ""}`;
}

function OwnerAssignments({ allOrders, staffUsers }) {

  function handleAssign(order, staffId) {
    const selectedWorker = staffUsers.find((worker) => worker.id === staffId);
    const previousAssignment = order.assigned_to_staff_name || "";
    const nextAssignment = selectedWorker?.name || "";
    const activityNote = !previousAssignment && nextAssignment
      ? `Assigned to ${nextAssignment}.`
      : previousAssignment && !nextAssignment
        ? `Unassigned from ${previousAssignment}.`
        : previousAssignment && nextAssignment && previousAssignment !== nextAssignment
          ? `Reassigned from ${previousAssignment} to ${nextAssignment}.`
          : selectedWorker
            ? `Assignment confirmed for ${nextAssignment}.`
            : "Assignment cleared.";

    updateOrderWorkflow(
      order.order_number,
      {
        type: "assign_staff",
        assignee: selectedWorker,
        activity_note: activityNote,
      },
      { now: new Date().toISOString() }
    );
  }

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px" }}>
      <div style={{ marginBottom: "18px" }}>
        <p style={{ margin: 0, color: "#78716c", fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Production Dispatch</p>
        <h1 style={{ margin: "6px 0 8px", fontSize: "32px" }}>Assignment Dispatch Board</h1>
        <p style={{ margin: 0, color: "#64748b", maxWidth: "760px" }}>Assign and rebalance work here. Production status tracking stays in Shop Production, and financial follow-up stays in Invoices & Payments.</p>
      </div>

      <AssignmentDispatchBoard
        orders={allOrders}
        staffUsers={staffUsers}
        onAssign={handleAssign}
        formatWorkerName={formatWorkerName}
      />
    </div>
  );
}

export default function Assignments() {
  const storedOrders = useOrders();
  const staffUser = getActiveStaffUser();
  const [staffUsers, setStaffUsers] = useState(() =>
    getOperationalStaffUsers().filter((user) => user.status !== "Inactive")
  );

  useEffect(() => {
    if (!storedOrders.length) {
      seedStoredOrders();
    }
  }, [storedOrders.length]);

  useEffect(() => {
    return subscribeToStaffUsers((nextUsers) => {
      setStaffUsers(nextUsers.filter((user) => user.status !== "Inactive"));
    });
  }, []);

  const allOrders = useMemo(
    () => sortOrdersByOperationalStatus(storedOrders.map(normalizeOrder)),
    [storedOrders]
  );

  if (isStaffWorkspaceView(staffUser)) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <OwnerAssignments
      allOrders={allOrders}
      staffUsers={staffUsers}
    />
  );
}
