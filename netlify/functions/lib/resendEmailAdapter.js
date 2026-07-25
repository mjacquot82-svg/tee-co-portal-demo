const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Tee & Co <orders@teeandco.ca>";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function classifyFailure(status) {
  if (status === 429 || status >= 500) return "retryable";
  if (status >= 400) return "terminal";
  return "unknown";
}

function validateRequest(request = {}) {
  const to = normalizeText(request.destination?.email);
  const subject = normalizeText(request.content?.subject);
  const body = normalizeText(request.content?.body);
  const idempotencyKey = normalizeText(request.idempotencyKey);
  if (!to || !subject || !body || !idempotencyKey) {
    throw new Error(
      "Email adapter requires destination, subject, body, and idempotency identity."
    );
  }
  return { to, subject, body, idempotencyKey };
}

export function getConfiguredResendSender(env = process.env) {
  return normalizeText(env.CUSTOMER_NOTIFICATION_FROM_EMAIL) || DEFAULT_FROM;
}

export function createResendEmailAdapter({
  apiKey = process.env.RESEND_API_KEY,
  from = getConfiguredResendSender(),
  fetchImpl = globalThis.fetch,
} = {}) {
  const configuredApiKey = normalizeText(apiKey);
  const configuredFrom = normalizeText(from) || DEFAULT_FROM;

  return {
    key: "resend",
    channel: "email",
    sender: configuredFrom,
    async send(request) {
      const { to, subject, body, idempotencyKey } = validateRequest(request);
      if (!configuredApiKey || typeof fetchImpl !== "function") {
        return {
          ok: false,
          status: "failed",
          retryability: "terminal",
          providerMessageId: "",
          failureCode: "resend_not_configured",
          failureReason: "Customer email delivery is not configured.",
          httpStatus: 503,
          providerMetadata: {},
        };
      }

      try {
        const response = await fetchImpl(RESEND_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${configuredApiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            from: configuredFrom,
            to: [to],
            subject,
            text: body,
          }),
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          return {
            ok: false,
            status: "failed",
            retryability: classifyFailure(response.status),
            providerMessageId: normalizeText(result.id),
            failureCode: normalizeText(result.name) || "resend_rejected",
            failureReason:
              normalizeText(result.message) ||
              "Email provider rejected the request.",
            httpStatus: response.status,
            providerMetadata: {
              httpStatus: response.status,
            },
          };
        }

        return {
          ok: true,
          status: "sent",
          retryability: "terminal",
          providerMessageId: normalizeText(result.id),
          failureCode: "",
          failureReason: "",
          httpStatus: response.status,
          providerMetadata: {
            httpStatus: response.status,
          },
        };
      } catch (error) {
        return {
          ok: false,
          status: "failed",
          retryability: "indeterminate",
          providerMessageId: "",
          failureCode: "resend_transport_error",
          failureReason:
            normalizeText(error?.message) || "Email provider request failed.",
          httpStatus: 502,
          providerMetadata: {},
        };
      }
    },
  };
}
