import { Link } from "react-router-dom";
import AssignmentAlertCard from "../components/AssignmentAlertCard";
import { useStoredOrders } from "../lib/ordersStore";

export default function DashboardAssignmentsPanel() {
  const orders = useStoredOrders();

  const pendingAssignments = orders.filter(
    (order) => order.needs_assignment || !order.assigned_to_staff_id
  ).length;

  return (
    <section
      style={{
        display: "grid",
        gap: "14px",
      }}
    >
      <AssignmentAlertCard count={pendingAssignments} />

      <Link
        to="/admin/orders?employee=unassigned"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "12px",
          padding: "12px 16px",
          background: "#171717",
          color: "#ffffff",
          textDecoration: "none",
          fontWeight: 800,
        }}
      >
        Open Unassigned Production
      </Link>
    </section>
  );
}
