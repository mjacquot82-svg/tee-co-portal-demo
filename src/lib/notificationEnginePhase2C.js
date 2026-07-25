import { NOTIFICATION_STATUSES } from "./notificationEngineFoundation";
import { persistNotification } from "./notificationEngineRepository";
import {
  buildCanonicalNotificationMergeContext,
  validateNotificationMergeContext,
} from "./notificationMergeContext";
import { resolvePublishedNotificationTemplates } from "./notificationTemplateResolution";

function resolutionFailure(code, details = {}) {
  return {
    stage: "pre_dispatch_resolution",
    code,
    ...details,
  };
}

function shouldSkipPolicyDecision(decision = {}) {
  return (
    decision.status === NOTIFICATION_STATUSES.noDelivery ||
    decision.deliveryMode === "disabled"
  );
}

export async function prepareNotificationContentPhase2C({
  phase2BResult,
  eventType,
  context = {},
  legacyTemplate,
  client,
}) {
  if (!phase2BResult?.observed) {
    return {
      prepared: false,
      reason: phase2BResult?.reason || "phase2b_not_observed",
    };
  }

  const existingNotification = phase2BResult.notification;
  const existingMetadata = existingNotification.engine_metadata || {};

  if (shouldSkipPolicyDecision(phase2BResult.decision)) {
    const notification = await persistNotification(
      {
        ...existingNotification,
        engine_metadata: {
          ...existingMetadata,
          phase2C: {
            status: "skipped_policy_decision",
            deliveriesCreated: 0,
          },
        },
      },
      client
    );
    return {
      prepared: false,
      reason: "policy_decision_skipped",
      notification,
      deliveriesCreated: 0,
    };
  }

  const mergeContext = buildCanonicalNotificationMergeContext(
    eventType,
    context
  );

  try {
    const resolved = await resolvePublishedNotificationTemplates({
      eventType,
      policy: phase2BResult.policy,
      mergeContext,
      legacyTemplate,
      client,
    });
    const validation = validateNotificationMergeContext({
      eventType,
      mergeContext,
      additionalRequiredFields: resolved.additionalRequiredFields,
      renderedContents: resolved.renderedContents,
    });
    const failures = [];

    if (validation.missingRequiredFields.length) {
      failures.push(
        resolutionFailure("missing_required_merge_fields", {
          fields: validation.missingRequiredFields,
        })
      );
    }
    if (validation.unresolvedRequiredTokens.length) {
      failures.push(
        resolutionFailure("unresolved_required_merge_tokens", {
          tokens: validation.unresolvedRequiredTokens,
        })
      );
    }

    const notification = await persistNotification(
      {
        ...existingNotification,
        status: failures.length
          ? NOTIFICATION_STATUSES.failed
          : existingNotification.status,
        engine_metadata: {
          ...existingMetadata,
          phase2C: {
            status: failures.length ? "resolution_failed" : "prepared",
            mergeContext,
            mergeValidation: validation,
            templateSnapshots: resolved.snapshots,
            failures,
            deliveriesCreated: 0,
          },
        },
      },
      client
    );

    return {
      prepared: failures.length === 0,
      notification,
      mergeContext,
      validation,
      templateSnapshots: resolved.snapshots,
      failures,
      deliveriesCreated: 0,
    };
  } catch (error) {
    const failures = [
      resolutionFailure("template_resolution_failed", {
        message: error?.message || "Unable to resolve a published template.",
      }),
    ];
    const notification = await persistNotification(
      {
        ...existingNotification,
        status: NOTIFICATION_STATUSES.failed,
        engine_metadata: {
          ...existingMetadata,
          phase2C: {
            status: "resolution_failed",
            mergeContext,
            templateSnapshots: {},
            failures,
            deliveriesCreated: 0,
          },
        },
      },
      client
    );
    return {
      prepared: false,
      notification,
      mergeContext,
      templateSnapshots: {},
      failures,
      deliveriesCreated: 0,
    };
  }
}

