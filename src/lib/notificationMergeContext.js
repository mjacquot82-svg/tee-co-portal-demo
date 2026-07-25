export const NOTIFICATION_MERGE_FIELD_NAMES = Object.freeze([
  "customer_name",
  "order_number",
  "quote_total",
  "deposit_amount",
  "balance_due",
  "approval_link",
  "payment_link",
  "pickup_date",
  "company_name",
]);

const ALL_FIELDS = [...NOTIFICATION_MERGE_FIELD_NAMES];

export const NOTIFICATION_EVENT_MERGE_RULES = Object.freeze({
  new_customer_request: {
    required: ["customer_name", "company_name"],
  },
  quote_ready_for_approval: {
    required: [
      "customer_name",
      "order_number",
      "quote_total",
      "approval_link",
      "company_name",
    ],
  },
  quote_approved: {
    required: ["customer_name", "order_number", "company_name"],
  },
  artwork_revision_requested: {
    required: ["customer_name", "order_number", "approval_link", "company_name"],
  },
  artwork_approved: {
    required: ["customer_name", "order_number", "company_name"],
  },
  deposit_requested: {
    required: [
      "customer_name",
      "order_number",
      "deposit_amount",
      "payment_link",
      "company_name",
    ],
  },
  payment_request_created: {
    required: [
      "customer_name",
      "order_number",
      "deposit_amount",
      "payment_link",
      "company_name",
    ],
  },
  payment_received: {
    required: [
      "customer_name",
      "order_number",
      "deposit_amount",
      "balance_due",
      "company_name",
    ],
  },
  payment_failed: {
    required: [
      "customer_name",
      "order_number",
      "deposit_amount",
      "payment_link",
      "company_name",
    ],
  },
  order_in_production: {
    required: ["customer_name", "order_number", "company_name"],
  },
  order_ready_for_pickup: {
    required: [
      "customer_name",
      "order_number",
      "pickup_date",
      "balance_due",
      "company_name",
    ],
  },
  order_completed: {
    required: ["customer_name", "order_number", "company_name"],
  },
});

function normalizeText(value) {
  return String(value ?? "").trim();
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function formatCurrency(value) {
  if (value === "" || value === undefined || value === null) return "";
  if (typeof value === "string" && value.trim().startsWith("$")) {
    return value.trim();
  }
  const number = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? `$${Math.max(0, number).toFixed(2)}` : "";
}

export function getNotificationMergeRule(eventType) {
  const configured = NOTIFICATION_EVENT_MERGE_RULES[eventType] || { required: [] };
  const required = [...configured.required];
  return {
    required,
    optional: ALL_FIELDS.filter((field) => !required.includes(field)),
  };
}

export function buildCanonicalNotificationMergeContext(eventType, context = {}) {
  const order = context.order || {};
  const customer = context.customer || {};
  const paymentRequest = context.paymentRequest || {};
  const payment = context.payment || {};
  const overrides =
    context.mergeFields && typeof context.mergeFields === "object"
      ? Object.fromEntries(
          Object.entries(context.mergeFields).map(([key, value]) => [
            String(key).replace(/[{}]/g, "").trim(),
            value,
          ])
        )
      : {};

  return {
    customer_name: normalizeText(
      firstValue(
        overrides.customer_name,
        context.customerName,
        customer.name,
        customer.company,
        order.customer_name,
        paymentRequest.metadata?.customer_name,
        payment.metadata?.customer_name
      )
    ),
    order_number: normalizeText(
      firstValue(
        overrides.order_number,
        context.orderNumber,
        order.order_number,
        paymentRequest.order_number,
        payment.order_number
      )
    ),
    quote_total: formatCurrency(
      firstValue(
        overrides.quote_total,
        context.quoteTotal,
        order.total_amount,
        order.total
      )
    ),
    deposit_amount: formatCurrency(
      firstValue(
        overrides.deposit_amount,
        context.depositAmount,
        order.deposit_amount,
        paymentRequest.amount_requested,
        payment.amount
      )
    ),
    balance_due: formatCurrency(
      firstValue(
        overrides.balance_due,
        context.balanceDue,
        order.balance_due,
        paymentRequest.amount_due
      )
    ),
    approval_link: normalizeText(
      firstValue(
        overrides.approval_link,
        context.approvalLink,
        order.approval_link
      )
    ),
    payment_link: normalizeText(
      firstValue(
        overrides.payment_link,
        context.paymentLink,
        paymentRequest.provider_checkout_url,
        order.payment_link
      )
    ),
    pickup_date: normalizeText(
      firstValue(
        overrides.pickup_date,
        context.pickupDate,
        order.pickup_date,
        order.due_date
      )
    ),
    company_name: normalizeText(
      firstValue(overrides.company_name, context.companyName, "Tee & Co")
    ),
    _event_type: eventType,
  };
}

export function extractNotificationMergeTokens(content = "") {
  return Array.from(
    new Set(
      Array.from(String(content).matchAll(/{{\s*([a-z0-9_]+)\s*}}/gi)).map(
        (match) => match[1].trim()
      )
    )
  );
}

export function validateNotificationMergeContext({
  eventType,
  mergeContext,
  additionalRequiredFields = [],
  renderedContents = [],
}) {
  const rule = getNotificationMergeRule(eventType);
  const requiredFields = Array.from(
    new Set([...rule.required, ...additionalRequiredFields])
  );
  const missingRequiredFields = requiredFields.filter(
    (field) => normalizeText(mergeContext?.[field]) === ""
  );
  const unresolvedTokens = Array.from(
    new Set(
      renderedContents.flatMap((content) =>
        extractNotificationMergeTokens(content)
      )
    )
  );
  const unresolvedRequiredTokens = unresolvedTokens.filter((token) =>
    requiredFields.includes(token)
  );

  return {
    valid:
      missingRequiredFields.length === 0 &&
      unresolvedRequiredTokens.length === 0,
    requiredFields,
    optionalFields: ALL_FIELDS.filter(
      (field) => !requiredFields.includes(field)
    ),
    missingRequiredFields,
    unresolvedTokens,
    unresolvedRequiredTokens,
  };
}

