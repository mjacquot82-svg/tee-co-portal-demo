const TWILIO_API_ROOT = "https://api.twilio.com/2010-04-01";
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const ACCEPTED_MESSAGE_STATUSES = new Set([
  "accepted",
  "queued",
  "sending",
  "sent",
  "delivered",
]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeE164(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const candidate = `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : "";
}

function failureResult({
  retryability,
  failureCode,
  failureReason,
  httpStatus,
  providerMessageId = "",
  providerMetadata = {},
}) {
  return {
    ok: false,
    status: "failed",
    retryability,
    providerMessageId,
    failureCode,
    failureReason,
    httpStatus,
    providerMetadata,
  };
}

function validateRequest(request = {}) {
  const to = normalizeE164(
    request.destination?.normalizedPhone || request.destination?.phone
  );
  const body = normalizeText(request.content?.body);
  const idempotencyKey = normalizeText(request.idempotencyKey);
  if (!to || !body || !idempotencyKey) {
    return {
      error: failureResult({
        retryability: "terminal",
        failureCode: "twilio_invalid_request",
        failureReason:
          "SMS delivery requires an E.164 destination, body, and idempotency identity.",
        httpStatus: 422,
      }),
    };
  }
  return { to, body, idempotencyKey };
}

export function getConfiguredTwilioFromNumber(env = process.env) {
  return normalizeE164(env.TWILIO_FROM_NUMBER);
}

export function createTwilioSmsAdapter({
  accountSid = process.env.TWILIO_ACCOUNT_SID,
  authToken = process.env.TWILIO_AUTH_TOKEN,
  from = getConfiguredTwilioFromNumber(),
  fetchImpl = globalThis.fetch,
} = {}) {
  const configuredAccountSid = normalizeText(accountSid);
  const configuredAuthToken = normalizeText(authToken);
  const configuredFrom = normalizeE164(from);

  return {
    key: "twilio",
    channel: "sms",
    sender: configuredFrom,
    async send(request) {
      const validated = validateRequest(request);
      if (validated.error) return validated.error;
      const { to, body, idempotencyKey } = validated;

      if (
        !configuredAccountSid ||
        !configuredAuthToken ||
        !configuredFrom ||
        typeof fetchImpl !== "function"
      ) {
        return failureResult({
          retryability: "terminal",
          failureCode: "twilio_not_configured",
          failureReason: "Twilio SMS delivery is not configured.",
          httpStatus: 503,
        });
      }

      const endpoint = `${TWILIO_API_ROOT}/Accounts/${encodeURIComponent(
        configuredAccountSid
      )}/Messages.json`;
      const form = new URLSearchParams({
        To: to,
        From: configuredFrom,
        Body: body,
      });

      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${configuredAccountSid}:${configuredAuthToken}`
            ).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
        });
        const result = await response.json().catch(() => ({}));
        const providerMessageId = normalizeText(result.sid);
        const twilioStatus = normalizeText(result.status).toLowerCase();
        const errorCode = normalizeText(result.code || result.error_code);
        const providerMetadata = {
          httpStatus: response.status,
          twilioStatus,
          errorCode,
          numSegments: normalizeText(result.num_segments),
          deliveryId: normalizeText(request.deliveryId),
          idempotencyKey,
        };

        if (!response.ok) {
          return failureResult({
            retryability: RETRYABLE_HTTP_STATUSES.has(response.status)
              ? "retryable"
              : response.status >= 400 && response.status < 500
                ? "terminal"
                : "indeterminate",
            providerMessageId,
            failureCode: errorCode || "twilio_rejected",
            failureReason:
              normalizeText(result.message || result.error_message) ||
              "Twilio rejected the SMS request.",
            httpStatus: response.status,
            providerMetadata,
          });
        }

        if (!providerMessageId) {
          return failureResult({
            retryability: "indeterminate",
            failureCode: "twilio_missing_message_sid",
            failureReason:
              "Twilio accepted the request without returning a Message SID.",
            httpStatus: response.status,
            providerMetadata,
          });
        }

        if (["failed", "undelivered", "canceled"].includes(twilioStatus)) {
          return failureResult({
            retryability: "terminal",
            providerMessageId,
            failureCode: errorCode || `twilio_${twilioStatus}`,
            failureReason:
              normalizeText(result.error_message) ||
              `Twilio reported the message as ${twilioStatus}.`,
            httpStatus: response.status,
            providerMetadata,
          });
        }

        if (!ACCEPTED_MESSAGE_STATUSES.has(twilioStatus)) {
          return failureResult({
            retryability: "indeterminate",
            providerMessageId,
            failureCode: "twilio_unknown_status",
            failureReason: `Twilio returned an unrecognized message status: ${
              twilioStatus || "empty"
            }.`,
            httpStatus: response.status,
            providerMetadata,
          });
        }

        return {
          ok: true,
          status: "sent",
          retryability: "terminal",
          providerMessageId,
          failureCode: "",
          failureReason: "",
          httpStatus: response.status,
          providerMetadata,
        };
      } catch (error) {
        return failureResult({
          retryability: "indeterminate",
          failureCode: "twilio_transport_error",
          failureReason:
            normalizeText(error?.message) || "Twilio SMS request failed.",
          httpStatus: 502,
          providerMetadata: {
            deliveryId: normalizeText(request.deliveryId),
            idempotencyKey,
          },
        });
      }
    },
  };
}
