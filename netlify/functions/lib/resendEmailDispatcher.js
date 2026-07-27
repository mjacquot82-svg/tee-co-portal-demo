import { buildDeliveryAttemptIdentity } from "../../../src/lib/notificationEngineFoundation.js";
import {
  claimResendObservationDeliveries,
  completeResendObservationDelivery,
  claimResendCutoverDelivery,
  completeResendCutoverDelivery,
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
  allowAuthoritative = false,
}) {
  if (delivery?.channel !== "email" || !normalizeText(notification?.event_type)) {
    throw new Error(
      "Resend adapter requires a customer email Delivery with an event type."
    );
  }
  if (
    delivery.status !== "processing" ||
    !normalizeText(delivery.claim_token) ||
    (!allowAuthoritative &&
      delivery.destination_snapshot?.observationOnly !== true) ||
    (allowAuthoritative &&
      delivery.destination_snapshot?.observationOnly === true)
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
      observationOnly: !allowAuthoritative,
    },
  };
}

export async function runResendEmailDeliveryCutover({
  deliveryId,
  workerId,
  adapter,
  leaseSeconds = 60,
  dispatcherClient,
  retryPolicy,
  now = () => new Date(),
}) {
  if (!normalizeText(deliveryId) || !normalizeText(workerId)) {
    throw new Error("Resend cutover Delivery and worker identities are required.");
  }
  if (adapter?.key !== "resend" || typeof adapter.send !== "function") {
    throw new Error("A configured Resend email adapter is required.");
  }
  const claimedRows = await claimResendCutoverDelivery(
    { deliveryId, workerId, leaseSeconds },
    dispatcherClient
  );
  const envelope = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;
  if (!envelope?.delivery) {
    return { authoritative: true, claimed: false, deliveryId };
  }
  return runClaimedResendEmailDeliveryAuthoritative({
    envelope,
    adapter,
    dispatcherClient,
    retryPolicy,
    now,
  });
}

export async function runClaimedResendEmailDeliveryAuthoritative({
  envelope,
  adapter,
  dispatcherClient,
  retryPolicy,
  now = () => new Date(),
}) {
  if (adapter?.key !== "resend" || typeof adapter.send !== "function") {
    throw new Error("A configured Resend email adapter is required.");
  }
  const request = buildResendAdapterRequest({
    delivery: envelope.delivery,
    notification: envelope.notification,
    businessEvent: envelope.business_event,
    allowAuthoritative: true,
  });
  const result = await adapter.send(request);
  const completedAt = now().toISOString();
  const delivery = await completeResendCutoverDelivery(
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
      retryPolicy: resolveNotificationRetryPolicy(retryPolicy),
      startedAt: envelope.delivery.claimed_at,
      completedAt,
    },
    dispatcherClient
  );
  return {
    authoritative: true,
    claimed: true,
    delivery,
    attemptId: request.attemptId,
    providerResult: result,
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
