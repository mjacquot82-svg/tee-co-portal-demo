import {
  NOTIFICATION_DELIVERY_STATUSES,
  NOTIFICATION_STATUSES,
} from "./notificationEngineFoundation";

export const DEFAULT_NOTIFICATION_RETRY_POLICY = Object.freeze({
  maxAttempts: 3,
  baseDelaySeconds: 60,
  maxDelaySeconds: 3600,
});

export const TERMINAL_DELIVERY_STATUSES = Object.freeze([
  NOTIFICATION_DELIVERY_STATUSES.delivered,
  NOTIFICATION_DELIVERY_STATUSES.failed,
  NOTIFICATION_DELIVERY_STATUSES.notDeliverable,
  NOTIFICATION_DELIVERY_STATUSES.suppressed,
  NOTIFICATION_DELIVERY_STATUSES.cancelled,
]);

const DELIVERY_TRANSITIONS = Object.freeze({
  [NOTIFICATION_DELIVERY_STATUSES.queued]: [
    NOTIFICATION_DELIVERY_STATUSES.processing,
    NOTIFICATION_DELIVERY_STATUSES.cancelled,
  ],
  [NOTIFICATION_DELIVERY_STATUSES.retryScheduled]: [
    NOTIFICATION_DELIVERY_STATUSES.processing,
    NOTIFICATION_DELIVERY_STATUSES.cancelled,
  ],
  [NOTIFICATION_DELIVERY_STATUSES.processing]: [
    NOTIFICATION_DELIVERY_STATUSES.queued,
    NOTIFICATION_DELIVERY_STATUSES.sent,
    NOTIFICATION_DELIVERY_STATUSES.failed,
    NOTIFICATION_DELIVERY_STATUSES.retryScheduled,
  ],
  [NOTIFICATION_DELIVERY_STATUSES.sent]: [
    NOTIFICATION_DELIVERY_STATUSES.delivered,
  ],
  [NOTIFICATION_DELIVERY_STATUSES.delivered]: [],
  [NOTIFICATION_DELIVERY_STATUSES.failed]: [],
  [NOTIFICATION_DELIVERY_STATUSES.notDeliverable]: [],
  [NOTIFICATION_DELIVERY_STATUSES.suppressed]: [],
  [NOTIFICATION_DELIVERY_STATUSES.cancelled]: [],
});

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0
    ? Math.min(normalized, maximum)
    : fallback;
}
export function resolveNotificationRetryPolicy(input = {}) {
  const maxAttempts = positiveInteger(
    input.maxAttempts,
    DEFAULT_NOTIFICATION_RETRY_POLICY.maxAttempts,
    20
  );
  const baseDelaySeconds = positiveInteger(
    input.baseDelaySeconds,
    DEFAULT_NOTIFICATION_RETRY_POLICY.baseDelaySeconds,
    86400
  );
  const maxDelaySeconds = Math.max(
    baseDelaySeconds,
    positiveInteger(
      input.maxDelaySeconds,
      DEFAULT_NOTIFICATION_RETRY_POLICY.maxDelaySeconds,
      604800
    )
  );
  return { maxAttempts, baseDelaySeconds, maxDelaySeconds };
}

export function calculateNotificationRetryDelay(
  attemptNumber,
  policyInput = {}
) {
  const policy = resolveNotificationRetryPolicy(policyInput);
  const exponent = Math.max(0, positiveInteger(attemptNumber, 1) - 1);
  return Math.min(
    policy.maxDelaySeconds,
    policy.baseDelaySeconds * 2 ** exponent
  );
}

export function canTransitionDelivery(from, to) {
  return Boolean(DELIVERY_TRANSITIONS[from]?.includes(to));
}

export function decideDeliveryFailureTransition({
  attemptNumber,
  retryability,
  idempotencyKey,
  policy: policyInput,
  completedAt = new Date(),
}) {
  const policy = resolveNotificationRetryPolicy(policyInput);
  const normalizedAttempt = positiveInteger(attemptNumber, 1);
  const retrySafe =
    retryability === "retryable" ||
    (retryability === "indeterminate" && Boolean(String(idempotencyKey || "").trim()));
  const retryAvailable = normalizedAttempt < policy.maxAttempts;

  if (retrySafe && retryAvailable) {
    const delaySeconds = calculateNotificationRetryDelay(
      normalizedAttempt,
      policy
    );
    return {
      status: NOTIFICATION_DELIVERY_STATUSES.retryScheduled,
      exhausted: false,
      delaySeconds,
      nextRetryAt: new Date(
        new Date(completedAt).getTime() + delaySeconds * 1000
      ).toISOString(),
    };
  }

  return {
    status: NOTIFICATION_DELIVERY_STATUSES.failed,
    exhausted: retrySafe && !retryAvailable,
    delaySeconds: 0,
    nextRetryAt: null,
  };
}

export function calculateNotificationAggregateState(deliveries = []) {
  const statuses = deliveries.map((delivery) => delivery.status);
  const successful = statuses.filter((status) =>
    [
      NOTIFICATION_DELIVERY_STATUSES.sent,
      NOTIFICATION_DELIVERY_STATUSES.delivered,
    ].includes(status)
  ).length;
  const failed = statuses.filter(
    (status) => status === NOTIFICATION_DELIVERY_STATUSES.failed
  ).length;
  const pending = statuses.filter((status) =>
    [
      NOTIFICATION_DELIVERY_STATUSES.queued,
      NOTIFICATION_DELIVERY_STATUSES.processing,
      NOTIFICATION_DELIVERY_STATUSES.retryScheduled,
    ].includes(status)
  ).length;
  const nonDelivery = statuses.filter((status) =>
    [
      NOTIFICATION_DELIVERY_STATUSES.notDeliverable,
      NOTIFICATION_DELIVERY_STATUSES.suppressed,
      NOTIFICATION_DELIVERY_STATUSES.cancelled,
    ].includes(status)
  ).length;

  if (!statuses.length || nonDelivery === statuses.length) {
    return NOTIFICATION_STATUSES.noDelivery;
  }
  if (successful && (failed || pending)) {
    return NOTIFICATION_STATUSES.partiallySuccessful;
  }
  if (pending) return NOTIFICATION_STATUSES.queued;
  if (failed) return successful
    ? NOTIFICATION_STATUSES.partiallySuccessful
    : NOTIFICATION_STATUSES.failed;
  if (successful) return NOTIFICATION_STATUSES.completed;
  return NOTIFICATION_STATUSES.noDelivery;
}
