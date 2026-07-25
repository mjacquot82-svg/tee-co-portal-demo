import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  calculateNotificationAggregateState,
  calculateNotificationRetryDelay,
  canTransitionDelivery,
  decideDeliveryFailureTransition,
  resolveNotificationRetryPolicy,
} from "../src/lib/notificationDeliveryLifecycle.js";
import {
  runResendEmailAdapterObservation,
} from "../netlify/functions/lib/resendEmailDispatcher.js";
import {
  createResendEmailAdapter,
} from "../netlify/functions/lib/resendEmailAdapter.js";
import {
  NOTIFICATION_DISPATCHER_RPCS,
} from "../src/lib/notificationDispatcherRepository.js";

function deliveryEnvelope(deliveryOverrides = {}) {
  const delivery = {
    id: "delivery:lifecycle-email-1",
    notification_id: "notification-lifecycle-1",
    channel: "email",
    destination_snapshot: {
      observationOnly: true,
      email: "customer@example.com",
    },
    rendered_content: {
      subject: "Stored subject",
      body: "Stored body",
    },
    idempotency_key: "delivery-lifecycle-idempotency-1",
    status: "queued",
    attempt_count: 0,
    claim_token: "",
    claim_expires_at: null,
    next_retry_at: null,
    ...deliveryOverrides,
  };
  return {
    delivery,
    notification: {
      id: delivery.notification_id,
      business_event_id: "event-lifecycle-1",
      event_type: "quote_approved",
      engine_metadata: { observationOnly: true },
    },
    business_event: {
      id: "event-lifecycle-1",
      event_type: "quote_approved",
    },
  };
}

function createLifecycleClient(deliveryOverrides = {}) {
  const envelope = deliveryEnvelope(deliveryOverrides);
  const attempts = [];
  const calls = [];
  let claimSequence = 0;

  return {
    envelope,
    attempts,
    calls,
    client: {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        const delivery = envelope.delivery;

        if (name === NOTIFICATION_DISPATCHER_RPCS.recoverAbandoned) {
          if (
            delivery.status === "processing" &&
            delivery.claim_expires_at &&
            delivery.claim_expires_at <= "2026-07-25T12:00:00.000Z"
          ) {
            delivery.status =
              delivery.attempt_count > 0 ? "retry_scheduled" : "queued";
            delivery.next_retry_at =
              delivery.status === "retry_scheduled"
                ? "2026-07-25T12:00:00.000Z"
                : null;
            delivery.claim_token = "";
            delivery.claim_expires_at = null;
            return { data: [{ ...delivery }], error: null };
          }
          return { data: [], error: null };
        }

        if (name === NOTIFICATION_DISPATCHER_RPCS.claimResendObservation) {
          if (!["queued", "retry_scheduled"].includes(delivery.status)) {
            return { data: [], error: null };
          }
          claimSequence += 1;
          delivery.status = "processing";
          delivery.claim_token = `resend-observation:worker:claim-${claimSequence}`;
          delivery.claimed_at = "2026-07-25T12:00:00.000Z";
          delivery.claim_expires_at = "2026-07-25T12:01:00.000Z";
          delivery.next_retry_at = null;
          return {
            data: [
              {
                delivery: { ...delivery },
                notification: envelope.notification,
                business_event: envelope.business_event,
              },
            ],
            error: null,
          };
        }

        if (name === NOTIFICATION_DISPATCHER_RPCS.completeResendObservation) {
          const existing = attempts.find(
            (attempt) => attempt.id === parameters.p_attempt_id
          );
          if (existing) return { data: { ...delivery }, error: null };

          attempts.push({
            id: parameters.p_attempt_id,
            attempt_number: parameters.p_attempt_number,
            outcome: parameters.p_outcome,
            retryability: parameters.p_retryability,
            provider_message_id: parameters.p_provider_message_id,
            provider_idempotency_key: delivery.idempotency_key,
          });
          delivery.attempt_count = parameters.p_attempt_number;
          delivery.claim_token = "";
          delivery.claim_expires_at = null;

          if (parameters.p_outcome === "sent") {
            delivery.status = "sent";
            delivery.provider_message_id = parameters.p_provider_message_id;
            delivery.next_retry_at = null;
          } else {
            const transition = decideDeliveryFailureTransition({
              attemptNumber: parameters.p_attempt_number,
              retryability: parameters.p_retryability,
              idempotencyKey: delivery.idempotency_key,
              policy: {
                maxAttempts: parameters.p_max_attempts,
                baseDelaySeconds: parameters.p_base_delay_seconds,
                maxDelaySeconds: parameters.p_max_delay_seconds,
              },
              completedAt: parameters.p_completed_at,
            });
            delivery.status = transition.status;
            delivery.next_retry_at = transition.nextRetryAt;
            delivery.last_failure_code = parameters.p_failure_code;
            delivery.last_failure_reason = parameters.p_failure_reason;
          }
          return { data: { ...delivery }, error: null };
        }

        return { data: null, error: new Error(`Unexpected RPC ${name}`) };
      },
    },
  };
}

function createSequenceAdapter(results) {
  const requests = [];
  let index = 0;
  return {
    requests,
    adapter: {
      key: "resend",
      async send(request) {
        requests.push(request);
        const result = results[Math.min(index, results.length - 1)];
        index += 1;
        return result;
      },
    },
  };
}

const retryableFailure = {
  ok: false,
  status: "failed",
  retryability: "retryable",
  providerMessageId: "",
  failureCode: "provider_unavailable",
  failureReason: "Provider unavailable.",
  providerMetadata: { httpStatus: 503 },
};

const sentResult = {
  ok: true,
  status: "sent",
  retryability: "terminal",
  providerMessageId: "resend-success-1",
  failureCode: "",
  failureReason: "",
  providerMetadata: { httpStatus: 200 },
};

test("retry policy uses bounded deterministic exponential backoff", () => {
  expect(resolveNotificationRetryPolicy({})).toEqual({
    maxAttempts: 3,
    baseDelaySeconds: 60,
    maxDelaySeconds: 3600,
  });
  expect(calculateNotificationRetryDelay(1)).toBe(60);
  expect(calculateNotificationRetryDelay(2)).toBe(120);
  expect(
    calculateNotificationRetryDelay(10, {
      baseDelaySeconds: 60,
      maxDelaySeconds: 300,
    })
  ).toBe(300);
});
test("retryable provider failure creates another Attempt on the original Delivery and then succeeds", async () => {
  const lifecycle = createLifecycleClient();
  const sequence = createSequenceAdapter([retryableFailure, sentResult]);
  const input = {
    workerId: "retry-worker",
    adapter: sequence.adapter,
    dispatcherClient: lifecycle.client,
    retryPolicy: { maxAttempts: 3, baseDelaySeconds: 60 },
    now: () => new Date("2026-07-25T12:00:30.000Z"),
  };

  await runResendEmailAdapterObservation(input);
  expect(lifecycle.envelope.delivery.status).toBe("retry_scheduled");
  expect(lifecycle.envelope.delivery.next_retry_at).toBe(
    "2026-07-25T12:01:30.000Z"
  );

  await runResendEmailAdapterObservation(input);
  expect(lifecycle.envelope.delivery).toMatchObject({
    status: "sent",
    attempt_count: 2,
    provider_message_id: "resend-success-1",
  });
  expect(lifecycle.attempts.map((attempt) => attempt.attempt_number)).toEqual([
    1, 2,
  ]);
  expect(
    lifecycle.attempts.map((attempt) => attempt.provider_idempotency_key)
  ).toEqual([
    "delivery-lifecycle-idempotency-1",
    "delivery-lifecycle-idempotency-1",
  ]);
});

test("retry exhaustion leaves the original Delivery failed", async () => {
  const lifecycle = createLifecycleClient();
  const sequence = createSequenceAdapter([retryableFailure]);
  const input = {
    workerId: "exhaustion-worker",
    adapter: sequence.adapter,
    dispatcherClient: lifecycle.client,
    retryPolicy: { maxAttempts: 2, baseDelaySeconds: 60 },
    now: () => new Date("2026-07-25T12:00:30.000Z"),
  };

  await runResendEmailAdapterObservation(input);
  await runResendEmailAdapterObservation(input);
  const third = await runResendEmailAdapterObservation(input);

  expect(lifecycle.envelope.delivery).toMatchObject({
    status: "failed",
    attempt_count: 2,
    next_retry_at: null,
  });
  expect(lifecycle.attempts).toHaveLength(2);
  expect(third.claimedCount).toBe(0);
});

test("terminal failure is never retried", async () => {
  const lifecycle = createLifecycleClient();
  const sequence = createSequenceAdapter([
    {
      ...retryableFailure,
      retryability: "terminal",
      failureCode: "invalid_recipient",
    },
  ]);
  const input = {
    workerId: "terminal-worker",
    adapter: sequence.adapter,
    dispatcherClient: lifecycle.client,
  };

  await runResendEmailAdapterObservation(input);
  const replay = await runResendEmailAdapterObservation(input);

  expect(lifecycle.envelope.delivery.status).toBe("failed");
  expect(lifecycle.attempts).toHaveLength(1);
  expect(replay.claimedCount).toBe(0);
});

test("indeterminate lost response is replayed safely with the same provider idempotency key", async () => {
  const lifecycle = createLifecycleClient();
  let providerCalls = 0;
  const providerKeys = [];
  const adapter = createResendEmailAdapter({
    apiKey: "resend-test-key",
    fetchImpl: async (_url, options) => {
      providerCalls += 1;
      providerKeys.push(options.headers["Idempotency-Key"]);
      if (providerCalls === 1) throw new Error("Response was lost");
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "resend-after-replay" }),
      };
    },
  });
  const input = {
    workerId: "lost-response-worker",
    adapter,
    dispatcherClient: lifecycle.client,
    retryPolicy: { maxAttempts: 3, baseDelaySeconds: 60 },
    now: () => new Date("2026-07-25T12:00:30.000Z"),
  };

  await runResendEmailAdapterObservation(input);
  expect(lifecycle.attempts[0].retryability).toBe("indeterminate");
  expect(lifecycle.envelope.delivery.status).toBe("retry_scheduled");
  await runResendEmailAdapterObservation(input);

  expect(providerKeys).toEqual([
    "delivery-lifecycle-idempotency-1",
    "delivery-lifecycle-idempotency-1",
  ]);
  expect(lifecycle.envelope.delivery.status).toBe("sent");
});

test("concurrent workers atomically claim once and do not duplicate sends", async () => {
  const lifecycle = createLifecycleClient();
  const sequence = createSequenceAdapter([sentResult]);
  const base = {
    adapter: sequence.adapter,
    dispatcherClient: lifecycle.client,
  };

  const [first, second] = await Promise.all([
    runResendEmailAdapterObservation({ ...base, workerId: "worker-a" }),
    runResendEmailAdapterObservation({ ...base, workerId: "worker-b" }),
  ]);

  expect(first.completedCount + second.completedCount).toBe(1);
  expect(sequence.requests).toHaveLength(1);
  expect(lifecycle.attempts).toHaveLength(1);
});

test("expired processing claim is recovered before the next attempt", async () => {
  const lifecycle = createLifecycleClient({
    status: "processing",
    attempt_count: 1,
    claim_token: "expired-claim",
    claim_expires_at: "2026-07-25T11:59:00.000Z",
  });
  const sequence = createSequenceAdapter([sentResult]);
  const result = await runResendEmailAdapterObservation({
    workerId: "recovery-worker",
    adapter: sequence.adapter,
    dispatcherClient: lifecycle.client,
  });

  expect(result.recoveredCount).toBe(1);
  expect(lifecycle.envelope.delivery).toMatchObject({
    status: "sent",
    attempt_count: 2,
  });
});

test("dispatcher replay does not retry an already-sent Delivery", async () => {
  const lifecycle = createLifecycleClient();
  const sequence = createSequenceAdapter([sentResult]);
  const input = {
    workerId: "replay-worker",
    adapter: sequence.adapter,
    dispatcherClient: lifecycle.client,
  };

  await runResendEmailAdapterObservation(input);
  const replay = await runResendEmailAdapterObservation(input);

  expect(replay.claimedCount).toBe(0);
  expect(sequence.requests).toHaveLength(1);
  expect(lifecycle.attempts).toHaveLength(1);
});

test("partial success preserves a successful channel while another Delivery retries or fails", () => {
  expect(
    calculateNotificationAggregateState([
      { status: "sent", channel: "staff" },
      { status: "retry_scheduled", channel: "email" },
    ])
  ).toBe("partially_successful");
  expect(
    calculateNotificationAggregateState([
      { status: "delivered", channel: "email" },
      { status: "failed", channel: "staff" },
    ])
  ).toBe("partially_successful");
  expect(
    calculateNotificationAggregateState([
      { status: "sent", channel: "email" },
    ])
  ).toBe("completed");
});

test("approved lifecycle transitions include delivered and cancellation terminal states", () => {
  expect(canTransitionDelivery("queued", "processing")).toBe(true);
  expect(canTransitionDelivery("retry_scheduled", "processing")).toBe(true);
  expect(canTransitionDelivery("processing", "sent")).toBe(true);
  expect(canTransitionDelivery("processing", "retry_scheduled")).toBe(true);
  expect(canTransitionDelivery("processing", "failed")).toBe(true);
  expect(canTransitionDelivery("sent", "delivered")).toBe(true);
  expect(canTransitionDelivery("queued", "cancelled")).toBe(true);
  expect(canTransitionDelivery("sent", "processing")).toBe(false);
  expect(canTransitionDelivery("delivered", "processing")).toBe(false);
  expect(canTransitionDelivery("not_deliverable", "processing")).toBe(false);
  expect(canTransitionDelivery("suppressed", "processing")).toBe(false);
});

test("Phase 2G migration implements durable lifecycle history without activating new channels", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/notification-engine-phase2g-delivery-lifecycle.sql",
      import.meta.url
    ),
    "utf8"
  );
  [
    "'queued'",
    "'processing'",
    "'sent'",
    "'delivered'",
    "'failed'",
    "'retry_scheduled'",
    "'not_deliverable'",
    "'suppressed'",
    "'cancelled'",
  ].forEach((status) => expect(migration).toContain(status));

  expect(migration).toContain("notification_delivery_status_history");
  expect(migration).toContain("next_retry_at <= clock_timestamp()");
  expect(migration).toContain("for update of d skip locked");
  expect(migration).toContain("power(2, greatest(0, p_attempt_number - 1))");
  expect(migration).toContain("mark_notification_delivery_delivered");
  expect(migration).toContain("cancel_notification_delivery");
  expect(migration).toContain("refresh_notification_aggregate_status");
  expect(migration).toContain("n.event_type = 'quote_approved'");
  expect(migration).not.toContain("Twilio");
  expect(migration).not.toContain("sms");
});

test("Phase 2G adds no scheduler, provider activation, or Phase 2H administration", async () => {
  const sources = await Promise.all(
    [
      "../src/lib/notificationDeliveryLifecycle.js",
      "../netlify/functions/lib/resendEmailDispatcher.js",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8"))
  );
  const combined = sources.join("\n");

  expect(combined).not.toContain("setInterval");
  expect(combined).not.toContain("cron");
  expect(combined).not.toContain("Twilio");
  expect(combined).not.toContain("notification_activity");
  expect(combined).not.toContain("admin");
});
