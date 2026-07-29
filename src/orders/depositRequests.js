import { formatShortDate } from "../lib/dateFormatting";
import {
  createPaymentRequestPersisted,
  getStoredPaymentRequests,
  notifyDepositPaymentRequestReady,
} from "../lib/paymentsStore";
import { sendSquarePaymentRequest } from "../services/squareService";

const activeDepositRequestPromises = new Map();
const ACTIVE_UNPAID_STATUSES = new Set([
  "open",
  "sent",
  "processing",
  "partially_paid",
]);

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function normalizeText(value, fallback = "") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
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

function firstPositiveMoneyValue(...values) {
  for (const value of values) {
    const amount = moneyValue(value);

    if (amount > 0) {
      return amount;
    }
  }

  return 0;
}

export function buildDepositRequestContent(order = {}, options = {}) {
  const customerName = String(order.customer_name || "Customer").trim() || "Customer";
  const orderNumber = order.order_number || "Order";
  const depositAmount = money(order.deposit_amount);
  const remainingBalance = money(order.balance_due);
  const checkoutUrl = normalizeText(options.checkoutUrl || options.provider_checkout_url);
  const dueDateLine = order.due_date
    ? `Due Date: ${formatShortDate(order.due_date)}\n`
    : "";
  const subject = `Deposit Request for Order #${orderNumber}`;
  const body = [
    `Hello ${customerName},`,
    "",
    `A deposit is requested for your Tee & Co order #${orderNumber}.`,
    "",
    `Deposit Requested: ${depositAmount}`,
    `Remaining Balance: ${remainingBalance}`,
    dueDateLine ? dueDateLine.trimEnd() : "",
    checkoutUrl ? `Pay online: ${checkoutUrl}` : "",
    "",
    "Please contact us if you have any questions regarding your order.",
    "",
    "Thank you,",
    "Tee & Co",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    body,
    fullMessage: `Subject: ${subject}\n\n${body}`,
  };
}

export function buildDepositRequestMailto(order = {}, options = {}) {
  const { subject, body } = buildDepositRequestContent(order, options);
  const emailAddress = String(order.customer_email || "").trim();
  return `mailto:${encodeURIComponent(emailAddress)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function createAndSendDepositPaymentRequestForOrder(order = {}, requestDetails = {}, options = {}) {
  const orderIdentity = normalizeText(order.id || order.order_number);
  const pendingRequest = activeDepositRequestPromises.get(orderIdentity);
  if (pendingRequest) return pendingRequest;

  const operation = createAndSendDepositPaymentRequestForOrderOnce(
    order,
    requestDetails,
    options
  );
  if (!orderIdentity) return operation;

  activeDepositRequestPromises.set(orderIdentity, operation);
  try {
    return await operation;
  } finally {
    if (activeDepositRequestPromises.get(orderIdentity) === operation) {
      activeDepositRequestPromises.delete(orderIdentity);
    }
  }
}

async function createAndSendDepositPaymentRequestForOrderOnce(
  order = {},
  requestDetails = {},
  options = {}
) {
  const amountRequested = firstPositiveMoneyValue(order.deposit_amount, order.deposit?.amount, order.balance_due);
  if (amountRequested <= 0) {
    throw new Error("Deposit amount is required before creating a Square checkout request.");
  }

  const existingActiveRequest = getStoredPaymentRequests().find((request) => {
    const sameOrder =
      (order.id && request.order_id === order.id) ||
      (order.order_number && request.order_number === order.order_number);
    const outstanding =
      moneyValue(request.amount_paid) < moneyValue(request.amount_requested);
    return (
      sameOrder &&
      normalizeText(request.request_type).toLowerCase() === "deposit" &&
      ACTIVE_UNPAID_STATUSES.has(normalizeText(request.status).toLowerCase()) &&
      outstanding
    );
  });

  if (existingActiveRequest?.provider_checkout_url) {
    return {
      paymentRequest: existingActiveRequest,
      providerLink: {
        provider: existingActiveRequest.payment_provider || "square",
        provider_checkout_url: existingActiveRequest.provider_checkout_url,
        provider_payment_link_id:
          existingActiveRequest.provider_payment_link_id || "",
        provider_order_id: existingActiveRequest.provider_order_id || "",
        metadata: { mode: "existing_active_request" },
      },
      reused: true,
    };
  }

  const paymentRequest = existingActiveRequest || await createPaymentRequestPersisted({
    customer_id: order.customer_id || "",
    order_id: order.id || "",
    order_number: order.order_number || "",
    quote_id: order.operational_visible === false ? order.id || order.order_number || "" : "",
    request_type: "deposit",
    status: "open",
    amount_requested: amountRequested,
    amount_paid: 0,
    currency: "CAD",
    description: "Deposit request",
    customer_message: normalizeText(requestDetails.body),
    payment_provider: "manual",
    created_by_staff_user_id: options.staffUserId || "",
    metadata: {
      source: "order_financial_summary",
      customer_name: normalizeText(order.customer_name, "Customer"),
      request_channel: normalizeText(requestDetails.channel),
    },
  });

  const result = await sendSquarePaymentRequest(paymentRequest, {
    ...(options.squareSendOptions || {}),
    awaitPersistence: true,
  });
  await notifyDepositPaymentRequestReady(result.paymentRequest);
  return {
    ...result,
    reused: Boolean(existingActiveRequest),
  };
}
