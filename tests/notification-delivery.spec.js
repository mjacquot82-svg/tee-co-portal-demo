import { expect, test } from "@playwright/test";
import {
  listNotificationActivity,
  resetNotificationActivityForTests,
  triggerNotificationEvent,
} from "../src/lib/notificationDeliveryService";
import { NOTIFICATION_TYPES } from "../src/lib/notificationTemplatesStore";
import { createPaymentRequest, recordPayment, resetStoredPaymentsForTests } from "../src/lib/paymentsStore";

test.beforeEach(() => {
  resetNotificationActivityForTests();
  resetStoredPaymentsForTests();
});

test("triggerNotificationEvent resolves template content and stores activity records", () => {
  const records = triggerNotificationEvent(NOTIFICATION_TYPES.quoteApproved, {
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
  expect(records[0].generatedContent.emailSubject).toContain("TC-4401");
  expect(records[0].generatedContent.emailBody).toContain("Taylor Chen");

  const storedRecords = listNotificationActivity();
  expect(storedRecords).toHaveLength(2);
  expect(storedRecords[1].recipientType).toBe("staff");
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
