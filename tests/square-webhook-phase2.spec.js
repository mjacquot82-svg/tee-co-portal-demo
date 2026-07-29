// @ts-check
/* global process */
import { expect, test } from "@playwright/test";
import {
  buildPersistedOrderPaymentRollup,
  handler as squareWebhookHandler,
  syncSupabaseOrderPaymentState,
} from "../netlify/functions/square-webhook.js";
import {
  buildSquareWebhookSignature,
  processSquareWebhookEvent,
} from "../src/services/squareWebhookProcessor.js";
import {
  createPaymentRequest,
  getPaymentRequestById,
  listPaymentEvents,
  listPayments,
  resetStoredPaymentsForTests,
} from "../src/lib/paymentsStore.js";
import {
  listNotificationActivity,
  resetNotificationActivityForTests,
} from "../src/lib/notificationDeliveryService.js";
import { NOTIFICATION_TYPES } from "../src/lib/notificationTemplatesStore.js";
import { deriveOrderPaymentState } from "../src/orders/canonicalState.js";
import { buildProductionGatingState, isDepositRequirementSatisfied } from "../src/orders/workflowGating.js";
import { getCustomerPaymentStatusLabel } from "../src/customer-portal/customerPortalPayments.js";
import { normalizeOrderFinancials } from "../src/orders/orderFinancials.js";
import { buildDepositStatus } from "../src/quotes/productionReadiness.js";
import {
  resolveCustomerOrderStatus,
  resolveDepositWorkflowLabel,
} from "../src/customer-portal/CustomerPortalShared.jsx";
import { isDepositActionRequired } from "../src/lib/depositPaymentProviders.js";
import { buildOwnerWorkspaceModel } from "../src/admin/Dashboard.jsx";
import {
  matchesProductionStatus,
  normalizeProductionOrder,
} from "../src/production/productionWorkspace.js";

const notificationUrl = "https://teeandco.test/.netlify/functions/square-webhook";
const signatureKey = "square-webhook-test-key";

function restoreEnvValue(key, value) {
  if (value == null) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

function squarePaymentEvent(overrides = {}) {
  const payment = {
    id: "square-payment-1001",
    status: "COMPLETED",
    order_id: "square-order-1001",
    location_id: "square-location-1",
    receipt_url: "https://squareup.com/receipt/1001",
    amount_money: {
      amount: 15000,
      currency: "CAD",
    },
    metadata: {
      payment_request_id: "payment-request-square-webhook",
      order_number: "TC-SQ-WH-1001",
      request_type: "deposit",
    },
    created_at: "2026-06-24T12:00:00.000Z",
    updated_at: "2026-06-24T12:01:00.000Z",
    ...overrides.payment,
  };

  return {
    id: "square-event-1001",
    type: "payment.updated",
    created_at: "2026-06-24T12:01:30.000Z",
    data: {
      type: "payment",
      object: {
        payment,
      },
    },
    ...overrides.event,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeSupabaseQuery {
  constructor(client, tableName) {
    this.client = client;
    this.tableName = tableName;
    this.operation = "select";
    this.payload = null;
    this.filters = [];
    this.singleMode = null;
  }

  select() {
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload || {};
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  catch(reject) {
    return Promise.resolve(this.execute()).catch(reject);
  }

  tableRows() {
    return this.client.tables[this.tableName] || [];
  }

  applyFilters(rows) {
    return rows.filter((row) =>
      this.filters.every((filter) => String(row[filter.column] || "") === String(filter.value))
    );
  }

  formatResult(rows) {
    if (this.singleMode === "maybe") {
      return { data: rows[0] ? clone(rows[0]) : null, error: null };
    }
    return { data: clone(rows), error: null };
  }

  execute() {
    const rows = this.tableRows();
    if (this.operation === "insert") {
      rows.push(...this.payload.map(clone));
      return this.formatResult(this.payload);
    }
    if (this.operation === "update") {
      const updatedRows = [];
      rows.forEach((row, index) => {
        if (!this.applyFilters([row]).length) return;
        rows[index] = { ...row, ...clone(this.payload) };
        updatedRows.push(rows[index]);
      });
      return this.formatResult(updatedRows);
    }
    return this.formatResult(this.applyFilters(rows));
  }
}

class FakeSupabaseClient {
  constructor(seed = {}) {
    this.tables = {
      orders: clone(seed.orders || []),
      payment_requests: clone(seed.payment_requests || []),
      payments: clone(seed.payments || []),
      payment_events: clone(seed.payment_events || []),
      activity_logs: clone(seed.activity_logs || []),
    };
  }

  from(tableName) {
    return new FakeSupabaseQuery(this, tableName);
  }

  rows(tableName) {
    return clone(this.tables[tableName] || []);
  }
}

test.beforeEach(() => {
  resetStoredPaymentsForTests();
  resetNotificationActivityForTests();
});

test("valid Square completed webhook synchronizes payment state and production gating", async () => {
  const request = createPaymentRequest({
    id: "payment-request-square-webhook",
    request_number: "PR-SQ-WH-1001",
    customer_id: "customer-square-webhook",
    order_number: "TC-SQ-WH-1001",
    request_type: "deposit",
    status: "sent",
    amount_requested: 150,
    amount_paid: 0,
    payment_provider: "square",
    provider_order_id: "square-order-1001",
    provider_payment_link_id: "square-link-1001",
    provider_checkout_url: "https://square.link/u/1001",
    metadata: { source: "admin_payments_module" },
  });
  const order = {
    order_number: request.order_number,
    customer_id: request.customer_id,
    deposit_required: true,
    deposit_requirement: "required",
    deposit_amount: 150,
    total_amount: 600,
    deposit_workflow_status: "Deposit Requested",
    payment_status: "Awaiting Deposit",
  };

  const result = await processSquareWebhookEvent(squarePaymentEvent());

  expect(result).toMatchObject({
    processed: true,
    duplicate: false,
    status: "captured",
  });
  expect(listPayments()).toHaveLength(1);
  expect(listPayments()[0]).toMatchObject({
    payment_request_id: request.id,
    provider: "square",
    provider_payment_id: "square-payment-1001",
    amount: 150,
    status: "captured",
    idempotency_key: "square-payment:square-payment-1001",
  });
  expect(getPaymentRequestById(request.id)).toMatchObject({
    status: "paid",
    amount_paid: 150,
  });
  expect(listPaymentEvents().some((event) => event.event_type === "square_payment_completed")).toBe(true);
  expect(deriveOrderPaymentState(order)).toMatchObject({
    depositSatisfied: true,
    totalPaid: 150,
    balanceDue: 450,
    source: "canonical_payments",
  });
  expect(isDepositRequirementSatisfied(order)).toBe(true);
  expect(buildProductionGatingState(order, { targetStatus: "Ready For Production" }).blocked).toBe(false);
  expect(listNotificationActivity().some((record) => record.eventType === NOTIFICATION_TYPES.paymentReceived)).toBe(true);
});

test("successful Square payment updates stale order financial rollup for admin and portal views", async () => {
  const supabase = new FakeSupabaseClient({
    orders: [
      {
        id: "order-square-rollup",
        order_number: "TC-SQ-WH-ROLLUP",
        status: "New",
        quote_status: "Awaiting Deposit",
        payment_status: "Awaiting Deposit",
        payment_collection_state: "Awaiting Deposit",
        deposit_status: "not_requested",
        deposit_workflow_status: "Deposit Requested",
        deposit_required: true,
        deposit_requirement: "required",
        deposit_amount: 150,
        deposit_paid_amount: 0,
        deposit_applied: 0,
        deposit_outstanding: 150,
        total_paid: 0,
        amount_paid: 0,
        paid_to_date: 0,
        total_amount: 600,
        balance_due: 600,
        activity_log: [],
      },
    ],
    payment_requests: [
      {
        id: "payment-request-square-rollup",
        request_number: "PR-SQ-WH-ROLLUP",
        order_number: "TC-SQ-WH-ROLLUP",
        request_type: "deposit",
        status: "paid",
        amount_requested: 150,
        amount_paid: 150,
        paid_at: "2026-06-24T12:01:00.000Z",
      },
    ],
    payments: [
      {
        id: "payment-square-rollup",
        order_number: "TC-SQ-WH-ROLLUP",
        payment_request_id: "payment-request-square-rollup",
        payment_type: "deposit",
        status: "captured",
        amount: 150,
        provider: "square",
        provider_payment_id: "square-payment-rollup",
        provider_status: "COMPLETED",
        captured_at: "2026-06-24T12:01:00.000Z",
      },
    ],
  });

  await syncSupabaseOrderPaymentState(
    supabase,
    supabase.rows("payments")[0],
    supabase.rows("payment_requests")[0]
  );

  expect(supabase.rows("payment_requests")[0]).toMatchObject({
    status: "paid",
    amount_paid: 150,
  });
  expect(supabase.rows("payments")[0]).toMatchObject({
    status: "captured",
    amount: 150,
  });

  const updatedOrder = supabase.rows("orders")[0];
  expect(updatedOrder).toMatchObject({
    status: "Ready For Production",
    operational_visible: true,
    production_ready: true,
    total_paid: 150,
    deposit_applied: 150,
    deposit_outstanding: 0,
    payment_collection_state: "Awaiting Final Payment",
    quote_status: "Ready For Production",
    deposit_workflow_status: "Deposit Received",
    deposit_status: "paid",
    balance_due: 450,
  });

  const adminFinancials = normalizeOrderFinancials(updatedOrder);
  expect(adminFinancials).toMatchObject({
    total_paid: 150,
    deposit_applied: 150,
    deposit_outstanding: 0,
    payment_collection_state: "Awaiting Final Payment",
  });
  expect(buildDepositStatus(updatedOrder, adminFinancials)).toBe("Deposit Received");
  expect(resolveCustomerOrderStatus(updatedOrder)).not.toMatchObject({ label: "Payment Due" });
  expect(resolveDepositWorkflowLabel(updatedOrder)).toBe("$150.00 Received");
  expect(isDepositActionRequired(updatedOrder)).toBe(false);

  const dashboard = buildOwnerWorkspaceModel([updatedOrder], []);
  expect(
    dashboard.readyItems.find((item) => item.key === "ready-for-production")
  ).toMatchObject({ count: 1 });
  expect(
    matchesProductionStatus(
      normalizeProductionOrder(updatedOrder),
      "ready-for-production"
    )
  ).toBe(true);
});

test("Square order reconciliation writes only production order columns", () => {
  const persistedRollup = buildPersistedOrderPaymentRollup({
    total_paid: 1,
    amount_paid: 1,
    paid_to_date: 1,
    balance_due: 99,
    deposit_workflow_status: "Deposit Received",
  });

  expect(persistedRollup).toEqual({
    total_paid: 1,
    balance_due: 99,
    deposit_workflow_status: "Deposit Received",
  });
  expect(persistedRollup).not.toHaveProperty("amount_paid");
  expect(persistedRollup).not.toHaveProperty("paid_to_date");
});

test("Square webhook endpoint rejects invalid signatures before processing", async () => {
  const previousSignatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const previousNotificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL;
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = signatureKey;
  process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = notificationUrl;

  const response = await squareWebhookHandler({
    httpMethod: "POST",
    path: "/.netlify/functions/square-webhook",
    headers: {
      "x-square-hmacsha256-signature": "not-valid",
      host: "teeandco.test",
    },
    body: JSON.stringify(squarePaymentEvent()),
  });

  expect(response.statusCode).toBe(401);
  expect(JSON.parse(response.body)).toMatchObject({
    error: "Invalid Square webhook signature.",
  });

  restoreEnvValue("SQUARE_WEBHOOK_SIGNATURE_KEY", previousSignatureKey);
  restoreEnvValue("SQUARE_WEBHOOK_NOTIFICATION_URL", previousNotificationUrl);
});

test("duplicate Square webhook events do not create duplicate payments or notifications", async () => {
  createPaymentRequest({
    id: "payment-request-square-webhook",
    customer_id: "customer-square-webhook",
    order_number: "TC-SQ-WH-1001",
    request_type: "deposit",
    status: "sent",
    amount_requested: 150,
    payment_provider: "square",
    provider_order_id: "square-order-1001",
  });
  const event = squarePaymentEvent();

  await processSquareWebhookEvent(event);
  const duplicateResult = await processSquareWebhookEvent(event);

  expect(duplicateResult).toMatchObject({
    processed: false,
    duplicate: true,
  });
  expect(listPayments()).toHaveLength(1);
  expect(
    listPaymentEvents().filter((paymentEvent) => paymentEvent.event_type === "square_payment_completed")
  ).toHaveLength(1);
  expect(
    listNotificationActivity().filter((record) => record.eventType === NOTIFICATION_TYPES.paymentReceived)
  ).toHaveLength(2);
});

test("failed Square webhook updates request state, blocks production, and generates payment failed notification", async () => {
  const request = createPaymentRequest({
    id: "payment-request-square-webhook",
    customer_id: "customer-square-webhook",
    order_number: "TC-SQ-WH-1001",
    request_type: "deposit",
    status: "sent",
    amount_requested: 150,
    payment_provider: "square",
    provider_order_id: "square-order-1001",
    provider_checkout_url: "https://square.link/u/1001",
  });
  const order = {
    order_number: request.order_number,
    customer_id: request.customer_id,
    deposit_required: true,
    deposit_requirement: "required",
    deposit_amount: 150,
    deposit_workflow_status: "Deposit Requested",
  };

  await processSquareWebhookEvent(
    squarePaymentEvent({
      event: { id: "square-event-failed-1001", type: "payment.failed" },
      payment: { id: "square-payment-failed-1001", status: "FAILED" },
    })
  );

  expect(getPaymentRequestById(request.id)).toMatchObject({
    status: "failed",
    amount_paid: 0,
  });
  expect(listPayments()[0]).toMatchObject({
    status: "failed",
    provider_payment_id: "square-payment-failed-1001",
  });
  expect(deriveOrderPaymentState(order)).toMatchObject({
    hasFailedPayment: true,
    depositSatisfied: false,
    ownerPaymentState: "Payment Failed",
  });
  expect(buildProductionGatingState(order, { targetStatus: "Ready For Production" }).blocked).toBe(true);
  expect(listNotificationActivity().some((record) => record.eventType === NOTIFICATION_TYPES.paymentFailed)).toBe(true);
  expect(listNotificationActivity().some((record) => record.eventType === NOTIFICATION_TYPES.paymentReceived)).toBe(false);
  expect(getCustomerPaymentStatusLabel(getPaymentRequestById(request.id))).toBe("Payment Failed");
});

test("processing Square webhook updates customer-visible status without satisfying deposit", async () => {
  const request = createPaymentRequest({
    id: "payment-request-square-webhook",
    customer_id: "customer-square-webhook",
    order_number: "TC-SQ-WH-1001",
    request_type: "deposit",
    status: "sent",
    amount_requested: 150,
    payment_provider: "square",
    provider_order_id: "square-order-1001",
  });

  await processSquareWebhookEvent(
    squarePaymentEvent({
      event: { id: "square-event-processing-1001", type: "payment.created" },
      payment: { id: "square-payment-processing-1001", status: "PENDING" },
    })
  );

  expect(getPaymentRequestById(request.id)).toMatchObject({
    status: "processing",
    amount_paid: 0,
  });
  expect(listPayments()).toHaveLength(0);
  expect(getCustomerPaymentStatusLabel(getPaymentRequestById(request.id))).toBe("Processing");
});

test("unmatched Square terminal events do not crash webhook processing", async () => {
  const result = await processSquareWebhookEvent(
    squarePaymentEvent({
      event: { id: "square-event-unmatched-1001", type: "payment.updated" },
      payment: {
        id: "square-payment-unmatched-1001",
        order_id: "square-order-unmatched",
        metadata: {},
      },
    })
  );

  expect(result).toMatchObject({
    processed: true,
    status: "captured",
    paymentRequest: null,
  });
  expect(listPayments()[0]).toMatchObject({
    provider: "square",
    provider_payment_id: "square-payment-unmatched-1001",
    payment_request_id: null,
  });
  expect(listPaymentEvents()[0]).toMatchObject({
    event_type: "square_payment_completed",
    payment_request_id: null,
  });
});

test("Square signature helper accepts valid Square-style HMAC signatures", async () => {
  const body = JSON.stringify(squarePaymentEvent());
  const signature = await buildSquareWebhookSignature({
    signatureKey,
    notificationUrl,
    body,
  });
  const previousSignatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const previousNotificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL;
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = signatureKey;
  process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = notificationUrl;

  const response = await squareWebhookHandler({
    httpMethod: "POST",
    path: "/.netlify/functions/square-webhook",
    headers: {
      "x-square-hmacsha256-signature": signature,
      host: "teeandco.test",
    },
    body,
  });

  expect(response.statusCode).toBe(501);
  expect(JSON.parse(response.body)).toMatchObject({
    error: "Webhook persistence is not configured.",
  });

  restoreEnvValue("SQUARE_WEBHOOK_SIGNATURE_KEY", previousSignatureKey);
  restoreEnvValue("SQUARE_WEBHOOK_NOTIFICATION_URL", previousNotificationUrl);
});
