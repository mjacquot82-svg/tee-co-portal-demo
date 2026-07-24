import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  seedStoredOrders,
  updateStoredOrder,
  useStoredOrders,
} from "../lib/ordersStore";
import {
  getActiveStaffUser,
  getOperationalStaffUsers,
  subscribeToStaffUsers,
} from "../lib/staffUsersStore";
import AssignmentDispatchBoard from "../assignments/AssignmentDispatchBoard";
import {
  isActiveOperationalStatus,
  isCompletedOperationalStatus,
  normalizeOperationalStatus,
  sortOrdersByOperationalStatus,
} from "../orders/orderWorkflow";
import {
  isStaffWorkspaceView,
} from "./adminRoleView";

const cardStyle = {
  background: "#ffffff",
  borderRadius: "20px",
  padding: "22px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  border: "1px solid #e7e5e4",
};

function isOpenOrder(order) {
  return order.operational_visible !== false && isActiveOperationalStatus(order.status);
}

function normalizeOrder(order, index = 0) {
  return {
    ...order,
    customer_name: order.customer_name || ["ABC Construction", "City Hockey", "Local Customer"][index] || "Customer identity unavailable",
    garment: order.garment || order.item || "Custom garment",
    status: normalizeOperationalStatus(order.status || "New"),
    qty: Number(order.qty || 0),
    due_date: order.due_date || "",
    assigned_to_staff_id: order.assigned_to_staff_id || "",
    assigned_to_staff_name: order.assigned_to_staff_name || "",
    operational_visible: order.operational_visible !== false,
  };
}

function isOverdue(order) {
  if (!order.due_date) return false;
  const due = new Date(`${order.due_date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today && !isCompletedOperationalStatus(order.status);
}

function formatWorkerName(worker) {
  return `${worker.name}${worker.role ? ` (${worker.role})` : ""}`;
}

function OwnerAssignments({ allOrders, staffUsers }) {

  async function handleAssign(order, staffId) {
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

    await updateStoredOrder(order.order_number, {
      assigned_to_staff_id: selectedWorker?.id || "",
      assigned_to_staff_name: selectedWorker?.name || "",
      assigned_to_staff_role: selectedWorker?.role || "",
      assigned_at: selectedWorker ? new Date().toISOString() : null,
      needs_assignment: !selectedWorker,
      activity_type: "assignment",
      activity_note: activityNote,
    });
  }

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px" }}>
      <div style={{ marginBottom: "18px" }}>
        <p style={{ margin: 0, color: "#78716c", fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Production Dispatch</p>
        <h1 style={{ margin: "6px 0 8px", fontSize: "32px" }}>Assign Work</h1>
        <p style={{ margin: 0, color: "#64748b", maxWidth: "760px" }}>Assign and rebalance work here. Production status tracking stays in Production, and payment follow-up stays in Payments.</p>
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
  const storedOrders = useStoredOrders();
  const staffUser = getActiveStaffUser();
  const [staffUsers, setStaffUsers] = useState(() =>
    getOperationalStaffUsers().filter((user) => user.status !== "Inactive")
  );

  useEffect(() => {
    if (!storedOrders.length) {
      void seedStoredOrders();
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
