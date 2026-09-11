import { describe, expect, it } from "vitest";
import {
  buildStorefrontCategories,
  getFirstPopulatedStorefrontCategoryId,
} from "./storefrontCatalog";

describe("getFirstPopulatedStorefrontCategoryId", () => {
  it("returns the first category in existing order that has active products", () => {
    const categories = [
      { id: "empty-hats", name: "Hats", productCount: 0 },
      { id: "crewneck", name: "Crewneck", productCount: 3 },
      { id: "hoodie", name: "Hoodie", productCount: 3 },
    ];

    expect(getFirstPopulatedStorefrontCategoryId(categories)).toBe("crewneck");
  });

  it("does not hard-code a category and stays live as catalog order changes", () => {
    const firstCatalog = [
      { id: "polo", name: "Polo", productCount: 2 },
      { id: "crewneck", name: "Crewneck", productCount: 1 },
    ];
    const secondCatalog = [
      { id: "zip", name: "1/4 Zip", productCount: 0 },
      { id: "hoodie", name: "Hoodie", productCount: 4 },
      { id: "polo", name: "Polo", productCount: 2 },
    ];

    expect(getFirstPopulatedStorefrontCategoryId(firstCatalog)).toBe("polo");
    expect(getFirstPopulatedStorefrontCategoryId(secondCatalog)).toBe("hoodie");
  });

  it("returns null when no populated category exists", () => {
    expect(getFirstPopulatedStorefrontCategoryId([])).toBeNull();
    expect(
      getFirstPopulatedStorefrontCategoryId([{ id: "empty", name: "Empty", productCount: 0 }])
    ).toBeNull();
  });
});

describe("buildStorefrontCategories phone initial selection", () => {
  it("derives the initial phone category from live catalog grouping order", () => {
    const products = [
      {
        id: "p-hoodie",
        name: "Club Hoodie",
        status: "Active",
        storefront_category: "Hoodie",
      },
      {
        id: "p-crew-1",
        name: "Crew A",
        status: "Active",
        storefront_category: "Crewneck",
      },
      {
        id: "p-crew-2",
        name: "Crew B",
        status: "Active",
        storefront_category: "Crewneck",
      },
      {
        id: "p-inactive",
        name: "Zip Hidden",
        status: "Inactive",
        storefront_category: "1/4 Zip",
      },
    ];

    const categories = buildStorefrontCategories(products, []);
    // Alphabetical storefront order: Crewneck before Hoodie; inactive zip excluded.
    expect(categories.map((category) => category.name)).toEqual(["Crewneck", "Hoodie"]);
    expect(getFirstPopulatedStorefrontCategoryId(categories)).toBe(categories[0].id);
    expect(categories[0].productCount).toBeGreaterThan(0);
  });
});
