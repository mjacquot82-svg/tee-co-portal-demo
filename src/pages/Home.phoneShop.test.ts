import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "Home.jsx"),
  "utf8"
);

describe("Home phone shop source guards", () => {
  it("removes numeric count bubbles from the phone category rail only", () => {
    expect(homeSource).not.toContain("storefront-phone-category-rail-count");
    expect(homeSource).toContain("storefront-phone-category-rail-name");
    // Desktop rail counts remain unchanged.
    expect(homeSource).toContain("storefront-rail-count");
  });

  it("auto-selects the first live populated category instead of a Products/0 fallback", () => {
    expect(homeSource).toContain("getFirstPopulatedStorefrontCategoryId");
    expect(homeSource).toContain("setSelectedPhoneCategoryId(initialPhoneCategoryId)");
    expect(homeSource).not.toContain('| "Products"');
    expect(homeSource).not.toContain("${phoneCategoryProducts.length} products");
  });

  it("keeps selected-category product counts in the main phone products header", () => {
    expect(homeSource).toContain("storefront-phone-products-count");
    expect(homeSource).toContain("activePhoneCategory.productCountLabel");
  });
});
