import { getJsonStorageItem, hasBrowserStorage, setJsonStorageItem } from "./browserStorage";
import { recordPaymentEvent } from "./paymentsStore";

const STORAGE_KEY = "teeCoPaymentReconciliationReviews";

const memoryStore = {
  reviews: [],
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value, fallback = "") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function getStoredReviews() {
  if (!hasBrowserStorage()) return memoryStore.reviews;
  const reviews = getJsonStorageItem(STORAGE_KEY, []);
  return Array.isArray(reviews) ? reviews : [];
}

function saveStoredReviews(reviews) {
  const safeReviews = Array.isArray(reviews) ? reviews : [];
  if (!hasBrowserStorage()) {
    memoryStore.reviews = safeReviews;
    return true;
  }
  return setJsonStorageItem(STORAGE_KEY, safeReviews);
}

export function buildReconciliationReviewKey(paymentRequest = {}, insight = {}) {
  return [
    normalizeText(paymentRequest.id || paymentRequest.request_number, "payment-request"),
    normalizeText(insight.code, "issue"),
    normalizeText(insight.detail, "detail").toLowerCase(),
  ].join(":");
}

export function listPaymentReconciliationReviews() {
  return [...getStoredReviews()].sort(
    (left, right) => new Date(right.updated_at || 0).getTime() - new Date(left.updated_at || 0).getTime()
  );
}

export function getPaymentReconciliationReview(reviewKey) {
  const normalizedKey = normalizeText(reviewKey);
  if (!normalizedKey) return null;
  return getStoredReviews().find((review) => review.review_key === normalizedKey) || null;
}

export function upsertPaymentReconciliationReview({
  reviewKey,
  paymentRequest = {},
  insight = {},
  action = "reviewed",
  note = "",
  staffUserId = "",
} = {}) {
  const normalizedReviewKey = normalizeText(reviewKey);
  if (!normalizedReviewKey) return null;

  const timestamp = nowIso();
  const current = getStoredReviews();
  const existing = current.find((review) => review.review_key === normalizedReviewKey) || {};
  const nextReview = {
    ...existing,
    id: existing.id || `reconciliation-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    review_key: normalizedReviewKey,
    payment_request_id: paymentRequest.id || existing.payment_request_id || "",
    request_number: paymentRequest.request_number || existing.request_number || "",
    order_number: paymentRequest.order_number || existing.order_number || "",
    issue_code: insight.code || existing.issue_code || "",
    issue_label: insight.label || existing.issue_label || "",
    issue_detail: insight.detail || existing.issue_detail || "",
    action,
    note: normalizeText(note),
    staff_user_id: staffUserId || existing.staff_user_id || "",
    reviewed_at: timestamp,
    created_at: existing.created_at || timestamp,
    updated_at: timestamp,
  };
  const nextReviews = existing.review_key
    ? current.map((review) => (review.review_key === normalizedReviewKey ? nextReview : review))
    : [nextReview, ...current];

  saveStoredReviews(nextReviews);
  recordPaymentEvent({
    payment_request_id: paymentRequest.id || "",
    order_number: paymentRequest.order_number || "",
    event_type: "payment_reconciliation_reviewed",
    event_source: "staff",
    summary: `${nextReview.issue_label || "Payment reconciliation issue"} ${action.replace(/_/g, " ")}.`,
    payload: {
      review: nextReview,
      reconciliation_action: action,
      reconciliation_issue: insight,
    },
    staff_user_id: staffUserId,
    created_at: timestamp,
  });

  return nextReview;
}

export function resetPaymentReconciliationReviewsForTests() {
  saveStoredReviews([]);
}
