import { describe, expect, it } from "vitest";
import { buildSupabaseOrderPayload, mapSupabaseOrderRowToOrder } from "./ordersRepository";

describe("owner discount persistence", () => {
  const baseOrder = {
    order_number: "DISCOUNT-ROUNDTRIP",
    customer_name: "Test Customer",
    subtotal: 200,
    tax_amount: 23.4,
    total_amount: 203.4,
    discount_type: "percent",
    discount_value: 10,
    discount_reason: "Bulk order",
  };

  it("restores owner discount fields after a Supabase round trip", () => {
    const payload = buildSupabaseOrderPayload(baseOrder);
    const restored = mapSupabaseOrderRowToOrder(payload);
    expect(payload.order_metadata.owner_discount).toEqual({
      type: "percent", value: 10, reason: "Bulk order",
    });
    expect(restored.discount_type).toBe("percent");
    expect(restored.discount_value).toBe(10);
    expect(restored.discount_reason).toBe("Bulk order");
  });

  it("clears discount metadata when removed", () => {
    const prior = buildSupabaseOrderPayload(baseOrder);
    const removed = buildSupabaseOrderPayload({
      ...baseOrder,
      discount_type: "",
      discount_value: 0,
      discount_reason: "",
      order_metadata: prior.order_metadata,
    });
    const restored = mapSupabaseOrderRowToOrder(removed);
    expect(removed.order_metadata.owner_discount).toBeUndefined();
    expect(restored.discount_type).toBe("");
    expect(restored.discount_value).toBe(0);
  });
});
