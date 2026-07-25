import { buildDeliveryAttemptIdentity } from "../../../src/lib/notificationEngineFoundation.js";
import {
  claimResendObservationDeliveries,
  completeResendObservationDelivery,
  recoverAbandonedObservationClaims,
} from "../../../src/lib/notificationDispatcherRepository.js";
import {
  resolveNotificationRetryPolicy,
} from "../../../src/lib/notificationDeliveryLifecycle.js";

function normalizeText(value) {
  return String(value ?? "").trim();
}

export function buildResendAdapterRequest({
  delivery,
  notification,
  businessEvent,
}) {
  if (
    delivery?.channel !== "email" ||
    notification?.event_type !== "quote_approved"
  ) {
    throw new Error(
      "Phase 2F Resend adapter accepts only Order Approved email Deliveries."
    );
  }
  if (
    delivery.status !== "processing" ||
    !normalizeText(delivery.claim_token) ||
    delivery.destination_snapshot?.observationOnly !== true
  ) {
    throw new Error(
      "Phase 2F Resend adapter requires a claimed observation Delivery."
    );
  }
  if (
    delivery.notification_id !== notification.id ||
    notification.business_event_id !== businessEvent?.id
  ) {
    throw new Error("Resend adapter received an inconsistent identity envelope.");
  }

  const email = normalizeText(delivery.destination_snapshot?.email);
  const subject = normalizeText(delivery.rendered_content?.subject);
  const body = normalizeText(delivery.rendered_content?.body);
  if (!email || !subject || !body) {
    throw new Error(
      "Resolved email Delivery is missing destination or rendered content."
    );
  }

  const attemptNumber = Math.max(0, Number(delivery.attempt_count) || 0) + 1;
  return {
    deliveryId: delivery.id,
    attemptId: buildDeliveryAttemptIdentity(delivery.id, attemptNumber),
    attemptNumber,
    claimToken: delivery.claim_token,
    idempotencyKey: delivery.idempotency_key,
    destination: { email },
    content: { subject, body },
    metadata: {
      businessEventId: businessEvent.id,
      notificationId: notification.id,
      deliveryId: delivery.id,
      eventType: notification.event_type,
      observationOnly: true,
    },
  };
}
export async function runResendEmailAdapterObservation({
  workerId,
  adapter,
  limit = 25,
  leaseSeconds = 60,
  recoveryLimit = 100,
  dispatcherClient,
  retryPolicy,
  now = () => new Date(),
}) {
  if (!normalizeText(workerId)) {
    throw new Error("Resend adapter dispatcher worker id is required.");
  }
  if (adapter?.key !== "resend" || typeof adapter.send !== "function") {
    throw new Error("A configured Resend email adapter is required.");
  }

  const recovered =
    (await recoverAbandonedObservationClaims(
      { limit: recoveryLimit },
      dispatcherClient
    )) || [];
  const claimed =
    (await claimResendObservationDeliveries(
      { workerId, limit, leaseSeconds },
      dispatcherClient
    )) || [];
  const results = [];
  const resolvedRetryPolicy = resolveNotificationRetryPolicy(retryPolicy);

  for (const envelope of claimed) {
    const request = buildResendAdapterRequest({
      delivery: envelope.delivery,
      notification: envelope.notification,
      businessEvent: envelope.business_event,
    });
    const startedAt = envelope.delivery.claimed_at;
    const result = await adapter.send(request);
    const completedAt = now().toISOString();
    const delivery = await completeResendObservationDelivery(
      {
        deliveryId: request.deliveryId,
        claimToken: request.claimToken,
        attemptId: request.attemptId,
        attemptNumber: request.attemptNumber,
        outcome: result.status,
        retryability: result.retryability,
        providerMessageId: result.providerMessageId,
        failureCode: result.failureCode,
        failureReason: result.failureReason,
        providerMetadata: result.providerMetadata,
        retryPolicy: resolvedRetryPolicy,
        startedAt,
        completedAt,
      },
      dispatcherClient
    );
    results.push({
      delivery,
      attemptId: request.attemptId,
      providerResult: result,
    });
  }

  return {
    observationOnly: true,
    providerKey: "resend",
    retryPolicy: resolvedRetryPolicy,
    recoveredCount: recovered.length,
    claimedCount: claimed.length,
    completedCount: results.length,
    results,
  };
}
