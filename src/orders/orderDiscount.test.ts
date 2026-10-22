import { describe, expect, it } from "vitest";
import { applyOrderDiscount, deriveOrderFinancials, normalizeOrderDiscount } from "./orderFinancials";

describe("order discount safeguards", () => {
  it("applies a percentage discount before tax", () => {
    expect(applyOrderDiscount(200, { type: "percent", value: 10 })).toEqual({
      discount_amount: 20,
      discounted_subtotal: 180,
    });
  });

  it("caps a fixed discount at the subtotal", () => {
    expect(applyOrderDiscount(50, { type: "fixed", value: 100 })).toEqual({
      discount_amount: 50,
      discounted_subtotal: 0,
    });
  });

  it("rejects unsupported types and negative values", () => {
    expect(applyOrderDiscount(100, { type: "unknown", value: 20 }).discount_amount).toBe(0);
    expect(normalizeOrderDiscount({ discount_type: "fixed", discount_value: -10 }).value).toBe(0);
  });

  it("caps deposit at discounted total", () => {
    const financials = deriveOrderFinancials({
      order_number: "DISCOUNT-DEPOSIT",
      subtotal: 100,
      tax_amount: 13,
      total_amount: 113,
      deposit_amount: 100,
      discount_type: "fixed",
      discount_value: 90,
    });
    expect(financials.total_amount).toBe(11.3);
    expect(financials.deposit_amount).toBe(11.3);
    expect(financials.deposit_outstanding).toBe(11.3);
  });

  it("retains an owner discount reason", () => {
    expect(normalizeOrderDiscount({
      discount_type: "percent", discount_value: 15, discount_reason: "Bulk order",
    })).toEqual({ type: "percent", value: 15, reason: "Bulk order" });
  });
  it("recalculates tax and outstanding balance from discounted total", () => {
    const financials = deriveOrderFinancials({
      order_number: "DISCOUNT-TEST-1",
      subtotal: 200,
      tax_amount: 26,
      total_amount: 226,
      discount_type: "percent",
      discount_value: 10,
      payment_history: [{ amount: 50, method: "Cash", timestamp: "2026-10-07T12:00:00Z" }],
    });
    expect(financials.discount_amount).toBe(20);
    expect(financials.discounted_subtotal).toBe(180);
    expect(financials.tax_amount).toBe(23.4);
    expect(financials.total_amount).toBe(203.4);
    expect(financials.balance_due).toBe(153.4);
  });
});
