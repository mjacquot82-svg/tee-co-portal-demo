import { describe, expect, it } from "vitest";
import { normalizeOrderFinancials } from "./orderFinancials";

// Saving an order writes the normalized financials back onto the order. Re-normalizing must
// give the same totals (no compounding of the discount into the tax rate).
function save(order: Record<string, unknown>) {
  const f = normalizeOrderFinancials(order);
  return { ...order, subtotal: f.subtotal, tax_amount: f.tax_amount, total_amount: f.total_amount, discount_amount: f.discount_amount, balance_due: f.balance_due };
}

describe("discount tax stability", () => {
  const base = { subtotal: 30, tax_amount: 3.9, total_amount: 33.9, quote: { subtotal: 30, total: 33.9 } };

  it("keeps 13% tax on the discounted subtotal across repeated saves", () => {
    let order: Record<string, unknown> = { ...base, discount_type: "percent", discount_value: 10 };
    for (let i = 0; i < 4; i += 1) order = save(order);
    const f = normalizeOrderFinancials(order);
    expect(f.discounted_subtotal).toBe(27);
    expect(f.tax_amount).toBeCloseTo(3.51, 2);
    expect(f.total_amount).toBeCloseTo(30.51, 2);
  });

  it("switching from percent to fixed and back to none restores the right totals", () => {
    let order: Record<string, unknown> = save({ ...base, discount_type: "percent", discount_value: 10 });
    order = save({ ...order, discount_type: "fixed", discount_value: 5 });
    let f = normalizeOrderFinancials(order);
    expect(f.total_amount).toBeCloseTo(25 * 1.13, 2);
    order = save({ ...order, discount_type: "", discount_value: 0, discount_reason: "" });
    f = normalizeOrderFinancials(order);
    expect(f.discount_amount).toBe(0);
    expect(f.total_amount).toBeCloseTo(33.9, 2);
  });
});
