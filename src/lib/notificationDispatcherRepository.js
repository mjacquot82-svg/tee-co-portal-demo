import { supabase } from "./supabaseClient";

export const NOTIFICATION_DISPATCHER_RPCS = Object.freeze({
  claimObservation: "claim_notification_deliveries_observation",
  recoverAbandoned: "recover_abandoned_notification_delivery_claims",
  completeObservation: "complete_notification_delivery_observation",
  claimStaffObservation: "claim_staff_notification_deliveries_observation",
  completeStaffObservation: "complete_staff_internal_delivery_observation",
  claimStaffAuthoritative: "claim_staff_notification_delivery_authoritative",
  completeStaffAuthoritative:
    "complete_staff_internal_delivery_authoritative",
  claimResendObservation: "claim_resend_email_deliveries_observation",
  completeResendObservation: "complete_resend_email_delivery_observation",
  claimResendCutover: "claim_resend_email_delivery_cutover",
  completeResendCutover: "complete_resend_email_delivery_cutover",
  claimResendAuthoritative: "claim_resend_email_deliveries_authoritative",
  recoverAuthoritative:
    "recover_abandoned_notification_delivery_claims_authoritative",
  startDispatchRun: "start_notification_dispatch_run",
  completeDispatchRun: "complete_notification_dispatch_run",
});

function resolveClient(client) {
  const resolved = client || supabase;
  if (!resolved?.rpc) {
    throw new Error(
      "Notification dispatcher persistence requires a configured Supabase client."
    );
  }
  return resolved;
}

async function callRpc(name, parameters, client) {
  const { data, error } = await resolveClient(client).rpc(name, parameters);
  if (error) throw error;
  return data;
}

export function claimObservationDeliveries(
  { workerId, limit = 25, leaseSeconds = 60 },
  client
) {
  return callRpc(
    NOTIFICATION_DISPATCHER_RPCS.claimObservation,
    {
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    },
    client
  );
}
export function recoverAbandonedObservationClaims({ limit = 100 } = {}, client) {
  return callRpc(
    NOTIFICATION_DISPATCHER_RPCS.recoverAbandoned,
    { p_limit: limit },
    client
  );
}

export function completeObservationDelivery(
  {
    deliveryId,
    claimToken,
    attemptId,
    attemptNumber,
    startedAt,
    completedAt,
  },
  client
) {
  return callRpc(
    NOTIFICATION_DISPATCHER_RPCS.completeObservation,
    {
      p_delivery_id: deliveryId,
      p_claim_token: claimToken,
      p_attempt_id: attemptId,
      p_attempt_number: attemptNumber,
      p_started_at: startedAt,
      p_completed_at: completedAt,
    },
    client
  );
}

export function claimStaffObservationDeliveries(
  { workerId, limit = 25, leaseSeconds = 60 },
  client
) {
  return callRpc(
    NOTIFICATION_DISPATCHER_RPCS.claimStaffObservation,
    {
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    },
    client
  );
}

export function completeStaffObservationDelivery(
  {
    deliveryId,
    claimToken,
    attemptId,
    attemptNumber,
    staffNotificationId,
    startedAt,
    completedAt,
  },
  client
) {
  return callRpc(
    NOTIFICATION_DISPATCHER_RPCS.completeStaffObservation,
    {
      p_delivery_id: deliveryId,
      p_claim_token: claimToken,
      p_attempt_id: attemptId,
      p_attempt_number: attemptNumber,
      p_staff_notification_id: staffNotificationId,
      p_started_at: startedAt,
      p_completed_at: completedAt,
    },
    client
  );
}

export function claimStaffAuthoritativeDelivery(
  { deliveryId, workerId, leaseSeconds = 60 },
  client
) {
  return callRpc(
    NOTIFICATION_DISPATCHER_RPCS.claimStaffAuthoritative,
    {
      p_delivery_id: deliveryId,
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    },
    client
  );
}

export function completeStaffAuthoritativeDelivery(
  {
    deliveryId,
    claimToken,
    attemptId,
    attemptNumber,
    staffNotificationId,
    startedAt,
    completedAt,
  },
  client
) {
  return callRpc(
    NOTIFICATION_DISPATCHER_RPCS.completeStaffAuthoritative,
    {
      p_delivery_id: deliveryId,
      p_claim_token: claimToken,
      p_attempt_id: attemptId,
      p_attempt_number: attemptNumber,
      p_staff_notification_id: staffNotificationId,
      p_started_at: startedAt,
      p_completed_at: completedAt,
    },
    client
  );
}

export function claimResendObservationDeliveries(
  { workerId, limit = 25, leaseSeconds = 60 },
  client
) {
  return callRpc(
    NOTIFICATION_DISPATCHER_RPCS.claimResendObservation,
    {
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    },
    client
  );
}

export function completeResendObservationDelivery(
  {
    deliveryId,
    claimToken,
    attemptId,
    attemptNumber,
    outcome,
    retryability,
    providerMessageId,
    failureCode,
    failureReason,
    providerMetadata,
    retryPolicy,
    startedAt,
    completedAt,
  },
  client
) {
  return callRpc(
    NOTIFICATION_DISPATCHER_RPCS.completeResendObservation,
    {
      p_delivery_id: deliveryId,
      p_claim_token: claimToken,
      p_attempt_id: attemptId,
      p_attempt_number: attemptNumber,
      p_outcome: outcome,
      p_retryability: retryability,
      p_provider_message_id: providerMessageId,
      p_failure_code: failureCode,
      p_failure_reason: failureReason,
      p_provider_metadata: providerMetadata,
      p_max_attempts: retryPolicy?.maxAttempts,
      p_base_delay_seconds: retryPolicy?.baseDelaySeconds,
      p_max_delay_seconds: retryPolicy?.maxDelaySeconds,
      p_started_at: startedAt,
      p_completed_at: completedAt,
    },
    client
  );
}

export function claimResendCutoverDelivery(
  { deliveryId, workerId, leaseSeconds = 60 },
  client
) {
  return callRpc(
    NOTIFICATION_DISPATCHER_RPCS.claimResendCutover,
    {
      p_delivery_id: deliveryId,
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    },
    client
  );
}

export function completeResendCutoverDelivery(
  {
    deliveryId,
    claimToken,
    attemptId,
    attemptNumber,
    outcome,
    retryability,
    providerMessageId,
    failureCode,
    failureReason,
    providerMetadata,
    retryPolicy,
    startedAt,
    completedAt,
  },
  client
) {
  return callRpc(
    NOTIFICATION_DISPATCHER_RPCS.completeResendCutover,
    {
      p_delivery_id: deliveryId,
      p_claim_token: claimToken,
      p_attempt_id: attemptId,
      p_attempt_number: attemptNumber,
      p_outcome: outcome,
      p_retryability: retryability,
      p_provider_message_id: providerMessageId,
      p_failure_code: failureCode,
      p_failure_reason: failureReason,
      p_provider_metadata: providerMetadata,
      p_max_attempts: retryPolicy?.maxAttempts,
      p_base_delay_seconds: retryPolicy?.baseDelaySeconds,
      p_max_delay_seconds: retryPolicy?.maxDelaySeconds,
      p_started_at: startedAt,
      p_completed_at: completedAt,
    },
    client
  );
}

export function claimResendAuthoritativeDeliveries(
  { workerId, limit = 25, leaseSeconds = 60 },
  client
) {
  return callRpc(
    NOTIFICATION_DISPATCHER_RPCS.claimResendAuthoritative,
    {
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    },
    client
  );
}

export function recoverAbandonedAuthoritativeClaims(
  { limit = 100 } = {},
  client
) {
  return callRpc(
    NOTIFICATION_DISPATCHER_RPCS.recoverAuthoritative,
    { p_limit: limit },
    client
  );
}

export function startNotificationDispatchRun(
  { runId, workerId, metadata = {} },
  client
) {
  return callRpc(
    NOTIFICATION_DISPATCHER_RPCS.startDispatchRun,
    {
      p_run_id: runId,
      p_worker_id: workerId,
      p_metadata: metadata,
    },
    client
  );
}

export function completeNotificationDispatchRun(
  {
    runId,
    status,
    recoveredCount = 0,
    claimedCount = 0,
    completedCount = 0,
    failedCount = 0,
    errorSummary = [],
    metadata = {},
  },
  client
) {
  return callRpc(
    NOTIFICATION_DISPATCHER_RPCS.completeDispatchRun,
    {
      p_run_id: runId,
      p_status: status,
      p_recovered_count: recoveredCount,
      p_claimed_count: claimedCount,
      p_completed_count: completedCount,
      p_failed_count: failedCount,
      p_error_summary: errorSummary,
      p_metadata: metadata,
    },
    client
  );
}

export function markNotificationDeliveryDelivered(
  { deliveryId, providerMessageId, occurredAt, providerMetadata = {} },
  client
) {
  return callRpc(
    "mark_notification_delivery_delivered",
    {
      p_delivery_id: deliveryId,
      p_provider_message_id: providerMessageId,
      p_occurred_at: occurredAt,
      p_provider_metadata: providerMetadata,
    },
    client
  );
}

export function cancelNotificationDelivery(
  { deliveryId, reason, occurredAt },
  client
) {
  return callRpc(
    "cancel_notification_delivery",
    {
      p_delivery_id: deliveryId,
      p_reason: reason,
      p_occurred_at: occurredAt,
    },
    client
  );
}
