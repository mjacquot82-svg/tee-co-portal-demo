import {
  buildPhase2APolicySeed,
  NOTIFICATION_POLICY_DELIVERY_MODES,
  NOTIFICATION_STATUSES,
} from "./notificationEngineFoundation";
import {
  persistNotificationPolicy,
} from "./notificationEngineRepository";
import { findCurrentNotificationPolicy } from "./notificationEnginePhase2BRepository";

function hasEnabledChannel(policy = {}) {
  return Boolean(
    policy.email_enabled ||
      policy.sms_enabled ||
      policy.staff_notification_enabled
  );
}

export function snapshotNotificationPolicy(policy = {}) {
  return {
    id: policy.id,
    event_type: policy.event_type,
    version: policy.version,
    enabled: Boolean(policy.enabled),
    delivery_mode: policy.delivery_mode,
    email_enabled: Boolean(policy.email_enabled),
    sms_enabled: Boolean(policy.sms_enabled),
    staff_notification_enabled: Boolean(policy.staff_notification_enabled),
    customer_audience_enabled: Boolean(policy.customer_audience_enabled),
    staff_audience_enabled: Boolean(policy.staff_audience_enabled),
    owner_audience_enabled: Boolean(policy.owner_audience_enabled),
    channel_template_assignments: {
      ...(policy.channel_template_assignments || {}),
    },
    effective_from: policy.effective_from || null,
    effective_to: policy.effective_to || null,
  };
}

export function evaluateNotificationPolicy(policy = {}) {
  const mode =
    policy.delivery_mode || NOTIFICATION_POLICY_DELIVERY_MODES.automatic;

  if (!policy.enabled || mode === NOTIFICATION_POLICY_DELIVERY_MODES.disabled) {
    return {
      deliveryMode: mode,
      status: NOTIFICATION_STATUSES.noDelivery,
      noDeliveryReason: "policy_disabled",
    };
  }

  if (mode === NOTIFICATION_POLICY_DELIVERY_MODES.approvalRequired) {
    return {
      deliveryMode: mode,
      status: NOTIFICATION_STATUSES.pendingApproval,
      noDeliveryReason: "",
    };
  }

  if (!hasEnabledChannel(policy)) {
    return {
      deliveryMode: mode,
      status: NOTIFICATION_STATUSES.noDelivery,
      noDeliveryReason: "no_channels_enabled",
    };
  }

  return {
    deliveryMode: mode,
    status: NOTIFICATION_STATUSES.evaluated,
    noDeliveryReason: "",
  };
}

export async function resolveNotificationPolicy({
  eventType,
  occurredAt,
  legacyTemplate,
  client,
}) {
  const existing = await findCurrentNotificationPolicy(eventType, occurredAt, client);
  if (existing) return existing;

  if (!legacyTemplate) {
    throw new Error(`No Notification Policy exists for ${eventType}.`);
  }

  const seed = buildPhase2APolicySeed({
    ...legacyTemplate,
    type: eventType,
  });
  return persistNotificationPolicy(seed, client);
}
