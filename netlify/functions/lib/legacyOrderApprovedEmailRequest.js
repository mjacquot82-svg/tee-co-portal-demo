const SUBJECT = "Your order has been approved";

function normalizeText(value, fallback = "") {
  return String(value ?? "").trim() || fallback;
}

export function buildLegacyOrderApprovedEmailRequest({
  order,
  idempotencyKey,
}) {
  const orderNumber = normalizeText(order?.order_number);
  const customerName = normalizeText(order?.customer_name, "Customer");
  const email = normalizeText(order?.customer_email);
  const normalizedIdempotencyKey = normalizeText(idempotencyKey);
  if (!orderNumber || !email || !normalizedIdempotencyKey) {
    throw new Error(
      "Approved-order email requires order, customer email, and idempotency identity."
    );
  }

  return {
    idempotencyKey: normalizedIdempotencyKey,
    destination: { email },
    content: {
      subject: SUBJECT,
      body: `Hi ${customerName},

Your order ${orderNumber} has been reviewed and approved by Tee & Co.

No action is required from you at this time.

We are preparing your order for the next stage and will notify you if anything is required or when your order is ready.

Thanks,
The Tee & Co Team`,
    },
    metadata: {
      eventType: "quote_approved",
      orderNumber,
      legacyProductionAuthoritative: true,
    },
  };
}
