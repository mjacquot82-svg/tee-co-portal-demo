import { Link } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import { buildAssignmentDispatchGroups } from "./buildAssignmentDispatchGroups";
import {
  isActiveOperationalStatus,
  isCompletedOperationalStatus,
  sortOrdersByOperationalStatus,
} from "../orders/orderWorkflow";
import { buildQueuePriority, sortQueueByPriority } from "../queue/buildQueuePriority";

const selectStyle = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "10px 11px",
  background: "#ffffff",
  color: "#0f172a",
  fontWeight: 700,
};

function PriorityBadge({ priority }) {
  if (!priority || (!priority.overdue && !priority.dueSoon)) return null;

  const background = priority.overdue ? "#fef2f2" : "#fffbeb";
  const color = priority.overdue ? "#b91c1c" : "#b45309";

  return (
    <span
      style={{
        background,
        color,
        borderRadius: "999px",
        padding: "5px 9px",
        fontSize: "12px",
        fontWeight: 900,
      }}
    >
      {priority.overdue ? "Overdue" : "Urgent"}
    </span>
  );
}

function getOrderCardStyle(priority, { interactive = true } = {}) {
  const accentColor = priority.overdue ? "#dc2626" : priority.dueSoon ? "#d97706" : "transparent";

  return {
    display: "grid",
    gap: "7px",
    textDecoration: "none",
    color: "#0f172a",
    background: priority.overdue ? "#fef2f2" : priority.dueSoon ? "#fffbeb" : "#f8fafc",
    border: priority.overdue ? "1px solid #fecaca" : priority.dueSoon ? "1px solid #fde68a" : "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "12px",
    boxShadow: interactive && (priority.overdue || priority.dueSoon) ? `inset 4px 0 0 0 ${accentColor}` : "none",
  };
}

function OrderSummary({ order, priority }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
        <strong>{order.order_number}</strong>
        <PriorityBadge priority={priority} />
      </div>
      <span>{order.customer_name || "Customer identity unavailable"}</span>
      <span>{order.garment || order.item || "Custom garment"}</span>
      <span>Qty: {order.qty || 0}</span>
      <span>Due: {order.due_date || "—"}</span>
      <span>Assigned: {order.assigned_to_staff_name || "Unassigned"}</span>
      <div>
        <StatusBadge status={order.status} />
      </div>
    </>
  );
}

function UnassignedOrderCard({ order, staffUsers, onAssign, formatWorkerName }) {
  const priority = buildQueuePriority(order);

  return (
    <article style={getOrderCardStyle(priority, { interactive: false })}>
      <Link
        to={`/admin/orders/${order.order_number}`}
        style={{ display: "grid", gap: "7px", textDecoration: "none", color: "#0f172a" }}
      >
        <OrderSummary order={order} priority={priority} />
      </Link>

      <select
        value={order.assigned_to_staff_id || ""}
        onChange={(event) => onAssign(order, event.target.value)}
        style={selectStyle}
      >
        <option value="">Assign worker…</option>
        {staffUsers.map((worker) => (
          <option key={worker.id} value={worker.id}>
            {formatWorkerName(worker)}
          </option>
        ))}
      </select>
    </article>
  );
}

function ReadOnlyOrderCard({ order }) {
  const priority = buildQueuePriority(order);

  return (
    <Link to={`/admin/orders/${order.order_number}`} style={getOrderCardStyle(priority)}>
      <OrderSummary order={order} priority={priority} />
    </Link>
  );
}

export default function AssignmentDispatchBoard({
  orders = [],
  staffUsers = [],
  onAssign = () => {},
  formatWorkerName = (worker) => worker?.name || "Worker",
}) {
  const activeOrders = orders.filter(
    (order) => order.operational_visible !== false && isActiveOperationalStatus(order.status)
  );
  const completedOrders = sortOrdersByOperationalStatus(
    orders.filter(
      (order) => order.operational_visible !== false && isCompletedOperationalStatus(order.status)
    )
  );
  const unassignedOrders = sortQueueByPriority(
    activeOrders.filter((order) => !order.assigned_to_staff_id && !order.assigned_to_staff_name)
  );
  const assignedGroups = buildAssignmentDispatchGroups(
    activeOrders.filter((order) => order.assigned_to_staff_id || order.assigned_to_staff_name)
  );

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <section
        style={{
          background: unassignedOrders.length ? "#fffbeb" : "#ffffff",
          border: unassignedOrders.length ? "1px solid #fde68a" : "1px solid #e2e8f0",
          borderRadius: "20px",
          padding: "18px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h2 style={{ margin: 0 }}>Unassigned</h2>
            <p style={{ margin: "4px 0 0", color: "#64748b" }}>
              One list, sorted by urgency and due date.
            </p>
          </div>
          <span style={{ color: "#92400e", fontWeight: 800 }}>{unassignedOrders.length} jobs</span>
        </div>

        {unassignedOrders.length ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "12px",
            }}
          >
            {unassignedOrders.map((order) => (
              <UnassignedOrderCard
                key={order.order_number}
                order={order}
                staffUsers={staffUsers}
                onAssign={onAssign}
                formatWorkerName={formatWorkerName}
              />
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: "#64748b" }}>All open jobs are currently assigned.</p>
        )}
      </section>

      {assignedGroups.length ? (
        assignedGroups.map((group) => (
          <section
            key={group.workerName}
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "20px",
              padding: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "14px",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>{group.workerName}</h2>
                <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                  {group.orderCount} assigned orders
                </p>
              </div>

              {group.overdueCount > 0 ? (
                <div
                  style={{
                    background: "#fef2f2",
                    color: "#b91c1c",
                    border: "1px solid #fecaca",
                    borderRadius: "999px",
                    padding: "6px 10px",
                    fontWeight: 800,
                  }}
                >
                  {group.overdueCount} overdue
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "12px",
              }}
            >
              {group.orders.map((order) => (
                <ReadOnlyOrderCard key={order.order_number} order={order} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <section
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "20px",
            padding: "24px",
            color: "#64748b",
            textAlign: "center",
          }}
        >
          No assigned jobs yet.
        </section>
      )}

      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "20px",
          padding: "18px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h2 style={{ margin: 0 }}>Completed</h2>
            <p style={{ margin: "4px 0 0", color: "#64748b" }}>
              Closed work kept separate from active dispatch.
            </p>
          </div>
          <span style={{ color: "#047857", fontWeight: 800 }}>{completedOrders.length} jobs</span>
        </div>

        {completedOrders.length ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "12px",
            }}
          >
            {completedOrders.map((order) => (
              <ReadOnlyOrderCard key={order.order_number} order={order} />
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: "#64748b" }}>No completed jobs yet.</p>
        )}
      </section>
    </div>
  );
}
