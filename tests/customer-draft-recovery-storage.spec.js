import { expect, test } from "@playwright/test";

test("legacy draft migrates from session storage and is visible in a second tab", async ({ page, context }) => {
  await page.goto("/");

  await page.evaluate(() => {
    const key = "teeCoPendingCustomerRequest";
    window.localStorage.removeItem(key);
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        source: "public-garment-flow",
        created_at: "2026-10-06T17:45:00.000Z",
        productId: "draft-product",
        garmentName: "Draft Garment",
        quantity: 12,
      })
    );
  });

  const firstDraft = await page.evaluate(async () => {
    const { getPendingCustomerRequest } = await import(
      "/src/lib/pendingCustomerRequestStore.js"
    );
    return getPendingCustomerRequest();
  });
  expect(firstDraft?.productId).toBe("draft-product");

  const secondPage = await context.newPage();
  await secondPage.goto("/");
  const secondDraft = await secondPage.evaluate(async () => {
    const { getPendingCustomerRequest } = await import(
      "/src/lib/pendingCustomerRequestStore.js"
    );
    return getPendingCustomerRequest();
  });

  expect(secondDraft).toMatchObject({
    productId: "draft-product",
    garmentName: "Draft Garment",
    quantity: 12,
  });
});

test("final review values survive a reload", async ({ page }) => {
  await page.goto("/");

  await page.evaluate(async () => {
    const { savePendingCustomerRequest } = await import(
      "/src/lib/pendingCustomerRequestStore.js"
    );
    savePendingCustomerRequest({
      source: "public-garment-flow",
      created_at: "2026-10-06T18:00:00.000Z",
      productId: "review-product",
      garmentName: "Review Garment",
      quantity: 4,
      needByDate: "2026-10-31",
      additionalInstructions: "Use the saved draft note.",
    });
  });

  await page.reload();

  const recovered = await page.evaluate(async () => {
    const { getPendingCustomerRequest } = await import(
      "/src/lib/pendingCustomerRequestStore.js"
    );
    return getPendingCustomerRequest();
  });

  expect(recovered).toMatchObject({
    needByDate: "2026-10-31",
    additionalInstructions: "Use the saved draft note.",
  });
});
