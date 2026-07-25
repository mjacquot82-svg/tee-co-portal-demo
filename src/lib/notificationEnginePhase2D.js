import {
  mapDeliveryToRow,
  NOTIFICATION_DELIVERY_STATUSES,
  NOTIFICATION_STATUSES,
} from "./notificationEngineFoundation";
import {
  persistNotification,
  persistNotificationDelivery,
} from "./notificationEngineRepository";
import { resolveCanonicalNotificationRecipients } from "./notificationRecipientResolution";

function determineDeliveryStatus(recipient) {
  if (recipient.suppressedReason) {
    return NOTIFICATION_DELIVERY_STATUSES.suppressed;
  }
  if (!recipient.deliverable) {
    return NOTIFICATION_DELIVERY_STATUSES.notDeliverable;
  }
  return NOTIFICATION_DELIVERY_STATUSES.queued;
}

function aggregateNotificationState(deliveries = []) {
  const counts = deliveries.reduce((result, delivery) => {
    result[delivery.status] = (result[delivery.status] || 0) + 1;
    return result;
  }, {});
  const terminalWithoutDispatch =
    (counts[NOTIFICATION_DELIVERY_STATUSES.notDeliverable] || 0) +
    (counts[NOTIFICATION_DELIVERY_STATUSES.suppressed] || 0) +
    (counts[NOTIFICATION_DELIVERY_STATUSES.cancelled] || 0);

  if (!deliveries.length || terminalWithoutDispatch === deliveries.length) {
    return {
      status: NOTIFICATION_STATUSES.noDelivery,
      counts,
    };
  }
  return {
    status: NOTIFICATION_STATUSES.queued,
    counts,
  };
}

function deliveryFailureMetadata(status, recipient) {
  if (status === NOTIFICATION_DELIVERY_STATUSES.suppressed) {
    return {
      last_failure_code: recipient.suppressedReason,
      last_failure_reason: "Recipient is suppressed by current business state.",
    };
  }
  if (status === NOTIFICATION_DELIVERY_STATUSES.notDeliverable) {
    return {
      last_failure_code: recipient.notDeliverableReason,
      last_failure_reason: "No valid destination was resolved for this channel.",
    };
  }
  return {
    last_failure_code: "",
    last_failure_reason: "",
  };
}

export async function createShadowNotificationDeliveriesPhase2D({
  phase2BResult,
  phase2CResult,
  context = {},
  customers,
  staffUsers,
  client,
}) {
  if (!phase2BResult?.observed) {
    return {
      created: false,
      reason: phase2BResult?.reason || "phase2b_not_observed",
      deliveries: [],
    };
  }
  if (!phase2CResult?.prepared) {
    return {
      created: false,
      reason: phase2CResult?.reason || "phase2c_not_prepared",
      deliveries: [],
    };
  }

  const recipientCollections = await resolveCanonicalNotificationRecipients({
    policy: phase2BResult.policy,
    templateSnapshots: phase2CResult.templateSnapshots,
    context,
    customers,
    staffUsers,
  });
  const deliveries = [];
  const observationOnly = context.notificationEngineObservationOnly !== false;

  for (const [channel, recipients] of Object.entries(recipientCollections)) {
    const templateSnapshot = phase2CResult.templateSnapshots[channel];
    for (const recipient of recipients) {
      const status = determineDeliveryStatus(recipient);
      const row = mapDeliveryToRow({
        notificationId: phase2CResult.notification.id,
        channel,
        recipientType: recipient.recipientType,
        recipientKey: recipient.recipientKey,
        recipientSnapshot: {
          ...recipient.snapshot,
          audience: recipient.audience,
        },
        destinationKey: recipient.destinationKey,
        destinationSnapshot: {
          ...recipient.destinationSnapshot,
          observationOnly,
        },
        templateType: templateSnapshot.templateType,
        templateVersionId: templateSnapshot.templateVersionId,
        templateVersion: templateSnapshot.templateVersion,
        renderedContent: templateSnapshot.content,
        status,
      });
      const persisted = await persistNotificationDelivery(
        {
          ...row,
          ...deliveryFailureMetadata(status, recipient),
          queued_at:
            status === NOTIFICATION_DELIVERY_STATUSES.queued
              ? new Date().toISOString()
              : null,
        },
        client
      );
      deliveries.push(persisted);
    }
  }

  const aggregate = aggregateNotificationState(deliveries);
  const existingNotification = phase2CResult.notification;
  const notification = await persistNotification(
    {
      ...existingNotification,
      status: aggregate.status,
      no_delivery_reason:
        aggregate.status === NOTIFICATION_STATUSES.noDelivery
          ? "no_deliverable_recipients"
          : existingNotification.no_delivery_reason || "",
      engine_metadata: {
        ...(existingNotification.engine_metadata || {}),
        phase2D: {
          status: observationOnly ? "shadow_deliveries_created" : "deliveries_created",
          observationOnly,
          dispatcherEligible: !observationOnly,
          deliveryCount: deliveries.length,
          deliveryStatusCounts: aggregate.counts,
        },
      },
    },
    client
  );

  return {
    created: true,
    observationOnly,
    recipientCollections,
    deliveries,
    aggregate,
    notification,
  };
}

export { aggregateNotificationState };
