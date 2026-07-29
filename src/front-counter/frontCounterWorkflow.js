import { normalizeOperationalStatus } from "../orders/orderWorkflow";

export const FRONT_COUNTER_STATUSES = Object.freeze({
  NOT_RELEASED: "Not Released",
  AWAITING_PAYMENT: "Awaiting Remaining Payment",
  READY_FOR_PICKUP: "Ready For Customer Pickup",
  CUSTOMER_PICKED_UP: "Customer Picked Up",
  COMPLETED: "Completed",
});

export const FRONT_COUNTER_EVENT_TYPES = Object.freeze({
  RELEASED: "released_to_front_counter",
  PAYMENT_SATISFIED: "front_counter_payment_satisfied",
  CUSTOMER_PICKUP: "front_counter_customer_pickup",
  COMPLETED: "front_counter_order_completed",
});

function normalizeText(value) {
  return String(value || "").trim();
}

function remainingBalance(order = {}) {
  const balance = Number(order.balance_due || order.balance || 0);
  return Number.isFinite(balance) ? Math.max(0, balance) : 0;
}

function explicitFrontCounterStatus(order = {}) {
  const status = normalizeText(order.front_counter_status);
  return Object.values(FRONT_COUNTER_STATUSES).includes(status) ? status : "";
}

export function isReleasedToFrontCounter(order = {}) {
  const explicitStatus = explicitFrontCounterStatus(order);
  return (
    Boolean(normalizeText(order.front_counter_released_at)) ||
    (Boolean(explicitStatus) && explicitStatus !== FRONT_COUNTER_STATUSES.NOT_RELEASED)
  );
}

export function deriveFrontCounterState(order = {}) {
  const explicitStatus = explicitFrontCounterStatus(order);
  const operationalStatus = normalizeOperationalStatus(order.status);
  const pickupStatus = normalizeText(order.pickup_status);
  const balanceDue = remainingBalance(order);

  if (
    explicitStatus === FRONT_COUNTER_STATUSES.COMPLETED ||
    operationalStatus === "Completed"
  ) {
    return {
      status: FRONT_COUNTER_STATUSES.COMPLETED,
      released: true,
      balanceDue,
      paymentRequired: false,
      canCollectPayment: false,
      canRecordPickup: false,
      canComplete: false,
    };
  }

  if (
    explicitStatus === FRONT_COUNTER_STATUSES.CUSTOMER_PICKED_UP ||
    pickupStatus === "Picked Up"
  ) {
    return {
      status: FRONT_COUNTER_STATUSES.CUSTOMER_PICKED_UP,
      released: true,
      balanceDue,
      paymentRequired: balanceDue > 0,
      canCollectPayment: balanceDue > 0,
      canRecordPickup: false,
      canComplete: balanceDue <= 0,
    };
  }

  const released =
    isReleasedToFrontCounter(order) ||
    operationalStatus === "Ready For Pickup" ||
    pickupStatus === "Ready for Pickup";

  if (!released) {
    return {
      status: FRONT_COUNTER_STATUSES.NOT_RELEASED,
      released: false,
      balanceDue,
      paymentRequired: false,
      canCollectPayment: false,
      canRecordPickup: false,
      canComplete: false,
    };
  }

  const paymentRequired = balanceDue > 0;
  return {
    status: paymentRequired
      ? FRONT_COUNTER_STATUSES.AWAITING_PAYMENT
      : FRONT_COUNTER_STATUSES.READY_FOR_PICKUP,
    released: true,
    balanceDue,
    paymentRequired,
    canCollectPayment: paymentRequired,
    canRecordPickup: !paymentRequired,
    canComplete: false,
  };
}

export function buildReleaseToFrontCounterUpdates(order = {}, options = {}) {
  if (normalizeOperationalStatus(order.status) !== "Ready For Pickup") {
    return null;
  }

  const now = options.occurredAt || new Date().toISOString();
  const paymentRequired = remainingBalance(order) > 0;
  return {
    front_counter_status: paymentRequired
      ? FRONT_COUNTER_STATUSES.AWAITING_PAYMENT
      : FRONT_COUNTER_STATUSES.READY_FOR_PICKUP,
    front_counter_released_at: order.front_counter_released_at || now,
    front_counter_released_by_staff_id: options.staffUserId || "",
    front_counter_released_by_staff_name: options.staffName || "",
    pickup_status: "Ready for Pickup",
    activity_type: FRONT_COUNTER_EVENT_TYPES.RELEASED,
    activity_note: paymentRequired
      ? "Order released to Front Counter with a remaining balance."
      : "Order released to Front Counter for customer pickup.",
  };
}

export function buildCustomerPickupUpdates(order = {}, options = {}) {
  const state = deriveFrontCounterState(order);
  if (!state.canRecordPickup) return null;

  const now = options.occurredAt || new Date().toISOString();
  return {
    front_counter_status: FRONT_COUNTER_STATUSES.CUSTOMER_PICKED_UP,
    pickup_status: "Picked Up",
    picked_up_at: order.picked_up_at || now,
    activity_type: FRONT_COUNTER_EVENT_TYPES.CUSTOMER_PICKUP,
    activity_note: "Completed order handed to the customer.",
  };
}

export function buildFrontCounterCompletionUpdates(order = {}, options = {}) {
  const state = deriveFrontCounterState(order);
  if (!state.canComplete) return null;

  const now = options.occurredAt || new Date().toISOString();
  return {
    front_counter_status: FRONT_COUNTER_STATUSES.COMPLETED,
    front_counter_completed_at: order.front_counter_completed_at || now,
    status: "Completed",
    completed_at: order.completed_at || now,
    activity_type: FRONT_COUNTER_EVENT_TYPES.COMPLETED,
    activity_note: "Front Counter completed the picked-up order.",
  };
}

export function buildCompletedCustomerPickupUpdates(order = {}, options = {}) {
  const now = options.occurredAt || new Date().toISOString();
  const pickupUpdates = buildCustomerPickupUpdates(order, { occurredAt: now });
  if (!pickupUpdates) return null;

  const completionUpdates = buildFrontCounterCompletionUpdates(
    {
      ...order,
      ...pickupUpdates,
    },
    { occurredAt: now }
  );
  if (!completionUpdates) return null;

  return {
    ...pickupUpdates,
    ...completionUpdates,
    activity_note: "Order handed to the customer and completed at Front Counter.",
  };
}
