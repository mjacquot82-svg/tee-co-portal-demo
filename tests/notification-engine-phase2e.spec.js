import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  isClaimLeaseValid,
  isObservationDeliveryEligible,
  runNotificationDispatcherObservation,
} from "../src/lib/notificationDispatcher.js";
import {
  NOTIFICATION_DISPATCHER_RPCS,
} from "../src/lib/notificationDispatcherRepository.js";

function createDispatcherClient(initialDeliveries = []) {
  const deliveries = initialDeliveries.map((delivery) => ({ ...delivery }));
  const attempts = [];
  const calls = [];

  return {
    deliveries,
    attempts,
    calls,
    client: {
      async rpc(name, parameters) {
        calls.push({ name, parameters });

        if (name === NOTIFICATION_DISPATCHER_RPCS.recoverAbandoned) {
          const recovered = deliveries
            .filter(
              (delivery) =>
                delivery.status === "processing" &&
                delivery.claim_expires_at <= "2026-07-25T12:00:00.000Z"
            )
            .slice(0, parameters.p_limit)
            .map((delivery) => {
              Object.assign(delivery, {
                status: "queued",
                claim_token: "",
                claimed_at: null,
                claim_expires_at: null,
              });
              return { ...delivery };
            });
          return { data: recovered, error: null };
        }

        if (name === NOTIFICATION_DISPATCHER_RPCS.claimObservation) {
          const claimed = deliveries
            .filter((delivery) => delivery.status === "queued")
            .slice(0, parameters.p_limit)
            .map((delivery) => {
              Object.assign(delivery, {
                status: "processing",
                claim_token: `observation:${parameters.p_worker_id}:claim`,
                claimed_at: "2026-07-25T12:00:00.000Z",
                claim_expires_at: "2026-07-25T12:01:00.000Z",
                processing_at: "2026-07-25T12:00:00.000Z",
              });
              return { ...delivery };
            });
          return { data: claimed, error: null };
        }

        if (name === NOTIFICATION_DISPATCHER_RPCS.completeObservation) {
          const delivery = deliveries.find(
            (candidate) => candidate.id === parameters.p_delivery_id
          );
          const existingAttempt = attempts.find(
            (attempt) => attempt.id === parameters.p_attempt_id
          );
          if (!existingAttempt) {
            attempts.push({
              id: parameters.p_attempt_id,
              delivery_id: parameters.p_delivery_id,
              attempt_number: parameters.p_attempt_number,
              provider_key: "observation_dispatcher",
              outcome: "indeterminate",
              provider_metadata: {
                observationOnly: true,
                adapterInvoked: false,
              },
            });
          }
          Object.assign(delivery, {
            status: "queued",
            attempt_count: Math.max(
              delivery.attempt_count,
              parameters.p_attempt_number
            ),
            claim_token: "",
            claimed_at: null,
            claim_expires_at: null,
          });
          return { data: { ...delivery }, error: null };
        }

        return { data: null, error: new Error(`Unexpected RPC ${name}`) };
      },
    },
  };
}

function queuedObservationDelivery(overrides = {}) {
  return {
    id: "delivery:notification-1:email:customer:customer-1:test:v1",
    notification_id: "notification-1",
    channel: "email",
    destination_snapshot: {
      observationOnly: true,
      email: "customer@example.com",
    },
    status: "queued",
    attempt_count: 0,
    claim_token: "",
    claimed_at: null,
    claim_expires_at: null,
    ...overrides,
  };
}

test("Phase 2E migration provides atomic claims, leases, recovery, and guarded completion", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/notification-engine-phase2e-dispatcher.sql",
      import.meta.url
    ),
    "utf8"
  );

  expect(migration).toContain(
    "claim_notification_deliveries_observation"
  );
  expect(migration).toContain("for update of d skip locked");
  expect(migration).toContain("claim_expires_at");
  expect(migration).toContain(
    "recover_abandoned_notification_delivery_claims"
  );
  expect(migration).toContain(
    "complete_notification_delivery_observation"
  );
  expect(migration).toContain("notification_delivery_attempts");
  expect(migration).toContain("provider_idempotency_key");
  expect(migration).toContain("'adapterInvoked', false");
});

test("dispatcher eligibility is restricted to queued observation deliveries", () => {
  const eligible = queuedObservationDelivery();
  expect(isObservationDeliveryEligible(eligible)).toBe(true);
  expect(
    isObservationDeliveryEligible({
      ...eligible,
      destination_snapshot: { observationOnly: false },
    })
  ).toBe(false);
  expect(
    isObservationDeliveryEligible({ ...eligible, status: "suppressed" })
  ).toBe(false);
  expect(
    isObservationDeliveryEligible({ ...eligible, status: "not_deliverable" })
  ).toBe(false);
});

test("claim leases must be processing, identified, and unexpired", () => {
  const claimed = queuedObservationDelivery({
    status: "processing",
    claim_token: "claim-1",
    claim_expires_at: "2026-07-25T12:01:00.000Z",
  });

  expect(
    isClaimLeaseValid(claimed, new Date("2026-07-25T12:00:30.000Z"))
  ).toBe(true);
  expect(
    isClaimLeaseValid(claimed, new Date("2026-07-25T12:01:00.000Z"))
  ).toBe(false);
  expect(isClaimLeaseValid({ ...claimed, claim_token: "" })).toBe(false);
});

test("observation dispatcher durably claims and records an immutable attempt without adapter execution", async () => {
  const store = createDispatcherClient([queuedObservationDelivery()]);
  const result = await runNotificationDispatcherObservation({
    workerId: "worker-1",
    client: store.client,
    now: () => new Date("2026-07-25T12:00:30.000Z"),
  });

  expect(result).toMatchObject({
    mode: "observation_only",
    adapterExecutionEnabled: false,
    recoveredCount: 0,
    claimedCount: 1,
    completedCount: 1,
  });
  expect(store.attempts).toHaveLength(1);
  expect(store.attempts[0]).toMatchObject({
    attempt_number: 1,
    provider_key: "observation_dispatcher",
    outcome: "indeterminate",
    provider_metadata: {
      observationOnly: true,
      adapterInvoked: false,
    },
  });
  expect(store.deliveries[0]).toMatchObject({
    status: "queued",
    attempt_count: 1,
    claim_token: "",
    claimed_at: null,
    claim_expires_at: null,
  });
});

test("attempt identity is deterministic for idempotent completion replay", async () => {
  const store = createDispatcherClient([queuedObservationDelivery()]);
  const input = {
    workerId: "worker-2",
    client: store.client,
    now: () => new Date("2026-07-25T12:00:30.000Z"),
  };
  const first = await runNotificationDispatcherObservation(input);
  const firstCompletion = store.calls.find(
    (call) => call.name === NOTIFICATION_DISPATCHER_RPCS.completeObservation
  );

  const replay = await store.client.rpc(
    NOTIFICATION_DISPATCHER_RPCS.completeObservation,
    firstCompletion.parameters
  );

  expect(replay.error).toBeNull();
  expect(store.attempts).toHaveLength(1);
  expect(first.observations[0].attempt.id).toBe(
    firstCompletion.parameters.p_attempt_id
  );
});

test("dispatcher recovers an abandoned lease before claiming the delivery again", async () => {
  const store = createDispatcherClient([
    queuedObservationDelivery({
      status: "processing",
      claim_token: "abandoned-claim",
      claimed_at: "2026-07-25T11:58:00.000Z",
      claim_expires_at: "2026-07-25T11:59:00.000Z",
    }),
  ]);
  const result = await runNotificationDispatcherObservation({
    workerId: "recovery-worker",
    client: store.client,
    now: () => new Date("2026-07-25T12:00:30.000Z"),
  });

  expect(result).toMatchObject({
    recoveredCount: 1,
    claimedCount: 1,
    completedCount: 1,
  });
  expect(store.attempts).toHaveLength(1);
  expect(store.deliveries[0]).toMatchObject({
    status: "queued",
    attempt_count: 1,
    claim_token: "",
  });
});

test("dispatcher validates worker identity before durable mutation", async () => {
  const store = createDispatcherClient([queuedObservationDelivery()]);

  await expect(
    runNotificationDispatcherObservation({
      workerId: "",
      client: store.client,
    })
  ).rejects.toThrow("worker id is required");
  expect(store.calls).toHaveLength(0);
});

test("Phase 2E introduces no adapter, provider call, Resend, or staff inbox execution", async () => {
  const combined = await readFile(
    new URL("../src/lib/notificationDispatcher.js", import.meta.url),
    "utf8"
  );

  expect(combined).not.toContain("fetch(");
  expect(combined).not.toContain("createStaffNotification");
  expect(combined).not.toContain("staffNotificationsStore");
  expect(combined).not.toContain("Resend");
  expect(combined).not.toContain("Twilio");
  expect(combined).not.toContain("adapter.execute");
  expect(combined).not.toContain("persistNotificationDeliveryAttempt");
});
