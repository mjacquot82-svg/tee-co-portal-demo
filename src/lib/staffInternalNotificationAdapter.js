import { buildDeliveryAttemptIdentity } from "./notificationEngineFoundation";
import {
  claimStaffObservationDeliveries,
  completeStaffObservationDelivery,
  recoverAbandonedObservationClaims,
} from "./notificationDispatcherRepository";
import {
  createStaffNotificationFromAdapter,
  STAFF_NOTIFICATION_TYPES,
} from "./staffNotificationsStore";

const STAFF_EVENT_PRESENTATION = Object.freeze({
  new_customer_request: {
    type: STAFF_NOTIFICATION_TYPES.newWorkAssigned,
    description: (orderNumber) =>
      `New customer request received for order ${orderNumber}.`,
  },
  quote_approved: {
    type: STAFF_NOTIFICATION_TYPES.readyForProduction,
    description: (orderNumber) =>
      `Order ${orderNumber} was approved and is ready for staff follow-up.`,
  },
  payment_request_created: {
    type: STAFF_NOTIFICATION_TYPES.paymentHold,
    description: (orderNumber) =>
      `Payment request created for order ${orderNumber}.`,
  },
  payment_received: {
    type: STAFF_NOTIFICATION_TYPES.readyForProduction,
    description: (orderNumber) =>
      `Payment received for order ${orderNumber}.`,
  },
  payment_failed: {
    type: STAFF_NOTIFICATION_TYPES.paymentHold,
    description: (orderNumber) =>
      `Payment failed for order ${orderNumber}. Staff follow-up is required.`,
  },
});

function normalizeText(value) {
  return String(value ?? "").trim();
}

function resolveOrderNumber(businessEvent = {}, notification = {}) {
  return normalizeText(
    businessEvent.payload?.legacyNotificationContext?.orderNumber ||
      (businessEvent.subject_type === "order" && businessEvent.subject_id) ||
      (notification.subject_type === "order" && notification.subject_id)
  );
}

function validateClaimedStaffDelivery(delivery = {}) {
  if (delivery.channel !== "staff") {
    throw new Error("Staff adapter accepts only staff-channel Deliveries.");
  }
  if (
    delivery.status !== "processing" ||
    !normalizeText(delivery.claim_token)
  ) {
    throw new Error("Staff adapter requires a currently claimed Delivery.");
  }
  if (delivery.destination_snapshot?.observationOnly !== true) {
    throw new Error("Staff adapter is restricted to observation-only Deliveries.");
  }
}

export function buildStaffInboxAdapterRequest({
  delivery,
  notification,
  businessEvent,
}) {
  validateClaimedStaffDelivery(delivery);
  if (
    !notification?.id ||
    delivery.notification_id !== notification.id ||
    notification.business_event_id !== businessEvent?.id
  ) {
    throw new Error("Staff adapter received an inconsistent identity envelope.");
  }
  const presentation = STAFF_EVENT_PRESENTATION[notification?.event_type];
  if (!presentation) {
    throw new Error(
      `No Staff Inbox presentation exists for ${notification?.event_type || "unknown event"}.`
    );
  }

  const orderNumber = resolveOrderNumber(businessEvent, notification);
  if (!orderNumber) {
    throw new Error("Staff adapter could not resolve an order number.");
  }

  const attemptNumber = Math.max(0, Number(delivery.attempt_count) || 0) + 1;
  const attemptId = buildDeliveryAttemptIdentity(delivery.id, attemptNumber);
  return {
    id: `staff-notif:${delivery.id}`,
    type: presentation.type,
    orderNumber,
    assignedToStaffId: delivery.recipient_snapshot?.id || "",
    assignedToStaffName: delivery.recipient_snapshot?.name || "",
    description: presentation.description(orderNumber),
    linkTo: `/admin/orders/${orderNumber}`,
    businessEventId: businessEvent.id,
    notificationId: notification.id,
    deliveryId: delivery.id,
    deliveryAttemptId: attemptId,
    attemptId,
    attemptNumber,
  };
}

export async function runStaffInternalAdapterObservation({
  workerId,
  limit = 25,
  leaseSeconds = 60,
  recoveryLimit = 100,
  dispatcherClient,
  staffInboxClient,
  now = () => new Date(),
}) {
  if (!normalizeText(workerId)) {
    throw new Error("Staff adapter dispatcher worker id is required.");
  }

  const recovered =
    (await recoverAbandonedObservationClaims(
      { limit: recoveryLimit },
      dispatcherClient
    )) || [];
  const claimed =
    (await claimStaffObservationDeliveries(
      { workerId, limit, leaseSeconds },
      dispatcherClient
    )) || [];
  const results = [];

  for (const envelope of claimed) {
    const delivery = envelope.delivery;
    const notification = envelope.notification;
    const businessEvent = envelope.business_event;
    const request = buildStaffInboxAdapterRequest({
      delivery,
      notification,
      businessEvent,
    });
    const startedAt = delivery.claimed_at;
    const completedAt = now().toISOString();
    const staffNotification = await createStaffNotificationFromAdapter(
      {
        ...request,
        createdAt: completedAt,
      },
      staffInboxClient
    );
    const completedDelivery = await completeStaffObservationDelivery(
      {
        deliveryId: delivery.id,
        claimToken: delivery.claim_token,
        attemptId: request.attemptId,
        attemptNumber: request.attemptNumber,
        staffNotificationId: staffNotification.id,
        startedAt,
        completedAt,
      },
      dispatcherClient
    );
    results.push({
      delivery: completedDelivery,
      attemptId: request.attemptId,
      staffNotification,
    });
  }

  return {
    observationOnly: true,
    recoveredCount: recovered.length,
    claimedCount: claimed.length,
    completedCount: results.length,
    results,
  };
}
