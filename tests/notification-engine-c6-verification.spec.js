import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { verifyNotificationEngineParity } from "../src/lib/notificationCutoverVerification.js";

function expectation(overrides = {}) {
  return {
    id: "expectation-1",
    event_type: "deposit_requested",
    subject_type: "payment_request",
    subject_id: "request-1",
    occurrence_id: "deposit_requested:request-1",
    source_table: "payment_events",
    source_record_id: "payment-event-1",
    expected_branches: [
      {
        channel: "email",
        recipient_type: "customer",
        recipient_key: "customer-1",
        destination_key: "customer@example.com",
      },
    ],
    ...overrides,
  };
}

function businessEvent(overrides = {}) {
  return {
    id: "event-1",
    event_type: "deposit_requested",
    subject_type: "payment_request",
    subject_id: "request-1",
    occurrence_id: "deposit_requested:request-1",
    ...overrides,
  };
}

function notification(overrides = {}) {
  return {
    id: "notification-1",
    business_event_id: "event-1",
    policy_id: "policy-1",
    policy_version: 1,
    policy_snapshot: {
      email_enabled: true,
      sms_enabled: false,
      staff_notification_enabled: false,
    },
    status: "queued",
    ...overrides,
  };
}

function delivery(overrides = {}) {
  return {
    id: "delivery-1",
    notification_id: "notification-1",
    channel: "email",
    recipient_type: "customer",
    recipient_key: "customer-1",
    destination_key: "customer@example.com",
    status: "queued",
    ...overrides,
  };
}

function verify({
  expectedOccurrences = [expectation()],
  businessEvents = [businessEvent()],
  notifications = [notification()],
  deliveries = [delivery()],
} = {}) {
  return verifyNotificationEngineParity({
    expectedOccurrences,
    businessEvents,
    notifications,
    deliveries,
  });
}

test("C6 detects an expected workflow occurrence with no Business Event", () => {
  const result = verify({
    businessEvents: [],
    notifications: [],
    deliveries: [],
  });

  expect(result.passed).toBe(false);
  expect(result.failures).toContainEqual(
    expect.objectContaining({
      code: "business_event_cardinality",
      expected: 1,
      actual: 0,
    })
  );
  expect(result.failures).toContainEqual(
    expect.objectContaining({
      code: "notification_cardinality",
      expected: 1,
      actual: 0,
    })
  );
});

test("C6 detects a Business Event with no Notification", () => {
  const result = verify({ notifications: [], deliveries: [] });

  expect(result.failures).toContainEqual(
    expect.objectContaining({
      code: "notification_cardinality",
      expected: 1,
      actual: 0,
    })
  );
});

test("C6 detects duplicate Notifications for one expected occurrence", () => {
  const result = verify({
    notifications: [
      notification(),
      notification({ id: "notification-2" }),
    ],
    deliveries: [],
  });

  expect(result.failures).toContainEqual(
    expect.objectContaining({
      code: "notification_cardinality",
      expected: 1,
      actual: 2,
    })
  );
});

test("C6 detects a missing expected recipient Delivery", () => {
  const result = verify({ deliveries: [] });

  expect(result.failures).toContainEqual(
    expect.objectContaining({
      code: "missing_delivery_branch",
      branch: "email:customer:customer-1:customer@example.com",
      expected: 1,
      actual: 0,
    })
  );
});

test("C6 detects duplicate recipient and channel Delivery branches", () => {
  const result = verify({
    deliveries: [
      delivery(),
      delivery({ id: "delivery-2", template_version_id: "deposit_requested:v2" }),
    ],
  });

  expect(result.failures).toContainEqual(
    expect.objectContaining({
      code: "duplicate_delivery_identity",
      branch: "email:customer:customer-1:customer@example.com",
      count: 2,
    })
  );
});

test("C6 detects unexpected Deliveries on disabled channels", () => {
  const result = verify({
    expectedOccurrences: [expectation({ expected_branches: [] })],
    notifications: [
      notification({
        policy_snapshot: {
          email_enabled: false,
          sms_enabled: false,
          staff_notification_enabled: false,
        },
      }),
    ],
  });

  expect(result.failures.map((failure) => failure.code)).toEqual(
    expect.arrayContaining([
      "unexpected_delivery_branch",
      "disabled_channel_delivery",
    ])
  );
});

test("C6 proves correct multi-recipient and multi-channel cardinality", () => {
  const expectedBranches = [
    {
      channel: "email",
      recipient_type: "customer",
      recipient_key: "customer-1",
      destination_key: "customer@example.com",
    },
    {
      channel: "staff",
      recipient_type: "staff",
      recipient_key: "staff-1",
      destination_key: "staff-inbox:staff-1",
    },
    {
      channel: "staff",
      recipient_type: "owner",
      recipient_key: "owner-1",
      destination_key: "staff-inbox:owner-1",
    },
  ];
  const result = verify({
    expectedOccurrences: [expectation({ expected_branches: expectedBranches })],
    notifications: [
      notification({
        policy_snapshot: {
          email_enabled: true,
          sms_enabled: false,
          staff_notification_enabled: true,
        },
      }),
    ],
    deliveries: [
      delivery(),
      delivery({
        id: "delivery-staff",
        channel: "staff",
        recipient_type: "staff",
        recipient_key: "staff-1",
        destination_key: "staff-inbox:staff-1",
      }),
      delivery({
        id: "delivery-owner",
        channel: "staff",
        recipient_type: "owner",
        recipient_key: "owner-1",
        destination_key: "staff-inbox:owner-1",
      }),
    ],
  });

  expect(result).toMatchObject({
    passed: true,
    failures: [],
    expectedOccurrenceCount: 1,
    businessEventCount: 1,
    notificationCount: 1,
    deliveryCount: 3,
  });
});

test("C6 fully matching evidence passes every parity gate", () => {
  expect(verify()).toMatchObject({ passed: true, failures: [] });
});

test("C6 SQL evidence begins with expectations and preserves absent-row and aggregate gates", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/notification-engine-c6-verification-evidence.sql",
      import.meta.url
    ),
    "utf8"
  );

  [
    "notification_verification_expectations",
    "record_notification_verification_expectation",
    "notification_engine_parity_verification",
    "left join public.notification_business_events",
    "left join public.notifications",
    "missing_delivery_count",
    "unexpected_delivery_count",
    "duplicate_delivery_count",
    "disabled_channel_delivery_count",
    "exactly_one_business_event",
    "exactly_one_notification",
    "delivery_branches_match",
    "aggregate_matches",
    "parity_passed",
  ].forEach((term) => expect(migration).toContain(term));
  expect(migration).toContain("to service_role");
  expect(migration).not.toContain("Resend");
  expect(migration).not.toContain("Twilio");
});
