import {
  normalizeProductionType,
  PRODUCTION_TYPES,
} from "../constants/productionTypes";
import {
  isCanceledOperationalStatus,
  isCompletedOperationalStatus,
  normalizeOperationalStatus,
} from "../orders/orderWorkflow";
import { isActiveQuoteWorkflowOrder, isQuoteCanceled } from "../quotes/quoteWorkflow";

export function buildOperationalMetrics(orders = []) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let activeQuotes = 0;
  let awaitingDeposit = 0;
  let overdue = 0;
  let dueToday = 0;
  let activeProduction = 0;
  let readyForPickup = 0;
  let needsAssignment = 0;
  let outstandingPayments = 0;

  const productionTypes = PRODUCTION_TYPES.reduce((totals, type) => {
    totals[type] = 0;
    return totals;
  }, {});
  const workerLoad = {};

  orders.forEach((order) => {
    if (isActiveQuoteWorkflowOrder(order)) {
      activeQuotes += 1;

      if (order.quote_status === "Awaiting Deposit") {
        awaitingDeposit += 1;
      }
    }

    if (!isCanceledOperationalStatus(order.status) && !isQuoteCanceled(order) && Number(order.balance_due || 0) > 0) {
      outstandingPayments += 1;
    }

    if (order.operational_visible === false) {
      return;
    }

    const status = normalizeOperationalStatus(order.status);
    const isCanceled = isCanceledOperationalStatus(status);

    if (isCanceled) {
      return;
    }

    if (order.due_date) {
      const dueDate = new Date(`${order.due_date}T00:00:00`);

      if (dueDate < today && !isCompletedOperationalStatus(status)) {
        overdue += 1;
      }

      if (dueDate.getTime() === today.getTime()) {
        dueToday += 1;
      }
    }

    if (["Ready For Production", "Printing", "Embroidery", "QC / Finishing"].includes(status)) {
      activeProduction += 1;
    }

    if (status === "Ready For Pickup") {
      readyForPickup += 1;
    }

    if (order.needs_assignment || !order.assigned_to_staff_name) {
      needsAssignment += 1;
    }

    const productionType = normalizeProductionType(order.decoration_type);
    productionTypes[productionType] = (productionTypes[productionType] || 0) + 1;

    const worker = order.assigned_to_staff_name || "Unassigned";
    workerLoad[worker] = (workerLoad[worker] || 0) + 1;
  });

  return {
    activeQuotes,
    awaitingDeposit,
    overdue,
    dueToday,
    activeProduction,
    readyForPickup,
    needsAssignment,
    outstandingPayments,
    productionTypes,
    workerLoad,
  };
}
