// @ts-check
import { expect, test } from "@playwright/test";
import {
  findPaymentRequestForOrder,
  formatPaymentRequestType,
  getCustomerPaymentStatusLabel,
  getCustomerPortalPaymentData,
  getRemainingPaymentAmount,
} from "../src/customer-portal/customerPortalPayments.js";

test("customer portal payment data stays scoped to the customer and summarizes balances from payment source records", () => {
  const paymentRequestOpen = {
    id: "payment-request-open",
    customer_id: "customer-phase3-1",
    order_number: "TC-P3-1001",
    request_type: "deposit",
    status: "open",
    amount_requested: 200,
    amount_paid: 50,
    created_at: "2026-06-03T10:00:00.000Z",
  };
  const paymentRequestCustom = {
    id: "payment-request-custom",
    customer_id: "customer-phase3-1",
    request_type: "custom",
    status: "processing",
    amount_requested: 40,
    amount_paid: 0,
    created_at: "2026-06-04T10:00:00.000Z",
  };
  const scopedPayment = {
    id: "payment-phase3-1",
    customer_id: "customer-phase3-1",
    order_number: "TC-P3-1001",
    payment_request_id: paymentRequestOpen.id,
    status: "captured",
    amount: 50,
    created_at: "2026-06-03T11:00:00.000Z",
  };

  const summary = getCustomerPortalPaymentData({
    orders: [{ order_number: "TC-P3-1001", customer_id: "customer-phase3-1" }],
    customerIds: ["customer-phase3-1"],
    paymentRequests: [
      paymentRequestOpen,
      paymentRequestCustom,
      {
        id: "payment-request-other",
        customer_id: "customer-phase3-2",
        order_number: "TC-P3-9999",
        request_type: "balance",
        status: "open",
        amount_requested: 999,
      },
    ],
    payments: [
      scopedPayment,
      {
        id: "payment-phase3-other",
        customer_id: "customer-phase3-2",
        order_number: "TC-P3-9999",
        status: "captured",
        amount: 999,
      },
    ],
    paymentEvents: [
      {
        id: "payment-event-1",
        payment_request_id: paymentRequestCustom.id,
        event_type: "payment_request_created",
        created_at: "2026-06-04T10:01:00.000Z",
      },
      {
        id: "payment-event-2",
        payment_id: "payment-phase3-other",
        event_type: "payment_recorded",
        created_at: "2026-06-04T10:02:00.000Z",
      },
    ],
  });

  expect(summary.paymentRequests.map((request) => request.id)).toEqual([
    "payment-request-custom",
    "payment-request-open",
  ]);
  expect(summary.payments.map((payment) => payment.id)).toEqual(["payment-phase3-1"]);
  expect(summary.paymentEvents.map((event) => event.id)).toEqual(["payment-event-1"]);
  expect(summary.amountOwing).toBe(190);
  expect(summary.totalPaid).toBe(50);
  expect(summary.paymentStatus).toBe("Processing");
});

test("customer payment helpers present customer-friendly request details and support deposit redirects", () => {
  const paymentRequests = [
    {
      id: "payment-request-deposit",
      order_number: "TC-P3-2001",
      request_type: "deposit",
      status: "open",
      amount_requested: 150,
      amount_paid: 0,
    },
    {
      id: "payment-request-balance",
      order_number: "TC-P3-2001",
      request_type: "balance",
      status: "open",
      amount_requested: 300,
      amount_paid: 0,
    },
  ];

  expect(getCustomerPaymentStatusLabel(paymentRequests[0])).toBe("Awaiting Payment");
  expect(
    getCustomerPaymentStatusLabel({
      status: "open",
      amount_requested: 100,
      amount_paid: 25,
    })
  ).toBe("Partially Paid");
  expect(getCustomerPaymentStatusLabel({ status: "canceled" })).toBe("Cancelled");
  expect(getCustomerPaymentStatusLabel({ status: "captured", amount: 25 })).toBe("Paid");
  expect(getRemainingPaymentAmount(paymentRequests[0])).toBe(150);
  expect(formatPaymentRequestType("full_payment")).toBe("Full Payment");
  expect(findPaymentRequestForOrder(paymentRequests, "TC-P3-2001", "deposit")?.id).toBe(
    "payment-request-deposit"
  );
});

test("customer portal payment summary uses a neutral status when there is no payment activity", () => {
  const summary = getCustomerPortalPaymentData({
    orders: [],
    customerIds: [],
    paymentRequests: [],
    payments: [],
    paymentEvents: [],
  });

  expect(summary.amountOwing).toBe(0);
  expect(summary.totalPaid).toBe(0);
  expect(summary.paymentStatus).toBe("No Balance Due");
});
