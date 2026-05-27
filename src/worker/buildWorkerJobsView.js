import { normalizeOperationalStatus } from "../orders/orderWorkflow";

export function buildWorkerJobsView(orders = [], worker = "") {
  const workerId =
    worker && typeof worker === "object" ? worker.id || "" : "";
  const workerName =
    worker && typeof worker === "object" ? worker.name || "" : worker;
  const workerOrders = orders.filter(
    (order) =>
      (workerId && order.assigned_to_staff_id === workerId) ||
      (!workerId && order.assigned_to_staff_name === workerName)
  );

  const grouped = {
    ready: [],
    inProgress: [],
    paused: [],
    completed: [],
  };

  workerOrders.forEach((order) => {
    const status = normalizeOperationalStatus(order.status);

    if (status === "Completed") {
      grouped.completed.push(order);
      return;
    }

    if (status === "Picked Up") {
      grouped.completed.push(order);
      return;
    }

    if (["Printing", "Embroidery", "QC / Finishing"].includes(status)) {
      grouped.inProgress.push(order);
      return;
    }

    if (status === "Ready For Pickup") {
      grouped.paused.push(order);
      return;
    }

    grouped.ready.push(order);
  });

  return grouped;
}
