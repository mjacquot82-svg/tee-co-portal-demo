// @ts-check
import { expect, test } from "@playwright/test";
import {
  createPaymentRequest,
  listPaymentEvents,
  listPayments,
  recordPayment,
  resetStoredPaymentsForTests,
} from "../src/lib/paymentsStore.js";
import {
  buildPaymentExceptionQueue,
  buildPaymentReconciliationInsights,
  getPaymentConfidenceLabel,
} from "../src/services/paymentReconciliation.js";
import {
  buildReconciliationReviewKey,
  listPaymentReconciliationReviews,
  resetPaymentReconciliationReviewsForTests,
  upsertPaymentReconciliationReview,
} from "../src/lib/paymentReconciliationStore.js";
import {
  processSquareWebhookEvent,
  recordSquareWebhookProcessingFailure,
} from "../src/services/squareWebhookProcessor.js";

function createRequest(overrides = {}) {
  return createPaymentRequest({
    id: "payment-request-2b",
    request_number: "PR-SQ-2B",
    customer_id: "customer-2b",
    order_number: "TC-SQ-2B",
    request_type: "deposit",
    status: "sent",
    amount_requested: 150,
    payment_provider: "square",
    provider_order_id: "square-order-2b",
    provider_checkout_url: "https://square.link/u/2b",
    metadata: { source: "admin_payments_module" },
    ...overrides,
  });
}

function squarePaymentEvent({
  eventId = "square-event-2b",
  paymentId = "square-payment-2b",
  status = "COMPLETED",
  amount = 15000,
} = {}) {
  return {
    id: eventId,
    type: "payment.updated",
    created_at: "2026-06-24T12:01:00.000Z",
    data: {
      type: "payment",
      object: {
        payment: {
          id: paymentId,
          status,
          order_id: "square-order-2b",
          amount_money: {
            amount,
            currency: "CAD",
          },
          metadata: {
            payment_request_id: "payment-request-2b",
            order_number: "TC-SQ-2B",
            request_type: "deposit",
          },
          created_at: "2026-06-24T12:00:00.000Z",
          updated_at: "2026-06-24T12:01:00.000Z",
        },
      },
    },
  };
}

test.beforeEach(() => {
  resetStoredPaymentsForTests();
  resetPaymentReconciliationReviewsForTests();
});

test("payment exception queue includes overpayments and removes resolved duplicate reviews", async () => {
  const request = createRequest();
  await processSquareWebhookEvent(squarePaymentEvent({ eventId: "event-1", paymentId: "payment-1" }));
  await processSquareWebhookEvent(squarePaymentEvent({ eventId: "event-2", paymentId: "payment-2" }));

  const queue = buildPaymentExceptionQueue({
    paymentRequests: [request],
    payments: listPayments(),
    paymentEvents: listPaymentEvents(),
    reviews: listPaymentReconciliationReviews(),
  });
  const overpayment = queue.find((item) => item.insight.code === "overpayment");

  expect(overpayment).toBeTruthy();
  expect(overpayment.confidence).toBe("Manual Review Required");

  upsertPaymentReconciliationReview({
    reviewKey: buildReconciliationReviewKey(request, overpayment.insight),
    paymentRequest: request,
    insight: overpayment.insight,
    action: "resolve_duplicate",
  });

  const queueAfterReview = buildPaymentExceptionQueue({
    paymentRequests: [request],
    payments: listPayments(),
    paymentEvents: listPaymentEvents(),
    reviews: listPaymentReconciliationReviews(),
  });

  expect(queueAfterReview.some((item) => item.insight.code === "overpayment")).toBe(false);
  expect(listPaymentEvents().some((event) => event.event_type === "payment_reconciliation_reviewed")).toBe(true);
});

test("manual plus Square conflict remains actionable after mark reviewed", async () => {
  const request = createRequest();
  recordPayment({
    customer_id: "customer-2b",
    order_number: "TC-SQ-2B",
    payment_request_id: request.id,
    payment_type: "deposit",
    status: "captured",
    amount: 150,
    provider: "manual",
    method: "cash",
  });
  await processSquareWebhookEvent(squarePaymentEvent({ paymentId: "square-payment-conflict" }));
  const insights = buildPaymentReconciliationInsights({
    paymentRequest: request,
    payments: listPayments(),
    paymentEvents: listPaymentEvents(),
  });
  const conflict = insights.find((insight) => insight.code === "manual_square_conflict");

  upsertPaymentReconciliationReview({
    reviewKey: buildReconciliationReviewKey(request, conflict),
    paymentRequest: request,
    insight: conflict,
    action: "mark_reviewed",
  });

  const reviewedInsights = buildPaymentReconciliationInsights({
    paymentRequest: request,
    payments: listPayments(),
    paymentEvents: listPaymentEvents(),
    reviews: listPaymentReconciliationReviews(),
  });

  expect(getPaymentConfidenceLabel(reviewedInsights, request)).toBe("Manual Review Required");
});

test("webhook processing failures are audited without blocking safe retry", async () => {
  const request = createRequest();
  await recordSquareWebhookProcessingFailure(
    squarePaymentEvent({ eventId: "event-retry", paymentId: "payment-retry" }),
    new Error("temporary database failure")
  );

  const failureQueue = buildPaymentExceptionQueue({
    paymentRequests: [request],
    payments: listPayments(),
    paymentEvents: listPaymentEvents(),
    reviews: listPaymentReconciliationReviews(),
  });

  expect(failureQueue.some((item) => item.insight.code === "webhook_processing_failed")).toBe(true);

  await processSquareWebhookEvent(squarePaymentEvent({ eventId: "event-retry", paymentId: "payment-retry" }));

  expect(listPayments()).toHaveLength(1);
  expect(listPayments()[0]).toMatchObject({
    provider_payment_id: "payment-retry",
    status: "captured",
  });
});

test("payment mismatch appears in owner exception queue", async () => {
  const request = createRequest();
  await processSquareWebhookEvent(squarePaymentEvent({ amount: 12500 }));

  const queue = buildPaymentExceptionQueue({
    paymentRequests: [request],
    payments: listPayments(),
    paymentEvents: listPaymentEvents(),
    reviews: listPaymentReconciliationReviews(),
  });

  expect(queue.some((item) => item.insight.code === "payment_mismatch")).toBe(true);
});

test("reconciliation review actions create complete audit history", () => {
  const request = createRequest();
  const insight = {
    code: "manual_square_conflict",
    severity: "high",
    label: "Manual Review Required",
    detail: "Manual and Square payments are both connected to this request or order.",
  };

  upsertPaymentReconciliationReview({
    reviewKey: buildReconciliationReviewKey(request, insight),
    paymentRequest: request,
    insight,
    action: "ignore_false_positive",
  });

  expect(listPaymentReconciliationReviews()).toHaveLength(1);
  expect(listPaymentReconciliationReviews()[0]).toMatchObject({
    action: "ignore_false_positive",
    payment_request_id: request.id,
    issue_code: "manual_square_conflict",
  });
  expect(listPaymentEvents().find((event) => event.event_type === "payment_reconciliation_reviewed")).toMatchObject({
    payment_request_id: request.id,
    event_source: "staff",
  });
});
