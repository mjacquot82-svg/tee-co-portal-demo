// @ts-check
import { expect, test } from "@playwright/test";
import { handler } from "../netlify/functions/customer-notification.js";
import {
  didOrderEnterProductionNotificationState,
  didOrderEnterQuoteApprovedState,
} from "../src/lib/ordersStore.js";
import { buildProductionReadyWorkflowUpdates } from "../src/quotes/productionReadiness.js";

test("approval delivery rejects the retired unrendered legacy email path", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CUSTOMER_NOTIFICATION_FROM_EMAIL: process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const requests = [];

  process.env.RESEND_API_KEY = "resend-test-key";
  process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL = "Tee & Co <orders@example.com>";
  process.env.SUPABASE_URL = "https://supabase.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return { ok: true, status: 200, json: async () => ({ id: "email-2001" }) };
  };

  try {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        eventType: "quote_approved",
        orderNumber: "TC-APPROVED-2001",
        idempotencyKey: "quote_approved:TC-APPROVED-2001:customer",
      }),
    });

    expect(response.statusCode).toBe(409);
    expect(requests).toHaveLength(0);
    expect(JSON.parse(response.body)).toMatchObject({
      error:
        "Customer email delivery requires an authoritative rendered Delivery.",
    });
  } finally {
    globalThis.fetch = originalFetch;
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test("customer email endpoint dispatches an authoritative lifecycle Delivery", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CUSTOMER_NOTIFICATION_FROM_EMAIL:
      process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER:
      process.env.NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER,
  };
  const providerRequests = [];

  process.env.RESEND_API_KEY = "resend-test-key";
  process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL =
    "Tee & Co <orders@example.com>";
  process.env.SUPABASE_URL = "https://supabase.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER = "true";

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/rpc/claim_resend_email_delivery_cutover")) {
      return {
        ok: true,
        json: async () => [{
          delivery: {
            id: "delivery:pickup-email",
            notification_id: "notification:pickup-email",
            channel: "email",
            status: "processing",
            claim_token: "claim:pickup-email",
            claimed_at: "2026-07-27T19:00:00.000Z",
            attempt_count: 0,
            idempotency_key: "delivery:pickup-email",
            destination_snapshot: {
              email: "customer@example.com",
              observationOnly: false,
            },
            rendered_content: {
              subject: "Your order is ready",
              body: "Stored pickup body",
            },
          },
          notification: {
            id: "notification:pickup-email",
            business_event_id: "event:pickup-email",
            event_type: "order_ready_for_pickup",
          },
          business_event: { id: "event:pickup-email" },
        }],
      };
    }
    if (requestUrl.endsWith("/rpc/complete_resend_email_delivery_cutover")) {
      return {
        ok: true,
        json: async () => ({
          id: "delivery:pickup-email",
          status: "sent",
        }),
      };
    }
    providerRequests.push({ url: requestUrl, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "resend-pickup-email" }),
    };
  };

  try {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        eventType: "order_ready_for_pickup",
        deliveryId: "delivery:pickup-email",
        idempotencyKey: "delivery:pickup-email",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      delivered: true,
      providerMessageId: "resend-pickup-email",
    });
    expect(providerRequests).toHaveLength(1);
    expect(JSON.parse(providerRequests[0].options.body)).toMatchObject({
      to: ["customer@example.com"],
      subject: "Your order is ready",
      text: "Stored pickup body",
    });
  } finally {
    globalThis.fetch = originalFetch;
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test("approval notification remains attached to the persisted approval transition", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/lib/ordersStore.js", import.meta.url), "utf8")
  );

  expect(source).toContain("!isApprovedState(previousApprovalStatus) && isApprovedState(nextApprovalStatus)");
  expect(source).toContain("triggerOrderNotification(NOTIFICATION_TYPES.quoteApproved, updatedOrder)");
});

test("release to production does not emit Quote Approved without an approval transition", () => {
  expect(didOrderEnterQuoteApprovedState(
    {
      order_number: "TC-467720",
      quote_status: "Draft",
      approval_status: "Pending Review",
    },
    {
      order_number: "TC-467720",
      quote_status: "Ready For Production",
      approval_status: "Pending Review",
    }
  )).toBe(false);

  expect(didOrderEnterQuoteApprovedState(
    {
      order_number: "TC-467720",
      quote_status: "Ready For Production",
      approval_status: "Pending Review",
    },
    {
      order_number: "TC-467720",
      quote_status: "Ready For Production",
      approval_status: "Pending Review",
    }
  )).toBe(false);
});

test("request approval and later production release emit distinct business events once", () => {
  const pending = {
    order_number: "TC-EVENT-MAPPING",
    status: "New",
    quote_status: "Awaiting Deposit",
    approval_status: "Pending Review",
  };
  const approved = {
    ...pending,
    approval_status: "Approved",
  };
  const released = {
    ...approved,
    status: "Ready For Production",
    quote_status: "Ready For Production",
  };
  const events = [];

  if (didOrderEnterQuoteApprovedState(pending, approved)) {
    events.push("quote_approved");
  }
  if (didOrderEnterProductionNotificationState(pending, approved)) {
    events.push("order_in_production");
  }
  if (didOrderEnterQuoteApprovedState(approved, released)) {
    events.push("quote_approved");
  }
  if (didOrderEnterProductionNotificationState(approved, released)) {
    events.push("order_in_production");
  }

  expect(events).toEqual(["quote_approved", "order_in_production"]);
  expect(events.filter((event) => event === "quote_approved")).toHaveLength(1);
  expect(events.filter((event) => event === "order_in_production")).toHaveLength(1);
});

test("DTF deposit-not-required readiness does not reclassify an existing approval", async () => {
  const previousOrder = {
    id: "b4a95874-9b0f-45d0-ac11-3098e02ce684",
    order_number: "TC-114648",
    decoration_type: "DTF",
    status: "New",
    quote_status: "Draft",
    staff_review_status: "Approved",
    approval_status: "Approved",
    artwork_status: "Approved",
    artwork_approval_status: "Approved",
    deposit_required: null,
    deposit_requirement: "undecided",
    deposit_requirement_status: "Undecided",
    deposit_workflow_status: "Pending Decision",
  };
  const depositUpdates = {
    deposit_required: false,
    deposit_requirement: "not_required",
    deposit_requirement_status: "Not Required",
    deposit_workflow_status: "Deposit Not Required",
  };
  const readinessUpdates = buildProductionReadyWorkflowUpdates(
    { ...previousOrder, ...depositUpdates },
    previousOrder
  );
  const persistedOrder = {
    ...previousOrder,
    ...depositUpdates,
    ...readinessUpdates,
  };

  expect(readinessUpdates).toMatchObject({
    status: "Ready For Production",
    quote_status: "Ready For Production",
    production_ready: true,
  });
  expect(didOrderEnterQuoteApprovedState(previousOrder, persistedOrder)).toBe(false);

  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/lib/ordersStore.js", import.meta.url), "utf8")
  );
  const processInitialization = source.indexOf(
    "await ensureTeeCoProductionProcess(updatedOrder)"
  );
  const processFailureBoundary = source.indexOf(
    "Unable to initialize the production process for the persisted order"
  );
  const productionEmission = source.indexOf(
    "triggerOrderNotification(NOTIFICATION_TYPES.orderInProduction, updatedOrder)"
  );

  expect(processInitialization).toBeGreaterThan(-1);
  expect(processFailureBoundary).toBeGreaterThan(processInitialization);
  expect(productionEmission).toBeGreaterThan(processFailureBoundary);
});
