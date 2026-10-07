import { describe, expect, it } from "vitest";
import { applyOrderDiscount, normalizeOrderDiscount } from "./orderFinancials";

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

  it("retains an owner discount reason", () => {
    expect(normalizeOrderDiscount({
      discount_type: "percent", discount_value: 15, discount_reason: "Bulk order",
    })).toEqual({ type: "percent", value: 15, reason: "Bulk order" });
  });
});
