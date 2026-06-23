// @ts-check
import { test, expect } from "@playwright/test";
import {
  backfillOrderPaymentsToPayments,
  createPaymentRequest,
  getPaymentEventsByOrder,
  getPaymentRequestsByCustomer,
  getPaymentRequestsByOrder,
  getPaymentsByCustomer,
  getPaymentsByOrder,
  recordPayment,
  resetStoredPaymentsForTests,
} from "../src/lib/paymentsStore.js";
import {
  buildProductionGatingState,
  isDepositRequirementSatisfied,
  normalizeDepositWorkflowStatus,
} from "../src/orders/workflowGating.js";
import {
  buildDepositPaymentRoute,
  isDepositActionRequired,
} from "../src/lib/depositPaymentProviders.js";

test.beforeEach(() => {
  resetStoredPaymentsForTests();
});

test("backfills legacy order payment history without changing deposit gating semantics", () => {
  const legacyOrder = {
    id: "order-id-1",
    order_number: "TC-PAY-1001",
    customer_id: "customer-id-1",
    deposit_required: true,
    deposit_amount: 150,
    deposit_workflow_status: "Deposit Received",
    artwork_approval_required: false,
    payment_history: [
      {
        id: "payment-tc-pay-1001-deposit",
        amount: 150,
        method: "Credit",
        timestamp: "2026-06-01T10:00:00.000Z",
        staff_member: "Owner / Admin",
        note: "Initial deposit received.",
      },
    ],
  };

  const backfillResult = backfillOrderPaymentsToPayments(legacyOrder);
  const payments = getPaymentsByOrder(legacyOrder.order_number);
  const paymentRequests = getPaymentRequestsByOrder(legacyOrder.order_number);
  const events = getPaymentEventsByOrder(legacyOrder.order_number);

  expect(backfillResult.payments).toHaveLength(1);
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({
    order_number: legacyOrder.order_number,
    customer_id: legacyOrder.customer_id,
    payment_type: "deposit",
    amount: 150,
    provider: "manual",
  });
  expect(paymentRequests).toHaveLength(1);
  expect(paymentRequests[0]).toMatchObject({
    request_type: "deposit",
    status: "paid",
    amount_requested: 150,
    amount_paid: 150,
  });
  expect(events.some((event) => event.event_type === "legacy_payment_backfilled")).toBe(true);

  expect(normalizeDepositWorkflowStatus(legacyOrder.deposit_workflow_status, legacyOrder)).toBe("Deposit Received");
  expect(isDepositRequirementSatisfied(legacyOrder)).toBe(true);
  expect(
    buildProductionGatingState(legacyOrder, { targetStatus: "Ready For Production" }).blocked
  ).toBe(false);
});

test("customer portal deposit action remains driven by existing order deposit fields", () => {
  const order = {
    order_number: "TC-PAY-1002",
    customer_id: "customer-id-2",
    deposit_required: true,
    deposit_requirement: "required",
    deposit_amount: 200,
    deposit_workflow_status: "Deposit Requested",
    quote_status: "Awaiting Deposit",
    payment_status: "Awaiting Deposit",
    payment_history: [],
  };

  backfillOrderPaymentsToPayments(order);

  expect(getPaymentsByOrder(order.order_number)).toHaveLength(0);
  expect(isDepositActionRequired(order)).toBe(true);
  expect(buildDepositPaymentRoute(order.order_number)).toBe("/portal/orders/TC-PAY-1002/deposit");
});

test("central payments repository records requests, payments, events, and customer queries", () => {
  const paymentRequest = createPaymentRequest({
    customer_id: "customer-id-3",
    order_number: "TC-PAY-1003",
    request_type: "deposit",
    status: "sent",
    amount_requested: 125,
    description: "Deposit request",
  });
  const payment = recordPayment({
    customer_id: "customer-id-3",
    order_number: "TC-PAY-1003",
    payment_request_id: paymentRequest.id,
    payment_type: "deposit",
    amount: 125,
    method: "E-Transfer",
    note: "Manual deposit received.",
  });

  expect(getPaymentRequestsByCustomer("customer-id-3")).toHaveLength(1);
  expect(getPaymentsByCustomer("customer-id-3")).toHaveLength(1);
  expect(getPaymentsByOrder("TC-PAY-1003")[0]).toMatchObject({
    id: payment.id,
    payment_request_id: paymentRequest.id,
    method: "e_transfer",
    amount: 125,
  });
  expect(getPaymentEventsByOrder("TC-PAY-1003").map((event) => event.event_type)).toEqual(
    expect.arrayContaining(["payment_request_created", "payment_recorded"])
  );
});
