import { describe, expect, it } from "vitest";
import { deriveOrderFinancials } from "./orderFinancials";
import { buildSquarePaymentLinkPayload } from "../services/squareService";

describe("discounted Square checkout amounts", () => {
  it("passes the discounted taxed balance to Square without subtracting prior order payments twice", () => {
    const financials = deriveOrderFinancials({
      subtotal: 200, tax_amount: 26, total_amount: 226,
      discount_type: "percent", discount_value: 10,
      payment_history: [{ amount: 50, method: "Cash", timestamp: "2026-10-07T12:00:00Z" }],
    });
    const payload = buildSquarePaymentLinkPayload({
      id: "discount-balance", amount_requested: financials.balance_due,
      amount_paid: 0, request_type: "balance", currency: "CAD",
    });
    expect(payload.amount).toBe(153.4);
  });

  it("passes a deposit capped at the discounted total to Square", () => {
    const financials = deriveOrderFinancials({
      subtotal: 100, tax_amount: 13, total_amount: 113, deposit_amount: 100,
      discount_type: "fixed", discount_value: 90,
    });
    expect(buildSquarePaymentLinkPayload({
      id: "discount-deposit", amount_requested: financials.deposit_amount, amount_paid: 0,
    }).amount).toBe(11.3);
  });

  it.each([100, 120])( "never recharges a fully paid or overpaid request (%s paid)", (paid) => {
    expect(buildSquarePaymentLinkPayload({
      id: "settled-request", amount_requested: 100, amount_paid: paid,
    }).amount).toBe(0);
  });
});
