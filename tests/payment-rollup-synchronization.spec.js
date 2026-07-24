// @ts-check
import { expect, test } from "@playwright/test";
import {
  buildPaymentRollupSynchronizationSignature,
} from "../src/lib/useAdminPaymentRollupSynchronization.js";
import {
  synchronizeStoredOrderPaymentRollups,
} from "../src/services/orderPaymentRollupSynchronization.js";

function staleOrder() {
  return {
    order_number: "TC-SYNC-1",
    quote_status: "Awaiting Deposit",
    payment_status: "Awaiting Deposit",
    payment_collection_state: "Awaiting Deposit",
    deposit_status: "not_requested",
    deposit_workflow_status: "Deposit Requested",
    deposit_amount: 150,
    deposit_paid_amount: 0,
    deposit_applied: 0,
    deposit_outstanding: 150,
    total_paid: 0,
    amount_paid: 0,
    paid_to_date: 0,
    total_amount: 600,
    balance_due: 600,
  };
}

const paymentRequest = {
  id: "request-sync-1",
  order_number: "TC-SYNC-1",
  request_type: "deposit",
  status: "paid",
  amount_requested: 150,
};

const payment = {
  id: "payment-sync-1",
  order_number: "TC-SYNC-1",
  payment_request_id: "request-sync-1",
  payment_type: "deposit",
  status: "captured",
  amount: 150,
  provider: "square",
};

test("shared synchronization preserves the existing deterministic order rollup repair", async () => {
  const updates = [];

  const result = await synchronizeStoredOrderPaymentRollups({
    orders: [staleOrder()],
    paymentRequests: [paymentRequest],
    payments: [payment],
    updateOrder: async (orderNumber, nextUpdates) => {
      updates.push({ orderNumber, updates: nextUpdates });
    },
  });

  expect(result).toEqual({
    scannedOrderCount: 1,
    updatedOrderCount: 1,
    updatedOrderNumbers: ["TC-SYNC-1"],
  });
  expect(updates).toHaveLength(1);
  expect(updates[0]).toMatchObject({
    orderNumber: "TC-SYNC-1",
    updates: {
      total_paid: 150,
      amount_paid: 150,
      paid_to_date: 150,
      deposit_applied: 150,
      deposit_outstanding: 0,
      deposit_paid_amount: 150,
      balance_due: 450,
      payment_status: "Deposit Applied",
      payment_collection_state: "Awaiting Final Payment",
      quote_status: "Approved",
      deposit_workflow_status: "Deposit Received",
      deposit_status: "paid",
    },
  });
});

test("shared synchronization is a no-op when the stored projection is current", async () => {
  const currentOrder = {
    ...staleOrder(),
    total_paid: 150,
    amount_paid: 150,
    paid_to_date: 150,
    deposit_applied: 150,
    deposit_outstanding: 0,
    deposit_paid_amount: 150,
    balance_due: 450,
    payment_status: "Deposit Applied",
    payment_collection_state: "Awaiting Final Payment",
    quote_status: "Approved",
    deposit_workflow_status: "Deposit Received",
    deposit_status: "paid",
  };
  let updateCount = 0;

  const result = await synchronizeStoredOrderPaymentRollups({
    orders: [currentOrder],
    paymentRequests: [paymentRequest],
    payments: [payment],
    updateOrder: async () => {
      updateCount += 1;
    },
  });

  expect(result.updatedOrderCount).toBe(0);
  expect(updateCount).toBe(0);
});

test("shared synchronization collapses concurrent triggers into one execution", async () => {
  let releaseUpdate;
  const updateReleased = new Promise((resolve) => {
    releaseUpdate = resolve;
  });
  let updateCount = 0;
  const options = {
    orders: [staleOrder()],
    paymentRequests: [paymentRequest],
    payments: [payment],
    updateOrder: async () => {
      updateCount += 1;
      await updateReleased;
    },
  };

  const first = synchronizeStoredOrderPaymentRollups(options);
  const second = synchronizeStoredOrderPaymentRollups(options);

  expect(second).toBe(first);
  expect(updateCount).toBe(1);
  releaseUpdate?.();
  await Promise.all([first, second]);
  expect(updateCount).toBe(1);
});

test("admin trigger signature ignores projection writes but changes with payment facts", () => {
  const initial = buildPaymentRollupSynchronizationSignature({
    orders: [staleOrder()],
    paymentRequests: [paymentRequest],
    payments: [payment],
  });
  const projectionUpdated = buildPaymentRollupSynchronizationSignature({
    orders: [{ ...staleOrder(), total_paid: 150, balance_due: 450 }],
    paymentRequests: [paymentRequest],
    payments: [payment],
  });
  const paymentUpdated = buildPaymentRollupSynchronizationSignature({
    orders: [staleOrder()],
    paymentRequests: [paymentRequest],
    payments: [{ ...payment, amount: 175 }],
  });

  expect(projectionUpdated).toBe(initial);
  expect(paymentUpdated).not.toBe(initial);
});
