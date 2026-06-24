/* global process */

const SQUARE_VERSION = "2024-06-04";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function normalizeText(value, fallback = "") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function normalizeAmount(value) {
  const amount = typeof value === "number" ? value : Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

function toMoneyAmount(value) {
  return Math.round(normalizeAmount(value) * 100);
}

function squareApiBaseUrl() {
  return normalizeText(process.env.SQUARE_ENVIRONMENT).toLowerCase() === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

function buildSquarePayload(input = {}) {
  const currency = normalizeText(input.currency, "CAD").toUpperCase();
  const description = normalizeText(input.description, "Tee & Co payment request");

  return {
    idempotency_key: normalizeText(input.idempotency_key),
    order: {
      location_id: normalizeText(process.env.SQUARE_LOCATION_ID),
      reference_id: normalizeText(input.payment_request_id || input.request_number),
      line_items: [
        {
          name: description.slice(0, 120),
          quantity: "1",
          base_price_money: {
            amount: toMoneyAmount(input.amount),
            currency,
          },
        },
      ],
      metadata: {
        payment_request_id: normalizeText(input.payment_request_id),
        request_number: normalizeText(input.request_number),
        order_number: normalizeText(input.order_number),
        customer_id: normalizeText(input.customer_id),
        request_type: normalizeText(input.request_type),
      },
    },
    checkout_options: {
      ask_for_shipping_address: false,
    },
  };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const accessToken = normalizeText(process.env.SQUARE_ACCESS_TOKEN);
  const locationId = normalizeText(process.env.SQUARE_LOCATION_ID);

  if (!accessToken || !locationId) {
    return json(501, {
      error: "Square payment links are not configured.",
      message: "Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID to enable live Square payment link creation.",
    });
  }

  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  if (!normalizeText(input.idempotency_key)) {
    return json(400, { error: "Missing idempotency_key." });
  }

  if (toMoneyAmount(input.amount) <= 0) {
    return json(400, { error: "Payment link amount must be greater than zero." });
  }

  const squareResponse = await fetch(`${squareApiBaseUrl()}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
    body: JSON.stringify(buildSquarePayload(input)),
  });

  const data = await squareResponse.json().catch(() => ({}));

  if (!squareResponse.ok) {
    return json(squareResponse.status, {
      error: "Square payment link creation failed.",
      message: data?.errors?.[0]?.detail || data?.errors?.[0]?.code || "Square rejected the payment link request.",
      square_errors: data?.errors || [],
    });
  }

  return json(200, {
    mode: normalizeText(process.env.SQUARE_ENVIRONMENT, "sandbox"),
    idempotency_key: normalizeText(input.idempotency_key),
    payment_link: data.payment_link,
    related_resources: data.related_resources || {},
  });
}
