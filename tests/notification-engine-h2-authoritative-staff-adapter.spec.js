import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  runStaffInternalAdapterAuthoritative,
  runStaffInternalAdapterObservation,
} from "../src/lib/staffInternalNotificationAdapter.js";
import {
  clearStaffNotificationsForTests,
  getUnreadStaffNotificationCount,
  listStaffNotifications,
  markStaffNotificationRead,
} from "../src/lib/staffNotificationsStore.js";
import { NOTIFICATION_DISPATCHER_RPCS } from "../src/lib/notificationDispatcherRepository.js";
import { processNotificationEventThroughEngine } from "../src/lib/notificationEngineCutover.js";

function authoritativeEnvelope() {
  return {
    delivery: {
      id: "delivery:authoritative-staff-1",
      notification_id: "notification:authoritative-1",
      channel: "staff",
      status: "queued",
      attempt_count: 0,
      claim_token: "",
      recipient_snapshot: {
        id: "staff-1",
        name: "Nina Staff",
        audience: "staff",
      },
      destination_snapshot: {
        staffUserId: "staff-1",
        observationOnly: false,
      },
    },
    notification: {
      id: "notification:authoritative-1",
      business_event_id: "event:authoritative-1",
      event_type: "quote_approved",
      subject_type: "order",
      subject_id: "TC-9001",
      status: "queued",
      engine_metadata: { observationOnly: false },
    },
    business_event: {
      id: "event:authoritative-1",
      subject_type: "order",
      subject_id: "TC-9001",
      payload: {
        legacyNotificationContext: { orderNumber: "TC-9001" },
      },
    },
  };
}

function clientsFor(envelope) {
  const inbox = [];
  const attempts = [];
  let aggregateStatus = "queued";
  return {
    inbox,
    attempts,
    get aggregateStatus() {
      return aggregateStatus;
    },
    staffInboxClient: {
      from(table) {
        expect(table).toBe("staff_notifications");
        return {
          async upsert(row) {
            const existing = inbox.findIndex(({ id }) => id === row.id);
            if (existing >= 0) inbox[existing] = { ...inbox[existing], ...row };
            else inbox.push(row);
            return { error: null };
          },
        };
      },
    },
    dispatcherClient: {
      async rpc(name, parameters) {
        const delivery = envelope.delivery;
        if (name === NOTIFICATION_DISPATCHER_RPCS.claimStaffAuthoritative) {
          if (
            parameters.p_delivery_id !== delivery.id ||
            delivery.status !== "queued"
          ) {
            return { data: [], error: null };
          }
          delivery.status = "processing";
          delivery.claim_token = "staff-authoritative:worker:claim";
          delivery.claimed_at = "2026-07-25T12:00:00.000Z";
          delivery.claim_expires_at = "2026-07-25T12:01:00.000Z";
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
        if (name === NOTIFICATION_DISPATCHER_RPCS.completeStaffAuthoritative) {
          if (
            delivery.status !== "processing" ||
            delivery.claim_token !== parameters.p_claim_token
          ) {
            return { data: null, error: new Error("Invalid claim.") };
          }
          attempts.push({
            id: parameters.p_attempt_id,
            deliveryId: delivery.id,
            attemptNumber: parameters.p_attempt_number,
          });
          Object.assign(delivery, {
            status: "sent",
            provider_key: "staff_internal",
            provider_message_id: parameters.p_staff_notification_id,
            attempt_count: parameters.p_attempt_number,
            claim_token: "",
          });
          aggregateStatus = "completed";
          envelope.notification.status = aggregateStatus;
          return { data: { ...delivery }, error: null };
        }
        return { data: null, error: new Error(`Unexpected RPC ${name}`) };
      },
    },
  };
}

test.beforeEach(() => clearStaffNotificationsForTests());
test.afterEach(() => clearStaffNotificationsForTests());

test("authoritative Staff Delivery creates one inbox item and completes aggregate state", async () => {
  const envelope = authoritativeEnvelope();
  const clients = clientsFor(envelope);
  const result = await runStaffInternalAdapterAuthoritative({
    deliveryId: envelope.delivery.id,
    workerId: "authoritative-worker",
    dispatcherClient: clients.dispatcherClient,
    staffInboxClient: clients.staffInboxClient,
    now: () => new Date("2026-07-25T12:00:30.000Z"),
  });

  expect(result).toMatchObject({ authoritative: true, claimed: true });
  expect(envelope.delivery).toMatchObject({
    status: "sent",
    provider_key: "staff_internal",
    attempt_count: 1,
  });
  expect(clients.attempts).toEqual([
    {
      id: `attempt:${envelope.delivery.id}:1`,
      deliveryId: envelope.delivery.id,
      attemptNumber: 1,
    },
  ]);
  expect(clients.inbox).toHaveLength(1);
  expect(clients.inbox[0]).toMatchObject({
    id: `staff-notif:${envelope.delivery.id}`,
    read: false,
    delivery_id: envelope.delivery.id,
    delivery_attempt_id: `attempt:${envelope.delivery.id}:1`,
  });
  expect(clients.aggregateStatus).toBe("completed");
  expect(getUnreadStaffNotificationCount()).toBe(1);
  const [record] = listStaffNotifications();
  expect(record.linkTo).toBe("/admin/orders/TC-9001");
  markStaffNotificationRead(record.id);
  expect(getUnreadStaffNotificationCount()).toBe(0);
});

test("authoritative replay cannot duplicate inbox or Attempt identities", async () => {
  const envelope = authoritativeEnvelope();
  const clients = clientsFor(envelope);
  const input = {
    deliveryId: envelope.delivery.id,
    workerId: "authoritative-worker",
    dispatcherClient: clients.dispatcherClient,
    staffInboxClient: clients.staffInboxClient,
    now: () => new Date("2026-07-25T12:00:30.000Z"),
  };
  const first = await runStaffInternalAdapterAuthoritative(input);
  const replay = await runStaffInternalAdapterAuthoritative(input);
  expect(first.claimed).toBe(true);
  expect(replay.claimed).toBe(false);
  expect(clients.inbox).toHaveLength(1);
  expect(clients.attempts).toHaveLength(1);
  expect(listStaffNotifications()).toHaveLength(1);
});

test("observation-only Staff adapter behavior remains unchanged", async () => {
  const source = await readFile(
    "src/lib/staffInternalNotificationAdapter.js",
    "utf8"
  );
  expect(source).toContain("runStaffInternalAdapterObservation");
  expect(source).toContain("claimStaffObservationDeliveries");
  expect(source).toContain("completeStaffObservationDelivery");
  expect(source).toContain("observationOnly: true");
  expect(typeof runStaffInternalAdapterObservation).toBe("function");
});

test("authoritative cutover routes Staff separately without changing email routing", async () => {
  const source = await readFile("src/lib/notificationEngineCutover.js", "utf8");
  expect(source).toContain(
    '"/.netlify/functions/staff-notification-delivery"'
  );
  expect(source).toContain('"/.netlify/functions/customer-notification"');
  expect(source).toContain('["email", "staff"]');
  expect(processNotificationEventThroughEngine).toBeTruthy();
});

test("H2 migration is authoritative, atomic, aggregate-aware, and service-only", async () => {
  const sql = await readFile(
    "supabase/notification-engine-h2-authoritative-staff-adapter.sql",
    "utf8"
  );
  expect(sql).toContain("d.channel = 'staff'");
  expect(sql).toContain("n.event_type = 'quote_approved'");
  expect(sql).toContain("for update of d skip locked");
  expect(sql).toContain("'observationOnly', false");
  expect(sql).toContain("refresh_notification_aggregate_status");
  expect(sql).toContain("from public, anon, authenticated");
  expect(sql).toContain("to service_role");
  expect(sql.toLowerCase()).not.toContain("twilio");
  expect(sql).not.toContain("retry_scheduled");
});
