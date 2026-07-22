function isUnassignedOrder(order = {}) {
  const assignedId = String(order.assigned_to_staff_id || "").trim();
  const assignedName = String(order.assigned_to_staff_name || "").trim().toLowerCase();
  return !assignedId && (!assignedName || assignedName === "unassigned");
}

export function matchesProductionEmployee(order = {}, employeeFilter = "all", staffUsers = []) {
  if (!employeeFilter || employeeFilter === "all") return true;
  if (employeeFilter === "unassigned") return isUnassignedOrder(order);
  if (String(order.assigned_to_staff_id || "") === employeeFilter) return true;

  const selectedEmployee = staffUsers.find((staff) => staff.id === employeeFilter);
  if (!selectedEmployee || order.assigned_to_staff_id) return false;

  return String(order.assigned_to_staff_name || "").trim().toLowerCase() ===
    String(selectedEmployee.name || "").trim().toLowerCase();
}
