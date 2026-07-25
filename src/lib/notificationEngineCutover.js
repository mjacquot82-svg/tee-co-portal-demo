import { observeLegacyNotificationEvent } from "./notificationEnginePhase2B";
import { prepareNotificationContentPhase2C } from "./notificationEnginePhase2C";
import { createShadowNotificationDeliveriesPhase2D } from "./notificationEnginePhase2D";

export const NOTIFICATION_ENGINE_CUTOVER_MODES = Object.freeze({
  legacy: "legacy",
  verify: "verify",
  authoritative: "authoritative",
});

export const AUTHORITATIVE_NOTIFICATION_EVENTS = Object.freeze(["quote_approved"]);

function enabled(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function normalizeMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return Object.values(NOTIFICATION_ENGINE_CUTOVER_MODES).includes(mode)
    ? mode
    : NOTIFICATION_ENGINE_CUTOVER_MODES.legacy;
}

export function resolveNotificationEngineCutover(eventType, context = {}) {
  const configuredMode = normalizeMode(
    context.notificationEngineCutoverMode ??
      import.meta.env?.VITE_NOTIFICATION_ENGINE_CUTOVER_MODE
  );
  const legacyShadowEnabled =
    context.phase2BShadowEnabled === true ||
    enabled(import.meta.env?.VITE_NOTIFICATION_ENGINE_PHASE2B_SHADOW);
  const supported = AUTHORITATIVE_NOTIFICATION_EVENTS.includes(eventType);
  const mode =
    configuredMode === NOTIFICATION_ENGINE_CUTOVER_MODES.authoritative && !supported
      ? NOTIFICATION_ENGINE_CUTOVER_MODES.legacy
      : configuredMode === NOTIFICATION_ENGINE_CUTOVER_MODES.legacy && legacyShadowEnabled
        ? NOTIFICATION_ENGINE_CUTOVER_MODES.verify
        : configuredMode;

  return {
    mode,
    supported,
    runLegacy: mode !== NOTIFICATION_ENGINE_CUTOVER_MODES.authoritative,
    runEngine: mode !== NOTIFICATION_ENGINE_CUTOVER_MODES.legacy,
    observationOnly: mode !== NOTIFICATION_ENGINE_CUTOVER_MODES.authoritative,
    rollbackMode: NOTIFICATION_ENGINE_CUTOVER_MODES.legacy,
  };
}

async function requestAuthoritativeDispatch(delivery, eventType, fetchImpl) {
  const endpoint =
    delivery.channel === "staff"
      ? "/.netlify/functions/staff-notification-delivery"
      : "/.netlify/functions/customer-notification";
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType,
      deliveryId: delivery.id,
      idempotencyKey: delivery.idempotency_key,
    }),
  });
  if (!response.ok) {
    throw new Error(`Notification Engine delivery failed with ${response.status}.`);
  }
  return response.json().catch(() => ({}));
}

export async function processNotificationEventThroughEngine({
  eventType,
  context = {},
  legacyTemplate,
  client,
  fetchImpl = globalThis.fetch,
}) {
  const cutover = resolveNotificationEngineCutover(eventType, context);
  if (!cutover.runEngine) {
    return { processed: false, reason: "legacy_mode", cutover };
  }

  const engineContext = {
    ...context,
    phase2BShadowEnabled: true,
    notificationEngineObservationOnly: cutover.observationOnly,
    notificationEngineCutoverMode: cutover.mode,
  };
  const phase2BResult = await observeLegacyNotificationEvent({
    eventType,
    context: engineContext,
    legacyTemplate,
    client,
  });
  const phase2CResult = await prepareNotificationContentPhase2C({
    phase2BResult,
    eventType,
    context: engineContext,
    legacyTemplate,
    client,
  });
  const phase2DResult = await createShadowNotificationDeliveriesPhase2D({
    phase2BResult,
    phase2CResult,
    context: engineContext,
    client,
  });

  const dispatchResults = [];
  if (!cutover.observationOnly) {
    if (typeof fetchImpl !== "function") {
      throw new Error("Authoritative Notification Engine dispatch is unavailable.");
    }
    for (const delivery of phase2DResult.deliveries || []) {
      if (
        ["email", "staff"].includes(delivery.channel) &&
        delivery.status === "queued"
      ) {
        dispatchResults.push(
          await requestAuthoritativeDispatch(delivery, eventType, fetchImpl)
        );
      }
    }
  }

  return {
    processed: true,
    cutover,
    phase2BResult,
    phase2CResult,
    phase2DResult,
    dispatchResults,
  };
}
