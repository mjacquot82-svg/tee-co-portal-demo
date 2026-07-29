// @ts-check
import { expect, test } from "@playwright/test";

const ownerUser = {
  id: "staff-owner-default",
  name: "Owner / Admin",
  role: "Owner",
  authMode: "temporary-owner",
  isTemporaryOwnerSession: true,
};

async function installFrontCounterSession(page, user = ownerUser) {
  await page.addInitScript(({ owner }) => {
    const products = [
      {
        id: "pos-classic-tee",
        name: "Classic Tee",
        category: "T-Shirts",
        brand_model: "Soft Cotton",
        status: "Active",
        colors: ["Black", "White", "Navy"],
        sizes: ["S", "M", "L", "XL"],
        retail_price: "24.99",
      },
      {
        id: "pos-pullover-hoodie",
        name: "Pullover Hoodie",
        category: "Hoodies",
        brand_model: "Fleece",
        status: "Active",
        colors: ["Black", "Grey"],
        sizes: ["M", "L", "XL"],
        retail_price: "54.99",
      },
    ];

    window.localStorage.setItem(
      "teeCoStaffUsers",
      JSON.stringify([
        {
          id: owner.id,
          name: owner.name,
          role: owner.role,
          pin: "1234",
          status: "Active",
          created_at: "2026-07-10T12:00:00.000Z",
          updated_at: "2026-07-10T12:00:00.000Z",
        },
      ])
    );
    window.sessionStorage.setItem("teeCoActiveStaffUser", JSON.stringify(owner));
    window.localStorage.setItem("teeCoCustomers", JSON.stringify([]));
    window.localStorage.setItem("teeCoOrders", JSON.stringify([]));
    window.localStorage.setItem("teeCoSales", JSON.stringify([]));
    window.localStorage.setItem("teeCoProducts", JSON.stringify(products));
  }, { owner: user });
}

test("front counter uses unified customer pickup and a separate stateful walk-in workspace", async ({ page }) => {
  await installFrontCounterSession(page);
  await page.goto("/admin/sales/new");

  await expect(page.getByRole("heading", { name: "Current transaction" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Customer Pickup/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Walk-In Sale/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Collect Payment/ })).toHaveCount(0);

  await expect(page.getByText("Search Customer", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Released Orders" })).toBeVisible();

  await page.getByRole("button", { name: /Walk-In Sale/ }).click();
  await expect(page.getByRole("heading", { name: "Search Product" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  await expect(page.getByLabel("Customer Name")).toBeVisible();
  await expect(page.getByText("Payment", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Complete Sale/ })).toBeVisible();

  await page.getByPlaceholder("Search product, SKU, brand, or category").fill("tee");
  await expect(page.getByTestId("pos-product-result").first()).toBeVisible();
  await expect(page.getByTestId("pos-product-results")).toHaveCSS("overflow-y", "visible");
  await page.getByTestId("pos-product-result").first().dispatchEvent("click");
  await expect(page.getByPlaceholder("Search product, SKU, brand, or category")).toHaveCount(0);
  await expect(page.getByTestId("pos-product-result")).toHaveCount(0);
  await expect(page.getByText("Selected Product")).toBeVisible();
  if (await page.getByTestId("pos-color-option").count()) {
    await page.getByTestId("pos-color-option").first().dispatchEvent("click");
  }
  if (await page.getByTestId("pos-size-option").count()) {
    await page.getByTestId("pos-size-option").first().dispatchEvent("click");
  }
  const quantityStepper = page.getByTestId("pos-line-quantity-stepper");
  const quantityInput = quantityStepper.getByRole("textbox", { name: "Quantity" });
  await expect(quantityInput).toBeVisible();
  await expect(quantityInput).toHaveValue("1");
  await quantityStepper.getByRole("button", { name: "Increase quantity" }).click();
  await expect(quantityInput).toHaveValue("2");
  await quantityStepper.getByRole("button", { name: "Decrease quantity" }).click();
  await quantityStepper.getByRole("button", { name: "Decrease quantity" }).click();
  await expect(quantityInput).toHaveValue("1");
  await quantityInput.fill("3");
  await page.getByRole("button", { name: "Add to Cart" }).click();

  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  await expect(page.getByTestId("pos-cart-quantity-stepper").getByRole("textbox", { name: "Qty" })).toHaveValue("3");
  await expect(page.getByRole("heading", { name: "Product Search" })).toBeVisible();
  await expect(page.getByPlaceholder("Search product, SKU, brand, or category")).toHaveValue("tee");
  await expect(page.getByTestId("pos-product-result").first()).toBeVisible();
  for (const method of ["Cash", "Debit", "Credit", "E-Transfer", "Cheque"]) {
    await expect(page.getByRole("button", { name: method, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Other", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pay Later", exact: true })).toHaveCount(0);
  const viewportFit = await page.evaluate(() => {
    const completeButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Complete Sale")
    );
    return {
      pageHasVerticalScroll: document.documentElement.scrollHeight > window.innerHeight + 1,
      completeActionInViewport: Boolean(
        completeButton && completeButton.getBoundingClientRect().bottom <= window.innerHeight
      ),
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      completeBottom: completeButton?.getBoundingClientRect().bottom || 0,
      workflowBottom: document.querySelector("#quick-sale-workflow")?.getBoundingClientRect().bottom || 0,
      transactionRailBottom: completeButton?.closest("aside")?.getBoundingClientRect().bottom || 0,
    };
  });
  expect(viewportFit.pageHasVerticalScroll, JSON.stringify(viewportFit)).toBe(false);
  expect(viewportFit.completeActionInViewport, JSON.stringify(viewportFit)).toBe(true);
});

test("Owner can complete a sale with an accepted payment method", async ({ page }) => {
    await installFrontCounterSession(page, ownerUser);
    await page.goto("/admin/sales/new");

    await page.getByRole("button", { name: /Walk-In Sale/ }).dispatchEvent("click");
    await page.getByPlaceholder("Search product, SKU, brand, or category").fill("classic");
    await page.getByTestId("pos-product-result").first().dispatchEvent("click");
    if (await page.getByTestId("pos-color-option").count()) {
      await page.getByTestId("pos-color-option").first().dispatchEvent("click");
    }
    if (await page.getByTestId("pos-size-option").count()) {
      await page.getByTestId("pos-size-option").first().dispatchEvent("click");
    }
    await page.getByRole("button", { name: "Add to Cart" }).click();

    await page.getByLabel("Customer Name").fill("Owner Customer");
    await page.getByLabel("Customer Phone").fill("555-0100");
    await page.getByRole("button", { name: "Cheque", exact: true }).click();
    await page.getByRole("button", { name: "Complete Sale" }).last().click();

    await expect(page.getByRole("heading", { name: "Quick Sale Completed" })).toBeVisible();
});
