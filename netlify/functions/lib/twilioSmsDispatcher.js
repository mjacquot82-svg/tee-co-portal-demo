import { buildDeliveryAttemptIdentity } from "../../../src/lib/notificationEngineFoundation.js";
import { resolveNotificationRetryPolicy } from "../../../src/lib/notificationDeliveryLifecycle.js";
import {
  claimTwilioAuthoritativeDeliveries,
  completeNotificationDispatchRun,
  completeTwilioAuthoritativeDelivery,
  recoverAbandonedTwilioAuthoritativeClaims,
  startTwilioSmsDispatchRun,
} from "../../../src/lib/notificationDispatcherRepository.js";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function errorEvidence(error, deliveryId = null) {
  return {
    deliveryId,
    message: normalizeText(error?.message || error) || "Unknown SMS failure.",
  };
}

export function buildTwilioSmsAdapterRequest({
  delivery,
  notification,
  businessEvent,
}) {
  if (delivery?.channel !== "sms") {
    throw new Error("Twilio adapter accepts only SMS Deliveries.");
  }
  if (
    delivery.status !== "processing" ||
    !normalizeText(delivery.claim_token) ||
    delivery.destination_snapshot?.observationOnly === true
  ) {
    throw new Error(
      "Twilio adapter requires a claimed authoritative SMS Delivery."
    );
  }
  if (
    delivery.notification_id !== notification?.id ||
    notification.business_event_id !== businessEvent?.id
  ) {
    throw new Error("Twilio adapter received an inconsistent identity envelope.");
  }

  const phone = normalizeText(delivery.destination_snapshot?.phone);
  const normalizedPhone = normalizeText(
    delivery.destination_snapshot?.normalizedPhone
  );
  const body = normalizeText(delivery.rendered_content?.body);
  if ((!phone && !normalizedPhone) || !body) {
    throw new Error(
      "Resolved SMS Delivery is missing destination or rendered content."
    );
  }

  const attemptNumber = Math.max(0, Number(delivery.attempt_count) || 0) + 1;
  return {
    deliveryId: delivery.id,
    attemptId: buildDeliveryAttemptIdentity(delivery.id, attemptNumber),
    attemptNumber,
    claimToken: delivery.claim_token,
    idempotencyKey: delivery.idempotency_key,
    destination: { phone, normalizedPhone },
    content: { body },
    metadata: {
      businessEventId: businessEvent.id,
      notificationId: notification.id,
      deliveryId: delivery.id,
      eventType: notification.event_type,
      observationOnly: false,
    },
  };
}

export async function runClaimedTwilioSmsDelivery({
  envelope,
  adapter,
  dispatcherClient,
  retryPolicy,
  now = () => new Date(),
}) {
  if (adapter?.key !== "twilio" || typeof adapter.send !== "function") {
    throw new Error("A configured Twilio SMS adapter is required.");
  }
  const request = buildTwilioSmsAdapterRequest({
    delivery: envelope.delivery,
    notification: envelope.notification,
    businessEvent: envelope.business_event,
  });
  const result = await adapter.send(request);
  const completedAt = now().toISOString();
  const delivery = await completeTwilioAuthoritativeDelivery(
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
    delivery,
    attemptId: request.attemptId,
    providerResult: result,
  };
}

export async function runScheduledTwilioSmsDispatcher({
  runId,
  workerId,
  adapter,
  dispatcherClient,
  limit = 25,
  leaseSeconds = 60,
  recoveryLimit = 100,
  retryPolicy,
  now = () => new Date(),
}) {
  const resolvedRunId = normalizeText(runId);
  const resolvedWorkerId = normalizeText(workerId);
  if (!resolvedRunId || !resolvedWorkerId) {
    throw new Error("Twilio dispatcher run and worker identities are required.");
  }
  if (adapter?.key !== "twilio" || typeof adapter.send !== "function") {
    throw new Error("A configured Twilio SMS adapter is required.");
  }

  await startTwilioSmsDispatchRun(
    {
      runId: resolvedRunId,
      workerId: resolvedWorkerId,
      metadata: {
        startedAt: now().toISOString(),
        provider: "twilio",
        channel: "sms",
      },
    },
    dispatcherClient
  );

  let recovered = [];
  let claimed = [];
  const completed = [];
  const errors = [];

  try {
    recovered =
      (await recoverAbandonedTwilioAuthoritativeClaims(
        { limit: recoveryLimit },
        dispatcherClient
      )) || [];
    claimed =
      (await claimTwilioAuthoritativeDeliveries(
        { workerId: resolvedWorkerId, limit, leaseSeconds },
        dispatcherClient
      )) || [];

    for (const envelope of claimed) {
      try {
        completed.push(
          await runClaimedTwilioSmsDelivery({
            envelope,
            adapter,
            dispatcherClient,
            retryPolicy,
            now,
          })
        );
      } catch (error) {
        errors.push(errorEvidence(error, envelope?.delivery?.id));
      }
    }
  } catch (error) {
    errors.push(errorEvidence(error));
    try {
      await completeNotificationDispatchRun(
        {
          runId: resolvedRunId,
          status: "failed",
          recoveredCount: recovered.length,
          claimedCount: claimed.length,
          completedCount: completed.length,
          failedCount: errors.length,
          errorSummary: errors,
          metadata: { completedAt: now().toISOString() },
        },
        dispatcherClient
      );
    } catch {
      // Keep the original dispatcher failure as the authoritative exception.
    }
    throw error;
  }

  const status = errors.length ? "completed_with_errors" : "completed";
  await completeNotificationDispatchRun(
    {
      runId: resolvedRunId,
      status,
      recoveredCount: recovered.length,
      claimedCount: claimed.length,
      completedCount: completed.length,
      failedCount: errors.length,
      errorSummary: errors,
      metadata: { completedAt: now().toISOString() },
    },
    dispatcherClient
  );

  return {
    runId: resolvedRunId,
    status,
    providerKey: "twilio",
    recoveredCount: recovered.length,
    claimedCount: claimed.length,
    completedCount: completed.length,
    failedCount: errors.length,
    errors,
    results: completed,
  };
}
