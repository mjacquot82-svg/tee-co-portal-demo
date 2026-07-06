// @ts-check
import { expect, test } from "@playwright/test";
import { processSquareWebhookEvent } from "../src/services/squareWebhookProcessor.js";
import {
  createPaymentRequest,
  getPaymentRequestById,
  getStoredPaymentEvents,
  getStoredPaymentRequests,
  getStoredPayments,
  listPaymentEvents,
  listPaymentRequests,
  listPayments,
  recordPayment,
  resetStoredPaymentsForTests,
  saveStoredPaymentEvents,
  saveStoredPaymentRequests,
  saveStoredPayments,
  updatePayment,
  updatePaymentRequest,
} from "../src/lib/paymentsStore.js";
import {
  buildPaymentReconciliationInsights,
  getPaymentConfidenceLabel,
} from "../src/services/paymentReconciliation.js";
import { deriveOrderPaymentState } from "../src/orders/canonicalState.js";
import { buildProductionGatingState } from "../src/orders/workflowGating.js";

function squarePaymentEvent({
  eventId = "square-event-2a",
  eventType = "payment.updated",
  paymentId = "square-payment-2a",
  status = "COMPLETED",
  amount = 15000,
  createdAt = "2026-06-24T12:00:00.000Z",
  updatedAt = "2026-06-24T12:01:00.000Z",
} = {}) {
  return {
    id: eventId,
    type: eventType,
    created_at: updatedAt,
    data: {
      type: "payment",
      object: {
        payment: {
          id: paymentId,
          status,
          order_id: "square-order-2a",
          amount_money: {
            amount,
            currency: "CAD",
          },
          metadata: {
            payment_request_id: "payment-request-2a",
            order_number: "TC-SQ-2A",
            request_type: "deposit",
          },
          created_at: createdAt,
          updated_at: updatedAt,
        },
      },
    },
  };
}

function createSquareRequest(overrides = {}) {
  return createPaymentRequest({
    id: "payment-request-2a",
    request_number: "PR-SQ-2A",
    customer_id: "customer-2a",
    order_number: "TC-SQ-2A",
    request_type: "deposit",
    status: "sent",
    amount_requested: 150,
    payment_provider: "square",
    provider_order_id: "square-order-2a",
    provider_checkout_url: "https://square.link/u/2a",
    metadata: { source: "admin_payments_module" },
    ...overrides,
  });
}

function createOrder() {
  return {
    order_number: "TC-SQ-2A",
    customer_id: "customer-2a",
    deposit_required: true,
    deposit_requirement: "required",
    deposit_amount: 150,
    total_amount: 600,
    deposit_workflow_status: "Deposit Requested",
    payment_status: "Awaiting Deposit",
  };
}

test.beforeEach(() => {
  resetStoredPaymentsForTests();
});

test("out-of-order failed webhook cannot downgrade a completed Square payment", async () => {
  const request = createSquareRequest();
  await processSquareWebhookEvent(squarePaymentEvent({
    eventId: "square-event-completed",
    status: "COMPLETED",
    updatedAt: "2026-06-24T12:05:00.000Z",
  }));
  await processSquareWebhookEvent(squarePaymentEvent({
    eventId: "square-event-old-failed",
    eventType: "payment.failed",
    status: "FAILED",
    updatedAt: "2026-06-24T12:01:00.000Z",
  }));

  expect(getPaymentRequestById(request.id)).toMatchObject({
    status: "paid",
    amount_paid: 150,
  });
  expect(listPayments()).toHaveLength(1);
  expect(listPayments()[0]).toMatchObject({
    status: "captured",
    provider_payment_id: "square-payment-2a",
  });
  expect(
    listPaymentEvents().find((event) => event.payload?.square_event_id === "square-event-old-failed")?.payload
  ).toMatchObject({
    applied_to_request: false,
    skipped_reason: "existing_successful_payment_protects_state",
  });
});

test("later completed webhook upgrades an earlier failed Square payment without creating a duplicate", async () => {
  createSquareRequest();
  await processSquareWebhookEvent(squarePaymentEvent({
    eventId: "square-event-failed-first",
    eventType: "payment.failed",
    status: "FAILED",
    updatedAt: "2026-06-24T12:01:00.000Z",
  }));
  await processSquareWebhookEvent(squarePaymentEvent({
    eventId: "square-event-completed-later",
    status: "COMPLETED",
    updatedAt: "2026-06-24T12:07:00.000Z",
  }));

  expect(listPayments()).toHaveLength(1);
  expect(listPayments()[0]).toMatchObject({
    status: "captured",
    provider_payment_id: "square-payment-2a",
  });
  expect(getPaymentRequestById("payment-request-2a")).toMatchObject({
    status: "paid",
    amount_paid: 150,
  });
});

test("repeated completed webhooks for the same Square payment do not create a false failure", async () => {
  createSquareRequest();

  await processSquareWebhookEvent(squarePaymentEvent({
    eventId: "square-event-completed-repeat-1",
    paymentId: "square-payment-repeat",
    status: "COMPLETED",
    updatedAt: "2026-06-24T12:05:00.000Z",
  }));
  await processSquareWebhookEvent(squarePaymentEvent({
    eventId: "square-event-completed-repeat-2",
    paymentId: "square-payment-repeat",
    status: "COMPLETED",
    updatedAt: "2026-06-24T12:06:00.000Z",
  }));

  const request = getPaymentRequestById("payment-request-2a");
  const insights = buildPaymentReconciliationInsights({
    paymentRequest: request,
    payments: listPayments(),
    paymentEvents: listPaymentEvents(),
  });

  expect(listPayments()).toHaveLength(1);
  expect(insights.some((insight) => insight.code === "overpayment")).toBe(false);
  expect(deriveOrderPaymentState(createOrder())).toMatchObject({
    hasFailedPayment: false,
    depositSatisfied: true,
    ownerPaymentState: "Balance Due",
  });
});

test("stale Square overpayment payload does not fail a fully matched completed payment", async () => {
  createSquareRequest();
  await processSquareWebhookEvent(squarePaymentEvent({
    eventId: "square-event-completed-before-stale-payload",
    paymentId: "square-payment-stale-payload",
    status: "COMPLETED",
  }));

  saveStoredPaymentEvents([
    {
      id: "stale-overpayment-event",
      payment_id: listPayments()[0].id,
      payment_request_id: "payment-request-2a",
      order_number: "TC-SQ-2A",
      event_type: "square_payment_completed",
      event_source: "square_webhook",
      summary: "Square payment received for $150.00.",
      payload: {
        payment_confidence: "Manual Review Required",
        reconciliation_issues: [
          {
            code: "overpayment",
            severity: "high",
            label: "Overpayment",
            detail: "Recorded successful payments exceed the amount requested.",
          },
        ],
      },
      created_at: "2026-06-24T12:08:00.000Z",
    },
    ...listPaymentEvents(),
  ]);

  expect(deriveOrderPaymentState(createOrder())).toMatchObject({
    hasFailedPayment: false,
    depositSatisfied: true,
    ownerPaymentState: "Balance Due",
  });
});

test("duplicate successful Square attempts create manual review reconciliation and block production", async () => {
  createSquareRequest();
  await processSquareWebhookEvent(squarePaymentEvent({
    eventId: "square-event-success-1",
    paymentId: "square-payment-2a-1",
    status: "COMPLETED",
  }));
  await processSquareWebhookEvent(squarePaymentEvent({
    eventId: "square-event-success-2",
    paymentId: "square-payment-2a-2",
    status: "COMPLETED",
  }));

  const request = getPaymentRequestById("payment-request-2a");
  const insights = buildPaymentReconciliationInsights({
    paymentRequest: request,
    payments: listPayments(),
    paymentEvents: listPaymentEvents(),
  });

  expect(listPayments()).toHaveLength(2);
  expect(insights.some((insight) => insight.code === "overpayment")).toBe(true);
  expect(getPaymentConfidenceLabel(insights, request)).toBe("Manual Review Required");
  expect(deriveOrderPaymentState(createOrder())).toMatchObject({
    hasFailedPayment: true,
    depositSatisfied: true,
  });
  expect(buildProductionGatingState(createOrder(), { targetStatus: "Ready For Production" }).blocked).toBe(true);
});

test("manual plus Square payment conflict is detected and blocks production release", async () => {
  createSquareRequest();
  recordPayment({
    customer_id: "customer-2a",
    order_number: "TC-SQ-2A",
    payment_request_id: "payment-request-2a",
    payment_type: "deposit",
    status: "captured",
    amount: 150,
    method: "cash",
    provider: "manual",
  });

  await processSquareWebhookEvent(squarePaymentEvent({
    eventId: "square-event-success-manual-conflict",
    paymentId: "square-payment-2a-conflict",
    status: "COMPLETED",
  }));

  const request = getPaymentRequestById("payment-request-2a");
  const insights = buildPaymentReconciliationInsights({
    paymentRequest: request,
    payments: listPayments(),
    paymentEvents: listPaymentEvents(),
  });

  expect(insights.some((insight) => insight.code === "manual_square_conflict")).toBe(true);
  expect(getPaymentConfidenceLabel(insights, request)).toBe("Manual Review Required");
  expect(buildProductionGatingState(createOrder(), { targetStatus: "Ready For Production" }).blocked).toBe(true);
});

test("atomic webhook adapter rolls back request and payment writes when event persistence fails", async () => {
  createSquareRequest();
  const adapter = {
    listPaymentRequests,
    listPaymentEvents,
    listPayments,
    updatePaymentRequest,
    recordPayment,
    updatePayment,
    recordPaymentEvent() {
      throw new Error("payment event write failed");
    },
    async runAtomic(operation) {
      const requestSnapshot = getStoredPaymentRequests();
      const paymentSnapshot = getStoredPayments();
      const eventSnapshot = getStoredPaymentEvents();

      try {
        return await operation();
      } catch (error) {
        saveStoredPaymentRequests(requestSnapshot);
        saveStoredPayments(paymentSnapshot);
        saveStoredPaymentEvents(eventSnapshot);
        throw error;
      }
    },
  };

  await expect(
    processSquareWebhookEvent(squarePaymentEvent(), { adapter })
  ).rejects.toThrow("payment event write failed");

  expect(getPaymentRequestById("payment-request-2a")).toMatchObject({
    status: "sent",
    amount_paid: 0,
  });
  expect(listPayments()).toHaveLength(0);
  expect(listPaymentEvents().map((event) => event.event_type)).toEqual(["payment_request_created"]);
});
