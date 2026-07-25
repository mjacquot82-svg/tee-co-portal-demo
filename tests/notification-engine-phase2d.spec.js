import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  aggregateNotificationState,
  createShadowNotificationDeliveriesPhase2D,
} from "../src/lib/notificationEnginePhase2D.js";
import { resolveCanonicalNotificationRecipients } from "../src/lib/notificationRecipientResolution.js";

function createPhase2DClient() {
  const tables = new Map([
    ["notification_deliveries", []],
    ["notifications", []],
  ]);
  const client = {
    from(table) {
      return {
        upsert(row) {
          const rows = tables.get(table) || [];
          const index = rows.findIndex((entry) => entry.id === row.id);
          if (index >= 0) rows[index] = { ...rows[index], ...row };
          else rows.push({ ...row });
          tables.set(table, rows);
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
  return { client, tables };
}

function phase2BResult(policyOverrides = {}) {
  const policy = {
    id: "policy:deposit_requested:v1",
    event_type: "deposit_requested",
    version: 1,
    enabled: true,
    delivery_mode: "automatic",
    email_enabled: true,
    sms_enabled: true,
    staff_notification_enabled: true,
    customer_audience_enabled: true,
    staff_audience_enabled: true,
    owner_audience_enabled: true,
    ...policyOverrides,
  };
  return {
    observed: true,
    policy,
    notification: {
      id: "notification-deposit-1",
      business_event_id: "event-deposit-1",
      event_type: "deposit_requested",
      subject_type: "payment_request",
      subject_id: "request-1",
      policy_id: policy.id,
      policy_version: 1,
      policy_snapshot: policy,
      delivery_mode: "automatic",
      status: "evaluated",
      no_delivery_reason: "",
      engine_metadata: {
        observationOnly: true,
        legacyRuntimeAuthoritative: true,
      },
    },
  };
}

function phase2CResult(snapshotOverrides = {}) {
  return {
    prepared: true,
    notification: phase2BResult().notification,
    templateSnapshots: {
      email: {
        templateType: "deposit_requested",
        templateVersionId: "deposit_requested:v1",
        templateVersion: 1,
        content: {
          subject: "Deposit required",
          body: "Please pay your deposit.",
        },
      },
      sms: {
        templateType: "deposit_requested",
        templateVersionId: "deposit_requested:v1",
        templateVersion: 1,
        content: { body: "Deposit required." },
      },
      staff: {
        templateType: "deposit_requested",
        templateVersionId: "deposit_requested:v1",
        templateVersion: 1,
        content: {},
      },
      ...snapshotOverrides,
    },
  };
}

const customers = [
  {
    id: "customer-1",
    name: "Taylor Chen",
    email: "taylor@example.com",
    phone: "+1 (555) 010-2000",
    archived: false,
  },
];

const staffUsers = [
  {
    id: "staff-1",
    name: "Nina Staff",
    role: "Staff",
    status: "Active",
  },
  {
    id: "owner-1",
    name: "Teresa Owner",
    role: "Owner",
    status: "Active",
  },
];

test("canonical recipient resolution returns channel-specific customer, staff, and owner collections", async () => {
  const collections = await resolveCanonicalNotificationRecipients({
    policy: phase2BResult().policy,
    templateSnapshots: phase2CResult().templateSnapshots,
    context: {
      customer: customers[0],
      order: {
        order_number: "TC-4001",
        customer_id: "customer-1",
        assigned_to_staff_id: "staff-1",
      },
    },
    customers,
    staffUsers,
  });

  expect(collections.email).toHaveLength(1);
  expect(collections.email[0]).toMatchObject({
    audience: "customer",
    recipientType: "customer",
    recipientKey: "customer-1",
    destinationKey: "taylor@example.com",
    deliverable: true,
  });
  expect(collections.sms[0]).toMatchObject({
    recipientKey: "customer-1",
    destinationKey: "15550102000",
    deliverable: true,
  });
  expect(collections.staff).toHaveLength(2);
  expect(collections.staff.map((recipient) => recipient.recipientType)).toEqual([
    "staff",
    "owner",
  ]);
  expect(collections.staff.map((recipient) => recipient.destinationKey)).toEqual([
    "staff-inbox:staff-1",
    "staff-inbox:owner-1",
  ]);
});

test("recipient snapshots omit staff credentials and mark inactive or archived records suppressed", async () => {
  const collections = await resolveCanonicalNotificationRecipients({
    policy: phase2BResult().policy,
    templateSnapshots: phase2CResult().templateSnapshots,
    context: {
      customer: { ...customers[0], archived: true },
      order: { assigned_to_staff_id: "staff-1" },
    },
    customers: [{ ...customers[0], archived: true }],
    staffUsers: [
      { ...staffUsers[0], status: "Inactive", pin: "1234" },
      staffUsers[1],
    ],
  });

  expect(collections.email[0].suppressedReason).toBe("customer_archived");
  expect(collections.staff[0].suppressedReason).toBe("staff_inactive");
  expect(collections.staff[0].snapshot).not.toHaveProperty("pin");
});

test("missing channel destinations produce not-deliverable shadow records", async () => {
  const { client } = createPhase2DClient();
  const result = await createShadowNotificationDeliveriesPhase2D({
    phase2BResult: phase2BResult({
      staff_notification_enabled: false,
      staff_audience_enabled: false,
      owner_audience_enabled: false,
    }),
    phase2CResult: phase2CResult({ staff: undefined }),
    context: {
      customer: {
        id: "customer-2",
        name: "No Contact Customer",
        email: "",
        phone: "",
      },
    },
    customers: [],
    staffUsers: [],
    client,
  });

  expect(result.deliveries).toHaveLength(2);
  expect(result.deliveries.map((delivery) => delivery.status)).toEqual([
    "not_deliverable",
    "not_deliverable",
  ]);
  expect(result.deliveries.map((delivery) => delivery.last_failure_code)).toEqual([
    "missing_email",
    "missing_phone",
  ]);
  expect(result.notification.status).toBe("no_delivery");
});

test("Phase 2D creates durable observation-only Delivery snapshots and deterministic identities", async () => {
  const { client, tables } = createPhase2DClient();
  const input = {
    phase2BResult: phase2BResult(),
    phase2CResult: phase2CResult(),
    context: {
      customer: customers[0],
      order: {
        order_number: "TC-4002",
        customer_id: "customer-1",
        assigned_to_staff_id: "staff-1",
      },
    },
    customers,
    staffUsers,
    client,
  };

  const first = await createShadowNotificationDeliveriesPhase2D(input);
  const second = await createShadowNotificationDeliveriesPhase2D(input);

  expect(first.deliveries).toHaveLength(4);
  expect(second.deliveries.map((delivery) => delivery.id)).toEqual(
    first.deliveries.map((delivery) => delivery.id)
  );
  expect(tables.get("notification_deliveries")).toHaveLength(4);
  expect(first.deliveries[0]).toMatchObject({
    notification_id: "notification-deposit-1",
    recipient_snapshot: {
      id: "customer-1",
      audience: "customer",
    },
    destination_snapshot: {
      observationOnly: true,
    },
    template_version_id: "deposit_requested:v1",
    rendered_content: {
      subject: "Deposit required",
      body: "Please pay your deposit.",
    },
    status: "queued",
    attempt_count: 0,
  });
  expect(first.notification.engine_metadata.phase2D).toMatchObject({
    observationOnly: true,
    dispatcherEligible: false,
    deliveryCount: 4,
  });
});

test("aggregate Notification state reflects queued and terminal recipient outcomes", () => {
  expect(aggregateNotificationState([])).toEqual({
    status: "no_delivery",
    counts: {},
  });
  expect(
    aggregateNotificationState([
      { status: "not_deliverable" },
      { status: "suppressed" },
    ]).status
  ).toBe("no_delivery");
  expect(
    aggregateNotificationState([
      { status: "queued" },
      { status: "not_deliverable" },
    ]).status
  ).toBe("queued");
  expect(aggregateNotificationState([{ status: "queued" }]).status).toBe(
    "queued"
  );
});

test("failed Phase 2C preparation creates no Delivery records", async () => {
  const { client, tables } = createPhase2DClient();
  const result = await createShadowNotificationDeliveriesPhase2D({
    phase2BResult: phase2BResult(),
    phase2CResult: {
      prepared: false,
      reason: "resolution_failed",
      notification: phase2BResult().notification,
    },
    context: {},
    customers,
    staffUsers,
    client,
  });

  expect(result).toMatchObject({
    created: false,
    reason: "resolution_failed",
    deliveries: [],
  });
  expect(tables.get("notification_deliveries")).toHaveLength(0);
});

test("Phase 2D contains no dispatcher, attempt, retry, adapter, provider, or staff inbox behavior", async () => {
  const sources = await Promise.all(
    [
      "../src/lib/notificationEnginePhase2D.js",
      "../src/lib/notificationRecipientResolution.js",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8"))
  );
  const combined = sources.join("\n");

  expect(combined).not.toContain("persistNotificationDeliveryAttempt");
  expect(combined).not.toContain("createStaffNotification");
  expect(combined).not.toContain("staffNotificationsStore");
  expect(combined).not.toContain("fetch(");
  expect(combined).not.toContain("Resend");
  expect(combined).not.toContain("Twilio");
  expect(combined).not.toContain("retry_scheduled");
  expect(combined).not.toContain("providerMessageId");
});
