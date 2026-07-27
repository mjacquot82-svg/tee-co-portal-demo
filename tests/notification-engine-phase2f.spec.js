import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  createResendEmailAdapter,
} from "../netlify/functions/lib/resendEmailAdapter.js";
import {
  buildResendAdapterRequest,
  runResendEmailAdapterObservation,
} from "../netlify/functions/lib/resendEmailDispatcher.js";
import {
  NOTIFICATION_DISPATCHER_RPCS,
} from "../src/lib/notificationDispatcherRepository.js";

function emailEnvelope(overrides = {}) {
  const delivery = {
    id: "delivery:notification-1:email:customer:customer-1:email:v1",
    notification_id: "notification-1",
    channel: "email",
    destination_snapshot: {
      observationOnly: true,
      email: "taylor@example.com",
    },
    rendered_content: {
      subject: "Your order has been approved",
      body: "Stored rendered Order Approved body.",
    },
    idempotency_key: "delivery-idempotency-1",
    status: "processing",
    attempt_count: 0,
    claim_token: "resend-observation:worker:claim",
    claimed_at: "2026-07-25T12:00:00.000Z",
    claim_expires_at: "2026-07-25T12:01:00.000Z",
    ...overrides.delivery,
  };
  return {
    delivery,
    notification: {
      id: "notification-1",
      business_event_id: "event-1",
      event_type: "quote_approved",
      engine_metadata: { observationOnly: true },
      ...overrides.notification,
    },
    business_event: {
      id: "event-1",
      event_type: "quote_approved",
      ...overrides.businessEvent,
    },
  };
}

function createDispatcherClient(envelopes = [emailEnvelope()]) {
  const calls = [];
  const completions = [];
  let claimIssued = false;
  return {
    calls,
    completions,
    client: {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        if (name === NOTIFICATION_DISPATCHER_RPCS.recoverAbandoned) {
          return { data: [], error: null };
        }
        if (name === NOTIFICATION_DISPATCHER_RPCS.claimResendObservation) {
          if (claimIssued) return { data: [], error: null };
          claimIssued = true;
          return {
            data: envelopes.slice(0, parameters.p_limit),
            error: null,
          };
        }
        if (name === NOTIFICATION_DISPATCHER_RPCS.completeResendObservation) {
          completions.push(parameters);
          return {
            data: {
              ...envelopes[0].delivery,
              status: parameters.p_outcome,
              provider_key: "resend",
              provider_message_id: parameters.p_provider_message_id,
              last_failure_code: parameters.p_failure_code,
              last_failure_reason: parameters.p_failure_reason,
              attempt_count: parameters.p_attempt_number,
              claim_token: "",
            },
            error: null,
          };
        }
        return { data: null, error: new Error(`Unexpected RPC ${name}`) };
      },
    },
  };
}

test("provider-neutral request uses only the resolved Delivery destination and content", () => {
  const envelope = emailEnvelope();
  const request = buildResendAdapterRequest({
    delivery: envelope.delivery,
    notification: envelope.notification,
    businessEvent: envelope.business_event,
  });

  expect(request).toMatchObject({
    deliveryId: envelope.delivery.id,
    idempotencyKey: "delivery-idempotency-1",
    destination: { email: "taylor@example.com" },
    content: {
      subject: "Your order has been approved",
      body: "Stored rendered Order Approved body.",
    },
    metadata: {
      eventType: "quote_approved",
      observationOnly: true,
    },
  });
});

test("Resend adapter preserves sender, content, recipient, and provider idempotency", async () => {
  const requests = [];
  const adapter = createResendEmailAdapter({
    apiKey: "resend-test-key",
    from: "Tee & Co <orders@example.com>",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "resend-message-1" }),
      };
    },
  });
  const result = await adapter.send({
    idempotencyKey: "delivery-idempotency-1",
    destination: { email: "taylor@example.com" },
    content: {
      subject: "Stored subject",
      body: "Stored body",
    },
  });

  expect(requests).toHaveLength(1);
  expect(requests[0].options.headers["Idempotency-Key"]).toBe(
    "delivery-idempotency-1"
  );
  expect(JSON.parse(requests[0].options.body)).toEqual({
    from: "Tee & Co <orders@example.com>",
    to: ["taylor@example.com"],
    subject: "Stored subject",
    text: "Stored body",
  });
  expect(result).toMatchObject({
    ok: true,
    status: "sent",
    providerMessageId: "resend-message-1",
  });
});

test("Resend adapter normalizes rejection and transport failures", async () => {
  const rejected = createResendEmailAdapter({
    apiKey: "resend-test-key",
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      json: async () => ({ name: "rate_limit", message: "Try later." }),
    }),
  });
  const request = {
    idempotencyKey: "delivery-idempotency-2",
    destination: { email: "taylor@example.com" },
    content: { subject: "Subject", body: "Body" },
  };

  await expect(rejected.send(request)).resolves.toMatchObject({
    ok: false,
    status: "failed",
    retryability: "retryable",
    failureCode: "rate_limit",
    failureReason: "Try later.",
    httpStatus: 429,
  });

  const transportFailure = createResendEmailAdapter({
    apiKey: "resend-test-key",
    fetchImpl: async () => {
      throw new Error("Network unavailable");
    },
  });
  await expect(transportFailure.send(request)).resolves.toMatchObject({
    ok: false,
    status: "failed",
    retryability: "indeterminate",
    failureCode: "resend_transport_error",
    failureReason: "Network unavailable",
  });
});

test("dispatcher persists provider success on the Attempt and Delivery", async () => {
  const dispatcher = createDispatcherClient();
  const adapter = createResendEmailAdapter({
    apiKey: "resend-test-key",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "resend-message-2" }),
    }),
  });
  const result = await runResendEmailAdapterObservation({
    workerId: "resend-worker-1",
    adapter,
    dispatcherClient: dispatcher.client,
    now: () => new Date("2026-07-25T12:00:30.000Z"),
  });

  expect(result).toMatchObject({
    observationOnly: true,
    providerKey: "resend",
    claimedCount: 1,
    completedCount: 1,
  });
  expect(dispatcher.completions).toHaveLength(1);
  expect(dispatcher.completions[0]).toMatchObject({
    p_outcome: "sent",
    p_provider_message_id: "resend-message-2",
    p_failure_code: "",
    p_attempt_number: 1,
  });
});

test("durable claiming and provider idempotency prevent duplicate sends", async () => {
  const dispatcher = createDispatcherClient();
  let sendCount = 0;
  const adapter = createResendEmailAdapter({
    apiKey: "resend-test-key",
    fetchImpl: async () => {
      sendCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "resend-message-once" }),
      };
    },
  });
  const input = {
    workerId: "resend-worker-idempotent",
    adapter,
    dispatcherClient: dispatcher.client,
    now: () => new Date("2026-07-25T12:00:30.000Z"),
  };

  const first = await runResendEmailAdapterObservation(input);
  const second = await runResendEmailAdapterObservation(input);

  expect(first.completedCount).toBe(1);
  expect(second.completedCount).toBe(0);
  expect(sendCount).toBe(1);
  expect(dispatcher.completions).toHaveLength(1);
});

test("dispatcher persists normalized failure visibility without retry scheduling", async () => {
  const dispatcher = createDispatcherClient();
  const adapter = createResendEmailAdapter({
    apiKey: "resend-test-key",
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        name: "invalid_recipient",
        message: "Recipient rejected.",
      }),
    }),
  });
  await runResendEmailAdapterObservation({
    workerId: "resend-worker-2",
    adapter,
    dispatcherClient: dispatcher.client,
    now: () => new Date("2026-07-25T12:00:30.000Z"),
  });

  expect(dispatcher.completions[0]).toMatchObject({
    p_outcome: "failed",
    p_retryability: "terminal",
    p_failure_code: "invalid_recipient",
    p_failure_reason: "Recipient rejected.",
  });
});

test("Phase 2F migration claims only Order Approved email and stores provider outcomes", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/notification-engine-phase2f-resend-adapter.sql",
      import.meta.url
    ),
    "utf8"
  );

  expect(migration).toContain("d.channel = 'email'");
  expect(migration).toContain("n.event_type = 'quote_approved'");
  expect(migration).toContain("for update of d skip locked");
  expect(migration).toContain("provider_message_id");
  expect(migration).toContain("last_failure_code");
  expect(migration).toContain("last_failure_reason");
  expect(migration).toContain("notification_delivery_attempts");
  expect(migration).not.toContain("retry_scheduled");
});

test("customer email endpoint requires a rendered authoritative Delivery", async () => {
  const endpoint = await readFile(
    new URL(
      "../netlify/functions/customer-notification.js",
      import.meta.url
    ),
    "utf8"
  );

  expect(endpoint).toContain("createResendEmailAdapter");
  expect(endpoint).toContain(
    "Customer email delivery requires an authoritative rendered Delivery."
  );
  expect(endpoint).not.toContain("buildLegacyOrderApprovedEmailRequest");
  expect(endpoint).not.toContain("Your order has been approved");
  expect(endpoint).not.toContain("api.resend.com");
});

test("Phase 2F does not activate new events, SMS, retry scheduling, or Staff Adapter changes", async () => {
  const [dispatcher, migration] = await Promise.all([
    readFile(
      new URL(
        "../netlify/functions/lib/resendEmailDispatcher.js",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL(
        "../supabase/notification-engine-phase2f-resend-adapter.sql",
        import.meta.url
      ),
      "utf8"
    ),
  ]);
  const combined = `${dispatcher}\n${migration}`;

  expect(combined).not.toContain("staffNotificationsStore");
  expect(combined).not.toContain("staffInternalNotificationAdapter");
  expect(combined).not.toContain("Twilio");
  expect(combined).not.toContain("sms");
  expect(combined).not.toContain("retry_scheduled");
  expect(combined).not.toContain("notificationDeliveryService");
});
