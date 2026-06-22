const DEFAULT_PAYMENT_PROVIDER = "manual";
const SUPPORTED_PAYMENT_PROVIDERS = new Set(["manual", "stripe", "clover", "square"]);

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function moneyValue(...values) {
  for (const value of values) {
    const amount =
      typeof value === "number"
        ? value
        : typeof value === "string"
        ? Number(value.replace(/[^0-9.-]/g, ""))
        : NaN;

    if (Number.isFinite(amount)) {
      return Math.max(0, Math.round(amount * 100) / 100);
    }
  }

  return 0;
}

function envValue(key) {
  return normalizeText(import.meta.env?.[key]);
}

export function normalizeDepositPaymentProvider(provider) {
  const normalized = normalizeLower(provider || envValue("VITE_TEE_CO_PAYMENT_PROVIDER"));
  return SUPPORTED_PAYMENT_PROVIDERS.has(normalized) ? normalized : DEFAULT_PAYMENT_PROVIDER;
}

export function getDepositPaymentProviderConfig(order = {}) {
  const provider = normalizeDepositPaymentProvider(
    order.payment_provider || order.deposit_payment_provider
  );
  const contactEmail =
    normalizeText(order.payment_contact_email) ||
    envValue("VITE_TEE_CO_PAYMENT_CONTACT_EMAIL") ||
    "orders@teeandco.ca";
  const contactPhone =
    normalizeText(order.payment_contact_phone) ||
    envValue("VITE_TEE_CO_PAYMENT_CONTACT_PHONE");
  const eTransferInstructions =
    normalizeText(order.etransfer_instructions) ||
    normalizeText(order.e_transfer_instructions) ||
    envValue("VITE_TEE_CO_ETRANSFER_INSTRUCTIONS");
  const manualInstructions =
    normalizeText(order.deposit_payment_instructions) ||
    normalizeText(order.payment_instructions) ||
    envValue("VITE_TEE_CO_MANUAL_PAYMENT_INSTRUCTIONS") ||
    "Contact Tee & Co to arrange deposit payment.";

  return {
    provider,
    contactEmail,
    contactPhone,
    eTransferInstructions,
    manualInstructions,
    supportsCustomerConfirmation: provider === "manual",
  };
}

export function resolveDepositAmount(order = {}) {
  return moneyValue(order.deposit_amount, order.deposit?.amount, order.required_deposit_amount);
}

export function resolveRemainingBalanceAfterDeposit(order = {}) {
  const total = moneyValue(order.total_amount, order.total, order.order_total, order.grand_total);
  const totalPaid = moneyValue(order.total_paid, order.paid_amount);
  const depositAmount = resolveDepositAmount(order);
  const balanceDue = moneyValue(order.balance_due);

  if (total > 0) {
    return Math.max(0, Math.round((total - totalPaid - depositAmount) * 100) / 100);
  }

  return balanceDue;
}

function hasDepositActionStatus(value) {
  const normalized = normalizeLower(value);
  return (
    normalized === "deposit requested" ||
    normalized === "awaiting deposit" ||
    normalized === "payment due"
  );
}

function hasSatisfiedDepositStatus(value) {
  const normalized = normalizeLower(value);
  return (
    normalized === "deposit received" ||
    normalized === "deposit paid" ||
    normalized === "paid" ||
    normalized === "not required" ||
    normalized === "deposit not required"
  );
}

export function isDepositActionRequired(order = {}) {
  const depositStatus = normalizeText(order.deposit_workflow_status || order.deposit?.status);
  const quoteStatus = normalizeText(order.quote_status);
  const invoiceStatus = normalizeText(order.invoice_status);
  const paymentStatus = normalizeText(order.payment_status || order.payment_collection_state);
  const depositRequirement = normalizeLower(order.deposit_requirement || order.deposit_requirement_status);
  const depositAmount = resolveDepositAmount(order);

  if (
    hasSatisfiedDepositStatus(depositStatus) ||
    hasSatisfiedDepositStatus(invoiceStatus) ||
    hasSatisfiedDepositStatus(paymentStatus)
  ) {
    return false;
  }

  if (
    [depositStatus, quoteStatus, invoiceStatus, paymentStatus].some(hasDepositActionStatus)
  ) {
    return true;
  }

  return (
    order.deposit_required === true &&
    depositAmount > 0 &&
    depositRequirement !== "undecided" &&
    depositRequirement !== "not required"
  );
}

export function buildDepositPaymentRoute(orderNumber) {
  return `/portal/orders/${encodeURIComponent(orderNumber || "")}/deposit`;
}

export function buildDepositContactHref(order = {}, providerConfig = getDepositPaymentProviderConfig(order)) {
  const orderNumber = normalizeText(order.order_number || order.id || "your order");
  const subject = `Deposit question for ${orderNumber}`;
  const body = `Hi Tee & Co,%0D%0A%0D%0AI have a question about the deposit for ${orderNumber}.%0D%0A%0D%0A`;

  return `mailto:${providerConfig.contactEmail}?subject=${encodeURIComponent(subject)}&body=${body}`;
}
