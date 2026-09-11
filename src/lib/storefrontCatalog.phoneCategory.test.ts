import { describe, expect, it } from "vitest";
import {
  buildStorefrontCategories,
  getFirstPopulatedStorefrontCategoryId,
} from "./storefrontCatalog";

describe("getFirstPopulatedStorefrontCategoryId", () => {
  it("returns the active category with the most products", () => {
    const categories = [
      { id: "empty-hats", name: "Hats", productCount: 0 },
      { id: "crewneck", name: "Crewneck", productCount: 2 },
      { id: "hoodie", name: "Hoodie", productCount: 5 },
      { id: "polo", name: "Polo", productCount: 3 },
    ];

    expect(getFirstPopulatedStorefrontCategoryId(categories)).toBe("hoodie");
  });

  it("keeps the earlier category when product counts tie", () => {
    const categories = [
      { id: "crewneck", name: "Crewneck", productCount: 3 },
      { id: "hoodie", name: "Hoodie", productCount: 3 },
    ];

    expect(getFirstPopulatedStorefrontCategoryId(categories)).toBe("crewneck");
  });

  it("does not hard-code a category and stays live as catalog counts change", () => {
    const firstCatalog = [
      { id: "polo", name: "Polo", productCount: 1 },
      { id: "crewneck", name: "Crewneck", productCount: 4 },
    ];
    const secondCatalog = [
      { id: "zip", name: "1/4 Zip", productCount: 0 },
      { id: "hoodie", name: "Hoodie", productCount: 2 },
      { id: "polo", name: "Polo", productCount: 6 },
    ];

    expect(getFirstPopulatedStorefrontCategoryId(firstCatalog)).toBe("crewneck");
    expect(getFirstPopulatedStorefrontCategoryId(secondCatalog)).toBe("polo");
  });

  it("returns null when no populated category exists", () => {
    expect(getFirstPopulatedStorefrontCategoryId([])).toBeNull();
    expect(
      getFirstPopulatedStorefrontCategoryId([{ id: "empty", name: "Empty", productCount: 0 }])
    ).toBeNull();
  });
});

describe("buildStorefrontCategories phone initial selection", () => {
  it("derives the initial phone category from the live catalog category with the most active products", () => {
    const products = [
      {
        id: "p-hoodie-1",
        name: "Club Hoodie",
        status: "Active",
        storefront_category: "Hoodie",
      },
      {
        id: "p-hoodie-2",
        name: "Zip Hoodie",
        status: "Active",
        storefront_category: "Hoodie",
      },
      {
        id: "p-hoodie-3",
        name: "Team Hoodie",
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
        id: "p-inactive",
        name: "Zip Hidden",
        status: "Inactive",
        storefront_category: "1/4 Zip",
      },
    ];

    const categories = buildStorefrontCategories(products, []);
    // Alphabetical storefront order: Crewneck before Hoodie; inactive zip excluded.
    expect(categories.map((category) => category.name)).toEqual(["Crewneck", "Hoodie"]);
    const hoodie = categories.find((category) => category.name === "Hoodie");
    const crewneck = categories.find((category) => category.name === "Crewneck");
    expect(hoodie?.productCount).toBe(3);
    expect(crewneck?.productCount).toBe(1);
    // Hoodie has more active products even though Crewneck is earlier in catalog order.
    expect(getFirstPopulatedStorefrontCategoryId(categories)).toBe(hoodie?.id);
  });
});
