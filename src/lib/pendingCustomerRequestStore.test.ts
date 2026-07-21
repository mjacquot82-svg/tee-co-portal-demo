import { describe, expect, it } from "vitest";
import { normalizePendingCustomerRequest, upsertPendingCustomerLineItem } from "./pendingCustomerRequestStore";

const hoodie = {
  id: "hoodie-line",
  productId: "hoodie",
  garmentName: "Gildan Hoodie",
  selectedColor: "Black",
  decorationType: "DTF",
  placement: "Front",
  availableSizes: ["S", "M", "L", "XL"],
  size_breakdown: { S: 2, M: 3, L: 1 },
};

describe("customer shopping draft", () => {
  it("preserves a single configured multi-size garment", () => {
    const draft = normalizePendingCustomerRequest({ lineItems: [hoodie] });
    expect(draft.lineItems).toHaveLength(1);
    expect(draft.lineItems[0]).toMatchObject({ quantity: 6, availableSizes: ["S", "M", "L", "XL"], size_breakdown: { S: 2, M: 3, L: 1 } });
  });

  it("adds another configured garment after returning from the catalogue", () => {
    const lines = upsertPendingCustomerLineItem([hoodie], {
      id: "tee-line",
      productId: "tee",
      garmentName: "Bella Canvas T-Shirt",
      size_breakdown: { M: 5, XL: 2 },
    });
    expect(lines.map((line) => line.garmentName)).toEqual(["Gildan Hoodie", "Bella Canvas T-Shirt"]);
    expect(lines.map((line) => line.quantity)).toEqual([6, 7]);
  });

  it("edits an existing garment without creating a duplicate", () => {
    const lines = upsertPendingCustomerLineItem([hoodie], {
      ...hoodie,
      selectedColor: "Navy",
      size_breakdown: { M: 8 },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ id: "hoodie-line", selectedColor: "Navy", quantity: 8, availableSizes: ["S", "M", "L", "XL"], size_breakdown: { M: 8 } });
  });

  it("adapts the original single-size handoff", () => {
    const draft = normalizePendingCustomerRequest({ productId: "tee", garmentName: "T-Shirt", selectedSize: "M", quantity: 4 });
    expect(draft.lineItems[0]).toMatchObject({ productId: "tee", size_breakdown: { M: 4 }, quantity: 4 });
  });
});
