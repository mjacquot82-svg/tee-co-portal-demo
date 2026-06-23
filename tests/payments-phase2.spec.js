// @ts-check
import { test, expect } from "@playwright/test";
import {
  createPaymentRequest,
  getPaymentRequestById,
  listPaymentEvents,
  listPaymentRequests,
  recordPayment,
  resetStoredPaymentsForTests,
  updatePaymentRequest,
} from "../src/lib/paymentsStore.js";
import {
  buildProductionGatingState,
  isDepositRequirementSatisfied,
} from "../src/orders/workflowGating.js";
import { isDepositActionRequired } from "../src/lib/depositPaymentProviders.js";

test.beforeEach(() => {
  resetStoredPaymentsForTests();
});

test("admin payment requests can be listed, opened, updated, and paid without provider links", () => {
  const request = createPaymentRequest({
    customer_id: "customer-phase2-1",
    order_number: "TC-P2-1001",
    request_type: "balance",
    status: "open",
    amount_requested: 320,
    payment_provider: "manual",
    metadata: { source: "admin_payments_module" },
  });

  expect(listPaymentRequests()).toHaveLength(1);
  expect(getPaymentRequestById(request.request_number)).toMatchObject({
    id: request.id,
    status: "open",
    amount_requested: 320,
    provider_checkout_url: "",
  });

  const updated = updatePaymentRequest(request.id, {
    customer_message: "Balance follow-up",
  });
  expect(updated?.customer_message).toBe("Balance follow-up");

  recordPayment({
    customer_id: "customer-phase2-1",
    order_number: "TC-P2-1001",
    payment_request_id: request.id,
    payment_type: "balance",
    amount: 320,
    method: "Cash",
  });

  expect(getPaymentRequestById(request.id)).toMatchObject({
    status: "paid",
    amount_paid: 320,
  });
  expect(listPaymentEvents().map((event) => event.event_type)).toEqual(
    expect.arrayContaining([
      "payment_request_created",
      "payment_request_updated",
      "payment_recorded",
    ])
  );
});

test("creating native admin payment requests does not satisfy legacy deposit gating", () => {
  const order = {
    order_number: "TC-P2-1002",
    customer_id: "customer-phase2-2",
    deposit_required: true,
    deposit_requirement: "required",
    deposit_amount: 200,
    deposit_workflow_status: "Deposit Requested",
    payment_status: "Awaiting Deposit",
    quote_status: "Awaiting Deposit",
    payment_history: [],
  };

  createPaymentRequest({
    customer_id: order.customer_id,
    order_number: order.order_number,
    request_type: "deposit",
    status: "open",
    amount_requested: 200,
    metadata: { source: "admin_payments_module" },
  });

  expect(isDepositActionRequired(order)).toBe(true);
  expect(isDepositRequirementSatisfied(order)).toBe(false);
  expect(
    buildProductionGatingState(order, { targetStatus: "Ready For Production" }).blocked
  ).toBe(true);
});

test("customer portal deposit flow remains driven by existing order-level payment fields", () => {
  const order = {
    order_number: "TC-P2-1003",
    customer_id: "customer-phase2-3",
    deposit_required: true,
    deposit_requirement: "required",
    deposit_amount: 150,
    deposit_paid_amount: 150,
    deposit_workflow_status: "Deposit Received",
    payment_status: "Deposit Paid",
    payment_history: [{ id: "legacy-deposit", amount: 150, method: "Cash" }],
  };

  createPaymentRequest({
    customer_id: order.customer_id,
    order_number: order.order_number,
    request_type: "balance",
    status: "open",
    amount_requested: 225,
  });

  expect(isDepositActionRequired(order)).toBe(false);
  expect(isDepositRequirementSatisfied(order)).toBe(true);
  expect(
    buildProductionGatingState(order, { targetStatus: "Ready For Production" }).blocked
  ).toBe(false);
});
