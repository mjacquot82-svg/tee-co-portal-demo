import { buildDeliveryAttemptIdentity } from "./notificationEngineFoundation";
import {
  claimObservationDeliveries,
  completeObservationDelivery,
  recoverAbandonedObservationClaims,
} from "./notificationDispatcherRepository";

export const NOTIFICATION_DISPATCH_MODES = Object.freeze({
  observationOnly: "observation_only",
});

function normalizeText(value) {
  return String(value ?? "").trim();
}

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

export function isObservationDeliveryEligible(delivery, now = new Date()) {
  if (!delivery || delivery.status !== "queued") return false;
  if (delivery.destination_snapshot?.observationOnly !== true) return false;
  if (!normalizeText(delivery.notification_id)) return false;

  const claimExpiresAt = validDate(delivery.claim_expires_at);
  return (
    !normalizeText(delivery.claim_token) ||
    Boolean(claimExpiresAt && claimExpiresAt <= now)
  );
}

export function isClaimLeaseValid(delivery, now = new Date()) {
  const claimExpiresAt = validDate(delivery?.claim_expires_at);
  return Boolean(
    delivery?.status === "processing" &&
      normalizeText(delivery.claim_token) &&
      claimExpiresAt &&
      claimExpiresAt > now
  );
}

function buildObservationAttempt(delivery, completedAt) {
  const attemptNumber = Math.max(0, Number(delivery.attempt_count) || 0) + 1;
  return {
    id: buildDeliveryAttemptIdentity(delivery.id, attemptNumber),
    deliveryId: delivery.id,
    attemptNumber,
    claimToken: delivery.claim_token,
    startedAt: delivery.claimed_at || completedAt,
    completedAt,
    outcome: "indeterminate",
    retryability: "unknown",
    providerKey: "observation_dispatcher",
    providerMetadata: {
      observationOnly: true,
      adapterInvoked: false,
    },
  };
}
export async function runNotificationDispatcherObservation({
  workerId,
  limit = 25,
  leaseSeconds = 60,
  recoveryLimit = 100,
  client,
  now = () => new Date(),
}) {
  if (!normalizeText(workerId)) {
    throw new Error("Notification dispatcher worker id is required.");
  }

  const recovered =
    (await recoverAbandonedObservationClaims(
      { limit: recoveryLimit },
      client
    )) || [];
  const claimed =
    (await claimObservationDeliveries(
      { workerId, limit, leaseSeconds },
      client
    )) || [];
  const observations = [];

  for (const delivery of claimed) {
    const completedAt = now().toISOString();
    if (!isClaimLeaseValid(delivery, new Date(completedAt))) {
      observations.push({
        deliveryId: delivery.id,
        completed: false,
        reason: "claim_lease_invalid",
      });
      continue;
    }

    const attempt = buildObservationAttempt(delivery, completedAt);
    const completedDelivery = await completeObservationDelivery(
      {
        deliveryId: attempt.deliveryId,
        claimToken: attempt.claimToken,
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
      },
      client
    );
    observations.push({
      deliveryId: delivery.id,
      completed: true,
      adapterInvoked: false,
      attempt,
      delivery: completedDelivery,
    });
  }

  return {
    mode: NOTIFICATION_DISPATCH_MODES.observationOnly,
    adapterExecutionEnabled: false,
    recoveredCount: recovered.length,
    claimedCount: claimed.length,
    completedCount: observations.filter((result) => result.completed).length,
    observations,
  };
}
