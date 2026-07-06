function normalizeText(value, fallback = "") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeAmount(value) {
  const amount = typeof value === "number" ? value : Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

export function formatMoney(value) {
  return `$${normalizeAmount(value).toFixed(2)}`;
}

export function buildDepositWorkflowLabel(record = {}) {
  const deposit = record.deposit && typeof record.deposit === "object" ? record.deposit : {};
  const amount = normalizeAmount(
    record.deposit_amount ||
      deposit.amount ||
      record.amount_requested ||
      record.deposit_paid_amount ||
      record.deposit_applied
  );
  const applied = normalizeAmount(record.deposit_applied || record.deposit_paid_amount || deposit.paid_amount);
  const status = normalizeLower(
    record.deposit_workflow_status ||
      deposit.status ||
      record.deposit_status ||
      record.payment_collection_state
  );
  const requested =
    status.includes("requested") ||
    status.includes("awaiting deposit") ||
    Boolean(deposit.requested_at || deposit.payment_request_id || record.payment_request_id || record.provider_checkout_url);
  const received =
    status.includes("received") ||
    status === "paid" ||
    (amount > 0 && applied >= amount);

  if (received) return amount > 0 ? `${formatMoney(amount)} Received` : "Deposit Received";
  if (status.includes("not required")) return "Deposit Not Required";
  if (requested) return amount > 0 ? `${formatMoney(amount)} Requested` : "Deposit Requested";
  return "Deposit Not Requested";
}
