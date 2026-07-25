import { calculateNotificationAggregateState } from "./notificationDeliveryLifecycle";

function identity(parts) {
  return parts.map((part) => String(part ?? "").trim()).join(":");
}

function channelEnabled(policy = {}, channel) {
  if (channel === "staff") return Boolean(policy.staff_notification_enabled);
  return Boolean(policy[`${channel}_enabled`]);
}

function eventIdentity(event = {}) {
  return identity([
    event.event_type,
    event.subject_type,
    event.subject_id,
    event.occurrence_id,
  ]);
}

function branchIdentity(branch = {}) {
  return identity([
    branch.channel,
    branch.recipient_type ?? branch.recipientType,
    branch.recipient_key ?? branch.recipientKey,
    branch.destination_key ?? branch.destinationKey,
  ]);
}

function countByIdentity(items, identityBuilder) {
  const counts = new Map();
  for (const item of items) {
    const key = identityBuilder(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function verifyExpectedOccurrence({
  expectation,
  businessEvents,
  notifications,
  deliveries,
  failures,
}) {
  const key = eventIdentity(expectation);
  const matchingEvents = businessEvents.filter(
    (event) => eventIdentity(event) === key
  );
  if (matchingEvents.length !== 1) {
    failures.push({
      code: "business_event_cardinality",
      expectationId: expectation.id,
      key,
      expected: 1,
      actual: matchingEvents.length,
    });
  }

  const eventIds = new Set(matchingEvents.map((event) => event.id));
  const matchingNotifications = notifications.filter((notification) =>
    eventIds.has(notification.business_event_id)
  );
  if (matchingNotifications.length !== 1) {
    failures.push({
      code: "notification_cardinality",
      expectationId: expectation.id,
      expected: 1,
      actual: matchingNotifications.length,
    });
  }

  const notificationIds = new Set(
    matchingNotifications.map((notification) => notification.id)
  );
  const actualDeliveries = deliveries.filter((delivery) =>
    notificationIds.has(delivery.notification_id)
  );
  const expectedBranches = Array.isArray(expectation.expected_branches)
    ? expectation.expected_branches
    : Array.isArray(expectation.expectedBranches)
      ? expectation.expectedBranches
      : [];
  const expectedCounts = countByIdentity(expectedBranches, branchIdentity);
  const actualCounts = countByIdentity(actualDeliveries, branchIdentity);
  const branchKeys = new Set([...expectedCounts.keys(), ...actualCounts.keys()]);

  for (const branchKey of branchKeys) {
    const expected = expectedCounts.get(branchKey) || 0;
    const actual = actualCounts.get(branchKey) || 0;
    if (actual < expected) {
      failures.push({
        code: "missing_delivery_branch",
        expectationId: expectation.id,
        branch: branchKey,
        expected,
        actual,
      });
    }
    if (!expected && actual) {
      failures.push({
        code: "unexpected_delivery_branch",
        expectationId: expectation.id,
        branch: branchKey,
        count: actual,
      });
    }
    if (actual > 1) {
      failures.push({
        code: "duplicate_delivery_identity",
        expectationId: expectation.id,
        branch: branchKey,
        count: actual,
      });
    }
  }

  for (const notification of matchingNotifications) {
    const policy = notification.policy_snapshot || {};
    for (const channel of ["email", "sms", "staff"]) {
      const disabledDeliveries = actualDeliveries.filter(
        (delivery) =>
          delivery.notification_id === notification.id &&
          delivery.channel === channel &&
          !channelEnabled(policy, channel)
      );
      if (disabledDeliveries.length) {
        failures.push({
          code: "disabled_channel_delivery",
          notificationId: notification.id,
          channel,
          count: disabledDeliveries.length,
        });
      }
    }

    const notificationDeliveries = actualDeliveries.filter(
      (delivery) => delivery.notification_id === notification.id
    );
    const aggregate = calculateNotificationAggregateState(
      notificationDeliveries
    );
    if (notification.status !== aggregate) {
      failures.push({
        code: "aggregate_state_mismatch",
        notificationId: notification.id,
        expected: aggregate,
        actual: notification.status,
      });
    }
  }
}

export function verifyNotificationEngineParity({
  expectedOccurrences = [],
  businessEvents = [],
  notifications = [],
  deliveries = [],
  expectedRecipientsByNotification = {},
} = {}) {
  const failures = [];
  if (expectedOccurrences.length) {
    for (const expectation of expectedOccurrences) {
      verifyExpectedOccurrence({
        expectation,
        businessEvents,
        notifications,
        deliveries,
        failures,
      });
    }
    return {
      passed: failures.length === 0,
      failures,
      expectedOccurrenceCount: expectedOccurrences.length,
      businessEventCount: businessEvents.length,
      notificationCount: notifications.length,
      deliveryCount: deliveries.length,
    };
  }

  const businessEventCounts = new Map();
  for (const event of businessEvents) {
    const key = eventIdentity(event);
    businessEventCounts.set(key, (businessEventCounts.get(key) || 0) + 1);
  }
  for (const [key, count] of businessEventCounts) {
    if (count !== 1) failures.push({ code: "business_event_cardinality", key, count });
    const eventIds = new Set(
      businessEvents
        .filter((event) => eventIdentity(event) === key)
        .map((event) => event.id)
    );
    const notificationCount = notifications.filter((notification) =>
      eventIds.has(notification.business_event_id)
    ).length;
    if (notificationCount !== 1) {
      failures.push({
        code: "notification_cardinality",
        key,
        expected: 1,
        actual: notificationCount,
      });
    }
  }

  for (const notification of notifications) {
    const notificationCount = notifications.filter(
      (candidate) =>
        candidate.business_event_id === notification.business_event_id &&
        candidate.policy_id === notification.policy_id &&
        candidate.policy_version === notification.policy_version
    ).length;
    if (notificationCount !== 1) {
      failures.push({
        code: "notification_cardinality",
        notificationId: notification.id,
        count: notificationCount,
      });
    }

    const notificationDeliveries = deliveries.filter(
      (delivery) => delivery.notification_id === notification.id
    );
    const policy = notification.policy_snapshot || {};
    const expectedRecipients = expectedRecipientsByNotification[notification.id] || {};

    for (const channel of ["email", "sms", "staff"]) {
      const actual = notificationDeliveries.filter((delivery) => delivery.channel === channel);
      const expected = channelEnabled(policy, channel)
        ? expectedRecipients[channel] || []
        : [];
      if (!channelEnabled(policy, channel) && actual.length) {
        failures.push({
          code: "disabled_channel_delivery",
          notificationId: notification.id,
          channel,
          count: actual.length,
        });
      }
      if (channelEnabled(policy, channel) && actual.length !== expected.length) {
        failures.push({
          code: "enabled_channel_cardinality",
          notificationId: notification.id,
          channel,
          expected: expected.length,
          actual: actual.length,
        });
      }
    }

    const identities = notificationDeliveries.map(branchIdentity);
    if (new Set(identities).size !== identities.length) {
      failures.push({
        code: "duplicate_delivery_identity",
        notificationId: notification.id,
      });
    }

    const aggregate = calculateNotificationAggregateState(notificationDeliveries);
    if (notification.status !== aggregate) {
      failures.push({
        code: "aggregate_state_mismatch",
        notificationId: notification.id,
        expected: aggregate,
        actual: notification.status,
      });
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    businessEventCount: businessEvents.length,
    notificationCount: notifications.length,
    deliveryCount: deliveries.length,
  };
}
