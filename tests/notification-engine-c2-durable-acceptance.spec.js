import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { handler } from "../netlify/functions/notification-event-accept.js";
import { createVerifyDeliveriesForAcceptedNotification } from "../netlify/functions/lib/notificationVerifyDeliveries.js";
import { acceptNotificationBusinessEventDurably } from "../src/lib/notificationBusinessEventAcceptance.js";
import {
  listNotificationActivity,
  resetNotificationActivityForTests,
  triggerNotificationEvent,
} from "../src/lib/notificationDeliveryService.js";
import { NOTIFICATION_TYPES } from "../src/lib/notificationTemplatesStore.js";

const businessEvent = {
  id: "business-event:c2-1",
  event_type: "quote_approved",
  subject_type: "order",
  subject_id: "order-c2-1",
  occurrence_id: "quote_approved:2026-07-25T12:00:00.000Z",
  correlation_id: "order:TC-C2-1",
  source: "orders_store",
  actor_type: "system",
  actor_id: "",
  payload: { orderNumber: "TC-C2-1" },
  occurred_at: "2026-07-25T12:00:00.000Z",
};

test("quote approval trigger durably inserts its business event in legacy cutover mode", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const persistedBusinessEvents = [];
  const persistedNotifications = [];
  const policy = {
    id: "policy:quote_approved:v1",
    event_type: "quote_approved",
    version: 1,
    enabled: true,
    delivery_mode: "automatic",
    email_enabled: true,
    sms_enabled: true,
    staff_notification_enabled: false,
    customer_audience_enabled: true,
    staff_audience_enabled: false,
    owner_audience_enabled: false,
    channel_template_assignments: {},
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_to: null,
  };

  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  resetNotificationActivityForTests();
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === "/.netlify/functions/notification-event-accept") {
      const response = await handler({
        httpMethod: "POST",
        body: options.body,
      });
      return {
        ok: response.statusCode === 200,
        status: response.statusCode,
        json: async () => JSON.parse(response.body),
      };
    }
    if (String(url).includes("/rest/v1/notification_business_events")) {
      if (options.method === "PATCH") {
        return { ok: true, status: 204, json: async () => [] };
      }
      const row = JSON.parse(options.body);
      persistedBusinessEvents.push(row);
      return {
        ok: true,
        status: 201,
        json: async () => [row],
      };
    }
    if (String(url).includes("/rest/v1/notification_policies")) {
      return { ok: true, status: 200, json: async () => [policy] };
    }
    if (String(url).includes("/rest/v1/notifications")) {
      const row = JSON.parse(options.body);
      persistedNotifications.push(row);
      return { ok: true, status: 201, json: async () => [row] };
    }
    return { ok: true, status: 200, json: async () => ({ delivered: true }) };
  };

  try {
    await triggerNotificationEvent(NOTIFICATION_TYPES.quoteApproved, {
      notificationEngineCutoverMode: "legacy",
      phase2BShadowEnabled: false,
      order: {
        id: "order-c2-trigger",
        order_number: "TC-C2-TRIGGER",
        updated_at: "2026-07-26T04:00:00.000Z",
        customer_email: "customer@example.com",
      },
      orderNumber: "TC-C2-TRIGGER",
      customerEmail: "customer@example.com",
      source: "orders_store",
    });

    expect(persistedBusinessEvents).toHaveLength(1);
    expect(persistedBusinessEvents[0]).toMatchObject({
      event_type: "quote_approved",
      subject_type: "order",
      subject_id: "order-c2-trigger",
      correlation_id: "order:TC-C2-TRIGGER",
    });
    expect(persistedNotifications).toHaveLength(1);
    expect(persistedNotifications[0]).toMatchObject({
      business_event_id: persistedBusinessEvents[0].id,
      event_type: "quote_approved",
      correlation_id: "order:TC-C2-TRIGGER",
      policy_id: policy.id,
      status: "evaluated",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test("browser acceptance uses a navigation-safe request and waits for durable identity", async () => {
  const requests = [];
  const accepted = await acceptNotificationBusinessEventDurably(businessEvent, {
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return { accepted: true, businessEvent };
        },
      };
    },
  });

  expect(accepted).toEqual(businessEvent);
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe("/.netlify/functions/notification-event-accept");
  expect(requests[0].options).toMatchObject({
    method: "POST",
    keepalive: true,
  });
  expect(JSON.parse(requests[0].options.body)).toEqual({ businessEvent });
});

test("authoritative pickup bypasses legacy activity and uses durable ingress once", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  resetNotificationActivityForTests();
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    const acceptedEvent = JSON.parse(options.body).businessEvent;
    return {
      ok: true,
      status: 200,
      async json() {
        return { accepted: true, businessEvent: acceptedEvent };
      },
    };
  };

  try {
    const result = await triggerNotificationEvent(
      NOTIFICATION_TYPES.orderReadyForPickup,
      {
        notificationEngineCutoverMode: "authoritative",
        order: {
          id: "order-pickup-ingress",
          order_number: "TC-PICKUP-INGRESS",
          updated_at: "2026-07-27T17:36:48.000Z",
          customer_phone: "+15198816869",
        },
        businessEvent: {
          subjectType: "order",
          subjectId: "order-pickup-ingress",
          occurrenceId:
            "order_ready_for_pickup:2026-07-27T17:36:48.000Z",
          correlationId: "order:TC-PICKUP-INGRESS",
          occurredAt: "2026-07-27T17:36:48.000Z",
        },
        source: "orders_store",
      }
    );

    expect(result).toEqual([]);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      "/.netlify/functions/notification-event-accept"
    );
    expect(
      JSON.parse(requests[0].options.body).businessEvent
    ).toMatchObject({
      event_type: "order_ready_for_pickup",
      subject_id: "order-pickup-ingress",
      occurrence_id:
        "order_ready_for_pickup:2026-07-27T17:36:48.000Z",
    });
    expect(listNotificationActivity()).toEqual([]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("durable ingress accepts through service-role persistence without mutating a replay", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];

  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (
      String(url).includes("/notification_business_events") &&
      options.method === "POST"
    ) {
      return {
        ok: true,
        async json() {
          return [];
        },
      };
    }
    if (
      String(url).includes("/notification_business_events") &&
      options.method === "PATCH"
    ) {
      return {
        ok: true,
        status: 204,
        async json() {
          return [];
        },
      };
    }
    if (String(url).includes("/notification_business_events")) {
      return {
        ok: true,
        async json() {
          return [businessEvent];
        },
      };
    }
    if (String(url).includes("/notification_policies")) {
      return {
        ok: true,
        async json() {
          return [{
            id: "policy:quote_approved:v1",
            event_type: "quote_approved",
            version: 1,
            enabled: true,
            delivery_mode: "automatic",
            email_enabled: true,
            sms_enabled: false,
            staff_notification_enabled: false,
            customer_audience_enabled: true,
            staff_audience_enabled: false,
            owner_audience_enabled: false,
            channel_template_assignments: {},
            effective_from: "2026-01-01T00:00:00.000Z",
            effective_to: null,
          }];
        },
      };
    }
    return {
      ok: true,
      async json() {
        const notification = JSON.parse(options.body);
        return [notification];
      },
    };
  };

  try {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ businessEvent }),
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).businessEvent).toEqual(businessEvent);
    expect(calls[0].options.headers.Prefer).toContain(
      "resolution=ignore-duplicates"
    );
    expect(calls[1].url).toContain("occurrence_id=eq.");
    const policyCall = calls.find(({ url }) =>
      url.includes("/notification_policies?")
    );
    const notificationCall = calls.find(({ url }) =>
      url.includes("/notifications?on_conflict=")
    );
    expect(policyCall).toBeTruthy();
    expect(notificationCall).toBeTruthy();
    expect(JSON.parse(notificationCall.options.body)).toMatchObject({
      business_event_id: businessEvent.id,
      correlation_id: businessEvent.correlation_id,
      status: "evaluated",
    });
    const diagnosticStages = calls
      .filter(
        ({ url, options }) =>
          url.includes("/notification_business_events?id=eq.") &&
          options.method === "PATCH"
      )
      .map(({ options }) => {
        const entries = JSON.parse(options.body).payload
          .temporary_notification_acceptance_diagnostics;
        return entries.at(-1).stage;
      });
    expect(diagnosticStages).toEqual([
      "notification_event_accept:entered",
      "business_event:accepted",
      "policy_resolution:started",
      "policy_resolution:returned",
      "policy_evaluation:completed",
      "persist_notification:called",
      "persist_notification:returned",
      "persist_notification:durable_identity",
      "phase2c_phase2d:started",
      "phase2c_phase2d:completed",
      "notification_event_accept:completed",
    ]);
    expect(calls[0].options.headers.Authorization).toBe("Bearer service-role");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test("verify ingress creates exactly the policy-enabled idempotent shadow deliveries", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalMode = process.env.VITE_NOTIFICATION_ENGINE_CUTOVER_MODE;
  const deliveries = new Map();
  const staffQueries = [];
  let notification = null;
  const acceptedEvent = {
    ...businessEvent,
    subject_id: "order-c2-verify",
    payload: {
      legacyNotificationContext: {
        orderNumber: "TC-C2-VERIFY",
        customerReference: "customer-verify",
      },
    },
  };
  const policy = {
    id: "policy:quote_approved:v3",
    event_type: "quote_approved",
    version: 3,
    enabled: true,
    delivery_mode: "automatic",
    email_enabled: true,
    sms_enabled: true,
    staff_notification_enabled: true,
    customer_audience_enabled: true,
    staff_audience_enabled: true,
    owner_audience_enabled: false,
    channel_template_assignments: {
      email: "quote_approved:v7",
      sms: "quote_approved:v7",
      staff: "quote_approved:v7",
    },
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_to: null,
  };
  const template = {
    id: "quote_approved:v7",
    template_type: "quote_approved",
    version: 7,
    status: "published",
    email_subject: "Approved: {{order_number}}",
    email_body:
      "Hi {{customer_name}}, {{order_number}} is approved by {{company_name}}.",
    sms_message: "{{order_number}} approved for {{customer_name}}.",
  };

  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  process.env.VITE_NOTIFICATION_ENGINE_CUTOVER_MODE = "verify";
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (
      requestUrl.includes("/notification_business_events") &&
      options.method === "PATCH"
    ) {
      return { ok: true, status: 204, json: async () => [] };
    }
    if (
      requestUrl.includes("/notification_business_events") &&
      options.method === "POST"
    ) {
      return { ok: true, status: 201, json: async () => [acceptedEvent] };
    }
    if (requestUrl.includes("/notification_policies")) {
      return { ok: true, status: 200, json: async () => [policy] };
    }
    if (
      requestUrl.includes("/notifications?on_conflict=") &&
      options.method === "POST"
    ) {
      notification = JSON.parse(options.body);
      return { ok: true, status: 201, json: async () => [notification] };
    }
    if (
      requestUrl.includes("/notifications?id=eq.") &&
      options.method === "PATCH"
    ) {
      notification = { ...notification, ...JSON.parse(options.body) };
      return { ok: true, status: 200, json: async () => [notification] };
    }
    if (requestUrl.includes("/orders?")) {
      return {
        ok: true,
        status: 200,
        json: async () => [{
          id: "order-c2-verify",
          order_number: "TC-C2-VERIFY",
          customer_id: "customer-verify",
          customer_name: "Taylor Verify",
          customer_email: "fallback@example.com",
          customer_phone: "+1 555 000 1111",
          assigned_to_staff_user_id: "staff-verify",
        }],
      };
    }
    if (requestUrl.includes("/customers?")) {
      return {
        ok: true,
        status: 200,
        json: async () => [{
          id: "customer-verify",
          name: "Taylor Verify",
          email: "taylor@example.com",
          phone: "+1 (555) 010-2000",
        }],
      };
    }
    if (requestUrl.includes("/staff_users?")) {
      staffQueries.push(requestUrl);
      return {
        ok: true,
        status: 200,
        json: async () => [{
          id: "staff-verify",
          name: "Sam Staff",
          role: "Staff",
          active: true,
        }],
      };
    }
    if (requestUrl.includes("/notification_template_versions?")) {
      return { ok: true, status: 200, json: async () => [template] };
    }
    if (
      requestUrl.includes("/notification_deliveries?on_conflict=") &&
      options.method === "POST"
    ) {
      const row = JSON.parse(options.body);
      deliveries.set(row.idempotency_key, row);
      return { ok: true, status: 201, json: async () => [row] };
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  };

  try {
    const request = {
      httpMethod: "POST",
      body: JSON.stringify({ businessEvent: acceptedEvent }),
    };
    const first = await handler(request);
    const second = await handler(request);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(deliveries.size).toBe(3);
    expect([...deliveries.values()].map((delivery) => delivery.channel)).toEqual([
      "email",
      "sms",
      "staff",
    ]);
    for (const delivery of deliveries.values()) {
      expect(delivery).toMatchObject({
        template_version_id: "quote_approved:v7",
        template_version: 7,
        attempt_count: 0,
        provider_message_id: "",
        destination_snapshot: {
          observationOnly: true,
          dispatcherEligible: false,
        },
      });
      expect(delivery.idempotency_key).toBe(delivery.id);
    }
    expect([...deliveries.values()].map((delivery) => delivery.provider_key))
      .toEqual(["resend", "twilio", "staff_internal"]);
    expect(staffQueries).toHaveLength(2);
    expect(staffQueries.every((url) => url.includes("active"))).toBe(true);
    expect(staffQueries.every((url) => !url.includes("status"))).toBe(true);
    expect(
      [...deliveries.values()].find((delivery) => delivery.channel === "staff")
        .recipient_snapshot.status
    ).toBe("Active");
    expect(deliveries.get([...deliveries.keys()][0]).destination_snapshot.email)
      .toBe("taylor@example.com");
    expect(
      [...deliveries.values()].find((delivery) => delivery.channel === "sms")
        .destination_snapshot.normalizedPhone
    ).toBe("+15550102000");
    expect(notification.engine_metadata).toMatchObject({
      observationOnly: true,
      cutoverMode: "verify",
      deliveriesDeferredUntilPhase2C: false,
      phase2D: {
        observationOnly: true,
        dispatcherEligible: false,
        deliveryCount: 3,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    if (originalMode === undefined) {
      delete process.env.VITE_NOTIFICATION_ENGINE_CUTOVER_MODE;
    } else {
      process.env.VITE_NOTIFICATION_ENGINE_CUTOVER_MODE = originalMode;
    }
  }
});

test("authoritative quote approval creates exactly three idempotent dispatcher-eligible deliveries", async () => {
  const originalFetch = globalThis.fetch;
  const deliveries = new Map();
  let finalizedNotification = null;
  const accepted = {
    ...businessEvent,
    subject_id: "order-c2-authoritative",
    payload: {
      legacyNotificationContext: {
        orderNumber: "TC-C2-AUTHORITATIVE",
        customerReference: "customer-authoritative",
      },
    },
  };
  const notification = {
    id: "notification:c2-authoritative",
    event_type: "quote_approved",
    status: "evaluated",
    engine_metadata: {
      observationOnly: true,
      cutoverMode: "legacy",
      deliveriesDeferredUntilPhase2C: true,
    },
  };
  const policy = {
    email_enabled: true,
    sms_enabled: true,
    staff_notification_enabled: true,
    customer_audience_enabled: true,
    staff_audience_enabled: true,
    owner_audience_enabled: false,
    channel_template_assignments: {
      email: "quote_approved:v7",
      sms: "quote_approved:v7",
      staff: "quote_approved:v7",
    },
  };
  const template = {
    id: "quote_approved:v7",
    template_type: "quote_approved",
    version: 7,
    status: "published",
    email_subject: "Approved: {{order_number}}",
    email_body:
      "Hi {{customer_name}}, {{order_number}} is approved by {{company_name}}.",
    sms_message: "{{order_number}} approved for {{customer_name}}.",
  };

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/orders?")) {
      return {
        ok: true,
        status: 200,
        json: async () => [{
          id: "order-c2-authoritative",
          order_number: "TC-C2-AUTHORITATIVE",
          customer_id: "customer-authoritative",
          customer_name: "Taylor Authoritative",
          customer_email: "fallback@example.com",
          customer_phone: "+1 555 000 1111",
          assigned_to_staff_user_id: "staff-authoritative",
        }],
      };
    }
    if (requestUrl.includes("/customers?")) {
      return {
        ok: true,
        status: 200,
        json: async () => [{
          id: "customer-authoritative",
          name: "Taylor Authoritative",
          email: "taylor.authoritative@example.com",
          phone: "+1 (555) 010-3000",
        }],
      };
    }
    if (requestUrl.includes("/staff_users?")) {
      return {
        ok: true,
        status: 200,
        json: async () => [{
          id: "staff-authoritative",
          name: "Alex Staff",
          role: "Staff",
          active: true,
        }],
      };
    }
    if (requestUrl.includes("/notification_template_versions?")) {
      return { ok: true, status: 200, json: async () => [template] };
    }
    if (
      requestUrl.includes("/notification_deliveries?on_conflict=") &&
      options.method === "POST"
    ) {
      const row = JSON.parse(options.body);
      deliveries.set(row.idempotency_key, row);
      return { ok: true, status: 201, json: async () => [row] };
    }
    if (
      requestUrl.includes("/notifications?id=eq.") &&
      options.method === "PATCH"
    ) {
      finalizedNotification = {
        ...notification,
        ...JSON.parse(options.body),
      };
      return {
        ok: true,
        status: 200,
        json: async () => [finalizedNotification],
      };
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  };

  try {
    const input = {
      accepted,
      notification,
      policy,
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      cutoverMode: "authoritative",
    };
    const first = await createVerifyDeliveriesForAcceptedNotification(input);
    const replay = await createVerifyDeliveriesForAcceptedNotification(input);

    expect(first.created).toBe(true);
    expect(replay.created).toBe(true);
    expect(deliveries.size).toBe(3);
    expect([...deliveries.values()].map(({ channel }) => channel)).toEqual([
      "email",
      "sms",
      "staff",
    ]);
    for (const delivery of deliveries.values()) {
      expect(delivery.destination_snapshot).toMatchObject({
        observationOnly: false,
        dispatcherEligible: true,
      });
      expect(delivery.idempotency_key).toBe(delivery.id);
    }
    expect(
      [...deliveries.values()].find((delivery) => delivery.channel === "sms")
        .destination_snapshot.normalizedPhone
    ).toBe("+15550103000");
    expect(finalizedNotification.engine_metadata).toMatchObject({
      observationOnly: false,
      legacyRuntimeAuthoritative: false,
      cutoverMode: "authoritative",
      deliveriesDeferredUntilPhase2C: false,
      phase2D: {
        status: "deliveries_created",
        observationOnly: false,
        dispatcherEligible: true,
        deliveryCount: 3,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authoritative pickup creates one idempotent dispatcher-eligible SMS Delivery", async () => {
  const originalFetch = globalThis.fetch;
  const deliveries = new Map();
  const accepted = {
    ...businessEvent,
    id: "business-event:pickup-1",
    event_type: "order_ready_for_pickup",
    subject_id: "order-pickup-1",
    occurrence_id: "order_ready_for_pickup:2026-07-27T17:36:48.000Z",
    payload: {
      legacyNotificationContext: {
        orderNumber: "TC-PICKUP-1",
        customerReference: "customer-pickup-1",
      },
    },
  };
  const notification = {
    id: "notification:pickup-1",
    event_type: "order_ready_for_pickup",
    status: "evaluated",
    engine_metadata: {},
  };
  const policy = {
    email_enabled: false,
    sms_enabled: true,
    staff_notification_enabled: false,
    customer_audience_enabled: true,
    staff_audience_enabled: false,
    owner_audience_enabled: false,
    channel_template_assignments: {
      sms: "order_ready_for_pickup:v1",
    },
  };
  const template = {
    id: "order_ready_for_pickup:v1",
    template_type: "order_ready_for_pickup",
    version: 1,
    status: "published",
    sms_message: "Your order {{order_number}} is ready for pickup.",
  };

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/orders?")) {
      return {
        ok: true,
        status: 200,
        json: async () => [{
          id: "order-pickup-1",
          order_number: "TC-PICKUP-1",
          customer_id: "customer-pickup-1",
          customer_phone: "+1 (519) 881-6869",
        }],
      };
    }
    if (requestUrl.includes("/customers?")) {
      return {
        ok: true,
        status: 200,
        json: async () => [{
          id: "customer-pickup-1",
          name: "Pickup Customer",
          phone: "+1 (519) 881-6869",
        }],
      };
    }
    if (requestUrl.includes("/notification_template_versions?")) {
      return { ok: true, status: 200, json: async () => [template] };
    }
    if (
      requestUrl.includes("/notification_deliveries?on_conflict=") &&
      options.method === "POST"
    ) {
      const row = JSON.parse(options.body);
      const existing = deliveries.get(row.idempotency_key);
      if (existing) {
        return { ok: true, status: 200, json: async () => [] };
      }
      deliveries.set(row.idempotency_key, row);
      return { ok: true, status: 201, json: async () => [row] };
    }
    if (
      requestUrl.includes("/notification_deliveries?") &&
      !options.method
    ) {
      return {
        ok: true,
        status: 200,
        json: async () => [deliveries.values().next().value],
      };
    }
    if (
      requestUrl.includes("/notifications?id=eq.") &&
      options.method === "PATCH"
    ) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ ...notification, ...JSON.parse(options.body) }],
      };
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  };

  try {
    const input = {
      accepted,
      notification,
      policy,
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      cutoverMode: "authoritative",
    };
    const first = await createVerifyDeliveriesForAcceptedNotification(input);
    const replay = await createVerifyDeliveriesForAcceptedNotification(input);

    expect(first.deliveries).toHaveLength(1);
    expect(replay.deliveries).toHaveLength(1);
    expect(deliveries.size).toBe(1);
    expect([...deliveries.values()][0]).toMatchObject({
      channel: "sms",
      template_type: "order_ready_for_pickup",
      rendered_content: {
        body: "Your order TC-PICKUP-1 is ready for pickup.",
      },
      status: "queued",
      destination_snapshot: {
        normalizedPhone: "+15198816869",
        observationOnly: false,
        dispatcherEligible: true,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("delivery materialization rejects unsupported modes and authoritative events", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Rejected materialization must not query persistence.");
  };
  const input = {
    accepted: businessEvent,
    notification: {
      id: "notification:c2-rejected",
      status: "evaluated",
    },
    policy: {},
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "service-role",
  };

  try {
    const unsupportedMode =
      await createVerifyDeliveriesForAcceptedNotification({
        ...input,
        cutoverMode: "legacy",
      });
    const unsupportedEvent =
      await createVerifyDeliveriesForAcceptedNotification({
        ...input,
        accepted: {
          ...businessEvent,
          event_type: "payment_failed",
        },
        cutoverMode: "authoritative",
      });

    expect(unsupportedMode).toMatchObject({
      created: false,
      reason: "unsupported_cutover_mode",
      deliveries: [],
    });
    expect(unsupportedEvent).toMatchObject({
      created: false,
      reason: "unsupported_event",
      deliveries: [],
    });
    expect(fetchCalls).toBe(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("supported asynchronous business workflows await durable acceptance", async () => {
  const [deliveryService, ordersStore, paymentsStore, webhookProcessor] =
    await Promise.all([
      readFile(
        new URL("../src/lib/notificationDeliveryService.js", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../src/lib/ordersStore.js", import.meta.url), "utf8"),
      readFile(new URL("../src/lib/paymentsStore.js", import.meta.url), "utf8"),
      readFile(
        new URL("../src/services/squareWebhookProcessor.js", import.meta.url),
        "utf8"
      ),
    ]);

  expect(deliveryService).not.toContain(
    "void processNotificationEventThroughEngine"
  );
  expect(ordersStore).toContain("await triggerNotificationEvent(");
  expect(ordersStore).toContain(
    "await recordPaymentWithDurableNotification({"
  );
  expect(paymentsStore).toContain("await Promise.all(pendingAcceptances);");
  expect(paymentsStore).toContain(
    "await notifyPaymentRequestCreated(paymentRequest);"
  );
  expect(webhookProcessor).toContain(
    "recordPayment: recordPaymentWithDurableNotification"
  );
  expect(webhookProcessor).toContain(
    "await adapter.triggerNotificationEvent(NOTIFICATION_TYPES.paymentFailed"
  );
});
