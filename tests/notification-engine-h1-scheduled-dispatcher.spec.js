import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { runScheduledNotificationDispatcher } from "../netlify/functions/lib/notificationScheduledDispatcher.js";
import { NOTIFICATION_DISPATCHER_RPCS } from "../src/lib/notificationDispatcherRepository.js";
import { decideDeliveryFailureTransition } from "../src/lib/notificationDeliveryLifecycle.js";

const NOW = "2026-07-25T12:00:00.000Z";

function envelope(id, overrides = {}) {
  const delivery = {
    id,
    notification_id: `notification:${id}`,
    channel: "email",
    status: "queued",
    attempt_count: 0,
    next_retry_at: null,
    claim_token: "",
    claim_expires_at: null,
    destination_snapshot: {
      email: `${id}@example.com`,
      observationOnly: false,
    },
    rendered_content: { subject: "Approved", body: "Your order is approved." },
    idempotency_key: `idempotency:${id}`,
    ...overrides,
  };
  return {
    delivery,
    notification: {
      id: delivery.notification_id,
      business_event_id: `event:${id}`,
      event_type: "quote_approved",
      engine_metadata: { observationOnly: false },
    },
    business_event: {
      id: `event:${id}`,
      event_type: "quote_approved",
    },
  };
}

function createRunnerDatabase(envelopes) {
  let clock = new Date(NOW);
  let claimSequence = 0;
  const attempts = [];
  const runs = new Map();

  function authoritative(item) {
    return (
      item.delivery.channel === "email" &&
      item.notification.event_type === "quote_approved" &&
      item.delivery.destination_snapshot.observationOnly === false &&
      item.notification.engine_metadata.observationOnly === false
    );
  }

  const client = {
    async rpc(name, parameters) {
      if (name === NOTIFICATION_DISPATCHER_RPCS.startDispatchRun) {
        const run = {
          id: parameters.p_run_id,
          worker_id: parameters.p_worker_id,
          status: "running",
        };
        runs.set(run.id, run);
        return { data: run, error: null };
      }
      if (name === NOTIFICATION_DISPATCHER_RPCS.completeDispatchRun) {
        const run = runs.get(parameters.p_run_id);
        Object.assign(run, {
          status: parameters.p_status,
          recovered_count: parameters.p_recovered_count,
          claimed_count: parameters.p_claimed_count,
          completed_count: parameters.p_completed_count,
          failed_count: parameters.p_failed_count,
          error_summary: parameters.p_error_summary,
        });
        return { data: run, error: null };
      }
      if (name === NOTIFICATION_DISPATCHER_RPCS.recoverAuthoritative) {
        const recovered = [];
        for (const item of envelopes) {
          const delivery = item.delivery;
          if (
            authoritative(item) &&
            delivery.status === "processing" &&
            delivery.claim_expires_at &&
            new Date(delivery.claim_expires_at) <= clock
          ) {
            delivery.status =
              delivery.attempt_count > 0 ? "retry_scheduled" : "queued";
            delivery.next_retry_at =
              delivery.status === "retry_scheduled" ? clock.toISOString() : null;
            delivery.claim_token = "";
            delivery.claim_expires_at = null;
            recovered.push({ ...delivery });
          }
        }
        return { data: recovered.slice(0, parameters.p_limit), error: null };
      }
      if (name === NOTIFICATION_DISPATCHER_RPCS.claimResendAuthoritative) {
        const eligible = envelopes
          .filter((item) => {
            const delivery = item.delivery;
            return (
              authoritative(item) &&
              (delivery.status === "queued" ||
                (delivery.status === "retry_scheduled" &&
                  delivery.next_retry_at &&
                  new Date(delivery.next_retry_at) <= clock))
            );
          })
          .slice(0, parameters.p_limit);
        claimSequence += 1;
        return {
          data: eligible.map((item) => {
            item.delivery.status = "processing";
            item.delivery.claim_token = `claim:${claimSequence}:${item.delivery.id}`;
            item.delivery.claimed_at = clock.toISOString();
            item.delivery.claim_expires_at = new Date(
              clock.getTime() + parameters.p_lease_seconds * 1000
            ).toISOString();
            item.delivery.next_retry_at = null;
            return {
              delivery: { ...item.delivery },
              notification: item.notification,
              business_event: item.business_event,
            };
          }),
          error: null,
        };
      }
      if (name === NOTIFICATION_DISPATCHER_RPCS.completeResendCutover) {
        const item = envelopes.find(
          ({ delivery }) => delivery.id === parameters.p_delivery_id
        );
        const delivery = item.delivery;
        if (
          delivery.status !== "processing" ||
          delivery.claim_token !== parameters.p_claim_token
        ) {
          return { data: null, error: new Error("Claim no longer owns Delivery.") };
        }
        if (!attempts.some(({ id }) => id === parameters.p_attempt_id)) {
          attempts.push({
            id: parameters.p_attempt_id,
            deliveryId: delivery.id,
            outcome: parameters.p_outcome,
            providerMessageId: parameters.p_provider_message_id,
          });
        }
        delivery.attempt_count = parameters.p_attempt_number;
        delivery.claim_token = "";
        delivery.claim_expires_at = null;
        if (parameters.p_outcome === "sent") {
          delivery.status = "sent";
          delivery.provider_message_id = parameters.p_provider_message_id;
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
        }
        return { data: { ...delivery }, error: null };
      }
      return { data: null, error: new Error(`Unexpected RPC ${name}`) };
    },
  };

  return {
    client,
    attempts,
    runs,
    advance(milliseconds) {
      clock = new Date(clock.getTime() + milliseconds);
    },
  };
}

function adapter(results = [{ status: "sent", retryability: "terminal" }]) {
  const requests = [];
  let index = 0;
  return {
    key: "resend",
    requests,
    async send(request) {
      requests.push(request);
      const result = results[Math.min(index++, results.length - 1)];
      return {
        ok: result.status === "sent",
        providerMessageId:
          result.status === "sent" ? `resend:${request.deliveryId}` : "",
        failureCode: result.status === "sent" ? "" : "provider_unavailable",
        failureReason: result.status === "sent" ? "" : "Unavailable",
        providerMetadata: {},
        ...result,
      };
    },
  };
}

function run(database, provider, runId) {
  return runScheduledNotificationDispatcher({
    runId,
    workerId: `worker:${runId}`,
    adapter: provider,
    dispatcherClient: database.client,
    retryPolicy: { maxAttempts: 3, baseDelaySeconds: 60 },
    now: () => new Date(NOW),
  });
}

test("queued Delivery is processed once across dispatcher replays", async () => {
  const item = envelope("queued");
  const database = createRunnerDatabase([item]);
  const provider = adapter();
  await run(database, provider, "run-1");
  await run(database, provider, "run-2");
  expect(provider.requests).toHaveLength(1);
  expect(database.attempts).toHaveLength(1);
  expect(item.delivery.status).toBe("sent");
});

test("due retry runs once while future retry and terminal states are ignored", async () => {
  const due = envelope("due", {
    status: "retry_scheduled",
    attempt_count: 1,
    next_retry_at: "2026-07-25T11:59:00.000Z",
  });
  const future = envelope("future", {
    status: "retry_scheduled",
    attempt_count: 1,
    next_retry_at: "2026-07-25T12:10:00.000Z",
  });
  const sent = envelope("terminal-sent", { status: "sent", attempt_count: 1 });
  const failed = envelope("terminal-failed", {
    status: "failed",
    attempt_count: 3,
  });
  const database = createRunnerDatabase([due, future, sent, failed]);
  const provider = adapter();
  await run(database, provider, "retry-run");
  expect(provider.requests.map(({ deliveryId }) => deliveryId)).toEqual(["due"]);
  expect(due.delivery.status).toBe("sent");
  expect(future.delivery.status).toBe("retry_scheduled");
  expect(sent.delivery.status).toBe("sent");
  expect(failed.delivery.status).toBe("failed");
});

test("expired claims recover and concurrent runners cannot duplicate work", async () => {
  const expired = envelope("expired", {
    status: "processing",
    claim_token: "dead-worker",
    claim_expires_at: "2026-07-25T11:59:00.000Z",
  });
  const database = createRunnerDatabase([expired]);
  const provider = adapter();
  const [first, second] = await Promise.all([
    run(database, provider, "concurrent-1"),
    run(database, provider, "concurrent-2"),
  ]);
  expect(first.recoveredCount + second.recoveredCount).toBe(1);
  expect(provider.requests).toHaveLength(1);
  expect(database.attempts).toHaveLength(1);
  expect(expired.delivery.status).toBe("sent");
});

test("retry lifecycle stays on one Delivery and a future retry is not early", async () => {
  const item = envelope("retry-lifecycle");
  const database = createRunnerDatabase([item]);
  const provider = adapter([
    { status: "failed", retryability: "retryable" },
    { status: "sent", retryability: "terminal" },
  ]);
  await run(database, provider, "failure-run");
  expect(item.delivery.status).toBe("retry_scheduled");
  await run(database, provider, "too-early-run");
  expect(provider.requests).toHaveLength(1);
  database.advance(61_000);
  await run(database, provider, "due-run");
  expect(provider.requests).toHaveLength(2);
  expect(database.attempts.map(({ deliveryId }) => deliveryId)).toEqual([
    "retry-lifecycle",
    "retry-lifecycle",
  ]);
  expect(item.delivery.status).toBe("sent");
});

test("runner failure is durable and leaves Delivery protected by its lease", async () => {
  const item = envelope("runner-error");
  const database = createRunnerDatabase([item]);
  const provider = {
    key: "resend",
    requests: [],
    async send(request) {
      this.requests.push(request);
      throw new Error("Process interrupted.");
    },
  };
  const result = await run(database, provider, "error-run");
  expect(result.status).toBe("completed_with_errors");
  expect(database.runs.get("error-run")).toMatchObject({
    status: "completed_with_errors",
    failed_count: 1,
  });
  expect(database.attempts).toHaveLength(0);
  expect(item.delivery).toMatchObject({
    status: "processing",
    claim_token: "claim:1:runner-error",
  });
});

test("migration and scheduled entry keep execution service-only and scoped", async () => {
  const [sql, entry] = await Promise.all([
    readFile("supabase/notification-engine-h1-scheduled-dispatcher.sql", "utf8"),
    readFile("netlify/functions/notification-dispatcher-scheduled.js", "utf8"),
  ]);
  expect(sql).toContain("for update of delivery skip locked");
  expect(sql).toContain("delivery.status = 'retry_scheduled'");
  expect(sql).toContain("delivery.next_retry_at <= clock_timestamp()");
  expect(sql).toContain("notification.event_type = 'quote_approved'");
  expect(sql).toContain("delivery.channel = 'email'");
  expect(sql).toContain("to service_role");
  expect(sql).toContain("from public, anon, authenticated");
  expect(entry).toContain("SUPABASE_SERVICE_ROLE_KEY");
  expect(entry).toContain("NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER");
  expect(entry).not.toContain("twilio");
});
