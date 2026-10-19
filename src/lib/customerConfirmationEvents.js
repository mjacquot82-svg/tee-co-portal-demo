// Customer confirmation emails for actions the customer takes themselves (approval page and portal).
// Shared by the browser (to announce the event) and by notification-event-accept (to check it).
// Plain module: no browser or Vite-only APIs.

export const CUSTOMER_CONFIRMATION_EVENT_TYPES = Object.freeze({
  approvalChangesRequested: "approval_changes_requested",
  depositSentNoted: "deposit_sent_noted",
  artworkUploaded: "artwork_uploaded",
  artworkUploadLater: "artwork_upload_later",
  artworkHelpRequested: "artwork_help_requested",
});

export const CUSTOMER_CONFIRMATION_EVENTS = Object.freeze(Object.values(CUSTOMER_CONFIRMATION_EVENT_TYPES));

// Portal order action -> confirmation email event.
export const CUSTOMER_ACTION_CONFIRMATION_EVENTS = Object.freeze({
  deposit_sent: CUSTOMER_CONFIRMATION_EVENT_TYPES.depositSentNoted,
  artwork_uploaded: CUSTOMER_CONFIRMATION_EVENT_TYPES.artworkUploaded,
  artwork_upload_later: CUSTOMER_CONFIRMATION_EVENT_TYPES.artworkUploadLater,
  artwork_help: CUSTOMER_CONFIRMATION_EVENT_TYPES.artworkHelpRequested,
});

const text = (value) => String(value ?? "").trim();

// One email per real order change: the occurrence carries the order's updated_at at the moment of
// the action, so retries of the same event are ignored by the existing unique key and a forged
// event cannot be replayed once the order changes again.
export function buildCustomerConfirmationOccurrenceId(eventType, orderNumber, stamp) {
  return `${text(eventType)}:${text(orderNumber)}:${text(stamp)}`;
}

export function parseCustomerConfirmationOccurrenceId(eventType, orderNumber, occurrenceId) {
  const prefix = `${text(eventType)}:${text(orderNumber)}:`;
  const value = text(occurrenceId);
  return value.startsWith(prefix) ? value.slice(prefix.length) : "";
}

export function sameInstant(left, right) {
  const a = Date.parse(text(left));
  const b = Date.parse(text(right));
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function snapshotOf(order = {}) {
  const quote = order.quote && typeof order.quote === "object" ? order.quote : {};
  const snapshot = quote.__tee_co_order_snapshot;
  return snapshot && typeof snapshot === "object" ? snapshot : {};
}

// Does the stored order really show the state this confirmation describes?
export function orderMatchesConfirmation(eventType, order = {}) {
  const snapshot = snapshotOf(order);
  const deposit = order.deposit_details && typeof order.deposit_details === "object" ? order.deposit_details : {};
  const artworkStatus = text(order.artwork_status || snapshot.artwork_status);
  switch (eventType) {
    case CUSTOMER_CONFIRMATION_EVENT_TYPES.approvalChangesRequested:
      return text(order.approval_status || snapshot.approval_status) === "Customer Requested Changes";
    case CUSTOMER_CONFIRMATION_EVENT_TYPES.depositSentNoted:
      return (
        text(deposit.customer_confirmation_status).toLowerCase() === "sent" ||
        text(snapshot.deposit_customer_confirmation_status).toLowerCase() === "sent"
      );
    case CUSTOMER_CONFIRMATION_EVENT_TYPES.artworkUploaded:
      return artworkStatus ? artworkStatus === "Pending Review" : text(snapshot.artwork_requirement) === "Uploaded";
    case CUSTOMER_CONFIRMATION_EVENT_TYPES.artworkUploadLater:
      return artworkStatus ? artworkStatus === "Missing" : text(snapshot.artwork_requirement) === "Upload Later";
    case CUSTOMER_CONFIRMATION_EVENT_TYPES.artworkHelpRequested:
      return artworkStatus ? artworkStatus === "Help Requested" : text(snapshot.artwork_requirement) === "Help Needed";
    default:
      return false;
  }
}
