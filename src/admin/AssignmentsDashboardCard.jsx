import { Link } from "react-router-dom";
import AssignmentAlertCard from "../components/AssignmentAlertCard";
import { useOrders } from "../repositories/ordersRepository";

export default function AssignmentsDashboardCard() {
  const orders = useOrders();

  const pendingAssignments = orders.filter(
    (order) => order.needs_assignment || !order.assigned_to_staff_id
  ).length;

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <AssignmentAlertCard count={pendingAssignments} />

      <Link
        to="/admin/assignments"
        style={{
          background: "#171717",
          color: "#ffffff",
          borderRadius: "12px",
          padding: "12px 16px",
          textDecoration: "none",
          fontWeight: 800,
          textAlign: "center",
        }}
      >
        Open Assignment Workspace
      </Link>
    </div>
  );
}
