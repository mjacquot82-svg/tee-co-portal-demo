import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  buildNotificationBusinessEvent,
  buildNotificationBusinessEventRow,
} from "../src/lib/notificationBusinessEvents.js";
import {
  isNotificationEnginePhase2BShadowEnabled,
  observeLegacyNotificationEvent,
} from "../src/lib/notificationEnginePhase2B.js";
import {
  evaluateNotificationPolicy,
  snapshotNotificationPolicy,
} from "../src/lib/notificationPolicyService.js";
import {
  NOTIFICATION_POLICY_DELIVERY_MODES,
  NOTIFICATION_STATUSES,
} from "../src/lib/notificationEngineFoundation.js";

function createFoundationClient({ policy = null } = {}) {
  const tables = new Map();
  const calls = [];

  function upsert(table, row) {
    const rows = tables.get(table) || [];
    const existingIndex = rows.findIndex((entry) => entry.id === row.id);
    if (existingIndex >= 0) rows[existingIndex] = { ...rows[existingIndex], ...row };
    else rows.push({ ...row });
    tables.set(table, rows);
    return row;
  }

  if (policy) tables.set("notification_policies", [{ ...policy }]);

  const client = {
    from(table) {
      calls.push(["from", table]);
      return {
        upsert(row, options) {
          calls.push(["upsert", table, row, options]);
          const persisted = upsert(table, row);
          return {
            select() {
              return {
                async single() {
                  return { data: persisted, error: null };
                },
              };
            },
          };
        },
        select() {
          let rows = [...(tables.get(table) || [])];
          const chain = {
            eq(column, value) {
              rows = rows.filter((row) => row[column] === value);
              return chain;
            },
            is(column, value) {
              rows = rows.filter((row) => (row[column] ?? null) === value);
              return chain;
            },
            lte(column, value) {
              rows = rows.filter((row) => !row[column] || row[column] <= value);
              return chain;
            },
            order() {
              rows.sort((left, right) => Number(right.version) - Number(left.version));
              return chain;
            },
            limit(size) {
              rows = rows.slice(0, size);
              return chain;
            },
            async maybeSingle() {
              return { data: rows[0] || null, error: null };
            },
          };
          return chain;
        },
      };
    },
  };

  return { client, tables, calls };
}

const legacyTemplate = {
  type: "quote_approved",
  templateName: "Order Approved",
  emailSubject: "Your order has been approved",
  emailBody: "Order {{order_number}} approved.",
  smsMessage: "Order {{order_number}} approved.",
  emailEnabled: true,
  smsEnabled: false,
  staffNotificationEnabled: true,
};

test("Phase 2A remains complete and frozen for Phase 2B", async () => {
  const phase2AMigration = await readFile(
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
    expect(phase2AMigration).toContain(`create table if not exists public.${table}`);
  });
});

test("canonical order event envelope uses stable transition metadata", () => {
  const event = buildNotificationBusinessEvent("quote_approved", {
    orderNumber: "TC-2201",
    source: "orders_store",
    businessEvent: {
      subjectType: "order",
      subjectId: "order-2201",
      occurrenceId: "quote_approved:2026-07-25T10:00:00.000Z",
      correlationId: "order:TC-2201",
      occurredAt: "2026-07-25T10:00:00.000Z",
      payload: { approvalStatus: "Approved" },
    },
  });

  expect(event).toMatchObject({
    eventType: "quote_approved",
    subjectType: "order",
    subjectId: "order-2201",
    occurrenceId: "quote_approved:2026-07-25T10:00:00.000Z",
    correlationId: "order:TC-2201",
    occurredAt: "2026-07-25T10:00:00.000Z",
  });
  expect(buildNotificationBusinessEventRow("quote_approved", {
    businessEvent: event,
  })).toMatchObject({
    event_type: "quote_approved",
    subject_type: "order",
    subject_id: "order-2201",
    occurrence_id: "quote_approved:2026-07-25T10:00:00.000Z",
  });
});

test("policy evaluation records automatic, disabled, no-channel, and future approval decisions", () => {
  expect(evaluateNotificationPolicy({
    enabled: true,
    delivery_mode: "automatic",
    email_enabled: true,
  })).toEqual({
    deliveryMode: "automatic",
    status: NOTIFICATION_STATUSES.evaluated,
    noDeliveryReason: "",
  });
  expect(evaluateNotificationPolicy({
    enabled: false,
    delivery_mode: "automatic",
  })).toMatchObject({
    status: NOTIFICATION_STATUSES.noDelivery,
    noDeliveryReason: "policy_disabled",
  });
  expect(evaluateNotificationPolicy({
    enabled: true,
    delivery_mode: "automatic",
  })).toMatchObject({
    status: NOTIFICATION_STATUSES.noDelivery,
    noDeliveryReason: "no_channels_enabled",
  });
  expect(evaluateNotificationPolicy({
    enabled: true,
    delivery_mode: NOTIFICATION_POLICY_DELIVERY_MODES.approvalRequired,
  })).toMatchObject({
    status: NOTIFICATION_STATUSES.pendingApproval,
  });
});

test("Phase 2B shadow is disabled by default and creates no records", async () => {
  const { client, calls } = createFoundationClient();
  expect(isNotificationEnginePhase2BShadowEnabled({})).toBe(false);
  await expect(observeLegacyNotificationEvent({
    eventType: "quote_approved",
    context: {},
    legacyTemplate,
    client,
  })).resolves.toEqual({
    observed: false,
    reason: "shadow_disabled",
  });
  expect(calls).toHaveLength(0);
});

test("enabled observation accepts event, snapshots policy, and creates no deliveries", async () => {
  const { client, tables } = createFoundationClient();
  const result = await observeLegacyNotificationEvent({
    eventType: "quote_approved",
    context: {
      phase2BShadowEnabled: true,
      orderNumber: "TC-2202",
      businessEvent: {
        subjectType: "order",
        subjectId: "order-2202",
        occurrenceId: "approval-transition-2202",
        correlationId: "order:TC-2202",
        occurredAt: "2026-07-25T11:00:00.000Z",
      },
    },
    legacyTemplate,
    client,
  });

  expect(result).toMatchObject({
    observed: true,
    deliveriesCreated: 0,
    decision: {
      deliveryMode: "automatic",
      status: "evaluated",
    },
  });
  expect(tables.get("notification_business_events")).toHaveLength(1);
  expect(tables.get("notification_policies")).toHaveLength(1);
  expect(tables.get("notifications")).toHaveLength(1);
  expect(tables.get("notification_deliveries") || []).toHaveLength(0);
  expect(result.notification.engine_metadata).toEqual({
    observationOnly: true,
    legacyRuntimeAuthoritative: true,
    deliveriesDeferredUntilPhase2C: true,
  });
  expect(snapshotNotificationPolicy(result.policy)).toMatchObject({
    event_type: "quote_approved",
    version: 1,
    email_enabled: true,
  });
});

test("repeated observation is idempotent at event and notification levels", async () => {
  const { client, tables } = createFoundationClient();
  const input = {
    eventType: "quote_approved",
    context: {
      phase2BShadowEnabled: true,
      businessEvent: {
        subjectType: "order",
        subjectId: "order-2203",
        occurrenceId: "approval-transition-2203",
        occurredAt: "2026-07-25T12:00:00.000Z",
      },
    },
    legacyTemplate,
    client,
  };

  const first = await observeLegacyNotificationEvent(input);
  const second = await observeLegacyNotificationEvent(input);

  expect(second.businessEvent.id).toBe(first.businessEvent.id);
  expect(second.notification.id).toBe(first.notification.id);
  expect(tables.get("notification_business_events")).toHaveLength(1);
  expect(tables.get("notifications")).toHaveLength(1);
});

test("Phase 2B does not implement template resolution, deliveries, dispatch, or providers", async () => {
  const phase2BSource = await readFile(
    new URL("../src/lib/notificationEnginePhase2B.js", import.meta.url),
    "utf8"
  );
  expect(phase2BSource).not.toContain("persistNotificationDelivery(");
  expect(phase2BSource).not.toContain("renderNotificationTemplatePreview");
  expect(phase2BSource).not.toContain("fetch(");
  expect(phase2BSource).not.toContain("Resend");
  expect(phase2BSource).not.toContain("Twilio");
});

test("current workflow hooks provide stable occurrence metadata without changing event names", async () => {
  const [ordersSource, paymentsSource, squareSource] = await Promise.all(
    [
      "../src/lib/ordersStore.js",
      "../src/lib/paymentsStore.js",
      "../src/services/squareWebhookProcessor.js",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8"))
  );

  expect(ordersSource).toContain("buildOrderNotificationContext(eventType, order");
  expect(ordersSource).toContain("occurrenceId: `${eventType}:${occurredAt");
  expect(ordersSource).toContain(
    "triggerOrderNotification(NOTIFICATION_TYPES.quoteApproved, updatedOrder)"
  );

  expect(paymentsSource).toContain(
    "occurrenceId: `payment_request_created:${paymentRequest.id}`"
  );
  expect(paymentsSource).toContain(
    "occurrenceId: `deposit_requested:${paymentRequest.id}`"
  );
  expect(paymentsSource).toContain("payment.idempotency_key || payment.provider_payment_id");

  expect(squareSource).toContain(
    "occurrenceId: squareEventId || `${squareEventType}:${paymentId}:${eventTimestamp}`"
  );
  expect(squareSource).toContain(
    "adapter.triggerNotificationEvent(NOTIFICATION_TYPES.paymentFailed"
  );
});

test("legacy duplicate evaluation can still fill a missing Phase 2B shadow record", async () => {
  const deliverySource = await readFile(
    new URL("../src/lib/notificationDeliveryService.js", import.meta.url),
    "utf8"
  );
  const duplicateBranch = deliverySource.slice(
    deliverySource.indexOf("if (existingRecords.length)"),
    deliverySource.indexOf("const renderedContent")
  );

  expect(duplicateBranch).toContain(
    "queuePhase2BObservation(eventType, context, template)"
  );
  expect(duplicateBranch).toContain("return existingRecords");
});
