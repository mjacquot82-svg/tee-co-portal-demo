import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  read: vi.fn(),
  rows: [{ id: "11111111-1111-4111-8111-111111111111", name: "Cached Storage Tee", status: "Active", category: "Tshirt", storefront_category: "Tshirt", unit_price: 25, colors: ["Black"], sizes: ["S"], image_storage_path: "original.png", image_thumb_storage_path: "thumb.webp" }],
}));
vi.mock("./supabaseClient", () => ({
  isSupabaseConfigured: true, supabaseConfig: {}, supabaseDiagnostics: {},
  supabase: {
    from: () => ({ select: fixture.read }),
    storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://images.test/${path}` } }) }) },
  },
}));
vi.mock("./garmentLibraryStore", () => ({ syncGarmentLibraryProductLinks: async () => {} }));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetModules(); });

it("publishes readiness when an unchanged Storage catalogue reloads from browser cache", async () => {
  localStorage.clear(); vi.resetModules();
  fixture.read.mockResolvedValue({ data: fixture.rows, error: null });
  const initial = await import("./productsStore");
  await initial.refreshStoredProducts();
  const cached = JSON.parse(localStorage.getItem("teeCoProducts")!);
  vi.resetModules();
  const reloaded = await import("./productsStore");
  reloaded.saveStoredProducts(cached);
  const before = reloaded.getStoredProducts();
  expect(reloaded.areStoredProductsReady()).toBe(false);
  let finishRead!: (result: unknown) => void;
  fixture.read.mockReturnValue(new Promise(resolve => { finishRead = resolve; }));
  function Probe() {
    const products = reloaded.useStoredProducts();
    return <p>{reloaded.areStoredProductsReady() ? products[0]?.name : "Loading product details..."}</p>;
  }
  render(<Probe />);
  expect(screen.getByText("Loading product details...")).toBeTruthy();
  await act(async () => { finishRead({ data: fixture.rows, error: null }); });
  expect(reloaded.areStoredProductsReady()).toBe(true);
  expect(reloaded.getStoredProducts()).toEqual(before);
  expect(reloaded.getStoredProducts()).not.toBe(before);
  expect(screen.getByText("Cached Storage Tee")).toBeTruthy();
});
