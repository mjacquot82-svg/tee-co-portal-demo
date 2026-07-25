import { supabase } from "./supabaseClient";

export const NOTIFICATION_DISPATCHER_RPCS = Object.freeze({
  claimObservation: "claim_notification_deliveries_observation",
  recoverAbandoned: "recover_abandoned_notification_delivery_claims",
  completeObservation: "complete_notification_delivery_observation",
  claimStaffObservation: "claim_staff_notification_deliveries_observation",
  completeStaffObservation: "complete_staff_internal_delivery_observation",
  claimResendObservation: "claim_resend_email_deliveries_observation",
  completeResendObservation: "complete_resend_email_delivery_observation",
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
      p_started_at: startedAt,
      p_completed_at: completedAt,
    },
    client
  );
}
