import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  createTwilioSmsAdapter,
  getConfiguredTwilioFromNumber,
} from "../netlify/functions/lib/twilioSmsAdapter.js";
import {
  buildTwilioSmsAdapterRequest,
  runScheduledTwilioSmsDispatcher,
} from "../netlify/functions/lib/twilioSmsDispatcher.js";
import scheduledSmsDispatcher, {
  config as scheduledSmsConfig,
  handler as scheduledSmsHandler,
} from "../netlify/functions/notification-sms-dispatcher-scheduled.js";
import { decideDeliveryFailureTransition } from "../src/lib/notificationDeliveryLifecycle.js";
import { NOTIFICATION_DISPATCHER_RPCS } from "../src/lib/notificationDispatcherRepository.js";

const NOW = "2026-07-25T12:00:00.000Z";
const ACCOUNT_SID = "AC11111111111111111111111111111111";
const AUTH_TOKEN = "test-auth-token";
const FROM = "+14165550100";
const TO = "+14165550101";
const MESSAGE_SID = "SM22222222222222222222222222222222";

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

function smsEnvelope(id = "sms-1", overrides = {}) {
  const delivery = {
    id: `delivery:${id}`,
    notification_id: `notification:${id}`,
    channel: "sms",
    status: "queued",
    attempt_count: 0,
    next_retry_at: null,
    claim_token: "",
    claim_expires_at: null,
    destination_snapshot: {
      phone: TO,
      normalizedPhone: TO.replace(/\D/g, ""),
      observationOnly: false,
    },
    rendered_content: { body: "Your Tee & Co order is approved." },
    idempotency_key: `idempotency:${id}`,
    ...overrides.delivery,
  };
  return {
    delivery,
    notification: {
      id: delivery.notification_id,
      business_event_id: `event:${id}`,
      event_type: "quote_approved",
      delivery_mode: "automatic",
      policy_snapshot: { sms_enabled: true },
      engine_metadata: {
        observationOnly: false,
        phase2D: { dispatcherEligible: true },
      },
      ...overrides.notification,
    },
    business_event: {
      id: `event:${id}`,
      event_type: "quote_approved",
      ...overrides.businessEvent,
    },
  };
}

function createTwilioLifecycleDatabase(envelopes) {
  let clock = new Date(NOW);
  let claimSequence = 0;
  const attempts = [];
  const runs = new Map();

  function eligible(item) {
    return (
      item.delivery.channel === "sms" &&
      item.notification.delivery_mode === "automatic" &&
      item.notification.policy_snapshot.sms_enabled === true &&
      item.notification.engine_metadata.observationOnly === false &&
      item.notification.engine_metadata.phase2D?.dispatcherEligible === true &&
      item.delivery.destination_snapshot.observationOnly === false
    );
  }

  return {
    attempts,
    runs,
    advance(milliseconds) {
      clock = new Date(clock.getTime() + milliseconds);
    },
    client: {
      async rpc(name, parameters) {
        if (name === NOTIFICATION_DISPATCHER_RPCS.startTwilioDispatchRun) {
          const run = {
            id: parameters.p_run_id,
            worker_id: parameters.p_worker_id,
            runner_type: "scheduled_twilio_authoritative",
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
          });
          return { data: run, error: null };
        }
        if (
          name === NOTIFICATION_DISPATCHER_RPCS.recoverTwilioAuthoritative
        ) {
          const recovered = [];
          for (const item of envelopes) {
            const delivery = item.delivery;
            if (
              eligible(item) &&
              delivery.status === "processing" &&
              delivery.claim_expires_at &&
              new Date(delivery.claim_expires_at) <= clock
            ) {
              delivery.status =
                delivery.attempt_count > 0 ? "retry_scheduled" : "queued";
              delivery.next_retry_at =
                delivery.status === "retry_scheduled"
                  ? clock.toISOString()
                  : null;
              delivery.claim_token = "";
              delivery.claim_expires_at = null;
              recovered.push({ ...delivery });
            }
          }
          return { data: recovered.slice(0, parameters.p_limit), error: null };
        }
        if (name === NOTIFICATION_DISPATCHER_RPCS.claimTwilioAuthoritative) {
          const claimed = envelopes
            .filter((item) => {
              const delivery = item.delivery;
              return (
                eligible(item) &&
                (delivery.status === "queued" ||
                  (delivery.status === "retry_scheduled" &&
                    delivery.next_retry_at &&
                    new Date(delivery.next_retry_at) <= clock))
              );
            })
            .slice(0, parameters.p_limit);
          claimSequence += 1;
          return {
            data: claimed.map((item) => {
              item.delivery.status = "processing";
              item.delivery.claim_token = `twilio:${claimSequence}:${item.delivery.id}`;
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
        if (name === NOTIFICATION_DISPATCHER_RPCS.completeTwilioAuthoritative) {
          const item = envelopes.find(
            ({ delivery }) => delivery.id === parameters.p_delivery_id
          );
          const delivery = item.delivery;
          if (
            delivery.status !== "processing" ||
            delivery.claim_token !== parameters.p_claim_token
          ) {
            return { data: null, error: new Error("Invalid Twilio claim.") };
          }
          const existing = attempts.find(
            ({ id }) => id === parameters.p_attempt_id
          );
          if (existing) return { data: { ...delivery }, error: null };
          attempts.push({
            id: parameters.p_attempt_id,
            deliveryId: delivery.id,
            attemptNumber: parameters.p_attempt_number,
            providerKey: "twilio",
            providerIdempotencyKey: delivery.idempotency_key,
            providerMessageId: parameters.p_provider_message_id,
            retryability: parameters.p_retryability,
          });
          delivery.attempt_count = parameters.p_attempt_number;
          delivery.provider_key = "twilio";
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
    },
  };
}

test("Twilio adapter sends stored destination and body and returns Message SID", async () => {
  const calls = [];
  const adapter = createTwilioSmsAdapter({
    accountSid: ACCOUNT_SID,
    authToken: AUTH_TOKEN,
    from: FROM,
    async fetchImpl(url, options) {
      calls.push({ url, options });
      return response(201, {
        sid: MESSAGE_SID,
        status: "queued",
        num_segments: "1",
      });
    },
  });
  const result = await adapter.send({
    deliveryId: "delivery:sms-1",
    idempotencyKey: "idempotency:sms-1",
    destination: { phone: TO },
    content: { body: "Stored rendered SMS." },
  });

  expect(result).toMatchObject({
    ok: true,
    status: "sent",
    retryability: "terminal",
    providerMessageId: MESSAGE_SID,
  });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toContain(
    `/Accounts/${ACCOUNT_SID}/Messages.json`
  );
  expect(calls[0].options.headers.Authorization).toBe(
    `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64")}`
  );
  const form = new URLSearchParams(calls[0].options.body);
  expect(Object.fromEntries(form)).toEqual({
    To: TO,
    From: FROM,
    Body: "Stored rendered SMS.",
  });
  expect(result.providerMetadata).toMatchObject({
    deliveryId: "delivery:sms-1",
    idempotencyKey: "idempotency:sms-1",
    twilioStatus: "queued",
  });
});

test("Twilio adapter normalizes retryable, terminal, and indeterminate outcomes", async () => {
  const request = {
    deliveryId: "delivery:classification",
    idempotencyKey: "idempotency:classification",
    destination: { phone: TO },
    content: { body: "Classification test." },
  };
  const configured = (fetchImpl) =>
    createTwilioSmsAdapter({
      accountSid: ACCOUNT_SID,
      authToken: AUTH_TOKEN,
      from: FROM,
      fetchImpl,
    });

  await expect(
    configured(async () =>
      response(429, { code: 20429, message: "Too many requests" })
    ).send(request)
  ).resolves.toMatchObject({
    status: "failed",
    retryability: "retryable",
    failureCode: "20429",
  });
  await expect(
    configured(async () =>
      response(400, { code: 21211, message: "Invalid To number" })
    ).send(request)
  ).resolves.toMatchObject({
    status: "failed",
    retryability: "terminal",
    failureCode: "21211",
  });
  await expect(
    configured(async () => {
      throw new Error("Connection reset after request.");
    }).send(request)
  ).resolves.toMatchObject({
    status: "failed",
    retryability: "indeterminate",
    failureCode: "twilio_transport_error",
  });
});

test("Twilio adapter rejects invalid SMS data without invoking provider", async () => {
  let calls = 0;
  const adapter = createTwilioSmsAdapter({
    accountSid: ACCOUNT_SID,
    authToken: AUTH_TOKEN,
    from: FROM,
    async fetchImpl() {
      calls += 1;
      return response(201, {});
    },
  });
  const result = await adapter.send({
    deliveryId: "delivery:invalid",
    idempotencyKey: "idempotency:invalid",
    destination: { phone: "555-0100" },
    content: { body: "Invalid phone." },
  });
  expect(result).toMatchObject({
    status: "failed",
    retryability: "terminal",
    failureCode: "twilio_invalid_request",
  });
  expect(calls).toBe(0);
});

test("SMS dispatcher persists SID and deterministic Delivery Attempt identity", async () => {
  const envelope = smsEnvelope();
  const database = createTwilioLifecycleDatabase([envelope]);
  const adapter = {
    key: "twilio",
    requests: [],
    async send(request) {
      this.requests.push(request);
      return {
        ok: true,
        status: "sent",
        retryability: "terminal",
        providerMessageId: MESSAGE_SID,
        failureCode: "",
        failureReason: "",
        providerMetadata: { twilioStatus: "queued" },
      };
    },
  };

  const result = await runScheduledTwilioSmsDispatcher({
    cutoverEnabled: true,
    runId: "twilio-run-1",
    workerId: "twilio-worker-1",
    adapter,
    dispatcherClient: database.client,
    now: () => new Date(NOW),
  });

  expect(result).toMatchObject({
    status: "completed",
    claimedCount: 1,
    completedCount: 1,
  });
  expect(adapter.requests[0]).toMatchObject({
    deliveryId: envelope.delivery.id,
    idempotencyKey: envelope.delivery.idempotency_key,
    destination: { phone: TO },
    content: { body: "Your Tee & Co order is approved." },
  });
  expect(database.attempts).toEqual([
    {
      id: `attempt:${envelope.delivery.id}:1`,
      deliveryId: envelope.delivery.id,
      attemptNumber: 1,
      providerKey: "twilio",
      providerIdempotencyKey: envelope.delivery.idempotency_key,
      providerMessageId: MESSAGE_SID,
      retryability: "terminal",
    },
  ]);
  expect(envelope.delivery).toMatchObject({
    status: "sent",
    provider_key: "twilio",
    provider_message_id: MESSAGE_SID,
  });
});

test("SMS dispatcher is policy-driven and ignores disabled, manual, and observation Deliveries", async () => {
  const enabled = smsEnvelope("enabled");
  const disabled = smsEnvelope("disabled", {
    notification: { policy_snapshot: { sms_enabled: false } },
  });
  const manual = smsEnvelope("manual", {
    notification: { delivery_mode: "approval_required" },
  });
  const observation = smsEnvelope("observation", {
    delivery: {
      destination_snapshot: {
        phone: TO,
        normalizedPhone: TO.replace(/\D/g, ""),
        observationOnly: true,
      },
    },
    notification: { engine_metadata: { observationOnly: true } },
  });
  const dispatcherIneligible = smsEnvelope("dispatcher-ineligible", {
    notification: {
      engine_metadata: {
        observationOnly: false,
        phase2D: { dispatcherEligible: false },
      },
    },
  });
  const database = createTwilioLifecycleDatabase([
    enabled,
    disabled,
    manual,
    observation,
    dispatcherIneligible,
  ]);
  const requests = [];
  await runScheduledTwilioSmsDispatcher({
    cutoverEnabled: true,
    runId: "policy-run",
    workerId: "policy-worker",
    adapter: {
      key: "twilio",
      async send(request) {
        requests.push(request);
        return {
          status: "sent",
          retryability: "terminal",
          providerMessageId: MESSAGE_SID,
          providerMetadata: {},
        };
      },
    },
    dispatcherClient: database.client,
    now: () => new Date(NOW),
  });
  expect(requests.map(({ deliveryId }) => deliveryId)).toEqual([
    enabled.delivery.id,
  ]);
  expect(disabled.delivery.status).toBe("queued");
  expect(manual.delivery.status).toBe("queued");
  expect(observation.delivery.status).toBe("queued");
  expect(dispatcherIneligible.delivery.status).toBe("queued");
});

test("Twilio retry reuses Delivery idempotency and creates a new immutable Attempt", async () => {
  const envelope = smsEnvelope("retry");
  const database = createTwilioLifecycleDatabase([envelope]);
  const requests = [];
  let call = 0;
  const adapter = {
    key: "twilio",
    async send(request) {
      requests.push(request);
      call += 1;
      return call === 1
        ? {
            status: "failed",
            retryability: "retryable",
            providerMessageId: "",
            failureCode: "20429",
            failureReason: "Rate limited.",
            providerMetadata: { httpStatus: 429 },
          }
        : {
            status: "sent",
            retryability: "terminal",
            providerMessageId: MESSAGE_SID,
            failureCode: "",
            failureReason: "",
            providerMetadata: { httpStatus: 201 },
          };
    },
  };
  const run = (runId) =>
    runScheduledTwilioSmsDispatcher({
      cutoverEnabled: true,
      runId,
      workerId: `worker:${runId}`,
      adapter,
      dispatcherClient: database.client,
      retryPolicy: { maxAttempts: 3, baseDelaySeconds: 60 },
      now: () => new Date(NOW),
    });

  await run("retry-1");
  expect(envelope.delivery.status).toBe("retry_scheduled");
  await run("retry-too-early");
  expect(requests).toHaveLength(1);
  database.advance(61_000);
  await run("retry-2");
  expect(envelope.delivery.status).toBe("sent");
  expect(database.attempts.map(({ attemptNumber }) => attemptNumber)).toEqual([
    1, 2,
  ]);
  expect(requests.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
    envelope.delivery.idempotency_key,
    envelope.delivery.idempotency_key,
  ]);
});

test("Twilio configuration uses server-only environment names", () => {
  expect(
    getConfiguredTwilioFromNumber({
      TWILIO_FROM_NUMBER: " +1 (416) 555-0100 ",
    })
  ).toBe(FROM);
});

test("SMS cutover gate fails closed before runs, claims, or provider invocation", async () => {
  const calls = [];
  const disabled = await runScheduledTwilioSmsDispatcher({
    cutoverEnabled: false,
    runId: "disabled-run",
    workerId: "disabled-worker",
    adapter: {
      key: "twilio",
      async send() {
        calls.push("provider");
      },
    },
    dispatcherClient: {
      async rpc() {
        calls.push("rpc");
        return { data: null, error: null };
      },
    },
  });
  expect(disabled).toMatchObject({
    executed: false,
    gateEnabled: false,
    reason: "sms_cutover_disabled",
    recoveredCount: 0,
    claimedCount: 0,
  });
  expect(calls).toEqual([]);

  const originalGate = process.env.NOTIFICATION_ENGINE_SMS_CUTOVER;
  delete process.env.NOTIFICATION_ENGINE_SMS_CUTOVER;
  try {
    const response = await scheduledSmsHandler({
      time: "2026-07-25T12:00:00.000Z",
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      executed: false,
      gateEnabled: false,
      reason: "sms_cutover_disabled",
    });
  } finally {
    if (originalGate === undefined) {
      delete process.env.NOTIFICATION_ENGINE_SMS_CUTOVER;
    } else {
      process.env.NOTIFICATION_ENGINE_SMS_CUTOVER = originalGate;
    }
  }
});

test("SMS dispatcher uses Netlify's canonical scheduled-function entrypoint", async () => {
  expect(scheduledSmsConfig).toEqual({ schedule: "* * * * *" });

  const originalGate = process.env.NOTIFICATION_ENGINE_SMS_CUTOVER;
  delete process.env.NOTIFICATION_ENGINE_SMS_CUTOVER;
  try {
    const response = await scheduledSmsDispatcher(
      new Request(
        "https://example.netlify.app/.netlify/functions/notification-sms-dispatcher-scheduled",
        {
          method: "POST",
          body: JSON.stringify({
            next_run: "2026-07-25T12:01:00.000Z",
          }),
        }
      )
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      executed: false,
      gateEnabled: false,
      reason: "sms_cutover_disabled",
    });
  } finally {
    if (originalGate === undefined) {
      delete process.env.NOTIFICATION_ENGINE_SMS_CUTOVER;
    } else {
      process.env.NOTIFICATION_ENGINE_SMS_CUTOVER = originalGate;
    }
  }
});

test("Twilio migration is service-only and reuses approved lifecycle semantics", async () => {
  const [sql, scheduled, adapterSource, emailScheduled] = await Promise.all([
    readFile("supabase/notification-engine-twilio-sms-adapter.sql", "utf8"),
    readFile(
      "netlify/functions/notification-sms-dispatcher-scheduled.js",
      "utf8"
    ),
    readFile("netlify/functions/lib/twilioSmsAdapter.js", "utf8"),
    readFile(
      "netlify/functions/notification-dispatcher-scheduled.js",
      "utf8"
    ),
  ]);
  expect(sql).toContain("delivery.channel = 'sms'");
  expect(sql).toContain("notification.delivery_mode = 'automatic'");
  expect(sql).toContain("'sms_enabled'");
  expect(sql).toContain("'{phase2D,dispatcherEligible}'");
  expect(sql).toContain("for update of delivery skip locked");
  expect(sql).toContain("provider_key");
  expect(sql).toContain("'twilio'");
  expect(sql).toContain("refresh_notification_aggregate_status");
  expect(sql).toContain("to service_role");
  expect(sql).toContain("from public, anon, authenticated");
  expect(scheduled).toContain("TWILIO_ACCOUNT_SID");
  expect(scheduled).toContain("TWILIO_AUTH_TOKEN");
  expect(scheduled).toContain("NOTIFICATION_ENGINE_SMS_CUTOVER");
  expect(adapterSource).toContain("TWILIO_FROM_NUMBER");
  expect(scheduled).not.toContain("RESEND_API_KEY");
  expect(emailScheduled).not.toContain("TWILIO");
});

test("stored SMS Delivery request never reads mutable template or customer records", () => {
  const envelope = smsEnvelope("snapshot", {
    delivery: {
      status: "processing",
      claim_token: "twilio:worker:claim",
    },
  });
  const request = buildTwilioSmsAdapterRequest({
    delivery: envelope.delivery,
    notification: envelope.notification,
    businessEvent: envelope.business_event,
  });
  expect(request).toMatchObject({
    deliveryId: envelope.delivery.id,
    idempotencyKey: envelope.delivery.idempotency_key,
    destination: { phone: TO },
    content: { body: "Your Tee & Co order is approved." },
  });
});
