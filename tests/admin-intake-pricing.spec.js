// @ts-check
import { expect, test } from "@playwright/test";
import { getPricingAttentionReason } from "../src/admin/intakePricingPresentation.js";

test("a successfully calculated price is not an outstanding workflow requirement", () => {
  expect(getPricingAttentionReason({ garment_pricing_available: true }, { total_amount: 425.5 })).toBe("");
});

test("pricing attention is limited to actionable pricing exceptions", () => {
  expect(getPricingAttentionReason({ manual_pricing_required: true }, { total_amount: 0 })).toContain("staff-entered");
  expect(getPricingAttentionReason({ garment_pricing_available: false }, { total_amount: 125 })).toContain("Catalog pricing");
  expect(getPricingAttentionReason({ pricing_calculation_failed: true }, { total_amount: 0 })).toContain("did not complete");
  expect(getPricingAttentionReason({ margin_warning: true }, { total_amount: 125 })).toContain("margin warning");
  expect(getPricingAttentionReason({ custom_pricing_exception: true }, { total_amount: 125 })).toContain("custom pricing exception");
  expect(getPricingAttentionReason({}, { total_amount: 0 })).toContain("No calculated order total");
});

test("the intake screen keeps price editing optional and records a staff override", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/admin/QuoteDetail.jsx", import.meta.url), "utf8")
  );

  expect(source).not.toContain('items.push("Pricing Review Needed")');
  expect(source).toContain("Edit Price");
  expect(source).toContain('data-testid="intake-price-editor"');
  expect(source).toContain('data-testid="intake-pricing-attention"');
  expect(source).toContain('pricing_status: "Staff Override"');
  expect(source).toContain('activity_type: "pricing_override"');
});
