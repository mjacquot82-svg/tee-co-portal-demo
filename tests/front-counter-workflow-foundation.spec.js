// @ts-check
import { expect, test } from "@playwright/test";
import {
  buildCustomerPickupUpdates,
  buildCompletedCustomerPickupUpdates,
  buildFrontCounterCompletionUpdates,
  buildReleaseToFrontCounterUpdates,
  deriveFrontCounterState,
  FRONT_COUNTER_STATUSES,
  isReleasedToFrontCounter,
} from "../src/front-counter/frontCounterWorkflow.js";
import { getAvailableProductionActions } from "../src/orders/orderWorkflow.js";
import { buildWorkflowActionUpdates } from "../src/orders/buildWorkflowActionUpdates.js";
import {
  buildPaymentAction,
  buildPickupAction,
} from "../src/admin/QuickSale.jsx";
import {
  derivePickupPresentationStage,
  PICKUP_PRESENTATION_STAGES,
} from "../src/front-counter/frontCounterPresentation.js";

test("Front Counter presentation progresses through explicit POS stages", () => {
  expect(derivePickupPresentationStage()).toBe(PICKUP_PRESENTATION_STAGES.SEARCH);
  expect(derivePickupPresentationStage({ hasCustomer: true })).toBe(
    PICKUP_PRESENTATION_STAGES.ORDERS
  );
  expect(
    derivePickupPresentationStage({ hasCustomer: true, hasSelectedOrder: true })
  ).toBe(PICKUP_PRESENTATION_STAGES.ACTION);
  expect(
    derivePickupPresentationStage({
      hasCustomer: true,
      hasSelectedOrder: true,
      hasCompletedPickup: true,
    })
  ).toBe(PICKUP_PRESENTATION_STAGES.COMPLETION);
});

test("Ready For Pickup remains backward compatible with the existing Front Counter queue", () => {
  expect(
    deriveFrontCounterState({
      status: "Ready For Pickup",
      pickup_status: "Ready for Pickup",
      balance_due: 45,
    })
  ).toMatchObject({
    status: FRONT_COUNTER_STATUSES.AWAITING_PAYMENT,
    released: true,
    paymentRequired: true,
    canCollectPayment: true,
    canRecordPickup: false,
  });
});

test("release to Front Counter preserves Ready For Pickup and records additive ownership state", () => {
  expect(
    buildReleaseToFrontCounterUpdates(
      {
        status: "Ready For Pickup",
        pickup_status: "Ready for Pickup",
        balance_due: 0,
      },
      {
        occurredAt: "2026-07-29T12:00:00.000Z",
        staffUserId: "production-staff-1",
        staffName: "Production Staff",
      }
    )
  ).toMatchObject({
    front_counter_status: FRONT_COUNTER_STATUSES.READY_FOR_PICKUP,
    front_counter_released_at: "2026-07-29T12:00:00.000Z",
    front_counter_released_by_staff_id: "production-staff-1",
    pickup_status: "Ready for Pickup",
    activity_type: "released_to_front_counter",
  });
});

test("Front Counter pickup and completion are separate transitions", () => {
  const order = {
    status: "Ready For Pickup",
    pickup_status: "Ready for Pickup",
    front_counter_status: FRONT_COUNTER_STATUSES.READY_FOR_PICKUP,
    balance_due: 0,
  };
  const pickupUpdates = buildCustomerPickupUpdates(order, {
    occurredAt: "2026-07-29T12:10:00.000Z",
  });

  expect(pickupUpdates).toMatchObject({
    front_counter_status: FRONT_COUNTER_STATUSES.CUSTOMER_PICKED_UP,
    pickup_status: "Picked Up",
    picked_up_at: "2026-07-29T12:10:00.000Z",
  });
  expect(pickupUpdates).not.toHaveProperty("status", "Completed");

  expect(
    buildFrontCounterCompletionUpdates(
      {
        ...order,
        ...pickupUpdates,
      },
      { occurredAt: "2026-07-29T12:15:00.000Z" }
    )
  ).toMatchObject({
    front_counter_status: FRONT_COUNTER_STATUSES.COMPLETED,
    status: "Completed",
    completed_at: "2026-07-29T12:15:00.000Z",
    activity_type: "front_counter_order_completed",
  });
});

test("pickup cannot be recorded while a remaining balance exists", () => {
  expect(
    buildCustomerPickupUpdates({
      status: "Ready For Pickup",
      pickup_status: "Ready for Pickup",
      balance_due: 25,
    })
  ).toBeNull();
});

test("production completion remains available before Front Counter release", () => {
  const actions = getAvailableProductionActions({
    status: "Ready For Pickup",
    pickup_status: "Ready for Pickup",
    balance_due: 0,
  }).map((action) => action.key);

  expect(actions).toContain("release_to_front_counter");
  expect(actions).toContain("complete_order");
});

test("release is only available after production reaches Ready For Pickup", () => {
  expect(
    getAvailableProductionActions({
      status: "QC / Finishing",
      pickup_status: "",
      balance_due: 0,
    }).map((action) => action.key)
  ).not.toContain("release_to_front_counter");
});

test("release is not re-blocked by prerequisites after production is complete", () => {
  const releaseAction = getAvailableProductionActions({
    status: "Ready For Pickup",
    artwork_approval_required: true,
    artwork_approval_status: "Pending Review",
    deposit_required: true,
    deposit_workflow_status: "Awaiting Deposit",
  }).find((action) => action.key === "release_to_front_counter");

  expect(releaseAction).toMatchObject({
    blocked: false,
    blockedReasons: [],
  });
});

test("release transition keeps the order open and prevents a second release", () => {
  const order = {
    status: "Ready For Pickup",
    pickup_status: "Ready for Pickup",
    balance_due: 25,
  };
  const action = getAvailableProductionActions(order).find(
    (candidate) => candidate.key === "release_to_front_counter"
  );
  const updates = buildWorkflowActionUpdates(order, {
    ...action,
    staffUserId: "production-staff-1",
    staffName: "Production Staff",
  });

  expect(updates).toMatchObject({
    front_counter_status: FRONT_COUNTER_STATUSES.AWAITING_PAYMENT,
    front_counter_released_by_staff_id: "production-staff-1",
    front_counter_released_by_staff_name: "Production Staff",
    pickup_status: "Ready for Pickup",
  });
  expect(updates).not.toHaveProperty("completed_at");
  expect(updates).not.toHaveProperty("status", "Completed");
  expect(isReleasedToFrontCounter({ ...order, ...updates })).toBe(true);

  const postReleaseActions = getAvailableProductionActions({
    ...order,
    ...updates,
  }).map((candidate) => candidate.key);
  expect(postReleaseActions).not.toContain("release_to_front_counter");
  expect(postReleaseActions).not.toContain("complete_order");
  expect(postReleaseActions).toEqual([]);
});

test("production cannot complete an order after Front Counter ownership begins", () => {
  const releasedOrder = {
    status: "Ready For Pickup",
    pickup_status: "Ready for Pickup",
    balance_due: 0,
    front_counter_released_at: "2026-07-29T12:00:00.000Z",
    front_counter_status: FRONT_COUNTER_STATUSES.READY_FOR_PICKUP,
  };

  expect(
    buildWorkflowActionUpdates(releasedOrder, {
      key: "complete_order",
      label: "Complete Order",
      targetStatus: "Completed",
    })
  ).toBeNull();

  expect(buildFrontCounterCompletionUpdates(releasedOrder)).toBeNull();
  const pickupUpdates = buildCustomerPickupUpdates(releasedOrder, {
    occurredAt: "2026-07-29T12:10:00.000Z",
  });
  expect(
    buildFrontCounterCompletionUpdates(
      { ...releasedOrder, ...pickupUpdates },
      { occurredAt: "2026-07-29T12:15:00.000Z" }
    )
  ).toMatchObject({
    status: "Completed",
    activity_type: "front_counter_order_completed",
  });
});

test("Front Counter tabs include only explicitly released eligible orders", () => {
  const legacyReadyOrder = {
    order_number: "TC-LEGACY",
    status: "Ready For Pickup",
    pickup_status: "Ready for Pickup",
    balance_due: 0,
  };
  const releasedUnpaidOrder = {
    order_number: "TC-PAYMENT",
    status: "Ready For Pickup",
    pickup_status: "Ready for Pickup",
    balance_due: 40,
    front_counter_released_at: "2026-07-29T12:00:00.000Z",
    front_counter_status: FRONT_COUNTER_STATUSES.AWAITING_PAYMENT,
  };
  const releasedPaidOrder = {
    order_number: "TC-PICKUP",
    status: "Ready For Pickup",
    pickup_status: "Ready for Pickup",
    balance_due: 0,
    front_counter_released_at: "2026-07-29T12:01:00.000Z",
    front_counter_status: FRONT_COUNTER_STATUSES.READY_FOR_PICKUP,
  };

  expect(buildPaymentAction(legacyReadyOrder)).toBeNull();
  expect(buildPickupAction(legacyReadyOrder)).toBeNull();
  expect(buildPaymentAction(releasedUnpaidOrder)).toMatchObject({
    kind: "payment",
    amount: 40,
  });
  expect(buildPickupAction(releasedUnpaidOrder)).toBeNull();
  expect(buildPaymentAction(releasedPaidOrder)).toBeNull();
  expect(buildPickupAction(releasedPaidOrder)).toMatchObject({
    kind: "pickup",
    orderNumber: "TC-PICKUP",
  });
});

test("picked-up and completed orders do not remain in Front Counter tabs", () => {
  const releasedOrder = {
      status: "Ready For Pickup",
      pickup_status: "Picked Up",
      balance_due: 0,
      front_counter_released_at: "2026-07-29T12:00:00.000Z",
      front_counter_status: FRONT_COUNTER_STATUSES.CUSTOMER_PICKED_UP,
    };

  expect(buildPaymentAction(releasedOrder)).toBeNull();
  expect(buildPickupAction(releasedOrder)).toBeNull();
});

test("Front Counter pickup completion records one terminal workflow state", () => {
  const updates = buildCompletedCustomerPickupUpdates(
    {
      status: "Ready For Pickup",
      pickup_status: "Ready for Pickup",
      balance_due: 0,
      front_counter_released_at: "2026-07-29T12:00:00.000Z",
      front_counter_status: FRONT_COUNTER_STATUSES.READY_FOR_PICKUP,
    },
    { occurredAt: "2026-07-29T12:30:00.000Z" }
  );

  expect(updates).toMatchObject({
    status: "Completed",
    pickup_status: "Picked Up",
    front_counter_status: FRONT_COUNTER_STATUSES.COMPLETED,
    picked_up_at: "2026-07-29T12:30:00.000Z",
    completed_at: "2026-07-29T12:30:00.000Z",
    front_counter_completed_at: "2026-07-29T12:30:00.000Z",
    activity_type: "front_counter_order_completed",
  });
});
