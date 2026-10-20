// Announces customer confirmation emails to the existing notification pipeline
// (notification-event-accept -> notification_business_events -> notifications -> deliveries).
// Fire-and-forget: a failure here is logged and never blocks or undoes the customer's action.
import { acceptNotificationBusinessEventDurably } from "./notificationBusinessEventAcceptance";
import {
  CUSTOMER_ACTION_CONFIRMATION_EVENTS,
  CUSTOMER_CONFIRMATION_EVENT_TYPES,
  buildCustomerConfirmationOccurrenceId,
} from "./customerConfirmationEvents";

let testFetch = null;
export function configureCustomerConfirmationNotificationsForTests({ fetchImpl = null } = {}) {
  testFetch = fetchImpl;
}

const text = (value) => String(value ?? "").trim();

function buildRow({ eventType, orderNumber, occurrenceId, occurredAt }) {
  return {
    id: `customer-confirmation:${occurrenceId}`,
    event_type: eventType,
    subject_type: "order",
    subject_id: orderNumber,
    occurrence_id: occurrenceId,
    correlation_id: `order:${orderNumber}`,
    source: "customer_confirmation",
    actor_type: "customer",
    actor_id: "",
    // Only the order number travels; the server looks up everything else itself.
    payload: { legacyNotificationContext: { orderNumber, source: "customer_confirmation" } },
    occurred_at: occurredAt,
  };
}

async function announce(row) {
  try {
    const fetchImpl = testFetch || globalThis.fetch;
    await acceptNotificationBusinessEventDurably(row, { fetchImpl });
    return true;
  } catch (error) {
    console.warn("[customer-confirmation] email not queued", row.event_type, error?.message || error);
    return false;
  }
}

// After a portal order action succeeded. `order` is the saved order (its updated_at ties the email
// to this exact change).
export function notifyCustomerOrderAction(action, order) {
  const eventType = CUSTOMER_ACTION_CONFIRMATION_EVENTS[action];
  const orderNumber = text(order?.order_number);
  const stamp = text(order?.updated_at);
  if (!eventType || !orderNumber || !stamp) return Promise.resolve(false);
  return announce(
    buildRow({
      eventType,
      orderNumber,
      occurrenceId: buildCustomerConfirmationOccurrenceId(eventType, orderNumber, stamp),
      occurredAt: stamp,
    })
  );
}

// After the public approval page recorded a decision. `approval` is the page data returned by
// submit_order_approval (decided_at is the moment of the decision).
export function notifyApprovalDecision(orderNumber, decision, approval = {}) {
  const number = text(orderNumber);
  const decidedAt = text(approval?.decided_at) || new Date().toISOString();
  if (!number) return Promise.resolve(false);
  if (decision === "approve") {
    // Existing "Order approved" email; one occurrence per order, so a repeat is never sent twice.
    return announce(
      buildRow({ eventType: "quote_approved", orderNumber: number, occurrenceId: `quote_approved:${number}`, occurredAt: decidedAt })
    );
  }
  if (decision === "request_changes") {
    const eventType = CUSTOMER_CONFIRMATION_EVENT_TYPES.approvalChangesRequested;
    return announce(
      buildRow({
        eventType,
        orderNumber: number,
        occurrenceId: buildCustomerConfirmationOccurrenceId(eventType, number, decidedAt),
        occurredAt: decidedAt,
      })
    );
  }
  return Promise.resolve(false);
}
