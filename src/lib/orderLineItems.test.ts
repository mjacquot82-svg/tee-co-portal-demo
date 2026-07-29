import { describe, expect, it } from "vitest";
import { generateOrderQuoteSnapshot } from "./quoteEngine";
import { getOrderLineItems, getOrderTotalQuantity } from "./orderLineItems";

describe("hierarchical apparel order model", () => {
  const products = [
    { id: "hoodie", name: "Gildan Hoodie", base_garment_price: 20, placement_prices: { Front: 2 }, production_method_prices: { DTF: 1 } },
    { id: "tee", name: "Bella Canvas T-Shirt", base_garment_price: 10, placement_prices: { Front: 2 }, production_method_prices: { DTF: 1 } },
  ];
  const order = {
    line_items: [
      { id: "one", product_id: "hoodie", garment: "Gildan Hoodie", decoration_type: "DTF", placement: "Front", placements: [{ placement: "Front", decoration_type: "DTF" }], size_breakdown: { S: 2, M: 3, L: 1 } },
      { id: "two", product_id: "tee", garment: "Bella Canvas T-Shirt", decoration_type: "DTF", placement: "Front", placements: [{ placement: "Front", decoration_type: "DTF" }], size_breakdown: { M: 5, XL: 2 } },
    ],
  };

  it("derives garment and order quantities from each size breakdown", () => {
    expect(getOrderLineItems(order).map((item) => item.quantity)).toEqual([6, 7]);
    expect(getOrderTotalQuantity(order)).toBe(13);
  });

  it("preserves aggregate pricing while exposing per-line quotes", () => {
    const quote = generateOrderQuoteSnapshot(order, products);
    expect(quote.quantity).toBe(13);
    expect(quote.line_items).toHaveLength(2);
    expect(quote.garment_subtotal).toBe(190);
    expect(quote.production_subtotal).toBe(39);
    expect(quote.tax_amount).toBe(29.77);
    expect(quote.total).toBe(258.77);
  });

  it("adapts legacy single-garment orders", () => {
    const items = getOrderLineItems({ garment: "Legacy Hoodie", qty: 5, size_breakdown: { M: 5 } });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ garment: "Legacy Hoodie", quantity: 5, size_breakdown: { M: 5 } });
  });
});
