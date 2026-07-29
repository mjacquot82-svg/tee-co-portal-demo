// @ts-check
import { expect, test } from "@playwright/test";
import { generateQuoteSnapshot } from "../src/lib/quoteEngine.js";
import { deriveOrderFinancials } from "../src/orders/orderFinancials.js";
import { buildOrderPaymentRollup } from "../src/services/orderPaymentRollup.js";
import { buildPaymentAction } from "../src/admin/QuickSale.jsx";
import { buildDepositRequestContent } from "../src/orders/depositRequests.js";

const legacyTaxDeferredOrder = {
  order_number: "TC-207063",
  status: "Ready For Pickup",
  pickup_status: "Ready for Pickup",
  front_counter_status: "Awaiting Remaining Payment",
  front_counter_released_at: "2026-07-29T12:34:47.974Z",
  subtotal: 2,
  tax_amount: 0,
  total_amount: 2,
  deposit_amount: 1,
  total_paid: 1,
  balance_due: 1,
  quote: {
    subtotal: 2,
    tax: null,
    total: 2,
    taxes_placeholder: "Calculated at checkout",
  },
};

test("legacy checkout-tax orders normalize to the final taxed invoice total", () => {
  const financials = deriveOrderFinancials(legacyTaxDeferredOrder);

  expect(financials).toMatchObject({
    subtotal: 2,
    tax_amount: 0.26,
    total_amount: 2.26,
    deposit_amount: 1,
    deposit_applied: 1,
    total_paid: 1,
    balance_due: 1.26,
  });

  expect(buildPaymentAction({ ...legacyTaxDeferredOrder, ...financials })).toMatchObject({
    amount: 1.26,
    paymentKind: "balance",
  });
});

test("deposit and final payment are both applied against the taxed invoice total", () => {
  const normalized = {
    ...legacyTaxDeferredOrder,
    ...deriveOrderFinancials(legacyTaxDeferredOrder),
  };
  const afterDeposit = buildOrderPaymentRollup({
    order: normalized,
    payments: [{ amount: 1, payment_type: "deposit", status: "captured" }],
  });
  expect(afterDeposit).toMatchObject({
    total_paid: 1,
    deposit_applied: 1,
    balance_due: 1.26,
  });

  const paidInFull = buildOrderPaymentRollup({
    order: normalized,
    payments: [
      { amount: 1, payment_type: "deposit", status: "captured" },
      { amount: 1.26, payment_type: "full", status: "captured" },
    ],
  });
  expect(paidInFull).toMatchObject({
    total_paid: 2.26,
    balance_due: 0,
    payment_status: "Paid",
  });
});

test("deposit request copy uses the taxed invoice balance", () => {
  const financials = deriveOrderFinancials({
    ...legacyTaxDeferredOrder,
    total_paid: 0,
  });
  const content = buildDepositRequestContent({
    ...legacyTaxDeferredOrder,
    ...financials,
    customer_name: "Marc Jacquot",
  });

  expect(content.body).toContain("Deposit Requested: $1.00");
  expect(content.body).toContain("Remaining Balance: $2.26");
});

test("new taxable quotes persist tax while explicit tax-exempt quotes remain untaxed", () => {
  const product = { id: "test", name: "Test", base_garment_price: 2 };
  const taxable = generateQuoteSnapshot({ product_id: "test", qty: 1 }, product);
  expect(taxable).toMatchObject({
    subtotal: 2,
    tax_amount: 0.26,
    total_amount: 2.26,
    total: 2.26,
  });

  const taxExempt = generateQuoteSnapshot(
    { product_id: "test", qty: 1, tax_exempt: true },
    product
  );
  expect(taxExempt).toMatchObject({
    subtotal: 2,
    tax_amount: 0,
    total_amount: 2,
    total: 2,
  });
});
