import { test, expect } from "@playwright/test";
test.skip(process.env.VITE_SUPABASE_URL !== "https://image-tests.supabase.co", "Run in the isolated Storage-image CI job");
const originalBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAIAAAABc2X6AAAAdklEQVR4nO3PAQ3AIADAMMC/DXSCi5PsrYJtnj1+Zb0O+JrhOsN1husM1xmuM1xnuM5wneE6w3WG6wzXGa4zXGe4znCd4TrDdYbrDNcZrjNcZ7jOcJ3hOsN1husM1xmuM1xnuM5wneE6w3WG6wzXGa4zXGe47gJp5AJEgYwrygAAAABJRU5ErkJggg==", "base64");
const thumbnailBytes = Buffer.from("UklGRk4AAABXRUJQVlA4IEIAAACwAwCdASooACgAPm02mEkkIyKhI4gAgA2JZwB2APwAADmo9UoIAAD+7xUH//3eb9vN+3m/4aP//npmvMH9NAAAAAA=", "base64");
const product = {
  id: "11111111-1111-4111-8111-111111111111", name: "Migration Test Tee",
  category: "Tshirt", storefront_category: "Tshirt", status: "Active",
  is_featured: true, is_hero_feature: true,
  image_storage_path: "products/test/original.png", image_thumb_storage_path: "products/test/thumb.webp",
  image_content_type: "image/png", image_file_size: originalBytes.length,
  unit_price: 25, base_garment_price: 25, colors: ["Black"], sizes: ["S", "M"],
  production_methods: ["DTF"], placements: ["Full Front"],
};
for (const width of [390, 1280]) {
  test(`Storage thumbnails and original ordering image at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const inlineReads = [];
    await page.route("https://image-tests.supabase.co/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("thumb.webp")) return route.fulfill({ contentType: "image/webp", body: thumbnailBytes, headers: {"cache-control":"public,max-age=31536000"} });
      if (url.pathname.endsWith("original.png")) return route.fulfill({ contentType: "image/png", body: originalBytes, headers: {"cache-control":"public,max-age=31536000"} });
      if (url.pathname.endsWith("/products")) {
        if ((url.searchParams.get("select") || "").split(/,\s*/).includes("image")) inlineReads.push(url.pathname);
        return route.fulfill({ json: [product] });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto("/");
    const homeImage = page.locator('img[alt="Migration Test Tee"]:visible').first();
    await expect(homeImage).toBeVisible();
    // Hero uses original, featured/catalogue cards use the WebP thumbnail.
    await expect.poll(() => page.locator('img[src$="thumb.webp"]').count()).toBeGreaterThan(0);
    await page.goto("/category/tshirt");
    const categoryImage = page.locator('img[alt="Migration Test Tee"]').first();
    await expect(categoryImage).toHaveAttribute("src", /thumb\.webp$/);
    await expect.poll(() => categoryImage.evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
    await page.getByRole("link", {name: /Migration Test Tee/}).first().click();
    const detailImage = page.locator('img[alt="Migration Test Tee"]').first();
    await expect(detailImage).toHaveAttribute("src", /original\.png$/);
    await expect.poll(() => detailImage.evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
    await page.getByRole("link", { name: "Continue to Configure Garment" }).click();
    await page.getByRole("spinbutton", { name: "S quantity" }).fill("2");
    await expect(page.getByText("$50.00", { exact: true }).first()).toBeVisible();
    expect(inlineReads).toEqual([]);
    // This is an intercepted fixture-only browser flow. Never submit an order/payment.
  });
}
