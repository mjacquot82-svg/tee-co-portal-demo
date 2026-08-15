const SUCCESSFUL_PAYMENT_STATUSES = new Set([
  "approved",
  "captured",
  "completed",
  "paid",
  "settled",
  "succeeded",
  "success",
]);

const NON_SUCCESSFUL_PAYMENT_STATUSES = new Set([
  "canceled",
  "cancelled",
  "declined",
  "failed",
  "pending",
  "processing",
  "refunded",
  "voided",
]);

export function normalizePaymentStatus(status) {
  return String(status || "").trim().toLowerCase();
}

export function isSuccessfulPaymentStatus(status) {
  return SUCCESSFUL_PAYMENT_STATUSES.has(normalizePaymentStatus(status));
}

export function isNonSuccessfulPaymentStatus(status) {
  return NON_SUCCESSFUL_PAYMENT_STATUSES.has(normalizePaymentStatus(status));
}

export function isSuccessfulPaymentRecord(payment = {}) {
  return isSuccessfulPaymentStatus(payment.status || payment.provider_status);
}
