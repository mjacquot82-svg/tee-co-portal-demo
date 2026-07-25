import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  buildStaffInboxAdapterRequest,
  runStaffInternalAdapterObservation,
} from "../src/lib/staffInternalNotificationAdapter.js";
import {
  clearStaffNotificationsForTests,
  getUnreadStaffNotificationCount,
  listStaffNotifications,
  markStaffNotificationRead,
} from "../src/lib/staffNotificationsStore.js";
import {
  NOTIFICATION_DISPATCHER_RPCS,
} from "../src/lib/notificationDispatcherRepository.js";

function staffEnvelope(overrides = {}) {
  const delivery = {
    id: "delivery:notification-1:staff:staff:staff-1:staff-inbox:v1",
    notification_id: "notification-1",
    channel: "staff",
    recipient_snapshot: {
      id: "staff-1",
      name: "Nina Staff",
      audience: "staff",
    },
    destination_snapshot: {
      observationOnly: true,
      staffUserId: "staff-1",
    },
    status: "processing",
    attempt_count: 0,
    claim_token: "staff-observation:worker:claim",
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
      subject_type: "order",
      subject_id: "order-1",
      engine_metadata: { observationOnly: true },
      ...overrides.notification,
    },
    business_event: {
      id: "event-1",
      subject_type: "order",
      subject_id: "order-1",
      payload: {
        legacyNotificationContext: {
          orderNumber: "TC-5001",
        },
      },
      ...overrides.businessEvent,
    },
  };
}

function createAdapterClients(envelopes = [staffEnvelope()]) {
  const inboxRows = [];
  const attempts = [];
  const deliveries = envelopes.map((envelope) => envelope.delivery);
  const rpcCalls = [];
  return {
    inboxRows,
    attempts,
    deliveries,
    rpcCalls,
    staffInboxClient: {
      from(table) {
        expect(table).toBe("staff_notifications");
        return {
          async upsert(row) {
            const index = inboxRows.findIndex((existing) => existing.id === row.id);
            if (index >= 0) inboxRows[index] = { ...inboxRows[index], ...row };
            else inboxRows.push({ ...row });
            return { error: null };
          },
        };
      },
    },
    dispatcherClient: {
      async rpc(name, parameters) {
        rpcCalls.push({ name, parameters });
        if (name === NOTIFICATION_DISPATCHER_RPCS.recoverAbandoned) {
          return { data: [], error: null };
        }
        if (name === NOTIFICATION_DISPATCHER_RPCS.claimStaffObservation) {
          return {
            data: envelopes.slice(0, parameters.p_limit),
            error: null,
          };
        }
        if (name === NOTIFICATION_DISPATCHER_RPCS.completeStaffObservation) {
          const delivery = deliveries.find(
            (candidate) => candidate.id === parameters.p_delivery_id
          );
          const existing = attempts.find(
            (attempt) => attempt.id === parameters.p_attempt_id
          );
          if (!existing) {
            attempts.push({
              id: parameters.p_attempt_id,
              delivery_id: parameters.p_delivery_id,
              staff_notification_id: parameters.p_staff_notification_id,
            });
          }
          Object.assign(delivery, {
            status: "sent",
            provider_key: "staff_internal",
            provider_message_id: parameters.p_staff_notification_id,
            attempt_count: parameters.p_attempt_number,
            claim_token: "",
          });
          return { data: { ...delivery }, error: null };
        }
        return { data: null, error: new Error(`Unexpected RPC ${name}`) };
      },
    },
  };
}

test.beforeEach(() => {
  clearStaffNotificationsForTests();
});

test.afterEach(() => {
  clearStaffNotificationsForTests();
});

test("Staff adapter maps a claimed shadow Delivery to the existing inbox presentation model", () => {
  const envelope = staffEnvelope();
  const request = buildStaffInboxAdapterRequest({
    delivery: envelope.delivery,
    notification: envelope.notification,
    businessEvent: envelope.business_event,
  });

  expect(request).toMatchObject({
    id: `staff-notif:${envelope.delivery.id}`,
    type: "ready_for_production",
    orderNumber: "TC-5001",
    assignedToStaffId: "staff-1",
    assignedToStaffName: "Nina Staff",
    linkTo: "/admin/orders/TC-5001",
    businessEventId: "event-1",
    notificationId: "notification-1",
    deliveryId: envelope.delivery.id,
    deliveryAttemptId: `attempt:${envelope.delivery.id}:1`,
  });
});

test("Staff adapter creates one linked unread inbox record and completes the Delivery", async () => {
  const clients = createAdapterClients();
  const result = await runStaffInternalAdapterObservation({
    workerId: "staff-worker-1",
    dispatcherClient: clients.dispatcherClient,
    staffInboxClient: clients.staffInboxClient,
    now: () => new Date("2026-07-25T12:00:30.000Z"),
  });

  expect(result).toMatchObject({
    observationOnly: true,
    claimedCount: 1,
    completedCount: 1,
  });
  expect(clients.inboxRows).toHaveLength(1);
  expect(clients.inboxRows[0]).toMatchObject({
    read: false,
    business_event_id: "event-1",
    notification_id: "notification-1",
    delivery_id: clients.deliveries[0].id,
    delivery_attempt_id: `attempt:${clients.deliveries[0].id}:1`,
  });
  expect(clients.attempts).toHaveLength(1);
  expect(clients.deliveries[0]).toMatchObject({
    status: "sent",
    provider_key: "staff_internal",
    attempt_count: 1,
  });
});

test("deterministic adapter replay does not duplicate Staff Inbox records or attempts", async () => {
  const envelope = staffEnvelope();
  const clients = createAdapterClients([envelope]);
  const input = {
    workerId: "staff-worker-2",
    dispatcherClient: clients.dispatcherClient,
    staffInboxClient: clients.staffInboxClient,
    now: () => new Date("2026-07-25T12:00:30.000Z"),
  };

  await runStaffInternalAdapterObservation(input);
  envelope.delivery.status = "processing";
  envelope.delivery.claim_token = "staff-observation:worker:replay";
  envelope.delivery.attempt_count = 0;
  await runStaffInternalAdapterObservation(input);

  expect(clients.inboxRows).toHaveLength(1);
  expect(clients.attempts).toHaveLength(1);
  expect(listStaffNotifications()).toHaveLength(1);
});

test("adapter-created records preserve unread count and read behavior", async () => {
  const clients = createAdapterClients();
  await runStaffInternalAdapterObservation({
    workerId: "staff-worker-3",
    dispatcherClient: clients.dispatcherClient,
    staffInboxClient: clients.staffInboxClient,
    now: () => new Date("2026-07-25T12:00:30.000Z"),
  });

  const [record] = listStaffNotifications();
  expect(getUnreadStaffNotificationCount()).toBe(1);
  expect(record.linkTo).toBe("/admin/orders/TC-5001");
  expect(markStaffNotificationRead(record.id)).toBe(true);
  expect(getUnreadStaffNotificationCount()).toBe(0);
});

test("staff claim migration is channel-specific, atomic, linked, and service-role only", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/notification-engine-phase2e-staff-adapter.sql",
      import.meta.url
    ),
    "utf8"
  );

  expect(migration).toContain("d.channel = 'staff'");
  expect(migration).toContain("for update of d skip locked");
  expect(migration).toContain("business_event_id");
  expect(migration).toContain("notification_id");
  expect(migration).toContain("delivery_id");
  expect(migration).toContain("delivery_attempt_id");
  expect(migration).toContain("notification_delivery_attempts");
  expect(migration).toContain("'staff_internal'");
  expect(migration).toContain("to service_role");
});

test("Staff Internal Adapter introduces no Resend, Twilio, external provider, retry, or production activation", async () => {
  const combined = await readFile(
    new URL("../src/lib/staffInternalNotificationAdapter.js", import.meta.url),
    "utf8"
  );

  expect(combined).not.toContain("fetch(");
  expect(combined).not.toContain("Resend");
  expect(combined).not.toContain("Twilio");
  expect(combined).not.toContain("retry_scheduled");
  expect(combined).not.toContain("notificationDeliveryService");
});
