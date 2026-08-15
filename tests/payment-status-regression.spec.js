// @ts-check
import { expect, test } from "@playwright/test";
import {
  isNonSuccessfulPaymentStatus,
  isSuccessfulPaymentRecord,
  isSuccessfulPaymentStatus,
} from "../src/lib/paymentStatus.js";
import { buildOrderPaymentRollup } from "../src/services/orderPaymentRollup.js";

test("only explicit successful statuses contribute to payment totals", () => {
  const statuses = ["failed", "declined", "voided", "canceled", "cancelled", "refunded", "pending", "processing", ""];
  for (const status of statuses) expect(isSuccessfulPaymentStatus(status)).toBe(false);
  for (const status of ["captured", "completed", "paid", "settled", "succeeded", "success", "approved"]) {
    expect(isSuccessfulPaymentStatus(status)).toBe(true);
  }
  expect(isNonSuccessfulPaymentStatus("REFUNDED")).toBe(true);
});

test("canceled and refunded payments never reduce an order balance", () => {
  const payments = [
    { status: "captured", amount: 20 },
    { status: "canceled", amount: 30 },
    { status: "refunded", amount: 40 },
    { status: "processing", amount: 50 },
  ];
  expect(payments.filter(isSuccessfulPaymentRecord)).toHaveLength(1);
  expect(buildOrderPaymentRollup({ order: { total_amount: 100 }, payments })).toMatchObject({
    total_paid: 20,
    balance_due: 80,
  });
});
