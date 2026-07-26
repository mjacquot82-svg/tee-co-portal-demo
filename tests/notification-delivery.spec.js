import { expect, test } from "@playwright/test";
import {
  flushNotificationDeliveriesForTests,
  listNotificationActivity,
  resetNotificationActivityForTests,
  triggerNotificationEvent,
} from "../src/lib/notificationDeliveryService";
import { NOTIFICATION_TYPES } from "../src/lib/notificationTemplatesStore";
import { createPaymentRequest, recordPayment, resetStoredPaymentsForTests } from "../src/lib/paymentsStore";

const originalFetch = globalThis.fetch;
let deliveryRequests = [];

test.beforeEach(() => {
  deliveryRequests = [];
  globalThis.fetch = async (url, options = {}) => {
    deliveryRequests.push({ url, options });
    if (url === "/.netlify/functions/notification-event-accept") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accepted: true,
          businessEvent: JSON.parse(options.body).businessEvent,
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ delivered: true }) };
  };
  resetNotificationActivityForTests();
  resetStoredPaymentsForTests();
});

test.afterEach(async () => {
  await flushNotificationDeliveriesForTests();
  globalThis.fetch = originalFetch;
});

test("triggerNotificationEvent resolves template content and stores activity records", async () => {
  const records = await triggerNotificationEvent(NOTIFICATION_TYPES.quoteApproved, {
    customerName: "Taylor Chen",
    customerEmail: "taylor@example.com",
    staffName: "Nina Staff",
    orderNumber: "TC-4401",
    quoteTotal: 285,
    depositAmount: 142.5,
    paymentLink: "https://portal.teeandco.local/deposit/TC-4401",
  });

  expect(records).toHaveLength(2);
  expect(records[0]).toMatchObject({
    eventType: NOTIFICATION_TYPES.quoteApproved,
    recipientType: "customer",
    templateType: NOTIFICATION_TYPES.quoteApproved,
  });
  expect(records[0].generatedContent.emailSubject).toBe("Your order has been approved");
  expect(records[0].generatedContent.emailBody).toContain("Taylor Chen");

  const storedRecords = listNotificationActivity();
  expect(storedRecords).toHaveLength(2);
  expect(storedRecords.some((record) => record.recipientType === "staff")).toBe(true);
});

test("order approval delivery is idempotent across refresh, reopen, and repeated event evaluation", async () => {
  const context = {
    order: {
      order_number: "TC-APPROVED-1001",
      customer_name: "Morgan Lee",
      customer_email: "morgan@example.com",
      approval_status: "Approved",
    },
  };

  const initial = await triggerNotificationEvent(NOTIFICATION_TYPES.quoteApproved, context);
  const afterRefresh = await triggerNotificationEvent(NOTIFICATION_TYPES.quoteApproved, context);
  const afterReopen = await triggerNotificationEvent(NOTIFICATION_TYPES.quoteApproved, context);
  await flushNotificationDeliveriesForTests();

  expect(initial[0].metadata.idempotencyKey).toBe("quote_approved:TC-APPROVED-1001:customer");
  expect(afterRefresh[0].id).toBe(initial[0].id);
  expect(afterReopen[0].id).toBe(initial[0].id);
  const customerDeliveryRequests = deliveryRequests.filter(
    ({ url }) => url === "/.netlify/functions/customer-notification"
  );
  expect(customerDeliveryRequests).toHaveLength(1);
  expect(JSON.parse(customerDeliveryRequests[0].options.body)).toMatchObject({
    eventType: "quote_approved",
    orderNumber: "TC-APPROVED-1001",
    idempotencyKey: "quote_approved:TC-APPROVED-1001:customer",
  });
});

test("createPaymentRequest records payment request notification activity", () => {
  createPaymentRequest({
    customer_id: "customer-1",
    order_number: "TC-9910",
    request_type: "deposit",
    amount_requested: 120,
    metadata: {
      customer_name: "Alex Rivera",
      source: "admin_payments_module",
    },
  });

  const events = listNotificationActivity().map((record) => record.eventType);
  expect(events).toContain(NOTIFICATION_TYPES.paymentRequestCreated);
  expect(events).toContain(NOTIFICATION_TYPES.depositRequested);
});

test("recordPayment records payment received notification activity", () => {
  recordPayment({
    order_number: "TC-5511",
    amount: 89.5,
    status: "captured",
    method: "cash",
    metadata: {
      source: "admin_payments_module",
    },
  });

  const paymentReceivedRecord = listNotificationActivity().find(
    (record) => record.eventType === NOTIFICATION_TYPES.paymentReceived
  );

  expect(paymentReceivedRecord).toBeTruthy();
  expect(paymentReceivedRecord.generatedContent.emailBody).toContain("TC-5511");
});
