import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { handler } from "../netlify/functions/notification-event-accept.js";
import { acceptNotificationBusinessEventDurably } from "../src/lib/notificationBusinessEventAcceptance.js";

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

test("durable ingress accepts through service-role persistence without mutating a replay", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];

  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === "POST") {
      return {
        ok: true,
        async json() {
          return [];
        },
      };
    }
    return {
      ok: true,
      async json() {
        return [businessEvent];
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
    expect(calls).toHaveLength(2);
    expect(calls[0].options.headers.Prefer).toContain(
      "resolution=ignore-duplicates"
    );
    expect(calls[1].url).toContain("occurrence_id=eq.");
    expect(calls[0].options.headers.Authorization).toBe("Bearer service-role");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
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
