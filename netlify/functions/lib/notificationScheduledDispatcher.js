import {
  claimResendAuthoritativeDeliveries,
  completeNotificationDispatchRun,
  recoverAbandonedAuthoritativeClaims,
  startNotificationDispatchRun,
} from "../../../src/lib/notificationDispatcherRepository.js";
import { resolveNotificationRetryPolicy } from "../../../src/lib/notificationDeliveryLifecycle.js";
import { runClaimedResendEmailDeliveryAuthoritative } from "./resendEmailDispatcher.js";

function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function errorEvidence(error, deliveryId = null) {
  return {
    deliveryId,
    message: String(error?.message || error || "Unknown dispatcher failure."),
  };
}

export async function runScheduledNotificationDispatcher({
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
  const resolvedRunId = requiredText(runId, "Dispatcher run identity");
  const resolvedWorkerId = requiredText(workerId, "Dispatcher worker identity");
  if (adapter?.key !== "resend" || typeof adapter.send !== "function") {
    throw new Error("A configured Resend email adapter is required.");
  }

  const startedAt = now().toISOString();
  await startNotificationDispatchRun(
    {
      runId: resolvedRunId,
      workerId: resolvedWorkerId,
      metadata: { startedAt, provider: "resend", channel: "email" },
    },
    dispatcherClient
  );

  let recovered = [];
  let claimed = [];
  const completed = [];
  const errors = [];

  try {
    recovered =
      (await recoverAbandonedAuthoritativeClaims(
        { limit: recoveryLimit },
        dispatcherClient
      )) || [];
    claimed =
      (await claimResendAuthoritativeDeliveries(
        { workerId: resolvedWorkerId, limit, leaseSeconds },
        dispatcherClient
      )) || [];

    for (const envelope of claimed) {
      try {
        completed.push(
          await runClaimedResendEmailDeliveryAuthoritative({
            envelope,
            adapter,
            dispatcherClient,
            retryPolicy: resolveNotificationRetryPolicy(retryPolicy),
            now,
          })
        );
      } catch (error) {
        // The claim is intentionally left intact. Its lease is the durable
        // recovery boundary for indeterminate runner or network failures.
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
      // Preserve the original operational failure. The running record remains
      // durable evidence if final run-summary persistence also fails.
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
    recoveredCount: recovered.length,
    claimedCount: claimed.length,
    completedCount: completed.length,
    failedCount: errors.length,
    errors,
    results: completed,
  };
}
