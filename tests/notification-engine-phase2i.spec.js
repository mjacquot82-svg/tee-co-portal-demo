import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  AUTHORITATIVE_NOTIFICATION_EVENTS,
  resolveNotificationEngineCutover,
} from "../src/lib/notificationEngineCutover.js";
import { runResendEmailDeliveryCutover } from "../netlify/functions/lib/resendEmailDispatcher.js";
import { verifyNotificationEngineParity } from "../src/lib/notificationCutoverVerification.js";

test("Phase 2I defaults to legacy rollback mode", () => {
  expect(resolveNotificationEngineCutover("quote_approved", {
    notificationEngineCutoverMode: "legacy",
    phase2BShadowEnabled: false,
  })).toMatchObject({
    mode: "legacy",
    runLegacy: true,
    runEngine: false,
    observationOnly: true,
    rollbackMode: "legacy",
  });
});

test("Phase 2I verify mode keeps legacy authoritative and enables durable observation", () => {
  expect(resolveNotificationEngineCutover("quote_approved", {
    notificationEngineCutoverMode: "verify",
  })).toMatchObject({
    mode: "verify",
    runLegacy: true,
    runEngine: true,
    observationOnly: true,
  });
});

test("authoritative cutover includes approved operational customer lifecycle events", () => {
  expect(AUTHORITATIVE_NOTIFICATION_EVENTS).toEqual([
    "quote_approved",
    "deposit_requested",
    "payment_received",
    "order_in_production",
    "order_ready_for_pickup",
    "order_completed",
  ]);
  expect(resolveNotificationEngineCutover("quote_approved", {
    notificationEngineCutoverMode: "authoritative",
  })).toMatchObject({
    mode: "authoritative",
    runLegacy: false,
    runEngine: true,
    observationOnly: false,
  });
  expect(resolveNotificationEngineCutover("payment_received", {
    notificationEngineCutoverMode: "authoritative",
  })).toMatchObject({
    mode: "authoritative",
    runLegacy: false,
    runEngine: true,
  });
  expect(resolveNotificationEngineCutover("payment_failed", {
    notificationEngineCutoverMode: "authoritative",
  })).toMatchObject({
    mode: "legacy",
    runLegacy: true,
    runEngine: false,
  });
  expect(resolveNotificationEngineCutover("order_ready_for_pickup", {
    notificationEngineCutoverMode: "authoritative",
  })).toMatchObject({
    mode: "authoritative",
    runLegacy: false,
    runEngine: true,
    observationOnly: false,
  });
});

test("authoritative Resend consumes one claimed durable Delivery and completes its Attempt", async () => {
  const rpcCalls = [];
  const delivery = {
    id: "delivery:cutover-1",
    notification_id: "notification:cutover-1",
    channel: "email",
    status: "processing",
    claim_token: "claim-1",
    claimed_at: "2026-07-25T12:00:00.000Z",
    attempt_count: 0,
    idempotency_key: "delivery:cutover-1",
    destination_snapshot: {
      email: "customer@example.com",
      observationOnly: false,
    },
    rendered_content: { subject: "Approved", body: "Stored body" },
  };
  const client = {
    async rpc(name, parameters) {
      rpcCalls.push([name, parameters]);
      if (name === "claim_resend_email_delivery_cutover") {
        return {
          data: [{
            delivery,
            notification: {
              id: "notification:cutover-1",
              business_event_id: "event:cutover-1",
              event_type: "quote_approved",
            },
            business_event: { id: "event:cutover-1" },
          }],
          error: null,
        };
      }
      return {
        data: { ...delivery, status: "sent", provider_message_id: "resend-1" },
        error: null,
      };
    },
  };
  const requests = [];
  const adapter = {
    key: "resend",
    async send(request) {
      requests.push(request);
      return {
        ok: true,
        status: "sent",
        retryability: "terminal",
        providerMessageId: "resend-1",
        failureCode: "",
        failureReason: "",
        providerMetadata: {},
      };
    },
  };

  const result = await runResendEmailDeliveryCutover({
    deliveryId: delivery.id,
    workerId: "worker-1",
    adapter,
    dispatcherClient: client,
    now: () => new Date("2026-07-25T12:00:01.000Z"),
  });

  expect(result.claimed).toBe(true);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    destination: { email: "customer@example.com" },
    content: { subject: "Approved", body: "Stored body" },
    idempotencyKey: "delivery:cutover-1",
  });
  expect(rpcCalls.map(([name]) => name)).toEqual([
    "claim_resend_email_delivery_cutover",
    "complete_resend_email_delivery_cutover",
  ]);
});

test("Phase 2I migration verifies durable cardinality, disabled channels, and aggregate state", async () => {
  const migration = await readFile(
    new URL("../supabase/notification-engine-phase2i-cutover.sql", import.meta.url),
    "utf8"
  );
  [
    "notification_engine_cutover_verification",
    "exactly_one_notification",
    "exactly_one_business_event",
    "deliveries_unique",
    "disabled_channels_empty",
    "aggregate_matches",
    "claim_resend_email_delivery_cutover",
    "complete_resend_email_delivery_cutover",
  ].forEach((term) => expect(migration).toContain(term));
  expect(migration).toContain("n.event_type = 'quote_approved'");
  expect(migration).toContain("to service_role");
});

test("Phase 2I parity verifier confirms one event, notification, and enabled-channel Delivery", () => {
  const businessEvent = {
    id: "event-1",
    event_type: "quote_approved",
    subject_type: "order",
    subject_id: "order-1",
    occurrence_id: "approval-1",
  };
  const notification = {
    id: "notification-1",
    business_event_id: "event-1",
    policy_id: "policy-1",
    policy_version: 1,
    policy_snapshot: {
      email_enabled: true,
      sms_enabled: false,
      staff_notification_enabled: false,
    },
    status: "completed",
  };
  const delivery = {
    id: "delivery-1",
    notification_id: "notification-1",
    channel: "email",
    recipient_type: "customer",
    recipient_key: "customer-1",
    destination_key: "customer@example.com",
    template_version_id: "quote_approved:v1",
    status: "sent",
  };
  expect(verifyNotificationEngineParity({
    businessEvents: [businessEvent],
    notifications: [notification],
    deliveries: [delivery],
    expectedRecipientsByNotification: {
      "notification-1": { email: [{ recipientKey: "customer-1" }] },
    },
  })).toMatchObject({ passed: true, failures: [] });
});

test("Phase 2I parity verifier rejects duplicates, disabled-channel Deliveries, and aggregate mismatch", () => {
  const duplicatedEvent = {
    id: "event-1",
    event_type: "payment_received",
    subject_type: "payment",
    subject_id: "payment-1",
    occurrence_id: "receipt-1",
  };
  const notification = {
    id: "notification-1",
    business_event_id: "event-1",
    policy_id: "policy-1",
    policy_version: 1,
    policy_snapshot: {
      email_enabled: false,
      sms_enabled: false,
      staff_notification_enabled: false,
    },
    status: "completed",
  };
  const delivery = {
    notification_id: "notification-1",
    channel: "email",
    recipient_type: "customer",
    recipient_key: "customer-1",
    destination_key: "customer@example.com",
    template_version_id: "payment_received:v1",
    status: "queued",
  };
  const result = verifyNotificationEngineParity({
    businessEvents: [duplicatedEvent, { ...duplicatedEvent, id: "event-2" }],
    notifications: [notification],
    deliveries: [delivery, { ...delivery }],
  });
  expect(result.passed).toBe(false);
  expect(result.failures.map((failure) => failure.code)).toEqual(expect.arrayContaining([
    "business_event_cardinality",
    "disabled_channel_delivery",
    "duplicate_delivery_identity",
    "aggregate_state_mismatch",
  ]));
});

test("Phase 2I retires pending promise registries and preserves legacy history reads", async () => {
  const [deliveryService, activityRepository] = await Promise.all([
    readFile(new URL("../src/lib/notificationDeliveryService.js", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/notificationActivityRepository.js", import.meta.url), "utf8"),
  ]);
  expect(deliveryService).not.toContain("pendingDeliveries");
  expect(deliveryService).not.toContain("pendingPhase2BObservations");
  expect(deliveryService).toContain("SUPABASE_TABLE = \"notification_activity\"");
  expect(activityRepository).toContain("listNotificationActivity");
  expect(activityRepository).toContain("Legacy");
});

test("authoritative lifecycle expansion preserves the existing SMS provider architecture", async () => {
  const sources = await Promise.all([
    "../src/lib/notificationEngineCutover.js",
    "../netlify/functions/customer-notification.js",
    "../supabase/notification-engine-phase2i-cutover.sql",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const combined = sources.join("\n");
  expect(combined).not.toContain("Twilio");
  expect(combined).not.toContain("sendSms");
  expect(AUTHORITATIVE_NOTIFICATION_EVENTS).toContain(
    "order_ready_for_pickup"
  );
});
