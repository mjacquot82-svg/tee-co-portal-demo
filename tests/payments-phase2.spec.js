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
import {
  deriveOrderPaymentState,
  deriveOrderWorkflowState,
  getCurrentPaymentState,
  isBalancePaid,
  isDepositSatisfied,
} from "../src/orders/canonicalState.js";
import {
  deriveOwnerOrderNextAction,
  deriveOwnerPaymentRequestNextAction,
  deriveOwnerQuoteNextAction,
} from "../src/orders/ownerWorkflowActions.js";
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

test("canonical payment state prefers payment requests and payments over legacy fields", () => {
  const order = {
    order_number: "TC-P2-1004",
    customer_id: "customer-phase2-4",
    deposit_required: true,
    deposit_requirement: "required",
    deposit_amount: 250,
    total_amount: 800,
    deposit_workflow_status: "Deposit Requested",
    payment_status: "Awaiting Deposit",
    payment_collection_state: "Awaiting Deposit",
  };

  const request = createPaymentRequest({
    customer_id: order.customer_id,
    order_number: order.order_number,
    request_type: "deposit",
    status: "open",
    amount_requested: 250,
  });

  expect(getCurrentPaymentState(order).ownerPaymentState).toBe("Awaiting Payment");
  expect(isDepositSatisfied(order)).toBe(false);
  expect(buildProductionGatingState(order, { targetStatus: "Ready For Production" }).blocked).toBe(true);

  recordPayment({
    customer_id: order.customer_id,
    order_number: order.order_number,
    payment_request_id: request.id,
    payment_type: "deposit",
    status: "captured",
    amount: 250,
    method: "Cash",
  });

  const paymentState = deriveOrderPaymentState(order);
  expect(paymentState.ownerPaymentState).toBe("Balance Due");
  expect(paymentState.source).toBe("canonical_payments");
  expect(paymentState.depositSatisfied).toBe(true);
  expect(isBalancePaid(order)).toBe(false);
  expect(buildProductionGatingState(order, { targetStatus: "Ready For Production" }).blocked).toBe(false);
});

test("canonical payment state falls back to legacy fields when modern records are absent", () => {
  const order = {
    order_number: "TC-P2-1005",
    deposit_required: true,
    deposit_requirement: "required",
    deposit_amount: 150,
    total_amount: 150,
    deposit_workflow_status: "Deposit Received",
    invoice_status: "Paid",
    payment_status: "Paid",
    payment_history: [{ id: "legacy-deposit", amount: 150, method: "Cash" }],
  };

  const paymentState = deriveOrderPaymentState(order);

  expect(paymentState.source).toBe("legacy_order_fields");
  expect(paymentState.ownerPaymentState).toBe("Paid");
  expect(paymentState.depositSatisfied).toBe(true);
  expect(paymentState.balancePaid).toBe(true);
});

test("canonical workflow state derives customer and owner workflow labels consistently", () => {
  expect(
    deriveOrderWorkflowState({
      order_number: "TC-P2-1006",
      status: "New",
      artwork_approval_required: true,
      artwork_approval_status: "Pending Review",
      deposit_required: false,
    }).workflowState
  ).toBe("Artwork Needed");

  expect(
    deriveOrderWorkflowState({
      order_number: "TC-P2-1007",
      status: "New",
      quote_status: "Awaiting Approval",
      artwork_approval_required: false,
      deposit_required: false,
    }).workflowState
  ).toBe("Awaiting Quote Approval");

  expect(
    deriveOrderWorkflowState({
      order_number: "TC-P2-1008",
      status: "Printing",
      deposit_required: true,
      deposit_workflow_status: "Deposit Requested",
    }).workflowState
  ).toBe("In Production");

  expect(
    deriveOrderWorkflowState({
      order_number: "TC-P2-1009",
      status: "Canceled",
    }).workflowState
  ).toBe("Cancelled");
});

test("owner next actions guide payment request outreach and blocked production work", () => {
  const order = {
    order_number: "TC-P2-1010",
    customer_id: "customer-phase2-10",
    deposit_required: true,
    deposit_requirement: "required",
    deposit_amount: 175,
    total_amount: 700,
    deposit_workflow_status: "Deposit Requested",
    artwork_approval_required: false,
  };
  const request = createPaymentRequest({
    customer_id: order.customer_id,
    order_number: order.order_number,
    request_type: "deposit",
    status: "open",
    amount_requested: 175,
  });

  expect(deriveOwnerOrderNextAction(order)).toMatchObject({
    label: "Send or follow up on payment request",
    href: `/admin/financial/requests/${request.id}`,
    tone: "warning",
  });

  expect(deriveOwnerPaymentRequestNextAction(request, order)).toMatchObject({
    label: "Send now",
    actionKey: "mark_payment_request_sent",
  });

  const blockedOrder = {
    order_number: "TC-P2-1011",
    status: "New",
    deposit_required: false,
    artwork_approval_required: true,
    artwork_approval_status: "Pending Review",
  };

  expect(deriveOwnerOrderNextAction(blockedOrder)).toMatchObject({
    label: "View blocking reason",
    tone: "danger",
  });
});

test("owner next actions guide quote release and paid request follow-up", () => {
  const readyQuote = {
    order_number: "TC-P2-1012",
    quote_status: "Approved",
    deposit_required: false,
    artwork_approval_required: false,
  };
  const readiness = {
    ready: true,
    remainingRequirements: 0,
    checks: [],
  };

  expect(deriveOwnerQuoteNextAction(readyQuote, readiness)).toMatchObject({
    label: "Release to production",
    actionKey: "release_to_production",
    tone: "success",
  });

  const paidRequest = {
    id: "payment-request-paid",
    request_number: "PR-PAID",
    customer_id: "customer-phase2-12",
    order_number: "TC-P2-1013",
    request_type: "deposit",
    status: "paid",
    amount_requested: 200,
    amount_paid: 200,
    sent_at: "2026-06-01T12:00:00.000Z",
  };
  const paidOrder = {
    order_number: "TC-P2-1013",
    customer_id: "customer-phase2-12",
    status: "New",
    deposit_required: true,
    deposit_amount: 200,
    deposit_workflow_status: "Deposit Received",
    artwork_approval_required: false,
    payment_requests: [paidRequest],
  };

  expect(deriveOwnerPaymentRequestNextAction(paidRequest, paidOrder)).toMatchObject({
    label: "Release to production",
    tone: "success",
  });
});
