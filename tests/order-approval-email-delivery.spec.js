// @ts-check
import { expect, test } from "@playwright/test";
import { handler } from "../netlify/functions/customer-notification.js";

test("approval delivery verifies persisted approval and sends the customer email", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CUSTOMER_NOTIFICATION_FROM_EMAIL: process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const requests = [];

  process.env.RESEND_API_KEY = "resend-test-key";
  process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL = "Tee & Co <orders@example.com>";
  process.env.SUPABASE_URL = "https://supabase.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/rest/v1/orders")) {
      return {
        ok: true,
        status: 200,
        json: async () => [{
          order_number: "TC-APPROVED-2001",
          customer_name: "Taylor Chen",
          customer_email: "taylor@example.com",
          approval_status: "Approved",
        }],
      };
    }
    return { ok: true, status: 200, json: async () => ({ id: "email-2001" }) };
  };

  try {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        eventType: "quote_approved",
        orderNumber: "TC-APPROVED-2001",
        idempotencyKey: "quote_approved:TC-APPROVED-2001:customer",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(requests).toHaveLength(2);
    expect(requests[1].options.headers["Idempotency-Key"]).toBe(
      "quote_approved:TC-APPROVED-2001:customer"
    );
    expect(JSON.parse(requests[1].options.body)).toMatchObject({
      from: "Tee & Co <orders@example.com>",
      to: ["taylor@example.com"],
      subject: "Your order has been approved",
    });
    expect(JSON.parse(requests[1].options.body).text).toBe(`Hi Taylor Chen,

Your order TC-APPROVED-2001 has been reviewed and approved by Tee & Co.

No action is required from you at this time.

We are preparing your order for the next stage and will notify you if anything is required or when your order is ready.

Thanks,
The Tee & Co Team`);
    expect(JSON.parse(response.body)).toMatchObject({
      delivered: true,
      providerMessageId: "email-2001",
    });
  } finally {
    globalThis.fetch = originalFetch;
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test("approval notification remains attached to the persisted approval transition", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/lib/ordersStore.js", import.meta.url), "utf8")
  );

  expect(source).toContain("!isApprovedState(previousApprovalStatus) && isApprovedState(nextApprovalStatus)");
  expect(source).toContain("triggerOrderNotification(NOTIFICATION_TYPES.quoteApproved, updatedOrder)");
});
