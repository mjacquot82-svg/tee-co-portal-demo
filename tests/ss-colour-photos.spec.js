import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { mapSsProductRowsToColorImages } from "../src/lib/supplierColorPhotos.js";

// Fixture-only browser check: Supabase and the S&S CDN are intercepted, nothing real is called.
const FIXTURE_HOST = "https://ss-photo-tests.supabase.co";
test.skip(process.env.VITE_SUPABASE_URL !== FIXTURE_HOST, "Run with VITE_SUPABASE_URL=https://ss-photo-tests.supabase.co");

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const demoRows = JSON.parse(fs.readFileSync(new URL("../scripts/data/ss-demo-colours.json", import.meta.url), "utf8")).rows;
const colourRows = mapSsProductRowsToColorImages(demoRows, { source: "demo_seed" });
const product = {
  id: "22222222-2222-4222-8222-222222222222", name: "Gildan Heavy Cotton T-Shirt - 5000",
  category: "Tshirt", storefront_category: "Tshirt", status: "Active",
  image_storage_path: "products/test/original.png", image_thumb_storage_path: "products/test/original.png",
  image_content_type: "image/png", unit_price: 20, base_garment_price: 20,
  colors: ["White", "Black", "Red", "Hot Pink"], sizes: ["S", "M"],
  production_methods: ["DTF"], placements: ["Full Front"],
};

async function mockBackend(page, { tableMissing = false } = {}) {
  const cdnRequests = [];
  await page.route("https://cdn.ssactivewear.com/**", (route) => {
    cdnRequests.push(route.request().url());
    // SS_REAL_CDN=1 lets the real S&S photos load, for a visual screenshot only.
    if (process.env.SS_REAL_CDN === "1") return route.continue();
    return route.fulfill({ contentType: "image/png", body: png });
  });
  await page.route(`${FIXTURE_HOST}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("original.png")) return route.fulfill({ contentType: "image/png", body: png });
    if (url.pathname.endsWith("/products")) return route.fulfill({ json: [product] });
    if (url.pathname.endsWith("/supplier_color_images")) {
      if (tableMissing) return route.fulfill({ status: 404, json: { code: "42P01", message: "relation does not exist" } });
      const key = (url.searchParams.get("style_key") || "").replace(/^eq\./, "");
      return route.fulfill({ json: colourRows.filter((row) => row.style_key === key) });
    }
    return route.fulfill({ json: [] });
  });
  return cdnRequests;
}

async function openGarment(page) {
  await page.goto("/category/tshirt");
  await page.getByRole("link", { name: /Gildan Heavy Cotton T-Shirt - 5000/ }).first().click();
}

test("picking a colour shows the S&S front, back and side photos", async ({ page }) => {
  await mockBackend(page);
  await openGarment(page);
  const main = page.getByTestId("garment-color-photo");
  await expect(main).toHaveAttribute("src", "https://cdn.ssactivewear.com/Images/Color/16813_f_fl.jpg");
  const views = page.getByTestId("garment-color-photo-views");
  await expect(views.getByRole("button")).toHaveText(["Front", "Back", "Side"]);

  await page.getByRole("button", { name: "Black", exact: true }).click();
  await expect(main).toHaveAttribute("src", /16787_f_fl\.jpg$/);
  await views.getByRole("button", { name: "Show back view" }).click();
  await expect(main).toHaveAttribute("src", /16787_b_fl\.jpg$/);
  await views.getByRole("button", { name: "Show side view" }).click();
  await expect(main).toHaveAttribute("src", /16787_d_fl\.jpg$/);

  await page.getByRole("button", { name: "Red", exact: true }).click();
  await expect(views.getByRole("button")).toHaveText(["Front", "Back", "Side", "On model", "Model back", "Model side"]);
  if (process.env.SS_REAL_CDN === "1") {
    await expect.poll(() => main.evaluate((img) => img.complete && img.naturalWidth > 1)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath("ss-red.png") });
  }

  // A colour S&S does not have keeps the normal product image.
  await page.getByRole("button", { name: "Hot Pink", exact: true }).click();
  await expect(page.getByTestId("garment-color-photo")).toHaveCount(0);
  await expect(page.getByTestId("garment-main-image")).toHaveAttribute("src", /original\.png$/);
  await expect(views).toHaveCount(0);
});

test("without the S&S table the page keeps the normal garment image", async ({ page }) => {
  const cdnRequests = await mockBackend(page, { tableMissing: true });
  await openGarment(page);
  await expect(page.getByTestId("garment-main-image")).toHaveAttribute("src", /original\.png$/);
  await expect(page.getByTestId("garment-color-photo-views")).toHaveCount(0);
  await page.getByRole("button", { name: "Black", exact: true }).click();
  await expect(page.getByTestId("garment-main-image")).toHaveAttribute("src", /original\.png$/);
  expect(cdnRequests).toEqual([]);
});
