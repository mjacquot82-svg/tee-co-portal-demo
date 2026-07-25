import {
  mapNotificationToRow,
} from "./notificationEngineFoundation";
import { buildNotificationBusinessEventRow } from "./notificationBusinessEvents";
import {
  evaluateNotificationPolicy,
  resolveNotificationPolicy,
  snapshotNotificationPolicy,
} from "./notificationPolicyService";
import {
  persistNotification,
} from "./notificationEngineRepository";
import { acceptNotificationBusinessEventDurably } from "./notificationBusinessEventAcceptance";

function normalizeFlag(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export function isNotificationEnginePhase2BShadowEnabled(context = {}) {
  if (typeof context.phase2BShadowEnabled === "boolean") {
    return context.phase2BShadowEnabled;
  }
  return normalizeFlag(import.meta.env?.VITE_NOTIFICATION_ENGINE_PHASE2B_SHADOW);
}

export async function observeLegacyNotificationEvent({
  eventType,
  context = {},
  legacyTemplate,
  client,
}) {
  if (!isNotificationEnginePhase2BShadowEnabled(context)) {
    return { observed: false, reason: "shadow_disabled" };
  }

  const businessEventRow = buildNotificationBusinessEventRow(eventType, context);
  const observationOnly = context.notificationEngineObservationOnly !== false;
  const businessEvent = await acceptNotificationBusinessEventDurably(
    businessEventRow,
    { client }
  );
  const policy = await resolveNotificationPolicy({
    eventType,
    occurredAt: businessEvent.occurred_at,
    legacyTemplate,
    client,
  });
  const decision = evaluateNotificationPolicy(policy);
  const notificationRow = mapNotificationToRow({
    businessEventId: businessEvent.id,
    eventType: businessEvent.event_type,
    subjectType: businessEvent.subject_type,
    subjectId: businessEvent.subject_id,
    correlationId: businessEvent.correlation_id,
    policyId: policy.id,
    policyVersion: policy.version,
    policySnapshot: snapshotNotificationPolicy(policy),
    deliveryMode: decision.deliveryMode,
    status: decision.status,
    noDeliveryReason: decision.noDeliveryReason,
    engineMetadata: {
      observationOnly,
      legacyRuntimeAuthoritative: observationOnly,
      ...(context.notificationEngineCutoverMode
        ? { cutoverMode: context.notificationEngineCutoverMode }
        : {}),
      deliveriesDeferredUntilPhase2C: true,
    },
  });
  const notification = await persistNotification(notificationRow, client);

  return {
    observed: true,
    businessEvent,
    policy,
    decision,
    notification,
    deliveriesCreated: 0,
  };
}
