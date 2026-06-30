// @ts-check
import { expect, test } from "@playwright/test";
import {
  buildSquarePaymentLinkPayload,
  buildSquarePaymentRequestUpdates,
  createSquarePaymentLink,
  hasProviderCheckoutUrl,
  sendSquarePaymentRequest,
} from "../src/services/squareService.js";
import {
  createPaymentRequest,
  getPaymentRequestById,
  listPaymentEvents,
  resetStoredPaymentsForTests,
  updatePaymentRequest,
} from "../src/lib/paymentsStore.js";
import {
  findPaymentRequestForOrder,
  getCustomerPortalPaymentData,
} from "../src/customer-portal/customerPortalPayments.js";
import { isDepositRequirementSatisfied } from "../src/orders/workflowGating.js";

test.beforeEach(() => {
  resetStoredPaymentsForTests();
});

test("Square payment link creation sends an idempotent provider payload", async () => {
  const request = createPaymentRequest({
    id: "payment-request-square-1",
    request_number: "PR-SQUARE-1",
    customer_id: "customer-square-1",
    order_number: "TC-SQ-1001",
    request_type: "deposit",
    status: "open",
    amount_requested: 250,
    amount_paid: 50,
    currency: "CAD",
    description: "Deposit request",
    metadata: { source: "admin_payments_module" },
  });
  const calls = [];

  const providerLink = await createSquarePaymentLink(request, {
    endpoint: "/square-test",
    disableFallback: true,
    fetcher: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(String(options.body)) });
      return {
        ok: true,
        json: async () => ({
          mode: "sandbox",
          idempotency_key: calls[0].body.idempotency_key,
          payment_link: {
            id: "LNK-SQUARE-1001",
            url: "https://square.link/u/test-square-1001",
            order_id: "ORD-SQUARE-1001",
            status: "created",
            created_at: "2026-06-24T12:00:00.000Z",
          },
        }),
      };
    },
  });

  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("/square-test");
  expect(calls[0].body).toMatchObject({
    idempotency_key: "square-payment-link:payment-request-square-1",
    payment_request_id: "payment-request-square-1",
    order_number: "TC-SQ-1001",
    amount: 200,
    currency: "CAD",
  });
  expect(providerLink).toMatchObject({
    provider: "square",
    provider_checkout_url: "https://square.link/u/test-square-1001",
    provider_payment_link_id: "LNK-SQUARE-1001",
    provider_order_id: "ORD-SQUARE-1001",
    provider_status: "created",
  });
});

test("Square payment link response can resolve provider order id from related resources", async () => {
  const request = createPaymentRequest({
    id: "payment-request-square-related-order",
    request_number: "PR-SQUARE-RELATED",
    customer_id: "customer-square-related",
    order_number: "TC-SQ-RELATED",
    request_type: "balance",
    status: "open",
    amount_requested: 125,
  });

  const providerLink = await createSquarePaymentLink(request, {
    endpoint: "/square-test",
    disableFallback: true,
    fetcher: async () => ({
      ok: true,
      json: async () => ({
        mode: "production",
        payment_link: {
          id: "LNK-SQUARE-RELATED",
          url: "https://square.link/u/related",
          status: "created",
        },
        related_resources: {
          orders: [{ id: "ORD-SQUARE-RELATED" }],
        },
      }),
    }),
  });

  expect(providerLink).toMatchObject({
    provider_payment_link_id: "LNK-SQUARE-RELATED",
    provider_order_id: "ORD-SQUARE-RELATED",
  });
});

test("Square provider metadata persists on the payment request without satisfying production gating", async () => {
  const order = {
    order_number: "TC-SQ-1002",
    customer_id: "customer-square-2",
    deposit_required: true,
    deposit_requirement: "required",
    deposit_amount: 150,
    deposit_workflow_status: "Deposit Requested",
    payment_status: "Awaiting Deposit",
  };
  const request = createPaymentRequest({
    id: "payment-request-square-2",
    request_number: "PR-SQUARE-2",
    customer_id: order.customer_id,
    order_number: order.order_number,
    request_type: "deposit",
    status: "open",
    amount_requested: 150,
    metadata: { source: "admin_payments_module" },
  });
  const providerLink = await createSquarePaymentLink(request, { useLocalFallback: true });
  const updated = updatePaymentRequest(request.id, {
    ...buildSquarePaymentRequestUpdates(request, providerLink),
    status: "sent",
    sent_at: "2026-06-24T12:05:00.000Z",
  });

  expect(updated).toMatchObject({
    payment_provider: "square",
    provider_checkout_url: expect.stringContaining("https://square.link/u/"),
    provider_payment_link_id: "local-payment-request-square-2",
    status: "sent",
  });
  expect(getPaymentRequestById(request.id)?.metadata?.square_payment_link).toMatchObject({
    id: "local-payment-request-square-2",
    checkout_url: expect.stringContaining("https://square.link/u/"),
    status: "created",
  });
  expect(isDepositRequirementSatisfied(order)).toBe(false);
  expect(listPaymentEvents().map((event) => event.event_type)).toEqual(
    expect.arrayContaining(["payment_request_created", "payment_request_updated"])
  );
});

test("new payment request creation flow can immediately create and send Square checkout", async () => {
  const request = createPaymentRequest({
    id: "payment-request-square-created-flow",
    request_number: "PR-SQUARE-CREATED",
    customer_id: "customer-square-created",
    order_number: "TC-SQ-CREATED",
    request_type: "deposit",
    status: "open",
    amount_requested: 1,
    payment_provider: "manual",
    metadata: { source: "admin_payments_module" },
  });

  const result = await sendSquarePaymentRequest(request, {
    sentAt: "2026-06-24T12:10:00.000Z",
    squareLinkOptions: {
      endpoint: "/square-test",
      disableFallback: true,
      fetcher: async () => ({
        ok: true,
        json: async () => ({
          mode: "production",
          idempotency_key: "square-payment-link:payment-request-square-created-flow",
          payment_link: {
            id: "LNK-SQUARE-CREATED",
            url: "https://square.link/u/created-flow",
            order_id: "ORD-SQUARE-CREATED",
            status: "created",
            created_at: "2026-06-24T12:10:00.000Z",
          },
        }),
      }),
    },
  });

  expect(result.paymentRequest).toMatchObject({
    id: request.id,
    status: "sent",
    payment_provider: "square",
    provider_checkout_url: "https://square.link/u/created-flow",
    provider_payment_link_id: "LNK-SQUARE-CREATED",
    provider_order_id: "ORD-SQUARE-CREATED",
    sent_at: "2026-06-24T12:10:00.000Z",
  });
  expect(getPaymentRequestById(request.id)).toMatchObject({
    payment_provider: "square",
    provider_checkout_url: "https://square.link/u/created-flow",
  });
  expect(listPaymentEvents().map((event) => event.event_type)).toEqual(
    expect.arrayContaining([
      "payment_request_created",
      "square_payment_link_created",
      "payment_request_updated",
      "payment_request_sent",
    ])
  );

  const portalPayments = getCustomerPortalPaymentData({
    orders: [{ order_number: "TC-SQ-CREATED", customer_id: "customer-square-created" }],
    customerIds: ["customer-square-created"],
    paymentRequests: [getPaymentRequestById(request.id)],
    payments: [],
    paymentEvents: listPaymentEvents(),
  });
  const portalRequest = findPaymentRequestForOrder(portalPayments.paymentRequests, "TC-SQ-CREATED", "deposit");

  expect(portalRequest).toMatchObject({
    id: request.id,
    payment_provider: "square",
    provider_checkout_url: "https://square.link/u/created-flow",
  });
  expect(hasProviderCheckoutUrl(portalRequest)).toBe(true);
});

test("customer portal Pay Now eligibility requires a valid provider checkout URL", () => {
  expect(
    hasProviderCheckoutUrl({
      payment_provider: "square",
      provider_checkout_url: "https://square.link/u/customer-request",
    })
  ).toBe(true);

  expect(hasProviderCheckoutUrl({ payment_provider: "manual", provider_checkout_url: "" })).toBe(false);
  expect(hasProviderCheckoutUrl({ payment_provider: "square", provider_checkout_url: "/not-external" })).toBe(false);
});

test("Square payload preserves legacy compatibility by using remaining balance only", () => {
  const payload = buildSquarePaymentLinkPayload({
    id: "payment-request-square-4",
    request_number: "PR-SQUARE-4",
    order_number: "TC-SQ-1004",
    customer_id: "customer-square-4",
    request_type: "balance",
    amount_requested: 500,
    amount_paid: 125,
    currency: "CAD",
  });

  expect(payload).toMatchObject({
    idempotency_key: "square-payment-link:payment-request-square-4",
    amount: 375,
    currency: "CAD",
    metadata: {
      payment_request_id: "payment-request-square-4",
      request_number: "PR-SQUARE-4",
      order_number: "TC-SQ-1004",
    },
  });
});
