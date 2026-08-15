import {
  recordPaymentEvent,
  updatePaymentRequest,
  updatePaymentRequestPersisted,
} from "../lib/paymentsStore";
import { buildCanonicalUrl } from "../lib/siteUrl";
import { supabase } from "../lib/supabaseClient";

const DEFAULT_PAYMENT_LINK_ENDPOINT = "/.netlify/functions/square-payment-link";

function normalizeText(value, fallback = "") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function normalizeAmount(value) {
  const amount = typeof value === "number" ? value : Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

function getEnvValue(key) {
  return normalizeText(import.meta.env?.[key]);
}

function getPaymentLinkEndpoint() {
  return getEnvValue("VITE_SQUARE_PAYMENT_LINK_ENDPOINT") || DEFAULT_PAYMENT_LINK_ENDPOINT;
}

function canUseLocalFallback(options = {}) {
  if (options.useLocalFallback) return true;
  return getEnvValue("VITE_SQUARE_ALLOW_LOCAL_FALLBACK").toLowerCase() === "true";
}

function safeSlug(value) {
  return normalizeText(value, "payment-request")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "payment-request";
}

function buildIdempotencyKey(paymentRequest = {}) {
  return (
    normalizeText(paymentRequest.metadata?.square_payment_link_idempotency_key) ||
    `square-payment-link:${paymentRequest.id || paymentRequest.request_number}`
  );
}

function buildLocalPaymentLink(paymentRequest = {}) {
  const token = safeSlug(paymentRequest.id || paymentRequest.request_number);
  const now = new Date().toISOString();

  return {
    provider: "square",
    provider_checkout_url: `https://square.link/u/${token}`,
    provider_payment_link_id: `local-${token}`,
    provider_order_id: `local-order-${token}`,
    provider_status: "created",
    link_created_at: now,
    idempotency_key: buildIdempotencyKey(paymentRequest),
    metadata: {
      mode: "local_fallback",
      generated_at: now,
    },
  };
}

function normalizeSquarePaymentLinkResponse(response = {}, paymentRequest = {}) {
  const paymentLink = response.payment_link || response.paymentLink || response;
  const relatedResources = response.related_resources || response.relatedResources || {};
  const relatedOrder =
    relatedResources.order ||
    relatedResources.orders?.[0] ||
    relatedResources.orders?.[paymentLink.order_id] ||
    null;
  const now = new Date().toISOString();
  const checkoutUrl =
    normalizeText(paymentLink.url) ||
    normalizeText(paymentLink.checkout_url) ||
    normalizeText(paymentLink.checkoutUrl) ||
    normalizeText(paymentLink.long_url);
  const paymentLinkId = normalizeText(paymentLink.id || paymentLink.payment_link_id || paymentLink.paymentLinkId);
  const orderId = normalizeText(
    paymentLink.order_id ||
      paymentLink.orderId ||
      response.order_id ||
      response.orderId ||
      relatedOrder?.id
  );
  const status = normalizeText(paymentLink.status || paymentLink.state || response.status || response.state, "created");

  let parsedCheckoutUrl;
  try {
    parsedCheckoutUrl = new URL(checkoutUrl);
  } catch {
    parsedCheckoutUrl = null;
  }

  if (
    !parsedCheckoutUrl ||
    parsedCheckoutUrl.protocol !== "https:" ||
    !parsedCheckoutUrl.hostname
  ) {
    throw new Error(
      "Square payment link response did not include a valid HTTPS checkout URL."
    );
  }

  return {
    provider: "square",
    provider_checkout_url: parsedCheckoutUrl.toString(),
    provider_payment_link_id: paymentLinkId,
    provider_order_id: orderId,
    provider_status: status,
    link_created_at: normalizeText(paymentLink.created_at || paymentLink.createdAt || response.created_at) || now,
    idempotency_key: normalizeText(response.idempotency_key) || buildIdempotencyKey(paymentRequest),
    metadata: {
      mode: normalizeText(response.mode, "square"),
      raw: response,
    },
  };
}

export function hasProviderCheckoutUrl(paymentRequest = {}) {
  const checkoutUrl = normalizeText(paymentRequest.provider_checkout_url);
  const paymentLinkId = normalizeText(paymentRequest.provider_payment_link_id);
  const providerOrderId = normalizeText(paymentRequest.provider_order_id);
  const linkMode = normalizeText(paymentRequest.metadata?.square_payment_link?.metadata?.mode);
  const isLocalFallback =
    paymentLinkId.startsWith("local-") ||
    providerOrderId.startsWith("local-order-") ||
    linkMode === "local_fallback";

  return /^https?:\/\//i.test(checkoutUrl) && !isLocalFallback;
}

export function buildSquarePaymentLinkPayload(paymentRequest = {}) {
  const amountRequested = normalizeAmount(paymentRequest.amount_requested);
  const remainingAmount = Math.max(0, amountRequested - normalizeAmount(paymentRequest.amount_paid));
  const amount = remainingAmount || amountRequested;

  return {
    idempotency_key: buildIdempotencyKey(paymentRequest),
    payment_request_id: paymentRequest.id,
    request_number: paymentRequest.request_number,
    order_number: paymentRequest.order_number,
    customer_id: paymentRequest.customer_id,
    request_type: paymentRequest.request_type,
    amount,
    currency: normalizeText(paymentRequest.currency, "CAD").toUpperCase(),
    description:
      normalizeText(paymentRequest.description) ||
      `Tee & Co payment request ${paymentRequest.request_number || ""}`.trim(),
    customer_message: normalizeText(paymentRequest.customer_message),
    redirect_url: buildCanonicalUrl("/portal/payments"),
    metadata: {
      source: "tee_co_payment_request",
      payment_request_id: paymentRequest.id,
      request_number: paymentRequest.request_number,
      order_number: paymentRequest.order_number,
      request_type: paymentRequest.request_type,
    },
  };
}

export async function createSquarePaymentLink(paymentRequest = {}, options = {}) {
  if (hasProviderCheckoutUrl(paymentRequest) && paymentRequest.provider_payment_link_id) {
    return {
      provider: "square",
      provider_checkout_url: paymentRequest.provider_checkout_url,
      provider_payment_link_id: paymentRequest.provider_payment_link_id,
      provider_order_id: paymentRequest.provider_order_id || "",
      provider_status: paymentRequest.metadata?.square_payment_link?.status || "created",
      link_created_at: paymentRequest.metadata?.square_payment_link?.created_at || paymentRequest.updated_at || "",
      idempotency_key: buildIdempotencyKey(paymentRequest),
      metadata: {
        mode: "existing",
      },
    };
  }

  const endpoint = options.endpoint || getPaymentLinkEndpoint();
  const fetcher = options.fetcher || fetch;
  const payload = buildSquarePaymentLinkPayload(paymentRequest);

  if (!endpoint || options.useLocalFallback) {
    return buildLocalPaymentLink(paymentRequest);
  }

  try {
    let accessToken = normalizeText(options.accessToken);
    if (!accessToken && supabase) {
      const session = await supabase.auth.getSession();
      accessToken = normalizeText(session.data?.session?.access_token);
    }
    if (!accessToken && !options.fetcher) {
      throw new Error("An authenticated operational session is required to create a Square payment link.");
    }
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || data?.error || `Square payment link request failed with ${response.status}.`);
    }

    return normalizeSquarePaymentLinkResponse(data, paymentRequest);
  } catch (error) {
    if (options.disableFallback || !canUseLocalFallback(options)) {
      throw error;
    }

    const fallback = buildLocalPaymentLink(paymentRequest);
    return {
      ...fallback,
      metadata: {
        ...fallback.metadata,
        fallback_reason: error instanceof Error ? error.message : "Square payment link request failed.",
      },
    };
  }
}

export function buildSquarePaymentRequestUpdates(paymentRequest = {}, squareLink = {}) {
  const existingMetadata = paymentRequest.metadata && typeof paymentRequest.metadata === "object"
    ? paymentRequest.metadata
    : {};
  const linkCreatedAt = squareLink.link_created_at || new Date().toISOString();

  return {
    payment_provider: "square",
    provider_checkout_url: squareLink.provider_checkout_url,
    provider_order_id: squareLink.provider_order_id || "",
    provider_payment_link_id: squareLink.provider_payment_link_id || "",
    metadata: {
      ...existingMetadata,
      square_payment_link_idempotency_key: squareLink.idempotency_key || buildIdempotencyKey(paymentRequest),
      square_payment_link: {
        id: squareLink.provider_payment_link_id || "",
        order_id: squareLink.provider_order_id || "",
        checkout_url: squareLink.provider_checkout_url,
        status: squareLink.provider_status || "created",
        created_at: linkCreatedAt,
        metadata: squareLink.metadata || {},
      },
    },
  };
}

export async function sendSquarePaymentRequest(paymentRequest = {}, options = {}) {
  const sentAt = options.sentAt || new Date().toISOString();
  const providerLink = await createSquarePaymentLink(paymentRequest, options.squareLinkOptions || {});
  const linkUpdates = buildSquarePaymentRequestUpdates(paymentRequest, providerLink);

  recordPaymentEvent({
    payment_request_id: paymentRequest.id,
    order_number: paymentRequest.order_number,
    event_type: "square_payment_link_created",
    event_source: "system",
    summary: `Square payment link created for ${paymentRequest.request_number}.`,
    payload: { providerLink },
    created_at: sentAt,
  });

  const updateRequest = options.awaitPersistence ? updatePaymentRequestPersisted : updatePaymentRequest;
  const updatedRequest = await updateRequest(paymentRequest.id, {
    ...linkUpdates,
    status: "sent",
    sent_at: sentAt,
  });

  recordPaymentEvent({
    payment_request_id: paymentRequest.id,
    order_number: paymentRequest.order_number,
    event_type: "payment_request_sent",
    event_source: "staff",
    summary: `Payment request ${paymentRequest.request_number} marked sent to customer.`,
    created_at: sentAt,
  });

  return {
    paymentRequest: updatedRequest,
    providerLink,
  };
}
