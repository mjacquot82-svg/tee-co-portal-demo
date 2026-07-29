// @ts-check
import { expect, test } from "@playwright/test";
import { deriveOrderFinancials } from "../src/orders/orderFinancials.js";
import {
  buildCustomerPickupUpdates,
  buildFrontCounterCompletionUpdates,
  deriveFrontCounterState,
} from "../src/front-counter/frontCounterWorkflow.js";

const invoice = {
  order_number: "TC-PAYMENT-AGGREGATION",
  subtotal: 2,
  tax_amount: 0.26,
  total_amount: 2.26,
  deposit_amount: 1,
  invoice_status: "Sent",
};

function capturedPayment(overrides = {}) {
  return {
    id: "payment-default",
    amount: 1,
    status: "captured",
    provider: "manual",
    method: "card",
    ...overrides,
  };
}

test("Square deposit plus manual final payment pays the taxed invoice in full", () => {
  const financials = deriveOrderFinancials({
    ...invoice,
    total_paid: 1,
    payments: [
      capturedPayment({
        id: "square-deposit",
        amount: 1,
        payment_type: "deposit",
        provider: "square",
        provider_payment_id: "square-payment-1",
      }),
      capturedPayment({
        id: "manual-final",
        amount: 1.26,
        payment_type: "partial",
        metadata: { legacyPaymentId: "legacy-final" },
      }),
    ],
    payment_history: [
      {
        id: "legacy-final",
        amount: 1.26,
        method: "Card",
        timestamp: "2026-07-29T14:56:25.014Z",
      },
    ],
  });

  expect(financials).toMatchObject({
    total_paid: 2.26,
    balance_due: 0,
    payment_status: "Paid",
    payment_collection_state: "Paid",
    invoice_status: "Paid",
  });

  const readyOrder = {
    ...invoice,
    ...financials,
    status: "Ready For Pickup",
    pickup_status: "Ready for Pickup",
    front_counter_status: "Awaiting Remaining Payment",
    front_counter_released_at: "2026-07-29T14:55:26.482Z",
  };
  expect(deriveFrontCounterState(readyOrder)).toMatchObject({
    balanceDue: 0,
    canRecordPickup: true,
  });
  const pickupUpdates = buildCustomerPickupUpdates(readyOrder, {
    occurredAt: "2026-07-29T15:00:00.000Z",
  });
  expect(pickupUpdates).toBeTruthy();
  expect(
    buildFrontCounterCompletionUpdates(
      { ...readyOrder, ...pickupUpdates },
      { occurredAt: "2026-07-29T15:01:00.000Z" }
    )
  ).toBeTruthy();
});

test("manual payment only is aggregated", () => {
  expect(
    deriveOrderFinancials({
      ...invoice,
      payments: [capturedPayment({ amount: 2.26 })],
    }).total_paid
  ).toBe(2.26);
});

test("Square payment only is aggregated", () => {
  expect(
    deriveOrderFinancials({
      ...invoice,
      payments: [
        capturedPayment({
          amount: 2.26,
          provider: "square",
          provider_payment_id: "square-only",
        }),
      ],
    }).balance_due
  ).toBe(0);
});

test("cash payment is aggregated", () => {
  expect(
    deriveOrderFinancials({
      ...invoice,
      payments: [capturedPayment({ amount: 2.26, method: "cash" })],
    }).payment_status
  ).toBe("Paid");
});

test("split payment aggregates each successful component", () => {
  const financials = deriveOrderFinancials({
    ...invoice,
    payments: [
      capturedPayment({ id: "split-cash", amount: 1, method: "cash" }),
      capturedPayment({ id: "split-card", amount: 1.26, method: "card" }),
    ],
  });

  expect(financials.total_paid).toBe(2.26);
  expect(financials.balance_due).toBe(0);
});

test("duplicate Square webhooks do not duplicate a provider payment", () => {
  const financials = deriveOrderFinancials({
    ...invoice,
    payments: [
      capturedPayment({
        id: "square-webhook-v2",
        provider: "square",
        provider_payment_id: "square-duplicate",
      }),
      capturedPayment({
        id: "square-webhook-v6",
        provider: "square",
        provider_payment_id: "square-duplicate",
      }),
    ],
  });

  expect(financials.total_paid).toBe(1);
  expect(financials.balance_due).toBe(1.26);
});

test("multiple providers aggregate successful payments and exclude failures", () => {
  const financials = deriveOrderFinancials({
    ...invoice,
    payments: [
      capturedPayment({
        id: "provider-square",
        amount: 1,
        provider: "square",
        provider_payment_id: "square-multi",
      }),
      capturedPayment({ id: "provider-cash", amount: 0.5, method: "cash" }),
      capturedPayment({ id: "provider-transfer", amount: 0.5, method: "e-transfer" }),
      capturedPayment({ id: "provider-card", amount: 0.26, method: "card" }),
      capturedPayment({ id: "declined-card", amount: 10, status: "declined" }),
      capturedPayment({ id: "pending-card", amount: 10, status: "pending" }),
    ],
  });

  expect(financials.total_paid).toBe(2.26);
  expect(financials.balance_due).toBe(0);
});

test("existing historical orders retain their persisted successful total", () => {
  expect(
    deriveOrderFinancials({
      ...invoice,
      total_paid: 1,
    }).total_paid
  ).toBe(1);

  expect(
    deriveOrderFinancials({
      ...invoice,
      total_paid: 1,
      payment_history: [
        {
          id: "historical-payment",
          amount: 1,
          method: "Cash",
          timestamp: "2025-01-01T12:00:00.000Z",
        },
      ],
    }).total_paid
  ).toBe(1);
});
