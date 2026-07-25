import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  buildBusinessEventIdentity,
  buildDeliveryAttemptIdentity,
  buildDeliveryIdentity,
  buildNotificationIdentity,
  buildPhase2APolicySeed,
  buildPhase2ATemplateVersionSeed,
  mapBusinessEventToRow,
  mapDeliveryAttemptToRow,
  mapDeliveryToRow,
  mapNotificationToRow,
  NOTIFICATION_DELIVERY_STATUSES,
  NOTIFICATION_POLICY_DELIVERY_MODES,
} from "../src/lib/notificationEngineFoundation.js";
import {
  NOTIFICATION_ENGINE_TABLES,
  persistNotificationBusinessEvent,
} from "../src/lib/notificationEngineRepository.js";

test("Phase 2A migration is additive and defines the approved durable hierarchy", async () => {
  const migration = await readFile(
    new URL("../supabase/notification-engine-phase2a-foundation.sql", import.meta.url),
    "utf8"
  );

  [
    "notification_business_events",
    "notification_policies",
    "notification_template_versions",
    "notifications",
    "notification_deliveries",
    "notification_delivery_attempts",
  ].forEach((table) => {
    expect(migration).toContain(`create table if not exists public.${table}`);
  });

  expect(migration).toContain("from public.notification_templates");
  expect(migration).toContain("on conflict (template_type, version) do nothing");
  expect(migration).toContain("on conflict (event_type, version) do nothing");
  expect(migration).not.toMatch(/\bdrop table\b/i);
  expect(migration).not.toMatch(/\btruncate\b/i);
  expect(migration).not.toMatch(/\bdelete from\b/i);
  expect(migration).not.toMatch(/\balter table\s+public\\.(notification_templates|notification_activity|staff_notifications)\b/i);
});

test("current template settings seed an immutable version and automatic policy", () => {
  const currentTemplate = {
    type: "deposit_requested",
    name: "Deposit Requested",
    emailSubject: "Deposit for {{order_number}}",
    emailBody: "Pay {{deposit_amount}}.",
    smsMessage: "Pay {{deposit_amount}} for {{order_number}}.",
    emailEnabled: true,
    smsEnabled: true,
    staffNotificationEnabled: true,
  };

  expect(buildPhase2ATemplateVersionSeed(currentTemplate)).toMatchObject({
    id: "deposit_requested:v1",
    template_type: "deposit_requested",
    version: 1,
    status: "published",
  });

  expect(buildPhase2APolicySeed(currentTemplate)).toMatchObject({
    id: "policy:deposit_requested:v1",
    event_type: "deposit_requested",
    version: 1,
    enabled: true,
    delivery_mode: NOTIFICATION_POLICY_DELIVERY_MODES.automatic,
    email_enabled: true,
    sms_enabled: true,
    staff_notification_enabled: true,
    customer_audience_enabled: true,
    staff_audience_enabled: true,
    owner_audience_enabled: false,
    channel_template_assignments: {
      email: "deposit_requested:v1",
      sms: "deposit_requested:v1",
      staff: "deposit_requested:v1",
    },
  });
});

test("Phase 2A identity builders distinguish event, notification, delivery, and attempt", () => {
  const businessEventId = buildBusinessEventIdentity({
    eventType: "payment_failed",
    subjectType: "payment",
    subjectId: "payment-42",
    occurrenceId: "square-event-99",
  });
  const notificationId = buildNotificationIdentity(
    businessEventId,
    "policy:payment_failed:v1",
    1
  );
  const deliveryId = buildDeliveryIdentity({
    notificationId,
    channel: "email",
    recipientType: "customer",
    recipientKey: "customer-7",
    destinationKey: "alex@example.com",
    templateVersionId: "payment_failed:v1",
  });

  expect(businessEventId).toBe(
    "payment_failed:payment:payment-42:square-event-99"
  );
  expect(notificationId).toContain("policy:payment_failed:v1");
  expect(deliveryId).toContain("email:customer:customer-7:alex@example.com");
  expect(buildDeliveryAttemptIdentity(deliveryId, 2)).toBe(`attempt:${deliveryId}:2`);
});

test("Phase 2A row mappers preserve the approved durable relationships", () => {
  const event = mapBusinessEventToRow({
    eventType: "quote_approved",
    subjectType: "order",
    subjectId: "TC-2001",
    occurrenceId: "approval-transition-1",
    correlationId: "order:TC-2001",
    occurredAt: "2026-07-25T12:00:00.000Z",
    payload: { approvalStatus: "Approved" },
  });
  const notification = mapNotificationToRow({
    businessEventId: event.id,
    eventType: event.event_type,
    subjectType: event.subject_type,
    subjectId: event.subject_id,
    policyId: "policy:quote_approved:v1",
    policyVersion: 1,
    policySnapshot: { email_enabled: true },
  });
  const delivery = mapDeliveryToRow({
    notificationId: notification.id,
    channel: "email",
    recipientType: "customer",
    recipientKey: "customer-1",
    recipientSnapshot: { id: "customer-1", name: "Taylor" },
    destinationKey: "taylor@example.com",
    destinationSnapshot: { email: "taylor@example.com" },
    templateType: "quote_approved",
    templateVersionId: "quote_approved:v1",
    templateVersion: 1,
    renderedContent: { emailSubject: "Approved" },
  });
  const attempt = mapDeliveryAttemptToRow({
    deliveryId: delivery.id,
    attemptNumber: 1,
    providerKey: "email-provider",
  });

  expect(notification.business_event_id).toBe(event.id);
  expect(delivery.notification_id).toBe(notification.id);
  expect(delivery.status).toBe(NOTIFICATION_DELIVERY_STATUSES.queued);
  expect(delivery.idempotency_key).toBe(delivery.id);
  expect(attempt.delivery_id).toBe(delivery.id);
  expect(attempt.provider_idempotency_key).toBe(attempt.id);
});

test("Phase 2A repository targets new tables without requiring the live client", async () => {
  const calls = [];
  const fakeClient = {
    from(table) {
      calls.push(["from", table]);
      return {
        upsert(row, options) {
          calls.push(["upsert", row, options]);
          return {
            select() {
              return {
                async single() {
                  return { data: row, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  const row = {
    id: "event-1",
    event_type: "quote_approved",
    subject_type: "order",
    subject_id: "TC-1",
    occurrence_id: "approval-1",
    occurred_at: "2026-07-25T12:00:00.000Z",
  };

  await expect(persistNotificationBusinessEvent(row, fakeClient)).resolves.toEqual(row);
  expect(calls[0]).toEqual(["from", NOTIFICATION_ENGINE_TABLES.businessEvents]);
  expect(calls[1][2]).toEqual({
    onConflict: "event_type,subject_type,subject_id,occurrence_id",
  });
});

test("Phase 2A does not connect current runtime workflows to the new repository", async () => {
  const runtimeSources = await Promise.all(
    [
      "../src/lib/ordersStore.js",
      "../src/lib/paymentsStore.js",
      "../src/lib/notificationDeliveryService.js",
      "../src/lib/staffNotificationsStore.js",
      "../netlify/functions/customer-notification.js",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8"))
  );

  runtimeSources.forEach((source) => {
    expect(source).not.toContain("notificationEngineRepository");
    expect(source).not.toContain("notification_business_events");
    expect(source).not.toContain("notification_deliveries");
  });
});
